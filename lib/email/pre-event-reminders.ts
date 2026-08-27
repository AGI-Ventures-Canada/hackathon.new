import { sendEmail } from "./resend"
import {
  sanitizeTag,
  renderEmail,
  formatTimeLeft,
  getReplyToAddress,
  buildMailtoUnsubscribeHeaders,
  paceBulkSend,
  shortHackathonName,
} from "./utils"
import { supabase as getSupabase } from "@/lib/db/client"
import type { SupabaseClient } from "@supabase/supabase-js"
import { clerkClient } from "@clerk/nextjs/server"
import PreEventReminderEmail from "@/emails/pre-event-reminder"
import { getUnresolvedEmailDecision } from "@/lib/services/delivery-lease"
import {
  consumeDeliverySlot,
  hasPendingDeliveryTasks,
  markDeliveryTaskComplete,
  runWithinDeliveryDeadline,
  selectPendingDeliveryTasks,
  type DeliveryBudget,
} from "@/lib/services/delivery-budget"

type PreEventContent = {
  heading: string
  body: string
  deadlineLabel: string
  ctaLabel: string
  ctaUrl: string
  subject: string
}

export function buildRegistrationClosingContent(
  hackathonName: string,
  hackathonSlug: string
): PreEventContent {
  return {
    heading: "Registration Is Closing Soon!",
    body: `signups for ${hackathonName} close soon. Check your team and event details.`,
    deadlineLabel: "Registration closes",
    ctaLabel: "View Event",
    ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL}/e/${hackathonSlug}`,
    subject: `Registration closing soon \u2014 ${shortHackathonName(hackathonName)}`,
  }
}

export function buildEventStartingContent(
  hackathonName: string,
  hackathonSlug: string
): PreEventContent {
  return {
    heading: "The Hackathon Is Almost Here!",
    body: `${hackathonName} is starting soon. Get ready to build something great!`,
    deadlineLabel: "Event starts",
    ctaLabel: "View Event",
    ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL}/e/${hackathonSlug}`,
    subject: `Starting soon \u2014 ${shortHackathonName(hackathonName)}`,
  }
}

export function buildSubmissionDueContent(
  hackathonName: string,
  hackathonSlug: string
): PreEventContent {
  return {
    heading: "Submissions Due Soon!",
    body: `the deadline to submit your project for ${hackathonName} is coming up fast. Make sure your team has everything ready.`,
    deadlineLabel: "Projects due",
    ctaLabel: "Submit Project",
    ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL}/e/${hackathonSlug}`,
    subject: `Submissions closing soon \u2014 ${shortHackathonName(hackathonName)}`,
  }
}

const CONTENT_BUILDERS: Record<string, (name: string, slug: string) => PreEventContent> = {
  registration_closing: buildRegistrationClosingContent,
  event_starting: buildEventStartingContent,
  submission_due: buildSubmissionDueContent,
}

export type SendPreEventReminderInput = {
  hackathonId: string
  reminderType: "registration_closing" | "event_starting" | "submission_due"
  hackathonName: string
  hackathonSlug: string
  deadlineDate: string
  urgency: "low" | "medium" | "high"
  deliveryId?: string
  budget?: DeliveryBudget
}

const HIGH_URGENCY_SUBJECTS: Record<
  SendPreEventReminderInput["reminderType"],
  (name: string) => string
> = {
  registration_closing: (name) => `Registration closes today — ${name}`,
  event_starting: (name) => `Starting today — ${name}`,
  submission_due: (name) => `Submissions due today — ${name}`,
}

export async function sendPreEventReminderEmail(
  input: SendPreEventReminderInput
): Promise<{ sent: number; failed: number; deferred?: true }> {
  const builder = CONTENT_BUILDERS[input.reminderType]
  if (!builder) return { sent: 0, failed: 0 }

  const content = builder(input.hackathonName, input.hackathonSlug)
  const timeLeft = formatTimeLeft(input.deadlineDate)
  const deadlineDateFormatted = new Date(input.deadlineDate).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  const subject =
    input.urgency === "high"
      ? HIGH_URGENCY_SUBJECTS[input.reminderType](shortHackathonName(input.hackathonName))
      : content.subject

  const candidateIds = await getRecipientIds(input.hackathonId, input.reminderType)
  let sent = 0
  let failed = 0
  const deliveryId = input.deliveryId ?? `${input.hackathonId}/${input.reminderType}/${input.deadlineDate}`
  const workKey = `pre-event:${deliveryId}`
  const selection = await selectPendingDeliveryTasks(
    workKey,
    candidateIds,
    (candidateId) => candidateId,
    input.budget,
  )
  let deferred = selection.deferred
  let unresolvedDecision: "retry" | "exhausted" | null = null
  const candidates: RecipientCandidate[] = []

  if (selection.tasks.length > 0) {
    const clerk = await clerkClient()
    for (let offset = 0; offset < selection.tasks.length; offset += 100) {
      const batch = selection.tasks.slice(offset, offset + 100)
      const resolved = await runWithinDeliveryDeadline(
        input.budget,
        () => clerk.users.getUserList({ userId: batch, limit: 100 }),
      )
      if (!resolved.completed) {
        deferred = true
        break
      }
      const recipients = new Map<string, Recipient>()
      for (const user of resolved.value.data) {
        const email = user.primaryEmailAddress?.emailAddress
        if (!email) continue
        recipients.set(user.id, {
          id: user.id,
          email,
          name: user.firstName || email.split("@")[0],
        })
      }
      candidates.push(...batch.map((id) => ({
        id,
        recipient: recipients.get(id) ?? null,
      })))
    }
  }

  for (let index = 0; index < candidates.length; index += 1) {
    if (!consumeDeliverySlot(input.budget)) {
      deferred = true
      break
    }

    const recipient = candidates[index].recipient
    if (!recipient) {
      unresolvedDecision ??= await getUnresolvedEmailDecision(workKey)
      if (unresolvedDecision === "retry") {
        failed++
        if (input.budget) break
        continue
      }
      await markDeliveryTaskComplete(workKey, candidates[index].id)
      continue
    }

    await paceBulkSend(index)
    const { html, text } = await renderEmail(
      PreEventReminderEmail({
        hackathonName: input.hackathonName,
        participantName: recipient.name,
        deadlineLabel: content.deadlineLabel,
        timeLeft,
        deadlineDate: deadlineDateFormatted,
        ctaUrl: content.ctaUrl,
        ctaLabel: content.ctaLabel,
        heading: content.heading,
        body: content.body,
      })
    )

    const result = await sendEmail({
      to: recipient.email,
      subject,
      html,
      text,
      replyTo: getReplyToAddress(),
      headers: buildMailtoUnsubscribeHeaders(),
      tags: [
        { name: "type", value: `pre_event_${input.reminderType}` },
        { name: "hackathon", value: sanitizeTag(input.hackathonName) },
      ],
      idempotencyKey: `pre-event-reminder/${deliveryId}/${recipient.id}`,
    })

    if (result !== null) {
      sent++
      await markDeliveryTaskComplete(workKey, candidates[index].id)
    } else {
      failed++
      if (input.budget) break
    }
  }

  if (unresolvedDecision === "exhausted") {
    console.warn(
      `Pre-event reminder: recipient records remained unavailable after bounded retries for hackathon ${input.hackathonId}.`,
    )
  }

  if (failed === 0 && !deferred) {
    const refreshedCandidateIds = await getRecipientIds(input.hackathonId, input.reminderType)
    deferred = await hasPendingDeliveryTasks(
      workKey,
      refreshedCandidateIds,
      (candidateId) => candidateId,
      input.budget,
    )
  }

  return deferred ? { sent, failed, deferred: true } : { sent, failed }
}

type Recipient = { id: string; email: string; name: string }
type RecipientCandidate = { id: string; recipient: Recipient | null }

async function getRecipientIds(
  hackathonId: string,
  reminderType: SendPreEventReminderInput["reminderType"],
): Promise<string[]> {
  const client = getSupabase() as unknown as SupabaseClient

  const role = "participant"

  const { data: participants, error: participantsError } = await client
    .from("hackathon_participants")
    .select("id, clerk_user_id, team_id")
    .eq("hackathon_id", hackathonId)
    .eq("role", role)

  if (participantsError) {
    throw new Error(`Failed to load event attendees: ${participantsError.message}`)
  }

  let eligibleParticipants = participants ?? []
  if (reminderType === "submission_due" && eligibleParticipants.length > 0) {
    const { data: submissions, error: submissionsError } = await client
      .from("submissions")
      .select("participant_id, team_id")
      .eq("hackathon_id", hackathonId)
      .eq("status", "submitted")

    if (submissionsError) {
      throw new Error(`Failed to load submitted projects: ${submissionsError.message}`)
    }

    const submittedParticipantIds = new Set(
      (submissions ?? []).flatMap((submission) =>
        submission.participant_id ? [submission.participant_id as string] : [],
      ),
    )
    const submittedTeamIds = new Set(
      (submissions ?? []).flatMap((submission) =>
        submission.team_id ? [submission.team_id as string] : [],
      ),
    )
    eligibleParticipants = eligibleParticipants.filter((participant) =>
      participant.team_id
        ? !submittedTeamIds.has(participant.team_id as string)
        : !submittedParticipantIds.has(participant.id as string),
    )
  }

  return [...new Set(eligibleParticipants.map(
    (participant) => participant.clerk_user_id as string,
  ))].sort()
}
