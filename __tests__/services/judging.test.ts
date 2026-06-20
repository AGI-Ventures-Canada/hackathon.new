import { describe, it, expect, beforeEach, mock } from "bun:test"
import {
  createChainableMock,
  mockRpcCall,
  mockSuccess,
  mockError,
  resetSupabaseMocks,
  setMockFromImplementation,
} from "../lib/supabase-mock"

const {
  addJudge,
  listJudges,
  removeJudge,
  clearAllJudgeAssignments,
  autoAssignJudges,
  assignWeightedScoreJudge,
  getWeightedScoreAssignmentSummary,
  countUnassignedSubmissions,
  getJudgingProgress,
  getJudgeAssignments,
  saveNotes,
  markAssignmentViewed,
  recalculateForAssignment,
  createPrize,
  listPrizes,
  replacePrizeCriteria,
  createRoundsPreset,
  assertAssignmentWritable,
  seedDefaultCoreCriteria,
  DEFAULT_CORE_CRITERIA,
  calculateWeightedScoreResults,
  calculateCoreOnlyResults,
  getJudgeSummary,
  listCoreCriteria,
  listPrizeCriteria,
  listPrizeCriteriaByPrizeIds,
  createCoreCriterion,
  updateCoreCriterion,
  deleteCoreCriterion,
  getWeightedScoreAssignmentCounts,
  autoAssignSubmissionToRoomJudges,
  syncRoomSubmissionsToJudges,
  listAdvanceCandidates,
  listRoundWinnerPicker,
  unadvanceSubmissions,
  roundBelongsToHackathon,
  listJudgeSubmissionAssignments,
  assignJudgeToSubmission,
  unassignJudgeFromSubmission,
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

    it("succeeds even when hackathon_judges_display deletion fails", async () => {
      setMockFromImplementation((table) => {
        if (table === "judge_assignments") {
          return createChainableMock({ data: null, error: null })
        }
        if (table === "hackathon_judges_display") {
          return createChainableMock({
            data: null,
            error: { message: "Display delete failed" },
          })
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
    })
  })

  describe("clearAllJudgeAssignments", () => {
    it("returns success with zero count when there are no assignments", async () => {
      setMockFromImplementation((table) => {
        if (table === "judge_assignments") {
          return createChainableMock({ data: [], error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await clearAllJudgeAssignments("h1")

      expect(result.success).toBe(true)
      expect(result.removedCount).toBe(0)
      expect(result.resultsStale).toBe(false)
    })

    it("deletes assignments and prize-mappings, reports stale results when results exist", async () => {
      let judgeAssignmentsCallCount = 0
      setMockFromImplementation((table) => {
        if (table === "judge_assignments") {
          judgeAssignmentsCallCount++
          if (judgeAssignmentsCallCount === 1) {
            return createChainableMock({
              data: [{ id: "a1" }, { id: "a2" }, { id: "a3" }],
              error: null,
            })
          }
          return createChainableMock({ data: null, error: null })
        }
        if (table === "judge_prize_assignments") {
          return createChainableMock({ data: null, error: null })
        }
        if (table === "hackathon_results") {
          return createChainableMock({ data: [{ id: "r1" }], error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await clearAllJudgeAssignments("h1")

      expect(result.success).toBe(true)
      expect(result.removedCount).toBe(3)
      expect(result.resultsStale).toBe(true)
    })

    it("returns failure when judge_assignments delete errors", async () => {
      let judgeAssignmentsCallCount = 0
      setMockFromImplementation((table) => {
        if (table === "judge_assignments") {
          judgeAssignmentsCallCount++
          if (judgeAssignmentsCallCount === 1) {
            return createChainableMock({ data: [{ id: "a1" }], error: null })
          }
          return createChainableMock({
            data: null,
            error: { message: "Delete failed" },
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await clearAllJudgeAssignments("h1")

      expect(result.success).toBe(false)
      expect(result.removedCount).toBe(0)
    })

    it("reports partial failure when judge_prize_assignments cleanup fails", async () => {
      let judgeAssignmentsCallCount = 0
      setMockFromImplementation((table) => {
        if (table === "judge_assignments") {
          judgeAssignmentsCallCount++
          if (judgeAssignmentsCallCount === 1) {
            return createChainableMock({ data: [{ id: "a1" }], error: null })
          }
          return createChainableMock({ data: null, error: null })
        }
        if (table === "judge_prize_assignments") {
          return createChainableMock({
            data: null,
            error: { message: "Cleanup failed" },
          })
        }
        if (table === "hackathon_results") {
          return createChainableMock({ data: [], error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await clearAllJudgeAssignments("h1")

      expect(result.success).toBe(false)
      expect(result.partialFailure).toBe("prize_assignments")
      expect(result.removedCount).toBe(1)
      expect(result.resultsStale).toBe(false)
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

    it("filters submissions to room teams when roomId is provided", async () => {
      let submissionsCallCount = 0
      let assignmentsCallCount = 0
      let inserted: { submission_id: string }[] = []

      setMockFromImplementation((table) => {
        if (table === "prizes") {
          return createChainableMock({ data: { id: "p1", round_id: null }, error: null })
        }
        if (table === "hackathon_participants") {
          return createChainableMock({ data: [{ id: "j1", team_id: null }], error: null })
        }
        if (table === "room_teams") {
          return createChainableMock({ data: [{ team_id: "t1" }], error: null })
        }
        if (table === "submissions") {
          submissionsCallCount++
          if (submissionsCallCount === 1) {
            return createChainableMock({ data: [{ id: "s1" }, { id: "s2" }], error: null })
          }
          return createChainableMock({
            data: [
              { id: "s1", team_id: "t1", teams: null },
              { id: "s2", team_id: "t2", teams: null },
            ],
            error: null,
          })
        }
        if (table === "judge_assignments") {
          assignmentsCallCount++
          if (assignmentsCallCount === 1) {
            return createChainableMock({ data: [], error: null })
          }
          const insertMock = createChainableMock({ data: null, error: null })
          insertMock.insert = mock((rows: { submission_id: string }[]) => {
            inserted = rows
            return Promise.resolve({ data: null, error: null })
          }) as typeof insertMock.insert
          return insertMock
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await autoAssignJudges("h1", "p1", 3, { roomId: "room-1" })

      expect(result.assignedCount).toBe(1)
      expect(inserted).toHaveLength(1)
      expect(inserted[0].submission_id).toBe("s1")
    })

    it("returns zero when room has no teams", async () => {
      setMockFromImplementation((table) => {
        if (table === "prizes") {
          return createChainableMock({ data: { id: "p1", round_id: null }, error: null })
        }
        if (table === "hackathon_participants") {
          return createChainableMock({ data: [{ id: "j1", team_id: null }], error: null })
        }
        if (table === "room_teams") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "submissions") {
          return createChainableMock({ data: [{ id: "s1" }], error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await autoAssignJudges("h1", "p1", 3, { roomId: "empty-room" })

      expect(result.assignedCount).toBe(0)
    })
  })

  describe("autoAssignSubmissionToRoomJudges", () => {
    const H = "11111111-1111-1111-1111-111111111111"
    const SUBMISSION_ID = "ssssssss-ssss-ssss-ssss-ssssssssssss"
    const TEAM = "tttttttt-tttt-tttt-tttt-tttttttttttt"
    const ROOM = "rrrrrrrr-rrrr-rrrr-rrrr-rrrrrrrrrrrr"
    const JUDGE_A = "jjjjjjjj-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
    const JUDGE_B = "jjjjjjjj-bbbb-bbbb-bbbb-bbbbbbbbbbbb"

    it("no-ops when team has no room", async () => {
      setMockFromImplementation((table) => {
        if (table === "room_teams") return createChainableMock(mockSuccess(null))
        return createChainableMock({ data: null, error: null })
      })
      const result = await autoAssignSubmissionToRoomJudges({
        hackathonId: H,
        submissionId: SUBMISSION_ID,
        teamId: TEAM,
      })
      expect(result.routed).toBe(false)
      expect(result.reason).toBe("team_has_no_room")
      expect(result.assignedCount).toBe(0)
    })

    it("no-ops when teamId is null", async () => {
      const result = await autoAssignSubmissionToRoomJudges({
        hackathonId: H,
        submissionId: SUBMISSION_ID,
        teamId: null,
      })
      expect(result.routed).toBe(false)
      expect(result.reason).toBe("team_has_no_room")
    })

    it("no-ops when room has no judges", async () => {
      setMockFromImplementation((table) => {
        if (table === "room_teams") return createChainableMock(mockSuccess({ room_id: ROOM }))
        if (table === "judge_room_assignments") return createChainableMock(mockSuccess([]))
        return createChainableMock({ data: null, error: null })
      })
      const result = await autoAssignSubmissionToRoomJudges({
        hackathonId: H,
        submissionId: SUBMISSION_ID,
        teamId: TEAM,
      })
      expect(result.routed).toBe(false)
      expect(result.reason).toBe("room_has_no_judges")
    })

    it("skips a judge who is on the submitting team (self-judging)", async () => {
      setMockFromImplementation((table) => {
        if (table === "room_teams") return createChainableMock(mockSuccess({ room_id: ROOM }))
        if (table === "judge_room_assignments") {
          return createChainableMock(mockSuccess([{ judge_participant_id: JUDGE_A }]))
        }
        if (table === "hackathon_participants") {
          return createChainableMock(mockSuccess([{ id: JUDGE_A, team_id: TEAM }]))
        }
        return createChainableMock({ data: null, error: null })
      })
      const result = await autoAssignSubmissionToRoomJudges({
        hackathonId: H,
        submissionId: SUBMISSION_ID,
        teamId: TEAM,
      })
      expect(result.routed).toBe(false)
      expect(result.reason).toBe("self_judging_only")
    })

    it("creates one unified_weighted_score row per room judge", async () => {
      let inserted: {
        judge_participant_id: string
        submission_id: string
        prize_id: string | null
        assignment_kind: string
      }[] = []

      setMockFromImplementation((table) => {
        if (table === "room_teams") return createChainableMock(mockSuccess({ room_id: ROOM }))
        if (table === "judge_room_assignments") {
          return createChainableMock(
            mockSuccess([
              { judge_participant_id: JUDGE_A },
              { judge_participant_id: JUDGE_B },
            ])
          )
        }
        if (table === "hackathon_participants") {
          return createChainableMock(
            mockSuccess([
              { id: JUDGE_A, team_id: null },
              { id: JUDGE_B, team_id: null },
            ])
          )
        }
        if (table === "judge_assignments") {
          const chain = createChainableMock<unknown>(mockSuccess([]))
          chain.insert = mock((rows: unknown) => {
            inserted = rows as typeof inserted
            return chain
          }) as typeof chain.insert
          return chain
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await autoAssignSubmissionToRoomJudges({
        hackathonId: H,
        submissionId: SUBMISSION_ID,
        teamId: TEAM,
      })

      expect(result.routed).toBe(true)
      expect(result.assignedCount).toBe(2)
      expect(inserted).toHaveLength(2)
      for (const row of inserted) {
        expect(row.prize_id).toBeNull()
        expect(row.assignment_kind).toBe("unified_weighted_score")
        expect(row.submission_id).toBe(SUBMISSION_ID)
      }
      const ids = inserted.map((r) => r.judge_participant_id)
      expect(ids).toContain(JUDGE_A)
      expect(ids).toContain(JUDGE_B)
    })

    it("skips judges that already have a unified assignment for this submission", async () => {
      let inserted: { judge_participant_id: string }[] = []

      setMockFromImplementation((table) => {
        if (table === "room_teams") return createChainableMock(mockSuccess({ room_id: ROOM }))
        if (table === "judge_room_assignments") {
          return createChainableMock(
            mockSuccess([
              { judge_participant_id: JUDGE_A },
              { judge_participant_id: JUDGE_B },
            ])
          )
        }
        if (table === "hackathon_participants") {
          return createChainableMock(
            mockSuccess([
              { id: JUDGE_A, team_id: null },
              { id: JUDGE_B, team_id: null },
            ])
          )
        }
        if (table === "judge_assignments") {
          const chain = createChainableMock<unknown>(
            mockSuccess([{ judge_participant_id: JUDGE_A }])
          )
          chain.insert = mock((rows: unknown) => {
            inserted = rows as typeof inserted
            return chain
          }) as typeof chain.insert
          return chain
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await autoAssignSubmissionToRoomJudges({
        hackathonId: H,
        submissionId: SUBMISSION_ID,
        teamId: TEAM,
      })

      expect(result.routed).toBe(true)
      expect(result.assignedCount).toBe(1)
      expect(inserted).toHaveLength(1)
      expect(inserted[0].judge_participant_id).toBe(JUDGE_B)
    })

    it("reports routed=true with assignedCount=0 when every judge already has a unified row", async () => {
      setMockFromImplementation((table) => {
        if (table === "room_teams") return createChainableMock(mockSuccess({ room_id: ROOM }))
        if (table === "judge_room_assignments") {
          return createChainableMock(mockSuccess([{ judge_participant_id: JUDGE_A }]))
        }
        if (table === "hackathon_participants") {
          return createChainableMock(mockSuccess([{ id: JUDGE_A, team_id: null }]))
        }
        if (table === "judge_assignments") {
          return createChainableMock(mockSuccess([{ judge_participant_id: JUDGE_A }]))
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await autoAssignSubmissionToRoomJudges({
        hackathonId: H,
        submissionId: SUBMISSION_ID,
        teamId: TEAM,
      })

      expect(result.routed).toBe(true)
      expect(result.reason).toBe("all_existed")
      expect(result.assignedCount).toBe(0)
    })

    it("returns routed=false on insert error", async () => {
      setMockFromImplementation((table) => {
        if (table === "room_teams") return createChainableMock(mockSuccess({ room_id: ROOM }))
        if (table === "judge_room_assignments") {
          return createChainableMock(mockSuccess([{ judge_participant_id: JUDGE_A }]))
        }
        if (table === "hackathon_participants") {
          return createChainableMock(mockSuccess([{ id: JUDGE_A, team_id: null }]))
        }
        if (table === "judge_assignments") {
          const chain = createChainableMock<unknown>(mockSuccess([]))
          chain.insert = mock(() => createChainableMock(mockError("DB error"))) as typeof chain.insert
          return chain
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await autoAssignSubmissionToRoomJudges({
        hackathonId: H,
        submissionId: SUBMISSION_ID,
        teamId: TEAM,
      })

      expect(result.routed).toBe(false)
      expect(result.assignedCount).toBe(0)
    })
  })

  describe("syncRoomSubmissionsToJudges", () => {
    const H = "11111111-1111-1111-1111-111111111111"
    const ROOM_X = "rrrrrrrr-rrrr-rrrr-rrrr-rrrrrrrrrrrr"
    const TEAM_X = "tttttttt-tttt-tttt-tttt-tttttttttttt"
    const SUB_X = "ssssssss-ssss-ssss-ssss-ssssssssssss"
    const JUDGE_X = "jjjjjjjj-aaaa-aaaa-aaaa-aaaaaaaaaaaa"

    it("returns zero when hackathon has no rooms", async () => {
      setMockFromImplementation((table) => {
        if (table === "hackathons") return createChainableMock(mockSuccess({ status: "active" }))
        if (table === "rooms") return createChainableMock(mockSuccess([]))
        return createChainableMock({ data: null, error: null })
      })
      const result = await syncRoomSubmissionsToJudges(H)
      expect(result.submissionsProcessed).toBe(0)
      expect(result.totalAssignmentsCreated).toBe(0)
    })

    it("skips when hackathon status is draft", async () => {
      let touchedRooms = false
      setMockFromImplementation((table) => {
        if (table === "hackathons") return createChainableMock(mockSuccess({ status: "draft" }))
        if (table === "rooms") {
          touchedRooms = true
          return createChainableMock(mockSuccess([{ id: ROOM_X }]))
        }
        return createChainableMock({ data: null, error: null })
      })
      const result = await syncRoomSubmissionsToJudges(H)
      expect(result.skipped).toBe("hackathon_status")
      expect(result.submissionsProcessed).toBe(0)
      expect(touchedRooms).toBe(false)
    })

    it("bulk-inserts one row per (submission, judge) pair across submissions", async () => {
      let inserted: { submission_id: string; judge_participant_id: string }[] = []
      setMockFromImplementation((table) => {
        if (table === "hackathons") return createChainableMock(mockSuccess({ status: "active" }))
        if (table === "rooms") return createChainableMock(mockSuccess([{ id: ROOM_X }]))
        if (table === "room_teams") {
          return createChainableMock(mockSuccess([{ room_id: ROOM_X, team_id: TEAM_X }]))
        }
        if (table === "submissions") {
          return createChainableMock(mockSuccess([{ id: SUB_X, team_id: TEAM_X }]))
        }
        if (table === "judge_room_assignments") {
          return createChainableMock(
            mockSuccess([{ room_id: ROOM_X, judge_participant_id: JUDGE_X }])
          )
        }
        if (table === "hackathon_participants") {
          return createChainableMock(mockSuccess([{ id: JUDGE_X, team_id: null }]))
        }
        if (table === "judge_assignments") {
          const chain = createChainableMock<unknown>(mockSuccess([]))
          chain.insert = mock((rows: unknown) => {
            inserted = rows as typeof inserted
            return chain
          }) as typeof chain.insert
          return chain
        }
        return createChainableMock({ data: null, error: null })
      })
      const result = await syncRoomSubmissionsToJudges(H)
      expect(result.submissionsProcessed).toBe(1)
      expect(result.totalAssignmentsCreated).toBe(1)
      expect(inserted).toHaveLength(1)
      expect(inserted[0].submission_id).toBe(SUB_X)
      expect(inserted[0].judge_participant_id).toBe(JUDGE_X)
    })
  })

  describe("assignWeightedScoreJudge", () => {
    it("filters submissions by room when roomId is provided", async () => {
      let inserted: { submission_id: string }[] = []

      setMockFromImplementation((table) => {
        if (table === "hackathon_participants") {
          return createChainableMock({ data: { id: "j1", team_id: null }, error: null })
        }
        if (table === "room_teams") {
          return createChainableMock({ data: [{ team_id: "t1" }, { team_id: "t3" }], error: null })
        }
        if (table === "submissions") {
          return createChainableMock({
            data: [
              { id: "s1", team_id: "t1" },
              { id: "s3", team_id: "t3" },
            ],
            error: null,
          })
        }
        if (table === "judge_assignments") {
          const m = createChainableMock({ data: [], error: null })
          m.insert = mock((rows: { submission_id: string }[]) => {
            inserted = rows
            return Promise.resolve({ data: null, error: null })
          }) as typeof m.insert
          return m
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await assignWeightedScoreJudge("h1", "j1", { roomId: "room-1" })

      expect(result.success).toBe(true)
      expect(result.assignedCount).toBe(2)
      expect(inserted.map((r) => r.submission_id).sort()).toEqual(["s1", "s3"])
    })

    it("returns zero assignments when room has no teams", async () => {
      setMockFromImplementation((table) => {
        if (table === "hackathon_participants") {
          return createChainableMock({ data: { id: "j1", team_id: null }, error: null })
        }
        if (table === "room_teams") {
          return createChainableMock({ data: [], error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await assignWeightedScoreJudge("h1", "j1", { roomId: "empty" })

      expect(result.success).toBe(true)
      expect(result.assignedCount).toBe(0)
    })

    it("skips judge's own team submissions", async () => {
      let inserted: { submission_id: string }[] = []
      setMockFromImplementation((table) => {
        if (table === "hackathon_participants") {
          return createChainableMock({ data: { id: "j1", team_id: "t1" }, error: null })
        }
        if (table === "submissions") {
          return createChainableMock({
            data: [
              { id: "s1", team_id: "t1" },
              { id: "s2", team_id: "t2" },
            ],
            error: null,
          })
        }
        if (table === "judge_assignments") {
          const m = createChainableMock({ data: [], error: null })
          m.insert = mock((rows: { submission_id: string }[]) => {
            inserted = rows
            return Promise.resolve({ data: null, error: null })
          }) as typeof m.insert
          return m
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await assignWeightedScoreJudge("h1", "j1")

      expect(result.success).toBe(true)
      expect(inserted).toHaveLength(1)
      expect(inserted[0].submission_id).toBe("s2")
    })
  })

  describe("listJudgeSubmissionAssignments", () => {
    it("returns rows with assignment state and own-team flag", async () => {
      setMockFromImplementation((table) => {
        if (table === "hackathon_participants") {
          return createChainableMock({ data: { id: "j1", team_id: "t-self" }, error: null })
        }
        if (table === "submissions") {
          return createChainableMock({
            data: [
              { id: "s1", title: "Zed", team_id: "t-other", teams: { name: "Team Other" } },
              { id: "s2", title: "Apple", team_id: "t-self", teams: { name: "Team Self" } },
              { id: "s3", title: "Mango", team_id: "t-third", teams: { name: "Team Third" } },
            ],
            error: null,
          })
        }
        if (table === "judge_assignments") {
          return createChainableMock({ data: [{ submission_id: "s1" }], error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await listJudgeSubmissionAssignments("h1", "j1")

      expect(result.map((r) => r.submissionId)).toEqual(["s2", "s3", "s1"])
      expect(result.find((r) => r.submissionId === "s1")?.isAssigned).toBe(true)
      expect(result.find((r) => r.submissionId === "s2")?.isOwnTeam).toBe(true)
      expect(result.find((r) => r.submissionId === "s3")?.isAssigned).toBe(false)
    })

    it("returns empty when judge is not found", async () => {
      setMockFromImplementation((table) => {
        if (table === "hackathon_participants") {
          return createChainableMock({ data: null, error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await listJudgeSubmissionAssignments("h1", "missing")
      expect(result).toEqual([])
    })

    it("throws when a database query fails", async () => {
      setMockFromImplementation((table) => {
        if (table === "submissions") {
          return createChainableMock({ data: null, error: { message: "boom" } })
        }
        return createChainableMock({ data: null, error: null })
      })

      await expect(listJudgeSubmissionAssignments("h1", "j1")).rejects.toThrow(/boom/)
    })

    it("scopes to active-round finalists when a round is active", async () => {
      let appliedInClause: { column: string; values: readonly string[] } | null = null
      setMockFromImplementation((table) => {
        if (table === "judging_rounds") {
          return createChainableMock({ data: { id: "round-1" }, error: null })
        }
        if (table === "round_submissions") {
          return createChainableMock({
            data: [{ submission_id: "s1" }, { submission_id: "s2" }],
            error: null,
          })
        }
        if (table === "hackathon_participants") {
          return createChainableMock({ data: { id: "j1", team_id: null }, error: null })
        }
        if (table === "submissions") {
          const m = createChainableMock({
            data: [
              { id: "s1", title: "Apple", team_id: "t1", teams: { name: "Team A" } },
              { id: "s2", title: "Mango", team_id: "t2", teams: { name: "Team B" } },
            ],
            error: null,
          })
          const originalIn = m.in
          m.in = mock(((column: string, values: readonly string[]) => {
            appliedInClause = { column, values }
            return originalIn.call(m, column, values)
          }) as typeof m.in) as typeof m.in
          return m
        }
        if (table === "judge_assignments") {
          return createChainableMock({ data: [], error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await listJudgeSubmissionAssignments("h1", "j1")

      expect(appliedInClause).not.toBeNull()
      expect(appliedInClause?.column).toBe("id")
      expect(appliedInClause?.values).toEqual(["s1", "s2"])
      expect(result.map((r) => r.submissionId).sort()).toEqual(["s1", "s2"])
    })
  })

  describe("assignJudgeToSubmission", () => {
    it("inserts a new unified_weighted_score assignment", async () => {
      let inserted: { submission_id: string; assignment_kind: string } | null = null
      setMockFromImplementation((table) => {
        if (table === "hackathon_participants") {
          return createChainableMock({ data: { id: "j1", team_id: null }, error: null })
        }
        if (table === "submissions") {
          return createChainableMock({ data: { id: "s1", team_id: "t1" }, error: null })
        }
        if (table === "judge_assignments") {
          const m = createChainableMock({ data: null, error: null })
          m.insert = mock((row: { submission_id: string; assignment_kind: string }) => {
            inserted = row
            return Promise.resolve({ data: null, error: null })
          }) as typeof m.insert
          return m
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await assignJudgeToSubmission("h1", "j1", "s1")

      expect(result.success).toBe(true)
      if (result.success) expect(result.alreadyAssigned).toBe(false)
      expect(inserted?.submission_id).toBe("s1")
      expect(inserted?.assignment_kind).toBe("unified_weighted_score")
    })

    it("returns alreadyAssigned when the insert hits a unique-constraint conflict", async () => {
      setMockFromImplementation((table) => {
        if (table === "hackathon_participants") {
          return createChainableMock({ data: { id: "j1", team_id: null }, error: null })
        }
        if (table === "submissions") {
          return createChainableMock({ data: { id: "s1", team_id: "t1" }, error: null })
        }
        if (table === "judge_assignments") {
          const m = createChainableMock({ data: null, error: null })
          m.insert = mock(() =>
            Promise.resolve({ data: null, error: { code: "23505", message: "duplicate key" } })
          ) as typeof m.insert
          return m
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await assignJudgeToSubmission("h1", "j1", "s1")

      expect(result.success).toBe(true)
      if (result.success) expect(result.alreadyAssigned).toBe(true)
    })

    it("rejects when judge belongs to the project's team", async () => {
      setMockFromImplementation((table) => {
        if (table === "hackathon_participants") {
          return createChainableMock({ data: { id: "j1", team_id: "t1" }, error: null })
        }
        if (table === "submissions") {
          return createChainableMock({ data: { id: "s1", team_id: "t1" }, error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await assignJudgeToSubmission("h1", "j1", "s1")

      expect(result.success).toBe(false)
      if (!result.success) expect(result.error).toContain("own team")
    })

    it("returns error when judge is missing", async () => {
      setMockFromImplementation((table) => {
        if (table === "hackathon_participants") {
          return createChainableMock({ data: null, error: null })
        }
        if (table === "submissions") {
          return createChainableMock({ data: { id: "s1", team_id: "t1" }, error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await assignJudgeToSubmission("h1", "missing", "s1")
      expect(result.success).toBe(false)
    })

    it("returns error when submission is missing", async () => {
      setMockFromImplementation((table) => {
        if (table === "hackathon_participants") {
          return createChainableMock({ data: { id: "j1", team_id: null }, error: null })
        }
        if (table === "submissions") {
          return createChainableMock({ data: null, error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await assignJudgeToSubmission("h1", "j1", "missing")
      expect(result.success).toBe(false)
    })

    it("surfaces DB errors from the parallel lookup instead of masking as not-found", async () => {
      setMockFromImplementation((table) => {
        if (table === "hackathon_participants") {
          return createChainableMock({ data: null, error: { message: "lookup-boom" } })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await assignJudgeToSubmission("h1", "j1", "s1")
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error).toContain("lookup-boom")
    })

    it("sets round_id to the active round when the submission is a finalist", async () => {
      let inserted: { round_id: string | null } | null = null
      setMockFromImplementation((table) => {
        if (table === "judging_rounds") {
          return createChainableMock({ data: { id: "round-1" }, error: null })
        }
        if (table === "round_submissions") {
          return createChainableMock({ data: [{ submission_id: "s1" }], error: null })
        }
        if (table === "hackathon_participants") {
          return createChainableMock({ data: { id: "j1", team_id: null }, error: null })
        }
        if (table === "submissions") {
          return createChainableMock({ data: { id: "s1", team_id: "t1" }, error: null })
        }
        if (table === "judge_assignments") {
          const m = createChainableMock({ data: null, error: null })
          m.insert = mock((row: { round_id: string | null }) => {
            inserted = row
            return Promise.resolve({ data: null, error: null })
          }) as typeof m.insert
          return m
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await assignJudgeToSubmission("h1", "j1", "s1")

      expect(result.success).toBe(true)
      expect(inserted?.round_id).toBe("round-1")
    })

    it("inserts with null round_id when the submission is not in the active round", async () => {
      let inserted: { round_id: string | null } | null = null
      setMockFromImplementation((table) => {
        if (table === "judging_rounds") {
          return createChainableMock({ data: { id: "round-1" }, error: null })
        }
        if (table === "round_submissions") {
          return createChainableMock({ data: [{ submission_id: "s-other" }], error: null })
        }
        if (table === "hackathon_participants") {
          return createChainableMock({ data: { id: "j1", team_id: null }, error: null })
        }
        if (table === "submissions") {
          return createChainableMock({ data: { id: "s1", team_id: "t1" }, error: null })
        }
        if (table === "judge_assignments") {
          const m = createChainableMock({ data: null, error: null })
          m.insert = mock((row: { round_id: string | null }) => {
            inserted = row
            return Promise.resolve({ data: null, error: null })
          }) as typeof m.insert
          return m
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await assignJudgeToSubmission("h1", "j1", "s1")

      expect(result.success).toBe(true)
      expect(inserted?.round_id).toBeNull()
    })
  })

  describe("unassignJudgeFromSubmission", () => {
    it("removes the unified_weighted_score assignment", async () => {
      setMockFromImplementation((table) => {
        if (table === "judge_assignments") {
          return createChainableMock({ data: [{ id: "a1" }], error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await unassignJudgeFromSubmission("h1", "j1", "s1")

      expect(result.success).toBe(true)
      if (result.success) expect(result.removed).toBe(true)
    })

    it("returns removed:false when no assignment matched", async () => {
      setMockFromImplementation((table) => {
        if (table === "judge_assignments") {
          return createChainableMock({ data: [], error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await unassignJudgeFromSubmission("h1", "j1", "s1")

      expect(result.success).toBe(true)
      if (result.success) expect(result.removed).toBe(false)
    })

    it("returns failure on database error", async () => {
      setMockFromImplementation((table) => {
        if (table === "judge_assignments") {
          return createChainableMock({ data: null, error: { message: "boom" } })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await unassignJudgeFromSubmission("h1", "j1", "s1")

      expect(result.success).toBe(false)
    })
  })

  describe("getWeightedScoreAssignmentSummary", () => {
    it("aggregates per-room counts and per-judge counts", async () => {
      setMockFromImplementation((table) => {
        if (table === "submissions") {
          return createChainableMock({
            data: [
              { id: "s1", team_id: "t1" },
              { id: "s2", team_id: "t2" },
              { id: "s3", team_id: "t3" },
              { id: "s4", team_id: null },
            ],
            error: null,
          })
        }
        if (table === "rooms") {
          return createChainableMock({
            data: [
              { id: "room-1", name: "Room 1", display_order: 0 },
              { id: "room-2", name: "Room 2", display_order: 1 },
            ],
            error: null,
          })
        }
        if (table === "room_teams") {
          return createChainableMock({
            data: [
              { room_id: "room-1", team_id: "t1" },
              { room_id: "room-1", team_id: "t2" },
              { room_id: "room-2", team_id: "t3" },
            ],
            error: null,
          })
        }
        if (table === "judge_assignments") {
          return createChainableMock({
            data: [
              { judge_participant_id: "j1", submission_id: "s1" },
              { judge_participant_id: "j1", submission_id: "s2" },
              { judge_participant_id: "j1", submission_id: "s3" },
              { judge_participant_id: "j2", submission_id: "s1" },
            ],
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const summary = await getWeightedScoreAssignmentSummary("h1")

      expect(summary.totalSubmissionCount).toBe(4)
      expect(summary.rooms).toEqual([
        { id: "room-1", name: "Room 1", submissionCount: 2 },
        { id: "room-2", name: "Room 2", submissionCount: 1 },
      ])
      expect(summary.countsByJudge.j1).toEqual({
        all: 3,
        byRoom: { "room-1": 2, "room-2": 1 },
      })
      expect(summary.countsByJudge.j2).toEqual({
        all: 1,
        byRoom: { "room-1": 1 },
      })
    })

    it("returns empty rooms when none exist", async () => {
      setMockFromImplementation((table) => {
        if (table === "submissions") {
          return createChainableMock({ data: [{ id: "s1", team_id: "t1" }], error: null })
        }
        if (table === "rooms") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "room_teams") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "judge_assignments") {
          return createChainableMock({ data: [], error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const summary = await getWeightedScoreAssignmentSummary("h1")

      expect(summary.totalSubmissionCount).toBe(1)
      expect(summary.rooms).toEqual([])
      expect(summary.countsByJudge).toEqual({})
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

  describe("countUnassignedSubmissions", () => {
    it("returns the count from the RPC", async () => {
      mockRpcCall("count_unassigned_submissions", mockSuccess(7))

      const result = await countUnassignedSubmissions("h1")

      expect(result).toBe(7)
    })

    it("returns 0 when the RPC errors", async () => {
      mockRpcCall("count_unassigned_submissions", mockError("RPC failed"))

      const result = await countUnassignedSubmissions("h1")

      expect(result).toBe(0)
    })

    it("returns 0 when the RPC returns null", async () => {
      mockRpcCall("count_unassigned_submissions", mockSuccess(null))

      const result = await countUnassignedSubmissions("h1")

      expect(result).toBe(0)
    })
  })

  describe("finalist filtering (active round scoping)", () => {
    it("assignWeightedScoreJudge: scopes to active round finalists when one exists", async () => {
      let inserted: { submission_id: string; round_id: string | null }[] = []

      setMockFromImplementation((table) => {
        if (table === "hackathon_participants") {
          return createChainableMock({ data: { id: "j1", team_id: null }, error: null })
        }
        if (table === "judging_rounds") {
          return createChainableMock({ data: { id: "round-finals" }, error: null })
        }
        if (table === "round_submissions") {
          return createChainableMock({
            data: [{ submission_id: "s2" }, { submission_id: "s4" }],
            error: null,
          })
        }
        if (table === "submissions") {
          return createChainableMock({
            data: [
              { id: "s2", team_id: "t2" },
              { id: "s4", team_id: "t4" },
            ],
            error: null,
          })
        }
        if (table === "judge_assignments") {
          const m = createChainableMock({ data: [], error: null })
          m.insert = mock((rows: { submission_id: string; round_id: string | null }[]) => {
            inserted = rows
            return Promise.resolve({ data: null, error: null })
          }) as typeof m.insert
          return m
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await assignWeightedScoreJudge("h1", "j1")

      expect(result.success).toBe(true)
      expect(result.assignedCount).toBe(2)
      expect(inserted.map((r) => r.submission_id).sort()).toEqual(["s2", "s4"])
      for (const row of inserted) {
        expect(row.round_id).toBe("round-finals")
      }
    })

    it("assignWeightedScoreJudge: falls back to all submitted when no round is active", async () => {
      let inserted: { submission_id: string; round_id: string | null }[] = []

      setMockFromImplementation((table) => {
        if (table === "hackathon_participants") {
          return createChainableMock({ data: { id: "j1", team_id: null }, error: null })
        }
        if (table === "judging_rounds") {
          return createChainableMock({ data: null, error: null })
        }
        if (table === "submissions") {
          return createChainableMock({
            data: [
              { id: "s1", team_id: "t1" },
              { id: "s2", team_id: "t2" },
            ],
            error: null,
          })
        }
        if (table === "judge_assignments") {
          const m = createChainableMock({ data: [], error: null })
          m.insert = mock((rows: { submission_id: string; round_id: string | null }[]) => {
            inserted = rows
            return Promise.resolve({ data: null, error: null })
          }) as typeof m.insert
          return m
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await assignWeightedScoreJudge("h1", "j1")

      expect(result.success).toBe(true)
      expect(result.assignedCount).toBe(2)
      for (const row of inserted) {
        expect(row.round_id).toBeNull()
      }
    })

    it("getJudgeAssignments: hides non-finalist assignments when an active round has finalists", async () => {
      let foundParticipant = false
      setMockFromImplementation((table) => {
        if (table === "hackathon_participants" && !foundParticipant) {
          foundParticipant = true
          return createChainableMock({ data: { id: "j1", team_id: null }, error: null })
        }
        if (table === "judge_assignments") {
          return createChainableMock({
            data: [
              {
                id: "a-s1",
                submission_id: "s1",
                is_complete: false,
                notes: "",
                prize_id: null,
                submission: { title: "Not advanced", description: null, github_url: null, live_app_url: null, screenshot_url: null, team_id: "tA" },
              },
              {
                id: "a-s2",
                submission_id: "s2",
                is_complete: false,
                notes: "",
                prize_id: null,
                submission: { title: "Finalist", description: null, github_url: null, live_app_url: null, screenshot_url: null, team_id: "tB" },
              },
            ],
            error: null,
          })
        }
        if (table === "judging_rounds") {
          return createChainableMock({ data: { id: "round-finals" }, error: null })
        }
        if (table === "round_submissions") {
          return createChainableMock({ data: [{ submission_id: "s2" }], error: null })
        }
        if (table === "teams") {
          return createChainableMock({
            data: [
              { id: "tA", name: "Team A" },
              { id: "tB", name: "Team B" },
            ],
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await getJudgeAssignments("h1", "user_123")

      expect(result).toHaveLength(1)
      expect(result[0].submissionId).toBe("s2")
      expect(result[0].submissionTitle).toBe("Finalist")
    })

    it("getJudgeAssignments: returns every assignment when no round is active", async () => {
      let foundParticipant = false
      setMockFromImplementation((table) => {
        if (table === "hackathon_participants" && !foundParticipant) {
          foundParticipant = true
          return createChainableMock({ data: { id: "j1", team_id: null }, error: null })
        }
        if (table === "judge_assignments") {
          return createChainableMock({
            data: [
              {
                id: "a-s1",
                submission_id: "s1",
                is_complete: false,
                notes: "",
                prize_id: null,
                submission: { title: "P1", description: null, github_url: null, live_app_url: null, screenshot_url: null, team_id: "tA" },
              },
              {
                id: "a-s2",
                submission_id: "s2",
                is_complete: false,
                notes: "",
                prize_id: null,
                submission: { title: "P2", description: null, github_url: null, live_app_url: null, screenshot_url: null, team_id: "tB" },
              },
            ],
            error: null,
          })
        }
        if (table === "judging_rounds") {
          return createChainableMock({ data: null, error: null })
        }
        if (table === "teams") {
          return createChainableMock({
            data: [
              { id: "tA", name: "Team A" },
              { id: "tB", name: "Team B" },
            ],
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await getJudgeAssignments("h1", "user_123")

      expect(result).toHaveLength(2)
    })

    it("getJudgeAssignments: returns every assignment when the active round has no finalists yet (screening / single-round)", async () => {
      let foundParticipant = false
      setMockFromImplementation((table) => {
        if (table === "hackathon_participants" && !foundParticipant) {
          foundParticipant = true
          return createChainableMock({ data: { id: "j1", team_id: null }, error: null })
        }
        if (table === "judge_assignments") {
          return createChainableMock({
            data: [
              {
                id: "a1",
                submission_id: "s1",
                is_complete: false,
                notes: "",
                prize_id: null,
                submission: { title: "P1", description: null, github_url: null, live_app_url: null, screenshot_url: null, team_id: "tA" },
              },
            ],
            error: null,
          })
        }
        if (table === "judging_rounds") {
          return createChainableMock({ data: { id: "round-screening" }, error: null })
        }
        if (table === "round_submissions") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "teams") {
          return createChainableMock({ data: [{ id: "tA", name: "Team A" }], error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await getJudgeAssignments("h1", "user_123")

      expect(result).toHaveLength(1)
    })

    it("getWeightedScoreAssignmentSummary: reports finalist count when an active round has finalists", async () => {
      setMockFromImplementation((table) => {
        if (table === "submissions") {
          return createChainableMock({
            data: [
              { id: "s1", team_id: "t1" },
              { id: "s2", team_id: "t2" },
              { id: "s3", team_id: "t3" },
              { id: "s4", team_id: "t4" },
            ],
            error: null,
          })
        }
        if (table === "rooms") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "room_teams") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "judge_assignments") {
          return createChainableMock({
            data: [
              { judge_participant_id: "j1", submission_id: "s1" },
              { judge_participant_id: "j1", submission_id: "s2" },
              { judge_participant_id: "j1", submission_id: "s3" },
            ],
            error: null,
          })
        }
        if (table === "judging_rounds") {
          return createChainableMock({ data: { id: "round-finals" }, error: null })
        }
        if (table === "round_submissions") {
          return createChainableMock({
            data: [{ submission_id: "s2" }, { submission_id: "s4" }],
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const summary = await getWeightedScoreAssignmentSummary("h1")

      expect(summary.totalSubmissionCount).toBe(2)
      expect(summary.countsByJudge.j1).toEqual({ all: 1, byRoom: {} })
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

    it("allows weighted_score with zero bonus criteria when core sums to 100", async () => {
      const chains: Record<string, ReturnType<typeof createChainableMock>[]> = {}

      setMockFromImplementation((table: string) => {
        let chain: ReturnType<typeof createChainableMock>
        if (table === "judging_criteria") {
          chain = createChainableMock({
            data: [{ weight: 100 }],
            error: null,
            count: 1,
          })
        } else if (table === "prizes") {
          chain = createChainableMock({
            data: { id: "prize_ws", name: "Sponsor Pick", judging_style: "weighted_score" },
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
        name: "Sponsor Pick",
        judgingStyle: "weighted_score",
        criteria: [],
      })

      expect(result.success).toBe(true)
      const criteriaInserts = (chains["judging_criteria"] ?? []).flatMap(
        (c) => c.insert.mock.calls as unknown as [Record<string, unknown>[]][]
      )
      expect(criteriaInserts.length).toBe(0)
    })

    it("allows weighted_score with zero bonus criteria even when core does not sum to 100", async () => {
      const chains: Record<string, ReturnType<typeof createChainableMock>[]> = {}

      setMockFromImplementation((table: string) => {
        let chain: ReturnType<typeof createChainableMock>
        if (table === "judging_criteria") {
          chain = createChainableMock({ data: [{ weight: 50 }], error: null, count: 1 })
        } else if (table === "prizes") {
          chain = createChainableMock({
            data: { id: "prize_partial", name: "Sponsor Pick", judging_style: "weighted_score" },
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
        name: "Sponsor Pick",
        judgingStyle: "weighted_score",
        criteria: [],
      })

      expect(result.success).toBe(true)
    })

    it("rejects weighted_score with zero bonus criteria when no core categories exist", async () => {
      let prizeInsertCount = 0
      setMockFromImplementation((table: string) => {
        if (table === "judging_criteria") {
          return createChainableMock({ data: [], error: null, count: 0 })
        }
        if (table === "prizes") {
          prizeInsertCount++
          return createChainableMock({ data: null, error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await createPrize("h1", {
        name: "Orphan Prize",
        judgingStyle: "weighted_score",
        criteria: [],
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.code).toBe("validation")
        expect(result.error).toContain("category")
      }
      expect(prizeInsertCount).toBe(0)
    })
  })

  describe("seedDefaultCoreCriteria", () => {
    it("inserts four default categories totalling 100% when none exist", async () => {
      const chains: Record<string, ReturnType<typeof createChainableMock>[]> = {}
      let listCallCount = 0

      setMockFromImplementation((table: string) => {
        let chain: ReturnType<typeof createChainableMock>
        if (table === "judging_criteria") {
          listCallCount++
          if (listCallCount === 1) {
            chain = createChainableMock({ data: [], error: null })
          } else {
            chain = createChainableMock({
              data: DEFAULT_CORE_CRITERIA.map((c, i) => ({
                id: `seed-${i}`,
                name: c.name,
                description: c.description,
                weight: c.weight,
                min_score: c.minScore,
                max_score: c.maxScore,
                display_order: i,
              })),
              error: null,
            })
          }
        } else if (table === "prizes") {
          chain = createChainableMock({ data: [], error: null })
        } else {
          chain = createChainableMock({ data: null, error: null })
        }
        if (!chains[table]) chains[table] = []
        chains[table].push(chain)
        return chain
      })

      const result = await seedDefaultCoreCriteria("h1")
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.criteria.length).toBe(4)
        const total = result.criteria.reduce((acc, c) => acc + c.weight, 0)
        expect(total).toBe(100)
      }
    })

    it("refuses to seed when core criteria already exist", async () => {
      setMockFromImplementation((table: string) => {
        if (table === "judging_criteria") {
          return createChainableMock({
            data: [{ id: "existing", name: "Existing", weight: 50, min_score: 0, max_score: 10, display_order: 0 }],
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await seedDefaultCoreCriteria("h1")
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toContain("already exist")
      }
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

  describe("replacePrizeCriteria", () => {
    it("deletes existing rows and inserts the new ones with prize_id", async () => {
      const chains: ReturnType<typeof createChainableMock>[] = []
      setMockFromImplementation((table: string) => {
        const chain = createChainableMock({
          data: [
            { id: "c1", name: "Uses MCP", description: null, display_order: 0 },
            { id: "c2", name: "Working demo", description: "Runs end-to-end", display_order: 1 },
          ],
          error: null,
        })
        if (table === "judging_criteria") chains.push(chain)
        return chain
      })

      const result = await replacePrizeCriteria("h1", "prize_new", [
        { name: "Uses MCP" },
        { name: "Working demo", description: "Runs end-to-end" },
        { name: "   " },
      ])

      expect(result).not.toBeNull()
      expect(result?.length).toBe(2)
      expect(result?.[0]).toMatchObject({ id: "c1", name: "Uses MCP", displayOrder: 0 })

      const insertCalls = chains.flatMap(
        (c) => c.insert.mock.calls as unknown as [Record<string, unknown>[]][]
      )
      const insertArgs = insertCalls.find(([rows]) => Array.isArray(rows))?.[0]
      expect(insertArgs).toBeDefined()
      expect(insertArgs?.length).toBe(2)
      expect(insertArgs?.[0]).toMatchObject({
        hackathon_id: "h1",
        prize_id: "prize_new",
        name: "Uses MCP",
        display_order: 0,
      })
    })

    it("returns an empty array (no insert) when every name is blank", async () => {
      const chains: ReturnType<typeof createChainableMock>[] = []
      setMockFromImplementation((table: string) => {
        const chain = createChainableMock({ data: null, error: null })
        if (table === "judging_criteria") chains.push(chain)
        return chain
      })

      const result = await replacePrizeCriteria("h1", "prize_new", [
        { name: "" },
        { name: "   " },
      ])

      expect(result).toEqual([])
      const insertCalled = chains.some((c) => c.insert.mock.calls.length > 0)
      expect(insertCalled).toBe(false)
    })
  })

  describe("createRoundsPreset", () => {
    function mockPresetChain() {
      let roundInsertCount = 0
      let prizeInsertCount = 0
      setMockFromImplementation((table: string) => {
        if (table === "judging_rounds") {
          roundInsertCount++
          return createChainableMock({
            data: { id: `round-${roundInsertCount}`, display_order: roundInsertCount - 1 },
            error: null,
          })
        }
        if (table === "prizes") {
          prizeInsertCount++
          return createChainableMock({
            data: { id: `prize-${prizeInsertCount}` },
            error: null,
          })
        }
        if (table === "bucket_definitions") {
          return createChainableMock({
            data: [
              { id: "bd1", level: 1, label: "A" },
              { id: "bd2", level: 2, label: "B" },
            ],
            error: null,
          })
        }
        return createChainableMock({ data: [], error: null })
      })
    }

    it("creates one round for preset 'single'", async () => {
      mockPresetChain()
      const result = await createRoundsPreset("h1", { preset: "single" })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.roundIds.length).toBe(1)
        expect(result.screeningPrizeId).toBeNull()
      }
    })

    it("creates two rounds + screening prize for preset 'shortlist'", async () => {
      mockPresetChain()
      const result = await createRoundsPreset("h1", {
        preset: "shortlist",
        advanceTopN: 5,
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.roundIds.length).toBe(2)
        expect(result.screeningPrizeId).not.toBeNull()
      }
    })

    it("rejects 'shortlist' without advanceTopN", async () => {
      mockPresetChain()
      const result = await createRoundsPreset("h1", { preset: "shortlist" })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toMatch(/advanceTopN/)
      }
    })

    it("creates two rounds + screening prize for preset 'threshold'", async () => {
      mockPresetChain()
      const result = await createRoundsPreset("h1", {
        preset: "threshold",
        threshold: 3.5,
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.roundIds.length).toBe(2)
        expect(result.screeningPrizeId).not.toBeNull()
      }
    })

    it("rejects 'threshold' without a numeric threshold", async () => {
      mockPresetChain()
      const result = await createRoundsPreset("h1", { preset: "threshold" })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toMatch(/threshold/)
      }
    })

    it("skips screening prize when seedScreeningPrize is false", async () => {
      mockPresetChain()
      const result = await createRoundsPreset("h1", {
        preset: "shortlist",
        advanceTopN: 3,
        seedScreeningPrize: false,
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.screeningPrizeId).toBeNull()
      }
    })

    it("creates one manual round + judges_pick prize for preset 'finalists_pick'", async () => {
      let roundInsertPayload: Record<string, unknown> | null = null
      let prizeInsertPayload: Record<string, unknown> | null = null
      setMockFromImplementation((table: string) => {
        if (table === "judging_rounds") {
          const chain = createChainableMock({
            data: { id: "round-1", display_order: 0 },
            error: null,
          })
          chain.insert = mock((payload: unknown) => {
            roundInsertPayload = Array.isArray(payload)
              ? (payload[0] as Record<string, unknown>)
              : (payload as Record<string, unknown>)
            return chain
          }) as typeof chain.insert
          return chain
        }
        if (table === "prizes") {
          const chain = createChainableMock({
            data: { id: "prize-1" },
            error: null,
          })
          chain.insert = mock((payload: unknown) => {
            prizeInsertPayload = Array.isArray(payload)
              ? (payload[0] as Record<string, unknown>)
              : (payload as Record<string, unknown>)
            return chain
          }) as typeof chain.insert
          return chain
        }
        return createChainableMock({ data: [], error: null })
      })

      const result = await createRoundsPreset("h1", {
        preset: "finalists_pick",
        prizeName: "Best Overall",
        maxPicks: 2,
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.roundIds.length).toBe(1)
        expect(result.screeningPrizeId).toBeNull()
        expect(result.prizeId).toBe("prize-1")
      }
      expect(roundInsertPayload).not.toBeNull()
      expect(roundInsertPayload!.advancement).toBe("manual")
      expect(roundInsertPayload!.name).toBe("Finals")
      expect(prizeInsertPayload).not.toBeNull()
      expect(prizeInsertPayload!.judging_style).toBe("judges_pick")
      expect(prizeInsertPayload!.round_id).toBe("round-1")
      expect(prizeInsertPayload!.max_picks).toBe(2)
      expect(prizeInsertPayload!.name).toBe("Best Overall")
    })

    it("defaults 'finalists_pick' prize name and max picks", async () => {
      let prizeInsertPayload: Record<string, unknown> | null = null
      setMockFromImplementation((table: string) => {
        if (table === "judging_rounds") {
          return createChainableMock({ data: { id: "round-1", display_order: 0 }, error: null })
        }
        if (table === "prizes") {
          const chain = createChainableMock({
            data: { id: "prize-1" },
            error: null,
          })
          chain.insert = mock((payload: unknown) => {
            prizeInsertPayload = Array.isArray(payload)
              ? (payload[0] as Record<string, unknown>)
              : (payload as Record<string, unknown>)
            return chain
          }) as typeof chain.insert
          return chain
        }
        return createChainableMock({ data: [], error: null })
      })

      const result = await createRoundsPreset("h1", { preset: "finalists_pick" })

      expect(result.success).toBe(true)
      expect(prizeInsertPayload).not.toBeNull()
      expect(prizeInsertPayload!.name).toBe("Grand Prize")
      expect(prizeInsertPayload!.max_picks).toBe(1)
    })
  })

  describe("getJudgeAssignments — selfJudging flag", () => {
    it("flags assignments as self-judging when judge and submission share a team", async () => {
      let foundParticipant = false
      setMockFromImplementation((table) => {
        if (table === "hackathon_participants" && !foundParticipant) {
          foundParticipant = true
          return createChainableMock({
            data: { id: "j1", team_id: "team-shared" },
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
                prize_id: null,
                submission: {
                  title: "Project",
                  description: null,
                  github_url: null,
                  live_app_url: null,
                  screenshot_url: null,
                  team_id: "team-shared",
                },
              },
            ],
            error: null,
          })
        }
        if (table === "teams") {
          return createChainableMock({ data: [{ id: "team-shared", name: "Same" }], error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await getJudgeAssignments("h1", "user_123")
      expect(result).toHaveLength(1)
      expect(result[0].selfJudging).toBe(true)
    })

    it("does not flag self-judging when teams differ", async () => {
      let foundParticipant = false
      setMockFromImplementation((table) => {
        if (table === "hackathon_participants" && !foundParticipant) {
          foundParticipant = true
          return createChainableMock({ data: { id: "j1", team_id: "team-a" }, error: null })
        }
        if (table === "judge_assignments") {
          return createChainableMock({
            data: [
              {
                id: "a1",
                submission_id: "s1",
                is_complete: false,
                notes: "",
                prize_id: null,
                submission: {
                  title: "P",
                  description: null,
                  github_url: null,
                  live_app_url: null,
                  screenshot_url: null,
                  team_id: "team-b",
                },
              },
            ],
            error: null,
          })
        }
        if (table === "teams") {
          return createChainableMock({ data: [{ id: "team-b", name: "B" }], error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await getJudgeAssignments("h1", "user_123")
      expect(result[0].selfJudging).toBe(false)
    })
  })

  describe("assertAssignmentWritable", () => {
    it("rejects when hackathon is not in judging or active phase", async () => {
      const result = await assertAssignmentWritable("a1", "user_123", { id: "h1", status: "results-ready" })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.code).toBe("not_judging")
    })

    it("returns not_found when assignment does not exist", async () => {
      setMockFromImplementation(() => createChainableMock({ data: null, error: null }))
      const result = await assertAssignmentWritable("a1", "user_123", { id: "h1", status: "judging" })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.code).toBe("not_found")
    })

    it("returns not_found when assignment belongs to different hackathon", async () => {
      setMockFromImplementation(() => createChainableMock({
        data: {
          submission_id: "s1",
          round_id: null,
          hackathon_id: "other-hackathon",
          judge: { clerk_user_id: "user_123", team_id: null },
          submission: { team_id: null },
        },
        error: null,
      }))
      const result = await assertAssignmentWritable("a1", "user_123", { id: "h1", status: "judging" })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.code).toBe("not_found")
    })

    it("returns not_found when user is not the owner", async () => {
      setMockFromImplementation(() => createChainableMock({
        data: {
          submission_id: "s1",
          round_id: null,
          hackathon_id: "h1",
          judge: { clerk_user_id: "different_user", team_id: null },
          submission: { team_id: null },
        },
        error: null,
      }))
      const result = await assertAssignmentWritable("a1", "user_123", { id: "h1", status: "judging" })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.code).toBe("not_found")
    })

    it("returns self_judging when judge and submission share a team", async () => {
      setMockFromImplementation(() => createChainableMock({
        data: {
          submission_id: "s1",
          round_id: null,
          hackathon_id: "h1",
          judge: { clerk_user_id: "user_123", team_id: "team-a" },
          submission: { team_id: "team-a" },
        },
        error: null,
      }))
      const result = await assertAssignmentWritable("a1", "user_123", { id: "h1", status: "judging" })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code).toBe("self_judging")
        expect(result.status).toBe(409)
      }
    })

    it("rejects when round status is complete or advanced", async () => {
      setMockFromImplementation((table) => {
        if (table === "judging_rounds") {
          return createChainableMock({ data: { status: "complete" }, error: null })
        }
        return createChainableMock({
          data: {
            submission_id: "s1",
            round_id: "r1",
            hackathon_id: "h1",
            judge: { clerk_user_id: "user_123", team_id: null },
            submission: { team_id: "team-b" },
          },
          error: null,
        })
      })
      const result = await assertAssignmentWritable("a1", "user_123", { id: "h1", status: "judging" })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.code).toBe("round_not_active")
    })

    it("passes when everything is valid and returns ownership", async () => {
      setMockFromImplementation((table) => {
        if (table === "judging_rounds") {
          return createChainableMock({ data: { status: "active" }, error: null })
        }
        return createChainableMock({
          data: {
            submission_id: "s1",
            round_id: "r1",
            hackathon_id: "h1",
            prize_id: "p1",
            assignment_kind: "per_prize",
            is_complete: false,
            notes: "partial",
            judge: { clerk_user_id: "user_123", team_id: null },
            submission: { team_id: "team-b" },
          },
          error: null,
        })
      })
      const result = await assertAssignmentWritable("a1", "user_123", { id: "h1", status: "judging" })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.ownership).toEqual({
          hackathonId: "h1",
          prizeId: "p1",
          isComplete: false,
          submissionId: "s1",
          notes: "partial",
          assignmentKind: "per_prize",
        })
      }
    })
  })

  describe("calculateWeightedScoreResults", () => {
    it("ranks submissions and normalizes by actual weight sum (not hardcoded 100)", async () => {
      type ResultRow = {
        submission_id: string
        rank: number
        weighted_score: number
        prize_id: string
        judge_count: number
      }
      const insertCapture: ResultRow[] = []
      let criteriaCallCount = 0

      setMockFromImplementation((table: string) => {
        if (table === "judging_criteria") {
          criteriaCallCount++
          if (criteriaCallCount === 1) {
            return createChainableMock({
              data: [
                { id: "core-1", weight: 30, min_score: 0, max_score: 10 },
                { id: "core-2", weight: 30, min_score: 0, max_score: 10 },
              ],
              error: null,
            })
          }
          return createChainableMock({
            data: [{ id: "prize-1", weight: 30, min_score: 0, max_score: 10 }],
            error: null,
          })
        }
        if (table === "scores") {
          const ja = (sid: string, jid: string) => ({
            submission_id: sid,
            judge_participant_id: jid,
          })
          return createChainableMock({
            data: [
              { criteria_id: "core-1", score: 10, judge_assignments: ja("s1", "j1") },
              { criteria_id: "core-2", score: 10, judge_assignments: ja("s1", "j1") },
              { criteria_id: "prize-1", score: 10, judge_assignments: ja("s1", "j1") },
              { criteria_id: "core-1", score: 8, judge_assignments: ja("s1", "j2") },
              { criteria_id: "core-2", score: 8, judge_assignments: ja("s1", "j2") },
              { criteria_id: "prize-1", score: 8, judge_assignments: ja("s1", "j2") },
              { criteria_id: "core-1", score: 5, judge_assignments: ja("s2", "j1") },
              { criteria_id: "core-2", score: 5, judge_assignments: ja("s2", "j1") },
              { criteria_id: "prize-1", score: 5, judge_assignments: ja("s2", "j1") },
            ],
            error: null,
          })
        }
        if (table === "hackathon_results") {
          const m = createChainableMock({ data: null, error: null })
          m.insert = mock((rows: ResultRow[]) => {
            insertCapture.push(...rows)
            return Promise.resolve({ data: null, error: null })
          }) as typeof m.insert
          return m
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await calculateWeightedScoreResults("h1", "p1")

      expect(result.success).toBe(true)
      expect(result.count).toBe(2)
      // Total weight sum = 90 (30+30+30). With min=0/max=10 normalization,
      // s1 averages judges j1 (1.0) and j2 (0.8) → weighted_score = 0.9.
      // s2 has only j1 (0.5) → 0.5. Without the actual-weight-sum fix this
      // would divide by 100, producing 0.81 / 0.45.
      const s1 = insertCapture.find((r) => r.submission_id === "s1")
      const s2 = insertCapture.find((r) => r.submission_id === "s2")
      expect(s1).toBeDefined()
      expect(s2).toBeDefined()
      expect(s1!.weighted_score).toBeCloseTo(0.9, 5)
      expect(s2!.weighted_score).toBeCloseTo(0.5, 5)
      expect(s1!.rank).toBe(1)
      expect(s2!.rank).toBe(2)
      expect(s1!.judge_count).toBe(2)
    })

    it("returns zero count when no scored assignments exist", async () => {
      setMockFromImplementation((table: string) => {
        if (table === "hackathon_results") {
          return createChainableMock({ data: null, error: null })
        }
        if (table === "judging_criteria") {
          return createChainableMock({ data: [{ id: "c1", weight: 100, min_score: 0, max_score: 10 }], error: null })
        }
        if (table === "scores") {
          return createChainableMock({ data: [], error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await calculateWeightedScoreResults("h1", "p1")
      expect(result.success).toBe(true)
      expect(result.count).toBe(0)
    })

    it("skips when no criteria are defined", async () => {
      setMockFromImplementation((table: string) => {
        if (table === "hackathon_results") {
          return createChainableMock({ data: null, error: null })
        }
        if (table === "judging_criteria") {
          return createChainableMock({ data: [], error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await calculateWeightedScoreResults("h1", "p1")
      expect(result.success).toBe(true)
      expect(result.count).toBe(0)
    })
  })

  describe("calculateCoreOnlyResults", () => {
    it("ranks by core-only weighted average", async () => {
      const inserted: Array<{
        submission_id: string
        rank: number
        weighted_score: number
        result_kind: string
      }> = []

      setMockFromImplementation((table: string) => {
        if (table === "hackathon_results") {
          const m = createChainableMock({ data: null, error: null })
          m.insert = mock((rows: typeof inserted) => {
            inserted.push(...rows)
            return Promise.resolve({ data: null, error: null })
          }) as typeof m.insert
          return m
        }
        if (table === "judging_criteria") {
          return createChainableMock({
            data: [
              { id: "core-1", weight: 60, min_score: 0, max_score: 10 },
              { id: "core-2", weight: 40, min_score: 0, max_score: 10 },
            ],
            error: null,
          })
        }
        if (table === "scores") {
          const ja = (sid: string, jid: string) => ({
            submission_id: sid,
            judge_participant_id: jid,
          })
          return createChainableMock({
            data: [
              { criteria_id: "core-1", score: 10, judge_assignments: ja("s1", "j1") },
              { criteria_id: "core-2", score: 5, judge_assignments: ja("s1", "j1") },
              { criteria_id: "core-1", score: 4, judge_assignments: ja("s2", "j1") },
              { criteria_id: "core-2", score: 8, judge_assignments: ja("s2", "j1") },
            ],
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await calculateCoreOnlyResults("h1")
      expect(result.success).toBe(true)
      expect(result.count).toBe(2)
      const s1 = inserted.find((r) => r.submission_id === "s1")
      const s2 = inserted.find((r) => r.submission_id === "s2")
      // s1: (1.0 * 60 + 0.5 * 40) / 100 = 0.8
      // s2: (0.4 * 60 + 0.8 * 40) / 100 = 0.56
      expect(s1!.weighted_score).toBeCloseTo(0.8, 5)
      expect(s2!.weighted_score).toBeCloseTo(0.56, 5)
      expect(s1!.rank).toBe(1)
      expect(s2!.rank).toBe(2)
      for (const row of inserted) expect(row.result_kind).toBe("core_only")
    })

    it("returns zero count when no core criteria exist", async () => {
      setMockFromImplementation((table: string) => {
        if (table === "hackathon_results") {
          return createChainableMock({ data: null, error: null })
        }
        if (table === "judging_criteria") {
          return createChainableMock({ data: [], error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await calculateCoreOnlyResults("h1")
      expect(result.success).toBe(true)
      expect(result.count).toBe(0)
    })
  })

  describe("getJudgeSummary", () => {
    it("returns locked while assignments are incomplete", async () => {
      setMockFromImplementation((table: string) => {
        if (table === "judge_assignments") {
          return createChainableMock({
            data: [
              { id: "a1", submission_id: "s1", is_complete: true },
              { id: "a2", submission_id: "s2", is_complete: false },
            ],
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const summary = await getJudgeSummary("h1", "j1")
      expect(summary.unlocked).toBe(false)
      if (!summary.unlocked) {
        expect(summary.total).toBe(2)
        expect(summary.completed).toBe(1)
      }
    })

    it("returns top-3 rankings per prize plus core-only when all assignments complete", async () => {
      let coreCriteriaCallCount = 0
      let prizeCriteriaCallCount = 0

      setMockFromImplementation((table: string) => {
        if (table === "judge_assignments") {
          return createChainableMock({
            data: [
              { id: "a1", submission_id: "s1", is_complete: true },
              { id: "a2", submission_id: "s2", is_complete: true },
              { id: "a3", submission_id: "s3", is_complete: true },
            ],
            error: null,
          })
        }
        if (table === "submissions") {
          return createChainableMock({
            data: [
              { id: "s1", title: "Project Alpha", team_id: "t1" },
              { id: "s2", title: "Project Bravo", team_id: "t2" },
              { id: "s3", title: "Project Charlie", team_id: null },
            ],
            error: null,
          })
        }
        if (table === "prizes") {
          return createChainableMock({
            data: [{ id: "p1", name: "Best Overall" }],
            error: null,
          })
        }
        if (table === "judging_criteria") {
          if (prizeCriteriaCallCount === 0 && coreCriteriaCallCount === 0) {
            coreCriteriaCallCount++
            return createChainableMock({
              data: [{ id: "core-1", weight: 50, min_score: 0, max_score: 10 }],
              error: null,
            })
          }
          prizeCriteriaCallCount++
          return createChainableMock({
            data: [{ id: "prize-1", weight: 50, min_score: 0, max_score: 10, prize_id: "p1" }],
            error: null,
          })
        }
        if (table === "scores") {
          return createChainableMock({
            data: [
              { judge_assignment_id: "a1", criteria_id: "core-1", score: 9 },
              { judge_assignment_id: "a1", criteria_id: "prize-1", score: 9 },
              { judge_assignment_id: "a2", criteria_id: "core-1", score: 6 },
              { judge_assignment_id: "a2", criteria_id: "prize-1", score: 6 },
              { judge_assignment_id: "a3", criteria_id: "core-1", score: 3 },
              { judge_assignment_id: "a3", criteria_id: "prize-1", score: 3 },
            ],
            error: null,
          })
        }
        if (table === "teams") {
          return createChainableMock({
            data: [
              { id: "t1", name: "Team Alpha" },
              { id: "t2", name: "Team Bravo" },
            ],
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const summary = await getJudgeSummary("h1", "j1")
      expect(summary.unlocked).toBe(true)
      if (summary.unlocked) {
        expect(summary.coreRanking.top).toHaveLength(3)
        expect(summary.coreRanking.top[0].submissionId).toBe("s1")
        // s1 core score: 9 normalized to (9-0)/10 = 0.9; weighted sum 0.9*50 / 50 = 0.9
        expect(summary.coreRanking.top[0].score).toBeCloseTo(0.9, 5)
        expect(summary.coreRanking.top[2].submissionId).toBe("s3")
        expect(summary.prizeRankings).toHaveLength(1)
        expect(summary.prizeRankings[0].prizeName).toBe("Best Overall")
        expect(summary.prizeRankings[0].top[0].submissionId).toBe("s1")
      }
    })

    it("returns locked when judge has no assignments", async () => {
      setMockFromImplementation((table: string) => {
        if (table === "judge_assignments") {
          return createChainableMock({ data: [], error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const summary = await getJudgeSummary("h1", "j1")
      expect(summary.unlocked).toBe(false)
      if (!summary.unlocked) {
        expect(summary.total).toBe(0)
        expect(summary.completed).toBe(0)
      }
    })
  })

  describe("listCoreCriteria", () => {
    it("returns core criteria mapped to camelCase fields", async () => {
      setMockFromImplementation(() =>
        createChainableMock({
          data: [
            { id: "c1", name: "Innovation", description: "n", weight: 25, min_score: 0, max_score: 10, display_order: 0 },
            { id: "c2", name: "Impact", description: null, weight: 75, min_score: 1, max_score: 5, display_order: 1 },
          ],
          error: null,
        })
      )

      const list = await listCoreCriteria("h1")

      expect(list).toHaveLength(2)
      expect(list[0]).toEqual({
        id: "c1",
        name: "Innovation",
        description: "n",
        weight: 25,
        minScore: 0,
        maxScore: 10,
        displayOrder: 0,
      })
      expect(list[1].minScore).toBe(1)
      expect(list[1].maxScore).toBe(5)
    })

    it("returns an empty array on error", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: null, error: { message: "fail" } })
      )
      const list = await listCoreCriteria("h1")
      expect(list).toEqual([])
    })
  })

  describe("listPrizeCriteria", () => {
    it("returns prize criteria mapped to camelCase fields", async () => {
      setMockFromImplementation(() =>
        createChainableMock({
          data: [
            { id: "pc1", name: "Demo", description: null, weight: 50, min_score: 0, max_score: 10, display_order: 0 },
          ],
          error: null,
        })
      )

      const list = await listPrizeCriteria("p1")
      expect(list).toHaveLength(1)
      expect(list[0].id).toBe("pc1")
      expect(list[0].weight).toBe(50)
    })

    it("returns empty on error", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: null, error: { message: "fail" } })
      )
      const list = await listPrizeCriteria("p1")
      expect(list).toEqual([])
    })
  })

  describe("listPrizeCriteriaByPrizeIds", () => {
    it("returns an empty map when no prizeIds are passed", async () => {
      const map = await listPrizeCriteriaByPrizeIds([])
      expect(map.size).toBe(0)
    })

    it("groups criteria by prize_id", async () => {
      setMockFromImplementation(() =>
        createChainableMock({
          data: [
            { id: "c1", name: "A", description: null, weight: 30, min_score: 0, max_score: 10, display_order: 0, prize_id: "p1" },
            { id: "c2", name: "B", description: null, weight: 20, min_score: 0, max_score: 10, display_order: 1, prize_id: "p1" },
            { id: "c3", name: "C", description: null, weight: 40, min_score: 0, max_score: 10, display_order: 0, prize_id: "p2" },
          ],
          error: null,
        })
      )

      const map = await listPrizeCriteriaByPrizeIds(["p1", "p2"])
      expect(map.get("p1")).toHaveLength(2)
      expect(map.get("p2")).toHaveLength(1)
      expect(map.get("p1")![0].id).toBe("c1")
    })

    it("returns an empty map on error", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: null, error: { message: "fail" } })
      )
      const map = await listPrizeCriteriaByPrizeIds(["p1"])
      expect(map.size).toBe(0)
    })
  })

  describe("createCoreCriterion", () => {
    it("rejects when minScore is not less than maxScore", async () => {
      setMockFromImplementation(() => createChainableMock({ data: [], error: null }))
      const result = await createCoreCriterion("h1", { name: "X", weight: 10, minScore: 5, maxScore: 5 })
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error).toMatch(/Minimum score must be less than/)
    })

    it("inserts and returns the new criterion with display_order = existing.length", async () => {
      let listCallCount = 0
      let insertedRow: Record<string, unknown> | null = null
      setMockFromImplementation((table: string) => {
        if (table === "judging_criteria") {
          listCallCount++
          if (listCallCount === 1) {
            return createChainableMock({
              data: [
                { id: "c1", name: "A", description: null, weight: 25, min_score: 0, max_score: 10, display_order: 0 },
                { id: "c2", name: "B", description: null, weight: 25, min_score: 0, max_score: 10, display_order: 1 },
              ],
              error: null,
            })
          }
          const m = createChainableMock({
            data: { id: "c3", name: "Impact", description: "d", weight: 50, min_score: 0, max_score: 10, display_order: 2 },
            error: null,
          })
          const originalInsert = m.insert
          m.insert = mock((row: Record<string, unknown>) => {
            insertedRow = row
            return originalInsert(row)
          }) as typeof m.insert
          return m
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await createCoreCriterion("h1", {
        name: "Impact",
        description: "d",
        weight: 50,
      })

      expect(result.success).toBe(true)
      expect(insertedRow).not.toBeNull()
      expect(insertedRow!.display_order).toBe(2)
      expect(insertedRow!.prize_id).toBeNull()
      if (result.success) {
        expect(result.criterion.id).toBe("c3")
      }
    })

    it("returns failure when insert errors", async () => {
      let listCallCount = 0
      setMockFromImplementation(() => {
        listCallCount++
        if (listCallCount === 1) return createChainableMock({ data: [], error: null })
        return createChainableMock({ data: null, error: { message: "boom" } })
      })
      const result = await createCoreCriterion("h1", { name: "X", weight: 10 })
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error).toBe("boom")
    })
  })

  describe("updateCoreCriterion", () => {
    it("rejects when both minScore and maxScore are provided and not strictly ordered", async () => {
      const result = await updateCoreCriterion("h1", "c1", { minScore: 10, maxScore: 5 })
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error).toMatch(/Minimum score must be less than/)
    })

    it("updates and returns the criterion", async () => {
      let updateRow: Record<string, unknown> | null = null
      setMockFromImplementation((table: string) => {
        if (table === "judging_criteria") {
          const m = createChainableMock({
            data: { id: "c1", name: "Renamed", description: null, weight: 20, min_score: 0, max_score: 10, display_order: 0 },
            error: null,
          })
          const originalUpdate = m.update
          m.update = mock((row: Record<string, unknown>) => {
            updateRow = row
            return originalUpdate(row)
          }) as typeof m.update
          return m
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await updateCoreCriterion("h1", "c1", { name: "Renamed", weight: 20 })

      expect(result.success).toBe(true)
      expect(updateRow!.name).toBe("Renamed")
      expect(updateRow!.weight).toBe(20)
      expect(updateRow!.updated_at).toBeDefined()
    })

    it("returns failure when update errors", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: null, error: { message: "nope" } })
      )
      const result = await updateCoreCriterion("h1", "c1", { name: "X" })
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error).toBe("nope")
    })
  })

  describe("deleteCoreCriterion", () => {
    it("returns success when delete succeeds", async () => {
      setMockFromImplementation(() => createChainableMock({ data: null, error: null }))
      const result = await deleteCoreCriterion("h1", "c1")
      expect(result.success).toBe(true)
    })

    it("returns failure with the underlying error message", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: null, error: { message: "fk_constraint" } })
      )
      const result = await deleteCoreCriterion("h1", "c1")
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error).toBe("fk_constraint")
    })
  })

  describe("getWeightedScoreAssignmentCounts", () => {
    it("aggregates counts per judge_participant_id", async () => {
      setMockFromImplementation(() =>
        createChainableMock({
          data: [
            { judge_participant_id: "j1" },
            { judge_participant_id: "j1" },
            { judge_participant_id: "j2" },
            { judge_participant_id: "j1" },
          ],
          error: null,
        })
      )

      const counts = await getWeightedScoreAssignmentCounts("h1")
      expect(counts).toEqual({ j1: 3, j2: 1 })
    })

    it("returns an empty object when there are no rows", async () => {
      setMockFromImplementation(() => createChainableMock({ data: [], error: null }))
      const counts = await getWeightedScoreAssignmentCounts("h1")
      expect(counts).toEqual({})
    })

    it("returns an empty object when the query returns null data", async () => {
      setMockFromImplementation(() => createChainableMock({ data: null, error: null }))
      const counts = await getWeightedScoreAssignmentCounts("h1")
      expect(counts).toEqual({})
    })
  })

  describe("listAdvanceCandidates", () => {
    const HACK = "11111111-1111-1111-1111-111111111111"
    const FROM_ROUND = "22222222-2222-2222-2222-222222222222"
    const TO_ROUND = "33333333-3333-3333-3333-333333333333"

    function buildHandlers(opts: {
      roundSubs?: Array<{ submission_id: string }>
      submissions?: Array<{ id: string; title: string; team_id: string | null; teams: { name: string } | null }>
      toRoundSubs?: Array<{ submission_id: string }>
      prizes?: Array<{ id: string; name: string; is_screening: boolean; round_id: string | null }>
      results?: Array<{ submission_id: string; prize_id: string; weighted_score: number; judge_count: number }>
    }) {
      let roundSubsCallCount = 0
      setMockFromImplementation((table) => {
        if (table === "round_submissions") {
          roundSubsCallCount++
          if (roundSubsCallCount === 1) {
            return createChainableMock({ data: opts.roundSubs ?? [], error: null })
          }
          return createChainableMock({ data: opts.toRoundSubs ?? [], error: null })
        }
        if (table === "submissions") {
          return createChainableMock({ data: opts.submissions ?? [], error: null })
        }
        if (table === "prizes") {
          return createChainableMock({ data: opts.prizes ?? [], error: null })
        }
        if (table === "hackathon_results") {
          return createChainableMock({ data: opts.results ?? [], error: null })
        }
        return createChainableMock({ data: null, error: null })
      })
    }

    it("returns submissions sorted by score desc with already-advanced flag", async () => {
      buildHandlers({
        roundSubs: [{ submission_id: "s1" }, { submission_id: "s2" }, { submission_id: "s3" }],
        submissions: [
          { id: "s1", title: "Alpha", team_id: "t1", teams: { name: "Alphas" } },
          { id: "s2", title: "Beta", team_id: "t2", teams: { name: "Betas" } },
          { id: "s3", title: "Gamma", team_id: "t3", teams: { name: "Gammas" } },
        ],
        toRoundSubs: [{ submission_id: "s2" }],
        prizes: [{ id: "p1", name: "Screening", is_screening: true, round_id: FROM_ROUND }],
        results: [
          { submission_id: "s1", prize_id: "p1", weighted_score: 8.5, judge_count: 3 },
          { submission_id: "s2", prize_id: "p1", weighted_score: 9.2, judge_count: 3 },
        ],
      })

      const candidates = await listAdvanceCandidates(HACK, FROM_ROUND, TO_ROUND)

      expect(candidates).toHaveLength(3)
      expect(candidates[0].submissionId).toBe("s2")
      expect(candidates[0].score).toBe(9.2)
      expect(candidates[0].alreadyAdvanced).toBe(true)
      expect(candidates[1].submissionId).toBe("s1")
      expect(candidates[1].alreadyAdvanced).toBe(false)
      expect(candidates[2].submissionId).toBe("s3")
      expect(candidates[2].score).toBeNull()
      expect(candidates[2].teamName).toBe("Gammas")
    })

    it("returns empty when round has no submissions", async () => {
      buildHandlers({
        roundSubs: [],
        submissions: [],
      })
      const result = await listAdvanceCandidates(HACK, FROM_ROUND, TO_ROUND)
      expect(result).toEqual([])
    })

    it("returns candidates with no scores when no screening prize exists", async () => {
      buildHandlers({
        roundSubs: [{ submission_id: "s1" }],
        submissions: [{ id: "s1", title: "Alpha", team_id: "t1", teams: { name: "Alphas" } }],
        prizes: [],
      })
      const result = await listAdvanceCandidates(HACK, FROM_ROUND, TO_ROUND)
      expect(result).toHaveLength(1)
      expect(result[0].score).toBeNull()
      expect(result[0].judgeCount).toBe(0)
    })
  })

  describe("unadvanceSubmissions", () => {
    const TO_ROUND = "44444444-4444-4444-4444-444444444444"

    it("returns 0 removed when given an empty submissionIds list", async () => {
      const result = await unadvanceSubmissions(TO_ROUND, [])
      expect(result.removedCount).toBe(0)
    })

    it("returns count of rows actually deleted", async () => {
      setMockFromImplementation(() =>
        createChainableMock({
          data: [{ submission_id: "s1" }, { submission_id: "s2" }],
          error: null,
        })
      )
      const result = await unadvanceSubmissions(TO_ROUND, ["s1", "s2"])
      expect(result.removedCount).toBe(2)
    })

    it("returns the deleted-row count, not the input count, when some IDs weren't in the round", async () => {
      setMockFromImplementation(() =>
        createChainableMock({
          data: [{ submission_id: "s1" }],
          error: null,
        })
      )
      const result = await unadvanceSubmissions(TO_ROUND, ["s1", "s-missing"])
      expect(result.removedCount).toBe(1)
    })

    it("throws when the delete fails", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: null, error: { message: "boom" } })
      )
      await expect(unadvanceSubmissions(TO_ROUND, ["s1"])).rejects.toThrow(
        /Failed to unadvance submissions/
      )
    })
  })

  describe("listRoundWinnerPicker", () => {
    const HACK = "11111111-1111-1111-1111-111111111111"
    const ROUND = "22222222-2222-2222-2222-222222222222"

    function buildHandlers(opts: {
      roundSubs?: Array<{ submission_id: string }>
      prizes?: Array<{ id: string; name: string }>
      submissions?: Array<{ id: string; title: string; team_id: string | null; teams: { name: string } | null }>
      assignments?: Array<{ prize_id: string; submission_id: string }>
      results?: Array<{ submission_id: string; prize_id: string; weighted_score: number; judge_count: number }>
    }) {
      setMockFromImplementation((table) => {
        if (table === "round_submissions") {
          return createChainableMock({ data: opts.roundSubs ?? [], error: null })
        }
        if (table === "prizes") {
          return createChainableMock({ data: opts.prizes ?? [], error: null })
        }
        if (table === "submissions") {
          return createChainableMock({ data: opts.submissions ?? [], error: null })
        }
        if (table === "prize_assignments") {
          return createChainableMock({ data: opts.assignments ?? [], error: null })
        }
        if (table === "hackathon_results") {
          return createChainableMock({ data: opts.results ?? [], error: null })
        }
        return createChainableMock({ data: null, error: null })
      })
    }

    it("returns empty prizes and projects when nothing is configured", async () => {
      buildHandlers({})
      const result = await listRoundWinnerPicker(HACK, ROUND)
      expect(result.prizes).toEqual([])
      expect(result.projects).toEqual([])
    })

    it("returns projects sorted by score with assignments and prize scores", async () => {
      buildHandlers({
        roundSubs: [{ submission_id: "s1" }, { submission_id: "s2" }],
        prizes: [
          { id: "p1", name: "Best Overall" },
          { id: "p2", name: "Most Innovative" },
        ],
        submissions: [
          { id: "s1", title: "Alpha", team_id: "t1", teams: { name: "Alphas" } },
          { id: "s2", title: "Beta", team_id: "t2", teams: { name: "Betas" } },
        ],
        assignments: [{ prize_id: "p1", submission_id: "s2" }],
        results: [
          { submission_id: "s1", prize_id: "p1", weighted_score: 0.8, judge_count: 3 },
          { submission_id: "s2", prize_id: "p1", weighted_score: 0.9, judge_count: 3 },
        ],
      })

      const result = await listRoundWinnerPicker(HACK, ROUND)
      expect(result.prizes).toHaveLength(2)
      expect(result.projects[0].submissionId).toBe("s2")
      expect(result.projects[0].prizeIds).toEqual(["p1"])
      expect(result.projects[0].score).toBe(0.9)
      expect(result.projects[1].submissionId).toBe("s1")
      expect(result.projects[1].prizeIds).toEqual([])
    })

    it("returns prizes but no projects when the round pool is empty", async () => {
      buildHandlers({
        roundSubs: [],
        prizes: [{ id: "p1", name: "Best Overall" }],
      })
      const result = await listRoundWinnerPicker(HACK, ROUND)
      expect(result.prizes).toHaveLength(1)
      expect(result.projects).toEqual([])
    })
  })

  describe("roundBelongsToHackathon", () => {
    it("returns true when the round belongs to the hackathon", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: { id: "r1" }, error: null })
      )

      const result = await roundBelongsToHackathon("h1", "r1")

      expect(result).toBe(true)
    })

    it("returns false when the round does not belong to the hackathon", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: null, error: null })
      )

      const result = await roundBelongsToHackathon("h1", "r1")

      expect(result).toBe(false)
    })
  })
})
