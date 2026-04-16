import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test"

type SendEmailInput = {
  to: string | string[]
  subject: string
  html?: string
  text?: string
  from?: string
  replyTo?: string
  tags?: Array<{ name: string; value: string }>
}

type SendEmailResult = { id: string } | null

let sendEmailImpl: (input: SendEmailInput) => Promise<SendEmailResult> = () =>
  Promise.resolve({ id: "email_123" })

const mockSendEmail = mock((input: SendEmailInput) => sendEmailImpl(input))

function resetMocks() {
  mockSendEmail.mockClear()
  sendEmailImpl = () => Promise.resolve({ id: "email_123" })
}

mock.module("@/lib/email/resend", () => ({
  sendEmail: mockSendEmail,
  getResendClient: mock(() => ({})),
  getReceivedEmail: mock(() => Promise.resolve(null)),
  verifyResendWebhook: mock(() => true),
  sendAgentNotification: mock(() => Promise.resolve({ id: "notif_123" })),
}))

const { sendJudgeInvitationReminderEmail } = await import("@/lib/email/judge-invitations")

const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL

describe("Judge Invitation Reminder Email", () => {
  beforeEach(() => {
    resetMocks()
    process.env.NEXT_PUBLIC_APP_URL = "https://example.com"
  })

  afterEach(() => {
    if (originalAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL
    } else {
      process.env.NEXT_PUBLIC_APP_URL = originalAppUrl
    }
  })

  describe("sendJudgeInvitationReminderEmail", () => {
    const validInput = {
      to: "judge@example.com",
      hackathonName: "AI Hackathon 2026",
      inviterName: "Alex Ivany",
      inviteToken: "xyz789token",
      expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    }

    it("sends email successfully", async () => {
      const result = await sendJudgeInvitationReminderEmail(validInput)

      expect(result.success).toBe(true)
      expect(mockSendEmail).toHaveBeenCalledTimes(1)
    })

    it("passes correct recipient", async () => {
      await sendJudgeInvitationReminderEmail(validInput)

      const callArgs = mockSendEmail.mock.calls[0][0]
      expect(callArgs.to).toBe("judge@example.com")
    })

    it("includes Reminder in subject", async () => {
      await sendJudgeInvitationReminderEmail(validInput)

      const callArgs = mockSendEmail.mock.calls[0][0]
      expect(callArgs.subject).toContain("Reminder")
    })

    it("includes hackathon name in subject", async () => {
      await sendJudgeInvitationReminderEmail(validInput)

      const callArgs = mockSendEmail.mock.calls[0][0]
      expect(callArgs.subject).toContain("AI Hackathon 2026")
    })

    it("includes accept URL with judge-invite path", async () => {
      await sendJudgeInvitationReminderEmail(validInput)

      const callArgs = mockSendEmail.mock.calls[0][0]
      expect(callArgs.html).toContain("https://example.com/judge-invite/xyz789token")
    })

    it("includes time left in body", async () => {
      await sendJudgeInvitationReminderEmail(validInput)

      const callArgs = mockSendEmail.mock.calls[0][0]
      expect(callArgs.html).toContain("left")
      expect(callArgs.text).toContain("left")
    })

    it("includes inviter name in body", async () => {
      await sendJudgeInvitationReminderEmail(validInput)

      const callArgs = mockSendEmail.mock.calls[0][0]
      expect(callArgs.html).toContain("Alex Ivany")
      expect(callArgs.text).toContain("Alex Ivany")
    })

    it("adds judge_invitation_reminder tag", async () => {
      await sendJudgeInvitationReminderEmail(validInput)

      const callArgs = mockSendEmail.mock.calls[0][0]
      expect(callArgs.tags).toContainEqual({ name: "type", value: "judge_invitation_reminder" })
    })

    it("returns success false when sendEmail returns null", async () => {
      sendEmailImpl = () => Promise.resolve(null)

      const result = await sendJudgeInvitationReminderEmail(validInput)

      expect(result.success).toBe(false)
    })

    it("returns success false when NEXT_PUBLIC_APP_URL is not set", async () => {
      delete process.env.NEXT_PUBLIC_APP_URL

      const result = await sendJudgeInvitationReminderEmail(validInput)

      expect(result.success).toBe(false)
      expect(mockSendEmail).not.toHaveBeenCalled()
    })
  })
})
