import { sendEmail } from "./resend"
import {
  buildEventUrl,
  getReplyToAddress,
  renderEmail,
  sanitizeTag,
  buildMailtoUnsubscribeHeaders,
  shortHackathonName,
} from "./utils"
import SubmissionConfirmationEmail from "@/emails/submission-confirmation"
import { createHash } from "node:crypto"

function recipientFingerprint(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 24)
}

export type SendSubmissionConfirmationInput = {
  to: string
  hackathonName: string
  hackathonSlug: string
  projectTitle: string
  teamName?: string | null
  submissionId?: string
}

export async function sendSubmissionConfirmationEmail(
  input: SendSubmissionConfirmationInput
): Promise<{ success: boolean }> {
  const eventUrl = buildEventUrl(input.hackathonSlug)
  const { html, text } = await renderEmail(
    SubmissionConfirmationEmail({
      hackathonName: input.hackathonName,
      projectTitle: input.projectTitle,
      teamName: input.teamName ?? null,
      eventUrl,
    })
  )

  const result = await sendEmail({
    to: input.to,
    subject: `We got your project for ${shortHackathonName(input.hackathonName)}`,
    html,
    text,
    replyTo: getReplyToAddress(),
    headers: buildMailtoUnsubscribeHeaders(),
    tags: [
      { name: "type", value: "submission_confirmation" },
      { name: "hackathon", value: sanitizeTag(input.hackathonName) },
    ],
    idempotencyKey: input.submissionId
      ? `submission-confirmation/${input.submissionId}/${recipientFingerprint(input.to)}`
      : undefined,
  })

  return { success: result !== null }
}
