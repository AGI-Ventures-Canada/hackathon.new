import { describe, expect, it, beforeEach, mock } from "bun:test"
import {
  createChainableMock,
  resetSupabaseMocks,
  setMockFromImplementation,
} from "../lib/supabase-mock"

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

const { executeTransition, processAutoTransitions } = await import(
  "@/lib/services/lifecycle"
)

describe("Lifecycle Service", () => {
  beforeEach(() => {
    resetSupabaseMocks()
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
  })

  describe("executeTransition", () => {
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
        fromStatus: "draft",
        toStatus: "published",
        trigger: "manual",
        triggeredBy: "user1",
      })

      expect(result.success).toBe(true)
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

    it("still notifies on a normal auto active → completed", async () => {
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
      expect(mockDispatch).toHaveBeenCalledTimes(1)
      const call = mockDispatch.mock.calls[0][0] as { type: string }
      expect(call.type).toBe("results_published")
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
})
