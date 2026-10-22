import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { createChainableMock, resetSupabaseMocks, setMockFromImplementation, setMockRpcImplementation } from "../lib/supabase-mock"
import { reminderFingerprint, reminderRecipientKey, reminderReplyAddress, verifyReminderReplyAddress, prepareReminderDelivery, checkReminderDelivery, acceptReminderDelivery } from "@/lib/services/reminder-delivery"
import { isExplicitReminderStop, processReminderReply } from "@/lib/services/reminder-replies"
import { resetEmailProviderPacing, sendEmailWithResult } from "@/lib/email/resend"

const originalEnvironment = { ...process.env }
const context = { hackathonId: "event", category: "judge_judging" as const, recipientUserId: "user" }
let delivery: Record<string, unknown>
let suppressed: boolean
let errorTable: string | null
let event: Record<string, unknown>
let rpcInput: Record<string, unknown>
let receipt: { outcome: string } | null
beforeEach(() => {
  resetSupabaseMocks()
  resetEmailProviderPacing()
  process.env.API_KEY_SECRET = "test-secret"
  process.env.RESEND_REMINDER_REPLY_TO = "replies@example.com"
  process.env.RESEND_FROM_EMAIL = "notifications@example.com"
  delivery = { id: reminderFingerprint("stable").slice(0, 24), hackathon_id: "event", category: "judge_judging", recipient_email: "primary@example.com", recipient_user_id: "user", recipient_key: reminderRecipientKey("primary@example.com", "user"), accepted_at: null, provider_message_id: null }
  event = { status: "judging", ends_at: new Date(Date.now() + 86_400_000).toISOString() }
  suppressed = false
  receipt = null
  errorTable = null
  rpcInput = {}
  setMockFromImplementation((table) => {
    const chain = createChainableMock({ data: table === "hackathons" ? event : table === "reminder_deliveries" ? delivery : table === "reminder_reply_audits" ? receipt : table === "judging_rounds" ? { status: "active", opens_at: "2026-01-01T00:00:00Z", closes_at: "2030-01-01T00:00:00Z" } : suppressed ? [{ source_reply_id: "reply" }] : [], error: table === errorTable ? { message: "unavailable" } : null })
    chain.update.mockImplementation((...args: unknown[]) => { if (table === "reminder_deliveries") Object.assign(delivery, args[0]); return chain })
    return chain
  })
  setMockRpcImplementation((_name, args) => { rpcInput = args as Record<string, unknown>; return Promise.resolve({ data: rpcInput.p_verified ? "applied" : "review_required", error: null }) })
})
afterEach(() => {
  for (const key of ["API_KEY_SECRET", "RESEND_REMINDER_REPLY_TO", "RESEND_REPLY_TO_EMAIL", "RESEND_RECEIVING_DOMAIN", "RESEND_FROM_EMAIL"]) {
    if (originalEnvironment[key] === undefined) delete process.env[key]
    else process.env[key] = originalEnvironment[key]
  }
})

const reply = () => ({ id: "reply", from: "Alias <alias@example.com>", to: [reminderReplyAddress(String(delivery.id))!], text: "Please stop these reminders.\n\nOn Tuesday someone wrote:\n> Reply STOP", headers: {} })
const aliases = { verifiedEmails: async () => ["primary@example.com", "alias@example.com"] }

describe("verified scoped reminder replies", () => {
  it("authenticates a delivery reference and rejects forged addresses and unrelated mailboxes", () => {
    const address = reminderReplyAddress(String(delivery.id))!
    expect(verifyReminderReplyAddress(address)).toBe(delivery.id as string)
    expect(verifyReminderReplyAddress(address.replace("replies", "other"))).toBeNull()
    expect(verifyReminderReplyAddress(address.replace(/\.[a-f0-9]{24}@/, "." + "0".repeat(24) + "@"))).toBeNull()
    expect(verifyReminderReplyAddress("not-a-token@example.com")).toBeNull()
    delete process.env.API_KEY_SECRET
    expect(reminderReplyAddress(String(delivery.id))).toBeNull()
  })
  it("requires an explicitly configured receiving mailbox", () => {
    delete process.env.RESEND_REMINDER_REPLY_TO
    process.env.RESEND_REPLY_TO_EMAIL = "replies@example.com"
    delete process.env.RESEND_RECEIVING_DOMAIN
    expect(reminderReplyAddress(String(delivery.id))).toBeNull()
    process.env.RESEND_RECEIVING_DOMAIN = "example.com"
    expect(reminderReplyAddress(String(delivery.id))).toContain("@example.com")
    process.env.RESEND_REMINDER_REPLY_TO = "bad\r\n@example.com"
    expect(reminderReplyAddress(String(delivery.id))).toBeNull()
  })
  it("accepts verified aliases only for an accepted original delivery", async () => {
    delivery.accepted_at = new Date().toISOString()
    expect(await processReminderReply(reply(), aliases)).toBe("applied")
    expect(rpcInput.p_delivery_id).toBe(delivery.id)
    expect(rpcInput.p_reason).toBe("verified_scoped_reply")
    expect(JSON.stringify(rpcInput)).not.toContain("alias@example.com")
    expect(await processReminderReply(reply(), { verifiedEmails: async () => ["alias@example.com"] })).toBe("review_required")
    expect(rpcInput.p_reason).toBe("recipient_unverified")
  })
  it("never guesses plus-address or dot aliases", async () => {
    delivery.accepted_at = new Date().toISOString()
    for (const from of ["primary+alias@example.com", "p.rimary@example.com", "attacker@example.com"]) {
      expect(await processReminderReply({ ...reply(), from }, aliases)).toBe("review_required")
    }
  })
  it("requires review for unsigned, multiple, unaccepted, forwarded and ambiguous requests", async () => {
    expect(await processReminderReply(reply(), aliases)).toBe("review_required")
    delivery.accepted_at = new Date().toISOString()
    for (const text of ["Stop all email", "Don't stop reminders", "Could you change this event?", "Forwarded message: stop", "> stop"]) {
      expect(await processReminderReply({ ...reply(), text }, aliases)).toBe("review_required")
    }
    expect(await processReminderReply({ ...reply(), to: ["replies@example.com"] }, aliases)).toBe("review_required")
    expect(await processReminderReply({ ...reply(), to: [reply().to[0], reminderReplyAddress("a".repeat(24))!] }, aliases)).toBe("review_required")
    expect(isExplicitReminderStop("STOP", { "Auto-Submitted": "auto-replied" })).toBe(false)
    expect(isExplicitReminderStop("STOP", { "X-Autoreply": "yes" })).toBe(false)
  })
  it("handles exact invitation recipients and mailto requests without affecting other categories", async () => {
    delivery.recipient_user_id = null
    delivery.accepted_at = new Date().toISOString()
    expect(await processReminderReply({ ...reply(), from: "PRIMARY@example.com", text: null, subject: "unsubscribe" })).toBe("applied")
    expect(await processReminderReply({ ...reply(), from: "alias@example.com" })).toBe("review_required")
    expect(await processReminderReply({ ...reply(), text: "stop" }, { verifiedEmails: async () => [] })).toBe("review_required")
  })
  it("returns a duplicate receipt without re-verifying or re-applying it", async () => {
    receipt = { outcome: "already_suppressed" }
    const lookup = mock(async () => { throw new Error("must not call") })
    expect(await processReminderReply(reply(), { verifiedEmails: lookup })).toBe("already_suppressed")
    expect(lookup).not.toHaveBeenCalled()
  })
  it("fails closed when authorization evidence cannot be read", async () => {
    errorTable = "reminder_reply_audits"
    await expect(processReminderReply(reply(), aliases)).rejects.toThrow("receipt")
    errorTable = "reminder_deliveries"
    await expect(processReminderReply(reply(), aliases)).rejects.toThrow("original")
  })
})

describe("delivery-time cutoff and opt-out enforcement", () => {
  const mail = { to: "primary@example.com", subject: "Your scores", html: "<p>Scores</p>", text: "Scores", idempotencyKey: "stable", reminder: context }
  const execution = { baseDelayMs: 0, wait: async () => {}, providerPacing: { wait: async () => {} } }
  it("persists context and provider acceptance, then finishes retries from the durable receipt", async () => {
    const transport = mock(async () => ({ data: { id: "accepted" }, error: null, headers: null }))
    const first = await sendEmailWithResult(mail, { ...execution, transport })
    expect(first.ok).toBe(true)
    expect(delivery.provider_message_id).toBe("accepted")
    expect((await sendEmailWithResult(mail, { ...execution, transport })).attempts).toBe(0)
    expect(transport).toHaveBeenCalledTimes(1)
  })
  it("rechecks opt-outs between provider retries and records a skipped outcome", async () => {
    const stopped = mock(() => {})
    const transport = mock(async () => { suppressed = true; return { data: null, error: { name: "rate_limit_exceeded", message: "retry", statusCode: 429 }, headers: null } })
    const result = await sendEmailWithResult({ ...mail, reminder: { ...context, onStopped: stopped } }, { ...execution, transport })
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe("email_reminder_stopped")
    expect(transport).toHaveBeenCalledTimes(1)
    expect(stopped).toHaveBeenCalledTimes(1)
    expect(delivery.stop_reason).toBe("recipient_opt_out")
    expect(delivery.accepted_at).toBeNull()
  })
  it("rechecks event cutoffs between provider retries", async () => {
    const transport = mock(async () => { event.ends_at = "2026-01-01T00:00:00Z"; return { data: null, error: { name: "rate_limit_exceeded", message: "retry", statusCode: 429 }, headers: null } })
    const result = await sendEmailWithResult(mail, { ...execution, transport })
    expect(result.error?.code).toBe("email_reminder_stopped")
    expect(transport).toHaveBeenCalledTimes(1)
    expect(delivery.stop_reason).toBe("event_cutoff")
  })
  it("leaves transactional and security messages outside reminder suppression", async () => {
    suppressed = true
    event.ends_at = "2026-01-01T00:00:00Z"
    const transport = mock(async () => ({ data: { id: "transactional" }, error: null, headers: null }))
    const { reminder: _reminder, ...transactional } = mail
    expect((await sendEmailWithResult(transactional, { ...execution, transport })).ok).toBe(true)
    expect(transport).toHaveBeenCalledTimes(1)
  })
  it("rejects mismatched delivery contexts and missing identities", async () => {
    await expect(prepareReminderDelivery(context, "other@example.com", "stable")).rejects.toThrow("does not match")
    await expect(prepareReminderDelivery(context, "", "")).rejects.toThrow("one recipient")
    errorTable = "reminder_deliveries"
    await expect(prepareReminderDelivery(context, "primary@example.com", "stable")).rejects.toThrow("record")
    await expect(acceptReminderDelivery(String(delivery.id), "accepted")).rejects.toThrow("accepted")
  })
  it("rejects expired deadlines, missing events, closed rounds and unavailable evidence", async () => {
    expect(await checkReminderDelivery({ ...context, deadline: "2026-01-01T00:00:00Z" }, delivery as never)).toBe(false)
    expect(delivery.stop_reason).toBe("deadline_passed")
    errorTable = "hackathons"
    await expect(checkReminderDelivery(context, delivery as never)).rejects.toThrow("eligibility")
    errorTable = "judging_rounds"
    await expect(checkReminderDelivery({ ...context, roundId: "round" }, delivery as never)).rejects.toThrow("round")
  })
})

it("stops retries before the provider's idempotency window expires", async () => {
  delivery.created_at = new Date(Date.now() - 23 * 3_600_000).toISOString()
  expect(await checkReminderDelivery(context, delivery as never)).toBe(false)
  expect(delivery.stop_reason).toBe("provider_retry_window_expired")
})

it("returns a safe typed failure without a provider attempt if delivery evidence is unavailable", async () => {
  errorTable = "reminder_deliveries"
  const transport = mock(async () => ({ data: { id: "must-not-send" }, error: null, headers: null }))
  const result = await sendEmailWithResult({ to: "primary@example.com", subject: "Reminder", html: "<p>Reminder</p>", text: "Reminder", idempotencyKey: "stable", reminder: context }, { transport })
  expect(result.error?.code).toBe("email_reminder_unverified")
  expect(result.attempts).toBe(0)
  expect(transport).not.toHaveBeenCalled()
})
