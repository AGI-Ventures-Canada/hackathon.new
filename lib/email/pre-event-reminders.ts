import { sendEmail } from "./resend"
import { sanitizeTag, renderEmail, formatTimeLeft } from "./utils"
import { supabase as getSupabase } from "@/lib/db/client"
import type { SupabaseClient } from "@supabase/supabase-js"
import { clerkClient } from "@clerk/nextjs/server"
import PreEventReminderEmail from "@/emails/pre-event-reminder"

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
    body: `registration for ${hackathonName} is closing soon. Don\u2019t miss your chance to join.`,
    deadlineLabel: "Registration closes",
    ctaLabel: "Register Now",
    ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL}/e/${hackathonSlug}`,
    subject: `Registration closing soon \u2014 ${hackathonName}`,
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
    subject: `Starting soon \u2014 ${hackathonName}`,
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
    subject: `Submissions closing soon \u2014 ${hackathonName}`,
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
}

export async function sendPreEventReminderEmail(
  input: SendPreEventReminderInput
): Promise<{ sent: number }> {
  const builder = CONTENT_BUILDERS[input.reminderType]
  if (!builder) return { sent: 0 }

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
      ? `Last chance \u2014 ${content.subject}`
      : content.subject

  const recipients = await getRecipients(input.hackathonId, input.reminderType)
  let sent = 0

  for (const recipient of recipients) {
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
      tags: [
        { name: "type", value: `pre_event_${input.reminderType}` },
        { name: "hackathon", value: sanitizeTag(input.hackathonName) },
      ],
    })

    if (result !== null) sent++
  }

  return { sent }
}

type Recipient = { email: string; name: string }

async function getRecipients(
  hackathonId: string,
  _reminderType: string
): Promise<Recipient[]> {
  const client = getSupabase() as unknown as SupabaseClient

  const role = "participant"

  const { data: participants } = await client
    .from("hackathon_participants")
    .select("clerk_user_id")
    .eq("hackathon_id", hackathonId)
    .eq("role", role)

  if (!participants || participants.length === 0) return []

  const clerk = await clerkClient()
  const recipients: Recipient[] = []
  const PAGE_SIZE = 100

  const userIds = participants.map((p) => p.clerk_user_id as string)

  for (let i = 0; i < userIds.length; i += PAGE_SIZE) {
    const batch = userIds.slice(i, i + PAGE_SIZE)
    const users = await clerk.users.getUserList({ userId: batch, limit: PAGE_SIZE })
    for (const user of users.data) {
      const email = user.primaryEmailAddress?.emailAddress
      if (email) {
        recipients.push({
          email,
          name: user.firstName || email.split("@")[0],
        })
      }
    }
  }

  return recipients
}
