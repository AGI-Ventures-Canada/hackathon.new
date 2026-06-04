import { describe, it, expect, beforeEach } from "bun:test"
import {
  createChainableMock,
  resetSupabaseMocks,
  setMockFromImplementation,
} from "../lib/supabase-mock"

const { getAssignmentDetail, submitScores } = await import(
  "@/lib/services/judging"
)

const ASSIGNMENT_ID = "11111111-1111-1111-1111-111111111111"
const HACKATHON_ID = "22222222-2222-2222-2222-222222222222"
const PRIZE_ID = "33333333-3333-3333-3333-333333333333"
const CRITERIA_ID_1 = "44444444-4444-4444-4444-444444444444"
const CRITERIA_ID_2 = "55555555-5555-5555-5555-555555555555"
const TEAM_ID = "66666666-6666-6666-6666-666666666666"

const SUBMISSION_ID = "77777777-7777-7777-7777-777777777777"
const MOCK_OWNERSHIP = { hackathonId: HACKATHON_ID, prizeId: PRIZE_ID, isComplete: false, submissionId: SUBMISSION_ID, notes: "some notes" }

function mockSubmissionRow() {
  return {
    title: "My Project",
    description: "A cool project",
    github_url: "https://github.com/test/repo",
    live_app_url: "https://myapp.com",
    demo_video_url: "https://youtube.com/watch?v=test-demo",
    screenshot_url: "https://img.com/shot.png",
    team_id: TEAM_ID,
  }
}

function mockCriteriaRows() {
  return [
    {
      id: CRITERIA_ID_1,
      name: "Innovation",
      description: "How novel",
      min_score: 1,
      max_score: 10,
      weight: 2.0,
      category: "core",
      display_order: 0,
    },
    {
      id: CRITERIA_ID_2,
      name: "Execution",
      description: "How polished",
      min_score: 0,
      max_score: 10,
      weight: 1.0,
      category: "bonus",
      display_order: 1,
    },
  ]
}

describe("Judging Scoring Service", () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  describe("getAssignmentDetail", () => {
    it("returns null when assignment not found", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: null, error: null })
      )

      const result = await getAssignmentDetail(ASSIGNMENT_ID, MOCK_OWNERSHIP)
      expect(result).toBeNull()
    })

    it("returns full detail with criteria, rubric levels, and scores", async () => {
      let callIndex = 0
      setMockFromImplementation((table) => {
        callIndex++

        if (callIndex === 1) {
          return createChainableMock({ data: mockSubmissionRow(), error: null })
        }
        if (table === "teams") {
          return createChainableMock({
            data: { name: "Dream Team" },
            error: null,
          })
        }
        if (table === "judging_criteria") {
          return createChainableMock({
            data: mockCriteriaRows(),
            error: null,
          })
        }
        if (table === "rubric_levels") {
          return createChainableMock({
            data: [
              {
                id: "rl1",
                criteria_id: CRITERIA_ID_1,
                level_number: 1,
                label: "Poor",
                description: "Needs work",
              },
              {
                id: "rl2",
                criteria_id: CRITERIA_ID_1,
                level_number: 2,
                label: "Good",
                description: null,
              },
            ],
            error: null,
          })
        }
        if (table === "scores") {
          return createChainableMock({
            data: [{ criteria_id: CRITERIA_ID_1, score: 7 }],
            error: null,
          })
        }

        return createChainableMock({ data: null, error: null })
      })

      const result = await getAssignmentDetail(ASSIGNMENT_ID, MOCK_OWNERSHIP)

      expect(result).not.toBeNull()
      expect(result!.id).toBe(ASSIGNMENT_ID)
      expect(result!.submissionTitle).toBe("My Project")
      expect(result!.submissionDescription).toBe("A cool project")
      expect(result!.submissionGithubUrl).toBe("https://github.com/test/repo")
      expect(result!.submissionDemoVideoUrl).toBe("https://youtube.com/watch?v=test-demo")
      expect(result!.teamName).toBe("Dream Team")
      expect(result!.isComplete).toBe(false)
      expect(result!.notes).toBe("some notes")
      expect(result!.criteria).toHaveLength(2)

      const c1 = result!.criteria[0]
      expect(c1.name).toBe("Innovation")
      expect(c1.min_score).toBe(1)
      expect(c1.max_score).toBe(10)
      expect(c1.weight).toBe(2.0)
      expect(c1.category).toBe("core")
      expect(c1.currentScore).toBe(7)
      expect(c1.rubricLevels).toHaveLength(2)
      expect(c1.rubricLevels[0].label).toBe("Poor")

      const c2 = result!.criteria[1]
      expect(c2.name).toBe("Execution")
      expect(c2.min_score).toBe(0)
      expect(c2.currentScore).toBeNull()
      expect(c2.rubricLevels).toHaveLength(0)
    })

    it("falls back to hackathon-wide criteria when no prize-specific criteria", async () => {
      let callIndex = 0
      let criteriaCallCount = 0
      setMockFromImplementation((table) => {
        callIndex++

        if (callIndex === 1) {
          return createChainableMock({ data: mockSubmissionRow(), error: null })
        }
        if (table === "teams") {
          return createChainableMock({
            data: { name: "Team A" },
            error: null,
          })
        }
        if (table === "judging_criteria") {
          criteriaCallCount++
          if (criteriaCallCount === 1) {
            return createChainableMock({ data: [], error: null })
          }
          return createChainableMock({
            data: mockCriteriaRows(),
            error: null,
          })
        }
        if (table === "rubric_levels") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "scores") {
          return createChainableMock({ data: [], error: null })
        }

        return createChainableMock({ data: null, error: null })
      })

      const result = await getAssignmentDetail(ASSIGNMENT_ID, MOCK_OWNERSHIP)

      expect(result).not.toBeNull()
      expect(result!.criteria).toHaveLength(2)
      expect(criteriaCallCount).toBe(2)
    })

    it("returns null teamName when submission has no team", async () => {
      const submissionNoTeam = { ...mockSubmissionRow(), team_id: null }

      let callIndex = 0
      setMockFromImplementation((table) => {
        callIndex++

        if (callIndex === 1) {
          return createChainableMock({ data: submissionNoTeam, error: null })
        }
        if (table === "judging_criteria") {
          return createChainableMock({ data: [], error: null })
        }

        return createChainableMock({ data: null, error: null })
      })

      const result = await getAssignmentDetail(ASSIGNMENT_ID, MOCK_OWNERSHIP)

      expect(result).not.toBeNull()
      expect(result!.teamName).toBeNull()
    })

    it("returns empty criteria array when no criteria exist", async () => {
      let callIndex = 0
      setMockFromImplementation((table) => {
        callIndex++

        if (callIndex === 1) {
          return createChainableMock({ data: mockSubmissionRow(), error: null })
        }
        if (table === "teams") {
          return createChainableMock({
            data: { name: "Team" },
            error: null,
          })
        }
        if (table === "judging_criteria") {
          return createChainableMock({ data: [], error: null })
        }

        return createChainableMock({ data: null, error: null })
      })

      const result = await getAssignmentDetail(ASSIGNMENT_ID, MOCK_OWNERSHIP)

      expect(result).not.toBeNull()
      expect(result!.criteria).toHaveLength(0)
    })
  })

  describe("submitScores", () => {
    it("upserts scores and marks assignment complete", async () => {
      setMockFromImplementation((table) => {
        if (table === "judging_criteria") {
          return createChainableMock({ data: [
            { id: CRITERIA_ID_1, max_score: 10 },
            { id: CRITERIA_ID_2, max_score: 10 },
          ], error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await submitScores(
        ASSIGNMENT_ID,
        MOCK_OWNERSHIP,
        [
          { criteriaId: CRITERIA_ID_1, score: 8 },
          { criteriaId: CRITERIA_ID_2, score: 6 },
        ],
        "Great project"
      )

      expect(result).toEqual({ success: true })
    })

    it("returns error when score upsert fails", async () => {
      setMockFromImplementation((table) => {
        if (table === "judging_criteria") {
          return createChainableMock({ data: [{ id: CRITERIA_ID_1, max_score: 10 }], error: null })
        }
        return createChainableMock({
          data: null,
          error: { message: "DB error" },
        })
      })

      const result = await submitScores(
        ASSIGNMENT_ID,
        MOCK_OWNERSHIP,
        [{ criteriaId: CRITERIA_ID_1, score: 5 }],
        ""
      )

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.code).toBe("upsert_failed")
      }
    })

    it("returns error when marking complete fails", async () => {
      let callIndex = 0
      setMockFromImplementation((table) => {
        callIndex++

        if (table === "judging_criteria") {
          return createChainableMock({ data: [{ id: CRITERIA_ID_1, max_score: 10 }], error: null })
        }
        if (callIndex === 2) {
          return createChainableMock({ data: null, error: null })
        }
        return createChainableMock({
          data: null,
          error: { message: "Update failed" },
        })
      })

      const result = await submitScores(
        ASSIGNMENT_ID,
        MOCK_OWNERSHIP,
        [{ criteriaId: CRITERIA_ID_1, score: 5 }],
        "notes"
      )

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.code).toBe("update_failed")
      }
    })

    it("rejects score exceeding max_score", async () => {
      setMockFromImplementation((table) => {
        if (table === "judging_criteria") {
          return createChainableMock({ data: [{ id: CRITERIA_ID_1, max_score: 10 }], error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await submitScores(
        ASSIGNMENT_ID,
        MOCK_OWNERSHIP,
        [{ criteriaId: CRITERIA_ID_1, score: 15 }],
        ""
      )

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.code).toBe("score_exceeds_max")
      }
    })

    it("rejects criteriaId not belonging to assignment's prize", async () => {
      setMockFromImplementation((table) => {
        if (table === "judging_criteria") {
          return createChainableMock({ data: [{ id: CRITERIA_ID_1, max_score: 10 }], error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await submitScores(
        ASSIGNMENT_ID,
        MOCK_OWNERSHIP,
        [{ criteriaId: "99999999-9999-9999-9999-999999999999", score: 5 }],
        ""
      )

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.code).toBe("invalid_criteria")
      }
    })

    it("rejects empty scores when criteria exist", async () => {
      setMockFromImplementation((table) => {
        if (table === "judging_criteria") {
          return createChainableMock({ data: [
            { id: CRITERIA_ID_1, max_score: 10 },
          ], error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await submitScores(ASSIGNMENT_ID, MOCK_OWNERSHIP, [], "just notes")

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.code).toBe("empty_scores")
      }
    })

    it("succeeds with empty scores when no criteria exist", async () => {
      setMockFromImplementation((table) => {
        if (table === "judging_criteria") {
          return createChainableMock({ data: [], error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await submitScores(ASSIGNMENT_ID, MOCK_OWNERSHIP, [], "just notes")

      expect(result).toEqual({ success: true })
    })

    it("accepts score exactly at max_score", async () => {
      setMockFromImplementation((table) => {
        if (table === "judging_criteria") {
          return createChainableMock({ data: [{ id: CRITERIA_ID_1, max_score: 10 }], error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await submitScores(
        ASSIGNMENT_ID,
        MOCK_OWNERSHIP,
        [{ criteriaId: CRITERIA_ID_1, score: 10 }],
        ""
      )

      expect(result).toEqual({ success: true })
    })

    it("rejects score below min_score for weighted-style criteria", async () => {
      setMockFromImplementation((table) => {
        if (table === "judging_criteria") {
          return createChainableMock({
            data: [{ id: CRITERIA_ID_1, min_score: 1, max_score: 10 }],
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await submitScores(
        ASSIGNMENT_ID,
        MOCK_OWNERSHIP,
        [{ criteriaId: CRITERIA_ID_1, score: 0 }],
        ""
      )

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.code).toBe("invalid_score")
        expect(result.error).toContain("minimum 1")
      }
    })

    it("accepts score exactly at min_score", async () => {
      setMockFromImplementation((table) => {
        if (table === "judging_criteria") {
          return createChainableMock({
            data: [{ id: CRITERIA_ID_1, min_score: 1, max_score: 10 }],
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await submitScores(
        ASSIGNMENT_ID,
        MOCK_OWNERSHIP,
        [{ criteriaId: CRITERIA_ID_1, score: 1 }],
        ""
      )

      expect(result).toEqual({ success: true })
    })

    it("rejects negative score", async () => {
      setMockFromImplementation((table) => {
        if (table === "judging_criteria") {
          return createChainableMock({ data: [{ id: CRITERIA_ID_1, max_score: 10 }], error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await submitScores(
        ASSIGNMENT_ID,
        MOCK_OWNERSHIP,
        [{ criteriaId: CRITERIA_ID_1, score: -1 }],
        ""
      )

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.code).toBe("invalid_score")
      }
    })

    it("rejects submission when assignment is already complete", async () => {
      const completeOwnership = { hackathonId: HACKATHON_ID, prizeId: PRIZE_ID, isComplete: true, submissionId: SUBMISSION_ID, notes: "" }

      const result = await submitScores(
        ASSIGNMENT_ID,
        completeOwnership,
        [{ criteriaId: CRITERIA_ID_1, score: 5 }],
        "notes"
      )

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.code).toBe("already_complete")
        expect(result.error).toBe("Assignment is already complete")
      }
    })
  })
})
