import { sendEmail } from "./resend"
import { buildEventUrl, getReplyToAddress, renderEmail, sanitizeTag } from "./utils"
import TeamApprovedEmail from "@/emails/team-approved"
import TeamDeniedEmail from "@/emails/team-denied"

type TeamReviewEmailInput = {
  to: string
  teamName: string
  hackathonName: string
  hackathonSlug: string
}

export type SendTeamApprovedInput = TeamReviewEmailInput

export type SendTeamDeniedInput = TeamReviewEmailInput

export async function sendTeamApprovedEmail(
  input: SendTeamApprovedInput
): Promise<{ success: boolean }> {
  const eventUrl = buildEventUrl(input.hackathonSlug)
  const { html, text } = await renderEmail(
    TeamApprovedEmail({
      teamName: input.teamName,
      hackathonName: input.hackathonName,
      eventUrl,
    })
  )

  const result = await sendEmail({
    to: input.to,
    subject: `Your team was approved for ${input.hackathonName}`,
    html,
    text,
    replyTo: getReplyToAddress(),
    tags: [
      { name: "type", value: "team_approved" },
      { name: "hackathon", value: sanitizeTag(input.hackathonName) },
    ],
  })

  return { success: result !== null }
}

export async function sendTeamDeniedEmail(
  input: SendTeamDeniedInput
): Promise<{ success: boolean }> {
  const eventUrl = buildEventUrl(input.hackathonSlug)
  const { html, text } = await renderEmail(
    TeamDeniedEmail({
      teamName: input.teamName,
      hackathonName: input.hackathonName,
      eventUrl,
    })
  )

  const result = await sendEmail({
    to: input.to,
    subject: `Your team wasn't approved for ${input.hackathonName}`,
    html,
    text,
    replyTo: getReplyToAddress(),
    tags: [
      { name: "type", value: "team_denied" },
      { name: "hackathon", value: sanitizeTag(input.hackathonName) },
    ],
  })

  return { success: result !== null }
}
