import { sendEmail } from "./resend"
import {
  renderEmail,
  sanitizeTag,
  resolveEmailsForTenant,
  buildEventUrl,
  getReplyToAddress,
  buildMailtoUnsubscribeHeaders,
  paceBulkSend,
  shortHackathonName,
} from "./utils"
import SponsorClaimNotificationEmail from "@/emails/sponsor-claim-notification"
import { createHash } from "node:crypto"

function recipientFingerprint(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 24)
}

export async function sendSponsorClaimNotification(params: {
  prizeName: string
  hackathonName: string
  winnerName: string
  sponsorTenantId: string
  hackathonSlug?: string
  prizeValue?: string | null
  fulfillmentId?: string
}): Promise<number> {
  const { prizeName, hackathonName, winnerName, sponsorTenantId, hackathonSlug, prizeValue } = params
  const { supabase: getSupabase } = await import("@/lib/db/client")
  const client = getSupabase()

  const { data: tenant } = await client
    .from("tenants")
    .select("clerk_org_id, clerk_user_id")
    .eq("id", sponsorTenantId)
    .single()

  if (!tenant) return 0

  const emails = await resolveEmailsForTenant(tenant)

  if (emails.length === 0) {
    console.warn(`[sponsor-notification] No emails resolved for tenant ${sponsorTenantId}`)
    return 0
  }

  const eventUrl = buildEventUrl(hackathonSlug) ?? null

  const { html, text } = await renderEmail(
    SponsorClaimNotificationEmail({
      winnerName,
      prizeName,
      hackathonName,
      eventUrl,
      prizeValue,
    })
  )

  const tag = sanitizeTag(hackathonName)

  let sent = 0
  for (let index = 0; index < emails.length; index += 1) {
    const email = emails[index]
    await paceBulkSend(index)
    const result = await sendEmail({
      to: email,
      subject: `Winner claimed ${prizeName} — ${shortHackathonName(hackathonName)}`,
      html,
      text,
      replyTo: getReplyToAddress(),
      headers: buildMailtoUnsubscribeHeaders(),
      tags: [
        { name: "type", value: "sponsor_claim_notification" },
        { name: "hackathon", value: tag },
      ],
      idempotencyKey: params.fulfillmentId
        ? `sponsor-claim/${params.fulfillmentId}/${recipientFingerprint(email)}`
        : undefined,
    })
    if (result) sent++
  }

  return sent
}
