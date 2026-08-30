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
import type { User } from "@clerk/backend"
import { clerkClient } from "@clerk/nextjs/server"
import PostEventReminderEmail from "@/emails/post-event-reminder"
import { getUnresolvedEmailDecision } from "@/lib/services/delivery-lease"
import {
  consumeDeliverySlot,
  hasPendingDeliveryTasks,
  markDeliveryTaskComplete,
  runWithinDeliveryDeadline,
  selectPendingDeliveryTasks,
  type DeliveryBudget,
} from "@/lib/services/delivery-budget"

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
  deferred?: true
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

async function getReminderRecipientIds(
  client: SupabaseClient,
  hackathonId: string,
  recipientFilter: string,
): Promise<string[]> {
  const clerkUserIds: string[] = []

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
        for (const fulfillment of fulfillments) {
          const assignment = (fulfillment as Record<string, unknown>).prize_assignment as {
            submission: { team_id: string | null; participant_id: string | null }
          } | null
          if (assignment?.submission?.team_id) teamIds.push(assignment.submission.team_id)
          else if (assignment?.submission?.participant_id) {
            soloIds.push(assignment.submission.participant_id)
          }
        }
        if (teamIds.length > 0) {
          const { data: members, error: membersError } = await client
            .from("hackathon_participants")
            .select("clerk_user_id")
            .in("team_id", [...new Set(teamIds)])
          if (membersError) {
            throw new Error(`Failed to load prize-winning team members: ${membersError.message}`)
          }
          clerkUserIds.push(...(members?.map((member) => member.clerk_user_id) ?? []))
        }
        if (soloIds.length > 0) {
          const { data: solos, error: solosError } = await client
            .from("hackathon_participants")
            .select("clerk_user_id")
            .in("id", [...new Set(soloIds)])
          if (solosError) {
            throw new Error(`Failed to load prize-winning attendees: ${solosError.message}`)
          }
          clerkUserIds.push(...(solos?.map((solo) => solo.clerk_user_id) ?? []))
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
        for (const result of results) {
          const submission = (result as Record<string, unknown>).submission as {
            team_id: string | null
            participant_id: string | null
          } | null
          if (submission?.team_id) teamIds.push(submission.team_id)
          else if (submission?.participant_id) soloIds.push(submission.participant_id)
        }
        if (teamIds.length > 0) {
          const { data: members, error: membersError } = await client
            .from("hackathon_participants")
            .select("clerk_user_id")
            .in("team_id", [...new Set(teamIds)])
          if (membersError) {
            throw new Error(`Failed to load winning team members: ${membersError.message}`)
          }
          clerkUserIds.push(...(members?.map((member) => member.clerk_user_id) ?? []))
        }
        if (soloIds.length > 0) {
          const { data: solos, error: solosError } = await client
            .from("hackathon_participants")
            .select("clerk_user_id")
            .in("id", [...new Set(soloIds)])
          if (solosError) {
            throw new Error(`Failed to load winning attendees: ${solosError.message}`)
          }
          clerkUserIds.push(...(solos?.map((solo) => solo.clerk_user_id) ?? []))
        }
      }
    }
  } else {
    const role = recipientFilter === "organizers" ? "organizer" : "participant"
    const { data: participants, error: participantsError } = await client
      .from("hackathon_participants")
      .select("clerk_user_id")
      .eq("hackathon_id", hackathonId)
      .eq("role", role)
    if (participantsError) {
      throw new Error(
        role === "organizer"
          ? `Failed to load event organizers: ${participantsError.message}`
          : `Failed to load event attendees: ${participantsError.message}`,
      )
    }
    clerkUserIds.push(...(participants?.map((participant) => participant.clerk_user_id) ?? []))
  }

  return [...new Set(clerkUserIds)].sort()
}

export async function sendReminderEmailsWithResult(
  hackathonId: string,
  reminderType: string,
  recipientFilter: string,
  contentBuilder: (name: string, email: string) => ReminderEmailInfo,
  deliveryKey = `post-event/${hackathonId}/${reminderType}`,
  budget?: DeliveryBudget,
): Promise<ReminderDeliverySummary> {
  if (!["winners", "unclaimed_winners", "organizers", "all_participants"].includes(recipientFilter)) {
    throw new Error(`Unknown post-event recipient group: ${recipientFilter}`)
  }

  const client = getSupabase() as unknown as SupabaseClient

  const { data: hackathon, error: hackathonError } = await client
    .from("hackathons")
    .select("name, slug, is_test_event")
    .eq("id", hackathonId)
    .single()

  if (hackathonError) {
    throw new Error(`Failed to load the event for its reminder: ${hackathonError.message}`)
  }
  if (!hackathon || hackathon.is_test_event) {
    return { eligible: 0, sent: 0, failed: 0 }
  }

  const clerkUserIds = await getReminderRecipientIds(client, hackathonId, recipientFilter)
  if (clerkUserIds.length === 0) {
    const refreshedIds = await getReminderRecipientIds(client, hackathonId, recipientFilter)
    const deferred = await hasPendingDeliveryTasks(
      deliveryKey,
      refreshedIds,
      (clerkUserId) => clerkUserId,
      budget,
    )
    return deferred
      ? { eligible: 0, sent: 0, failed: 0, deferred: true }
      : { eligible: 0, sent: 0, failed: 0 }
  }

  const tag = sanitizeTag(hackathon.name)

  let eligible = 0
  let sent = 0
  let failed = 0
  let unresolvedDecision: "retry" | "exhausted" | null = null
  const usersById = new Map<string, User>()
  const selection = await selectPendingDeliveryTasks(
    deliveryKey,
    clerkUserIds,
    (clerkUserId) => clerkUserId,
    budget,
  )
  let deferred = selection.deferred
  const discoveredIds: string[] = []

  if (selection.tasks.length > 0) {
    const clerk = await clerkClient()
    for (let i = 0; i < selection.tasks.length; i += 100) {
      const batch = selection.tasks.slice(i, i + 100)
      const resolved = await runWithinDeliveryDeadline(
        budget,
        () => clerk.users.getUserList({ userId: batch, limit: 100 }),
      )
      if (!resolved.completed) {
        deferred = true
        break
      }
      discoveredIds.push(...batch)
      for (const user of resolved.value.data) usersById.set(user.id, user)
    }
  }

  for (let index = 0; index < discoveredIds.length; index++) {
    if (!consumeDeliverySlot(budget)) {
      deferred = true
      break
    }

    const clerkUserId = discoveredIds[index]
    const user = usersById.get(clerkUserId)
    const email = user?.primaryEmailAddress?.emailAddress
    if (!user || !email) {
      unresolvedDecision ??= await getUnresolvedEmailDecision(deliveryKey)
      if (unresolvedDecision === "retry") {
        eligible++
        failed++
        if (budget) break
        continue
      }
      await markDeliveryTaskComplete(deliveryKey, clerkUserId)
      continue
    }

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
      idempotencyKey: `${deliveryKey}/${recipientFingerprint(clerkUserId)}`,
    })

    if (result) {
      sent++
      await markDeliveryTaskComplete(deliveryKey, clerkUserId)
    } else {
      failed++
      if (budget) break
    }
  }

  if (unresolvedDecision === "exhausted") {
    console.warn(
      `Post-event reminder: recipient records remained unavailable after bounded retries for hackathon ${hackathonId}.`,
    )
  }

  if (failed === 0 && !deferred) {
    const refreshedIds = await getReminderRecipientIds(client, hackathonId, recipientFilter)
    deferred = await hasPendingDeliveryTasks(
      deliveryKey,
      refreshedIds,
      (clerkUserId) => clerkUserId,
      budget,
    )
  }

  return deferred ? { eligible, sent, failed, deferred: true } : { eligible, sent, failed }
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
