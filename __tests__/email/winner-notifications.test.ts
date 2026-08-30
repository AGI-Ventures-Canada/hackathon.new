import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test"

let sendEmailImpl: (input: unknown) => Promise<{ id: string } | null> = () =>
  Promise.resolve({ id: "email_123" })
const mockSendEmail = mock((input: unknown) => sendEmailImpl(input))

mock.module("@/lib/email/resend", () => ({
  sendEmail: mockSendEmail,
}))

const mockGetUserList = mock(() =>
  Promise.resolve({
    data: [{ id: "user_1", primaryEmailAddress: { emailAddress: "winner@test.com" } }],
  })
)

mock.module("@clerk/nextjs/server", () => ({
  clerkClient: () =>
    Promise.resolve({
      users: { getUserList: mockGetUserList },
    }),
}))

const mockSingle = mock((): Promise<{ data: unknown; error: unknown }> =>
  Promise.resolve({ data: null, error: null })
)
const mockEq = mock(() => ({ single: mockSingle, eq: mockEq }))
const mockSelect = mock(() => ({ eq: mockEq }))
const mockIn = mock(() => ({ select: mockSelect }))
const mockFrom = mock(() => ({ select: mockSelect }))

let mockGetClaimTokens = mock(() => Promise.resolve({}))

mock.module("@/lib/services/prize-fulfillment", () => ({
  getClaimTokensForHackathon: (...args: unknown[]) => mockGetClaimTokens(...args),
}))

mock.module("@/lib/db/client", () => ({
  supabase: () => ({ from: mockFrom }),
}))

const { sendPrizeClaimEmail } = await import("@/lib/email/winner-notifications")

const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL

describe("sendPrizeClaimEmail", () => {
  beforeEach(() => {
    mockSendEmail.mockClear()
    mockGetUserList.mockClear()
    mockFrom.mockClear()
    mockSelect.mockClear()
    mockEq.mockClear()
    mockSingle.mockClear()
    mockIn.mockClear()
    mockGetClaimTokens.mockClear()
    sendEmailImpl = () => Promise.resolve({ id: "email_123" })
    mockGetClaimTokens = mock(() => Promise.resolve({ "pa_1": "claim_token_abc" }))
    process.env.NEXT_PUBLIC_APP_URL = "https://example.com"
  })

  afterEach(() => {
    if (originalAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL
    } else {
      process.env.NEXT_PUBLIC_APP_URL = originalAppUrl
    }
  })

  it("sends email for individual participant prize", async () => {
    let callCount = 0
    mockSingle.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve({
          data: { name: "Test Hackathon", slug: "test-hackathon" },
          error: null,
        })
      }
      if (callCount === 2) {
        return Promise.resolve({
          data: {
            id: "pa_1",
            submission_id: "sub_1",
            prize: { name: "Best Demo", value: "$500" },
            submission: { title: "My Project", team_id: null, participant_id: "part_1" },
          },
          error: null,
        })
      }
      return Promise.resolve({
        data: { clerk_user_id: "user_1" },
        error: null,
      })
    })

    const sent = await sendPrizeClaimEmail("hack_1", "pa_1")

    expect(sent).toBe(1)
    expect(mockSendEmail).toHaveBeenCalledTimes(1)

    const call = mockSendEmail.mock.calls[0]![0] as Record<string, unknown>
    expect(call.to).toBe("winner@test.com")
    expect(call.subject).toContain("You Won a Prize")
    expect(call.subject).toContain("Test Hackathon")
    expect((call.html as string)).toContain("My Project")
    expect((call.html as string)).toContain("Best Demo")
    expect((call.text as string)).toContain("My Project")

    expect((call.html as string)).toContain("prizes/claim/claim_token_abc")

    const tags = call.tags as Array<{ name: string; value: string }>
    expect(tags).toContainEqual({ name: "type", value: "prize_claim_notification" })
  })

  it("returns 0 when NEXT_PUBLIC_APP_URL is not set", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL

    const sent = await sendPrizeClaimEmail("hack_1", "pa_1")

    expect(sent).toBe(0)
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it("returns 0 when hackathon not found", async () => {
    mockSingle.mockImplementation(() =>
      Promise.resolve({ data: null, error: null })
    )

    const sent = await sendPrizeClaimEmail("missing", "pa_1")

    expect(sent).toBe(0)
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it("does not send prize claim email for a test event", async () => {
    mockSingle.mockResolvedValue({
      data: {
        name: "Practice Event",
        slug: "practice-event",
        is_test_event: true,
      },
      error: null,
    })

    await expect(sendPrizeClaimEmail("hack_1", "pa_1")).resolves.toBe(0)
    expect(mockGetUserList).not.toHaveBeenCalled()
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it("returns 0 when prize assignment not found", async () => {
    let callCount = 0
    mockSingle.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve({
          data: { name: "Hackathon", slug: "hack" },
          error: null,
        })
      }
      return Promise.resolve({ data: null, error: null })
    })

    const sent = await sendPrizeClaimEmail("hack_1", "missing")

    expect(sent).toBe(0)
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it("returns 0 when no participants found", async () => {
    let callCount = 0
    mockSingle.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve({
          data: { name: "Hackathon", slug: "hack" },
          error: null,
        })
      }
      if (callCount === 2) {
        return Promise.resolve({
          data: {
            id: "pa_1",
            submission_id: "sub_1",
            prize: { name: "Prize", value: null },
            submission: { title: "Project", team_id: null, participant_id: "part_1" },
          },
          error: null,
        })
      }
      return Promise.resolve({ data: null, error: null })
    })

    const sent = await sendPrizeClaimEmail("hack_1", "pa_1")

    expect(sent).toBe(0)
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it("returns 0 when users have no email addresses", async () => {
    mockGetUserList.mockImplementation(() =>
      Promise.resolve({
        data: [{ id: "user_1", primaryEmailAddress: null }],
      })
    )

    let callCount = 0
    mockSingle.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve({
          data: { name: "Hackathon", slug: "hack" },
          error: null,
        })
      }
      if (callCount === 2) {
        return Promise.resolve({
          data: {
            id: "pa_1",
            submission_id: "sub_1",
            prize: { name: "Prize", value: null },
            submission: { title: "Project", team_id: null, participant_id: "part_1" },
          },
          error: null,
        })
      }
      return Promise.resolve({
        data: { clerk_user_id: "user_1" },
        error: null,
      })
    })

    const sent = await sendPrizeClaimEmail("hack_1", "pa_1")

    expect(sent).toBe(0)
  })

  it("returns 0 when sendEmail fails", async () => {
    sendEmailImpl = () => Promise.resolve(null)

    let callCount = 0
    mockSingle.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve({
          data: { name: "Hackathon", slug: "hack" },
          error: null,
        })
      }
      if (callCount === 2) {
        return Promise.resolve({
          data: {
            id: "pa_1",
            submission_id: "sub_1",
            prize: { name: "Prize", value: null },
            submission: { title: "Project", team_id: null, participant_id: "part_1" },
          },
          error: null,
        })
      }
      return Promise.resolve({
        data: { clerk_user_id: "user_1" },
        error: null,
      })
    })

    const sent = await sendPrizeClaimEmail("hack_1", "pa_1")

    expect(sent).toBe(0)
  })
})
