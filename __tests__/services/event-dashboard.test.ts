import { describe, it, expect, beforeEach } from "bun:test"
import {
  createChainableMock,
  resetSupabaseMocks,
  setMockFromImplementation,
  mockSuccess,
  mockError,
} from "../lib/supabase-mock"

const { getLiveStats } = await import("@/lib/services/event-dashboard")

const HACKATHON_ID = "11111111-1111-1111-1111-111111111111"

describe("event-dashboard service", () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  describe("getLiveStats", () => {
    it("returns aggregated stats", async () => {
      setMockFromImplementation((table) => {
        if (table === "hackathons") return createChainableMock(mockSuccess({ status: "active", phase: "build" }))
        if (table === "rooms") return createChainableMock(mockSuccess([]))
        if (table === "room_teams") return createChainableMock(mockSuccess([]))
        if (table === "challenges") return createChainableMock({ data: null, error: null, count: 0 })
        return createChainableMock({ data: null, error: null, count: 3 })
      })

      const result = await getLiveStats(HACKATHON_ID)
      expect(result).not.toBeNull()
      expect(result!.status).toBe("active")
      expect(result!.phase).toBe("build")
      expect(result!.teamCount).toBe(3)
      expect(result!.challengeReleased).toBe(false)
    })

    it("returns null on hackathon not found", async () => {
      setMockFromImplementation(() => createChainableMock(mockError("Not found")))
      const result = await getLiveStats(HACKATHON_ID)
      expect(result).toBeNull()
    })

    it("includes room status", async () => {
      const rooms = [{ id: "r1", name: "Room A" }]
      const roomTeams = [
        { room_id: "r1", has_presented: true },
        { room_id: "r1", has_presented: false },
      ]
      setMockFromImplementation((table) => {
        if (table === "hackathons") return createChainableMock(mockSuccess({ status: "judging", phase: "preliminaries" }))
        if (table === "rooms") return createChainableMock(mockSuccess(rooms))
        if (table === "room_teams") return createChainableMock(mockSuccess(roomTeams))
        if (table === "challenges") return createChainableMock({ data: null, error: null, count: 2 })
        return createChainableMock({ data: null, error: null, count: 0 })
      })

      const result = await getLiveStats(HACKATHON_ID)
      expect(result!.roomStatus).toHaveLength(1)
      expect(result!.roomStatus[0].presented).toBe(1)
      expect(result!.roomStatus[0].total).toBe(2)
      expect(result!.challengeReleased).toBe(true)
    })
  })
})
