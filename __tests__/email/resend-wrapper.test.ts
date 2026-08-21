import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test"

const originalApiKey = process.env.RESEND_API_KEY
const originalFrom = process.env.RESEND_FROM_EMAIL
const mockResendSend = mock(() => Promise.resolve({ data: { id: "resend_123" }, error: null }))

mock.module("resend", () => ({
  Resend: class {
    emails = { send: mockResendSend }
    webhooks = { verify: mock(() => true) }
  },
}))

const { sendEmail } = await import("@/lib/email/resend")

describe("sendEmail idempotency", () => {
  beforeEach(() => {
    mockResendSend.mockClear()
    mockResendSend.mockImplementation(() => Promise.resolve({ data: { id: "resend_123" }, error: null }))
    process.env.RESEND_API_KEY = "re_test"
    process.env.RESEND_FROM_EMAIL = "noreply@getoatmeal.com"
  })

  afterAll(() => {
    if (originalApiKey === undefined) delete process.env.RESEND_API_KEY
    else process.env.RESEND_API_KEY = originalApiKey
    if (originalFrom === undefined) delete process.env.RESEND_FROM_EMAIL
    else process.env.RESEND_FROM_EMAIL = originalFrom
  })

  it("passes the idempotency key to the Resend SDK", async () => {
    const result = await sendEmail({
      to: "invitee@example.com",
      subject: "You were invited",
      html: "<p>Open your invitation.</p>",
      idempotencyKey: "clerk-email/clerk_email_123",
    })

    expect(result).toEqual({ id: "resend_123" })
    expect(mockResendSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "noreply@getoatmeal.com",
        to: "invitee@example.com",
        subject: "You were invited",
      }),
      { idempotencyKey: "clerk-email/clerk_email_123" }
    )
  })
})
