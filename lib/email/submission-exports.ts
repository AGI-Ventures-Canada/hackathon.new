import { sendEmail } from "./resend"
import {
  buildEventUrl,
  getReplyToAddress,
  renderEmail,
  sanitizeTag,
} from "./utils"
import { formatFileSize } from "@/lib/utils/format"
import SubmissionExportReadyEmail from "@/emails/submission-export-ready"
import SubmissionExportFailedEmail from "@/emails/submission-export-failed"

export type SendExportReadyEmailInput = {
  to: string
  recipientName: string | null
  hackathonName: string
  hackathonId: string
  hackathonSlug: string
  exportId: string
  submissionCount: number
  fileSizeBytes: number
  expiresAt: string
}

export type SendExportFailedEmailInput = {
  to: string
  recipientName: string | null
  hackathonName: string
  hackathonSlug: string
  errorMessage: string
}

function formatExpiresLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

export async function sendExportReadyEmail(
  input: SendExportReadyEmailInput
): Promise<{ success: boolean }> {
  if (!process.env.NEXT_PUBLIC_APP_URL) {
    console.error("NEXT_PUBLIC_APP_URL not set, cannot send export ready email")
    return { success: false }
  }

  const downloadUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/dashboard/hackathons/${input.hackathonId}/exports/${input.exportId}/download`
  const eventUrl = buildEventUrl(input.hackathonSlug)

  const { html, text } = await renderEmail(
    SubmissionExportReadyEmail({
      recipientName: input.recipientName,
      hackathonName: input.hackathonName,
      submissionCount: input.submissionCount,
      fileSizeLabel: formatFileSize(input.fileSizeBytes),
      expiresLabel: formatExpiresLabel(input.expiresAt),
      downloadUrl,
      eventUrl,
    })
  )

  const result = await sendEmail({
    to: input.to,
    subject: `Your ${input.hackathonName} export is ready`,
    html,
    text,
    replyTo: getReplyToAddress(),
    tags: [
      { name: "type", value: "submission_export_ready" },
      { name: "hackathon", value: sanitizeTag(input.hackathonName) },
    ],
  })

  return { success: result !== null }
}

export async function sendExportFailedEmail(
  input: SendExportFailedEmailInput
): Promise<{ success: boolean }> {
  if (!process.env.NEXT_PUBLIC_APP_URL) {
    console.error("NEXT_PUBLIC_APP_URL not set, cannot send export failed email")
    return { success: false }
  }

  const retryUrl = `${process.env.NEXT_PUBLIC_APP_URL}/e/${input.hackathonSlug}/manage?tab=post-event`
  const eventUrl = buildEventUrl(input.hackathonSlug)

  const { html, text } = await renderEmail(
    SubmissionExportFailedEmail({
      recipientName: input.recipientName,
      hackathonName: input.hackathonName,
      errorMessage: input.errorMessage,
      retryUrl,
      eventUrl,
    })
  )

  const result = await sendEmail({
    to: input.to,
    subject: `${input.hackathonName} export didn't finish`,
    html,
    text,
    replyTo: getReplyToAddress(),
    tags: [
      { name: "type", value: "submission_export_failed" },
      { name: "hackathon", value: sanitizeTag(input.hackathonName) },
    ],
  })

  return { success: result !== null }
}
