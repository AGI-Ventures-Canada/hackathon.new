import { describe, expect, it, mock, beforeEach } from "bun:test"
import { createIntegrationChainableMock } from "../lib/integration-mock"

const mockAuth = mock(() => Promise.resolve({ userId: null }))
const mockClerkClient = mock(() =>
  Promise.resolve({
    organizations: {
      getOrganization: mock(() => Promise.resolve({ name: "Test Org" })),
    },
  })
)

mock.module("@clerk/nextjs/server", () => ({
  auth: mockAuth,
  clerkClient: mockClerkClient,
}))

const mockSendWinnerEmails = mock(() =>
  Promise.resolve({ attempted: 3, sent: 3, failed: 0 }),
)

mock.module("@/lib/email/winner-notifications", () => ({
  sendWinnerEmailsWithResult: mockSendWinnerEmails,
}))

const mockGetNotificationSettings = mock(() =>
  Promise.resolve({ email_on_results_published: true }),
)

mock.module("@/lib/services/notification-settings", () => ({
  getNotificationSettings: mockGetNotificationSettings,
}))

const mockSendResultsAnnouncementEmails = mock(() =>
  Promise.resolve({ attempted: 4, sent: 4, failed: 0 }),
)

mock.module("@/lib/email/results-announcement", () => ({
  sendResultsAnnouncementEmails: mock(() => Promise.resolve(4)),
  sendResultsAnnouncementEmailsWithResult: mockSendResultsAnnouncementEmails,
}))

const mockExecuteTransition = mock(() =>
  Promise.resolve({ success: true as const, transitionId: "transition_1" }),
)
mock.module("@/lib/services/lifecycle", () => ({
  executeTransition: mockExecuteTransition,
}))

class MockEventMutationLeaseError extends Error {
  constructor(
    message: string,
    public readonly code: "event_busy" | "lease_unavailable",
  ) {
    super(message)
    this.name = "EventMutationLeaseError"
  }
}
const mockWithEventMutationLease = mock(async (
  _hackathonId: string,
  work: () => Promise<unknown>,
) => work())
mock.module("@/lib/services/event-mutation-lease", () => ({
  EventMutationLeaseError: MockEventMutationLeaseError,
  withEventMutationLease: mockWithEventMutationLease,
}))

const mockWithDeliveryLease = mock(async (
  _key: string,
  work: () => Promise<unknown>,
) => ({ acquired: true as const, value: await work() }))
mock.module("@/lib/services/delivery-lease", () => ({
  withDeliveryLease: mockWithDeliveryLease,
  getUnresolvedEmailDecision: mock(() => Promise.resolve("retry" as const)),
}))

const mockFrom = mock()
const mockRpc = mock()

mock.module("@/lib/db/client", () => ({
  supabase: () => ({
    from: mockFrom,
    rpc: mockRpc,
  }),
}))

const { publishResults, retryPendingResultEmails } = await import("@/lib/services/results")

describe("Results Integration - publishResults", () => {
  beforeEach(() => {
    mockFrom.mockClear()
    mockSendWinnerEmails.mockClear()
    mockSendWinnerEmails.mockImplementation(() =>
      Promise.resolve({ attempted: 3, sent: 3, failed: 0 }),
    )
    mockExecuteTransition.mockClear()
    mockExecuteTransition.mockResolvedValue({
      success: true,
      transitionId: "transition_1",
    })
    mockWithEventMutationLease.mockClear()
    mockWithDeliveryLease.mockClear()
  })

  it("publishes results successfully and sends winner notification emails", async () => {
    let hackathonCallCount = 0
    mockFrom.mockImplementation((table: string) => {
      if (table === "hackathons") {
        hackathonCallCount++
        if (hackathonCallCount === 1) {
          return createIntegrationChainableMock({
            data: { id: "h1", status: "judging", tenant_id: "t1", winner_emails_sent_at: null },
            error: null,
          })
        }
        if (hackathonCallCount === 2) {
          return createIntegrationChainableMock({ data: { id: "h1" }, error: null })
        }
        return createIntegrationChainableMock({ data: null, error: null })
      }
      if (table === "hackathon_results") {
        return createIntegrationChainableMock({ data: [{ id: "r1" }], error: null })
      }
      return createIntegrationChainableMock({ data: null, error: null })
    })

    const result = await publishResults("h1", "t1")

    expect(result.success).toBe(true)
    expect(mockSendWinnerEmails).toHaveBeenCalledWith("h1")
  })

  it("returns error when hackathon does not exist", async () => {
    mockFrom.mockImplementation(() =>
      createIntegrationChainableMock({ data: null, error: null })
    )

    const result = await publishResults("h1", "t1")

    expect(result.success).toBe(false)
    expect(result.error).toBe("Hackathon not found")
  })

  it("returns error when no results have been calculated yet", async () => {
    let hackathonQueried = false
    mockFrom.mockImplementation((table: string) => {
      if (table === "hackathons" && !hackathonQueried) {
        hackathonQueried = true
        return createIntegrationChainableMock({
          data: { id: "h1", status: "judging", tenant_id: "t1" },
          error: null,
        })
      }
      if (table === "hackathon_results") {
        return createIntegrationChainableMock({ data: [], error: null })
      }
      return createIntegrationChainableMock({ data: null, error: null })
    })

    const result = await publishResults("h1", "t1")

    expect(result.success).toBe(false)
    expect(result.error).toContain("No results calculated")
  })

  it("resumes side effects when a prior publication is already fully committed", async () => {
    const publishedAt = "2026-03-01T00:00:00Z"
    mockFrom.mockImplementation((table: string) => {
      if (table === "hackathons") {
        return createIntegrationChainableMock({
          data: {
            id: "h1",
            name: "Hack",
            slug: "hack",
            status: "completed",
            tenant_id: "t1",
            results_published_at: publishedAt,
          },
          error: null,
        })
      }
      if (table === "hackathon_results") {
        return createIntegrationChainableMock({
          data: [{ id: "r1", published_at: publishedAt }],
          error: null,
        })
      }
      return createIntegrationChainableMock({ data: null, error: null })
    })

    const result = await publishResults("h1", "t1")

    expect(result.success).toBe(true)
    expect(mockSendWinnerEmails).toHaveBeenCalledWith("h1")
  })

  it("does not start result email delivery for a test event", async () => {
    const publishedAt = "2026-03-01T00:00:00Z"
    mockFrom.mockImplementation((table: string) => {
      if (table === "hackathons") {
        return createIntegrationChainableMock({
          data: {
            id: "h1",
            name: "Test event",
            slug: "test-event",
            status: "completed",
            tenant_id: "t1",
            results_published_at: publishedAt,
            is_test_event: true,
          },
          error: null,
        })
      }
      if (table === "hackathon_results") {
        return createIntegrationChainableMock({
          data: [{ id: "r1", published_at: publishedAt }],
          error: null,
        })
      }
      return createIntegrationChainableMock({ data: [], error: null })
    })

    await expect(publishResults("h1", "t1")).resolves.toEqual({ success: true })
    expect(mockSendWinnerEmails).not.toHaveBeenCalled()
    expect(mockSendResultsAnnouncementEmails).not.toHaveBeenCalled()
  })

  it("does not expose results or report success when completion fails", async () => {
    mockExecuteTransition.mockResolvedValueOnce({
      success: false,
      error: "The event changed.",
      code: "stale_status",
    })
    const resultsChain = createIntegrationChainableMock({
      data: [{ id: "r1" }],
      error: null,
    })
    mockFrom.mockImplementation((table: string) => {
      if (table === "hackathons") {
        return createIntegrationChainableMock({
          data: {
            id: "h1",
            name: "Hack",
            slug: "hack",
            status: "judging",
            tenant_id: "t1",
            results_published_at: null,
          },
          error: null,
        })
      }
      if (table === "hackathon_results") return resultsChain
      return createIntegrationChainableMock({ data: null, error: null })
    })

    await expect(publishResults("h1", "t1")).resolves.toEqual({
      success: false,
      error: "The event changed.",
    })
    expect(mockExecuteTransition).toHaveBeenCalledWith(
      expect.objectContaining({
        fromStatus: "judging",
        toStatus: "completed",
        resultsPublication: { publishedAt: expect.any(String) },
      }),
    )
    expect(resultsChain.update).not.toHaveBeenCalled()
    expect(mockSendWinnerEmails).not.toHaveBeenCalled()
  })

  it("fails closed when a completed event cannot claim the publication gate", async () => {
    let hackathonCall = 0
    const resultsChain = createIntegrationChainableMock({
      data: [{ id: "r1" }],
      error: null,
    })
    mockFrom.mockImplementation((table: string) => {
      if (table === "hackathons") {
        hackathonCall++
        return createIntegrationChainableMock({
          data: hackathonCall === 3
            ? null
            : hackathonCall <= 4
            ? {
                id: "h1",
                name: "Hack",
                slug: "hack",
                status: "completed",
                tenant_id: "t1",
                results_published_at: null,
              }
            : null,
          error: null,
        })
      }
      if (table === "hackathon_results") {
        return resultsChain
      }
      return createIntegrationChainableMock({ data: null, error: null })
    })

    const result = await publishResults("h1", "t1")
    expect(result).toEqual({
      success: false,
      error: "The event changed. Refresh the page and try again.",
    })
    expect(resultsChain.update).toHaveBeenNthCalledWith(1, {
      published_at: expect.any(String),
    })
    expect(resultsChain.update).toHaveBeenNthCalledWith(2, {
      published_at: null,
    })
    expect(mockSendWinnerEmails).not.toHaveBeenCalled()
  })

  it("recovers a committed publication when the event update response is lost", async () => {
    let hackathonCall = 0
    let resultsCall = 0
    let publicationVersion = ""
    mockFrom.mockImplementation((table: string) => {
      if (table === "hackathons") {
        hackathonCall++
        if (hackathonCall <= 2) {
          return createIntegrationChainableMock({
            data: {
              id: "h1",
              name: "Hack",
              slug: "hack",
              status: "completed",
              tenant_id: "t1",
              results_published_at: null,
            },
            error: null,
          })
        }
        if (hackathonCall === 3) {
          const chain = createIntegrationChainableMock({ data: null, error: null })
          chain.then = (() => {
            throw new Error("response lost")
          }) as typeof chain.then
          return chain
        }
        return createIntegrationChainableMock({
          data: {
            id: "h1",
            name: "Hack",
            slug: "hack",
            status: "completed",
            tenant_id: "t1",
            results_published_at: publicationVersion,
          },
          error: null,
        })
      }
      if (table === "hackathon_results") {
        resultsCall++
        if (resultsCall === 1) {
          return createIntegrationChainableMock({ data: [{ id: "r1" }], error: null })
        }
        if (resultsCall === 2) {
          return createIntegrationChainableMock({
            data: [{ id: "r1", published_at: null }],
            error: null,
          })
        }
        if (resultsCall === 3) {
          const chain = createIntegrationChainableMock({ data: [{ id: "r1" }], error: null })
          const originalUpdate = chain.update
          chain.update = mock((value: { published_at: string }) => {
            publicationVersion = value.published_at
            return originalUpdate(value)
          }) as typeof chain.update
          return chain
        }
        return createIntegrationChainableMock({
          data: [{ id: "r1", published_at: publicationVersion }],
          error: null,
        })
      }
      return createIntegrationChainableMock({ data: null, error: null })
    })

    await expect(publishResults("h1", "t1")).resolves.toEqual({ success: true })
    expect(publicationVersion).not.toBe("")
    expect(mockSendWinnerEmails).toHaveBeenCalledWith("h1")
  })

  it("starts a fresh winner delivery checkpoint for a new publication", async () => {
    let hackathonCallCount = 0
    mockFrom.mockImplementation((table: string) => {
      if (table === "hackathons") {
        hackathonCallCount++
        if (hackathonCallCount === 1) {
          return createIntegrationChainableMock({
            data: {
              id: "h1",
              status: "judging",
              tenant_id: "t1",
              winner_emails_sent_at: "2026-01-01T00:00:00Z",
            },
            error: null,
          })
        }
        if (hackathonCallCount === 2) {
          return createIntegrationChainableMock({ data: { id: "h1" }, error: null })
        }
        return createIntegrationChainableMock({ data: null, error: null })
      }
      if (table === "hackathon_results") {
        return createIntegrationChainableMock({ data: [{ id: "r1" }], error: null })
      }
      return createIntegrationChainableMock({ data: null, error: null })
    })

    const result = await publishResults("h1", "t1")

    expect(result.success).toBe(true)
    expect(mockSendWinnerEmails).toHaveBeenCalledWith("h1")
  })

  it("succeeds even when email sending fails", async () => {
    mockSendWinnerEmails.mockImplementation(() => Promise.reject(new Error("Email failed")))

    let hackathonCallCount = 0
    mockFrom.mockImplementation((table: string) => {
      if (table === "hackathons") {
        hackathonCallCount++
        if (hackathonCallCount === 1) {
          return createIntegrationChainableMock({
            data: { id: "h1", status: "judging", tenant_id: "t1", winner_emails_sent_at: null },
            error: null,
          })
        }
        if (hackathonCallCount === 2) {
          return createIntegrationChainableMock({ data: { id: "h1" }, error: null })
        }
        return createIntegrationChainableMock({ data: null, error: null })
      }
      if (table === "hackathon_results") {
        return createIntegrationChainableMock({ data: [{ id: "r1" }], error: null })
      }
      return createIntegrationChainableMock({ data: null, error: null })
    })

    const result = await publishResults("h1", "t1")

    expect(result.success).toBe(true)
  })

  it("updates winner_emails_sent_at timestamp after successful email send", async () => {
    let hackathonCallCount = 0
    let updateCalled = false
    mockFrom.mockImplementation((table: string) => {
      if (table === "hackathons") {
        hackathonCallCount++
        if (hackathonCallCount === 1) {
          return createIntegrationChainableMock({
            data: { id: "h1", status: "judging", tenant_id: "t1", winner_emails_sent_at: null },
            error: null,
          })
        }
        if (hackathonCallCount === 2) {
          return createIntegrationChainableMock({ data: { id: "h1" }, error: null })
        }
        if (hackathonCallCount === 3) {
          updateCalled = true
          return createIntegrationChainableMock({ data: null, error: null })
        }
        return createIntegrationChainableMock({ data: null, error: null })
      }
      if (table === "hackathon_results") {
        return createIntegrationChainableMock({ data: [{ id: "r1" }], error: null })
      }
      return createIntegrationChainableMock({ data: null, error: null })
    })

    const result = await publishResults("h1", "t1")

    expect(result.success).toBe(true)
    expect(updateCalled).toBe(true)
  })
})

describe("Results Integration - retryPendingResultEmails", () => {
  beforeEach(() => {
    mockFrom.mockClear()
    mockSendWinnerEmails.mockClear()
    mockGetNotificationSettings.mockClear()
    mockSendResultsAnnouncementEmails.mockClear()
    mockSendWinnerEmails.mockImplementation(() =>
      Promise.resolve({ attempted: 2, sent: 2, failed: 0 }),
    )
    mockGetNotificationSettings.mockImplementation(() =>
      Promise.resolve({ email_on_results_published: true }),
    )
    mockSendResultsAnnouncementEmails.mockImplementation(() =>
      Promise.resolve({ attempted: 4, sent: 4, failed: 0 }),
    )
  })

  it("delivers each pending result email once and stamps winner delivery", async () => {
    const updateChains: ReturnType<typeof createIntegrationChainableMock>[] = []
    let pendingChain: ReturnType<typeof createIntegrationChainableMock> | null = null
    let hackathonCall = 0
    mockFrom.mockImplementation((table: string) => {
      if (table !== "hackathons") {
        return createIntegrationChainableMock({ data: null, error: null })
      }

      hackathonCall++
      if (hackathonCall === 1) {
        pendingChain = createIntegrationChainableMock({
          data: [{
            id: "hack_pending",
            results_published_at: "2026-08-01T00:00:00.000Z",
            winner_emails_sent_at: null,
            results_announcement_sent_at: null,
          }],
          error: null,
        })
        return pendingChain
      }

      const chain = createIntegrationChainableMock({ data: { id: "hack_pending" }, error: null })
      updateChains.push(chain)
      return chain
    })

    await expect(retryPendingResultEmails(7)).resolves.toEqual({
      processed: 1,
      winnerEmailsSent: 2,
      resultEmailsSent: 4,
      errors: 0,
    })
    expect(mockSendWinnerEmails).toHaveBeenCalledTimes(1)
    expect(mockSendWinnerEmails).toHaveBeenCalledWith("hack_pending")
    expect(mockGetNotificationSettings).toHaveBeenCalledTimes(1)
    expect(mockSendResultsAnnouncementEmails).toHaveBeenCalledTimes(1)
    expect(mockSendResultsAnnouncementEmails).toHaveBeenCalledWith("hack_pending")
    expect(pendingChain?.eq).toHaveBeenCalledWith("is_test_event", false)
    expect(updateChains).toHaveLength(1)
    expect(updateChains[0]?.update).toHaveBeenCalledTimes(1)
    expect(updateChains[0]?.is).toHaveBeenCalledWith("winner_emails_sent_at", null)
  })

  it("records independent delivery failures and keeps both retries eligible", async () => {
    const error = mock(() => {})
    const originalError = console.error
    console.error = error
    mockFrom.mockImplementation(() =>
      createIntegrationChainableMock({
        data: [{
          id: "hack_retry",
          results_published_at: "2026-08-01T00:00:00.000Z",
          winner_emails_sent_at: null,
          results_announcement_sent_at: null,
        }],
        error: null,
      }),
    )
    mockSendWinnerEmails.mockImplementation(() => Promise.reject(new Error("provider down")))
    mockGetNotificationSettings.mockImplementation(() => Promise.reject(new Error("settings down")))

    try {
      await expect(retryPendingResultEmails()).resolves.toEqual({
        processed: 1,
        winnerEmailsSent: 0,
        resultEmailsSent: 0,
        errors: 2,
      })
      expect(mockSendWinnerEmails).toHaveBeenCalledTimes(1)
      expect(mockGetNotificationSettings).toHaveBeenCalledTimes(1)
      expect(mockSendResultsAnnouncementEmails).not.toHaveBeenCalled()
      expect(error).toHaveBeenCalledTimes(2)
    } finally {
      console.error = originalError
    }
  })

  it("honors disabled results mail without retrying an already-sent winner notice", async () => {
    const updateChains: ReturnType<typeof createIntegrationChainableMock>[] = []
    let hackathonCall = 0
    mockFrom.mockImplementation(() => {
      hackathonCall++
      if (hackathonCall === 1) {
        return createIntegrationChainableMock({
          data: [{
            id: "hack_opted_out",
            results_published_at: "2026-08-01T00:00:00.000Z",
            winner_emails_sent_at: "2026-08-01T00:00:00.000Z",
            results_announcement_sent_at: null,
          }],
          error: null,
        })
      }
      const chain = createIntegrationChainableMock({ data: { id: "hack_opted_out" }, error: null })
      updateChains.push(chain)
      return chain
    })
    mockGetNotificationSettings.mockImplementation(() =>
      Promise.resolve({ email_on_results_published: false }),
    )

    await expect(retryPendingResultEmails()).resolves.toEqual({
      processed: 1,
      winnerEmailsSent: 0,
      resultEmailsSent: 0,
      errors: 0,
    })
    expect(mockSendWinnerEmails).not.toHaveBeenCalled()
    expect(mockSendResultsAnnouncementEmails).not.toHaveBeenCalled()
    expect(updateChains).toHaveLength(1)
    expect(updateChains[0]?.update).toHaveBeenCalledWith({
      results_announcement_sent_at: expect.any(String),
    })
  })

  it("fails closed when the pending-delivery query fails", async () => {
    mockFrom.mockImplementation(() =>
      createIntegrationChainableMock({
        data: null,
        error: { message: "database unavailable" },
      }),
    )

    await expect(retryPendingResultEmails(3)).rejects.toThrow(
      "Failed to load pending results emails: database unavailable",
    )
    expect(mockSendWinnerEmails).not.toHaveBeenCalled()
    expect(mockSendResultsAnnouncementEmails).not.toHaveBeenCalled()
  })
})
