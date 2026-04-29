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
mock.module("@/lib/services/challenges", () => ({
  releaseChallenges: mockReleaseChallenges,
}))

const mockGetTriggerItem = mock(() => Promise.resolve(null))
mock.module("@/lib/services/schedule-items", () => ({
  getTriggerItem: mockGetTriggerItem,
}))

const { executeTransition, processAutoTransitions } = await import(
  "@/lib/services/lifecycle"
)

describe("Lifecycle Service", () => {
  beforeEach(() => {
    resetSupabaseMocks()
    mockDispatch.mockClear()
    mockReleaseChallenges.mockClear()
    mockGetTriggerItem.mockClear()
    mockGetTriggerItem.mockResolvedValue(null)
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
      expect(mockReleaseChallenges).toHaveBeenCalledWith("h1", "t1")
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
      expect(mockReleaseChallenges).toHaveBeenCalledWith("h1", "t1")
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
      expect(mockReleaseChallenges).toHaveBeenCalledWith("h1", "t1")
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
