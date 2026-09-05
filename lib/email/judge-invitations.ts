import { sendEmail } from "./resend"
import {
  sanitizeTag,
  renderEmail,
  buildEventUrl,
  formatTimeLeft,
  getReplyToAddress,
  buildMailtoUnsubscribeHeaders,
  buildUnsubscribeHeaders,
  shortHackathonName,
} from "./utils"
import JudgeAddedEmail from "@/emails/judge-added"
import JudgeInvitationEmail from "@/emails/judge-invitation"
import JudgeInvitationReminderEmail from "@/emails/judge-invitation-reminder"
import { sha256Fingerprint } from "@/lib/utils/hash"

export type SendJudgeInvitationInput = {
  personalMessage?: string
  to: string
  hackathonName: string
  inviterName: string
  inviteToken: string
  expiresAt: string
  hackathonSlug?: string
  hackathonStartsAt?: string | null
  hackathonEndsAt?: string | null
  hackathonTimezone?: string | null
  deliveryId?: string
}

export type SendJudgeAddedNotificationInput = {
  to: string
  deliveryId: string
  hackathonName: string
  hackathonSlug: string
  addedByName: string
  hackathonStartsAt?: string | null
  hackathonEndsAt?: string | null
  hackathonTimezone?: string | null
}

function safeTimeZone(timeZone?: string | null): string {
  if (!timeZone) return "UTC"
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format()
    return timeZone
  } catch {
    return "UTC"
  }
}

function formatExactDateTime(value: string, timeZone?: string | null): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: safeTimeZone(timeZone),
    timeZoneName: "short",
  })
}

export function formatJudgeEventSchedule(
  startsAt?: string | null,
  endsAt?: string | null,
  timeZone?: string | null,
): string | null {
  if (!startsAt) return null
  const start = formatExactDateTime(startsAt, timeZone)
  if (!endsAt) return start
  return `${start} to ${formatExactDateTime(endsAt, timeZone)}`
}

export async function sendJudgeAddedNotification(
  input: SendJudgeAddedNotificationInput
): Promise<{ success: boolean }> {
  if (!process.env.NEXT_PUBLIC_APP_URL) {
    console.error("NEXT_PUBLIC_APP_URL not set, cannot send judge added notification")
    return { success: false }
  }

  const eventUrl = buildEventUrl(input.hackathonSlug, "/judge")

  const { html, text } = await renderEmail(
    JudgeAddedEmail({
      addedByName: input.addedByName,
      hackathonName: input.hackathonName,
      eventUrl,
      hackathonStartsAt: input.hackathonStartsAt,
      hackathonEndsAt: input.hackathonEndsAt,
      eventSchedule: formatJudgeEventSchedule(
        input.hackathonStartsAt,
        input.hackathonEndsAt,
        input.hackathonTimezone,
      ),
    })
  )

  const result = await sendEmail({
    to: input.to,
    subject: `You're a judge for ${shortHackathonName(input.hackathonName, 40)}`,
    html,
    text,
    replyTo: getReplyToAddress(),
    headers: buildMailtoUnsubscribeHeaders(),
    tags: [
      { name: "type", value: "judge_added" },
      { name: "hackathon", value: sanitizeTag(input.hackathonName) },
    ],
    idempotencyKey: `judge-added/${input.deliveryId}/${await sha256Fingerprint(input.to.trim().toLowerCase())}`,
  })

  return { success: result !== null }
}

export async function sendJudgeInvitationEmail(
  input: SendJudgeInvitationInput
): Promise<{ success: boolean }> {
  // Guard required: acceptUrl is a functional token link that must resolve to the real app,
  // unlike display-only event links where buildEventUrl's fallback is acceptable.
  if (!process.env.NEXT_PUBLIC_APP_URL) {
    console.error("NEXT_PUBLIC_APP_URL not set, cannot send invitation email")
    return { success: false }
  }

  const acceptUrl = `${process.env.NEXT_PUBLIC_APP_URL}/judge-invite/${input.inviteToken}`
  const expiresDate = formatExactDateTime(input.expiresAt, input.hackathonTimezone)

  const { html, text } = await renderEmail(
    JudgeInvitationEmail({
      personalMessage: input.personalMessage,
      inviterName: input.inviterName,
      hackathonName: input.hackathonName,
      acceptUrl,
      expiresDate,
      eventUrl: buildEventUrl(input.hackathonSlug, "/judge"),
      hackathonStartsAt: input.hackathonStartsAt,
      hackathonEndsAt: input.hackathonEndsAt,
      eventSchedule: formatJudgeEventSchedule(
        input.hackathonStartsAt,
        input.hackathonEndsAt,
        input.hackathonTimezone,
      ),
    })
  )

  const result = await sendEmail({
    to: input.to,
    subject: `${shortHackathonName(input.inviterName, 14)} invited you to judge ${shortHackathonName(input.hackathonName, 20)}`,
    html,
    text,
    replyTo: getReplyToAddress(),
    headers: buildUnsubscribeHeaders(`${process.env.NEXT_PUBLIC_APP_URL}/api/public/judge-invitations/${input.inviteToken}/unsubscribe`),
    tags: [
      { name: "type", value: "judge_invitation" },
      { name: "hackathon", value: sanitizeTag(input.hackathonName) },
    ],
    idempotencyKey: `judge-invitation/${input.deliveryId ?? input.inviteToken}`,
  })

  return { success: result !== null }
}

export type SendJudgeInvitationReminderInput = {
  to: string
  hackathonName: string
  inviterName: string
  inviteToken: string
  expiresAt: string
  urgency?: "low" | "medium" | "high"
  deliveryId?: string
  hackathonSlug?: string
  hackathonStartsAt?: string | null
  hackathonEndsAt?: string | null
  hackathonTimezone?: string | null
}

function judgeReminderSubject(hackathonName: string, urgency: string): string {
  const name = shortHackathonName(hackathonName, 24)
  if (urgency === "high") return `Your invite to judge ${name} expires soon`
  if (urgency === "medium") return `Your invite to judge ${name} expires tomorrow`
  return `Reminder: Judge ${name}`
}

export async function sendJudgeInvitationReminderEmail(
  input: SendJudgeInvitationReminderInput
): Promise<{ success: boolean }> {
  if (!process.env.NEXT_PUBLIC_APP_URL) {
    console.error("NEXT_PUBLIC_APP_URL not set, cannot send reminder email")
    return { success: false }
  }

  const acceptUrl = `${process.env.NEXT_PUBLIC_APP_URL}/judge-invite/${input.inviteToken}`
  const expiresDate = formatExactDateTime(input.expiresAt, input.hackathonTimezone)
  const timeLeft = formatTimeLeft(input.expiresAt)

  const { html, text } = await renderEmail(
    JudgeInvitationReminderEmail({
      inviterName: input.inviterName,
      hackathonName: input.hackathonName,
      acceptUrl,
      expiresDate,
      timeLeft,
      eventUrl: buildEventUrl(input.hackathonSlug, "/judge"),
      hackathonStartsAt: input.hackathonStartsAt,
      hackathonEndsAt: input.hackathonEndsAt,
      eventSchedule: formatJudgeEventSchedule(
        input.hackathonStartsAt,
        input.hackathonEndsAt,
        input.hackathonTimezone,
      ),
    })
  )

  const urgency = input.urgency ?? "low"
  const subject = judgeReminderSubject(input.hackathonName, urgency)

  const result = await sendEmail({
    to: input.to,
    subject,
    html,
    text,
    replyTo: getReplyToAddress(),
    headers: buildUnsubscribeHeaders(`${process.env.NEXT_PUBLIC_APP_URL}/api/public/judge-invitations/${input.inviteToken}/unsubscribe`),
    tags: [
      { name: "type", value: "judge_invitation_reminder" },
      { name: "hackathon", value: sanitizeTag(input.hackathonName) },
    ],
    idempotencyKey: `judge-invitation-reminder/${input.deliveryId ?? `${input.inviteToken}/${urgency}`}`,
  })

  return { success: result !== null }
}
