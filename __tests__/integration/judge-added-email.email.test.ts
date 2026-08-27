import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test"

type SendEmailInput = {
  to: string | string[]
  subject: string
  html?: string
  text?: string
  from?: string
  replyTo?: string
  tags?: Array<{ name: string; value: string }>
  idempotencyKey?: string
}

type SendEmailResult = { id: string } | null

let sendEmailImpl: (input: SendEmailInput) => Promise<SendEmailResult> = () =>
  Promise.resolve({ id: "email_123" })

const mockSendEmail = mock((input: SendEmailInput) => sendEmailImpl(input))

mock.module("@/lib/email/resend", () => ({
  sendEmail: mockSendEmail,
  getResendClient: mock(() => ({})),
  getReceivedEmail: mock(() => Promise.resolve(null)),
  verifyResendWebhook: mock(() => true),
  sendAgentNotification: mock(() => Promise.resolve({ id: "notif_123" })),
}))

const { sendJudgeAddedNotification } = await import("@/lib/email/judge-invitations")

const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL

describe("Judge Added Notification Email", () => {
  beforeEach(() => {
    mockSendEmail.mockClear()
    sendEmailImpl = () => Promise.resolve({ id: "email_123" })
    process.env.NEXT_PUBLIC_APP_URL = "https://example.com"
  })

  afterEach(() => {
    if (originalAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL
    } else {
      process.env.NEXT_PUBLIC_APP_URL = originalAppUrl
    }
  })

  it("sends notification with event link", async () => {
    const result = await sendJudgeAddedNotification({
      to: "judge@example.com",
      deliveryId: "participant-1",
      hackathonName: "Test Hackathon",
      hackathonSlug: "test-hackathon",
      addedByName: "Jane Organizer",
    })

    expect(result.success).toBe(true)
    expect(mockSendEmail).toHaveBeenCalledTimes(1)

    const call = mockSendEmail.mock.calls[0][0] as SendEmailInput
    expect(call.to).toBe("judge@example.com")
    expect(call.subject).toBe("You're a judge for Test Hackathon")
    expect(call.html).toContain("https://example.com/e/test-hackathon?as=judge")
    expect(call.html).toContain("Jane Organizer")
    expect(call.html).toContain("Test Hackathon")
    expect(call.html).toContain("View Event")
    expect(call.text).toContain("https://example.com/e/test-hackathon?as=judge")
  })

  it("returns failure when NEXT_PUBLIC_APP_URL is not set", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL

    const result = await sendJudgeAddedNotification({
      to: "judge@example.com",
      deliveryId: "participant-1",
      hackathonName: "Test Hackathon",
      hackathonSlug: "test-hackathon",
      addedByName: "Jane Organizer",
    })

    expect(result.success).toBe(false)
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it("returns failure when sendEmail returns null", async () => {
    sendEmailImpl = () => Promise.resolve(null)

    const result = await sendJudgeAddedNotification({
      to: "judge@example.com",
      deliveryId: "participant-1",
      hackathonName: "Test Hackathon",
      hackathonSlug: "test-hackathon",
      addedByName: "Jane Organizer",
    })

    expect(result.success).toBe(false)
  })

  it("escapes HTML in hackathon name and organizer name", async () => {
    await sendJudgeAddedNotification({
      to: "judge@example.com",
      deliveryId: "participant-1",
      hackathonName: "<script>alert('xss')</script>",
      hackathonSlug: "safe-slug",
      addedByName: "<b>Evil</b>",
    })

    const call = mockSendEmail.mock.calls[0][0] as SendEmailInput
    expect(call.html).not.toContain("<script>")
    expect(call.html).not.toContain("<b>Evil</b>")
    expect(call.html).toContain("&lt;script&gt;")
  })

  it("includes correct email tags", async () => {
    await sendJudgeAddedNotification({
      to: "judge@example.com",
      deliveryId: "participant-1",
      hackathonName: "Test Hackathon",
      hackathonSlug: "test-hackathon",
      addedByName: "Organizer",
    })

    const call = mockSendEmail.mock.calls[0][0] as SendEmailInput
    expect(call.tags).toEqual([
      { name: "type", value: "judge_added" },
      { name: "hackathon", value: "Test_Hackathon" },
    ])
    expect(call.idempotencyKey).toMatch(/^judge-added\/participant-1\//)
  })

  it("includes event dates in HTML when hackathonStartsAt and hackathonEndsAt are provided", async () => {
    await sendJudgeAddedNotification({
      to: "judge@example.com",
      deliveryId: "participant-1",
      hackathonName: "Test Hackathon",
      hackathonSlug: "test-hackathon",
      addedByName: "Organizer",
      hackathonStartsAt: "2026-04-20T08:30:00Z",
      hackathonEndsAt: "2026-04-22T17:00:00Z",
    })

    const call = mockSendEmail.mock.calls[0][0] as SendEmailInput
    expect(call.html).toContain("Apr")
    expect(call.html).toContain("20")
  })
})
