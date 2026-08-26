import { sendEmail } from "./resend"
import {
  buildEventUrl,
  getReplyToAddress,
  renderEmail,
  sanitizeTag,
  buildMailtoUnsubscribeHeaders,
  shortHackathonName,
} from "./utils"
import TeamApprovedEmail from "@/emails/team-approved"
import TeamDeniedEmail from "@/emails/team-denied"
import { sha256Fingerprint } from "@/lib/utils/hash"

type TeamReviewEmailInput = {
  to: string
  teamId: string
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
    subject: `Your team was approved for ${shortHackathonName(input.hackathonName)}`,
    html,
    text,
    replyTo: getReplyToAddress(),
    headers: buildMailtoUnsubscribeHeaders(),
    tags: [
      { name: "type", value: "team_approved" },
      { name: "hackathon", value: sanitizeTag(input.hackathonName) },
    ],
    idempotencyKey: `team-review/${input.teamId}/approved/${await sha256Fingerprint(input.to.trim().toLowerCase())}`,
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
    subject: `Your team wasn't approved for ${shortHackathonName(input.hackathonName)}`,
    html,
    text,
    replyTo: getReplyToAddress(),
    headers: buildMailtoUnsubscribeHeaders(),
    tags: [
      { name: "type", value: "team_denied" },
      { name: "hackathon", value: sanitizeTag(input.hackathonName) },
    ],
    idempotencyKey: `team-review/${input.teamId}/denied/${await sha256Fingerprint(input.to.trim().toLowerCase())}`,
  })

  return { success: result !== null }
}
