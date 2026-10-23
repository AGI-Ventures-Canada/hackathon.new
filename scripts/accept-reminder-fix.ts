import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { supabase } from "@/lib/db/client"
import { sendEmailWithResult, resetEmailProviderPacing } from "@/lib/email/resend"
import { processReminderReply } from "@/lib/services/reminder-replies"
import { reminderFingerprint, reminderReplyAddress } from "@/lib/services/reminder-delivery"

const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")
assert(["127.0.0.1", "localhost"].includes(url.hostname), "Acceptance fixtures may only run on the local database")
assert(process.env.API_KEY_SECRET, "Use the existing local API key secret")
process.env.RESEND_FROM_EMAIL = "reminders@example.com"
process.env.RESEND_REMINDER_REPLY_TO = "replies@example.com"
const db = supabase()
const tenant = await db.from("tenants").select("id").limit(1).single()
assert.ifError(tenant.error)
const eventId = randomUUID()
const now = Date.now()
const inserted = await db.from("hackathons").insert({ id: eventId, tenant_id: tenant.data!.id, name: "Reminder acceptance fixture", slug: `reminder-acceptance-${eventId}`, status: "judging", starts_at: new Date(now - 2 * 86_400_000).toISOString(), ends_at: new Date(now + 86_400_000).toISOString(), is_test_event: false })
assert.ifError(inserted.error)
let providerCalls = 0
const execution = { transport: async () => { providerCalls++; return { data: { id: `fixture-${providerCalls}` }, error: null, headers: null } }, providerPacing: { wait: async () => {} } }
const base = { to: "primary@example.com", subject: "Fixture", html: "<p>Fixture</p>", text: "Fixture" }
const aliases = { verifiedEmails: async () => ["primary@example.com", "alias@example.com"] }
const key = `acceptance/${eventId}`
const context = { hackathonId: eventId, category: "judge_judging" as const, recipientUserId: "fixture-recipient" }
const deliveryId = reminderFingerprint(key).slice(0, 24)
const replyIds: string[] = []
try {
  resetEmailProviderPacing()
  assert.equal((await sendEmailWithResult({ ...base, idempotencyKey: key, reminder: context }, execution)).ok, true)
  assert.equal(providerCalls, 1)
  assert.equal((await sendEmailWithResult({ ...base, idempotencyKey: key, reminder: context }, execution)).attempts, 0)
  assert.equal(providerCalls, 1)
  const reply = { id: randomUUID(), from: "alias@example.com", to: [reminderReplyAddress(deliveryId)!], text: "stop reminders", headers: {} }
  replyIds.push(reply.id)
  assert.equal(await processReminderReply(reply, aliases), "applied")
  assert.equal(await processReminderReply(reply, aliases), "applied")
  const duplicate = { ...reply, id: randomUUID() }
  replyIds.push(duplicate.id)
  assert.equal(await processReminderReply(duplicate, aliases), "already_suppressed")
  const ambiguous = { ...reply, id: randomUUID(), text: "stop every email for all events" }
  replyIds.push(ambiguous.id)
  assert.equal(await processReminderReply(ambiguous, aliases), "review_required")
  const blocked = await sendEmailWithResult({ ...base, idempotencyKey: `${key}/next`, reminder: context }, execution)
  assert.equal(blocked.error?.code, "email_reminder_stopped")
  assert.equal(providerCalls, 1)
  assert.equal((await sendEmailWithResult({ ...base, idempotencyKey: `${key}/organizer`, reminder: { ...context, category: "organizer_judging" } }, execution)).ok, true)
  assert.equal(providerCalls, 2)
  assert.equal((await sendEmailWithResult({ ...base, idempotencyKey: `${key}/security` }, execution)).ok, true)
  assert.equal(providerCalls, 3)
  assert.ifError((await db.from("hackathons").update({ ends_at: new Date(now - 60_000).toISOString() }).eq("id", eventId)).error)
  assert.equal((await sendEmailWithResult({ ...base, idempotencyKey: `${key}/stale`, reminder: { ...context, category: "organizer_judging" } }, execution)).error?.code, "email_reminder_stopped")
  assert.equal(providerCalls, 3)
  assert.ifError((await db.from("hackathons").update({ judging_opens_at: new Date(now - 60_000).toISOString(), judging_closes_at: new Date(now + 86_400_000).toISOString() }).eq("id", eventId)).error)
  assert.equal((await sendEmailWithResult({ ...base, idempotencyKey: `${key}/bounded`, reminder: { ...context, category: "organizer_judging" } }, execution)).ok, true)
  assert.equal(providerCalls, 4)
  const audits = await db.from("reminder_reply_audits").select("outcome").in("id", replyIds)
  assert.ifError(audits.error)
  assert.deepEqual(audits.data!.map((audit) => audit.outcome).sort(), ["already_suppressed", "applied", "review_required"])
  console.log("PASS: durable receipt, verified alias, duplicate replies, review queue, scoped suppression, stale cutoff, bounded post-event judging, transactional bypass. Provider transport was a local stub; no email sent.")
} finally {
  assert.ifError((await db.from("hackathons").delete().eq("id", eventId)).error)
  assert.ifError((await db.from("reminder_reply_audits").delete().in("id", replyIds)).error)
}
