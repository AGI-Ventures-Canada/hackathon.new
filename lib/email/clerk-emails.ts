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
  | { status: "invalid"; reason: "missing_recipient" | "missing_subject" | "missing_body" }
  | { status: "failed" }

function getEmailType(slug: string | null | undefined): string {
  return sanitizeTag(slug ?? "") || "clerk_email"
}

export async function forwardClerkEmail(email: EmailJSON): Promise<ForwardClerkEmailResult> {
  if (email.delivered_by_clerk) {
    return { status: "skipped", reason: "delivered_by_clerk" }
  }

  const to = email.to_email_address?.trim()
  if (!to) return { status: "invalid", reason: "missing_recipient" }

  const subject = email.subject?.trim()
  if (!subject) return { status: "invalid", reason: "missing_subject" }

  const html = email.body?.trim()
  if (!html) return { status: "invalid", reason: "missing_body" }

  const result = await sendEmail({
    to,
    subject,
    html,
    text: email.body_plain?.trim() || htmlToPlainText(html),
    replyTo: getReplyToAddress(),
    headers: buildMailtoUnsubscribeHeaders(),
    tags: [
      { name: "type", value: getEmailType(email.slug) },
      { name: "source", value: "clerk" },
    ],
    idempotencyKey: `clerk-email/${email.id}`,
  })

  if (!result) return { status: "failed" }
  return { status: "sent", emailId: result.id }
}
