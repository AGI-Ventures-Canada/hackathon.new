import { describe, it, expect, beforeEach } from "bun:test"
import {
  createChainableMock,
  resetSupabaseMocks,
  setMockFromImplementation,
} from "../lib/supabase-mock"

const { getManageOverviewStats } = await import("@/lib/services/manage-overview")

describe("getManageOverviewStats", () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  it("returns counts from parallel queries", async () => {
    setMockFromImplementation((table) => {
      if (table === "hackathon_participants") {
        return createChainableMock({ data: null, error: null, count: 25 })
      }
      if (table === "teams") {
        const chain = createChainableMock({ data: null, error: null, count: 8 })
        chain.eq.mockImplementation((column: string, value: string) => {
          if (column === "status" && value === "pending_approval") {
            return createChainableMock({ data: null, error: null, count: 2 })
          }
          return chain
        })
        return chain
      }
      if (table === "mentor_requests") {
        return createChainableMock({ data: null, error: null, count: 3 })
      }
      if (table === "hackathons") {
        return createChainableMock({ data: { challenge_released_at: "2026-04-01T00:00:00Z" }, error: null })
      }
      return createChainableMock({ data: null, error: null })
    })

    const result = await getManageOverviewStats("h1")

    expect(result.participantCount).toBe(25)
    expect(result.teamCount).toBe(8)
    expect(result.pendingTeamApprovalCount).toBe(2)
    expect(result.mentorQueue.open).toBe(3)
    expect(result.challengeReleased).toBe(true)
  })

  it("returns zeros on errors", async () => {
    setMockFromImplementation(() =>
      createChainableMock({ data: null, error: { message: "DB error" }, count: null })
    )

    const result = await getManageOverviewStats("h1")

    expect(result.participantCount).toBe(0)
    expect(result.teamCount).toBe(0)
    expect(result.pendingTeamApprovalCount).toBe(0)
    expect(result.mentorQueue.open).toBe(0)
    expect(result.challengeReleased).toBe(false)
  })

  it("returns challengeReleased false when not released", async () => {
    setMockFromImplementation((table) => {
      if (table === "hackathons") {
        return createChainableMock({ data: { challenge_released_at: null }, error: null })
      }
      return createChainableMock({ data: null, error: null, count: 0 })
    })

    const result = await getManageOverviewStats("h1")

    expect(result.challengeReleased).toBe(false)
  })
})
