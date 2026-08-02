import { describe, it, expect, beforeEach, mock } from "bun:test"

const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL

let sendEmailImpl: (input: unknown) => Promise<{ id: string } | null> = () =>
  Promise.resolve({ id: "email_123" })
const mockSendEmail = mock((input: unknown) => sendEmailImpl(input))

mock.module("@/lib/email/resend", () => ({
  sendEmail: mockSendEmail,
}))

const { sendPrizeShippedEmail } = await import("@/lib/email/prize-shipped")

describe("sendPrizeShippedEmail", () => {
  beforeEach(() => {
    mockSendEmail.mockClear()
    sendEmailImpl = () => Promise.resolve({ id: "email_123" })
    process.env.NEXT_PUBLIC_APP_URL = "https://test.hackathon.new"
  })

  afterEach(() => {
    if (originalAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL
    } else {
      process.env.NEXT_PUBLIC_APP_URL = originalAppUrl
    }
  })

  it("sends email with tracking number", async () => {
    const result = await sendPrizeShippedEmail({
      recipientEmail: "alice@test.com",
      recipientName: "Alice",
      prizeName: "Best Demo",
      hackathonName: "Test Hackathon",
      trackingNumber: "1Z999AA10123456784",
    })

    expect(result).toBe(true)
    expect(mockSendEmail).toHaveBeenCalledTimes(1)

    const call = mockSendEmail.mock.calls[0]![0] as Record<string, unknown>
    expect(call.to).toBe("alice@test.com")
    expect(call.subject).toContain("on its way")
    expect((call.html as string)).toContain("1Z999AA10123456784")
    expect((call.text as string)).toContain("1Z999AA10123456784")
  })

  it("sends email without tracking number", async () => {
    const result = await sendPrizeShippedEmail({
      recipientEmail: "bob@test.com",
      recipientName: "Bob",
      prizeName: "API Credits",
      hackathonName: "Hack Day",
      trackingNumber: null,
    })

    expect(result).toBe(true)
    expect(mockSendEmail).toHaveBeenCalledTimes(1)

    const call = mockSendEmail.mock.calls[0]![0] as Record<string, unknown>
    expect((call.html as string)).not.toContain("Tracking number")
  })

  it("returns false when sendEmail fails", async () => {
    sendEmailImpl = () => Promise.resolve(null)

    const result = await sendPrizeShippedEmail({
      recipientEmail: "fail@test.com",
      recipientName: "Fail",
      prizeName: "Prize",
      hackathonName: "Hack",
      trackingNumber: null,
    })

    expect(result).toBe(false)
  })
})
