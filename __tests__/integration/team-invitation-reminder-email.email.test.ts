import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test"

type SendEmailInput = {
  to: string | string[]
  subject: string
  html?: string
  text?: string
  from?: string
  replyTo?: string
  headers?: Record<string, string>
  tags?: Array<{ name: string; value: string }>
  idempotencyKey?: string
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

const { sendTeamInvitationReminderEmail } = await import("@/lib/email/team-invitations")

const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL
const originalFromEmail = process.env.RESEND_FROM_EMAIL

describe("Team Invitation Reminder Email", () => {
  beforeEach(() => {
    resetMocks()
    process.env.NEXT_PUBLIC_APP_URL = "https://example.com"
    process.env.RESEND_FROM_EMAIL = "noreply@hackathon.new"
  })

  afterEach(() => {
    if (originalAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL
    } else {
      process.env.NEXT_PUBLIC_APP_URL = originalAppUrl
    }
    if (originalFromEmail === undefined) {
      delete process.env.RESEND_FROM_EMAIL
    } else {
      process.env.RESEND_FROM_EMAIL = originalFromEmail
    }
  })

  describe("sendTeamInvitationReminderEmail", () => {
    const validInput = {
      to: "invitee@example.com",
      teamName: "Awesome Team",
      hackathonName: "AI Hackathon 2026",
      inviterName: "John Doe",
      inviteToken: "abc123token",
      expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    }

    it("sends email successfully", async () => {
      const result = await sendTeamInvitationReminderEmail(validInput)

      expect(result.success).toBe(true)
      expect(mockSendEmail).toHaveBeenCalledTimes(1)
    })

    it("passes correct recipient", async () => {
      await sendTeamInvitationReminderEmail(validInput)

      const callArgs = mockSendEmail.mock.calls[0][0]
      expect(callArgs.to).toBe("invitee@example.com")
    })

    it("includes Reminder in subject", async () => {
      await sendTeamInvitationReminderEmail(validInput)

      const callArgs = mockSendEmail.mock.calls[0][0]
      expect(callArgs.subject).toContain("Reminder")
    })

    it("includes team name in subject", async () => {
      await sendTeamInvitationReminderEmail(validInput)

      const callArgs = mockSendEmail.mock.calls[0][0]
      expect(callArgs.subject).toContain("Awesome Team")
    })

    it("includes accept URL in HTML body", async () => {
      await sendTeamInvitationReminderEmail(validInput)

      const callArgs = mockSendEmail.mock.calls[0][0]
      expect(callArgs.html).toContain("https://example.com/invite/abc123token")
    })

    it("includes time left in body", async () => {
      await sendTeamInvitationReminderEmail(validInput)

      const callArgs = mockSendEmail.mock.calls[0][0]
      expect(callArgs.html).toContain("left")
      expect(callArgs.text).toContain("left")
    })

    it("includes inviter name in body", async () => {
      await sendTeamInvitationReminderEmail(validInput)

      const callArgs = mockSendEmail.mock.calls[0][0]
      expect(callArgs.html).toContain("John Doe")
      expect(callArgs.text).toContain("John Doe")
    })

    it("includes team name in body", async () => {
      await sendTeamInvitationReminderEmail(validInput)

      const callArgs = mockSendEmail.mock.calls[0][0]
      expect(callArgs.html).toContain("Awesome Team")
      expect(callArgs.text).toContain("Awesome Team")
    })

    it("adds team_invitation_reminder tag", async () => {
      await sendTeamInvitationReminderEmail(validInput)

      const callArgs = mockSendEmail.mock.calls[0][0]
      expect(callArgs.tags).toContainEqual({ name: "type", value: "team_invitation_reminder" })
    })

    it("uses a scheduled reminder delivery ID as the idempotency key", async () => {
      await sendTeamInvitationReminderEmail({
        ...validInput,
        deliveryId: "scheduled-reminder-1",
      })

      expect(mockSendEmail.mock.calls[0][0].idempotencyKey).toBe(
        "team-invitation-reminder/scheduled-reminder-1"
      )
    })

    it("returns success false when sendEmail returns null", async () => {
      sendEmailImpl = () => Promise.resolve(null)

      const result = await sendTeamInvitationReminderEmail(validInput)

      expect(result.success).toBe(false)
    })

    it("returns success false when NEXT_PUBLIC_APP_URL is not set", async () => {
      delete process.env.NEXT_PUBLIC_APP_URL

      const result = await sendTeamInvitationReminderEmail(validInput)

      expect(result.success).toBe(false)
      expect(mockSendEmail).not.toHaveBeenCalled()
    })

    it("sets a List-Unsubscribe header pointing at the unsubscribe endpoint", async () => {
      await sendTeamInvitationReminderEmail(validInput)

      const callArgs = mockSendEmail.mock.calls[0][0]
      expect(callArgs.headers).toBeDefined()
      expect(callArgs.headers!["List-Unsubscribe"]).toContain(
        "https://example.com/api/public/invitations/abc123token/unsubscribe"
      )
      expect(callArgs.headers!["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click")
    })

    it("personalizes the from address with the inviter name", async () => {
      await sendTeamInvitationReminderEmail(validInput)

      const callArgs = mockSendEmail.mock.calls[0][0]
      expect(callArgs.from).toBe('"John Doe via hackathon.new" <noreply@hackathon.new>')
    })

    it("sets replyTo to the inviter email when provided", async () => {
      await sendTeamInvitationReminderEmail({
        ...validInput,
        inviterEmail: "captain@example.com",
      })

      const callArgs = mockSendEmail.mock.calls[0][0]
      expect(callArgs.replyTo).toBe("captain@example.com")
    })
  })
})
