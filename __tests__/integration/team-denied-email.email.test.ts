import { describe, it, expect, beforeEach, mock } from "bun:test"

type SendEmailInput = {
  to: string | string[]
  subject: string
  html?: string
  text?: string
  replyTo?: string
  tags?: Array<{ name: string; value: string }>
  idempotencyKey?: string
}

const mockSendEmail = mock((input: SendEmailInput) => Promise.resolve({ id: "email_123", input }))

mock.module("@/lib/email/resend", () => ({
  sendEmail: mockSendEmail,
}))

const { sendTeamApprovedEmail, sendTeamDeniedEmail } = await import("@/lib/email/team-review")

describe("Team review email", () => {
  beforeEach(() => {
    mockSendEmail.mockClear()
    process.env.NEXT_PUBLIC_APP_URL = "https://example.com"
    process.env.RESEND_REPLY_TO_EMAIL = "help@example.com"
  })

  it("sends a clear team approval email", async () => {
    const result = await sendTeamApprovedEmail({
      to: "person@example.com",
      teamId: "team_123",
      teamName: "Awesome Team",
      hackathonName: "AI Hackathon",
      hackathonSlug: "ai-hackathon",
    })

    expect(result.success).toBe(true)
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
    const callArgs = mockSendEmail.mock.calls[0][0]
    expect(callArgs.to).toBe("person@example.com")
    expect(callArgs.subject).toBe("Your team was approved for AI Hackathon")
    expect(callArgs.html).toContain("Awesome Team")
    expect(callArgs.text).toContain("ready to keep working")
    expect(callArgs.replyTo).toBe("help@example.com")
    expect(callArgs.tags).toContainEqual({ name: "type", value: "team_approved" })
    expect(callArgs.idempotencyKey).toMatch(/^team-review\/team_123\/approved\//)
  })

  it("sends a clear team denial email", async () => {
    const result = await sendTeamDeniedEmail({
      to: "person@example.com",
      teamId: "team_123",
      teamName: "Awesome Team",
      hackathonName: "AI Hackathon",
      hackathonSlug: "ai-hackathon",
    })

    expect(result.success).toBe(true)
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
    const callArgs = mockSendEmail.mock.calls[0][0]
    expect(callArgs.to).toBe("person@example.com")
    expect(callArgs.subject).toBe("Your team wasn't approved for AI Hackathon")
    expect(callArgs.html).toContain("Awesome Team")
    expect(callArgs.text).toContain("join another team")
    expect(callArgs.replyTo).toBe("help@example.com")
    expect(callArgs.tags).toContainEqual({ name: "type", value: "team_denied" })
    expect(callArgs.idempotencyKey).toMatch(/^team-review\/team_123\/denied\//)
  })
})
