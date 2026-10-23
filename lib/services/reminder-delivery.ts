import { createHash, createHmac, timingSafeEqual } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { supabase } from "@/lib/db/client"
import { extractEmailAddress } from "@/lib/email/utils"
import { reminderIsCurrent, type ReminderCategory, type ReminderEvent } from "@/lib/utils/reminder-cutoff"

export type ReminderDeliveryContext = {
  hackathonId: string
  category: ReminderCategory
  recipientUserId?: string
  roundId?: string | null
  deadline?: string
  onStopped?: () => void
}
export type ReminderDeliveryReceipt = {
  id: string; hackathon_id: string; category: ReminderCategory; recipient_email: string
  recipient_user_id: string | null; recipient_key: string; provider_message_id: string | null
  accepted_at: string | null
  created_at?: string
}
const db = () => supabase() as unknown as SupabaseClient
export const reminderFingerprint = (value: string) => createHash("sha256").update(value).digest("hex")
export const reminderRecipientKey = (email: string, userId?: string | null) => reminderFingerprint(userId ? `user:${userId}` : `email:${email.trim().toLowerCase()}`)

function replyMailbox(): string | null {
  const explicit = process.env.RESEND_REMINDER_REPLY_TO
  const configured = explicit || process.env.RESEND_REPLY_TO_EMAIL
  if (!configured || /[\r\n]/.test(configured)) return null
  const address = extractEmailAddress(configured).toLowerCase()
  const [local, domain, extra] = address.split("@")
  if (extra || !local || local.length > 13 || !/^[a-z0-9._-]+$/.test(local) || !domain) return null
  if (!explicit && domain !== process.env.RESEND_RECEIVING_DOMAIN?.toLowerCase()) return null
  return address
}

export function reminderReplyAddress(id: string): string | null {
  const mailbox = replyMailbox()
  const secret = process.env.API_KEY_SECRET
  if (!mailbox || !secret || !/^[a-f0-9]{24}$/.test(id)) return null
  const [local, domain] = mailbox.split("@")
  const signature = createHmac("sha256", secret).update(`reminder-reply:${id}`).digest("hex").slice(0, 24)
  return `${local}+${id}.${signature}@${domain}`
}

export function verifyReminderReplyAddress(address: string): string | null {
  const normalized = extractEmailAddress(address).toLowerCase()
  const id = normalized.match(/\+([a-f0-9]{24})\.[a-f0-9]{24}@/)?.[1]
  const expected = id ? reminderReplyAddress(id) : null
  if (!expected || normalized.length !== expected.length) return null
  return timingSafeEqual(Buffer.from(normalized), Buffer.from(expected)) ? id! : null
}

export async function prepareReminderDelivery(context: ReminderDeliveryContext, email: string, key: string): Promise<ReminderDeliveryReceipt> {
  if (!key || !email || !/^[^\s@,]+@[^\s@,]+$/.test(email)) throw new Error("Reminder delivery requires one recipient and a stable identity.")
  const input = {
    id: reminderFingerprint(key).slice(0, 24), hackathon_id: context.hackathonId,
    category: context.category, recipient_email: email.trim().toLowerCase(),
    recipient_user_id: context.recipientUserId ?? null,
    recipient_key: reminderRecipientKey(email, context.recipientUserId),
  }
  const client = db()
  const inserted = await client.from("reminder_deliveries").upsert(input, { onConflict: "id", ignoreDuplicates: true })
  if (inserted.error) throw new Error("Could not record reminder delivery context.")
  const { data, error } = await client.from("reminder_deliveries").select("*").eq("id", input.id).single()
  if (error || !data || data.hackathon_id !== input.hackathon_id || data.category !== input.category || data.recipient_key !== input.recipient_key || data.recipient_email !== input.recipient_email) throw new Error("Reminder delivery context does not match.")
  return data as ReminderDeliveryReceipt
}

export async function checkReminderDelivery(context: ReminderDeliveryContext, delivery: ReminderDeliveryReceipt): Promise<boolean> {
  const client = db()
  const [event, suppression] = await Promise.all([
    client.from("hackathons").select("status,starts_at,ends_at,is_test_event,results_published_at,judging_opens_at,judging_closes_at").eq("id", context.hackathonId).maybeSingle(),
    client.from("reminder_suppressions").select("source_reply_id").eq("hackathon_id", context.hackathonId).eq("category", context.category).in("recipient_key", [...new Set([delivery.recipient_key, reminderRecipientKey(delivery.recipient_email)])]).limit(1),
  ])
  if (event.error || suppression.error) throw new Error("Could not verify reminder eligibility.")
  let round: { opens_at: string | null; closes_at: string | null } | null = null
  if (context.roundId) {
    const result = await client.from("judging_rounds").select("opens_at,closes_at,status").eq("id", context.roundId).eq("hackathon_id", context.hackathonId).maybeSingle()
    if (result.error) throw new Error("Could not verify reminder round.")
    if (result.data?.status === "active") round = result.data
    else return stopDelivery(delivery.id, "round_closed")
  }
  const reason = suppression.data?.length ? "recipient_opt_out"
    : !event.data || !reminderIsCurrent(event.data as ReminderEvent, context.category, new Date(), round) ? "event_cutoff"
    : context.deadline && (!Number.isFinite(Date.parse(context.deadline)) || Date.now() >= Date.parse(context.deadline)) ? "deadline_passed"
    : delivery.created_at && Date.now() - Date.parse(delivery.created_at) >= 23 * 3_600_000 ? "provider_retry_window_expired"
    : null
  if (reason) return stopDelivery(delivery.id, reason)
  return true
}

async function stopDelivery(id: string, reason: string): Promise<false> {
  const { error } = await db().from("reminder_deliveries").update({ stopped_at: new Date().toISOString(), stop_reason: reason }).eq("id", id).is("accepted_at", null)
  if (error) throw new Error("Could not record stopped reminder.")
  return false
}

export async function acceptReminderDelivery(id: string, providerId: string): Promise<void> {
  const { error } = await db().from("reminder_deliveries").update({ accepted_at: new Date().toISOString(), provider_message_id: providerId }).eq("id", id).is("accepted_at", null)
  if (error) throw new Error("Could not record accepted reminder.")
}
