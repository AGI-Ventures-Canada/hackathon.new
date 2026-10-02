import { beforeEach, describe, expect, it, mock } from "bun:test"
import { createChainableMock, resetSupabaseMocks, setMockFromImplementation, setMockRpcImplementation } from "../lib/supabase-mock"
import type { DistributionSnapshot } from "@/lib/judging/distribution-planner"

const eventId = "11111111-1111-4111-8111-111111111111"
const reconcile = mock(async (_id: string) => {})
mock.module("@/lib/services/judging-notifications", () => ({ reconcileJudgingNotifications: reconcile }))
mock.module("@/lib/services/clerk-users", () => ({ resolveClerkUsers: async () => ({ displayNames: {}, emails: {}, imageUrls: {} }) }))
const { applyJudgingDistribution, deleteJudgingAssignment, unassignJudgeFromPrizeProject } = await import("@/lib/services/judging-distribution")
const { assignJudgeToSubmission, assignWeightedScoreJudge } = await import("@/lib/services/judging")
const { addJudgeToRoom, removeJudgeFromRoom } = await import("@/lib/services/rooms")
const { reconcileJudgingAfterMutation } = await import("@/lib/services/judging-notification-events")

beforeEach(() => { resetSupabaseMocks(); reconcile.mockClear(); reconcile.mockImplementation(async () => {}) })

const snapshot: DistributionSnapshot = {
  hackathonId: eventId, version: "v1", closed: false, coreCategoryCount: 1,
  judges: [{ id: "judge", name: "user", teamId: null }],
  projects: [{ id: "project", title: "Demo", teamId: null, mode: null, roomId: null }],
  prizes: [{ id: "prize", name: "Best build", style: "weighted_score", roundId: null, judgeScope: "all", judgeIds: [], projectIds: ["project"], allowedTeamModes: [], categoryCount: 0 }],
  assignments: [],
}
const input = { targetReviewsPerProject: 1, expectedVersion: "v1", requestKey: "request" }

describe("judging mutation inbox hooks", () => {
  it("awaits the durable inbox write after distribution commits, including a receipt replay", async () => {
    let committed = false
    let finish!: () => void
    let inboxStarted!: () => void
    const started = new Promise<void>((resolve) => { inboxStarted = resolve })
    let replay = false
    const receipt = { createdAssignments: 1, createdCoverage: 1, version: "v2", coverage: [], warnings: [] }
    setMockRpcImplementation((name) => {
      if (name === "get_judging_distribution_receipt") return Promise.resolve({ data: replay ? receipt : null, error: null })
      if (name === "get_judging_distribution_snapshot") return Promise.resolve({ data: snapshot, error: null })
      expect(name).toBe("apply_judging_distribution")
      committed = true
      return Promise.resolve({ data: receipt, error: null })
    })
    reconcile.mockImplementation(async () => { expect(committed).toBe(true); inboxStarted(); await new Promise<void>((resolve) => { finish = resolve }) })
    let settled = false
    const applying = applyJudgingDistribution(eventId, input).then((result) => { settled = true; return result })
    await started
    expect(reconcile).toHaveBeenCalledWith(eventId)
    expect(settled).toBe(false)
    finish()
    expect((await applying).createdAssignments).toBe(1)
    replay = true
    reconcile.mockImplementation(async () => { throw new Error("Inbox temporarily unavailable") })
    expect(await applyJudgingDistribution(eventId, input)).toEqual(receipt)
    expect(reconcile).toHaveBeenCalledTimes(2)
  })

  it("does not reconcile a distribution that failed before commit", async () => {
    setMockRpcImplementation((name) => Promise.resolve({ data: name === "get_judging_distribution_snapshot" ? snapshot : null, error: name === "apply_judging_distribution" ? { message: "Version changed" } : null }))
    await expect(applyJudgingDistribution(eventId, input)).rejects.toThrow("Version changed")
    expect(reconcile).not.toHaveBeenCalled()
  })

  it("covers legacy manual and bulk weighted assignment services after their inserts", async () => {
    let inserted = false
    setMockFromImplementation((table) => {
      const query = createChainableMock({ data: table === "hackathon_participants" ? { id: "judge", role: "judge", team_id: null }
        : table === "submissions" ? { id: "project", team_id: null } : null, error: null })
      query.insert.mockImplementation(() => { inserted = true; return query })
      return query
    })
    reconcile.mockImplementation(async () => { expect(inserted).toBe(true) })
    expect(await assignJudgeToSubmission(eventId, "judge", "project")).toEqual({ success: true, alreadyAssigned: false })
    inserted = false
    setMockFromImplementation((table) => {
      const query = createChainableMock({ data: table === "hackathon_participants" ? { id: "judge", role: "judge", team_id: null }
        : table === "submissions" ? [{ id: "project", team_id: null }] : null, error: null })
      query.insert.mockImplementation(() => { inserted = true; return query })
      return query
    })
    expect(await assignWeightedScoreJudge(eventId, "judge")).toEqual({ success: true, assignedCount: 1 })
    expect(reconcile).toHaveBeenCalledTimes(2)
  })

  it("reconciles assignment and room scope removals only when rows changed", async () => {
    let changed = true
    setMockFromImplementation((table) => createChainableMock({ data: table === "rooms" || table === "hackathon_participants" ? { id: "judge", hackathon_id: eventId, role: "judge" } : changed ? [{ id: "row" }] : [], error: null }))
    await deleteJudgingAssignment(eventId, "assignment")
    await unassignJudgeFromPrizeProject(eventId, "judge", "project", "prize")
    await addJudgeToRoom("room", eventId, "judge")
    await removeJudgeFromRoom("room", "judge", eventId)
    expect(reconcile).toHaveBeenCalledTimes(4)
    changed = false
    await deleteJudgingAssignment(eventId, "assignment")
    await removeJudgeFromRoom("room", "judge", eventId)
    expect(reconcile).toHaveBeenCalledTimes(4)
  })

  it("does not query placeholder event IDs", async () => {
    await reconcileJudgingAfterMutation("draft")
    expect(reconcile).not.toHaveBeenCalled()
  })
})
