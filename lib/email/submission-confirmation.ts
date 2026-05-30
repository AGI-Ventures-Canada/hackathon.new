import { sendEmail } from "./resend"
import { buildEventUrl, getReplyToAddress, renderEmail, sanitizeTag } from "./utils"
import SubmissionConfirmationEmail from "@/emails/submission-confirmation"

export type SendSubmissionConfirmationInput = {
  to: string
  hackathonName: string
  hackathonSlug: string
  projectTitle: string
  teamName?: string | null
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
    subject: `We got your project for ${input.hackathonName}`,
    html,
    text,
    replyTo: getReplyToAddress(),
    tags: [
      { name: "type", value: "submission_confirmation" },
      { name: "hackathon", value: sanitizeTag(input.hackathonName) },
    ],
  })

  return { success: result !== null }
}
