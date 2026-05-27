import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test"

let sendEmailImpl: (input: unknown) => Promise<{ id: string } | null> = () =>
  Promise.resolve({ id: "email_123" })
const mockSendEmail = mock((input: unknown) => sendEmailImpl(input))

mock.module("@/lib/email/resend", () => ({
  sendEmail: mockSendEmail,
}))

const { sendExportReadyEmail, sendExportFailedEmail } = await import(
  "@/lib/email/submission-exports"
)

const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL

const HACKATHON_ID = "11111111-1111-1111-1111-111111111111"
const EXPORT_ID = "22222222-2222-2222-2222-222222222222"

describe("sendExportReadyEmail", () => {
  beforeEach(() => {
    mockSendEmail.mockClear()
    sendEmailImpl = () => Promise.resolve({ id: "email_123" })
    process.env.NEXT_PUBLIC_APP_URL = "https://example.com"
  })

  afterEach(() => {
    if (originalAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL
    else process.env.NEXT_PUBLIC_APP_URL = originalAppUrl
  })

  it("sends a tagged email with download URL and human-readable size", async () => {
    const result = await sendExportReadyEmail({
      to: "alex@example.com",
      recipientName: "Alex",
      hackathonName: "AI Hack 2026",
      hackathonId: HACKATHON_ID,
      hackathonSlug: "ai-hack-2026",
      exportId: EXPORT_ID,
      submissionCount: 42,
      fileSizeBytes: 18_400_000,
      expiresAt: "2026-06-26T00:00:00Z",
    })

    expect(result.success).toBe(true)
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
    const call = mockSendEmail.mock.calls[0]![0] as {
      to: string
      subject: string
      html: string
      text: string
      tags: { name: string; value: string }[]
      replyTo?: string
    }

    expect(call.to).toBe("alex@example.com")
    expect(call.subject).toBe("Your AI Hack 2026 export is ready")
    expect(call.html).toContain(
      `https://example.com/api/dashboard/hackathons/${HACKATHON_ID}/exports/${EXPORT_ID}/download`
    )
    expect(call.html).toContain("17.5 MB")
    expect(call.text).toContain("42")
    expect(call.text).toContain("submissions")
    expect(call.text).toContain("AI Hack 2026")
    expect(call.tags).toContainEqual({
      name: "type",
      value: "submission_export_ready",
    })
    expect(call.tags.some((t) => t.name === "hackathon")).toBe(true)
  })

  it("returns success: false when NEXT_PUBLIC_APP_URL is missing", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL
    const result = await sendExportReadyEmail({
      to: "x@x.com",
      recipientName: null,
      hackathonName: "X",
      hackathonId: HACKATHON_ID,
      hackathonSlug: "x",
      exportId: EXPORT_ID,
      submissionCount: 1,
      fileSizeBytes: 1,
      expiresAt: "2026-12-31T00:00:00Z",
    })
    expect(result.success).toBe(false)
    expect(mockSendEmail).not.toHaveBeenCalled()
  })
})

describe("sendExportFailedEmail", () => {
  beforeEach(() => {
    mockSendEmail.mockClear()
    sendEmailImpl = () => Promise.resolve({ id: "email_123" })
    process.env.NEXT_PUBLIC_APP_URL = "https://example.com"
  })

  afterEach(() => {
    if (originalAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL
    else process.env.NEXT_PUBLIC_APP_URL = originalAppUrl
  })

  it("includes the error message and a retry link to the post-event tab", async () => {
    const result = await sendExportFailedEmail({
      to: "alex@example.com",
      recipientName: "Alex",
      hackathonName: "AI Hack 2026",
      hackathonSlug: "ai-hack-2026",
      errorMessage: "storage quota exceeded",
    })

    expect(result.success).toBe(true)
    const call = mockSendEmail.mock.calls[0]![0] as {
      subject: string
      html: string
      tags: { name: string; value: string }[]
    }

    expect(call.subject).toBe("AI Hack 2026 export didn't finish")
    expect(call.html).toContain("storage quota exceeded")
    expect(call.html).toContain(
      "https://example.com/e/ai-hack-2026/manage?tab=post-event"
    )
    expect(call.tags).toContainEqual({
      name: "type",
      value: "submission_export_failed",
    })
  })
})
