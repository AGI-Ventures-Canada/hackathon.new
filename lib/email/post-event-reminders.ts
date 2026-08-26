import { sendEmail } from "./resend"
import { createHash } from "node:crypto"
import {
  sanitizeTag,
  renderEmail,
  buildEventUrl,
  getReplyToAddress,
  buildMailtoUnsubscribeHeaders,
  paceBulkSend,
  shortHackathonName,
} from "./utils"
import { supabase as getSupabase } from "@/lib/db/client"
import type { SupabaseClient } from "@supabase/supabase-js"
import { clerkClient } from "@clerk/nextjs/server"
import PostEventReminderEmail from "@/emails/post-event-reminder"

type ReminderEmailInfo = {
  hackathonName: string
  participantName: string
  ctaUrl: string
  subject: string
  heading: string
  body: string
  ctaLabel: string
}

export type ReminderDeliverySummary = {
  eligible: number
  sent: number
  failed: number
}

function recipientFingerprint(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 24)
}

export function buildPrizeClaimReminderContent(hackathonName: string, hackathonSlug: string) {
  return {
    subject: `Claim Your Prize — ${shortHackathonName(hackathonName)}`,
    heading: "Your prize is waiting",
    body: `you won a prize in ${hackathonName} but haven't claimed it yet. Check your winner email for the claim link, or contact the organizers.`,
    ctaLabel: "View Results",
    ctaUrl: buildEventUrl(hackathonSlug),
  }
}

export function buildOrganizerFulfillmentReminderContent(
  hackathonName: string,
  hackathonSlug: string,
  unfulfilledCount: number
) {
  return {
    subject: `${unfulfilledCount} prizes awaiting fulfillment — ${shortHackathonName(hackathonName)}`,
    heading: "Prizes need delivery",
    body: `you have ${unfulfilledCount} prize${unfulfilledCount === 1 ? "" : "s"} to deliver for ${hackathonName}.`,
    ctaLabel: "Manage Fulfillment",
    ctaUrl: buildEventUrl(hackathonSlug, "/manage?tab=post-event"),
  }
}

export function buildPrizeClaimFollowupContent(hackathonName: string, hackathonSlug: string) {
  return {
    subject: `Your prize is still waiting — ${shortHackathonName(hackathonName)}`,
    heading: "Your prize is still waiting",
    body: `you won a prize in ${hackathonName} and it is still unclaimed. Check your winner email for the claim link, or ask the organizers for help.`,
    ctaLabel: "View Results",
    ctaUrl: buildEventUrl(hackathonSlug),
  }
}

export function buildWinnerUnresponsiveContent(
  hackathonName: string,
  hackathonSlug: string,
  unclaimedCount: number,
  unclaimedDetails: string
) {
  return {
    subject: `${unclaimedCount} winner${unclaimedCount === 1 ? "" : "s"} unresponsive — ${shortHackathonName(hackathonName)}`,
    heading: "Winners need a follow-up",
    body: `${unclaimedCount} prize winner${unclaimedCount === 1 ? " has" : "s have"} not claimed ${unclaimedCount === 1 ? "a" : "their"} prize${unclaimedCount === 1 ? "" : "s"} after 10 days: ${unclaimedDetails}. You may want to contact them directly.`,
    ctaLabel: "Review Fulfillment",
    ctaUrl: buildEventUrl(hackathonSlug, "/manage?tab=post-event"),
  }
}

export function buildFeedbackFollowupContent(hackathonName: string, surveyUrl: string) {
  return {
    subject: `We still want to hear from you — ${shortHackathonName(hackathonName)}`,
    heading: "Tell us what you think",
    body: `we'd still love to hear your thoughts on ${hackathonName}. Your feedback helps make future events even better.`,
    ctaLabel: "Share Feedback",
    ctaUrl: surveyUrl,
  }
}

export async function sendReminderEmailsWithResult(
  hackathonId: string,
  reminderType: string,
  recipientFilter: string,
  contentBuilder: (name: string, email: string) => ReminderEmailInfo,
  deliveryKey = `post-event/${hackathonId}/${reminderType}`,
): Promise<ReminderDeliverySummary> {
  if (!["winners", "unclaimed_winners", "organizers", "all_participants"].includes(recipientFilter)) {
    throw new Error(`Unknown post-event recipient group: ${recipientFilter}`)
  }

  const client = getSupabase() as unknown as SupabaseClient

  const { data: hackathon, error: hackathonError } = await client
    .from("hackathons")
    .select("name, slug")
    .eq("id", hackathonId)
    .single()

  if (hackathonError) {
    throw new Error(`Failed to load the event for its reminder: ${hackathonError.message}`)
  }
  if (!hackathon) return { eligible: 0, sent: 0, failed: 0 }

  let clerkUserIds: string[] = []

  if (recipientFilter === "winners" || recipientFilter === "unclaimed_winners") {
    if (recipientFilter === "unclaimed_winners") {
      const { data: fulfillments, error: fulfillmentsError } = await client
        .from("prize_fulfillments")
        .select(`
          prize_assignment:prize_assignments!prize_assignment_id(
            submission:submissions!submission_id(team_id, participant_id)
          )
        `)
        .eq("hackathon_id", hackathonId)
        .is("claimed_at", null)

      if (fulfillmentsError) {
        throw new Error(`Failed to load unclaimed prizes: ${fulfillmentsError.message}`)
      }
      if (fulfillments) {
        const teamIds: string[] = []
        const soloIds: string[] = []
        for (const f of fulfillments) {
          const pa = (f as Record<string, unknown>).prize_assignment as { submission: { team_id: string | null; participant_id: string | null } } | null
          if (pa?.submission?.team_id) teamIds.push(pa.submission.team_id)
          else if (pa?.submission?.participant_id) soloIds.push(pa.submission.participant_id)
        }
        if (teamIds.length > 0) {
          const { data: members, error: membersError } = await client
            .from("hackathon_participants")
            .select("clerk_user_id")
            .in("team_id", [...new Set(teamIds)])
          if (membersError) {
            throw new Error(`Failed to load prize-winning team members: ${membersError.message}`)
          }
          clerkUserIds.push(...(members?.map((m) => m.clerk_user_id) ?? []))
        }
        if (soloIds.length > 0) {
          const { data: solos, error: solosError } = await client
            .from("hackathon_participants")
            .select("clerk_user_id")
            .in("id", [...new Set(soloIds)])
          if (solosError) {
            throw new Error(`Failed to load prize-winning attendees: ${solosError.message}`)
          }
          clerkUserIds.push(...(solos?.map((s) => s.clerk_user_id) ?? []))
        }
      }
    } else {
      const { data: results, error: resultsError } = await client
        .from("hackathon_results")
        .select("submission:submissions!submission_id(team_id, participant_id)")
        .eq("hackathon_id", hackathonId)
        .lte("rank", 3)

      if (resultsError) {
        throw new Error(`Failed to load event winners: ${resultsError.message}`)
      }
      if (results) {
        const teamIds: string[] = []
        const soloIds: string[] = []
        for (const r of results) {
          const sub = (r as Record<string, unknown>).submission as { team_id: string | null; participant_id: string | null } | null
          if (sub?.team_id) teamIds.push(sub.team_id)
          else if (sub?.participant_id) soloIds.push(sub.participant_id)
        }
        if (teamIds.length > 0) {
          const { data: members, error: membersError } = await client
            .from("hackathon_participants")
            .select("clerk_user_id")
            .in("team_id", teamIds)
          if (membersError) {
            throw new Error(`Failed to load winning team members: ${membersError.message}`)
          }
          clerkUserIds.push(...(members?.map((m) => m.clerk_user_id) ?? []))
        }
        if (soloIds.length > 0) {
          const { data: solos, error: solosError } = await client
            .from("hackathon_participants")
            .select("clerk_user_id")
            .in("id", soloIds)
          if (solosError) {
            throw new Error(`Failed to load winning attendees: ${solosError.message}`)
          }
          clerkUserIds.push(...(solos?.map((s) => s.clerk_user_id) ?? []))
        }
      }
    }
  } else if (recipientFilter === "organizers") {
    const { data: organizers, error: organizersError } = await client
      .from("hackathon_participants")
      .select("clerk_user_id")
      .eq("hackathon_id", hackathonId)
      .eq("role", "organizer")
    if (organizersError) {
      throw new Error(`Failed to load event organizers: ${organizersError.message}`)
    }
    clerkUserIds = organizers?.map((o) => o.clerk_user_id) ?? []
  } else {
    const { data: participants, error: participantsError } = await client
      .from("hackathon_participants")
      .select("clerk_user_id")
      .eq("hackathon_id", hackathonId)
      .eq("role", "participant")
    if (participantsError) {
      throw new Error(`Failed to load event attendees: ${participantsError.message}`)
    }
    clerkUserIds = participants?.map((p) => p.clerk_user_id) ?? []
  }

  clerkUserIds = [...new Set(clerkUserIds)]
  if (clerkUserIds.length === 0) return { eligible: 0, sent: 0, failed: 0 }

  const clerk = await clerkClient()
  const tag = sanitizeTag(hackathon.name)

  let eligible = 0
  let sent = 0
  let failed = 0

  for (let i = 0; i < clerkUserIds.length; i += 100) {
    const batch = clerkUserIds.slice(i, i + 100)
    const users = await clerk.users.getUserList({ userId: batch, limit: 100 })

    for (const user of users.data) {
      const email = user.primaryEmailAddress?.emailAddress
      if (!email) continue

      await paceBulkSend(eligible)
      eligible++

      const displayName = user.firstName
        ? `${user.firstName}${user.lastName ? ` ${user.lastName}` : ""}`
        : user.username || email.split("@")[0]

      const content = contentBuilder(displayName, email)

      const eventUrl = buildEventUrl(hackathon.slug)

      const { html, text } = await renderEmail(
        PostEventReminderEmail({
          heading: content.heading,
          participantName: displayName,
          body: content.body,
          ctaLabel: content.ctaLabel,
          ctaUrl: content.ctaUrl,
          hackathonName: hackathon.name,
          eventUrl,
        })
      )

      const result = await sendEmail({
        to: email,
        subject: content.subject,
        html,
        text,
        replyTo: getReplyToAddress(),
        headers: buildMailtoUnsubscribeHeaders(),
        tags: [
          { name: "type", value: `reminder_${reminderType}` },
          { name: "hackathon", value: tag },
        ],
        idempotencyKey: `${deliveryKey}/${recipientFingerprint(email)}`,
      })

      if (result) sent++
      else failed++
    }
  }

  return { eligible, sent, failed }
}

export async function sendReminderEmails(
  hackathonId: string,
  reminderType: string,
  recipientFilter: string,
  contentBuilder: (name: string, email: string) => ReminderEmailInfo,
): Promise<number> {
  const result = await sendReminderEmailsWithResult(
    hackathonId,
    reminderType,
    recipientFilter,
    contentBuilder,
  )
  return result.sent
}
