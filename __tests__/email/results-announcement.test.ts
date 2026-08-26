import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"

type QueryResult = {
  data: unknown
  error: { message: string } | null
}

type SendInput = {
  to: string
  subject: string
  html: string
  text: string
  idempotencyKey: string
}

let sendEmailImpl: (input: SendInput) => Promise<{ id: string } | null> = () =>
  Promise.resolve({ id: "email_1" })
const mockSendEmail = mock((input: SendInput) => sendEmailImpl(input))

mock.module("@/lib/email/resend", () => ({
  sendEmail: mockSendEmail,
}))

const mockGetUserList = mock(() => Promise.resolve({ data: [] as unknown[] }))

mock.module("@clerk/nextjs/server", () => ({
  clerkClient: () => Promise.resolve({ users: { getUserList: mockGetUserList } }),
}))

const mockGetUnresolvedEmailDecision = mock(() =>
  Promise.resolve<"retry" | "exhausted">("retry"),
)
mock.module("@/lib/services/delivery-lease", () => ({
  getUnresolvedEmailDecision: mockGetUnresolvedEmailDecision,
}))

function query(result: QueryResult) {
  const chain: Record<string, unknown> = {}
  for (const method of ["select", "eq", "lte", "in", "is", "update"]) {
    chain[method] = mock(() => chain)
  }
  chain.single = mock(() => chain)
  chain.then = (resolve: (value: QueryResult) => unknown) => resolve(result)
  return chain
}

let fromImpl: (table: string) => ReturnType<typeof query> = () =>
  query({ data: null, error: null })
const mockFrom = mock((table: string) => fromImpl(table))

mock.module("@/lib/db/client", () => ({
  supabase: () => ({ from: mockFrom }),
}))

const { sendResultsAnnouncementEmailsWithResult } = await import(
  "@/lib/email/results-announcement"
)

const savedAppUrl = process.env.NEXT_PUBLIC_APP_URL

function configureRecipients() {
  let hackathonCall = 0
  let participantCall = 0
  const updateQueries: ReturnType<typeof query>[] = []

  fromImpl = (table: string) => {
    if (table === "hackathons") {
      hackathonCall++
      if (hackathonCall === 1) {
        return query({
          data: {
            name: "Build Together",
            slug: "build-together",
            status: "completed",
            results_published_at: "2026-08-20T00:00:00.000Z",
            results_announcement_sent_at: null,
          },
          error: null,
        })
      }
      const updateQuery = query({ data: null, error: null })
      updateQueries.push(updateQuery)
      return updateQuery
    }
    if (table === "hackathon_results") {
      return query({
        data: [
          { submission: { team_id: "team_winner", participant_id: null } },
          { submission: { team_id: null, participant_id: "solo_winner" } },
        ],
        error: null,
      })
    }
    if (table === "hackathon_participants") {
      participantCall++
      if (participantCall === 1) {
        return query({ data: [{ clerk_user_id: "winner_team_user" }], error: null })
      }
      if (participantCall === 2) {
        return query({ data: [{ clerk_user_id: "winner_solo_user" }], error: null })
      }
      return query({
        data: [
          { clerk_user_id: "winner_team_user" },
          { clerk_user_id: "winner_solo_user" },
          { clerk_user_id: "attendee_one" },
          { clerk_user_id: "attendee_one" },
          { clerk_user_id: "attendee_two" },
        ],
        error: null,
      })
    }
    return query({ data: null, error: null })
  }

  mockGetUserList.mockImplementation(() => Promise.resolve({
    data: [
      {
        id: "attendee_one",
        firstName: "Avery",
        lastName: "Lee",
        username: null,
        primaryEmailAddress: { emailAddress: "avery@example.com" },
      },
      {
        id: "attendee_two",
        firstName: null,
        lastName: null,
        username: "river",
        primaryEmailAddress: { emailAddress: "river@example.com" },
      },
      {
        id: "extra_user",
        firstName: null,
        lastName: null,
        username: "no-email",
        primaryEmailAddress: null,
      },
    ],
  }))

  return { updateQueries }
}

describe("sendResultsAnnouncementEmailsWithResult", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = "https://preview.hackathon.new"
    mockSendEmail.mockClear()
    mockGetUserList.mockClear()
    mockGetUnresolvedEmailDecision.mockClear()
    mockGetUnresolvedEmailDecision.mockResolvedValue("retry")
    mockFrom.mockClear()
    sendEmailImpl = () => Promise.resolve({ id: "email_1" })
    fromImpl = () => query({ data: null, error: null })
  })

  afterEach(() => {
    if (savedAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL
    else process.env.NEXT_PUBLIC_APP_URL = savedAppUrl
  })

  it("emails each non-winner once and checkpoints a complete delivery", async () => {
    const { updateQueries } = configureRecipients()

    await expect(
      sendResultsAnnouncementEmailsWithResult("hack_1")
    ).resolves.toEqual({ attempted: 2, sent: 2, failed: 0 })
    expect(mockGetUserList).toHaveBeenCalledWith({
      userId: ["attendee_one", "attendee_two"],
      limit: 100,
    })
    expect(mockSendEmail).toHaveBeenCalledTimes(2)
    expect(mockSendEmail.mock.calls.map((call) => call[0].to)).toEqual([
      "avery@example.com",
      "river@example.com",
    ])
    expect(mockSendEmail.mock.calls[0]?.[0].subject).toBe(
      "Results Published — Build Together"
    )
    expect(mockSendEmail.mock.calls[0]?.[0].html).toContain("Avery Lee")
    expect(mockSendEmail.mock.calls[1]?.[0].text).toContain("river")
    expect(mockSendEmail.mock.calls[0]?.[0].idempotencyKey).toMatch(
      /^results-announcement\/hack_1\/[a-f0-9]{24}\/[a-f0-9]{24}$/
    )
    expect(mockSendEmail.mock.calls[0]?.[0].idempotencyKey).not.toContain(
      "avery@example.com"
    )
    expect(updateQueries).toHaveLength(1)
    expect(updateQueries[0]?.update).toHaveBeenCalledTimes(1)
  })

  it("leaves the checkpoint open when any provider delivery fails", async () => {
    const { updateQueries } = configureRecipients()
    let attempt = 0
    sendEmailImpl = () => {
      attempt++
      return Promise.resolve(attempt === 1 ? { id: "email_1" } : null)
    }
    const error = mock(() => {})
    const originalError = console.error
    console.error = error

    try {
      await expect(
        sendResultsAnnouncementEmailsWithResult("hack_1")
      ).resolves.toEqual({ attempted: 2, sent: 1, failed: 1 })
      expect(updateQueries).toHaveLength(0)
      expect(error).toHaveBeenCalledTimes(1)
    } finally {
      console.error = originalError
    }
  })

  it("fails before reading recipient data when the public app URL is missing", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL

    await expect(
      sendResultsAnnouncementEmailsWithResult("hack_1")
    ).rejects.toThrow("NEXT_PUBLIC_APP_URL is required for results emails")
    expect(mockFrom).not.toHaveBeenCalled()
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it("skips stale or already-delivered event states", async () => {
    fromImpl = () => query({
      data: {
        name: "Build Together",
        slug: "build-together",
        status: "active",
        results_published_at: null,
        results_announcement_sent_at: null,
      },
      error: null,
    })

    await expect(sendResultsAnnouncementEmailsWithResult("hack_1"))
      .resolves.toEqual({ attempted: 0, sent: 0, failed: 0 })
    expect(mockSendEmail).not.toHaveBeenCalled()
    expect(mockGetUserList).not.toHaveBeenCalled()
  })

  it("checkpoints an event with no eligible attendees", async () => {
    let hackathonCall = 0
    let checkpoint: ReturnType<typeof query> | null = null
    fromImpl = (table) => {
      if (table === "hackathons" && ++hackathonCall === 1) {
        return query({
          data: {
            name: "Build Together",
            slug: "build-together",
            status: "completed",
            results_published_at: "2026-08-20T00:00:00Z",
            results_announcement_sent_at: null,
          },
          error: null,
        })
      }
      if (table === "hackathons") {
        checkpoint = query({ data: null, error: null })
        return checkpoint
      }
      return query({ data: [], error: null })
    }

    await expect(sendResultsAnnouncementEmailsWithResult("hack_1"))
      .resolves.toEqual({ attempted: 0, sent: 0, failed: 0 })
    expect(checkpoint?.update).toHaveBeenCalledWith({
      results_announcement_sent_at: expect.any(String),
    })
    expect(mockGetUserList).not.toHaveBeenCalled()
  })

  it("counts rendering or provider rejections without closing the checkpoint", async () => {
    const { updateQueries } = configureRecipients()
    sendEmailImpl = () => Promise.reject(new Error("provider unavailable"))
    const error = mock(() => {})
    const originalError = console.error
    console.error = error
    try {
      await expect(sendResultsAnnouncementEmailsWithResult("hack_1"))
        .resolves.toEqual({ attempted: 2, sent: 0, failed: 2 })
      expect(updateQueries).toHaveLength(0)
      expect(error.mock.calls.length).toBeGreaterThanOrEqual(2)
    } finally {
      console.error = originalError
    }
  })

  it("surfaces winner lookup errors before loading attendees", async () => {
    fromImpl = (table) => table === "hackathons"
      ? query({
          data: {
            name: "Build Together",
            slug: "build-together",
            status: "completed",
            results_published_at: "2026-08-20T00:00:00Z",
            results_announcement_sent_at: null,
          },
          error: null,
        })
      : query({ data: null, error: { message: "database unavailable" } })

    await expect(sendResultsAnnouncementEmailsWithResult("hack_1"))
      .rejects.toThrow("Failed to load event winners: database unavailable")
    expect(mockGetUserList).not.toHaveBeenCalled()
  })

  it("keeps unresolved Clerk recipients retryable without checkpointing", async () => {
    const { updateQueries } = configureRecipients()
    mockGetUserList.mockResolvedValue({
      data: [{
        id: "attendee_one",
        firstName: "Avery",
        lastName: "Lee",
        username: null,
        primaryEmailAddress: { emailAddress: "avery@example.com" },
      }],
    })

    await expect(sendResultsAnnouncementEmailsWithResult("hack_1"))
      .resolves.toEqual({ attempted: 2, sent: 1, failed: 1 })
    expect(mockGetUnresolvedEmailDecision).toHaveBeenCalledTimes(1)
    expect(updateQueries).toHaveLength(0)
  })

  it("checkpoints after bounded retries exhaust an unavailable Clerk recipient", async () => {
    const { updateQueries } = configureRecipients()
    mockGetUserList.mockResolvedValue({
      data: [{
        id: "attendee_one",
        firstName: "Avery",
        lastName: "Lee",
        username: null,
        primaryEmailAddress: { emailAddress: "avery@example.com" },
      }],
    })
    mockGetUnresolvedEmailDecision.mockResolvedValue("exhausted")
    const warn = mock(() => {})
    const originalWarn = console.warn
    console.warn = warn
    try {
      await expect(sendResultsAnnouncementEmailsWithResult("hack_1"))
        .resolves.toEqual({ attempted: 1, sent: 1, failed: 0 })
      expect(updateQueries).toHaveLength(1)
      expect(updateQueries[0]?.update).toHaveBeenCalledTimes(1)
      expect(warn.mock.calls.flat().join(" ")).not.toContain("attendee_two")
    } finally {
      console.warn = originalWarn
    }
  })
})
