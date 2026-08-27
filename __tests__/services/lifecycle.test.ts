import { describe, expect, it, beforeEach, mock } from "bun:test"
import {
  createChainableMock,
  resetSupabaseMocks,
  setMockFromImplementation,
  type ChainableMock,
} from "../lib/supabase-mock"

const leaseOrder: string[] = []
async function runWithEventMutationLease(
  _hackathonId: string,
  mutation: () => Promise<unknown>,
) {
  leaseOrder.push("acquired")
  try {
    return await mutation()
  } finally {
    leaseOrder.push("released")
  }
}
const mockWithEventMutationLease = mock(runWithEventMutationLease)
class MockEventMutationLeaseError extends Error {
  constructor(
    message: string,
    public readonly code: "event_busy" | "lease_unavailable",
  ) {
    super(message)
    this.name = "EventMutationLeaseError"
  }
}
mock.module("@/lib/services/event-mutation-lease", () => ({
  EventMutationLeaseError: MockEventMutationLeaseError,
  withEventMutationLease: mockWithEventMutationLease,
}))

const mockDispatch = mock(() => Promise.resolve())
mock.module("@/lib/services/notification-dispatcher", () => ({
  dispatchTransitionNotifications: mockDispatch,
}))

const mockReleaseChallenges = mock(() => Promise.resolve(true))
const mockListChallenges = mock(() => Promise.resolve([] as Array<{ title: string; description: string | null }>))
mock.module("@/lib/services/challenges", () => ({
  releaseChallenges: mockReleaseChallenges,
  listChallenges: mockListChallenges,
}))

const mockGetTriggerItem = mock(() => Promise.resolve(null))
mock.module("@/lib/services/schedule-items", () => ({
  getTriggerItem: mockGetTriggerItem,
}))

const mockDenyPendingTeamsForClosedHackathon = mock(() => Promise.resolve({ denied: 0, failed: [] }))
mock.module("@/lib/services/hackathons", () => ({
  denyPendingTeamsForClosedHackathon: mockDenyPendingTeamsForClosedHackathon,
}))

const mockCancelRemindersForEntity = mock(() => Promise.resolve())
const mockScheduleReminders = mock(() => Promise.resolve(0))
mock.module("@/lib/services/smart-reminders", () => ({
  cancelRemindersForEntity: mockCancelRemindersForEntity,
  scheduleReminders: mockScheduleReminders,
}))

const {
  executeTransition,
  processAutoTransitions,
  reconcilePendingTeamsForClosedHackathons,
} = await import(
  "@/lib/services/lifecycle"
)

describe("Lifecycle Service", () => {
  beforeEach(() => {
    resetSupabaseMocks()
    leaseOrder.length = 0
    mockWithEventMutationLease.mockReset()
    mockWithEventMutationLease.mockImplementation(runWithEventMutationLease)
    mockDispatch.mockClear()
    mockReleaseChallenges.mockClear()
    mockReleaseChallenges.mockImplementation(() => Promise.resolve(true))
    mockListChallenges.mockClear()
    mockListChallenges.mockImplementation(() => Promise.resolve([]))
    mockGetTriggerItem.mockClear()
    mockGetTriggerItem.mockResolvedValue(null)
    mockDenyPendingTeamsForClosedHackathon.mockClear()
    mockDenyPendingTeamsForClosedHackathon.mockResolvedValue({ denied: 0, failed: [] })
    mockCancelRemindersForEntity.mockClear()
    mockCancelRemindersForEntity.mockResolvedValue(undefined)
    mockScheduleReminders.mockClear()
    mockScheduleReminders.mockResolvedValue(0)
  })

  describe("executeTransition", () => {
    it("returns a stable event-busy code without running transition side effects", async () => {
      mockWithEventMutationLease.mockRejectedValueOnce(
        new MockEventMutationLeaseError(
          "Another event change is still being saved.",
          "event_busy",
        ),
      )

      const result = await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "draft",
        toStatus: "published",
        trigger: "manual",
        triggeredBy: "user1",
      })

      expect(result).toEqual({
        success: false,
        error: "Another event change is still being saved.",
        code: "event_busy",
      })
      expect(mockGetTriggerItem).not.toHaveBeenCalled()
      expect(mockDispatch).not.toHaveBeenCalled()
    })

    it("rejects invalid transitions", async () => {
      const result = await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "draft",
        toStatus: "active",
        trigger: "manual",
        triggeredBy: "user1",
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain("Invalid transition")
    })

    it("rejects transition from archived", async () => {
      const result = await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "archived",
        toStatus: "completed",
        trigger: "manual",
        triggeredBy: "user1",
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain("Invalid transition")
    })

    it("allows draft → published", async () => {
      const hackathon = {
        id: "h1",
        tenant_id: "t1",
        name: "Test Hack",
        slug: "test-hack",
        status: "published",
      }

      let hackathonChain: ChainableMock | undefined
      setMockFromImplementation((table) => {
        if (table === "hackathon_transitions") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "hackathons") {
          const chain = createChainableMock({ data: hackathon, error: null })
          hackathonChain ??= chain
          return chain
        }
        return createChainableMock({ data: null, error: null })
      })
      mockGetTriggerItem.mockImplementation(() => {
        leaseOrder.push("side-effect")
        return Promise.resolve(null)
      })

      const result = await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "draft",
        toStatus: "published",
        trigger: "manual",
        triggeredBy: "user1",
        registrationOpensAt: "2026-08-26T12:00:00.000Z",
        registrationClosesAt: "2026-09-10T12:00:00.000Z",
      })

      expect(result.success).toBe(true)
      expect(leaseOrder).toEqual(["acquired", "released", "side-effect"])
      const updateCalls = hackathonChain!.update.mock.calls as unknown as Array<[
        Record<string, unknown>,
      ]>
      expect(updateCalls[0]![0]).toMatchObject({
        status: "published",
        registration_opens_at: "2026-08-26T12:00:00.000Z",
        registration_closes_at: "2026-09-10T12:00:00.000Z",
      })
    })

    it("commits completion and result visibility in one event update", async () => {
      const hackathon = {
        id: "h1",
        tenant_id: "t1",
        name: "Test Hack",
        slug: "test-hack",
        status: "completed",
      }
      let hackathonCalls = 0
      let hackathonChain: ChainableMock | undefined
      let resultsChain: ChainableMock | undefined
      setMockFromImplementation((table) => {
        if (table === "hackathon_transitions") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "hackathon_results") {
          resultsChain = createChainableMock({ data: [{ id: "result_1" }], error: null })
          return resultsChain
        }
        hackathonCalls++
        hackathonChain = createChainableMock({
          data: hackathonCalls === 1
            ? { status: "judging", results_published_at: null }
            : hackathon,
          error: null,
        })
        return hackathonChain
      })

      const result = await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "judging",
        toStatus: "completed",
        trigger: "manual",
        triggeredBy: "system",
        resultsPublication: { publishedAt: "2026-08-26T12:00:00.000Z" },
      })

      expect(result.success).toBe(true)
      const update = hackathonChain!.update.mock.calls[0]![0] as Record<string, unknown>
      expect(update).toMatchObject({
        status: "completed",
        results_published_at: "2026-08-26T12:00:00.000Z",
        winner_emails_sent_at: null,
        results_announcement_sent_at: null,
      })
      expect(resultsChain!.update).toHaveBeenCalledWith({
        published_at: "2026-08-26T12:00:00.000Z",
      })
    })

    it("rolls back staged result visibility when completion loses its status check", async () => {
      const resultsChain = createChainableMock({ data: [{ id: "result_1" }], error: null })
      let hackathonCalls = 0
      setMockFromImplementation((table) => {
        if (table === "hackathon_results") return resultsChain
        if (table === "hackathons") {
          hackathonCalls++
          return createChainableMock({
            data: hackathonCalls === 2
              ? null
              : { status: "judging", results_published_at: null },
            error: null,
          })
        }
        return createChainableMock({ data: [], error: null })
      })

      const result = await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "judging",
        toStatus: "completed",
        trigger: "manual",
        triggeredBy: "system",
        resultsPublication: { publishedAt: "2026-08-26T12:00:00.000Z" },
      })

      expect(result).toEqual(expect.objectContaining({
        success: false,
        code: "event_changed",
      }))
      expect(resultsChain.update).toHaveBeenNthCalledWith(1, {
        published_at: "2026-08-26T12:00:00.000Z",
      })
      expect(resultsChain.update).toHaveBeenNthCalledWith(2, { published_at: null })
    })

    it("recovers completion when the committed event update response is lost", async () => {
      const publishedAt = "2026-08-26T12:00:00.000Z"
      let hackathonCalls = 0
      let resultCalls = 0
      const resultChains: ChainableMock[] = []
      setMockFromImplementation((table) => {
        if (table === "hackathons") {
          hackathonCalls++
          if (hackathonCalls === 1) {
            return createChainableMock({
              data: { status: "judging", results_published_at: null },
              error: null,
            })
          }
          if (hackathonCalls === 2) {
            const chain = createChainableMock({ data: null, error: null })
            chain.then = (() => {
              throw new Error("response lost")
            }) as typeof chain.then
            return chain
          }
          return createChainableMock({
            data: {
              id: "h1",
              tenant_id: "t1",
              name: "Test Hack",
              slug: "test-hack",
              status: "completed",
              results_published_at: publishedAt,
            },
            error: null,
          })
        }
        if (table === "hackathon_results") {
          resultCalls++
          const chain = createChainableMock({
            data: resultCalls === 1
              ? [{ id: "result_1" }]
              : [{ id: "result_1", published_at: publishedAt }],
            error: null,
          })
          resultChains.push(chain)
          return chain
        }
        return createChainableMock({ data: [], error: null })
      })

      await expect(executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "judging",
        toStatus: "completed",
        trigger: "manual",
        triggeredBy: "system",
        resultsPublication: { publishedAt },
      })).resolves.toEqual(expect.objectContaining({ success: true }))
      expect(resultChains[0]?.update).toHaveBeenCalledTimes(1)
      expect(resultChains.some((chain) =>
        chain.update.mock.calls.some((call) =>
          (call[0] as { published_at?: string | null }).published_at === null,
        ),
      )).toBe(false)
    })

    it("allows published → registration_open", async () => {
      const hackathon = {
        id: "h1",
        tenant_id: "t1",
        name: "Test Hack",
        slug: "test-hack",
        status: "registration_open",
      }

      setMockFromImplementation((table) => {
        if (table === "hackathon_transitions") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "hackathons") {
          return createChainableMock({ data: hackathon, error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "published",
        toStatus: "registration_open",
        trigger: "manual",
        triggeredBy: "user1",
      })

      expect(result.success).toBe(true)
    })

    it.each([
      ["active", "completed"],
      ["completed", "archived"],
    ] as const)("denies pending teams when transitioning %s → %s", async (fromStatus, toStatus) => {
      const hackathon = {
        id: "h1",
        tenant_id: "t1",
        name: "Test Hack",
        slug: "test-hack",
        status: toStatus,
      }

      setMockFromImplementation((table) => {
        if (table === "hackathon_transitions") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "hackathons") {
          return createChainableMock({ data: hackathon, error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus,
        toStatus,
        trigger: "manual",
        triggeredBy: "user1",
      })

      expect(result.success).toBe(true)
      expect(mockDenyPendingTeamsForClosedHackathon).toHaveBeenCalledWith("h1")
      expect(mockCancelRemindersForEntity).toHaveBeenCalledWith("hackathon_event", "h1")
    })

    it("retries pending-team closeout before returning from completion", async () => {
      const hackathon = {
        id: "h1",
        tenant_id: "t1",
        name: "Test Hack",
        slug: "test-hack",
        status: "completed",
      }
      setMockFromImplementation((table) => {
        if (table === "hackathon_transitions") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "hackathons") {
          return createChainableMock({ data: hackathon, error: null })
        }
        return createChainableMock({ data: null, error: null })
      })
      mockDenyPendingTeamsForClosedHackathon
        .mockResolvedValueOnce({
          denied: 0,
          failed: [{ teamId: "team-1", code: "failed" }],
        })
        .mockResolvedValueOnce({ denied: 1, failed: [] })

      const result = await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "active",
        toStatus: "completed",
        trigger: "auto",
        triggeredBy: "system",
      })

      expect(result.success).toBe(true)
      expect(mockDenyPendingTeamsForClosedHackathon).toHaveBeenCalledTimes(2)
    })

    it("cancels pre-event reminders when moving back to draft", async () => {
      const hackathon = {
        id: "h1",
        tenant_id: "t1",
        name: "Test Hack",
        slug: "test-hack",
        status: "draft",
      }
      setMockFromImplementation((table) => {
        if (table === "hackathon_transitions") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "hackathons") {
          return createChainableMock({ data: hackathon, error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "published",
        toStatus: "draft",
        trigger: "manual",
        triggeredBy: "user1",
      })

      expect(result.success).toBe(true)
      expect(mockDenyPendingTeamsForClosedHackathon).not.toHaveBeenCalled()
      expect(mockCancelRemindersForEntity).toHaveBeenCalledWith("hackathon_event", "h1")
    })

    it("allows the auto path to finalize an ended event that skipped stages", async () => {
      const hackathon = {
        id: "h1",
        tenant_id: "t1",
        name: "Test Hack",
        slug: "test-hack",
        status: "completed",
      }

      setMockFromImplementation((table) => {
        if (table === "hackathon_transitions") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "hackathons") {
          return createChainableMock({ data: hackathon, error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "registration_open",
        toStatus: "completed",
        trigger: "auto",
        triggeredBy: "system",
      })

      expect(result.success).toBe(true)
      expect(mockDenyPendingTeamsForClosedHackathon).toHaveBeenCalledWith("h1")
      expect(mockDispatch).not.toHaveBeenCalled()
    })

    it("allows the auto path to finalize an ended event stuck in published", async () => {
      const hackathon = {
        id: "h1",
        tenant_id: "t1",
        name: "Test Hack",
        slug: "test-hack",
        status: "completed",
      }

      setMockFromImplementation((table) => {
        if (table === "hackathon_transitions") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "hackathons") {
          return createChainableMock({ data: hackathon, error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "published",
        toStatus: "completed",
        trigger: "auto",
        triggeredBy: "system",
      })

      expect(result.success).toBe(true)
      expect(mockDenyPendingTeamsForClosedHackathon).toHaveBeenCalledWith("h1")
      expect(mockDispatch).not.toHaveBeenCalled()
    })

    it("does not call an event ending results publication", async () => {
      const hackathon = {
        id: "h1",
        tenant_id: "t1",
        name: "Test Hack",
        slug: "test-hack",
        status: "completed",
      }

      setMockFromImplementation((table) => {
        if (table === "hackathon_transitions") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "hackathons") {
          return createChainableMock({ data: hackathon, error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "active",
        toStatus: "completed",
        trigger: "auto",
        triggeredBy: "system",
      })

      expect(result.success).toBe(true)
      expect(mockDispatch).not.toHaveBeenCalled()
    })

    it("still rejects a manual registration_open → completed jump", async () => {
      const result = await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "registration_open",
        toStatus: "completed",
        trigger: "manual",
        triggeredBy: "user1",
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain("Invalid transition")
    })

    it("dispatches notifications for status with mapped event", async () => {
      const hackathon = {
        id: "h1",
        tenant_id: "t1",
        name: "Test Hack",
        slug: "test-hack",
        status: "active",
      }

      setMockFromImplementation((table) => {
        if (table === "hackathon_transitions") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "hackathons") {
          return createChainableMock({ data: hackathon, error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "registration_open",
        toStatus: "active",
        trigger: "auto",
        triggeredBy: "system",
      })

      expect(result.success).toBe(true)
      expect(mockDispatch).toHaveBeenCalledTimes(1)
      const call = mockDispatch.mock.calls[0][0] as { type: string }
      expect(call.type).toBe("hackathon_started")
    })

    it("auto-releases challenges when going active with the trigger item still linked to event_start", async () => {
      const hackathon = {
        id: "h1",
        tenant_id: "t1",
        name: "Test Hack",
        slug: "test-hack",
        status: "active",
      }

      setMockFromImplementation((table) => {
        if (table === "hackathon_transitions") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "hackathons") {
          return createChainableMock({ data: hackathon, error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      mockGetTriggerItem.mockResolvedValue({
        id: "item-1",
        trigger_type: "challenge_release",
        starts_at: "2026-04-10T09:00:00Z",
        linked_to: "event_start",
      })

      const result = await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "registration_open",
        toStatus: "active",
        trigger: "manual",
        triggeredBy: "user1",
      })

      expect(result.success).toBe(true)
      expect(mockGetTriggerItem).toHaveBeenCalledWith("h1", "challenge_release")
      expect(mockReleaseChallenges).toHaveBeenCalledWith(
        "h1",
        "t1",
        expect.objectContaining({
          dispatchNotification: false,
          trigger: "event_start",
        }),
      )
    })

    it("auto-releases challenges on active transition with linked_to event_publish (covers skipped-published path)", async () => {
      const hackathon = {
        id: "h1",
        tenant_id: "t1",
        name: "Test Hack",
        slug: "test-hack",
        status: "active",
      }

      setMockFromImplementation((table) => {
        if (table === "hackathon_transitions") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "hackathons") {
          return createChainableMock({ data: hackathon, error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      mockGetTriggerItem.mockResolvedValue({
        id: "item-1",
        trigger_type: "challenge_release",
        starts_at: "2026-04-10T09:00:00Z",
        linked_to: "event_publish",
      })

      const result = await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "registration_open",
        toStatus: "active",
        trigger: "manual",
        triggeredBy: "user1",
      })

      expect(result.success).toBe(true)
      expect(mockReleaseChallenges).toHaveBeenCalledWith(
        "h1",
        "t1",
        expect.objectContaining({
          dispatchNotification: false,
          trigger: "event_publish",
        }),
      )
    })

    it("auto-releases challenges when transitioning to published with linked_to event_publish", async () => {
      const hackathon = {
        id: "h1",
        tenant_id: "t1",
        name: "Test Hack",
        slug: "test-hack",
        status: "published",
      }

      setMockFromImplementation((table) => {
        if (table === "hackathon_transitions") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "hackathons") {
          return createChainableMock({ data: hackathon, error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      mockGetTriggerItem.mockResolvedValue({
        id: "item-1",
        trigger_type: "challenge_release",
        starts_at: "2026-04-10T09:00:00Z",
        linked_to: "event_publish",
      })

      const result = await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "draft",
        toStatus: "published",
        trigger: "manual",
        triggeredBy: "user1",
      })

      expect(result.success).toBe(true)
      expect(mockGetTriggerItem).toHaveBeenCalledWith("h1", "challenge_release")
      expect(mockReleaseChallenges).toHaveBeenCalledWith(
        "h1",
        "t1",
        expect.objectContaining({
          dispatchNotification: false,
          trigger: "event_publish",
        }),
      )
    })

    it("does NOT release challenges when transitioning to registration_open with linked_to event_publish", async () => {
      const hackathon = {
        id: "h1",
        tenant_id: "t1",
        name: "Test Hack",
        slug: "test-hack",
        status: "registration_open",
      }

      setMockFromImplementation((table) => {
        if (table === "hackathon_transitions") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "hackathons") {
          return createChainableMock({ data: hackathon, error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      mockGetTriggerItem.mockResolvedValue({
        id: "item-1",
        trigger_type: "challenge_release",
        starts_at: "2026-04-10T09:00:00Z",
        linked_to: "event_publish",
      })

      const result = await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "draft",
        toStatus: "registration_open",
        trigger: "manual",
        triggeredBy: "user1",
      })

      expect(result.success).toBe(true)
      expect(mockGetTriggerItem).not.toHaveBeenCalled()
      expect(mockReleaseChallenges).not.toHaveBeenCalled()
    })

    it("does NOT release challenges when transitioning to published with linked_to event_start", async () => {
      const hackathon = {
        id: "h1",
        tenant_id: "t1",
        name: "Test Hack",
        slug: "test-hack",
        status: "published",
      }

      setMockFromImplementation((table) => {
        if (table === "hackathon_transitions") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "hackathons") {
          return createChainableMock({ data: hackathon, error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      mockGetTriggerItem.mockResolvedValue({
        id: "item-1",
        trigger_type: "challenge_release",
        starts_at: "2026-04-10T09:00:00Z",
        linked_to: "event_start",
      })

      const result = await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "draft",
        toStatus: "published",
        trigger: "manual",
        triggeredBy: "user1",
      })

      expect(result.success).toBe(true)
      expect(mockReleaseChallenges).not.toHaveBeenCalled()
    })

    it("auto-releases challenges when going active with a custom time already in the past", async () => {
      const hackathon = {
        id: "h1",
        tenant_id: "t1",
        name: "Test Hack",
        slug: "test-hack",
        status: "active",
      }

      setMockFromImplementation((table) => {
        if (table === "hackathon_transitions") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "hackathons") {
          return createChainableMock({ data: hackathon, error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      mockGetTriggerItem.mockResolvedValue({
        id: "item-1",
        trigger_type: "challenge_release",
        starts_at: new Date(Date.now() - 60_000).toISOString(),
        linked_to: null,
      })

      const result = await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "registration_open",
        toStatus: "active",
        trigger: "manual",
        triggeredBy: "user1",
      })

      expect(result.success).toBe(true)
      expect(mockReleaseChallenges).toHaveBeenCalledWith(
        "h1",
        "t1",
        expect.objectContaining({
          dispatchNotification: false,
          trigger: "scheduled",
        }),
      )
    })

    it("does NOT release challenges when going active with a custom future time", async () => {
      const hackathon = {
        id: "h1",
        tenant_id: "t1",
        name: "Test Hack",
        slug: "test-hack",
        status: "active",
      }

      setMockFromImplementation((table) => {
        if (table === "hackathon_transitions") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "hackathons") {
          return createChainableMock({ data: hackathon, error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      mockGetTriggerItem.mockResolvedValue({
        id: "item-1",
        trigger_type: "challenge_release",
        starts_at: new Date(Date.now() + 60 * 60_000).toISOString(),
        linked_to: null,
      })

      const result = await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "registration_open",
        toStatus: "active",
        trigger: "manual",
        triggeredBy: "user1",
      })

      expect(result.success).toBe(true)
      expect(mockGetTriggerItem).toHaveBeenCalledWith("h1", "challenge_release")
      expect(mockReleaseChallenges).not.toHaveBeenCalled()
    })

    it("passes challenges to dispatcher when coincident with go-live", async () => {
      const hackathon = {
        id: "h1",
        tenant_id: "t1",
        name: "Test Hack",
        slug: "test-hack",
        status: "active",
      }

      setMockFromImplementation((table) => {
        if (table === "hackathon_transitions") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "hackathons") {
          return createChainableMock({ data: hackathon, error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      mockGetTriggerItem.mockResolvedValue({
        id: "item-1",
        trigger_type: "challenge_release",
        starts_at: "2026-04-10T09:00:00Z",
        linked_to: "event_start",
      })
      mockListChallenges.mockResolvedValue([
        { title: "Build It", description: "Make something cool" },
      ])

      const result = await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "registration_open",
        toStatus: "active",
        trigger: "manual",
        triggeredBy: "user1",
      })

      expect(result.success).toBe(true)
      expect(mockReleaseChallenges).toHaveBeenCalledWith(
        "h1",
        "t1",
        expect.objectContaining({
          dispatchNotification: false,
          trigger: "event_start",
        }),
      )

      expect(mockDispatch).toHaveBeenCalledTimes(1)
      const dispatchCall = mockDispatch.mock.calls[0][0] as {
        type: string
        challenges?: Array<{ title: string }>
      }
      expect(dispatchCall.type).toBe("hackathon_started")
      expect(dispatchCall.challenges).toBeDefined()
      expect(dispatchCall.challenges).toHaveLength(1)
      expect(dispatchCall.challenges![0].title).toBe("Build It")
    })

    it("does not release challenges when no challenge_release schedule item exists", async () => {
      const hackathon = {
        id: "h1",
        tenant_id: "t1",
        name: "Test Hack",
        slug: "test-hack",
        status: "active",
      }

      setMockFromImplementation((table) => {
        if (table === "hackathon_transitions") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "hackathons") {
          return createChainableMock({ data: hackathon, error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      mockGetTriggerItem.mockResolvedValue(null)

      const result = await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "registration_open",
        toStatus: "active",
        trigger: "manual",
        triggeredBy: "user1",
      })

      expect(result.success).toBe(true)
      expect(mockGetTriggerItem).toHaveBeenCalledWith("h1", "challenge_release")
      expect(mockReleaseChallenges).not.toHaveBeenCalled()
    })

    it("fails when status has already changed (optimistic lock)", async () => {
      setMockFromImplementation((table) => {
        if (table === "hackathons") {
          return createChainableMock({ data: null, error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "draft",
        toStatus: "published",
        trigger: "manual",
        triggeredBy: "user1",
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain("status has already changed")
      expect(result.code).toBe("event_changed")
    })

    it("handles DB update failure", async () => {
      setMockFromImplementation((table) => {
        if (table === "hackathons") {
          return createChainableMock({
            data: null,
            error: { message: "DB error" },
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "draft",
        toStatus: "published",
        trigger: "manual",
        triggeredBy: "user1",
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain("Failed to update status")
      expect(result.code).toBe("transition_unavailable")
    })
  })

  describe("processAutoTransitions", () => {
    it("returns empty when no hackathons need transitions", async () => {
      setMockFromImplementation((table) => {
        if (table === "hackathons") {
          return createChainableMock({ data: [], error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await processAutoTransitions()

      expect(result.processed).toBe(0)
      expect(result.transitions).toHaveLength(0)
    })

    it("detects and processes hackathon that should be active", async () => {
      const pastDate = new Date(Date.now() - 3600000).toISOString()
      const futureDate = new Date(Date.now() + 86400000).toISOString()

      const hackathons = [
        {
          id: "h1",
          tenant_id: "t1",
          status: "registration_open",
          starts_at: pastDate,
          ends_at: futureDate,
          name: "Test Hack",
          slug: "test-hack",
        },
      ]

      let callCount = 0
      setMockFromImplementation((table) => {
        if (table === "hackathons") {
          callCount++
          if (callCount === 1) {
            return createChainableMock({ data: hackathons, error: null })
          }
          return createChainableMock({
            data: { ...hackathons[0], status: "active" },
            error: null,
          })
        }
        if (table === "hackathon_transitions") {
          return createChainableMock({ data: [], error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await processAutoTransitions()

      expect(result.processed).toBe(1)
      expect(result.transitions[0].from).toBe("registration_open")
      expect(result.transitions[0].to).toBe("active")
    })

    it("finalizes an event that ended while still in registration_open", async () => {
      const past = new Date(Date.now() - 86400000).toISOString()
      const earlier = new Date(Date.now() - 2 * 86400000).toISOString()

      const hackathons = [
        {
          id: "h1",
          tenant_id: "t1",
          status: "registration_open",
          starts_at: earlier,
          ends_at: past,
          name: "Test Hack",
          slug: "test-hack",
        },
      ]

      let callCount = 0
      setMockFromImplementation((table) => {
        if (table === "hackathons") {
          callCount++
          if (callCount === 1) {
            return createChainableMock({ data: hackathons, error: null })
          }
          return createChainableMock({
            data: { ...hackathons[0], status: "completed" },
            error: null,
          })
        }
        if (table === "hackathon_transitions") {
          return createChainableMock({ data: [], error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await processAutoTransitions()

      expect(result.processed).toBe(1)
      expect(result.errors).toHaveLength(0)
      expect(result.transitions[0].from).toBe("registration_open")
      expect(result.transitions[0].to).toBe("completed")
    })

    it("keeps committed transitions successful when pending-team closeout fails", async () => {
      const startsAt = new Date(Date.now() - 2 * 86400000).toISOString()
      const endsAt = new Date(Date.now() - 86400000).toISOString()
      const hackathons = [
        {
          id: "h1",
          tenant_id: "t1",
          status: "active",
          starts_at: startsAt,
          ends_at: endsAt,
          name: "First Hack",
          slug: "first-hack",
        },
        {
          id: "h2",
          tenant_id: "t2",
          status: "active",
          starts_at: startsAt,
          ends_at: endsAt,
          name: "Second Hack",
          slug: "second-hack",
        },
      ]
      let hackathonCalls = 0
      setMockFromImplementation((table) => {
        if (table === "hackathons") {
          hackathonCalls++
          return createChainableMock({
            data: hackathonCalls === 1
              ? hackathons
              : { ...hackathons[hackathonCalls - 2], status: "completed" },
            error: null,
          })
        }
        if (table === "hackathon_transitions") {
          return createChainableMock({ data: [], error: null })
        }
        return createChainableMock({ data: null, error: null })
      })
      mockDenyPendingTeamsForClosedHackathon
        .mockRejectedValueOnce(new Error("closeout unavailable"))
        .mockResolvedValue({ denied: 0, failed: [] })

      const result = await processAutoTransitions()

      expect(result.processed).toBe(2)
      expect(result.transitions).toEqual([
        { hackathonId: "h1", from: "active", to: "completed" },
        { hackathonId: "h2", from: "active", to: "completed" },
      ])
      expect(result.errors).toEqual([])
    })

    it("handles DB fetch error gracefully", async () => {
      setMockFromImplementation((table) => {
        if (table === "hackathons") {
          return createChainableMock({
            data: null,
            error: { message: "Connection failed" },
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await processAutoTransitions()

      expect(result.processed).toBe(0)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toContain("Connection failed")
    })
  })

  describe("reconcilePendingTeamsForClosedHackathons", () => {
    it("retries closeout for each closed event with a waiting team", async () => {
      setMockFromImplementation((table) => {
        if (table === "teams") {
          return createChainableMock({
            data: [
              { hackathon_id: "h1" },
              { hackathon_id: "h1" },
              { hackathon_id: "h2" },
            ],
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })
      mockDenyPendingTeamsForClosedHackathon
        .mockResolvedValueOnce({ denied: 2, failed: [] })
        .mockResolvedValueOnce({
          denied: 0,
          failed: [{ teamId: "team-3", code: "failed" }],
        })

      const result = await reconcilePendingTeamsForClosedHackathons()

      expect(result).toEqual({
        events: 2,
        denied: 2,
        failed: 1,
        errors: ["h2: team-3:failed"],
      })
      expect(mockDenyPendingTeamsForClosedHackathon).toHaveBeenCalledTimes(2)
    })

    it("reports the closed-team queue read failure", async () => {
      setMockFromImplementation(() => createChainableMock({
        data: null,
        error: { message: "queue unavailable" },
      }))

      expect(await reconcilePendingTeamsForClosedHackathons()).toEqual({
        events: 0,
        denied: 0,
        failed: 0,
        errors: ["queue unavailable"],
      })
    })
  })
})
