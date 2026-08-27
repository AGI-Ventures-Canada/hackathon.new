import type { EmailJSON } from "@clerk/nextjs/server"
import { sendEmail } from "@/lib/email/resend"
import {
  buildMailtoUnsubscribeHeaders,
  getReplyToAddress,
  htmlToPlainText,
  sanitizeTag,
} from "@/lib/email/utils"

export type ForwardClerkEmailResult =
  | { status: "sent"; emailId: string }
  | { status: "skipped"; reason: "delivered_by_clerk" }
  | {
      status: "invalid"
      reason: "missing_id" | "missing_recipient" | "missing_subject" | "missing_body"
    }
  | { status: "failed" }

function getEmailType(slug: string | null | undefined): string {
  return sanitizeTag(slug ?? "") || "clerk_email"
}

function plainTextToHtml(text: string): string {
  return `<p>${text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/\r?\n/g, "<br />")}</p>`
}

export async function forwardClerkEmail(email: EmailJSON): Promise<ForwardClerkEmailResult> {
  if (email.delivered_by_clerk) {
    return { status: "skipped", reason: "delivered_by_clerk" }
  }

  const emailId = email.id?.trim()
  if (!emailId) return { status: "invalid", reason: "missing_id" }

  const to = email.to_email_address?.trim()
  if (!to) return { status: "invalid", reason: "missing_recipient" }

  const subject = email.subject?.trim()
  if (!subject) return { status: "invalid", reason: "missing_subject" }

  const suppliedHtml = email.body?.trim()
  const suppliedText = email.body_plain?.trim()
  if (!suppliedHtml && !suppliedText) return { status: "invalid", reason: "missing_body" }

  const html = suppliedHtml || plainTextToHtml(suppliedText!)
  const text = suppliedText || htmlToPlainText(suppliedHtml!)

  const result = await sendEmail({
    to,
    subject,
    html,
    text,
    replyTo: getReplyToAddress(),
    headers: buildMailtoUnsubscribeHeaders(),
    tags: [
      { name: "type", value: getEmailType(email.slug) },
      { name: "source", value: "clerk" },
    ],
    idempotencyKey: `clerk-email/${emailId}`,
  })

  if (!result) return { status: "failed" }
  return { status: "sent", emailId: result.id }
}
