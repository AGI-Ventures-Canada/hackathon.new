import { beforeEach, describe, expect, it, mock } from "bun:test"

type SendEmailInput = {
  to: string | string[]
  subject: string
  html?: string
  text?: string
  replyTo?: string
  headers?: Record<string, string>
  tags?: Array<{ name: string; value: string }>
  idempotencyKey?: string
}

const mockSendEmail = mock((input: SendEmailInput) =>
  Promise.resolve({ id: "email_123", input })
)

mock.module("@/lib/email/resend", () => ({ sendEmail: mockSendEmail }))

const { sendRegistrationConfirmationEmail } = await import(
  "@/lib/email/registration-confirmation"
)

describe("registration confirmation email", () => {
  beforeEach(() => {
    mockSendEmail.mockClear()
    process.env.NEXT_PUBLIC_APP_URL = "https://example.com"
    process.env.RESEND_REPLY_TO_EMAIL = "help@example.com"
  })

  it("sends accessible HTML and text with stable delivery metadata", async () => {
    const result = await sendRegistrationConfirmationEmail({
      notificationId: "notification_1",
      to: "person@example.com",
      hackathonName: "AI Hackathon",
      hackathonSlug: "ai-hackathon",
    })

    expect(result.success).toBe(true)
    const input = mockSendEmail.mock.calls[0][0]
    expect(input.subject).toBe("You're registered for AI Hackathon")
    expect(input.html).toContain("You&#x27;re registered")
    expect(input.text).toContain("You're registered")
    expect(input.text).toContain("https://example.com/e/ai-hackathon")
    expect(input.replyTo).toBe("help@example.com")
    expect(input.headers).toBeDefined()
    expect(input.tags).toContainEqual({
      name: "type",
      value: "registration_confirmation",
    })
    expect(input.idempotencyKey).toBe(
      "registration-confirmation/notification_1"
    )
  })

  it("leaves the queue pending when the provider rejects the email", async () => {
    mockSendEmail.mockImplementationOnce(() => Promise.resolve(null))

    const result = await sendRegistrationConfirmationEmail({
      notificationId: "notification_1",
      to: "person@example.com",
      hackathonName: "AI Hackathon",
      hackathonSlug: "ai-hackathon",
    })

    expect(result.success).toBe(false)
  })
})
