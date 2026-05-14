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
        return createChainableMock({ data: null, error: null, count: 8 })
      }
      if (table === "mentor_requests") {
        return createChainableMock({ data: null, error: null, count: 3 })
      }
      if (table === "challenges") {
        return createChainableMock({ data: null, error: null, count: 2 })
      }
      return createChainableMock({ data: null, error: null })
    })

    const result = await getManageOverviewStats("h1")

    expect(result.participantCount).toBe(25)
    expect(result.teamCount).toBe(8)
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
    expect(result.mentorQueue.open).toBe(0)
    expect(result.challengeReleased).toBe(false)
  })

  it("returns challengeReleased false when no challenges have released_at", async () => {
    setMockFromImplementation((table) => {
      if (table === "challenges") {
        return createChainableMock({ data: null, error: null, count: 0 })
      }
      return createChainableMock({ data: null, error: null, count: 0 })
    })

    const result = await getManageOverviewStats("h1")

    expect(result.challengeReleased).toBe(false)
  })
})
