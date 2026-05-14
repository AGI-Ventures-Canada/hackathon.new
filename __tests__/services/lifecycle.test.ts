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

type ReleasedChallenge = {
  id: string
  hackathonId: string
  title: string
  description: string | null
  resources: never[]
  sortOrder: number
  createdAt: string
  updatedAt: string
  releasedAt: string | null
  scheduledReleaseAt: string | null
  releaseLinkedTo: "event_start" | "event_publish" | null
}

const mockReleaseLinkedChallenges = mock(
  (..._args: unknown[]) => Promise.resolve([] as ReleasedChallenge[]),
)
const mockProcessScheduledChallengeReleases = mock(() =>
  Promise.resolve({ processed: 0, releases: [], errors: [] }),
)
mock.module("@/lib/services/challenges", () => ({
  releaseLinkedChallenges: mockReleaseLinkedChallenges,
  processScheduledChallengeReleases: mockProcessScheduledChallengeReleases,
}))

const { executeTransition, processAutoTransitions } = await import(
  "@/lib/services/lifecycle"
)

function emptyReleased(): ReleasedChallenge[] {
  return []
}

describe("Lifecycle Service", () => {
  beforeEach(() => {
    resetSupabaseMocks()
    mockDispatch.mockClear()
    mockReleaseLinkedChallenges.mockClear()
    mockReleaseLinkedChallenges.mockImplementation(() => Promise.resolve(emptyReleased()))
    mockProcessScheduledChallengeReleases.mockClear()
    mockProcessScheduledChallengeReleases.mockImplementation(() =>
      Promise.resolve({ processed: 0, releases: [], errors: [] }),
    )
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

    function setupTransitionMocks(status: string) {
      const hackathon = {
        id: "h1",
        tenant_id: "t1",
        name: "Test Hack",
        slug: "test-hack",
        status,
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
    }

    function makeReleasedChallenge(title: string): ReleasedChallenge {
      return {
        id: title,
        hackathonId: "h1",
        title,
        description: `Build ${title}`,
        resources: [],
        sortOrder: 0,
        createdAt: "2026-05-14T00:00:00Z",
        updatedAt: "2026-05-14T00:00:00Z",
        releasedAt: "2026-05-14T00:00:00Z",
        scheduledReleaseAt: null,
        releaseLinkedTo: "event_start",
      }
    }

    it("releases event_publish-linked challenges when transitioning to published", async () => {
      setupTransitionMocks("published")
      mockReleaseLinkedChallenges.mockImplementationOnce(() =>
        Promise.resolve([makeReleasedChallenge("Publish-linked")]),
      )

      const result = await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "draft",
        toStatus: "published",
        trigger: "manual",
        triggeredBy: "user1",
      })

      expect(result.success).toBe(true)
      expect(mockReleaseLinkedChallenges).toHaveBeenCalledWith(
        "h1",
        "t1",
        "event_publish",
        expect.objectContaining({ dispatchNotification: false, trigger: "event_publish" }),
      )
      expect(mockProcessScheduledChallengeReleases).not.toHaveBeenCalled()
    })

    it("releases event_start-linked challenges and processes scheduled ones when going active", async () => {
      setupTransitionMocks("active")
      mockReleaseLinkedChallenges.mockImplementationOnce(() =>
        Promise.resolve([makeReleasedChallenge("Linked-A")]),
      )

      const result = await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "registration_open",
        toStatus: "active",
        trigger: "manual",
        triggeredBy: "user1",
      })

      expect(result.success).toBe(true)
      expect(mockReleaseLinkedChallenges).toHaveBeenCalledWith(
        "h1",
        "t1",
        "event_start",
        expect.objectContaining({ dispatchNotification: false, trigger: "event_start" }),
      )
      expect(mockProcessScheduledChallengeReleases).toHaveBeenCalledTimes(1)
    })

    it("does NOT call release functions for transitions other than published or active", async () => {
      setupTransitionMocks("registration_open")

      const result = await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "draft",
        toStatus: "registration_open",
        trigger: "manual",
        triggeredBy: "user1",
      })

      expect(result.success).toBe(true)
      expect(mockReleaseLinkedChallenges).not.toHaveBeenCalled()
      expect(mockProcessScheduledChallengeReleases).not.toHaveBeenCalled()
    })

    it("passes released challenges to dispatcher as coincidentChallenges", async () => {
      setupTransitionMocks("active")
      mockReleaseLinkedChallenges.mockImplementationOnce(() =>
        Promise.resolve([
          makeReleasedChallenge("Build It"),
          makeReleasedChallenge("Make Magic"),
        ]),
      )

      const result = await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "registration_open",
        toStatus: "active",
        trigger: "manual",
        triggeredBy: "user1",
      })

      expect(result.success).toBe(true)
      expect(mockDispatch).toHaveBeenCalledTimes(1)
      const dispatchCall = mockDispatch.mock.calls[0][0] as {
        type: string
        challenges?: Array<{ title: string }>
      }
      expect(dispatchCall.type).toBe("hackathon_started")
      expect(dispatchCall.challenges).toBeDefined()
      expect(dispatchCall.challenges).toHaveLength(2)
      expect(dispatchCall.challenges![0].title).toBe("Build It")
    })

    it("succeeds when no challenges are linked (empty release result)", async () => {
      setupTransitionMocks("active")

      const result = await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "registration_open",
        toStatus: "active",
        trigger: "manual",
        triggeredBy: "user1",
      })

      expect(result.success).toBe(true)
      expect(mockReleaseLinkedChallenges).toHaveBeenCalledTimes(1)
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
