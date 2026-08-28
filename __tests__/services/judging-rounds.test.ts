import { describe, it, expect, beforeEach } from "bun:test"
import {
  createChainableMock,
  resetSupabaseMocks,
  setMockFromImplementation,
  setMockRpcImplementation,
  mockSuccess,
  mockError,
} from "../lib/supabase-mock"

const {
  listRounds,
  createRound,
  updateRound,
  deleteRound,
  activateRound,
  getActiveRound,
} = await import("@/lib/services/judging-rounds")

const HACKATHON_ID = "11111111-1111-1111-1111-111111111111"
const ROUND_ID = "22222222-2222-2222-2222-222222222222"

describe("judging-rounds service", () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  describe("listRounds", () => {
    it("returns rounds sorted by display_order", async () => {
      const rounds = [
        { id: ROUND_ID, hackathon_id: HACKATHON_ID, name: "Preliminary", round_type: "preliminary", is_active: true, display_order: 0, created_at: "2026-04-01" },
      ]
      setMockFromImplementation(() => createChainableMock(mockSuccess(rounds)))
      const result = await listRounds(HACKATHON_ID)
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe("Preliminary")
    })

    it("returns empty on error", async () => {
      setMockFromImplementation(() => createChainableMock(mockError("DB error")))
      const result = await listRounds(HACKATHON_ID)
      expect(result).toEqual([])
    })
  })

  describe("createRound", () => {
    it("creates a round", async () => {
      const round = { id: ROUND_ID, hackathon_id: HACKATHON_ID, name: "Finals", round_type: "finals", is_active: false, display_order: 1, created_at: "2026-04-01" }
      setMockRpcImplementation(() => Promise.resolve(mockSuccess(round)))
      const result = await createRound(HACKATHON_ID, { name: "Finals", roundType: "finals" })
      expect(result).not.toBeNull()
      expect(result!.round_type).toBe("finals")
    })

    it("returns null on error", async () => {
      setMockRpcImplementation(() => Promise.resolve(mockError("Failed")))
      const result = await createRound(HACKATHON_ID, { name: "R", roundType: "preliminary" })
      expect(result).toBeNull()
    })
  })

  describe("updateRound", () => {
    it("updates a round", async () => {
      const round = { id: ROUND_ID, hackathon_id: HACKATHON_ID, name: "Updated", round_type: "finals", is_active: false, display_order: 0, created_at: "2026-04-01" }
      setMockRpcImplementation(() => Promise.resolve(mockSuccess(round)))
      const result = await updateRound(ROUND_ID, HACKATHON_ID, { name: "Updated" })
      expect(result!.name).toBe("Updated")
    })

    it("returns null when no updates", async () => {
      const result = await updateRound(ROUND_ID, HACKATHON_ID, {})
      expect(result).toBeNull()
    })
  })

  describe("deleteRound", () => {
    it("deletes a round", async () => {
      setMockRpcImplementation(() => Promise.resolve({ data: "deleted", error: null }))
      expect(await deleteRound(ROUND_ID, HACKATHON_ID)).toBe(true)
    })

    it("returns false on error", async () => {
      setMockRpcImplementation(() => Promise.resolve(mockError("Failed")))
      expect(await deleteRound(ROUND_ID, HACKATHON_ID)).toBe(false)
    })
  })

  describe("activateRound", () => {
    it("deactivates all then activates one", async () => {
      setMockRpcImplementation(() => Promise.resolve({ data: true, error: null }))
      expect(await activateRound(ROUND_ID, HACKATHON_ID)).toBe(true)
    })

    it("returns false on deactivate error", async () => {
      setMockRpcImplementation(() => Promise.resolve(mockError("Failed")))
      expect(await activateRound(ROUND_ID, HACKATHON_ID)).toBe(false)
    })
  })

  describe("getActiveRound", () => {
    it("returns active round", async () => {
      const round = { id: ROUND_ID, hackathon_id: HACKATHON_ID, name: "Prelim", round_type: "preliminary", is_active: true, display_order: 0, created_at: "2026-04-01" }
      setMockFromImplementation(() => createChainableMock(mockSuccess(round)))
      const result = await getActiveRound(HACKATHON_ID)
      expect(result).not.toBeNull()
      expect(result!.is_active).toBe(true)
    })

    it("returns null when no active round", async () => {
      setMockFromImplementation(() => createChainableMock(mockSuccess(null)))
      const result = await getActiveRound(HACKATHON_ID)
      expect(result).toBeNull()
    })
  })
})
