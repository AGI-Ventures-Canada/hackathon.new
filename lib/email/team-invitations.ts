import { sendEmail } from "./resend"
import {
  sanitizeTag,
  renderEmail,
  buildEventUrl,
  formatTimeLeft,
  getReplyToAddress,
  buildUnsubscribeHeaders,
} from "./utils"
import TeamInvitationEmail from "@/emails/team-invitation"
import TeamInvitationReminderEmail from "@/emails/team-invitation-reminder"

export type SendTeamInvitationInput = {
  to: string
  teamName: string
  hackathonName: string
  inviterName: string
  inviteToken: string
  expiresAt: string
  hackathonSlug?: string
  hackathonStartsAt?: string | null
  hackathonEndsAt?: string | null
  teamMembers?: string[]
}

export async function sendTeamInvitationEmail(
  input: SendTeamInvitationInput
): Promise<{ success: boolean }> {
  if (!process.env.NEXT_PUBLIC_APP_URL) {
    console.error("NEXT_PUBLIC_APP_URL not set, cannot send invitation email")
    return { success: false }
  }

  const acceptUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${input.inviteToken}`
  const unsubscribeUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/public/invitations/${input.inviteToken}/unsubscribe`
  const expiresDate = new Date(input.expiresAt).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  const { html, text } = await renderEmail(
    TeamInvitationEmail({
      inviterName: input.inviterName,
      teamName: input.teamName,
      hackathonName: input.hackathonName,
      acceptUrl,
      expiresDate,
      eventUrl: buildEventUrl(input.hackathonSlug),
      hackathonStartsAt: input.hackathonStartsAt,
      hackathonEndsAt: input.hackathonEndsAt,
      teamMembers: input.teamMembers,
    })
  )

  const result = await sendEmail({
    to: input.to,
    subject: `${input.inviterName} invited you to "${input.teamName}" for ${input.hackathonName}`,
    html,
    text,
    replyTo: getReplyToAddress(),
    headers: buildUnsubscribeHeaders(unsubscribeUrl),
    tags: [
      { name: "type", value: "team_invitation" },
      { name: "hackathon", value: sanitizeTag(input.hackathonName) },
    ],
  })

  return { success: result !== null }
}

export type SendTeamInvitationReminderInput = {
  to: string
  teamName: string
  hackathonName: string
  inviterName: string
  inviteToken: string
  expiresAt: string
  urgency?: "low" | "medium" | "high"
}

function teamReminderSubject(teamName: string, hackathonName: string, urgency: string): string {
  if (urgency === "high") return `Your "${teamName}" invite expires soon`
  if (urgency === "medium") return `Your "${teamName}" invite expires tomorrow`
  return `Reminder: Join "${teamName}" for ${hackathonName}`
}

export async function sendTeamInvitationReminderEmail(
  input: SendTeamInvitationReminderInput
): Promise<{ success: boolean }> {
  if (!process.env.NEXT_PUBLIC_APP_URL) {
    console.error("NEXT_PUBLIC_APP_URL not set, cannot send reminder email")
    return { success: false }
  }

  const acceptUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${input.inviteToken}`
  const unsubscribeUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/public/invitations/${input.inviteToken}/unsubscribe`
  const expiresDate = new Date(input.expiresAt).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })
  const timeLeft = formatTimeLeft(input.expiresAt)

  const { html, text } = await renderEmail(
    TeamInvitationReminderEmail({
      inviterName: input.inviterName,
      teamName: input.teamName,
      hackathonName: input.hackathonName,
      acceptUrl,
      expiresDate,
      timeLeft,
    })
  )

  const subject = teamReminderSubject(input.teamName, input.hackathonName, input.urgency ?? "low")

  const result = await sendEmail({
    to: input.to,
    subject,
    html,
    text,
    replyTo: getReplyToAddress(),
    headers: buildUnsubscribeHeaders(unsubscribeUrl),
    tags: [
      { name: "type", value: "team_invitation_reminder" },
      { name: "hackathon", value: sanitizeTag(input.hackathonName) },
    ],
  })

  return { success: result !== null }
}
