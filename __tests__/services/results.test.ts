import { describe, it, expect, beforeEach, mock } from "bun:test"
import type { HackathonResult } from "@/lib/db/hackathon-types"
import {
  createChainableMock,
  resetSupabaseMocks,
  setMockFromImplementation,
  setMockRpcImplementation,
  mockClerkClient,
} from "../lib/supabase-mock"

const {
  calculateResults,
  getResults,
  unpublishResults,
  getPublicResults,
  getPublicResultsWithDetails,
  getResultsByPrize,
} = await import("@/lib/services/results")

const mockResult: HackathonResult = {
  id: "r1",
  hackathon_id: "h1",
  submission_id: "s1",
  rank: 1,
  total_score: 85,
  weighted_score: 85.0,
  judge_count: 3,
  published_at: null,
  created_at: "2026-01-01T00:00:00Z",
}

describe("Results Service", () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  describe("calculateResults", () => {
    it("calculates results successfully", async () => {
      setMockRpcImplementation((fn) => {
        if (fn === "calculate_results") {
          return Promise.resolve({
            data: [{ success: true, results_count: 5 }],
            error: null,
          })
        }
        return Promise.resolve({ data: null, error: null })
      })

      const result = await calculateResults("h1")

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.count).toBe(5)
      }
    })

    it("returns rpc_failed error when database RPC call fails", async () => {
      setMockRpcImplementation(() =>
        Promise.resolve({
          data: null,
          error: { message: "RPC failed" },
        })
      )

      const result = await calculateResults("h1")

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.code).toBe("rpc_failed")
      }
    })

    it("returns error code from RPC when calculation fails with business error", async () => {
      setMockRpcImplementation(() =>
        Promise.resolve({
          data: [{ success: false, error_message: "No submissions", error_code: "no_submissions" }],
          error: null,
        })
      )

      const result = await calculateResults("h1")

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.code).toBe("no_submissions")
        expect(result.error).toBe("No submissions")
      }
    })

    it("returns unknown error when RPC returns empty result array", async () => {
      setMockRpcImplementation(() =>
        Promise.resolve({
          data: [],
          error: null,
        })
      )

      const result = await calculateResults("h1")

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.code).toBe("unknown")
      }
    })

    it("routes rubric mode to RPC calculate_results", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: { judging_mode: "rubric" }, error: null })
      )
      setMockRpcImplementation(() => ({
        data: [{ success: true, results_count: 3 }],
        error: null,
      }))

      const result = await calculateResults("h1")
      expect(result.success).toBe(true)
      if (result.success) expect(result.count).toBe(3)
    })
  })

  describe("getResults", () => {
    const fullSubmission = {
      title: "Project 1",
      description: "A cool project",
      github_url: "https://github.com/test/repo",
      live_app_url: "https://myapp.example.com",
      screenshot_url: "https://storage.example.com/screenshot.webp",
      team_id: "t1",
    }

    it("returns results with submission and team details", async () => {
      setMockFromImplementation((table) => {
        if (table === "hackathon_results") {
          return createChainableMock({
            data: [{ ...mockResult, submission: fullSubmission }],
            error: null,
          })
        }
        if (table === "teams") {
          return createChainableMock({
            data: [{ id: "t1", name: "Team One" }],
            error: null,
          })
        }
        if (table === "prize_assignments") {
          return createChainableMock({
            data: [
              {
                submission_id: "s1",
                prize: { id: "p1", name: "First Place", value: "$5000" },
              },
            ],
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await getResults("h1")

      expect(result).toHaveLength(1)
      expect(result[0].submissionTitle).toBe("Project 1")
      expect(result[0].teamName).toBe("Team One")
      expect(result[0].prizes).toHaveLength(1)
      expect(result[0].prizes[0].name).toBe("First Place")
    })

    it("maps new submission fields correctly", async () => {
      setMockFromImplementation((table) => {
        if (table === "hackathon_results") {
          return createChainableMock({
            data: [{ ...mockResult, submission: fullSubmission }],
            error: null,
          })
        }
        if (table === "teams") {
          return createChainableMock({
            data: [{ id: "t1", name: "Team One" }],
            error: null,
          })
        }
        if (table === "prize_assignments") {
          return createChainableMock({ data: [], error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await getResults("h1")

      expect(result).toHaveLength(1)
      expect(result[0].submissionDescription).toBe("A cool project")
      expect(result[0].submissionGithubUrl).toBe("https://github.com/test/repo")
      expect(result[0].submissionLiveAppUrl).toBe("https://myapp.example.com")
      expect(result[0].submissionScreenshotUrl).toBe("https://storage.example.com/screenshot.webp")
      expect(result[0].submissionTeamId).toBe("t1")
    })

    it("maps null submission fields when not provided", async () => {
      setMockFromImplementation((table) => {
        if (table === "hackathon_results") {
          return createChainableMock({
            data: [
              {
                ...mockResult,
                submission: {
                  title: "Minimal Project",
                  description: null,
                  github_url: null,
                  live_app_url: null,
                  screenshot_url: null,
                  team_id: null,
                },
              },
            ],
            error: null,
          })
        }
        if (table === "prize_assignments") {
          return createChainableMock({ data: [], error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await getResults("h1")

      expect(result[0].submissionDescription).toBeNull()
      expect(result[0].submissionGithubUrl).toBeNull()
      expect(result[0].submissionLiveAppUrl).toBeNull()
      expect(result[0].submissionScreenshotUrl).toBeNull()
      expect(result[0].submissionTeamId).toBeNull()
    })

    it("returns empty array when database query fails", async () => {
      const chain = createChainableMock({
        data: null,
        error: { message: "DB error" },
      })
      setMockFromImplementation(() => chain)

      const result = await getResults("h1")

      expect(result).toEqual([])
    })

    it("returns null teamName for solo submissions without teams", async () => {
      setMockFromImplementation((table) => {
        if (table === "hackathon_results") {
          return createChainableMock({
            data: [
              {
                ...mockResult,
                submission: {
                  title: "Solo Project",
                  description: null,
                  github_url: null,
                  live_app_url: null,
                  screenshot_url: null,
                  team_id: null,
                },
              },
            ],
            error: null,
          })
        }
        if (table === "prize_assignments") {
          return createChainableMock({ data: [], error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await getResults("h1")

      expect(result).toHaveLength(1)
      expect(result[0].teamName).toBeNull()
      expect(result[0].prizes).toEqual([])
    })

    it("returns empty prizes array when submission has no prize assignments", async () => {
      setMockFromImplementation((table) => {
        if (table === "hackathon_results") {
          return createChainableMock({
            data: [{ ...mockResult, submission: fullSubmission }],
            error: null,
          })
        }
        if (table === "teams") {
          return createChainableMock({
            data: [{ id: "t1", name: "Team One" }],
            error: null,
          })
        }
        if (table === "prize_assignments") {
          return createChainableMock({ data: [], error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await getResults("h1")

      expect(result).toHaveLength(1)
      expect(result[0].prizes).toEqual([])
    })

    it("returns results sorted by rank", async () => {
      setMockFromImplementation((table) => {
        if (table === "hackathon_results") {
          return createChainableMock({
            data: [
              {
                ...mockResult,
                rank: 1,
                submission: {
                  title: "First Place Project",
                  description: null,
                  github_url: null,
                  live_app_url: null,
                  screenshot_url: null,
                  team_id: null,
                },
              },
              {
                ...mockResult,
                id: "r2",
                submission_id: "s2",
                rank: 2,
                total_score: 80,
                submission: {
                  title: "Second Place Project",
                  description: null,
                  github_url: null,
                  live_app_url: null,
                  screenshot_url: null,
                  team_id: null,
                },
              },
            ],
            error: null,
          })
        }
        if (table === "prize_assignments") {
          return createChainableMock({ data: [], error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await getResults("h1")

      expect(result).toHaveLength(2)
      expect(result[0].rank).toBe(1)
      expect(result[1].rank).toBe(2)
    })
  })

  describe("unpublishResults", () => {
    it("unpublishes results successfully", async () => {
      setMockFromImplementation((table) => {
        if (table === "hackathon_results") {
          return createChainableMock({ data: null, error: null })
        }
        if (table === "hackathons") {
          return createChainableMock({ data: null, error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await unpublishResults("h1", "t1")

      expect(result.success).toBe(true)
    })

    it("returns error when hackathon_results update fails", async () => {
      setMockFromImplementation((table) => {
        if (table === "hackathon_results") {
          return createChainableMock({
            data: null,
            error: { message: "Update failed" },
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await unpublishResults("h1", "t1")

      expect(result.success).toBe(false)
      expect(result.error).toBe("Failed to unpublish results")
    })

    it("returns error when hackathons status update fails", async () => {
      setMockFromImplementation((table) => {
        if (table === "hackathon_results") {
          return createChainableMock({ data: null, error: null })
        }
        if (table === "hackathons") {
          return createChainableMock({
            data: null,
            error: { message: "Update failed" },
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await unpublishResults("h1", "t1")

      expect(result.success).toBe(false)
      expect(result.error).toBe("Failed to update hackathon")
    })
  })

  describe("getPublicResults", () => {
    it("returns results when hackathon results are published", async () => {
      let hackathonChecked = false
      setMockFromImplementation((table) => {
        if (table === "hackathons" && !hackathonChecked) {
          hackathonChecked = true
          return createChainableMock({
            data: { results_published_at: "2026-01-01T00:00:00Z" },
            error: null,
          })
        }
        if (table === "hackathon_results") {
          return createChainableMock({
            data: [
              {
                ...mockResult,
                submission: { title: "Project 1", team_id: null },
              },
            ],
            error: null,
          })
        }
        if (table === "prize_assignments") {
          return createChainableMock({ data: [], error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await getPublicResults("h1")

      expect(result).not.toBeNull()
      expect(result).toHaveLength(1)
    })

    it("returns null when results have not been published yet", async () => {
      const chain = createChainableMock({
        data: { results_published_at: null },
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await getPublicResults("h1")

      expect(result).toBeNull()
    })

    it("returns null when hackathon does not exist", async () => {
      const chain = createChainableMock({
        data: null,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await getPublicResults("h1")

      expect(result).toBeNull()
    })
  })

  describe("getPublicResultsWithDetails", () => {
    const publishedSubmission = (overrides: Partial<{
      team_id: string | null
      rank: number
      submission_id: string
    }> = {}) => ({
      ...mockResult,
      submission_id: overrides.submission_id ?? "s1",
      rank: overrides.rank ?? 1,
      submission: {
        title: "Top Project",
        description: "An amazing project",
        github_url: "https://github.com/test/repo",
        live_app_url: "https://demo.example.com",
        screenshot_url: "https://storage.example.com/shot.webp",
        team_id: overrides.team_id ?? null,
      },
    })

    function mockPublishedResults(results: unknown[]) {
      let hackathonChecked = false
      setMockFromImplementation((table) => {
        if (table === "hackathons" && !hackathonChecked) {
          hackathonChecked = true
          return createChainableMock({
            data: { results_published_at: "2026-01-01T00:00:00Z" },
            error: null,
          })
        }
        if (table === "hackathon_results") {
          return createChainableMock({ data: results, error: null })
        }
        if (table === "teams") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "prize_assignments") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "hackathon_participants") {
          return createChainableMock({ data: [], error: null })
        }
        return createChainableMock({ data: null, error: null })
      })
    }

    it("returns null when results are not published", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: { results_published_at: null }, error: null })
      )

      const result = await getPublicResultsWithDetails("h1")

      expect(result).toBeNull()
    })

    it("returns null when hackathon does not exist", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: null, error: null })
      )

      const result = await getPublicResultsWithDetails("h1")

      expect(result).toBeNull()
    })

    it("returns results with empty members for solo submissions", async () => {
      mockPublishedResults([publishedSubmission({ team_id: null })])

      const result = await getPublicResultsWithDetails("h1")

      expect(result).not.toBeNull()
      expect(result).toHaveLength(1)
      expect(result![0].members).toEqual([])
    })

    it("maps all PublicResultWithDetails fields correctly", async () => {
      mockPublishedResults([publishedSubmission({ team_id: null })])

      const result = await getPublicResultsWithDetails("h1")

      expect(result).not.toBeNull()
      const r = result![0]
      expect(r.rank).toBe(1)
      expect(r.submissionTitle).toBe("Top Project")
      expect(r.submissionDescription).toBe("An amazing project")
      expect(r.submissionGithubUrl).toBe("https://github.com/test/repo")
      expect(r.submissionLiveAppUrl).toBe("https://demo.example.com")
      expect(r.submissionScreenshotUrl).toBe("https://storage.example.com/shot.webp")
      expect(r.weightedScore).toBe(85.0)
      expect(r.judgeCount).toBe(3)
      expect(r.prizes).toEqual([])
    })

    it("returns team member names for top-3 team submissions", async () => {
      let hackathonChecked = false
      setMockFromImplementation((table) => {
        if (table === "hackathons" && !hackathonChecked) {
          hackathonChecked = true
          return createChainableMock({
            data: { results_published_at: "2026-01-01T00:00:00Z" },
            error: null,
          })
        }
        if (table === "hackathon_results") {
          return createChainableMock({
            data: [publishedSubmission({ team_id: "t1" })],
            error: null,
          })
        }
        if (table === "teams") {
          return createChainableMock({ data: [{ id: "t1", name: "Team Alpha" }], error: null })
        }
        if (table === "prize_assignments") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "hackathon_participants") {
          return createChainableMock({
            data: [{ team_id: "t1", clerk_user_id: "user_1" }],
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      ;(mockClerkClient as unknown as { mockImplementation: (fn: () => unknown) => void }).mockImplementation(() =>
        Promise.resolve({
          organizations: { getOrganization: mock(() => Promise.resolve({ name: "Test Org" })) },
          users: {
            getUserList: mock(() =>
              Promise.resolve({
                data: [{ id: "user_1", firstName: "Alice", lastName: "Smith", username: null }],
              })
            ),
          },
        })
      )

      const result = await getPublicResultsWithDetails("h1")

      expect(result).not.toBeNull()
      expect(result![0].members).toEqual(["Alice Smith"])
    })

    it("uses username when firstName is not set", async () => {
      let hackathonChecked = false
      setMockFromImplementation((table) => {
        if (table === "hackathons" && !hackathonChecked) {
          hackathonChecked = true
          return createChainableMock({
            data: { results_published_at: "2026-01-01T00:00:00Z" },
            error: null,
          })
        }
        if (table === "hackathon_results") {
          return createChainableMock({
            data: [publishedSubmission({ team_id: "t1" })],
            error: null,
          })
        }
        if (table === "teams") {
          return createChainableMock({ data: [{ id: "t1", name: "Team Alpha" }], error: null })
        }
        if (table === "prize_assignments") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "hackathon_participants") {
          return createChainableMock({
            data: [{ team_id: "t1", clerk_user_id: "user_1" }],
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      ;(mockClerkClient as unknown as { mockImplementation: (fn: () => unknown) => void }).mockImplementation(() =>
        Promise.resolve({
          organizations: { getOrganization: mock(() => Promise.resolve({ name: "Test Org" })) },
          users: {
            getUserList: mock(() =>
              Promise.resolve({
                data: [{ id: "user_1", firstName: null, lastName: null, username: "alice42" }],
              })
            ),
          },
        })
      )

      const result = await getPublicResultsWithDetails("h1")

      expect(result![0].members).toEqual(["alice42"])
    })

    it("falls back to empty members when Clerk API throws", async () => {
      let hackathonChecked = false
      setMockFromImplementation((table) => {
        if (table === "hackathons" && !hackathonChecked) {
          hackathonChecked = true
          return createChainableMock({
            data: { results_published_at: "2026-01-01T00:00:00Z" },
            error: null,
          })
        }
        if (table === "hackathon_results") {
          return createChainableMock({
            data: [publishedSubmission({ team_id: "t1" })],
            error: null,
          })
        }
        if (table === "teams") {
          return createChainableMock({ data: [{ id: "t1", name: "Team Alpha" }], error: null })
        }
        if (table === "prize_assignments") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "hackathon_participants") {
          return createChainableMock({
            data: [{ team_id: "t1", clerk_user_id: "user_1" }],
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      mockClerkClient.mockImplementation(() => Promise.reject(new Error("Clerk unavailable")))

      const result = await getPublicResultsWithDetails("h1")

      expect(result).not.toBeNull()
      expect(result![0].members).toEqual([])
    })

    it("does not fetch participants for results ranked below 3", async () => {
      let participantsQueried = false
      let hackathonChecked = false
      setMockFromImplementation((table) => {
        if (table === "hackathons" && !hackathonChecked) {
          hackathonChecked = true
          return createChainableMock({
            data: { results_published_at: "2026-01-01T00:00:00Z" },
            error: null,
          })
        }
        if (table === "hackathon_results") {
          return createChainableMock({
            data: [
              publishedSubmission({ rank: 4, team_id: "t1", submission_id: "s4" }),
            ],
            error: null,
          })
        }
        if (table === "teams") {
          return createChainableMock({ data: [{ id: "t1", name: "Team D" }], error: null })
        }
        if (table === "prize_assignments") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "hackathon_participants") {
          participantsQueried = true
          return createChainableMock({ data: [], error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await getPublicResultsWithDetails("h1")

      expect(participantsQueried).toBe(false)
      expect(result![0].members).toEqual([])
    })
  })

  describe("getResultsByPrize", () => {
    it("returns empty array when there are no prizes", async () => {
      setMockFromImplementation((table) => {
        if (table === "prizes") {
          return createChainableMock({ data: [], error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await getResultsByPrize("h1")
      expect(result).toEqual([])
    })

    it("aggregates per-prize scores and ranks teams by weighted score", async () => {
      setMockFromImplementation((table) => {
        if (table === "prizes") {
          return createChainableMock({
            data: [
              {
                id: "prize1",
                name: "Best Overall",
                type: "score",
                judging_style: "weighted_score",
                display_order: 0,
                is_screening: false,
              },
            ],
            error: null,
          })
        }
        if (table === "judge_assignments") {
          return createChainableMock({
            data: [
              { id: "ja1", submission_id: "sub1", prize_id: "prize1", assignment_kind: "per_prize", is_complete: true },
              { id: "ja2", submission_id: "sub1", prize_id: "prize1", assignment_kind: "per_prize", is_complete: true },
              { id: "ja3", submission_id: "sub2", prize_id: "prize1", assignment_kind: "per_prize", is_complete: true },
            ],
            error: null,
          })
        }
        if (table === "scores") {
          return createChainableMock({
            data: [
              { judge_assignment_id: "ja1", criteria_id: "c1", score: 8 },
              { judge_assignment_id: "ja1", criteria_id: "c2", score: 9 },
              { judge_assignment_id: "ja2", criteria_id: "c1", score: 9 },
              { judge_assignment_id: "ja2", criteria_id: "c2", score: 8 },
              { judge_assignment_id: "ja3", criteria_id: "c1", score: 5 },
              { judge_assignment_id: "ja3", criteria_id: "c2", score: 6 },
            ],
            error: null,
          })
        }
        if (table === "judging_criteria") {
          return createChainableMock({
            data: [
              { id: "c1", weight: 1, prize_id: "prize1" },
              { id: "c2", weight: 1, prize_id: "prize1" },
            ],
            error: null,
          })
        }
        if (table === "prize_assignments") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "hackathon_results") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "submissions") {
          return createChainableMock({
            data: [
              { id: "sub1", title: "Alpha", team_id: "t1" },
              { id: "sub2", title: "Beta", team_id: "t2" },
            ],
            error: null,
          })
        }
        if (table === "teams") {
          return createChainableMock({
            data: [
              { id: "t1", name: "Team Alpha" },
              { id: "t2", name: "Team Beta" },
            ],
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const groups = await getResultsByPrize("h1")
      expect(groups).toHaveLength(1)
      const [group] = groups
      expect(group.mode).toBe("per_prize")
      expect(group.results).toHaveLength(2)
      expect(group.results[0].submissionTitle).toBe("Alpha")
      expect(group.results[0].rank).toBe(1)
      expect(group.results[0].judgeCount).toBe(2)
      expect(group.results[0].totalScore).toBe(34)
      expect(group.results[0].weightedScore).toBe(8.5)
      expect(group.results[1].submissionTitle).toBe("Beta")
      expect(group.results[1].rank).toBe(2)
      expect(group.results[1].judgeCount).toBe(1)
    })

    it("falls back to overall hackathon_results for prizes without per-prize assignments", async () => {
      setMockFromImplementation((table) => {
        if (table === "prizes") {
          return createChainableMock({
            data: [
              {
                id: "prize-unified",
                name: "Grand Prize",
                type: "score",
                judging_style: "weighted_score",
                display_order: 0,
                is_screening: false,
              },
            ],
            error: null,
          })
        }
        if (table === "judge_assignments") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "scores") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "judging_criteria") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "prize_assignments") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "hackathon_results") {
          return createChainableMock({
            data: [
              { submission_id: "sub1", total_score: 85, weighted_score: 8.5, judge_count: 3, rank: 1 },
              { submission_id: "sub2", total_score: 70, weighted_score: 7.0, judge_count: 3, rank: 2 },
            ],
            error: null,
          })
        }
        if (table === "submissions") {
          return createChainableMock({
            data: [
              { id: "sub1", title: "Alpha", team_id: null },
              { id: "sub2", title: "Beta", team_id: null },
            ],
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const groups = await getResultsByPrize("h1")
      expect(groups).toHaveLength(1)
      expect(groups[0].mode).toBe("unified")
      expect(groups[0].results).toHaveLength(2)
      expect(groups[0].results[0].rank).toBe(1)
      expect(groups[0].results[0].weightedScore).toBe(8.5)
    })

    it("returns assigned winners for manual prize styles", async () => {
      setMockFromImplementation((table) => {
        if (table === "prizes") {
          return createChainableMock({
            data: [
              {
                id: "prize-crowd",
                name: "Crowd Favorite",
                type: "crowd",
                judging_style: "crowd_vote",
                display_order: 0,
                is_screening: false,
              },
            ],
            error: null,
          })
        }
        if (table === "judge_assignments") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "scores") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "judging_criteria") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "prize_assignments") {
          return createChainableMock({
            data: [{ prize_id: "prize-crowd", submission_id: "sub1" }],
            error: null,
          })
        }
        if (table === "hackathon_results") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "submissions") {
          return createChainableMock({
            data: [{ id: "sub1", title: "Crowd Pick", team_id: null }],
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const groups = await getResultsByPrize("h1")
      expect(groups).toHaveLength(1)
      expect(groups[0].mode).toBe("manual")
      expect(groups[0].results).toHaveLength(1)
      expect(groups[0].results[0].isAssignedWinner).toBe(true)
      expect(groups[0].results[0].submissionTitle).toBe("Crowd Pick")
    })

    it("excludes screening prizes", async () => {
      setMockFromImplementation((table) => {
        if (table === "prizes") {
          return createChainableMock({
            data: [
              {
                id: "screening",
                name: "Screening",
                type: "score",
                judging_style: "weighted_score",
                display_order: 0,
                is_screening: true,
              },
            ],
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const groups = await getResultsByPrize("h1")
      expect(groups).toEqual([])
    })
  })
})
