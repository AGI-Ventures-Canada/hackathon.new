import { describe, it, expect, beforeEach } from "bun:test"
import type { JudgePick } from "@/lib/db/hackathon-types"
import {
  createChainableMock,
  resetSupabaseMocks,
  setMockFromImplementation,
  setMockRpcImplementation,
} from "../lib/supabase-mock"

const {
  getJudgePicks,
  getPicksForPrize,
  submitPick,
  removePick,
  getPickResults,
  isJudgingComplete,
} = await import("@/lib/services/judge-picks")

const mockPick: JudgePick = {
  id: "pick1",
  hackathon_id: "h1",
  judge_participant_id: "jp1",
  prize_id: "p1",
  submission_id: "s1",
  rank: 1,
  reason: "Great project",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
}

describe("Judge Picks Service", () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  describe("getJudgePicks", () => {
    it("returns picks for a judge", async () => {
      const chain = createChainableMock({
        data: [mockPick],
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await getJudgePicks("h1", "jp1")
      expect(result).toHaveLength(1)
      expect(result[0].prize_id).toBe("p1")
    })

    it("returns empty array on error", async () => {
      const chain = createChainableMock({
        data: null,
        error: { message: "DB error" },
      })
      setMockFromImplementation(() => chain)

      const result = await getJudgePicks("h1", "jp1")
      expect(result).toEqual([])
    })
  })

  describe("getPicksForPrize", () => {
    it("returns picks for a prize", async () => {
      const chain = createChainableMock({
        data: [mockPick, { ...mockPick, id: "pick2", judge_participant_id: "jp2" }],
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await getPicksForPrize("h1", "p1")
      expect(result).toHaveLength(2)
    })
  })

  describe("submitPick", () => {
    it("creates a pick successfully", async () => {
      const pickChain = createChainableMock({
        data: mockPick,
        error: null,
      })
      setMockFromImplementation((table) => {
        if (table === "prizes" || table === "submissions") {
          return createChainableMock({ data: { id: table === "prizes" ? "p1" : "s1" }, error: null })
        }
        return pickChain
      })

      const result = await submitPick("h1", "jp1", "p1", "s1", 1, "Great project")
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.pick.prize_id).toBe("p1")
      }
    })

    it("returns error on failure", async () => {
      const pickChain = createChainableMock({
        data: null,
        error: { message: "DB error" },
      })
      setMockFromImplementation((table) => {
        if (table === "prizes" || table === "submissions") {
          return createChainableMock({ data: { id: table === "prizes" ? "p1" : "s1" }, error: null })
        }
        return pickChain
      })

      const result = await submitPick("h1", "jp1", "p1", "s1", 1)
      expect(result.success).toBe(false)
    })

    it("rejects a prize or project from another hackathon", async () => {
      setMockRpcImplementation(() => Promise.resolve({
        data: null,
        error: { message: "Project is not assigned to this judge" },
      }))

      const result = await submitPick("h1", "jp1", "p1", "s1", 1)

      expect(result.success).toBe(false)
    })
  })

  describe("removePick", () => {
    it("removes a pick successfully", async () => {
      const chain = createChainableMock({
        data: [{ submission_id: "s1", reason: null }],
        error: null,
      })
      setMockFromImplementation(() => chain)
      setMockRpcImplementation(() => Promise.resolve({ data: true, error: null }))

      const result = await removePick("h1", "jp1", "p1", "s1")
      expect(result).toBe(true)
    })

    it("returns false on failure", async () => {
      const chain = createChainableMock({
        data: null,
        error: { message: "DB error" },
      })
      setMockFromImplementation(() => chain)

      const result = await removePick("h1", "jp1", "p1", "s1")
      expect(result).toBe(false)
    })
  })

  describe("getPickResults", () => {
    it("tallies picks and ranks by first picks", async () => {
      const picks: JudgePick[] = [
        { ...mockPick, judge_participant_id: "jp1", submission_id: "s1", rank: 1 },
        { ...mockPick, id: "pick2", judge_participant_id: "jp2", submission_id: "s1", rank: 1 },
        { ...mockPick, id: "pick3", judge_participant_id: "jp3", submission_id: "s2", rank: 1 },
        { ...mockPick, id: "pick4", judge_participant_id: "jp1", submission_id: "s2", rank: 2 },
      ]
      const chain = createChainableMock({
        data: picks,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await getPickResults("h1", "p1")
      expect(result).toHaveLength(2)
      expect(result[0].submissionId).toBe("s1")
      expect(result[0].firstPicks).toBe(2)
      expect(result[1].submissionId).toBe("s2")
      expect(result[1].firstPicks).toBe(1)
    })

    it("returns empty array when no picks", async () => {
      const chain = createChainableMock({
        data: [],
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await getPickResults("h1", "p1")
      expect(result).toEqual([])
    })
  })

  describe("isJudgingComplete", () => {
    it("returns true when judge has picks for all prizes", async () => {
      setMockFromImplementation((table) => {
        if (table === "prizes") {
          return createChainableMock({
            data: [{ id: "p1" }, { id: "p2" }],
            error: null,
          })
        }
        if (table === "judge_picks") {
          return createChainableMock({
            data: [{ prize_id: "p1" }, { prize_id: "p2" }],
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await isJudgingComplete("h1", "jp1")
      expect(result).toBe(true)
    })

    it("returns false when judge is missing picks", async () => {
      setMockFromImplementation((table) => {
        if (table === "prizes") {
          return createChainableMock({
            data: [{ id: "p1" }, { id: "p2" }],
            error: null,
          })
        }
        if (table === "judge_picks") {
          return createChainableMock({
            data: [{ prize_id: "p1" }],
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await isJudgingComplete("h1", "jp1")
      expect(result).toBe(false)
    })

    it("returns true when no prizes exist", async () => {
      const chain = createChainableMock({
        data: [],
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await isJudgingComplete("h1", "jp1")
      expect(result).toBe(true)
    })
  })
})
