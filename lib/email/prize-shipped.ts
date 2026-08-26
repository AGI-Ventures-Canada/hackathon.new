import { sendEmail } from "./resend"
import {
  renderEmail,
  sanitizeTag,
  buildEventUrl,
  getReplyToAddress,
  buildMailtoUnsubscribeHeaders,
  shortHackathonName,
} from "./utils"
import PrizeShippedEmail from "@/emails/prize-shipped"
import { createHash } from "node:crypto"

function recipientFingerprint(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 24)
}

export async function sendPrizeShippedEmail(params: {
  recipientEmail: string
  recipientName: string
  prizeName: string
  hackathonName: string
  trackingNumber: string | null
  hackathonSlug?: string
  fulfillmentId?: string
}): Promise<boolean> {
  const { recipientEmail, recipientName, prizeName, hackathonName, trackingNumber, hackathonSlug } = params

  const { html, text } = await renderEmail(
    PrizeShippedEmail({
      recipientName,
      prizeName,
      hackathonName,
      trackingNumber,
      eventUrl: buildEventUrl(hackathonSlug),
    })
  )

  const result = await sendEmail({
    to: recipientEmail,
    subject: `Your prize is on its way — ${shortHackathonName(hackathonName)}`,
    html,
    text,
    replyTo: getReplyToAddress(),
    headers: buildMailtoUnsubscribeHeaders(),
    tags: [
      { name: "type", value: "prize_shipped" },
      { name: "hackathon", value: sanitizeTag(hackathonName) },
    ],
    idempotencyKey: params.fulfillmentId
      ? `prize-shipped/${params.fulfillmentId}/${recipientFingerprint(recipientEmail)}`
      : undefined,
  })

  return result !== null
}
