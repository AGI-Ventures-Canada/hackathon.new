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

const { sendJudgeInvitationEmail, sendJudgeInvitationReminderEmail } = await import("@/lib/email/judge-invitations")

const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL
const originalReplyTo = process.env.RESEND_REPLY_TO_EMAIL

describe("Judge Invitation Reminder Email", () => {
  beforeEach(() => {
    resetMocks()
    process.env.NEXT_PUBLIC_APP_URL = "https://example.com"
    process.env.RESEND_REPLY_TO_EMAIL = "Judging help <judging@example.com>"
  })

  afterEach(() => {
    if (originalAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL
    } else {
      process.env.NEXT_PUBLIC_APP_URL = originalAppUrl
    }
    if (originalReplyTo === undefined) delete process.env.RESEND_REPLY_TO_EMAIL
    else process.env.RESEND_REPLY_TO_EMAIL = originalReplyTo
  })

  describe("sendJudgeInvitationReminderEmail", () => {
    const validInput = {
      to: "judge@example.com",
      hackathonName: "AI Hackathon 2026",
      inviterName: "Jordan Lee",
      inviteToken: "xyz789token",
      expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      hackathonSlug: "ai-hackathon-2026",
      hackathonStartsAt: "2026-04-20T08:30:00Z",
      hackathonEndsAt: "2026-04-22T17:00:00Z",
      hackathonTimezone: "America/Toronto",
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

    it("keeps every urgency subject under 60 characters", async () => {
      for (const urgency of ["low", "medium", "high"] as const) {
        mockSendEmail.mockClear()
        await sendJudgeInvitationReminderEmail({
          ...validInput,
          hackathonName: "Healthcare Builders | A Very Long Partner Event Name",
          urgency,
        })
        const subject = mockSendEmail.mock.calls[0][0].subject
        expect(subject.length).toBeLessThanOrEqual(60)
        expect(subject).not.toContain("|")
      }
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

    it("includes the exact event time, timezone, and next step", async () => {
      await sendJudgeInvitationReminderEmail(validInput)

      const callArgs = mockSendEmail.mock.calls[0][0]
      expect(callArgs.text).toContain("4:30 AM EDT")
      expect(callArgs.text).toContain("1:00 PM EDT")
      expect(callArgs.text).toContain("Accept now")
      expect(callArgs.text).toContain("https://example.com/e/ai-hackathon-2026/judge")
    })

    it("includes inviter name in body", async () => {
      await sendJudgeInvitationReminderEmail(validInput)

      const callArgs = mockSendEmail.mock.calls[0][0]
      expect(callArgs.html).toContain("Jordan Lee")
      expect(callArgs.text).toContain("Jordan Lee")
    })

    it("adds judge_invitation_reminder tag", async () => {
      await sendJudgeInvitationReminderEmail(validInput)

      const callArgs = mockSendEmail.mock.calls[0][0]
      expect(callArgs.tags).toContainEqual({ name: "type", value: "judge_invitation_reminder" })
    })

    it("uses a scheduled reminder delivery ID as the idempotency key", async () => {
      await sendJudgeInvitationReminderEmail({
        ...validInput,
        deliveryId: "scheduled-reminder-2",
      })

      expect(mockSendEmail.mock.calls[0][0].idempotencyKey).toBe(
        "judge-invitation-reminder/scheduled-reminder-2"
      )
    })

    it("uses the judge invitation token as a stable idempotency key", async () => {
      await sendJudgeInvitationEmail(validInput)

      expect(mockSendEmail.mock.calls[0][0].idempotencyKey).toBe(
        "judge-invitation/xyz789token"
      )
    })

    it("uses a clear inviter subject and direct judging event link", async () => {
      await sendJudgeInvitationEmail(validInput)

      const callArgs = mockSendEmail.mock.calls[0][0]
      expect(callArgs.subject).toContain("Jordan Lee invited you to judge")
      expect(callArgs.subject.length).toBeLessThanOrEqual(60)
      expect(callArgs.text).toContain("https://example.com/e/ai-hackathon-2026/judge")
      expect(callArgs.text).toContain("straight to your judging page")
    })

    it("includes the organizer's personal message as text, without rendering its HTML", async () => {
      await sendJudgeInvitationEmail({ ...validInput, personalMessage: "Please review accessibility. <script>alert('hi')</script>" })
      const callArgs = mockSendEmail.mock.calls[0][0]
      expect(callArgs.text).toContain("Please review accessibility.")
      expect(callArgs.html).toContain("&lt;script&gt;")
      expect(callArgs.html).not.toContain("<script>")
    })

    it("offers the same token-scoped one-click unsubscribe on invites and reminders", async () => {
      for (const send of [sendJudgeInvitationEmail, sendJudgeInvitationReminderEmail]) {
        mockSendEmail.mockClear()
        await send(validInput)
        const callArgs = mockSendEmail.mock.calls[0][0]
        expect(callArgs.headers?.["List-Unsubscribe"]).toContain("<https://example.com/api/public/judge-invitations/xyz789token/unsubscribe>")
        expect(callArgs.headers?.["List-Unsubscribe"]).toContain("<mailto:judging@example.com?subject=unsubscribe>")
        expect(callArgs.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click")
        expect(callArgs.replyTo).toBe("judging@example.com")
      }
    })

    it("shows both clock offsets when judging crosses the fall clock change", async () => {
      await sendJudgeInvitationEmail({ ...validInput, hackathonStartsAt: "2026-11-01T05:30:00Z", hackathonEndsAt: "2026-11-01T07:30:00Z" })
      const callArgs = mockSendEmail.mock.calls[0][0]
      expect(callArgs.text).toContain("1:30 AM EDT")
      expect(callArgs.text).toContain("2:30 AM EST")
      expect(callArgs.text).toContain("Schedule:")
    })

    it("keeps invitation dates in one truthful event timezone", async () => {
      const boundaryInput = {
        ...validInput,
        hackathonStartsAt: "2026-04-20T01:30:00Z",
        hackathonEndsAt: "2026-04-20T03:00:00Z",
      }

      await sendJudgeInvitationEmail(boundaryInput)
      const invite = mockSendEmail.mock.calls[0][0]
      expect(invite.text).toContain("Sunday, April 19, 2026 at 9:30 PM EDT")
      expect(invite.text).not.toContain("Monday, April 20")
      expect(invite.text).not.toContain("Apr 20")

      mockSendEmail.mockClear()
      await sendJudgeInvitationReminderEmail(boundaryInput)
      const reminder = mockSendEmail.mock.calls[0][0]
      expect(reminder.text).toContain("Sunday, April 19, 2026 at 9:30 PM EDT")
      expect(reminder.text).not.toContain("Monday, April 20")
      expect(reminder.text).not.toContain("Apr 20")
    })

    it("returns success false when sendEmail returns null", async () => {
      sendEmailImpl = () => Promise.resolve(null)

      const result = await sendJudgeInvitationReminderEmail(validInput)

      expect(result.success).toBe(false)
      expect((await sendJudgeInvitationEmail(validInput)).success).toBe(false)
    })

    it("returns success false when NEXT_PUBLIC_APP_URL is not set", async () => {
      delete process.env.NEXT_PUBLIC_APP_URL

      const result = await sendJudgeInvitationReminderEmail(validInput)

      expect(result.success).toBe(false)
      expect(mockSendEmail).not.toHaveBeenCalled()
    })
  })

})
