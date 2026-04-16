import { sendEmail } from "./resend"
import { sanitizeTag, renderEmail, buildEventUrl, formatTimeLeft } from "./utils"
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
    subject: `Join "${input.teamName}" for ${input.hackathonName}`,
    html,
    text,
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
}

export async function sendTeamInvitationReminderEmail(
  input: SendTeamInvitationReminderInput
): Promise<{ success: boolean }> {
  if (!process.env.NEXT_PUBLIC_APP_URL) {
    console.error("NEXT_PUBLIC_APP_URL not set, cannot send reminder email")
    return { success: false }
  }

  const acceptUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${input.inviteToken}`
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

  const result = await sendEmail({
    to: input.to,
    subject: `Reminder: Join "${input.teamName}" for ${input.hackathonName}`,
    html,
    text,
    tags: [
      { name: "type", value: "team_invitation_reminder" },
      { name: "hackathon", value: sanitizeTag(input.hackathonName) },
    ],
  })

  return { success: result !== null }
}
