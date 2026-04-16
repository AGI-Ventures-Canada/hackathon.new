import { sendEmail } from "./resend"
import { sanitizeTag, renderEmail } from "./utils"
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

export function buildPrizeClaimReminderContent(hackathonName: string, hackathonSlug: string) {
  return {
    subject: `Claim Your Prize — ${hackathonName}`,
    heading: "Don't Forget Your Prize!",
    body: `you won a prize in ${hackathonName} but haven't claimed it yet. Check your winner notification email for a direct claim link, or contact the organizers.`,
    ctaLabel: "View Results",
    ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL}/e/${hackathonSlug}`,
  }
}

export function buildOrganizerFulfillmentReminderContent(
  hackathonName: string,
  hackathonSlug: string,
  unfulfilledCount: number
) {
  return {
    subject: `${unfulfilledCount} prizes awaiting fulfillment — ${hackathonName}`,
    heading: "Prizes Awaiting Fulfillment",
    body: `you have ${unfulfilledCount} prize${unfulfilledCount === 1 ? "" : "s"} still awaiting fulfillment for ${hackathonName}. Keep your winners happy by completing prize delivery.`,
    ctaLabel: "Manage Fulfillment",
    ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL}/e/${hackathonSlug}/manage?tab=post-event`,
  }
}

export function buildPrizeClaimFollowupContent(hackathonName: string, hackathonSlug: string) {
  return {
    subject: `Your prize is still waiting — ${hackathonName}`,
    heading: "Last Call for Your Prize!",
    body: `you won a prize in ${hackathonName} and it's still unclaimed. Don't miss out — check your winner notification email for a direct claim link, or reach out to the organizers before it expires.`,
    ctaLabel: "View Results",
    ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL}/e/${hackathonSlug}`,
  }
}

export function buildWinnerUnresponsiveContent(
  hackathonName: string,
  hackathonSlug: string,
  unclaimedCount: number,
  unclaimedDetails: string
) {
  return {
    subject: `${unclaimedCount} winner${unclaimedCount === 1 ? "" : "s"} unresponsive — ${hackathonName}`,
    heading: "Winners Need Follow-Up",
    body: `${unclaimedCount} prize winner${unclaimedCount === 1 ? " has" : "s have"} not claimed ${unclaimedCount === 1 ? "a" : "their"} prize${unclaimedCount === 1 ? "" : "s"} after 10 days: ${unclaimedDetails}. Consider reaching out directly or reassigning.`,
    ctaLabel: "Review Fulfillment",
    ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL}/e/${hackathonSlug}/manage?tab=post-event`,
  }
}

export function buildFeedbackFollowupContent(hackathonName: string, surveyUrl: string) {
  return {
    subject: `We still want to hear from you — ${hackathonName}`,
    heading: "Your Feedback Matters",
    body: `we'd still love to hear your thoughts on ${hackathonName}. Your feedback helps make future events even better.`,
    ctaLabel: "Share Feedback",
    ctaUrl: surveyUrl,
  }
}

export async function sendReminderEmails(
  hackathonId: string,
  reminderType: string,
  recipientFilter: string,
  contentBuilder: (name: string, email: string) => ReminderEmailInfo
): Promise<number> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: hackathon } = await client
    .from("hackathons")
    .select("name, slug")
    .eq("id", hackathonId)
    .single()

  if (!hackathon) return 0

  let clerkUserIds: string[] = []

  if (recipientFilter === "winners" || recipientFilter === "unclaimed_winners") {
    if (recipientFilter === "unclaimed_winners") {
      const { data: fulfillments } = await client
        .from("prize_fulfillments")
        .select(`
          prize_assignment:prize_assignments!prize_assignment_id(
            submission:submissions!submission_id(team_id, participant_id)
          )
        `)
        .eq("hackathon_id", hackathonId)
        .is("claimed_at", null)

      if (fulfillments) {
        const teamIds: string[] = []
        const soloIds: string[] = []
        for (const f of fulfillments) {
          const pa = (f as Record<string, unknown>).prize_assignment as { submission: { team_id: string | null; participant_id: string | null } } | null
          if (pa?.submission?.team_id) teamIds.push(pa.submission.team_id)
          else if (pa?.submission?.participant_id) soloIds.push(pa.submission.participant_id)
        }
        if (teamIds.length > 0) {
          const { data: members } = await client
            .from("hackathon_participants")
            .select("clerk_user_id")
            .in("team_id", [...new Set(teamIds)])
          clerkUserIds.push(...(members?.map((m) => m.clerk_user_id) ?? []))
        }
        if (soloIds.length > 0) {
          const { data: solos } = await client
            .from("hackathon_participants")
            .select("clerk_user_id")
            .in("id", [...new Set(soloIds)])
          clerkUserIds.push(...(solos?.map((s) => s.clerk_user_id) ?? []))
        }
      }
    } else {
      const { data: results } = await client
        .from("hackathon_results")
        .select("submission:submissions!submission_id(team_id, participant_id)")
        .eq("hackathon_id", hackathonId)
        .lte("rank", 3)

      if (results) {
        const teamIds: string[] = []
        const soloIds: string[] = []
        for (const r of results) {
          const sub = (r as Record<string, unknown>).submission as { team_id: string | null; participant_id: string | null } | null
          if (sub?.team_id) teamIds.push(sub.team_id)
          else if (sub?.participant_id) soloIds.push(sub.participant_id)
        }
        if (teamIds.length > 0) {
          const { data: members } = await client
            .from("hackathon_participants")
            .select("clerk_user_id")
            .in("team_id", teamIds)
          clerkUserIds.push(...(members?.map((m) => m.clerk_user_id) ?? []))
        }
        if (soloIds.length > 0) {
          const { data: solos } = await client
            .from("hackathon_participants")
            .select("clerk_user_id")
            .in("id", soloIds)
          clerkUserIds.push(...(solos?.map((s) => s.clerk_user_id) ?? []))
        }
      }
    }
  } else if (recipientFilter === "organizers") {
    const { data: organizers } = await client
      .from("hackathon_participants")
      .select("clerk_user_id")
      .eq("hackathon_id", hackathonId)
      .eq("role", "organizer")
    clerkUserIds = organizers?.map((o) => o.clerk_user_id) ?? []
  } else {
    const { data: participants } = await client
      .from("hackathon_participants")
      .select("clerk_user_id")
      .eq("hackathon_id", hackathonId)
      .eq("role", "participant")
    clerkUserIds = participants?.map((p) => p.clerk_user_id) ?? []
  }

  clerkUserIds = [...new Set(clerkUserIds)]
  if (clerkUserIds.length === 0) return 0

  const clerk = await clerkClient()
  const tag = sanitizeTag(hackathon.name)

  let sent = 0

  for (let i = 0; i < clerkUserIds.length; i += 100) {
    const batch = clerkUserIds.slice(i, i + 100)
    const users = await clerk.users.getUserList({ userId: batch })

    for (const user of users.data) {
      const email = user.primaryEmailAddress?.emailAddress
      if (!email) continue

      const displayName = user.firstName
        ? `${user.firstName}${user.lastName ? ` ${user.lastName}` : ""}`
        : user.username || email.split("@")[0]

      const content = contentBuilder(displayName, email)

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://getoatmeal.com"
      const eventUrl = `${baseUrl}/e/${hackathon.slug}`

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
        tags: [
          { name: "type", value: `reminder_${reminderType}` },
          { name: "hackathon", value: tag },
        ],
      })

      if (result) sent++
    }
  }

  return sent
}
