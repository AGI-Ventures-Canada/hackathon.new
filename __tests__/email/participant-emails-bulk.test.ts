import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test"

let sendEmailImpl: (input: unknown) => Promise<{ id: string } | null> = () =>
  Promise.resolve({ id: "email_1" })
const mockSendEmail = mock((input: unknown) => sendEmailImpl(input))

mock.module("@/lib/email/resend", () => ({
  sendEmail: mockSendEmail,
}))

const mockGetUserList = mock(() =>
  Promise.resolve({
    data: [{ emailAddresses: [{ emailAddress: "p1@test.com" }] }],
  })
)

mock.module("@clerk/nextjs/server", () => ({
  clerkClient: () => Promise.resolve({ users: { getUserList: mockGetUserList } }),
}))

let hackathonRow: { data: { name: string; status: string; starts_at: string | null; ends_at: string | null } | null; error: unknown } = {
  data: { name: "AI Hackathon", status: "active", starts_at: null, ends_at: null },
  error: null,
}
let participantsRow: { data: Array<{ clerk_user_id: string; role: string }>; error: unknown } = {
  data: [{ clerk_user_id: "user_1", role: "participant" }],
  error: null,
}

const mockSingle = mock(() => Promise.resolve(hackathonRow))

function makeParticipantsQuery() {
  const q: Record<string, unknown> = {
    eq: mock(() => q),
    in: mock(() => q),
    then: (resolve: (v: unknown) => unknown) => resolve(participantsRow),
  }
  return q
}

const mockFrom = mock((table: string) => {
  if (table === "hackathons") {
    return { select: () => ({ eq: () => ({ single: mockSingle }) }) }
  }
  return { select: () => makeParticipantsQuery() }
})

mock.module("@/lib/db/client", () => ({
  supabase: () => ({ from: mockFrom }),
}))

const { sendBulkEmail } = await import("@/lib/services/participant-emails")

const savedReplyTo = process.env.RESEND_REPLY_TO_EMAIL
const savedFrom = process.env.RESEND_FROM_EMAIL

describe("sendBulkEmail", () => {
  beforeEach(() => {
    mockSendEmail.mockClear()
    mockGetUserList.mockClear()
    mockFrom.mockClear()
    mockSingle.mockClear()
    sendEmailImpl = () => Promise.resolve({ id: "email_1" })
    hackathonRow = { data: { name: "AI Hackathon", status: "active", starts_at: null, ends_at: null }, error: null }
    participantsRow = { data: [{ clerk_user_id: "user_1", role: "participant" }], error: null }
    process.env.RESEND_REPLY_TO_EMAIL = "support@hackathon.new"
    process.env.RESEND_FROM_EMAIL = "noreply@hackathon.new"
  })

  afterEach(() => {
    if (savedReplyTo === undefined) delete process.env.RESEND_REPLY_TO_EMAIL
    else process.env.RESEND_REPLY_TO_EMAIL = savedReplyTo
    if (savedFrom === undefined) delete process.env.RESEND_FROM_EMAIL
    else process.env.RESEND_FROM_EMAIL = savedFrom
  })

  it("sends with text fallback, replyTo, unsubscribe header, and tags", async () => {
    const result = await sendBulkEmail("hack_1", {
      subject: "Big update",
      html: "<p>Hello <strong>team</strong></p>",
      deliveryId: "operation_1",
    })

    expect(result).toEqual({ sent: 1, failed: 0 })
    expect(mockSendEmail).toHaveBeenCalledTimes(1)

    const call = mockSendEmail.mock.calls[0][0] as Record<string, unknown>
    expect(call.to).toBe("p1@test.com")
    expect(call.subject).toBe("Big update")
    expect(call.text).toBe("Hello team")
    expect(call.replyTo).toBe("support@hackathon.new")
    expect((call.headers as Record<string, string>)["List-Unsubscribe"]).toBe(
      "<mailto:support@hackathon.new?subject=unsubscribe>"
    )
    expect(call.tags).toEqual([
      { name: "type", value: "participant_broadcast" },
      { name: "hackathon", value: "AI_Hackathon" },
    ])
    expect(call.idempotencyKey).toMatch(/^participant-broadcast\/hack_1\/[a-f0-9]{24}\/[a-f0-9]{24}$/)
  })

  it("fails closed when the event can't be resolved", async () => {
    hackathonRow = { data: null, error: null }

    await expect(sendBulkEmail("hack_missing", {
      subject: "Heads up",
      html: "<p>Body</p>",
      deliveryId: "operation_2",
    })).rejects.toThrow("Failed to load the event")
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it("counts failures when a send returns null", async () => {
    sendEmailImpl = () => Promise.resolve(null)

    const result = await sendBulkEmail("hack_1", {
      subject: "x",
      html: "<p>x</p>",
      deliveryId: "operation_3",
    })

    expect(result).toEqual({ sent: 0, failed: 1 })
  })

  it("rejects a stale live status after the event has ended", async () => {
    hackathonRow = {
      data: {
        name: "AI Hackathon",
        status: "active",
        starts_at: "2020-01-01T00:00:00.000Z",
        ends_at: "2020-01-02T00:00:00.000Z",
      },
      error: null,
    }

    await expect(sendBulkEmail("hack_1", {
      subject: "Too late",
      html: "<p>Body</p>",
      deliveryId: "operation_4",
    })).rejects.toThrow("This event has ended")
    expect(mockSendEmail).not.toHaveBeenCalled()
    expect(mockGetUserList).not.toHaveBeenCalled()
  })

  it("uses the operation id so the same message can be sent again intentionally", async () => {
    const input = { subject: "Same update", html: "<p>Same body</p>" }
    await sendBulkEmail("hack_1", { ...input, deliveryId: "first_operation" })
    await sendBulkEmail("hack_1", { ...input, deliveryId: "second_operation" })

    const firstKey = (mockSendEmail.mock.calls[0][0] as Record<string, unknown>).idempotencyKey
    const secondKey = (mockSendEmail.mock.calls[1][0] as Record<string, unknown>).idempotencyKey
    expect(firstKey).not.toBe(secondKey)
  })
})
