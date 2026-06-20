import { describe, it, expect, beforeEach, mock } from "bun:test"

type SendEmailInput = {
  to: string | string[]
  subject: string
  html?: string
  text?: string
  replyTo?: string
  tags?: Array<{ name: string; value: string }>
}

const mockSendEmail = mock((input: SendEmailInput) => Promise.resolve({ id: "email_123", input }))

mock.module("@/lib/email/resend", () => ({
  sendEmail: mockSendEmail,
}))

const { sendSubmissionConfirmationEmail } = await import(
  "@/lib/email/submission-confirmation"
)

describe("Submission confirmation email", () => {
  beforeEach(() => {
    mockSendEmail.mockClear()
    process.env.NEXT_PUBLIC_APP_URL = "https://example.com"
    process.env.RESEND_REPLY_TO_EMAIL = "help@example.com"
  })

  it("sends a confirmation with project + hackathon details", async () => {
    const result = await sendSubmissionConfirmationEmail({
      to: "person@example.com",
      hackathonName: "AI Hackathon",
      hackathonSlug: "ai-hackathon",
      projectTitle: "Neural Recipe Generator",
      teamName: "Neural Navigators",
    })

    expect(result.success).toBe(true)
    expect(mockSendEmail).toHaveBeenCalledTimes(1)

    const callArgs = mockSendEmail.mock.calls[0][0]
    expect(callArgs.to).toBe("person@example.com")
    expect(callArgs.subject).toBe("We got your project for AI Hackathon")
    expect(callArgs.html).toContain("Neural Recipe Generator")
    expect(callArgs.html).toContain("AI Hackathon")
    expect(callArgs.html).toContain("Neural Navigators")
    expect(callArgs.text).toContain("Neural Recipe Generator")
    expect(callArgs.text).toContain("AI Hackathon")
    expect(callArgs.replyTo).toBe("help@example.com")
    expect(callArgs.tags).toContainEqual({
      name: "type",
      value: "submission_confirmation",
    })
    expect(callArgs.tags).toContainEqual({
      name: "hackathon",
      value: "AI_Hackathon",
    })
  })

  it("omits the team line for solo submissions", async () => {
    await sendSubmissionConfirmationEmail({
      to: "solo@example.com",
      hackathonName: "Solo Hack",
      hackathonSlug: "solo-hack",
      projectTitle: "My Solo Project",
    })

    const callArgs = mockSendEmail.mock.calls[0][0]
    expect(callArgs.text).not.toContain("team")
    expect(callArgs.text).toContain("You're all set")
  })

  it("returns success=false when resend returns null", async () => {
    mockSendEmail.mockImplementationOnce(() => Promise.resolve(null))

    const result = await sendSubmissionConfirmationEmail({
      to: "person@example.com",
      hackathonName: "AI Hackathon",
      hackathonSlug: "ai-hackathon",
      projectTitle: "Neural Recipe Generator",
    })

    expect(result.success).toBe(false)
  })
})
