import { describe, it, expect, beforeEach } from "bun:test"
import {
  createChainableMock,
  resetSupabaseMocks,
  setMockFromImplementation,
  mockSuccess,
  mockError,
} from "../lib/supabase-mock"

const { getWinnerPageData, generateSponsorReport } = await import("@/lib/services/winner-pages")

const HACKATHON_ID = "11111111-1111-1111-1111-111111111111"

describe("winner-pages service", () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  describe("getWinnerPageData", () => {
    it("returns winner entries", async () => {
      const assignments = [
        {
          prize_id: "p1",
          submission_id: "s1",
          prizes: { id: "p1", name: "Best Overall", description: "Top project", value: "$5000", display_order: 0 },
          submissions: { id: "s1", title: "AI Agent", team_id: "t1" },
        },
      ]
      const teams = [{ id: "t1", name: "Team Alpha" }]

      setMockFromImplementation((table) => {
        if (table === "prize_assignments") return createChainableMock(mockSuccess(assignments))
        if (table === "teams") return createChainableMock(mockSuccess(teams))
        return createChainableMock(mockSuccess(null))
      })

      const result = await getWinnerPageData(HACKATHON_ID)
      expect(result).toHaveLength(1)
      expect(result[0].prizeName).toBe("Best Overall")
      expect(result[0].submissionTitle).toBe("AI Agent")
      expect(result[0].teamName).toBe("Team Alpha")
    })

    it("returns empty on error", async () => {
      setMockFromImplementation(() => createChainableMock(mockError("Failed")))
      const result = await getWinnerPageData(HACKATHON_ID)
      expect(result).toEqual([])
    })
  })

  describe("generateSponsorReport", () => {
    it("returns report data", async () => {
      setMockFromImplementation((table) => {
        if (table === "hackathons") return createChainableMock(mockSuccess({ name: "Build OS26" }))
        if (table === "hackathon_sponsors") return createChainableMock(mockSuccess([{ name: "Mila", tier: "custom", custom_tier_label: "Title", logo_url: null }]))
        if (table === "prize_assignments") return createChainableMock(mockSuccess([]))
        return createChainableMock({ data: null, error: null, count: 10 })
      })

      const result = await generateSponsorReport(HACKATHON_ID)
      expect(result).not.toBeNull()
      expect(result!.hackathonName).toBe("Build OS26")
      expect(result!.sponsors).toHaveLength(1)
      expect(result!.participantCount).toBe(10)
    })

    it("returns null on hackathon not found", async () => {
      setMockFromImplementation(() => createChainableMock(mockError("Not found")))
      const result = await generateSponsorReport(HACKATHON_ID)
      expect(result).toBeNull()
    })
  })
})
