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
import OrganizerClaimNotificationEmail from "@/emails/organizer-claim-notification"
import OrganizerReadinessReminderEmail from "@/emails/organizer-readiness-reminder"
import { createHash } from "node:crypto"
import { consumeDeliverySlot, type DeliveryBudget } from "@/lib/services/delivery-budget"

function recipientFingerprint(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 24)
}

export async function sendOrganizerClaimNotification(params: {
  prizeName: string
  hackathonName: string
  hackathonSlug: string
  winnerName: string
  hackathonId: string
  prizeValue?: string | null
  fulfillmentId?: string
}): Promise<number> {
  const { prizeName, hackathonName, hackathonSlug, winnerName, hackathonId, prizeValue } = params
  const { supabase: getSupabase } = await import("@/lib/db/client")
  const client = getSupabase()

  const { data: hackathon } = await client
    .from("hackathons")
    .select("tenant_id")
    .eq("id", hackathonId)
    .single()

  if (!hackathon?.tenant_id) return 0

  const { data: tenant } = await client
    .from("tenants")
    .select("clerk_org_id, clerk_user_id")
    .eq("id", hackathon.tenant_id)
    .single()

  if (!tenant) return 0

  const emails = await resolveEmailsForTenant(tenant)

  if (emails.length === 0) {
    console.warn(`[organizer-notification] No emails resolved for hackathon ${hackathonId}`)
    return 0
  }

  const fulfillmentUrl = process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}/e/${hackathonSlug}/manage?tab=post-event`
    : null

  const { html, text } = await renderEmail(
    OrganizerClaimNotificationEmail({
      winnerName,
      prizeName,
      hackathonName,
      fulfillmentUrl,
      eventUrl: buildEventUrl(hackathonSlug),
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
      subject: `Prize claimed: ${shortHackathonName(prizeName, 18)} — ${shortHackathonName(hackathonName, 20)}`,
      html,
      text,
      replyTo: getReplyToAddress(),
      headers: buildMailtoUnsubscribeHeaders(),
      tags: [
        { name: "type", value: "organizer_claim_notification" },
        { name: "hackathon", value: tag },
      ],
      idempotencyKey: params.fulfillmentId
        ? `organizer-claim/${params.fulfillmentId}/${recipientFingerprint(email)}`
        : undefined,
    })
    if (result) sent++
  }

  return sent
}

export async function sendOrganizerReadinessReminder(params: {
  hackathonId: string
  hackathonName: string
  hackathonSlug: string
  deadlineDate: string
  reminderType: "organizer_event_readiness" | "organizer_judging_readiness"
  urgency: "low" | "medium" | "high"
  deliveryId: string
  budget?: DeliveryBudget
}): Promise<{ sent: number; failed: number; deferred?: true }> {
  const { supabase: getSupabase } = await import("@/lib/db/client")
  const client = getSupabase()
  const { data: hackathon } = await client
    .from("hackathons")
    .select("tenant_id")
    .eq("id", params.hackathonId)
    .single()
  if (!hackathon?.tenant_id) return { sent: 0, failed: 0 }

  const { data: tenant } = await client
    .from("tenants")
    .select("clerk_org_id, clerk_user_id")
    .eq("id", hackathon.tenant_id)
    .single()
  if (!tenant) return { sent: 0, failed: 0 }

  const [{ getOrganizerTaskBoard }, emails] = await Promise.all([
    import("@/lib/services/organizer-action-items"),
    resolveEmailsForTenant(tenant),
  ])
  const taskPage = await getOrganizerTaskBoard(params.hackathonId, {
    state: "pending",
    limit: 5,
  })
  const judgingReminder = params.reminderType === "organizer_judging_readiness"
  const heading = judgingReminder ? "Judging starts soon" : "Your event starts soon"
  const body = judgingReminder
    ? "Check your judges, project assignments, and scoring rules now."
    : "A few things may still need your attention before people arrive."
  const deadlineLabel = judgingReminder ? "Projects are due" : "Event starts"
  const deadlineDate = new Date(params.deadlineDate).toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  })
  const ctaUrl = `${buildEventUrl(params.hackathonSlug)}/manage?tab=action-items`
  const { html, text } = await renderEmail(
    OrganizerReadinessReminderEmail({
      hackathonName: params.hackathonName,
      heading,
      body,
      deadlineLabel,
      deadlineDate,
      taskLabels: taskPage.items.map((task) => task.label),
      ctaUrl,
    }),
  )

  let sent = 0
  let failed = 0
  for (let index = 0; index < emails.length; index += 1) {
    if (!consumeDeliverySlot(params.budget)) {
      return { sent, failed, deferred: true }
    }
    const email = emails[index]
    await paceBulkSend(index)
    const result = await sendEmail({
      to: email,
      subject: `${params.urgency === "high" ? "Action needed: " : ""}${heading} — ${shortHackathonName(params.hackathonName)}`,
      html,
      text,
      replyTo: getReplyToAddress(),
      headers: buildMailtoUnsubscribeHeaders(),
      tags: [
        { name: "type", value: params.reminderType },
        { name: "hackathon", value: sanitizeTag(params.hackathonName) },
      ],
      idempotencyKey: `organizer-readiness/${params.deliveryId}/${recipientFingerprint(email)}`,
    })
    if (result) sent++
    else failed++
  }

  return { sent, failed }
}
