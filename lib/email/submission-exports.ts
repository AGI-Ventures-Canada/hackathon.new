import { sendEmail } from "./resend"
import {
  buildEventUrl,
  getReplyToAddress,
  renderEmail,
  sanitizeTag,
  buildMailtoUnsubscribeHeaders,
  shortHackathonName,
} from "./utils"
import { formatFileSize } from "@/lib/utils/format"
import SubmissionExportReadyEmail from "@/emails/submission-export-ready"
import SubmissionExportFailedEmail from "@/emails/submission-export-failed"
import { createHash } from "node:crypto"

function recipientFingerprint(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 24)
}

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
  exportId?: string
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
    subject: `Your ${shortHackathonName(input.hackathonName)} export is ready`,
    html,
    text,
    replyTo: getReplyToAddress(),
    headers: buildMailtoUnsubscribeHeaders(),
    tags: [
      { name: "type", value: "submission_export_ready" },
      { name: "hackathon", value: sanitizeTag(input.hackathonName) },
    ],
    idempotencyKey: `submission-export-ready/${input.exportId}/${recipientFingerprint(input.to)}`,
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

  const retryUrl = `${process.env.NEXT_PUBLIC_APP_URL}/e/${input.hackathonSlug}/manage?tab=post-event&ptab=exports`
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
    subject: `${shortHackathonName(input.hackathonName)} export didn't finish`,
    html,
    text,
    replyTo: getReplyToAddress(),
    headers: buildMailtoUnsubscribeHeaders(),
    tags: [
      { name: "type", value: "submission_export_failed" },
      { name: "hackathon", value: sanitizeTag(input.hackathonName) },
    ],
    idempotencyKey: input.exportId
      ? `submission-export-failed/${input.exportId}/${recipientFingerprint(input.to)}`
      : undefined,
  })

  return { success: result !== null }
}
