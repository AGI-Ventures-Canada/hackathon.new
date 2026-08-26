import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test"
import type { EmailJSON } from "@clerk/nextjs/server"

const originalFrom = process.env.RESEND_FROM_EMAIL
const originalReplyTo = process.env.RESEND_REPLY_TO_EMAIL
const mockSendEmail = mock((_input: unknown) => Promise.resolve<{ id: string } | null>({ id: "email_123" }))

mock.module("@/lib/email/resend", () => ({
  sendEmail: mockSendEmail,
}))

const { forwardClerkEmail } = await import("@/lib/email/clerk-emails")

function buildEmail(overrides: Partial<EmailJSON> = {}): EmailJSON {
  return {
    id: "clerk_email_123",
    object: "email",
    slug: "organization_invitation",
    from_email_name: "notifications",
    to_email_address: "invitee@example.com",
    email_address_id: null,
    subject: "You were invited to AGI House SF",
    body: "<p>Open your invitation.</p>",
    body_plain: "Open your invitation.",
    delivered_by_clerk: false,
    ...overrides,
  }
}

describe("forwardClerkEmail", () => {
  beforeEach(() => {
    mockSendEmail.mockClear()
    mockSendEmail.mockImplementation(() => Promise.resolve({ id: "email_123" }))
    process.env.RESEND_FROM_EMAIL = "Oatmeal <noreply@getoatmeal.com>"
    process.env.RESEND_REPLY_TO_EMAIL = "support@getoatmeal.com"
  })

  afterAll(() => {
    if (originalFrom === undefined) delete process.env.RESEND_FROM_EMAIL
    else process.env.RESEND_FROM_EMAIL = originalFrom
    if (originalReplyTo === undefined) delete process.env.RESEND_REPLY_TO_EMAIL
    else process.env.RESEND_REPLY_TO_EMAIL = originalReplyTo
  })

  it("forwards a self-delivered Clerk email through the shared Resend sender", async () => {
    const result = await forwardClerkEmail(buildEmail())

    expect(result).toEqual({ status: "sent", emailId: "email_123" })
    expect(mockSendEmail).toHaveBeenCalledWith({
      to: "invitee@example.com",
      subject: "You were invited to AGI House SF",
      html: "<p>Open your invitation.</p>",
      text: "Open your invitation.",
      replyTo: "support@getoatmeal.com",
      headers: {
        "List-Unsubscribe": "<mailto:support@getoatmeal.com?subject=unsubscribe>",
      },
      tags: [
        { name: "type", value: "organization_invitation" },
        { name: "source", value: "clerk" },
      ],
      idempotencyKey: "clerk-email/clerk_email_123",
    })
  })

  it("builds plain text when Clerk only provides HTML", async () => {
    await forwardClerkEmail(buildEmail({ body_plain: null, body: "<p>Hello <strong>there</strong></p>" }))

    expect(mockSendEmail.mock.calls[0]?.[0]).toMatchObject({ text: "Hello there" })
  })

  it("forwards a text-only Clerk email", async () => {
    const result = await forwardClerkEmail(buildEmail({ body: undefined, body_plain: "Open your invitation." }))

    expect(result).toEqual({ status: "sent", emailId: "email_123" })
    expect(mockSendEmail.mock.calls[0]?.[0]).toMatchObject({
      html: "<p>Open your invitation.</p>",
      text: "Open your invitation.",
    })
  })

  it("escapes text-only Clerk bodies when creating HTML", async () => {
    await forwardClerkEmail(buildEmail({
      body: undefined,
      body_plain: "Use <this> & that\nThen continue.",
    }))

    expect(mockSendEmail.mock.calls[0]?.[0]).toMatchObject({
      html: "<p>Use &lt;this&gt; &amp; that<br />Then continue.</p>",
      text: "Use <this> & that\nThen continue.",
    })
  })

  it("does not duplicate an email already delivered by Clerk", async () => {
    const result = await forwardClerkEmail(buildEmail({ delivered_by_clerk: true }))

    expect(result).toEqual({ status: "skipped", reason: "delivered_by_clerk" })
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it("rejects incomplete Clerk email payloads", async () => {
    expect(await forwardClerkEmail(buildEmail({ id: "" }))).toEqual({
      status: "invalid",
      reason: "missing_id",
    })
    expect(await forwardClerkEmail(buildEmail({ to_email_address: undefined }))).toEqual({
      status: "invalid",
      reason: "missing_recipient",
    })
    expect(await forwardClerkEmail(buildEmail({ subject: undefined }))).toEqual({
      status: "invalid",
      reason: "missing_subject",
    })
    expect(await forwardClerkEmail(buildEmail({ body: undefined, body_plain: null }))).toEqual({
      status: "invalid",
      reason: "missing_body",
    })
    expect(await forwardClerkEmail(buildEmail({ body: " ", body_plain: " " }))).toEqual({
      status: "invalid",
      reason: "missing_body",
    })
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it("reports a retryable failure when Resend does not accept the email", async () => {
    mockSendEmail.mockImplementation(() => Promise.resolve(null))

    expect(await forwardClerkEmail(buildEmail())).toEqual({ status: "failed" })
  })
})
