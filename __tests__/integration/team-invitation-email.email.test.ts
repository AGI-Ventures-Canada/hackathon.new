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
}

type SendEmailResult = { id: string } | null

let sendEmailImpl: (input: SendEmailInput) => Promise<SendEmailResult> = () =>
  Promise.resolve({ id: "email_123" })

const mockSendEmail = mock((input: SendEmailInput) => sendEmailImpl(input))

function setSendEmailImplementation(impl: (input: SendEmailInput) => Promise<SendEmailResult>) {
  sendEmailImpl = impl
}

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

const { sendTeamInvitationEmail } = await import("@/lib/email/team-invitations")

const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL

describe("Team Invitation Email", () => {
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

  describe("sendTeamInvitationEmail", () => {
    const validInput = {
      to: "invitee@example.com",
      teamName: "Awesome Team",
      hackathonName: "AI Hackathon 2026",
      inviterName: "John Doe",
      inviteToken: "abc123token",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    }

    it("sends email successfully", async () => {
      const result = await sendTeamInvitationEmail(validInput)

      expect(result.success).toBe(true)
      expect(mockSendEmail).toHaveBeenCalledTimes(1)
    })

    it("passes correct recipient", async () => {
      await sendTeamInvitationEmail(validInput)

      const callArgs = mockSendEmail.mock.calls[0][0]
      expect(callArgs.to).toBe("invitee@example.com")
    })

    it("includes team name in subject", async () => {
      await sendTeamInvitationEmail(validInput)

      const callArgs = mockSendEmail.mock.calls[0][0]
      expect(callArgs.subject).toContain("Awesome Team")
    })

    it("includes hackathon name in subject", async () => {
      await sendTeamInvitationEmail(validInput)

      const callArgs = mockSendEmail.mock.calls[0][0]
      expect(callArgs.subject).toContain("AI Hackathon 2026")
    })

    it("includes accept URL in HTML body", async () => {
      await sendTeamInvitationEmail(validInput)

      const callArgs = mockSendEmail.mock.calls[0][0]
      expect(callArgs.html).toContain("https://example.com/invite/abc123token")
    })

    it("includes accept URL in text body", async () => {
      await sendTeamInvitationEmail(validInput)

      const callArgs = mockSendEmail.mock.calls[0][0]
      expect(callArgs.text).toContain("https://example.com/invite/abc123token")
    })

    it("includes inviter name in body", async () => {
      await sendTeamInvitationEmail(validInput)

      const callArgs = mockSendEmail.mock.calls[0][0]
      expect(callArgs.html).toContain("John Doe")
      expect(callArgs.text).toContain("John Doe")
    })

    it("includes team name in body", async () => {
      await sendTeamInvitationEmail(validInput)

      const callArgs = mockSendEmail.mock.calls[0][0]
      expect(callArgs.html).toContain("Awesome Team")
      expect(callArgs.text).toContain("Awesome Team")
    })

    it("includes hackathon name in body", async () => {
      await sendTeamInvitationEmail(validInput)

      const callArgs = mockSendEmail.mock.calls[0][0]
      expect(callArgs.html).toContain("AI Hackathon 2026")
      expect(callArgs.text).toContain("AI Hackathon 2026")
    })

    it("includes expiry date in body", async () => {
      const fixedDate = new Date("2026-02-20T12:00:00Z")
      await sendTeamInvitationEmail({
        ...validInput,
        expiresAt: fixedDate.toISOString(),
      })

      const callArgs = mockSendEmail.mock.calls[0][0]
      expect(callArgs.html).toContain("February")
      expect(callArgs.text).toContain("February")
    })

    it("adds team_invitation tag", async () => {
      await sendTeamInvitationEmail(validInput)

      const callArgs = mockSendEmail.mock.calls[0][0]
      expect(callArgs.tags).toContainEqual({ name: "type", value: "team_invitation" })
    })

    it("adds hackathon tag", async () => {
      await sendTeamInvitationEmail(validInput)

      const callArgs = mockSendEmail.mock.calls[0][0]
      const hackathonTag = callArgs.tags.find((t: { name: string }) => t.name === "hackathon")
      expect(hackathonTag).toBeDefined()
      expect(hackathonTag.value).toContain("AI_Hackathon_2026")
    })

    it("sanitizes hackathon name for tag", async () => {
      await sendTeamInvitationEmail({
        ...validInput,
        hackathonName: "Special <Characters> & More!",
      })

      const callArgs = mockSendEmail.mock.calls[0][0]
      const hackathonTag = callArgs.tags.find((t: { name: string }) => t.name === "hackathon")
      expect(hackathonTag.value).not.toContain("<")
      expect(hackathonTag.value).not.toContain(">")
      expect(hackathonTag.value).not.toContain("&")
      expect(hackathonTag.value).not.toContain("!")
    })

    it("returns success false when sendEmail returns null", async () => {
      setSendEmailImplementation(() => Promise.resolve(null))

      const result = await sendTeamInvitationEmail(validInput)

      expect(result.success).toBe(false)
    })

    it("truncates long hackathon names in tag", async () => {
      const longName = "A".repeat(150) + " Hackathon"
      await sendTeamInvitationEmail({
        ...validInput,
        hackathonName: longName,
      })

      const callArgs = mockSendEmail.mock.calls[0][0]
      const hackathonTag = callArgs.tags.find((t: { name: string }) => t.name === "hackathon")
      expect(hackathonTag.value.length).toBeLessThanOrEqual(100)
    })

    it("handles consecutive special characters in hackathon name", async () => {
      await sendTeamInvitationEmail({
        ...validInput,
        hackathonName: "Test!!!Hackathon",
      })

      const callArgs = mockSendEmail.mock.calls[0][0]
      const hackathonTag = callArgs.tags.find((t: { name: string }) => t.name === "hackathon")
      expect(hackathonTag.value).not.toContain("__")
    })

    it("includes event dates in HTML when hackathonStartsAt and hackathonEndsAt are provided", async () => {
      await sendTeamInvitationEmail({
        ...validInput,
        hackathonSlug: "ai-hack",
        hackathonStartsAt: "2026-04-20T08:30:00Z",
        hackathonEndsAt: "2026-04-22T17:00:00Z",
      })

      const callArgs = mockSendEmail.mock.calls[0][0]
      expect(callArgs.html).toContain("Apr")
      expect(callArgs.html).toContain("20")
    })

    it("includes team members in HTML when teamMembers are provided", async () => {
      await sendTeamInvitationEmail({
        ...validInput,
        teamMembers: ["Sarah Chen", "Marcus Rivera"],
      })

      const callArgs = mockSendEmail.mock.calls[0][0]
      expect(callArgs.html).toContain("Sarah Chen")
      expect(callArgs.html).toContain("Marcus Rivera")
      expect(callArgs.text).toContain("Sarah Chen")
    })

    it("sets a List-Unsubscribe header for spam-filter compliance", async () => {
      await sendTeamInvitationEmail(validInput)

      const callArgs = mockSendEmail.mock.calls[0][0]
      expect(callArgs.headers).toBeDefined()
      expect(callArgs.headers!["List-Unsubscribe"]).toContain("https://example.com/invite/abc123token")
      expect(callArgs.headers!["List-Unsubscribe"]).toContain("mailto:")
      expect(callArgs.headers!["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click")
    })

    it("includes the inviter name in the subject", async () => {
      await sendTeamInvitationEmail(validInput)

      const callArgs = mockSendEmail.mock.calls[0][0]
      expect(callArgs.subject).toContain("John Doe")
    })
  })
})
