import type { SupabaseClient } from "@supabase/supabase-js"
import { clerkClient } from "@clerk/nextjs/server"
import { supabase } from "@/lib/db/client"
import { getVerifiedUserEmails } from "@/lib/auth/verified-emails"
import { extractEmailAddress } from "@/lib/email/utils"
import { reminderFingerprint, verifyReminderReplyAddress } from "@/lib/services/reminder-delivery"

export type ReminderReply = {
  id: string
  from: string
  to: string[]
  text: string | null
  subject?: string
  headers: Record<string, string> | null
}

export function isExplicitReminderStop(text: string | null, headers: Record<string, string> | null): boolean {
  const normalizedHeaders = Object.fromEntries(Object.entries(headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]))
  if (normalizedHeaders["auto-submitted"] && normalizedHeaders["auto-submitted"].toLowerCase() !== "no") return false
  if (normalizedHeaders["x-autoreply"] || normalizedHeaders["x-autorespond"]) return false
  const unquoted = (text ?? "").split(/\r?\n(?:\s*>|On .+wrote:|-+\s*(?:Original|Forwarded) message)/i)[0].trim().toLowerCase()
  return /^(?:please\s+)?(?:stop|unsubscribe|stop (?:these )?reminders|stop sending (?:me )?(?:these )?reminders|unsubscribe me(?: from (?:these )?reminders)?)(?:\s+please)?[.!]?$/.test(unquoted)
}

export async function processReminderReply(reply: ReminderReply, dependencies: { verifiedEmails?: (userId: string) => Promise<string[]> } = {}): Promise<string> {
  const client = supabase() as unknown as SupabaseClient
  const previous = await client.from("reminder_reply_audits").select("outcome").eq("id", reply.id).maybeSingle()
  if (previous.error) throw new Error("Could not check reply receipt.")
  if (previous.data) return previous.data.outcome as string
  const ids = [...new Set(reply.to.map(verifyReminderReplyAddress).filter((id): id is string => !!id))]
  let delivery: { id: string; recipient_email: string; recipient_user_id: string | null; accepted_at: string | null } | null = null
  if (ids.length === 1) {
    const result = await client.from("reminder_deliveries").select("id,recipient_email,recipient_user_id,accepted_at").eq("id", ids[0]).maybeSingle()
    if (result.error) throw new Error("Could not verify the original reminder.")
    delivery = result.data
  }
  const sender = extractEmailAddress(reply.from).trim().toLowerCase()
  let verified = false
  if (delivery?.accepted_at) {
    if (delivery.recipient_user_id) {
      const aliases = dependencies.verifiedEmails
        ? await dependencies.verifiedEmails(delivery.recipient_user_id)
        : getVerifiedUserEmails(await (await clerkClient()).users.getUser(delivery.recipient_user_id))
      verified = aliases.includes(delivery.recipient_email) && aliases.includes(sender)
    } else {
      verified = sender === delivery.recipient_email
    }
  }
  const explicit = isExplicitReminderStop(reply.text?.trim() ? reply.text : reply.subject?.toLowerCase() === "unsubscribe" ? "unsubscribe" : "", reply.headers)
  const reason = !delivery?.accepted_at ? "original_delivery_unverified"
    : !verified ? "recipient_unverified"
    : !explicit ? "request_requires_review"
    : "verified_scoped_reply"
  const recorded = await client.rpc("record_reminder_reply", {
    p_reply_id: reply.id, p_delivery_id: delivery?.id ?? null,
    p_sender_hash: reminderFingerprint(sender), p_body_hash: reminderFingerprint(reply.text ?? ""),
    p_verified: verified && explicit, p_reason: reason,
  })
  if (recorded.error) throw new Error("Could not record the reminder reply.")
  return recorded.data as string
}
