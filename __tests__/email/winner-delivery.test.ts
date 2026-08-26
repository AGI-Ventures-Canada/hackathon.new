import { beforeEach, describe, expect, it, mock } from "bun:test"

type QueryResult = { data: unknown; error: { message: string } | null }

function query(result: QueryResult) {
  const chain: Record<string, unknown> = {}
  for (const method of ["select", "eq", "lte", "in", "order", "upsert"]) {
    chain[method] = mock(() => chain)
  }
  chain.single = mock(() => chain)
  chain.then = (resolve: (value: QueryResult) => unknown) => resolve(result)
  return chain
}

let fromImpl: (table: string) => ReturnType<typeof query> = () =>
  query({ data: null, error: null })
const progress = new Map<string, number>()

function progressQuery() {
  const chain = query({ data: [], error: null })
  let selectedKeys: string[] = []
  chain.in = mock((_column: string, keys: string[]) => {
    selectedKeys = keys
    return chain
  })
  chain.upsert = mock((value: { key: string; reset_at: number }) => {
    progress.set(value.key, value.reset_at)
    return chain
  })
  chain.then = (resolve: (value: QueryResult) => unknown) => resolve({
    data: selectedKeys
      .filter((key) => progress.has(key))
      .map((key) => ({ key, reset_at: progress.get(key) })),
    error: null,
  })
  return chain
}

const mockFrom = mock((table: string) =>
  table === "rate_limits" ? progressQuery() : fromImpl(table),
)
mock.module("@/lib/db/client", () => ({ supabase: () => ({ from: mockFrom }) }))

const mockGetUserList = mock(() => Promise.resolve({ data: [] as unknown[] }))
mock.module("@clerk/nextjs/server", () => ({
  clerkClient: () => Promise.resolve({ users: { getUserList: mockGetUserList } }),
}))

let sendImpl: (input: Record<string, unknown>) => Promise<{ id: string } | null> = () =>
  Promise.resolve({ id: "email_1" })
const mockSendEmail = mock((input: Record<string, unknown>) => sendImpl(input))
mock.module("@/lib/email/resend", () => ({ sendEmail: mockSendEmail }))

const mockGetClaimTokens = mock(() => Promise.resolve({ assignment_1: "claim_1" }))
mock.module("@/lib/services/prize-fulfillment", () => ({
  getClaimTokensForHackathon: mockGetClaimTokens,
}))

const mockGetUnresolvedEmailDecision = mock(() =>
  Promise.resolve<"retry" | "exhausted">("retry"),
)
mock.module("@/lib/services/delivery-lease", () => ({
  getUnresolvedEmailDecision: mockGetUnresolvedEmailDecision,
}))

const { sendWinnerEmailsWithResult } = await import("@/lib/email/winner-notifications")
const { createDeliveryBudget } = await import("@/lib/services/delivery-budget")

describe("winner result delivery", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = "https://preview.hackathon.new"
    mockFrom.mockClear()
    progress.clear()
    mockGetUserList.mockClear()
    mockSendEmail.mockClear()
    mockGetClaimTokens.mockClear()
    mockGetUnresolvedEmailDecision.mockClear()
    mockGetUnresolvedEmailDecision.mockResolvedValue("retry")
    fromImpl = () => query({ data: null, error: null })
    sendImpl = () => Promise.resolve({ id: "email_1" })
    mockGetClaimTokens.mockResolvedValue({ assignment_1: "claim_1" })
  })

  it("delivers team and solo wins independently with private idempotency keys", async () => {
    let participantCall = 0
    fromImpl = (table) => {
      if (table === "hackathons") {
        return query({
          data: {
            name: "Build Together",
            slug: "build-together",
            starts_at: "2026-09-01T13:00:00Z",
            ends_at: "2026-09-02T21:00:00Z",
            status: "completed",
            results_published_at: "2026-08-20T00:00:00.000Z",
            winner_emails_sent_at: null,
          },
          error: null,
        })
      }
      if (table === "hackathon_results") {
        return query({ data: [
          {
            rank: 1,
            submission: { id: "submission_1", title: "Team App", team_id: "team_1", participant_id: null },
          },
          {
            rank: 2,
            submission: { id: "submission_2", title: "Solo App", team_id: null, participant_id: "participant_2" },
          },
        ], error: null })
      }
      if (table === "prize_assignments") {
        return query({ data: [
          {
            id: "assignment_1",
            submission_id: "submission_1",
            prize: { name: "Best Demo", value: "$500" },
          },
          { id: "assignment_ignored", submission_id: "submission_2", prize: null },
        ], error: null })
      }
      participantCall++
      return participantCall === 1
        ? query({ data: [{ clerk_user_id: "user_team", team_id: "team_1" }], error: null })
        : query({ data: { clerk_user_id: "user_solo" }, error: null })
    }
    mockGetUserList.mockResolvedValue({ data: [
      { id: "user_team", primaryEmailAddress: { emailAddress: "team@example.com" } },
      { id: "user_solo", primaryEmailAddress: { emailAddress: "solo@example.com" } },
      { id: "no_email", primaryEmailAddress: null },
    ] })
    let delivery = 0
    let active = 0
    let maxActive = 0
    sendImpl = async () => {
      const currentDelivery = ++delivery
      active++
      maxActive = Math.max(maxActive, active)
      await Promise.resolve()
      active--
      if (currentDelivery === 1) return { id: "email_1" }
      throw new Error("provider unavailable")
    }
    const error = mock(() => {})
    const originalError = console.error
    console.error = error

    try {
      await expect(sendWinnerEmailsWithResult("hack_1")).resolves.toEqual({
        attempted: 2,
        sent: 1,
        failed: 1,
      })
      expect(mockSendEmail).toHaveBeenCalledTimes(2)
      const claimDelivery = mockSendEmail.mock.calls
        .map(([input]) => input)
        .find((input) => String(input.idempotencyKey).includes("/submission_1/"))
      expect(claimDelivery?.html).toContain("prizes/claim/claim_1")
      expect(claimDelivery?.idempotencyKey).toMatch(
        /^winner\/hack_1\/[a-f0-9]{24}\/submission_1\/[a-f0-9]{24}$/
      )
      expect(claimDelivery?.idempotencyKey).not.toContain("team@example.com")
      expect(maxActive).toBe(1)
      expect(error).toHaveBeenCalledTimes(1)
    } finally {
      console.error = originalError
    }
  })

  it("tracks two winning projects for one user as separate stable tasks", async () => {
    fromImpl = (table) => {
      if (table === "hackathons") {
        return query({ data: {
          name: "Build Together",
          slug: "build-together",
          starts_at: "2026-09-01T13:00:00Z",
          ends_at: "2026-09-02T21:00:00Z",
          status: "completed",
          results_published_at: "2026-08-20T00:00:00.000Z",
          winner_emails_sent_at: null,
        }, error: null })
      }
      if (table === "hackathon_results") {
        return query({ data: [
          {
            rank: 1,
            submission: {
              id: "submission_1",
              title: "First App",
              team_id: "team_1",
              participant_id: null,
            },
          },
          {
            rank: 2,
            submission: {
              id: "submission_2",
              title: "Second App",
              team_id: "team_2",
              participant_id: null,
            },
          },
        ], error: null })
      }
      if (table === "prize_assignments") return query({ data: [], error: null })
      return query({ data: [
        { clerk_user_id: "user_both", team_id: "team_1" },
        { clerk_user_id: "user_both", team_id: "team_2" },
      ], error: null })
    }
    mockGetUserList.mockResolvedValue({ data: [{
      id: "user_both",
      primaryEmailAddress: { emailAddress: "both@example.com" },
    }] })

    await expect(sendWinnerEmailsWithResult("hack_1")).resolves.toEqual({
      attempted: 2,
      sent: 2,
      failed: 0,
    })
    expect(mockGetUserList).toHaveBeenCalledTimes(1)
    expect(mockGetUserList).toHaveBeenCalledWith({ userId: ["user_both"], limit: 100 })
    expect(mockSendEmail.mock.calls.map(([input]) => input.idempotencyKey)).toEqual([
      expect.stringContaining("/submission_1/"),
      expect.stringContaining("/submission_2/"),
    ])
  })

  it("does not call Clerk after a winner worker deadline expires", async () => {
    fromImpl = (table) => {
      if (table === "hackathons") {
        return query({ data: {
          name: "Build Together",
          slug: "build-together",
          starts_at: "2026-09-01T13:00:00Z",
          ends_at: "2026-09-02T21:00:00Z",
          status: "completed",
          results_published_at: "2026-08-20T00:00:00.000Z",
          winner_emails_sent_at: null,
        }, error: null })
      }
      if (table === "hackathon_results") {
        return query({ data: [{
          rank: 1,
          submission: {
            id: "submission_1",
            title: "First App",
            team_id: "team_1",
            participant_id: null,
          },
        }], error: null })
      }
      if (table === "prize_assignments") return query({ data: [], error: null })
      return query({
        data: [{ clerk_user_id: "user_one", team_id: "team_1" }],
        error: null,
      })
    }

    await expect(sendWinnerEmailsWithResult(
      "hack_1",
      createDeliveryBudget(1, Date.now() - 1),
    )).resolves.toEqual({ attempted: 0, sent: 0, failed: 0, deferred: true })
    expect(mockGetUserList).not.toHaveBeenCalled()
  })

  it("fails closed without a public URL or published winner rows", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL
    await expect(sendWinnerEmailsWithResult("hack_1")).rejects.toThrow(
      "NEXT_PUBLIC_APP_URL is required for winner emails"
    )

    process.env.NEXT_PUBLIC_APP_URL = "https://preview.hackathon.new"
    fromImpl = (table) => table === "hackathons"
      ? query({
          data: {
            name: "Hack",
            slug: "hack",
            status: "completed",
            results_published_at: "2026-08-20T00:00:00.000Z",
            winner_emails_sent_at: null,
          },
          error: null,
        })
      : query({ data: [], error: null })
    await expect(sendWinnerEmailsWithResult("hack_1")).rejects.toThrow(
      "Published results were not found for winner emails"
    )
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it("does not deliver for an unpublished or already-checkpointed event", async () => {
    for (const hackathon of [
      {
        name: "Hack",
        slug: "hack",
        status: "judging",
        results_published_at: null,
        winner_emails_sent_at: null,
      },
      {
        name: "Hack",
        slug: "hack",
        status: "completed",
        results_published_at: "2026-08-20T00:00:00.000Z",
        winner_emails_sent_at: "2026-08-20T00:01:00.000Z",
      },
    ]) {
      fromImpl = () => query({ data: hackathon, error: null })
      await expect(sendWinnerEmailsWithResult("hack_1")).resolves.toEqual({
        attempted: 0,
        sent: 0,
        failed: 0,
      })
    }
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it("does not checkpoint away a winning team when its members cannot be loaded", async () => {
    fromImpl = (table) => {
      if (table === "hackathons") return query({ data: {
        name: "Hack",
        slug: "hack",
        status: "completed",
        results_published_at: "2026-08-20T00:00:00.000Z",
        winner_emails_sent_at: null,
      }, error: null })
      if (table === "hackathon_results") return query({ data: [{
        rank: 1,
        submission: { id: "submission_1", title: "Team App", team_id: "team_1", participant_id: null },
      }], error: null })
      if (table === "prize_assignments") return query({ data: [], error: null })
      return query({ data: null, error: { message: "members unavailable" } })
    }

    await expect(sendWinnerEmailsWithResult("hack_1")).rejects.toThrow(
      "Failed to load winning team members: members unavailable",
    )
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it("does not checkpoint away a solo winner when the attendee cannot be loaded", async () => {
    fromImpl = (table) => {
      if (table === "hackathons") return query({ data: {
        name: "Hack",
        slug: "hack",
        status: "completed",
        results_published_at: "2026-08-20T00:00:00.000Z",
        winner_emails_sent_at: null,
      }, error: null })
      if (table === "hackathon_results") return query({ data: [{
        rank: 1,
        submission: { id: "submission_1", title: "Solo App", team_id: null, participant_id: "participant_1" },
      }], error: null })
      if (table === "prize_assignments") return query({ data: [], error: null })
      return query({ data: null, error: { message: "attendee unavailable" } })
    }

    await expect(sendWinnerEmailsWithResult("hack_1")).rejects.toThrow(
      "Failed to load a winning attendee: attendee unavailable",
    )
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it("keeps missing Clerk recipients retryable before the bounded cutoff", async () => {
    fromImpl = (table) => {
      if (table === "hackathons") {
        return query({
          data: {
            name: "Hack",
            slug: "hack",
            status: "completed",
            results_published_at: "2026-08-20T00:00:00.000Z",
            winner_emails_sent_at: null,
          },
          error: null,
        })
      }
      if (table === "hackathon_results") {
        return query({
          data: [{
            rank: 1,
            submission: {
              id: "submission_1",
              title: "Team App",
              team_id: "team_1",
              participant_id: null,
            },
          }],
          error: null,
        })
      }
      if (table === "prize_assignments") {
        return query({ data: [], error: null })
      }
      return query({
        data: [{ clerk_user_id: "missing_user", team_id: "team_1" }],
        error: null,
      })
    }
    mockGetUserList.mockResolvedValue({ data: [] })

    await expect(sendWinnerEmailsWithResult("hack_1")).resolves.toEqual({
      attempted: 1,
      sent: 0,
      failed: 1,
    })
    expect(mockGetUnresolvedEmailDecision).toHaveBeenCalledTimes(1)
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it("closes permanently unresolved recipients after the bounded cutoff", async () => {
    fromImpl = (table) => {
      if (table === "hackathons") {
        return query({
          data: {
            name: "Hack",
            slug: "hack",
            status: "completed",
            results_published_at: "2026-08-20T00:00:00.000Z",
            winner_emails_sent_at: null,
          },
          error: null,
        })
      }
      if (table === "hackathon_results") {
        return query({
          data: [{
            rank: 1,
            submission: {
              id: "submission_1",
              title: "Team App",
              team_id: "team_1",
              participant_id: null,
            },
          }],
          error: null,
        })
      }
      if (table === "prize_assignments") return query({ data: [], error: null })
      return query({
        data: [{ clerk_user_id: "missing_user", team_id: "team_1" }],
        error: null,
      })
    }
    mockGetUserList.mockResolvedValue({ data: [] })
    mockGetUnresolvedEmailDecision.mockResolvedValue("exhausted")
    const warn = mock(() => {})
    const originalWarn = console.warn
    console.warn = warn
    try {
      await expect(sendWinnerEmailsWithResult("hack_1")).resolves.toEqual({
        attempted: 0,
        sent: 0,
        failed: 0,
      })
      expect(warn).toHaveBeenCalledTimes(1)
      expect(warn.mock.calls.flat().join(" ")).not.toContain("missing_user")
    } finally {
      console.warn = originalWarn
    }
  })
})
