import { sendEmail } from "./resend"
import {
  sanitizeTag,
  renderEmail,
  buildEventUrl,
  formatTimeLeft,
  getReplyToAddress,
  buildMailtoUnsubscribeHeaders,
  shortHackathonName,
} from "./utils"
import JudgeAddedEmail from "@/emails/judge-added"
import JudgeInvitationEmail from "@/emails/judge-invitation"
import JudgeInvitationReminderEmail from "@/emails/judge-invitation-reminder"
import { sha256Fingerprint } from "@/lib/utils/hash"

export type SendJudgeInvitationInput = {
  to: string
  hackathonName: string
  inviterName: string
  inviteToken: string
  expiresAt: string
  hackathonSlug?: string
  hackathonStartsAt?: string | null
  hackathonEndsAt?: string | null
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
}

export async function sendJudgeAddedNotification(
  input: SendJudgeAddedNotificationInput
): Promise<{ success: boolean }> {
  if (!process.env.NEXT_PUBLIC_APP_URL) {
    console.error("NEXT_PUBLIC_APP_URL not set, cannot send judge added notification")
    return { success: false }
  }

  const eventUrl = buildEventUrl(input.hackathonSlug, "?as=judge")

  const { html, text } = await renderEmail(
    JudgeAddedEmail({
      addedByName: input.addedByName,
      hackathonName: input.hackathonName,
      eventUrl,
      hackathonStartsAt: input.hackathonStartsAt,
      hackathonEndsAt: input.hackathonEndsAt,
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
  const expiresDate = new Date(input.expiresAt).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  const { html, text } = await renderEmail(
    JudgeInvitationEmail({
      inviterName: input.inviterName,
      hackathonName: input.hackathonName,
      acceptUrl,
      expiresDate,
      eventUrl: buildEventUrl(input.hackathonSlug),
      hackathonStartsAt: input.hackathonStartsAt,
      hackathonEndsAt: input.hackathonEndsAt,
    })
  )

  const result = await sendEmail({
    to: input.to,
    subject: `Judge ${shortHackathonName(input.hackathonName)}`,
    html,
    text,
    replyTo: getReplyToAddress(),
    headers: buildMailtoUnsubscribeHeaders(),
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
  const expiresDate = new Date(input.expiresAt).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })
  const timeLeft = formatTimeLeft(input.expiresAt)

  const { html, text } = await renderEmail(
    JudgeInvitationReminderEmail({
      inviterName: input.inviterName,
      hackathonName: input.hackathonName,
      acceptUrl,
      expiresDate,
      timeLeft,
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
    headers: buildMailtoUnsubscribeHeaders(),
    tags: [
      { name: "type", value: "judge_invitation_reminder" },
      { name: "hackathon", value: sanitizeTag(input.hackathonName) },
    ],
    idempotencyKey: `judge-invitation-reminder/${input.deliveryId ?? `${input.inviteToken}/${urgency}`}`,
  })

  return { success: result !== null }
}
