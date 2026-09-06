import { describe, it, expect, beforeEach } from "bun:test"
import {
  createChainableMock,
  resetSupabaseMocks,
  setMockFromImplementation,
  setMockRpcImplementation,
} from "../lib/supabase-mock"

const {
  castVote,
  removeVote,
  getVoteCounts,
  getUserVote,
  getCrowdFavoriteWinner,
} = await import("@/lib/services/crowd-voting")

describe("Crowd Voting Service", () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  describe("castVote", () => {
    it("casts a vote successfully", async () => {
      setMockRpcImplementation(() => Promise.resolve({ data: "success", error: null }))

      const result = await castVote("h1", "p1", "s1", "user1")

      expect(result.success).toBe(true)
    })

    it("returns error when the atomic vote fails", async () => {
      setMockRpcImplementation(() => Promise.resolve({ data: null, error: { message: "DB error" } }))

      const result = await castVote("h1", "p1", "s1", "user1")

      expect(result.success).toBe(false)
    })
  })

  describe("removeVote", () => {
    it("removes vote successfully", async () => {
      setMockRpcImplementation(() => Promise.resolve({ data: "success", error: null }))

      const result = await removeVote("h1", "p1", "user1")

      expect(result).toEqual({ success: true })
    })

    it("returns false when database delete fails", async () => {
      setMockRpcImplementation(() => Promise.resolve({ data: null, error: { message: "DB error" } }))

      const result = await removeVote("h1", "p1", "user1")

      expect(result.success).toBe(false)
    })
  })

  it("keeps both vote writes closed when the transaction-time judging gate closes", async () => {
    const called: string[] = []
    setMockRpcImplementation((name) => { called.push(name); return Promise.resolve({ data: "voting_closed", error: null }) })
    expect(await castVote("h1", "p1", "s1", "user1")).toMatchObject({ success: false, code: "voting_closed" })
    expect(await removeVote("h1", "p1", "user1")).toMatchObject({ success: false, code: "voting_closed" })
    expect(called).toEqual(["cast_crowd_vote_atomic", "remove_crowd_vote_atomic"])
  })

  describe("getVoteCounts", () => {
    it("returns vote counts per submission", async () => {
      setMockRpcImplementation(() => Promise.resolve({ data: [
        { submission_id: "s1", vote_count: 2 },
        { submission_id: "s2", vote_count: 1 },
      ], error: null }))

      const result = await getVoteCounts("h1", "p1")

      expect(result).toHaveLength(2)
      const s1 = result.find((c) => c.submissionId === "s1")
      expect(s1?.voteCount).toBe(2)
      const s2 = result.find((c) => c.submissionId === "s2")
      expect(s2?.voteCount).toBe(1)
    })

    it("returns empty array when no votes exist", async () => {
      setMockRpcImplementation(() => Promise.resolve({ data: [], error: null }))

      const result = await getVoteCounts("h1", "p1")

      expect(result).toEqual([])
    })

    it("returns empty array when database query fails", async () => {
      setMockRpcImplementation(() => Promise.resolve({ data: null, error: { message: "DB error" } }))

      const result = await getVoteCounts("h1", "p1")

      expect(result).toEqual([])
    })
  })

  describe("getUserVote", () => {
    it("returns submission id for user vote", async () => {
      const chain = createChainableMock({
        data: { submission_id: "s1" },
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await getUserVote("h1", "p1", "user1")

      expect(result).toBe("s1")
    })

    it("returns null when user has not voted", async () => {
      const chain = createChainableMock({
        data: null,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await getUserVote("h1", "p1", "user1")

      expect(result).toBeNull()
    })
  })

  describe("getCrowdFavoriteWinner", () => {
    it("returns submission with most votes", async () => {
      setMockRpcImplementation(() => Promise.resolve({ data: [
        { submission_id: "s1", vote_count: 3 },
        { submission_id: "s2", vote_count: 1 },
      ], error: null }))

      const result = await getCrowdFavoriteWinner("h1", "p1")

      expect(result).toBe("s1")
    })

    it("returns null when no votes exist", async () => {
      setMockRpcImplementation(() => Promise.resolve({ data: [], error: null }))

      const result = await getCrowdFavoriteWinner("h1", "p1")

      expect(result).toBeNull()
    })
  })
})
