import { describe, it, expect, beforeEach } from "bun:test"
import type { Prize, PrizeAssignment } from "@/lib/db/hackathon-types"
import {
  createChainableMock,
  resetSupabaseMocks,
  setMockFromImplementation,
} from "../lib/supabase-mock"

const {
  listPrizes,
  createPrize,
  updatePrize,
  deletePrize,
  assignPrize,
  removePrizeAssignment,
  listPrizeAssignments,
  autoAssignPrizes,
  reorderPrizes,
} = await import("@/lib/services/prizes")

const mockPrize: Prize = {
  id: "p1",
  hackathon_id: "h1",
  name: "First Place",
  description: "The grand prize",
  value: "$5000",
  type: "score",
  rank: 1,
  kind: "cash",
  monetary_value: 5000,
  currency: "USD",
  distribution_method: null,
  display_value: "$5,000 USD",
  criteria_id: null,
  prize_track_id: null,
  judging_style: null,
  round_id: null,
  assignment_mode: null,
  max_picks: null,
  is_screening: false,
  display_order: 0,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
}

const mockPrizeAssignment: PrizeAssignment = {
  id: "pa1",
  prize_id: "p1",
  submission_id: "s1",
  assigned_at: "2026-01-01T00:00:00Z",
}

describe("Prizes Service", () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  describe("listPrizes", () => {
    it("returns prizes ordered by display_order", async () => {
      const chain = createChainableMock({
        data: [mockPrize, { ...mockPrize, id: "p2", name: "Second Place", display_order: 1 }],
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await listPrizes("h1")

      expect(result).toHaveLength(2)
      expect(result[0].name).toBe("First Place")
    })

    it("returns empty array when database query fails", async () => {
      const chain = createChainableMock({
        data: null,
        error: { message: "DB error" },
      })
      setMockFromImplementation(() => chain)

      const result = await listPrizes("h1")

      expect(result).toEqual([])
    })

    it("returns empty array when no prizes exist", async () => {
      const chain = createChainableMock({
        data: [],
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await listPrizes("h1")

      expect(result).toEqual([])
    })
  })

  describe("createPrize", () => {
    it("creates prize with default values", async () => {
      const chain = createChainableMock({
        data: mockPrize,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await createPrize("h1", {
        name: "First Place",
      })

      expect(result).not.toBeNull()
      expect(result?.name).toBe("First Place")
    })

    it("creates prize with all values", async () => {
      const chain = createChainableMock({
        data: mockPrize,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await createPrize("h1", {
        name: "First Place",
        description: "The grand prize",
        value: "$5000",
        displayOrder: 0,
      })

      expect(result).not.toBeNull()
      expect(result?.description).toBe("The grand prize")
      expect(result?.value).toBe("$5000")
    })

    it("creates prize with extended fields", async () => {
      const extendedPrize = {
        ...mockPrize,
        type: "favorite" as const,
        rank: 2,
        kind: "swag",
        monetary_value: 100,
        currency: "CAD",
        criteria_id: "c1",
        distribution_method: "raffle",
        display_value: "$100 CAD",
      }
      const chain = createChainableMock({
        data: extendedPrize,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await createPrize("h1", {
        name: "First Place",
        type: "favorite",
        rank: 2,
        kind: "swag",
        monetaryValue: 100,
        currency: "CAD",
        criteriaId: "c1",
        distributionMethod: "raffle",
        displayValue: "$100 CAD",
      })

      expect(result).not.toBeNull()
      expect(result?.type).toBe("favorite")
      expect(result?.rank).toBe(2)
      expect(result?.kind).toBe("swag")
      expect(result?.monetary_value).toBe(100)
      expect(result?.currency).toBe("CAD")
    })

    it("returns null when database insert fails", async () => {
      const chain = createChainableMock({
        data: null,
        error: { message: "DB error" },
      })
      setMockFromImplementation(() => chain)

      const result = await createPrize("h1", { name: "Test" })

      expect(result).toBeNull()
    })
  })

  describe("updatePrize", () => {
    it("updates prize name", async () => {
      const updated = { ...mockPrize, name: "Updated Name" }
      const chain = createChainableMock({
        data: updated,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await updatePrize("p1", "h1", {
        name: "Updated Name",
      })

      expect(result).not.toBeNull()
      expect(result?.name).toBe("Updated Name")
    })

    it("updates multiple fields", async () => {
      const updated = { ...mockPrize, name: "New", value: "$10000" }
      const chain = createChainableMock({
        data: updated,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await updatePrize("p1", "h1", {
        name: "New",
        value: "$10000",
        description: "Updated description",
      })

      expect(result).not.toBeNull()
    })

    it("returns null when database update fails", async () => {
      const chain = createChainableMock({
        data: null,
        error: { message: "DB error" },
      })
      setMockFromImplementation(() => chain)

      const result = await updatePrize("p1", "h1", { name: "Test" })

      expect(result).toBeNull()
    })

    it("updates display order", async () => {
      const updated = { ...mockPrize, display_order: 2 }
      const chain = createChainableMock({
        data: updated,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await updatePrize("p1", "h1", {
        displayOrder: 2,
      })

      expect(result).not.toBeNull()
      expect(result?.display_order).toBe(2)
    })
  })

  describe("deletePrize", () => {
    it("returns true on successful deletion", async () => {
      const chain = createChainableMock({
        data: null,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await deletePrize("p1", "h1")

      expect(result).toBe(true)
    })

    it("returns false when database delete fails", async () => {
      const chain = createChainableMock({
        data: null,
        error: { message: "DB error" },
      })
      setMockFromImplementation(() => chain)

      const result = await deletePrize("p1", "h1")

      expect(result).toBe(false)
    })
  })

  describe("assignPrize", () => {
    it("assigns prize to submission successfully", async () => {
      const chain = createChainableMock({
        data: mockPrizeAssignment,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await assignPrize("p1", "s1")

      expect(result).not.toBeNull()
      expect(result?.prize_id).toBe("p1")
      expect(result?.submission_id).toBe("s1")
    })

    it("returns null when prize is already assigned to submission (duplicate key)", async () => {
      const chain = createChainableMock({
        data: null,
        error: { message: "Duplicate", code: "23505" },
      })
      setMockFromImplementation(() => chain)

      const result = await assignPrize("p1", "s1")

      expect(result).toBeNull()
    })

    it("returns null when database insert fails", async () => {
      const chain = createChainableMock({
        data: null,
        error: { message: "DB error" },
      })
      setMockFromImplementation(() => chain)

      const result = await assignPrize("p1", "s1")

      expect(result).toBeNull()
    })

    it("creates fulfillment when results are already published", async () => {
      let fulfillmentsQueried = false
      let prizesCallCount = 0
      let prizeAssignmentsCallCount = 0
      setMockFromImplementation((table) => {
        if (table === "prize_assignments") {
          prizeAssignmentsCallCount++
          if (prizeAssignmentsCallCount === 1) {
            return {
              insert: () =>
                createChainableMock({ data: mockPrizeAssignment, error: null }),
            }
          }
          return createChainableMock({
            data: [{ id: "pa1" }],
            error: null,
          })
        }
        if (table === "prizes") {
          prizesCallCount++
          if (prizesCallCount === 1) {
            return createChainableMock({
              data: { hackathon_id: "h1" },
              error: null,
            })
          }
          return createChainableMock({
            data: [{ id: "p1" }],
            error: null,
          })
        }
        if (table === "hackathons") {
          return createChainableMock({
            data: { results_published_at: "2026-01-01T00:00:00Z" },
            error: null,
          })
        }
        if (table === "prize_fulfillments") {
          fulfillmentsQueried = true
          return {
            select: () =>
              createChainableMock({ data: [], error: null }),
            insert: () =>
              createChainableMock({ data: null, error: null }),
          }
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await assignPrize("p1", "s1")

      expect(result).not.toBeNull()
      expect(result?.prize_id).toBe("p1")
      expect(fulfillmentsQueried).toBe(true)
    })

    it("skips fulfillment when results are not published", async () => {
      let fulfillmentsInitialized = false
      setMockFromImplementation((table) => {
        if (table === "prize_assignments") {
          return {
            insert: () =>
              createChainableMock({ data: mockPrizeAssignment, error: null }),
          }
        }
        if (table === "prizes") {
          return createChainableMock({
            data: { hackathon_id: "h1" },
            error: null,
          })
        }
        if (table === "hackathons") {
          return createChainableMock({
            data: { results_published_at: null },
            error: null,
          })
        }
        if (table === "prize_fulfillments") {
          fulfillmentsInitialized = true
          return createChainableMock({ data: [], error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await assignPrize("p1", "s1")

      expect(result).not.toBeNull()
      expect(fulfillmentsInitialized).toBe(false)
    })
  })

  describe("removePrizeAssignment", () => {
    it("returns true on successful removal", async () => {
      const chain = createChainableMock({
        data: null,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await removePrizeAssignment("p1", "s1")

      expect(result).toBe(true)
    })

    it("returns false when database delete fails", async () => {
      const chain = createChainableMock({
        data: null,
        error: { message: "DB error" },
      })
      setMockFromImplementation(() => chain)

      const result = await removePrizeAssignment("p1", "s1")

      expect(result).toBe(false)
    })
  })

  describe("listPrizeAssignments", () => {
    it("returns assignments with prize, submission, and team details", async () => {
      setMockFromImplementation((table) => {
        if (table === "prizes") {
          return createChainableMock({
            data: [{ id: "p1", name: "First Place" }],
            error: null,
          })
        }
        if (table === "prize_assignments") {
          return createChainableMock({
            data: [
              {
                ...mockPrizeAssignment,
                submission: { title: "Project 1", team_id: "t1" },
              },
            ],
            error: null,
          })
        }
        if (table === "teams") {
          return createChainableMock({
            data: [{ id: "t1", name: "Team One" }],
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await listPrizeAssignments("h1")

      expect(result).toHaveLength(1)
      expect(result[0].prizeName).toBe("First Place")
      expect(result[0].submissionTitle).toBe("Project 1")
      expect(result[0].teamName).toBe("Team One")
    })

    it("returns empty array when no prizes exist", async () => {
      const chain = createChainableMock({
        data: [],
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await listPrizeAssignments("h1")

      expect(result).toEqual([])
    })

    it("returns empty array when prize_assignments query fails", async () => {
      setMockFromImplementation((table) => {
        if (table === "prizes") {
          return createChainableMock({
            data: [{ id: "p1", name: "First Place" }],
            error: null,
          })
        }
        return createChainableMock({
          data: null,
          error: { message: "DB error" },
        })
      })

      const result = await listPrizeAssignments("h1")

      expect(result).toEqual([])
    })

    it("returns null teamName for solo submissions without teams", async () => {
      setMockFromImplementation((table) => {
        if (table === "prizes") {
          return createChainableMock({
            data: [{ id: "p1", name: "First Place" }],
            error: null,
          })
        }
        if (table === "prize_assignments") {
          return createChainableMock({
            data: [
              {
                ...mockPrizeAssignment,
                submission: { title: "Solo Project", team_id: null },
              },
            ],
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await listPrizeAssignments("h1")

      expect(result).toHaveLength(1)
      expect(result[0].teamName).toBeNull()
    })

    it("handles multiple prizes and assignments", async () => {
      setMockFromImplementation((table) => {
        if (table === "prizes") {
          return createChainableMock({
            data: [
              { id: "p1", name: "First Place" },
              { id: "p2", name: "Second Place" },
            ],
            error: null,
          })
        }
        if (table === "prize_assignments") {
          return createChainableMock({
            data: [
              {
                ...mockPrizeAssignment,
                prize_id: "p1",
                submission: { title: "Project 1", team_id: null },
              },
              {
                ...mockPrizeAssignment,
                id: "pa2",
                prize_id: "p2",
                submission_id: "s2",
                submission: { title: "Project 2", team_id: null },
              },
            ],
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await listPrizeAssignments("h1")

      expect(result).toHaveLength(2)
      expect(result[0].prizeName).toBe("First Place")
      expect(result[1].prizeName).toBe("Second Place")
    })
  })

  describe("autoAssignPrizes", () => {
    it("assigns score-based prizes by matching rank", async () => {
      const insertedAssignments: { prize_id: string; submission_id: string }[] = []
      setMockFromImplementation((table) => {
        if (table === "prizes") {
          return createChainableMock({
            data: [
              { id: "p1", type: "score", rank: 1 },
              { id: "p2", type: "score", rank: 2 },
            ],
            error: null,
          })
        }
        if (table === "hackathon_results") {
          return createChainableMock({
            data: [
              { submission_id: "s1", rank: 1 },
              { submission_id: "s2", rank: 2 },
            ],
            error: null,
          })
        }
        if (table === "prize_assignments") {
          return {
            insert: (row: { prize_id: string; submission_id: string }) => {
              insertedAssignments.push(row)
              return createChainableMock({ data: row, error: null })
            },
          }
        }
        return createChainableMock({ data: null, error: null })
      })

      await autoAssignPrizes("h1")

      expect(insertedAssignments).toHaveLength(2)
      expect(insertedAssignments[0]).toEqual({ prize_id: "p1", submission_id: "s1" })
      expect(insertedAssignments[1]).toEqual({ prize_id: "p2", submission_id: "s2" })
    })

    it("does nothing when no prizes exist", async () => {
      const chain = createChainableMock({ data: [], error: null })
      setMockFromImplementation(() => chain)

      await autoAssignPrizes("h1")
    })

    it("skips score prizes with no matching rank in results", async () => {
      const insertedAssignments: { prize_id: string; submission_id: string }[] = []
      setMockFromImplementation((table) => {
        if (table === "prizes") {
          return createChainableMock({
            data: [{ id: "p1", type: "score", rank: 3 }],
            error: null,
          })
        }
        if (table === "hackathon_results") {
          return createChainableMock({
            data: [
              { submission_id: "s1", rank: 1 },
              { submission_id: "s2", rank: 2 },
            ],
            error: null,
          })
        }
        if (table === "prize_assignments") {
          return {
            insert: (row: { prize_id: string; submission_id: string }) => {
              insertedAssignments.push(row)
              return createChainableMock({ data: row, error: null })
            },
          }
        }
        return createChainableMock({ data: null, error: null })
      })

      await autoAssignPrizes("h1")

      expect(insertedAssignments).toHaveLength(0)
    })

    it("handles favorite prizes without assignment", async () => {
      const chain = createChainableMock({
        data: [{ id: "p1", type: "favorite", rank: null }],
        error: null,
      })
      setMockFromImplementation(() => chain)

      await autoAssignPrizes("h1")
    })
  })

  describe("reorderPrizes", () => {
    it("reorders prizes successfully", async () => {
      const chain = createChainableMock({
        data: null,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await reorderPrizes("h1", ["p2", "p1", "p3"])

      expect(result).toBe(true)
    })

    it("returns false when update fails", async () => {
      const chain = createChainableMock({
        data: null,
        error: { message: "DB error" },
      })
      setMockFromImplementation(() => chain)

      const result = await reorderPrizes("h1", ["p1", "p2"])

      expect(result).toBe(false)
    })

    it("handles empty array", async () => {
      const chain = createChainableMock({
        data: null,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await reorderPrizes("h1", [])

      expect(result).toBe(true)
    })
  })
})
