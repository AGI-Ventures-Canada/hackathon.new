import { sendEmail } from "./resend"
import { renderEmail, sanitizeTag, resolveEmailsForTenant, buildEventUrl } from "./utils"
import SponsorClaimNotificationEmail from "@/emails/sponsor-claim-notification"

export async function sendSponsorClaimNotification(params: {
  prizeName: string
  hackathonName: string
  winnerName: string
  sponsorTenantId: string
  hackathonSlug?: string
  prizeValue?: string | null
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
  for (const email of emails) {
    const result = await sendEmail({
      to: email,
      subject: `Winner claimed ${prizeName} — ${hackathonName}`,
      html,
      text,
      tags: [
        { name: "type", value: "sponsor_claim_notification" },
        { name: "hackathon", value: tag },
      ],
    })
    if (result) sent++
  }

  return sent
}
