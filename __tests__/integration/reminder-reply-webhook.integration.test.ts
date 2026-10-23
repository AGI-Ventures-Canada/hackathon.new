import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test"

let signed = true
const verify = mock(() => signed)
const processReply = mock(async () => "applied")
const id = "12345678-1234-4234-8234-123456789012"
const originalEnvironment = { ...process.env }
const received = { id, from: "recipient@example.com", to: ["display@example.com"], received_for: ["signed-envelope@example.com"], text: "stop", headers: {} }
const get = mock(async () => ({ data: received, error: null }))
mock.module("@/lib/email/resend", () => ({ verifyResendWebhook: verify, getResendClient: () => ({ emails: { receiving: { get } } }) }))
mock.module("@/lib/services/reminder-replies", () => ({ processReminderReply: processReply }))
const { POST } = await import("@/app/api/public/webhooks/resend/route")
const request = (data: unknown = { type: "email.received", data: { email_id: id } }) => new Request("https://example.com/api/public/webhooks/resend", { method: "POST", headers: { "svix-id": "event", "svix-timestamp": "timestamp", "svix-signature": "signature" }, body: JSON.stringify(data) })
beforeEach(() => {
  process.env.RESEND_API_KEY = "test"
  process.env.RESEND_WEBHOOK_SECRET = "test"
  process.env.API_KEY_SECRET = "test"
  process.env.RESEND_REMINDER_REPLY_TO = "reply@example.com"
  signed = true
  verify.mockClear()
  get.mockClear()
  get.mockImplementation(async () => ({ data: received, error: null }))
  processReply.mockClear()
  processReply.mockImplementation(async () => "applied")
})
afterAll(() => {
  for (const key of ["RESEND_API_KEY", "RESEND_WEBHOOK_SECRET", "API_KEY_SECRET", "RESEND_REMINDER_REPLY_TO"]) {
    if (originalEnvironment[key] === undefined) delete process.env[key]
    else process.env[key] = originalEnvironment[key]
  }
})
describe("signed reminder reply webhook", () => {
  it("fetches the provider's original inbound message and uses its envelope recipient", async () => {
    expect((await POST(request())).status).toBe(200)
    expect(get).toHaveBeenCalledWith(id)
    expect(processReply).toHaveBeenCalledWith({ ...received, to: received.received_for })
    expect(verify).toHaveBeenCalledWith(expect.any(String), { svixId: "event", svixTimestamp: "timestamp", svixSignature: "signature" })
  })
  it("rejects bad signatures before reading provider messages or suppressing anything", async () => {
    signed = false
    expect((await POST(request())).status).toBe(400)
    expect(get).not.toHaveBeenCalled()
    expect(processReply).not.toHaveBeenCalled()
  })
  it("ignores other events and rejects invalid IDs and malformed payloads", async () => {
    expect((await POST(request({ type: "email.delivered" }))).status).toBe(204)
    expect((await POST(request({ type: "email.received", data: { email_id: "bad" } }))).status).toBe(400)
    expect((await POST(new Request("https://example.com", { method: "POST", body: "{" }))).status).toBe(400)
    expect(get).not.toHaveBeenCalled()
  })
  it("fails closed until the webhook and scoped receiving mailbox are configured", async () => {
    delete process.env.RESEND_WEBHOOK_SECRET
    expect((await POST(request())).status).toBe(503)
    expect(processReply).not.toHaveBeenCalled()
  })
  it("bounds payload size", async () => {
    expect((await POST(new Request("https://example.com", { method: "POST", body: "x".repeat(256_001) }))).status).toBe(413)
    expect((await POST(new Request("https://example.com", { method: "POST", headers: { "content-length": "256001" }, body: "{}" }))).status).toBe(413)
  })
  it("returns a retryable failure when processing cannot finish", async () => {
    processReply.mockImplementation(async () => { throw new Error("unavailable") })
    expect((await POST(request())).status).toBe(503)
    expect(processReply).toHaveBeenCalledTimes(1)
  })
})
