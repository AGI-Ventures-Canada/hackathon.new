import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test"
import { NextRequest } from "next/server"

const originalSigningSecret = process.env.CLERK_WEBHOOK_SIGNING_SECRET
let verifyWebhookImpl = (_request: Request, _options?: { signingSecret?: string }) =>
  Promise.resolve<unknown>({ type: "user.created", data: { id: "user_123" } })
let forwardClerkEmailImpl = (_email: unknown) =>
  Promise.resolve<unknown>({ status: "sent", emailId: "resend_123" })
const mockVerifyWebhook = mock((request: Request, options?: { signingSecret?: string }) =>
  verifyWebhookImpl(request, options)
)
const mockForwardClerkEmail = mock((email: unknown) => forwardClerkEmailImpl(email))

mock.module("@clerk/nextjs/webhooks", () => ({
  verifyWebhook: mockVerifyWebhook,
}))

mock.module("@/lib/email/clerk-emails", () => ({
  forwardClerkEmail: mockForwardClerkEmail,
}))

const { POST } = await import("@/app/api/webhooks/clerk/route")

function webhookRequest(): NextRequest {
  return new NextRequest("http://localhost/api/webhooks/clerk", {
    method: "POST",
    body: "{}",
  })
}

function emailEvent() {
  return {
    type: "email.created",
    data: { id: "clerk_email_123", slug: "organization_invitation" },
  }
}

describe("POST /api/webhooks/clerk", () => {
  beforeEach(() => {
    process.env.CLERK_WEBHOOK_SIGNING_SECRET = "whsec_test"
    mockVerifyWebhook.mockClear()
    mockForwardClerkEmail.mockClear()
    verifyWebhookImpl = () => Promise.resolve(emailEvent())
    forwardClerkEmailImpl = () => Promise.resolve({ status: "sent", emailId: "resend_123" })
  })

  afterAll(() => {
    if (originalSigningSecret === undefined) delete process.env.CLERK_WEBHOOK_SIGNING_SECRET
    else process.env.CLERK_WEBHOOK_SIGNING_SECRET = originalSigningSecret
  })

  it("fails closed when the signing secret is missing", async () => {
    delete process.env.CLERK_WEBHOOK_SIGNING_SECRET

    const response = await POST(webhookRequest())

    expect(response.status).toBe(500)
    expect(mockVerifyWebhook).not.toHaveBeenCalled()
  })

  it("rejects a webhook with an invalid signature", async () => {
    verifyWebhookImpl = () => Promise.reject(new Error("bad signature"))

    const response = await POST(webhookRequest())

    expect(response.status).toBe(400)
    expect(mockForwardClerkEmail).not.toHaveBeenCalled()
  })

  it("acknowledges unrelated Clerk events without sending email", async () => {
    verifyWebhookImpl = () => Promise.resolve({ type: "user.created", data: { id: "user_123" } })

    const response = await POST(webhookRequest())

    expect(response.status).toBe(204)
    expect(mockForwardClerkEmail).not.toHaveBeenCalled()
  })

  it("sends a verified email event through the Clerk email forwarder", async () => {
    const response = await POST(webhookRequest())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ received: true, status: "sent" })
    expect(mockVerifyWebhook).toHaveBeenCalledWith(expect.any(Request), {
      signingSecret: "whsec_test",
    })
    expect(mockForwardClerkEmail).toHaveBeenCalledWith(emailEvent().data)
  })

  it("returns a retryable error when Resend fails", async () => {
    forwardClerkEmailImpl = () => Promise.resolve({ status: "failed" })

    const response = await POST(webhookRequest())

    expect(response.status).toBe(503)
  })

  it("rejects incomplete email payloads", async () => {
    forwardClerkEmailImpl = () =>
      Promise.resolve({ status: "invalid", reason: "missing_recipient" })

    const response = await POST(webhookRequest())

    expect(response.status).toBe(422)
  })
})
