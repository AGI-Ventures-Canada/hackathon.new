import { beforeEach, describe, expect, it } from "bun:test"
import { createChainableMock, resetSupabaseMocks, setMockFromImplementation, setMockRpcImplementation } from "../lib/supabase-mock"
import { getAssignmentScoringScope } from "@/lib/services/judging-scope"
import { assertAssignmentWritable, calculateWeightedScoreResults, getAssignmentDetail, submitScores } from "@/lib/services/judging"
import { applyJudgingDistribution, assignJudgeToPrizeProject, filterRoomJudgingAssignments, getJudgeAssignmentOptions, saveJudgeAssignmentScope } from "@/lib/services/judging-distribution"

const ownership = { hackathonId: "event", prizeId: null, submissionId: "project", assignmentKind: "unified_weighted_score" as const, scoringScope: "scoped" as const, isComplete: false, notes: null }
const scope = { prizeIds: ["allowed"], criteriaVersion: "scope-v1", scopeMode: "scoped", criteria: [{ id: "core", name: "Impact", description: null, min_score: 0, max_score: 10, weight: 100, prize_id: null, prize_name: null, category: "core" }] }

describe("scoped judging", () => {
  beforeEach(resetSupabaseMocks)

  it("uses the database scorecard version for a particular event and assignment", async () => {
    setMockRpcImplementation((name, args) => {
      expect(name).toBe("get_judging_assignment_scope")
      expect(args).toEqual({ p_assignment_id: "assignment", p_hackathon_id: "event" })
      return Promise.resolve({ data: scope, error: null })
    })
    expect(await getAssignmentScoringScope("assignment", ownership)).toEqual(scope)
  })

  it("fails closed if prize scope cannot be loaded", async () => {
    setMockRpcImplementation(() => Promise.resolve({ data: null, error: { message: "scope unavailable" } }))
    await expect(getAssignmentScoringScope("assignment", ownership)).rejects.toThrow("scope unavailable")
  })

  it("rejects bonus category scores outside a judge's assigned prizes", async () => {
    setMockRpcImplementation(() => Promise.resolve({ data: scope, error: null }))
    setMockFromImplementation(() => { throw new Error("No score write should happen") })
    const result = await submitScores("assignment", ownership, [{ criteriaId: "other-prize-bonus", score: 8 }])
    expect(result.success).toBe(false)
  })

  it("keeps legacy review details tied to their frozen prize coverage", async () => {
    setMockRpcImplementation(() => Promise.resolve({ data: { ...scope, scopeMode: "legacy_unscoped" }, error: null }))
    setMockFromImplementation((table) => {
      if (table === "submissions") return createChainableMock({ data: { title: "Original project", team_id: null }, error: null })
      if (table === "prizes" || table === "judging_criteria") throw new Error("Do not expand a historical scorecard to future prizes")
      return createChainableMock({ data: [], error: null })
    })
    const detail = await getAssignmentDetail("assignment", { ...ownership, notes: "", scoringScope: "legacy_unscoped" })
    expect(detail?.criteria.map((criterion) => criterion.id)).toEqual(["core"])
  })

  it("distinguishes upcoming judging from a closed deadline", async () => {
    setMockFromImplementation((table) => createChainableMock({ data: table === "judge_assignments" ? {
      submission_id: "project", round_id: "round", hackathon_id: "event", judge: { clerk_user_id: "user", team_id: null }, submission: { team_id: null },
    } : { status: "active", opens_at: "2999-01-01T00:00:00Z", closes_at: "2999-01-02T00:00:00Z" }, error: null }))
    const result = await assertAssignmentWritable("assignment", "user", { id: "event", status: "judging" })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain("hasn't opened yet")
  })

  it("does not credit a specialist's shared core score to an unrelated prize", async () => {
    let criteriaQueries = 0
    setMockFromImplementation((table) => {
      if (table === "judging_criteria") return createChainableMock({ data: ++criteriaQueries === 1 ? [{ id: "core", weight: 100, min_score: 0, max_score: 10 }] : [], error: null })
      if (table === "scores") return createChainableMock({ data: [
        { criteria_id: "core", score: 10, judge_assignments: { id: "wrong-prize", scoring_scope: "scoped", round_id: null, submission_id: "project", judge_participant_id: "specialist" } },
        { criteria_id: "core", score: 6, judge_assignments: { id: "allowed", scoring_scope: "scoped", round_id: null, submission_id: "project", judge_participant_id: "general" } },
        { criteria_id: "core", score: 8, judge_assignments: { id: "historical", scoring_scope: "legacy_unscoped", round_id: null, submission_id: "project", judge_participant_id: "legacy" } },
      ], error: null })
      return createChainableMock({ data: null, error: null })
    })
    let saved: { weighted_score: number; judge_count: number }[] = []
    setMockRpcImplementation((name, args) => {
      if (name === "get_eligible_weighted_assignment_ids") {
        expect(args).toEqual({ p_hackathon_id: "event", p_prize_id: "overall" })
        return Promise.resolve({ data: ["allowed", "historical"], error: null })
      }
      if (name === "replace_prize_results_atomic") saved = (args as { p_results: typeof saved }).p_results
      return Promise.resolve({ data: 1, error: null })
    })
    expect((await calculateWeightedScoreResults("event", "overall")).success).toBe(true)
    expect(saved).toHaveLength(1)
    expect(saved[0].judge_count).toBe(2)
    expect(saved[0].weighted_score).toBeCloseTo(0.7)
  })

  it("replays a completed distribution request before trying to preview changed state", async () => {
    const result = { createdAssignments: 4, createdCoverage: 4, coverage: [], warnings: [], version: "v2" }
    setMockRpcImplementation((name) => {
      expect(name).toBe("get_judging_distribution_receipt")
      return Promise.resolve({ data: result, error: null })
    })
    expect(await applyJudgingDistribution("event", { targetReviewsPerProject: 3, expectedVersion: "v1", requestKey: "request-1" })).toEqual(result)
  })

  it("blocks applying a plan that leaves a project with no eligible judge", async () => {
    const snapshot = { version: "v1", closed: false, judges: [], projects: [{ id: "project", title: "Demo", teamId: null, roomId: null }], prizes: [{ id: "prize", name: "Best build", style: "weighted_score", roundId: null, judgeScope: "all", judgeIds: [], projectIds: ["project"], allowedTeamModes: [] }], assignments: [] }
    setMockRpcImplementation((name) => {
      if (name === "get_judging_distribution_receipt") return Promise.resolve({data:null,error:null})
      expect(name).toBe("get_judging_distribution_snapshot")
      return Promise.resolve({data:snapshot,error:null})
    })
    await expect(applyJudgingDistribution("event", {targetReviewsPerProject:3,expectedVersion:"v1",requestKey:"request-1"})).rejects.toThrow("no eligible judges")
  })

  it("uses the atomic distribution contract for one advanced project", async () => {
    const snapshot = { version: "v1", closed: false, judges: [{ id: "judge", teamId: null }], projects: [{ id: "project", title: "Demo", teamId: null, mode: null, roomId: null }], prizes: [{ id: "gate", name: "Working demo", style: "gate_check", roundId: "round", judgeScope: "all", judgeIds: [], projectIds: ["project"], allowedTeamModes: [], categoryCount: 1 }], assignments: [] }
    const calls: { name: string; args: unknown }[] = []
    setMockRpcImplementation((name, args) => {
      calls.push({ name, args })
      return Promise.resolve({ data: name === "get_judging_distribution_snapshot" ? snapshot : { createdAssignments: 1 }, error: null })
    })
    expect(await assignJudgeToPrizeProject("event", "judge", "project", "gate")).toEqual({ success: true, alreadyAssigned: false })
    expect(calls[1].name).toBe("apply_judging_distribution")
    expect(calls[1].args).toMatchObject({ p_expected_version: "v1", p_assignments: [{ judgeId: "judge", projectId: "project", prizeId: "gate", roundId: "round", kind: "per_prize", prizeIds: ["gate"] }] })
  })

  it("fails closed when an advanced project is outside a specialist's scope", async () => {
    setMockRpcImplementation(() => Promise.resolve({ data: { version: "v1", closed: false, judges: [{ id: "judge", teamId: null, prizeScope: "selected", prizeIds: ["other"] }], projects: [{ id: "project", title: "Demo", teamId: null, mode: null, roomId: null }], prizes: [{ id: "gate", style: "gate_check", judgeScope: "all", judgeIds: [], projectIds: [], allowedTeamModes: [] }], assignments: [] }, error: null }))
    expect((await assignJudgeToPrizeProject("event", "judge", "project", "gate")).success).toBe(false)
  })

  it("reports pick reviews as a scope lock and preserves failed atomic saves", async () => {
    setMockFromImplementation((table) => createChainableMock({ data: table === "rooms" ? [{ id: "room", name: "Main hall" }] : null, count: table === "judge_picks" ? 1 : undefined, error: null }))
    setMockRpcImplementation((name) => Promise.resolve(name === "save_judging_judge_scope" ? { data: null, error: { message: "This judge has submitted reviews" } } : { data: { version: "v1", closed: false, judges: [{ id: "judge", prizeScope: "selected", prizeIds: ["pick"], roomIds: ["room"] }], prizes: [{ id: "pick", name: "Favorite", style: "judges_pick" }], assignments: [] }, error: null }))
    expect((await getJudgeAssignmentOptions("event", "judge")).locked).toBe(true)
    await expect(saveJudgeAssignmentScope("event", "judge", { expectedVersion: "v1", prizeScope: "all", prizeIds: [], roomIds: [] })).rejects.toThrow("submitted reviews")
  })

  it("keeps eligible room judges in the batch when another judge has different prize scope", async () => {
    const candidates = ["general", "specialist", "pending"].map((judge_participant_id) => ({ judge_participant_id, submission_id: "project", round_id: null }))
    setMockRpcImplementation(() => Promise.resolve({ data: { closed: false, judges: [
      { id: "general", teamId: null, roomIds: ["room"], prizeScope: "all" },
      { id: "specialist", teamId: null, roomIds: ["room"], prizeScope: "selected", prizeIds: ["different-prize"] },
    ], projects: [{ id: "project", teamId: "team", mode: "in_person", roomId: "room" }], prizes: [{ id: "overall", style: "weighted_score", roundId: null, judgeScope: "all", judgeIds: [], projectIds: ["project"], allowedTeamModes: ["in_person"] }] }, error: null }))
    expect(await filterRoomJudgingAssignments("event", candidates)).toEqual([candidates[0]])
  })
})
