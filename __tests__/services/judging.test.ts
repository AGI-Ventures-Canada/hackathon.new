import { describe, it, expect, beforeEach } from "bun:test"
import {
  createChainableMock,
  resetSupabaseMocks,
  setMockFromImplementation,
} from "../lib/supabase-mock"

const {
  addJudge,
  listJudges,
  removeJudge,
  autoAssignJudges,
  getJudgingProgress,
  getJudgeAssignments,
  saveNotes,
  markAssignmentViewed,
  recalculateForAssignment,
  createPrize,
  listPrizes,
} = await import("@/lib/services/judging")

describe("Judging Service", () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  describe("addJudge", () => {
    it("creates new judge participant when user is not registered", async () => {
      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount <= 2) {
          return createChainableMock({ data: null, error: null })
        }
        return createChainableMock({
          data: { id: "j1", clerk_user_id: "user_123" },
          error: null,
        })
      })

      const result = await addJudge("h1", "user_123")

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.participant.id).toBe("j1")
      }
    })

    it("returns already_judge error when user is already a judge", async () => {
      const chain = createChainableMock({
        data: { id: "j1", role: "judge" },
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await addJudge("h1", "user_123")

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.code).toBe("already_judge")
      }
    })

    it("upgrades existing mentor role to judge", async () => {
      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createChainableMock({
            data: { id: "p1", role: "mentor", team_id: null },
            error: null,
          })
        }
        if (callCount === 2) {
          return createChainableMock({
            data: { id: "p1", role: "mentor" },
            error: null,
          })
        }
        return createChainableMock({
          data: { id: "p1", role: "judge" },
          error: null,
        })
      })

      const result = await addJudge("h1", "user_123")

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.participant.id).toBe("p1")
      }
    })

    it("returns update_failed error when role update fails", async () => {
      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createChainableMock({
            data: { id: "p1", role: "mentor", team_id: null },
            error: null,
          })
        }
        if (callCount === 2) {
          return createChainableMock({
            data: { id: "p1", role: "mentor" },
            error: null,
          })
        }
        return createChainableMock({
          data: null,
          error: { message: "Update failed" },
        })
      })

      const result = await addJudge("h1", "user_123")

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.code).toBe("update_failed")
      }
    })

    it("returns insert_failed error when creating new judge fails", async () => {
      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount <= 2) {
          return createChainableMock({ data: null, error: null })
        }
        return createChainableMock({
          data: null,
          error: { message: "Insert failed" },
        })
      })

      const result = await addJudge("h1", "user_123")

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.code).toBe("insert_failed")
      }
    })

    it("returns role_conflict when user is on a team", async () => {
      setMockFromImplementation(() =>
        createChainableMock({
          data: { id: "p1", role: "participant", team_id: "team_1" },
          error: null,
        })
      )

      const result = await addJudge("h1", "user_123")

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.code).toBe("role_conflict")
      }
    })
  })

  describe("listJudges", () => {
    it("returns judges with assignment and completion counts", async () => {
      let fetchedJudges = false
      setMockFromImplementation(() => {
        if (!fetchedJudges) {
          fetchedJudges = true
          return createChainableMock({
            data: [{ id: "j1", clerk_user_id: "user_123" }],
            error: null,
          })
        }
        return createChainableMock({
          data: [{ judge_participant_id: "j1", is_complete: true }],
          error: null,
        })
      })

      const result = await listJudges("h1")

      expect(result).toHaveLength(1)
      expect(result[0].participantId).toBe("j1")
      expect(result[0].clerkUserId).toBe("user_123")
      expect(result[0].completedCount).toBe(1)
      expect(result[0].assignmentCount).toBe(1)
    })

    it("returns empty array when database query fails", async () => {
      const chain = createChainableMock({
        data: null,
        error: { message: "DB error" },
      })
      setMockFromImplementation(() => chain)

      const result = await listJudges("h1")

      expect(result).toEqual([])
    })

    it("returns empty array when no judges exist", async () => {
      const chain = createChainableMock({
        data: [],
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await listJudges("h1")

      expect(result).toEqual([])
    })
  })

  describe("removeJudge", () => {
    it("removes judge participant and all their assignments", async () => {
      setMockFromImplementation((table) => {
        if (table === "judge_assignments") {
          return createChainableMock({ data: null, error: null })
        }
        if (table === "hackathon_participants") {
          return createChainableMock({ data: null, error: null })
        }
        if (table === "hackathon_results") {
          return createChainableMock({ data: [], error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await removeJudge("h1", "j1")

      expect(result.success).toBe(true)
      expect(result.resultsStale).toBe(false)
    })

    it("marks results as stale if results exist", async () => {
      setMockFromImplementation((table) => {
        if (table === "judge_assignments") {
          return createChainableMock({ data: null, error: null })
        }
        if (table === "hackathon_participants") {
          return createChainableMock({ data: null, error: null })
        }
        if (table === "hackathon_results") {
          return createChainableMock({ data: [{ id: "r1" }], error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await removeJudge("h1", "j1")

      expect(result.success).toBe(true)
      expect(result.resultsStale).toBe(true)
    })

    it("returns error when judge_assignments deletion fails", async () => {
      setMockFromImplementation((table) => {
        if (table === "judge_assignments") {
          return createChainableMock({
            data: null,
            error: { message: "Delete failed" },
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await removeJudge("h1", "j1")

      expect(result.success).toBe(false)
    })

    it("returns error when hackathon_participants deletion fails", async () => {
      setMockFromImplementation((table) => {
        if (table === "judge_assignments") {
          return createChainableMock({ data: null, error: null })
        }
        if (table === "hackathon_participants") {
          return createChainableMock({
            data: null,
            error: { message: "Delete failed" },
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await removeJudge("h1", "j1")

      expect(result.success).toBe(false)
    })
  })

  describe("autoAssignJudges", () => {
    it("assigns judges to submissions for a prize", async () => {
      let submissionsCallCount = 0
      let assignmentsCallCount = 0
      setMockFromImplementation((table) => {
        if (table === "prizes") {
          return createChainableMock({
            data: { id: "p1", round_id: null },
            error: null,
          })
        }
        if (table === "hackathon_participants") {
          return createChainableMock({
            data: [{ id: "j1", team_id: null }],
            error: null,
          })
        }
        if (table === "submissions") {
          submissionsCallCount++
          if (submissionsCallCount === 1) {
            return createChainableMock({
              data: [{ id: "s1" }, { id: "s2" }],
              error: null,
            })
          }
          return createChainableMock({
            data: [{ id: "s1", team_id: "t1" }, { id: "s2", team_id: "t2" }],
            error: null,
          })
        }
        if (table === "judge_assignments") {
          assignmentsCallCount++
          if (assignmentsCallCount === 1) {
            return createChainableMock({ data: [], error: null })
          }
          return createChainableMock({ data: null, error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await autoAssignJudges("h1", "p1", 3)

      expect(result.assignedCount).toBe(2)
    })

    it("returns zero when prize not found", async () => {
      setMockFromImplementation((table) => {
        if (table === "prizes") {
          return createChainableMock({ data: null, error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await autoAssignJudges("h1", "p1", 3)

      expect(result.assignedCount).toBe(0)
    })

    it("returns zero when no judges exist", async () => {
      setMockFromImplementation((table) => {
        if (table === "prizes") {
          return createChainableMock({
            data: { id: "p1", round_id: null },
            error: null,
          })
        }
        if (table === "hackathon_participants") {
          return createChainableMock({ data: [], error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await autoAssignJudges("h1", "p1", 3)

      expect(result.assignedCount).toBe(0)
    })

    it("skips conflict of interest assignments", async () => {
      let submissionsCallCount = 0
      let assignmentsCallCount = 0
      setMockFromImplementation((table) => {
        if (table === "prizes") {
          return createChainableMock({
            data: { id: "p1", round_id: null },
            error: null,
          })
        }
        if (table === "hackathon_participants") {
          return createChainableMock({
            data: [{ id: "j1", team_id: "t1" }],
            error: null,
          })
        }
        if (table === "submissions") {
          submissionsCallCount++
          if (submissionsCallCount === 1) {
            return createChainableMock({
              data: [{ id: "s1" }],
              error: null,
            })
          }
          return createChainableMock({
            data: [{ id: "s1", team_id: "t1" }],
            error: null,
          })
        }
        if (table === "judge_assignments") {
          assignmentsCallCount++
          if (assignmentsCallCount === 1) {
            return createChainableMock({ data: [], error: null })
          }
          return createChainableMock({ data: null, error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await autoAssignJudges("h1", "p1", 3)

      expect(result.assignedCount).toBe(0)
    })

    it("returns zero when insert fails", async () => {
      let submissionsCallCount = 0
      let assignmentsCallCount = 0
      setMockFromImplementation((table) => {
        if (table === "prizes") {
          return createChainableMock({
            data: { id: "p1", round_id: null },
            error: null,
          })
        }
        if (table === "hackathon_participants") {
          return createChainableMock({
            data: [{ id: "j1", team_id: null }],
            error: null,
          })
        }
        if (table === "submissions") {
          submissionsCallCount++
          if (submissionsCallCount === 1) {
            return createChainableMock({
              data: [{ id: "s1" }],
              error: null,
            })
          }
          return createChainableMock({
            data: [{ id: "s1", team_id: "t1" }],
            error: null,
          })
        }
        if (table === "judge_assignments") {
          assignmentsCallCount++
          if (assignmentsCallCount === 1) {
            return createChainableMock({ data: [], error: null })
          }
          return createChainableMock({
            data: null,
            error: { message: "Insert failed" },
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await autoAssignJudges("h1", "p1", 3)

      expect(result.assignedCount).toBe(0)
    })
  })

  describe("getJudgingProgress", () => {
    it("returns progress with completed assignments", async () => {
      setMockFromImplementation((table) => {
        if (table === "judge_assignments") {
          return createChainableMock({
            data: [
              { judge_participant_id: "j1", is_complete: true },
              { judge_participant_id: "j1", is_complete: false },
              { judge_participant_id: "j2", is_complete: true },
            ],
            error: null,
          })
        }
        if (table === "hackathon_participants") {
          return createChainableMock({
            data: [
              { id: "j1", clerk_user_id: "user_1" },
              { id: "j2", clerk_user_id: "user_2" },
            ],
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await getJudgingProgress("h1")

      expect(result.totalAssignments).toBe(3)
      expect(result.completedAssignments).toBe(2)
      expect(result.judges).toHaveLength(2)
    })

    it("handles no assignments", async () => {
      setMockFromImplementation((table) => {
        if (table === "judge_assignments") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "hackathon_participants") {
          return createChainableMock({ data: [], error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await getJudgingProgress("h1")

      expect(result.totalAssignments).toBe(0)
      expect(result.completedAssignments).toBe(0)
      expect(result.judges).toEqual([])
    })
  })

  describe("getJudgeAssignments", () => {
    it("returns all assignments for a specific judge with submission details", async () => {
      let foundParticipant = false
      setMockFromImplementation((table) => {
        if (table === "hackathon_participants" && !foundParticipant) {
          foundParticipant = true
          return createChainableMock({
            data: { id: "j1" },
            error: null,
          })
        }
        if (table === "judge_assignments") {
          return createChainableMock({
            data: [
              {
                id: "a1",
                submission_id: "s1",
                is_complete: false,
                notes: "",
                submission: {
                  title: "Project",
                  description: "Desc",
                  github_url: "https://github.com/test",
                  live_app_url: null,
                  screenshot_url: null,
                  team_id: "t1",
                },
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

      const result = await getJudgeAssignments("h1", "user_123")

      expect(result).toHaveLength(1)
      expect(result[0].submissionTitle).toBe("Project")
      expect(result[0].teamName).toBe("Team One")
    })

    it("returns empty array when user is not a judge for this hackathon", async () => {
      const chain = createChainableMock({
        data: null,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await getJudgeAssignments("h1", "user_not_judge")

      expect(result).toEqual([])
    })

    it("returns empty array when database query fails", async () => {
      let foundParticipant = false
      setMockFromImplementation(() => {
        if (!foundParticipant) {
          foundParticipant = true
          return createChainableMock({ data: { id: "j1" }, error: null })
        }
        return createChainableMock({
          data: null,
          error: { message: "DB error" },
        })
      })

      const result = await getJudgeAssignments("h1", "user_123")

      expect(result).toEqual([])
    })
  })

  describe("saveNotes", () => {
    it("saves notes to assignment successfully", async () => {
      let fetchedAssignment = false
      setMockFromImplementation(() => {
        if (!fetchedAssignment) {
          fetchedAssignment = true
          return createChainableMock({
            data: {
              id: "a1",
              judge: { clerk_user_id: "user_123" },
            },
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await saveNotes("a1", "user_123", "Updated notes")

      expect(result).toBe(true)
    })

    it("returns false when assignment does not exist", async () => {
      const chain = createChainableMock({
        data: null,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await saveNotes("a1", "user_123", "Notes")

      expect(result).toBe(false)
    })

    it("returns false when user is not the assigned judge", async () => {
      const chain = createChainableMock({
        data: {
          id: "a1",
          judge: { clerk_user_id: "other_user" },
        },
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await saveNotes("a1", "user_123", "Notes")

      expect(result).toBe(false)
    })

    it("returns false when database update fails", async () => {
      let fetchedAssignment = false
      setMockFromImplementation(() => {
        if (!fetchedAssignment) {
          fetchedAssignment = true
          return createChainableMock({
            data: {
              id: "a1",
              judge: { clerk_user_id: "user_123" },
            },
            error: null,
          })
        }
        return createChainableMock({
          data: null,
          error: { message: "Update failed" },
        })
      })

      const result = await saveNotes("a1", "user_123", "Notes")

      expect(result).toBe(false)
    })
  })

  describe("markAssignmentViewed", () => {
    it("marks assignment as viewed when not already viewed", async () => {
      let fetchedAssignment = false
      setMockFromImplementation(() => {
        if (!fetchedAssignment) {
          fetchedAssignment = true
          return createChainableMock({
            data: {
              id: "a1",
              viewed_at: null,
              judge: { clerk_user_id: "user_123" },
            },
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await markAssignmentViewed("a1", "user_123")
      expect(result).toBe(true)
    })

    it("returns true without updating when already viewed", async () => {
      const chain = createChainableMock({
        data: {
          id: "a1",
          viewed_at: "2026-01-01T00:00:00Z",
          judge: { clerk_user_id: "user_123" },
        },
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await markAssignmentViewed("a1", "user_123")
      expect(result).toBe(true)
    })

    it("returns false when assignment does not exist", async () => {
      const chain = createChainableMock({
        data: null,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await markAssignmentViewed("a1", "user_123")
      expect(result).toBe(false)
    })

    it("returns false when user is not the assigned judge", async () => {
      const chain = createChainableMock({
        data: {
          id: "a1",
          viewed_at: null,
          judge: { clerk_user_id: "other_user" },
        },
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await markAssignmentViewed("a1", "user_123")
      expect(result).toBe(false)
    })

    it("returns false when database update fails", async () => {
      let fetchedAssignment = false
      setMockFromImplementation(() => {
        if (!fetchedAssignment) {
          fetchedAssignment = true
          return createChainableMock({
            data: {
              id: "a1",
              viewed_at: null,
              judge: { clerk_user_id: "user_123" },
            },
            error: null,
          })
        }
        return createChainableMock({
          data: null,
          error: { message: "Update failed" },
        })
      })

      const result = await markAssignmentViewed("a1", "user_123")
      expect(result).toBe(false)
    })
  })

  describe("recalculateForAssignment", () => {
    it("looks up assignment and triggers calculation when prize_id exists", async () => {
      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createChainableMock({
            data: { hackathon_id: "h1", prize_id: "p1" },
            error: null,
          })
        }
        if (callCount === 2) {
          return createChainableMock({
            data: { judging_style: "bucket_sort" },
            error: null,
          })
        }
        if (callCount === 3) {
          return createChainableMock({ data: null, error: null })
        }
        if (callCount === 4) {
          return createChainableMock({ data: [], error: null })
        }
        return createChainableMock({ data: [], error: null })
      })

      await recalculateForAssignment("a1")
      expect(callCount).toBeGreaterThanOrEqual(2)
    })

    it("does nothing when assignment not found", async () => {
      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        return createChainableMock({ data: null, error: { message: "Not found" } })
      })

      await recalculateForAssignment("nonexistent")
      expect(callCount).toBe(1)
    })
  })

  describe("createPrize", () => {
    it("rejects gate_check without criteria before touching the database", async () => {
      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        return createChainableMock({ data: null, error: null })
      })

      const result = await createPrize("h1", {
        name: "Best Use of MCP",
        judgingStyle: "gate_check",
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toContain("criterion")
        expect(result.code).toBe("validation")
      }
      expect(callCount).toBe(0)
    })

    it("rejects gate_check when criteria is present but every name is blank", async () => {
      const result = await createPrize("h1", {
        name: "Blank Checks",
        judgingStyle: "gate_check",
        criteria: [
          { name: "   " },
          { name: "" },
        ],
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.code).toBe("validation")
      }
    })

    it("inserts criteria linked to the new prize for gate_check", async () => {
      const chains: Record<string, ReturnType<typeof createChainableMock>[]> = {}

      setMockFromImplementation((table: string) => {
        const chain =
          table === "prizes"
            ? createChainableMock({
                data: { id: "prize_new", name: "Best Use of MCP", judging_style: "gate_check" },
                error: null,
              })
            : createChainableMock({ data: null, error: null })
        if (!chains[table]) chains[table] = []
        chains[table].push(chain)
        return chain
      })

      const result = await createPrize("h1", {
        name: "Best Use of MCP",
        judgingStyle: "gate_check",
        criteria: [
          { name: "Uses MCP", description: "Integrates MCP meaningfully" },
          { name: "Working demo", description: null },
        ],
      })

      expect(result.success).toBe(true)
      const criteriaChain = chains["judging_criteria"]?.[0]
      expect(criteriaChain).toBeDefined()
      const insertArgs = criteriaChain!.insert.mock.calls[0]?.[0] as Record<string, unknown>[]
      expect(insertArgs).toBeDefined()
      expect(insertArgs.length).toBe(2)
      expect(insertArgs[0]).toMatchObject({
        hackathon_id: "h1",
        prize_id: "prize_new",
        name: "Uses MCP",
        display_order: 0,
      })
    })

    it("uses provided buckets for bucket_sort instead of defaults", async () => {
      const chains: Record<string, ReturnType<typeof createChainableMock>[]> = {}

      setMockFromImplementation((table: string) => {
        let chain: ReturnType<typeof createChainableMock>
        if (table === "prizes") {
          chain = createChainableMock({
            data: { id: "prize_bs", name: "Grand Prize", judging_style: "bucket_sort" },
            error: null,
          })
        } else if (table === "bucket_definitions") {
          chain = createChainableMock({
            data: [{ id: "b1" }, { id: "b2" }],
            error: null,
          })
        } else {
          chain = createChainableMock({ data: null, error: null })
        }
        if (!chains[table]) chains[table] = []
        chains[table].push(chain)
        return chain
      })

      const result = await createPrize("h1", {
        name: "Grand Prize",
        judgingStyle: "bucket_sort",
        buckets: [
          { level: 1, label: "Yes" },
          { level: 2, label: "No" },
        ],
      })

      expect(result.success).toBe(true)
      const bucketChains = chains["bucket_definitions"] ?? []
      const insertCalls = bucketChains.flatMap((c) => c.insert.mock.calls as unknown as [Record<string, unknown>[]][])
      const bucketInsertArgs = insertCalls.find(([rows]) => Array.isArray(rows) && rows.length === 2)?.[0]
      expect(bucketInsertArgs).toBeDefined()
      expect(bucketInsertArgs![0]).toMatchObject({ prize_id: "prize_bs", label: "Yes" })
    })

    it("rejects bucket_sort when fewer than two named buckets are provided", async () => {
      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        return createChainableMock({ data: null, error: null })
      })

      const result = await createPrize("h1", {
        name: "Grand Prize",
        judgingStyle: "bucket_sort",
        buckets: [
          { level: 1, label: "Only one" },
          { level: 2, label: "   " },
        ],
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.code).toBe("validation")
        expect(result.error).toContain("two")
      }
      expect(callCount).toBe(0)
    })

    it("stores maxPicks for judges_pick", async () => {
      const chains: Record<string, ReturnType<typeof createChainableMock>[]> = {}

      setMockFromImplementation((table: string) => {
        const chain =
          table === "prizes"
            ? createChainableMock({
                data: { id: "prize_jp", name: "Sponsor Pick", judging_style: "judges_pick", max_picks: 5 },
                error: null,
              })
            : createChainableMock({ data: null, error: null })
        if (!chains[table]) chains[table] = []
        chains[table].push(chain)
        return chain
      })

      const result = await createPrize("h1", {
        name: "Sponsor Pick",
        judgingStyle: "judges_pick",
        maxPicks: 5,
      })

      expect(result.success).toBe(true)
      const prizeChain = chains["prizes"]?.[0]
      const insertArgs = prizeChain?.insert.mock.calls[0]?.[0] as Record<string, unknown>
      expect(insertArgs).toBeDefined()
      expect(insertArgs.max_picks).toBe(5)
    })
  })

  describe("listPrizes", () => {
    it("groups gate_check criteria onto each prize by prize_id", async () => {
      setMockFromImplementation((table: string) => {
        if (table === "prizes") {
          return createChainableMock({
            data: [
              { id: "prize_gc", name: "Best Use of MCP", judging_style: "gate_check", display_order: 0 },
              { id: "prize_bs", name: "Grand Prize", judging_style: "bucket_sort", display_order: 1 },
            ],
            error: null,
          })
        }
        if (table === "judge_assignments") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "bucket_definitions") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "judging_criteria") {
          return createChainableMock({
            data: [
              { id: "c1", prize_id: "prize_gc", name: "Uses MCP", description: null, display_order: 0 },
              { id: "c2", prize_id: "prize_gc", name: "Working demo", description: "Runs end-to-end", display_order: 1 },
            ],
            error: null,
          })
        }
        return createChainableMock({ data: [], error: null })
      })

      const prizes = await listPrizes("h1")
      const gateCheck = prizes.find((p) => p.id === "prize_gc")
      const bucketSort = prizes.find((p) => p.id === "prize_bs")

      expect(gateCheck?.criteria).toBeDefined()
      expect(gateCheck?.criteria?.length).toBe(2)
      expect(gateCheck?.criteria?.[0]).toMatchObject({
        id: "c1",
        name: "Uses MCP",
        displayOrder: 0,
      })
      expect(gateCheck?.criteria?.[1]).toMatchObject({
        id: "c2",
        name: "Working demo",
        description: "Runs end-to-end",
      })
      expect(bucketSort?.criteria).toBeUndefined()
    })

    it("skips the criteria query when no prizes use gate_check", async () => {
      const queriedTables: string[] = []
      setMockFromImplementation((table: string) => {
        queriedTables.push(table)
        if (table === "prizes") {
          return createChainableMock({
            data: [
              { id: "prize_bs", name: "Grand Prize", judging_style: "bucket_sort", display_order: 0 },
            ],
            error: null,
          })
        }
        return createChainableMock({ data: [], error: null })
      })

      await listPrizes("h1")
      expect(queriedTables).not.toContain("judging_criteria")
    })
  })

})
