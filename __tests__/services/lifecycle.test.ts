import { describe, expect, it, beforeEach, mock } from "bun:test"
import {
  createChainableMock,
  resetSupabaseMocks,
  setMockFromImplementation,
  setMockRpcImplementation,
  type ChainableMock,
} from "../lib/supabase-mock"

const leaseOrder: string[] = []
async function runWithEventMutationLease(
  _hackathonId: string,
  mutation: () => Promise<unknown>,
) {
  leaseOrder.push("acquired")
  try {
    return await mutation()
  } finally {
    leaseOrder.push("released")
  }
}
const mockWithEventMutationLease = mock(runWithEventMutationLease)
class MockEventMutationLeaseError extends Error {
  constructor(
    message: string,
    public readonly code: "event_busy" | "lease_unavailable",
  ) {
    super(message)
    this.name = "EventMutationLeaseError"
  }
}
mock.module("@/lib/services/event-mutation-lease", () => ({
  EventMutationLeaseError: MockEventMutationLeaseError,
  withEventMutationLease: mockWithEventMutationLease,
}))

const mockDispatch = mock(() => Promise.resolve())
mock.module("@/lib/services/notification-dispatcher", () => ({
  dispatchTransitionNotifications: mockDispatch,
}))

const mockReleaseChallenges = mock(() => Promise.resolve(true))
const mockListChallenges = mock(() => Promise.resolve([] as Array<{ title: string; description: string | null }>))
mock.module("@/lib/services/challenges", () => ({
  releaseChallenges: mockReleaseChallenges,
  listChallenges: mockListChallenges,
}))

const mockGetTriggerItem = mock(() => Promise.resolve(null))
mock.module("@/lib/services/schedule-items", () => ({
  getTriggerItem: mockGetTriggerItem,
}))

const mockDenyPendingTeamsForClosedHackathon = mock(() => Promise.resolve({ denied: 0, failed: [] }))
mock.module("@/lib/services/hackathons", () => ({
  denyPendingTeamsForClosedHackathon: mockDenyPendingTeamsForClosedHackathon,
}))

const mockReschedulePreEventReminders = mock(() => Promise.resolve(0))
mock.module("@/lib/services/pre-event-reminders", () => ({
  reschedulePreEventReminders: mockReschedulePreEventReminders,
}))

const mockGetJudgingSetupStatus = mock(() =>
  Promise.resolve({ isReady: true, issues: [] as string[] })
)
mock.module("@/lib/services/judging", () => ({
  getJudgingSetupStatus: mockGetJudgingSetupStatus,
}))
const mockReconcileJudging = mock(() => Promise.resolve())
mock.module("@/lib/services/judging-notification-events", () => ({ reconcileJudgingAfterMutation: mockReconcileJudging }))

const {
  AUTO_TRANSITION_BATCH_LIMIT,
  AUTO_TRANSITION_PAGE_WINDOW_MS,
  closePendingJudgeWorkForClosedHackathon,
  executeTransition,
  getJudgingCompletionReadiness,
  getJudgingReadiness,
  processAutoTransitions,
  reconcilePendingJudgeWorkForClosedHackathons,
  reconcilePendingTeamsForClosedHackathons,
} = await import(
  "@/lib/services/lifecycle"
)

describe("Lifecycle Service", () => {
  beforeEach(() => {
    resetSupabaseMocks()
    mockReconcileJudging.mockClear()
    leaseOrder.length = 0
    mockWithEventMutationLease.mockReset()
    mockWithEventMutationLease.mockImplementation(runWithEventMutationLease)
    mockDispatch.mockClear()
    mockReleaseChallenges.mockClear()
    mockReleaseChallenges.mockImplementation(() => Promise.resolve(true))
    mockListChallenges.mockClear()
    mockListChallenges.mockImplementation(() => Promise.resolve([]))
    mockGetTriggerItem.mockClear()
    mockGetTriggerItem.mockResolvedValue(null)
    mockDenyPendingTeamsForClosedHackathon.mockClear()
    mockDenyPendingTeamsForClosedHackathon.mockResolvedValue({ denied: 0, failed: [] })
    mockReschedulePreEventReminders.mockClear()
    mockReschedulePreEventReminders.mockResolvedValue(0)
    mockGetJudgingSetupStatus.mockClear()
    mockGetJudgingSetupStatus.mockResolvedValue({ isReady: true, issues: [] })
  })

  describe("executeTransition", () => {
    it("returns a stable event-busy code without running transition side effects", async () => {
      mockWithEventMutationLease.mockRejectedValueOnce(
        new MockEventMutationLeaseError(
          "Another event change is still being saved.",
          "event_busy",
        ),
      )

      const result = await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "draft",
        toStatus: "published",
        trigger: "manual",
        triggeredBy: "user1",
      })

      expect(result).toEqual({
        success: false,
        error: "Another event change is still being saved.",
        code: "event_busy",
      })
      expect(mockGetTriggerItem).not.toHaveBeenCalled()
      expect(mockDispatch).not.toHaveBeenCalled()
    })

    it("rejects invalid transitions", async () => {
      const result = await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "draft",
        toStatus: "active",
        trigger: "manual",
        triggeredBy: "user1",
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain("Invalid transition")
    })

    it("rejects transition from archived", async () => {
      const result = await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "archived",
        toStatus: "completed",
        trigger: "manual",
        triggeredBy: "user1",
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain("Invalid transition")
    })

    it("uses one judging gate for scoring setup, real judges, and assignments", async () => {
      mockGetJudgingSetupStatus.mockResolvedValue({
        isReady: false,
        issues: ["Add score categories for Best Demo."],
      })
      setMockFromImplementation((table) => {
        if (table === "submissions") {
          return createChainableMock({
            data: [{ id: "project-1" }, { id: "project-2" }],
            error: null,
            count: 2,
          })
        }
        if (table === "prizes") {
          return createChainableMock({
            data: [{ id: "prize-1", judging_style: "weighted_score", round_id: null }],
            error: null,
          })
        }
        if (table === "hackathon_participants") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "judge_assignments" || table === "round_submissions") {
          return createChainableMock({ data: [], error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "active",
        toStatus: "judging",
        trigger: "manual",
        triggeredBy: "user1",
      })

      expect(result).toEqual({
        success: false,
        error:
          "Get judging ready first. Add at least one judge. Add score categories for Best Demo. 2 projects still need judge assignments.",
        code: "judging_not_ready",
        issues: [
          "Add at least one judge.",
          "Add score categories for Best Demo.",
          "2 projects still need judge assignments.",
        ],
      })
    })

    it.each([true, false])("uses scheduled readiness before strict legacy scorecard checks (ready=%s)", async (isReady) => {
      mockGetJudgingSetupStatus.mockResolvedValue({ isReady: false, issues: ["Legacy total is 50."] })
      setMockFromImplementation((table) => createChainableMock({ data: table === "submissions" ? [{ id: "project" }] : [], count: 1, error: null }))
      const issues = isReady ? [] : ["Assign eligible judges to every project for Best overall."]
      setMockRpcImplementation((name) => Promise.resolve({ data: name === "judging_window_is_configured" ? true : { isReady, issues, unassignedProjectCount: isReady ? 0 : 1, requiresJudgeScoring: true }, error: null }))
      expect(await getJudgingReadiness("event")).toMatchObject({ isReady, issues, submissionCount: 1, unassignedSubmissionCount: isReady ? 0 : 1 })
      expect(mockGetJudgingSetupStatus).not.toHaveBeenCalled()
    })

    it("lets crowd-only events start judging without judges or assignments", async () => {
      setMockFromImplementation((table) => {
        if (table === "submissions") {
          return createChainableMock({
            data: [{ id: "project-1" }],
            error: null,
            count: 1,
          })
        }
        if (table === "prizes") {
          return createChainableMock({
            data: [{ id: "crowd-prize", judging_style: "crowd_vote", round_id: null }],
            error: null,
          })
        }
        return createChainableMock({ data: [], error: null })
      })

      await expect(getJudgingReadiness("h1")).resolves.toEqual({
        isReady: true,
        canCompleteWithoutJudging: false,
        requiresJudgeScoring: false,
        issues: [],
        submissionCount: 1,
        judgeCount: 0,
        unassignedSubmissionCount: 0,
      })
      expect(mockGetJudgingSetupStatus).toHaveBeenCalledWith("h1")
    })

    it("blocks judging when every prize still needs a judging style", async () => {
      mockGetJudgingSetupStatus.mockResolvedValue({
        isReady: false,
        issues: ["Pick how judges should score at least one prize."],
      })
      setMockFromImplementation((table) => {
        if (table === "submissions") {
          return createChainableMock({
            data: [{ id: "project-1" }],
            error: null,
            count: 1,
          })
        }
        if (table === "prizes") {
          return createChainableMock({
            data: [{ id: "display-prize", judging_style: null, round_id: null }],
            error: null,
          })
        }
        return createChainableMock({ data: [], error: null })
      })

      const readiness = await getJudgingReadiness("h1")

      expect(readiness.isReady).toBe(false)
      expect(readiness.requiresJudgeScoring).toBe(false)
      expect(readiness.issues).toEqual([
        "Pick how judges should score at least one prize.",
      ])
      expect(mockGetJudgingSetupStatus).toHaveBeenCalledWith("h1")
    })

    it("blocks judging when the event has no prizes", async () => {
      mockGetJudgingSetupStatus.mockResolvedValue({
        isReady: false,
        issues: ["Pick how judges should score at least one prize."],
      })
      setMockFromImplementation((table) => {
        if (table === "submissions") {
          return createChainableMock({
            data: [{ id: "project-1" }],
            error: null,
            count: 1,
          })
        }
        if (table === "prizes") {
          return createChainableMock({ data: [], error: null })
        }
        return createChainableMock({ data: [], error: null })
      })

      await expect(getJudgingReadiness("h1")).resolves.toMatchObject({
        isReady: false,
        requiresJudgeScoring: false,
        issues: ["Pick how judges should score at least one prize."],
      })
    })

    it("requires accepted-judge assignments for every judge-scored prize", async () => {
      setMockFromImplementation((table) => {
        if (table === "submissions") {
          return createChainableMock({
            data: [{ id: "project-1" }, { id: "project-2" }],
            error: null,
            count: 2,
          })
        }
        if (table === "prizes") {
          return createChainableMock({
            data: [
              { id: "gate-prize", judging_style: "gate_check", round_id: null },
              { id: "pick-prize", judging_style: "judges_pick", round_id: null },
            ],
            error: null,
          })
        }
        if (table === "hackathon_participants") {
          return createChainableMock({ data: [{ id: "accepted-judge" }], error: null })
        }
        if (table === "judge_assignments") {
          return createChainableMock({
            data: [
              {
                submission_id: "project-1",
                prize_id: "gate-prize",
                judge_participant_id: "accepted-judge",
                assignment_kind: "per_prize",
              },
              {
                submission_id: "project-2",
                prize_id: "gate-prize",
                judge_participant_id: "former-judge",
                assignment_kind: "per_prize",
              },
              {
                submission_id: "project-1",
                prize_id: "pick-prize",
                judge_participant_id: "accepted-judge",
                assignment_kind: "per_prize",
              },
            ],
            error: null,
          })
        }
        if (table === "round_submissions") {
          return createChainableMock({ data: [], error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const readiness = await getJudgingReadiness("h1")

      expect(readiness).toMatchObject({
        isReady: false,
        requiresJudgeScoring: true,
        judgeCount: 1,
        unassignedSubmissionCount: 1,
        issues: ["1 project still needs judge assignments."],
      })
    })

    it("blocks completion while a required judge task has no score", async () => {
      setMockFromImplementation((table) => {
        if (table === "submissions") {
          return createChainableMock({
            data: [{ id: "project-1" }],
            error: null,
            count: 1,
          })
        }
        if (table === "prizes") {
          return createChainableMock({
            data: [{ id: "weighted", judging_style: "weighted_score", round_id: null }],
            error: null,
          })
        }
        if (table === "hackathon_participants") {
          return createChainableMock({ data: [{ id: "judge-1" }], error: null })
        }
        if (table === "judge_assignments") {
          return createChainableMock({
            data: [{
              id: "assignment-1",
              submission_id: "project-1",
              prize_id: null,
              judge_participant_id: "judge-1",
              assignment_kind: "unified_weighted_score",
              round_id: null,
              is_complete: false,
            }],
            error: null,
          })
        }
        if (table === "round_submissions") {
          return createChainableMock({ data: [], error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      await expect(getJudgingCompletionReadiness("h1")).resolves.toEqual({
        isReady: false,
        issues: ["1 judge task still needs a score."],
        incompleteAssignmentCount: 1,
        incompletePickListCount: 0,
      })

      const result = await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "judging",
        toStatus: "completed",
        trigger: "manual",
        triggeredBy: "user1",
      })
      expect(result).toEqual({
        success: false,
        error: "Finish judging first. 1 judge task still needs a score.",
        code: "judging_not_ready",
        issues: ["1 judge task still needs a score."],
      })
    })

    it("uses submitted pick lists instead of assignment completion for judge picks", async () => {
      let pickRows: Array<{ judge_participant_id: string; prize_id: string }> = []
      setMockFromImplementation((table) => {
        if (table === "submissions") {
          return createChainableMock({
            data: [{ id: "project-1" }],
            error: null,
            count: 1,
          })
        }
        if (table === "prizes") {
          return createChainableMock({
            data: [{ id: "pick-prize", judging_style: "judges_pick", round_id: null }],
            error: null,
          })
        }
        if (table === "hackathon_participants") {
          return createChainableMock({ data: [{ id: "judge-1" }], error: null })
        }
        if (table === "judge_assignments") {
          return createChainableMock({
            data: [{
              id: "assignment-1",
              submission_id: "project-1",
              prize_id: "pick-prize",
              judge_participant_id: "judge-1",
              assignment_kind: "per_prize",
              round_id: null,
              is_complete: false,
            }],
            error: null,
          })
        }
        if (table === "judge_picks") {
          return createChainableMock({ data: pickRows, error: null })
        }
        if (table === "round_submissions") {
          return createChainableMock({ data: [], error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      await expect(getJudgingCompletionReadiness("h1")).resolves.toMatchObject({
        isReady: false,
        issues: ["1 judge still needs to send picks."],
        incompleteAssignmentCount: 0,
        incompletePickListCount: 1,
      })

      pickRows = [{ judge_participant_id: "judge-1", prize_id: "pick-prize" }]
      await expect(getJudgingCompletionReadiness("h1")).resolves.toEqual({
        isReady: true,
        issues: [],
        incompleteAssignmentCount: 0,
        incompletePickListCount: 0,
      })
    })

    it("lets a crowd-vote event finish without judge tasks", async () => {
      setMockFromImplementation((table) => {
        if (table === "submissions") {
          return createChainableMock({
            data: [{ id: "project-1" }],
            error: null,
            count: 1,
          })
        }
        if (table === "prizes") {
          return createChainableMock({
            data: [{ id: "crowd", judging_style: "crowd_vote", round_id: null }],
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      await expect(getJudgingCompletionReadiness("h1")).resolves.toEqual({
        isReady: true,
        issues: [],
        incompleteAssignmentCount: 0,
        incompletePickListCount: 0,
      })
    })

    it("does not auto-complete when a project appears during the close check", async () => {
      setMockFromImplementation((table) => {
        if (table === "submissions" || table === "hackathon_participants") {
          return createChainableMock({ data: null, error: null, count: 1 })
        }
        return createChainableMock({ data: null, error: null })
      })
      setMockRpcImplementation(() => Promise.resolve({ data: 0, error: null }))

      const result = await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "active",
        toStatus: "completed",
        trigger: "auto",
        triggeredBy: "system",
      })

      expect(result).toEqual({
        success: false,
        error: "Projects must go through judging before the event can finish.",
        code: "judging_not_ready",
      })
    })

    it("does not let a manual status change skip judging", async () => {
      setMockFromImplementation((table) => {
        if (table === "submissions") {
          return createChainableMock({
            data: [{ id: "project-1" }],
            error: null,
            count: 1,
          })
        }
        if (table === "prizes") {
          return createChainableMock({
            data: [{ id: "crowd", judging_style: "crowd_vote", round_id: null }],
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "active",
        toStatus: "completed",
        trigger: "manual",
        triggeredBy: "user1",
      })

      expect(result).toEqual({
        success: false,
        error: "Projects must go through judging before the event can finish.",
        code: "judging_not_ready",
      })
    })

    it("updates the end time in the same leased transition row update", async () => {
      const nextEnd = "2030-09-03T17:00:00.000Z"
      let hackathonCalls = 0
      let updateChain: ChainableMock | undefined
      setMockFromImplementation((table) => {
        if (table === "hackathons") {
          hackathonCalls++
          if (hackathonCalls === 1) {
            return createChainableMock({
              data: {
                status: "completed",
                starts_at: "2030-09-02T12:00:00.000Z",
                ends_at: "2030-09-02T17:00:00.000Z",
              },
              error: null,
            })
          }
          updateChain = createChainableMock({
            data: {
              id: "h1",
              tenant_id: "t1",
              name: "Test Hack",
              slug: "test-hack",
              status: "active",
              starts_at: "2030-09-02T12:00:00.000Z",
              ends_at: nextEnd,
            },
            error: null,
          })
          return updateChain
        }
        return createChainableMock({ data: [], error: null })
      })

      const result = await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "completed",
        toStatus: "active",
        trigger: "manual",
        triggeredBy: "user1",
        endsAt: nextEnd,
      })

      expect(result.success).toBe(true)
      expect(updateChain!.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "active",
          phase: "submission_open",
          ends_at: nextEnd,
        }),
      )
      expect(leaseOrder.slice(0, 2)).toEqual(["acquired", "released"])
      expect(mockReschedulePreEventReminders).toHaveBeenCalledWith("h1")
    })

    it("closes the active judging round when reopening project work", async () => {
      const nextEnd = "2030-09-03T17:00:00.000Z"
      let hackathonCalls = 0
      let roundCalls = 0
      let updateChain: ChainableMock | undefined
      let roundResetChain: ChainableMock | undefined
      setMockFromImplementation((table) => {
        if (table === "hackathons") {
          hackathonCalls++
          if (hackathonCalls === 1) {
            return createChainableMock({
              data: {
                status: "judging",
                phase: "finals",
                starts_at: "2030-09-02T12:00:00.000Z",
                ends_at: "2030-09-02T17:00:00.000Z",
              },
              error: null,
            })
          }
          updateChain = createChainableMock({
            data: {
              id: "h1",
              tenant_id: "t1",
              name: "Test Hack",
              slug: "test-hack",
              status: "active",
              phase: "submission_open",
              starts_at: "2030-09-02T12:00:00.000Z",
              ends_at: nextEnd,
            },
            error: null,
          })
          return updateChain
        }
        if (table === "judging_rounds") {
          roundCalls++
          if (roundCalls === 1) {
            return createChainableMock({ data: { id: "round-1" }, error: null })
          }
          roundResetChain = createChainableMock({ data: [], error: null })
          return roundResetChain
        }
        return createChainableMock({ data: [], error: null })
      })

      const result = await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "judging",
        toStatus: "active",
        trigger: "manual",
        triggeredBy: "user1",
        endsAt: nextEnd,
      })

      expect(result.success).toBe(true)
      expect(roundResetChain!.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: "planned", is_active: false }),
      )
      expect(updateChain!.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: "active", phase: "submission_open" }),
      )
    })

    it("does not reopen an ended event without a future end time", async () => {
      setMockFromImplementation((table) => table === "hackathons"
        ? createChainableMock({
            data: {
              status: "judging",
              starts_at: "2026-08-29T12:00:00.000Z",
              ends_at: "2026-08-29T17:00:00.000Z",
            },
            error: null,
          })
        : createChainableMock({ data: null, error: null }))

      const result = await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "judging",
        toStatus: "active",
        trigger: "manual",
        triggeredBy: "user1",
      })

      expect(result).toEqual({
        success: false,
        error: "Pick a future end time before reopening this event.",
        code: "invalid_transition",
      })
    })

    it("does not reopen an event by clearing its end time", async () => {
      setMockFromImplementation((table) => table === "hackathons"
        ? createChainableMock({
            data: {
              status: "judging",
              starts_at: "2026-08-29T12:00:00.000Z",
              ends_at: "2026-08-29T17:00:00.000Z",
            },
            error: null,
          })
        : createChainableMock({ data: null, error: null }))

      const result = await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "judging",
        toStatus: "active",
        trigger: "manual",
        triggeredBy: "user1",
        endsAt: null,
      })

      expect(result).toEqual({
        success: false,
        error: "Pick a future end time before reopening this event.",
        code: "invalid_transition",
      })
    })

    it("allows draft → published", async () => {
      const hackathon = {
        id: "h1",
        tenant_id: "t1",
        name: "Test Hack",
        slug: "test-hack",
        status: "published",
      }

      let hackathonChain: ChainableMock | undefined
      setMockFromImplementation((table) => {
        if (table === "hackathon_transitions") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "hackathons") {
          const chain = createChainableMock({ data: hackathon, error: null })
          hackathonChain ??= chain
          return chain
        }
        return createChainableMock({ data: null, error: null })
      })
      mockGetTriggerItem.mockImplementation(() => {
        leaseOrder.push("side-effect")
        return Promise.resolve(null)
      })

      const result = await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "draft",
        toStatus: "published",
        trigger: "manual",
        triggeredBy: "user1",
        registrationOpensAt: "2026-08-26T12:00:00.000Z",
        registrationClosesAt: "2026-09-10T12:00:00.000Z",
      })

      expect(result.success).toBe(true)
      expect(leaseOrder).toEqual(["acquired", "released", "side-effect"])
      const updateCalls = hackathonChain!.update.mock.calls as unknown as Array<[
        Record<string, unknown>,
      ]>
      expect(updateCalls[0]![0]).toMatchObject({
        status: "published",
        registration_opens_at: "2026-08-26T12:00:00.000Z",
        registration_closes_at: "2026-09-10T12:00:00.000Z",
      })
    })

    it("commits completion and result visibility in one event update", async () => {
      const hackathon = {
        id: "h1",
        tenant_id: "t1",
        name: "Test Hack",
        slug: "test-hack",
        status: "completed",
      }
      let hackathonCalls = 0
      let committedHackathonChain: ChainableMock | undefined
      let resultsChain: ChainableMock | undefined
      setMockFromImplementation((table) => {
        if (table === "hackathon_transitions") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "submissions") {
          return createChainableMock({ data: [], error: null, count: 0 })
        }
        if (table === "prizes") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "hackathon_results") {
          resultsChain = createChainableMock({ data: [{ id: "result_1" }], error: null })
          return resultsChain
        }
        hackathonCalls++
        const hackathonChain = createChainableMock({
          data: hackathonCalls === 1
            ? { status: "judging", results_published_at: null }
            : hackathon,
          error: null,
        })
        if (hackathonCalls === 2) committedHackathonChain = hackathonChain
        return hackathonChain
      })

      const result = await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "judging",
        toStatus: "completed",
        trigger: "manual",
        triggeredBy: "system",
        resultsPublication: { publishedAt: "2026-08-26T12:00:00.000Z" },
      })

      expect(result.success).toBe(true)
      const update = committedHackathonChain!.update.mock.calls[0]![0] as Record<string, unknown>
      expect(update).toMatchObject({
        status: "completed",
        results_published_at: "2026-08-26T12:00:00.000Z",
        winner_emails_sent_at: null,
        results_announcement_sent_at: null,
      })
      expect(resultsChain!.update).toHaveBeenCalledWith({
        published_at: "2026-08-26T12:00:00.000Z",
      })
    })

    it("rolls back staged result visibility when completion loses its status check", async () => {
      const resultsChain = createChainableMock({ data: [{ id: "result_1" }], error: null })
      let hackathonCalls = 0
      setMockFromImplementation((table) => {
        if (table === "hackathon_results") return resultsChain
        if (table === "submissions") {
          return createChainableMock({ data: [], error: null, count: 0 })
        }
        if (table === "prizes") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "hackathons") {
          hackathonCalls++
          return createChainableMock({
            data: hackathonCalls === 2
              ? null
              : { status: "judging", results_published_at: null },
            error: null,
          })
        }
        return createChainableMock({ data: [], error: null })
      })

      const result = await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "judging",
        toStatus: "completed",
        trigger: "manual",
        triggeredBy: "system",
        resultsPublication: { publishedAt: "2026-08-26T12:00:00.000Z" },
      })

      expect(result).toEqual(expect.objectContaining({
        success: false,
        code: "event_changed",
      }))
      expect(resultsChain.update).toHaveBeenNthCalledWith(1, {
        published_at: "2026-08-26T12:00:00.000Z",
      })
      expect(resultsChain.update).toHaveBeenNthCalledWith(2, { published_at: null })
    })

    it("recovers completion when the committed event update response is lost", async () => {
      const publishedAt = "2026-08-26T12:00:00.000Z"
      let hackathonCalls = 0
      let resultCalls = 0
      const resultChains: ChainableMock[] = []
      setMockFromImplementation((table) => {
        if (table === "hackathons") {
          hackathonCalls++
          if (hackathonCalls === 1) {
            return createChainableMock({
              data: { status: "judging", results_published_at: null },
              error: null,
            })
          }
          if (hackathonCalls === 2) {
            const chain = createChainableMock({ data: null, error: null })
            chain.then = (() => {
              throw new Error("response lost")
            }) as typeof chain.then
            return chain
          }
          return createChainableMock({
            data: {
              id: "h1",
              tenant_id: "t1",
              name: "Test Hack",
              slug: "test-hack",
              status: "completed",
              results_published_at: publishedAt,
            },
            error: null,
          })
        }
        if (table === "hackathon_results") {
          resultCalls++
          const chain = createChainableMock({
            data: resultCalls === 1
              ? [{ id: "result_1" }]
              : [{ id: "result_1", published_at: publishedAt }],
            error: null,
          })
          resultChains.push(chain)
          return chain
        }
        return createChainableMock({ data: [], error: null })
      })

      await expect(executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "judging",
        toStatus: "completed",
        trigger: "manual",
        triggeredBy: "system",
        resultsPublication: { publishedAt },
      })).resolves.toEqual(expect.objectContaining({ success: true }))
      expect(resultChains[0]?.update).toHaveBeenCalledTimes(1)
      expect(resultChains.some((chain) =>
        chain.update.mock.calls.some((call) =>
          (call[0] as { published_at?: string | null }).published_at === null,
        ),
      )).toBe(false)
    })

    it("allows published → registration_open", async () => {
      const hackathon = {
        id: "h1",
        tenant_id: "t1",
        name: "Test Hack",
        slug: "test-hack",
        status: "registration_open",
      }

      setMockFromImplementation((table) => {
        if (table === "hackathon_transitions") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "hackathons") {
          return createChainableMock({ data: hackathon, error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "published",
        toStatus: "registration_open",
        trigger: "manual",
        triggeredBy: "user1",
      })

      expect(result.success).toBe(true)
    })

    it("sets each phase again across a forward and backward status round trip", async () => {
      let returnedStatus: "active" | "judging" | "published" = "judging"
      const hackathonUpdates: ChainableMock[] = []
      setMockFromImplementation((table) => {
        if (table === "submissions") {
          return createChainableMock({
            data: [{ id: "project-1" }],
            error: null,
            count: 1,
          })
        }
        if (table === "prizes") {
          return createChainableMock({
            data: [{ id: "crowd", judging_style: "crowd_vote", round_id: null }],
            error: null,
          })
        }
        if (table === "judging_rounds") {
          return createChainableMock({
            data: { id: "final-round", round_type: "finals" },
            error: null,
          })
        }
        if (table === "hackathons") {
          const chain = createChainableMock({
            data: {
              id: "h1",
              tenant_id: "t1",
              name: "Test Hack",
              slug: "test-hack",
              status: returnedStatus,
            },
            error: null,
          })
          hackathonUpdates.push(chain)
          return chain
        }
        return createChainableMock({ data: [], error: null })
      })

      expect(await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "active",
        toStatus: "judging",
        trigger: "manual",
        triggeredBy: "user1",
      })).toEqual(expect.objectContaining({ success: true }))

      returnedStatus = "published"
      expect(await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "judging",
        toStatus: "published",
        trigger: "manual",
        triggeredBy: "user1",
      })).toEqual(expect.objectContaining({ success: true }))

      returnedStatus = "active"
      expect(await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "published",
        toStatus: "active",
        trigger: "manual",
        triggeredBy: "user1",
      })).toEqual(expect.objectContaining({ success: true }))

      expect(hackathonUpdates.flatMap((chain) => chain.update.mock.calls.map((call) => call[0]))).toEqual([
        expect.objectContaining({ status: "judging", phase: "finals" }),
        expect.objectContaining({ status: "published", phase: null }),
        expect.objectContaining({ status: "active", phase: "build" }),
      ])
    })

    it.each([
      ["active", "completed"],
      ["completed", "archived"],
    ] as const)("denies pending teams when transitioning %s → %s", async (fromStatus, toStatus) => {
      const hackathon = {
        id: "h1",
        tenant_id: "t1",
        name: "Test Hack",
        slug: "test-hack",
        status: toStatus,
      }

      setMockFromImplementation((table) => {
        if (table === "hackathon_transitions") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "hackathons") {
          return createChainableMock({ data: hackathon, error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus,
        toStatus,
        trigger: "manual",
        triggeredBy: "user1",
      })

      expect(result.success).toBe(true)
      expect(mockDenyPendingTeamsForClosedHackathon).toHaveBeenCalledWith("h1")
      expect(mockReschedulePreEventReminders).toHaveBeenCalledWith("h1")
    })

    it("retries pending-team closeout before returning from completion", async () => {
      const hackathon = {
        id: "h1",
        tenant_id: "t1",
        name: "Test Hack",
        slug: "test-hack",
        status: "completed",
      }
      setMockFromImplementation((table) => {
        if (table === "hackathon_transitions") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "hackathons") {
          return createChainableMock({ data: hackathon, error: null })
        }
        return createChainableMock({ data: null, error: null })
      })
      mockDenyPendingTeamsForClosedHackathon
        .mockResolvedValueOnce({
          denied: 0,
          failed: [{ teamId: "team-1", code: "failed" }],
        })
        .mockResolvedValueOnce({ denied: 1, failed: [] })

      const result = await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "active",
        toStatus: "completed",
        trigger: "auto",
        triggeredBy: "system",
      })

      expect(result.success).toBe(true)
      expect(mockDenyPendingTeamsForClosedHackathon).toHaveBeenCalledTimes(2)
    })

    it("reconciles pre-event reminders when moving back to draft", async () => {
      const hackathon = {
        id: "h1",
        tenant_id: "t1",
        name: "Test Hack",
        slug: "test-hack",
        status: "draft",
      }
      setMockFromImplementation((table) => {
        if (table === "hackathon_transitions") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "hackathons") {
          return createChainableMock({ data: hackathon, error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "published",
        toStatus: "draft",
        trigger: "manual",
        triggeredBy: "user1",
      })

      expect(result.success).toBe(true)
      expect(mockDenyPendingTeamsForClosedHackathon).not.toHaveBeenCalled()
      expect(mockReschedulePreEventReminders).toHaveBeenCalledWith("h1")
    })

    it("does not let the auto path skip active from registration", async () => {
      const hackathon = {
        id: "h1",
        tenant_id: "t1",
        name: "Test Hack",
        slug: "test-hack",
        status: "completed",
      }

      setMockFromImplementation((table) => {
        if (table === "hackathon_transitions") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "hackathons") {
          return createChainableMock({ data: hackathon, error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "registration_open",
        toStatus: "completed",
        trigger: "auto",
        triggeredBy: "system",
      })

      expect(result.success).toBe(false)
      expect(result.code).toBe("invalid_transition")
      expect(mockDenyPendingTeamsForClosedHackathon).not.toHaveBeenCalled()
      expect(mockDispatch).not.toHaveBeenCalled()
    })

    it("does not let the auto path skip active from published", async () => {
      const hackathon = {
        id: "h1",
        tenant_id: "t1",
        name: "Test Hack",
        slug: "test-hack",
        status: "completed",
      }

      setMockFromImplementation((table) => {
        if (table === "hackathon_transitions") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "hackathons") {
          return createChainableMock({ data: hackathon, error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "published",
        toStatus: "completed",
        trigger: "auto",
        triggeredBy: "system",
      })

      expect(result.success).toBe(false)
      expect(result.code).toBe("invalid_transition")
      expect(mockDenyPendingTeamsForClosedHackathon).not.toHaveBeenCalled()
      expect(mockDispatch).not.toHaveBeenCalled()
    })

    it("does not call an event ending results publication", async () => {
      const hackathon = {
        id: "h1",
        tenant_id: "t1",
        name: "Test Hack",
        slug: "test-hack",
        status: "completed",
      }

      setMockFromImplementation((table) => {
        if (table === "hackathon_transitions") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "hackathons") {
          return createChainableMock({ data: hackathon, error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "active",
        toStatus: "completed",
        trigger: "auto",
        triggeredBy: "system",
      })

      expect(result.success).toBe(true)
      expect(mockDispatch).not.toHaveBeenCalled()
    })

    it("still rejects a manual registration_open → completed jump", async () => {
      const result = await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "registration_open",
        toStatus: "completed",
        trigger: "manual",
        triggeredBy: "user1",
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain("Invalid transition")
    })

    it("dispatches notifications for status with mapped event", async () => {
      const hackathon = {
        id: "h1",
        tenant_id: "t1",
        name: "Test Hack",
        slug: "test-hack",
        status: "active",
      }

      setMockFromImplementation((table) => {
        if (table === "hackathon_transitions") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "hackathons") {
          return createChainableMock({ data: hackathon, error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "registration_open",
        toStatus: "active",
        trigger: "auto",
        triggeredBy: "system",
      })

      expect(result.success).toBe(true)
      expect(mockDispatch).toHaveBeenCalledTimes(1)
      const call = mockDispatch.mock.calls[0][0] as { type: string }
      expect(call.type).toBe("hackathon_started")
    })

    it("auto-releases challenges when going active with the trigger item still linked to event_start", async () => {
      const hackathon = {
        id: "h1",
        tenant_id: "t1",
        name: "Test Hack",
        slug: "test-hack",
        status: "active",
      }

      setMockFromImplementation((table) => {
        if (table === "hackathon_transitions") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "hackathons") {
          return createChainableMock({ data: hackathon, error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      mockGetTriggerItem.mockResolvedValue({
        id: "item-1",
        trigger_type: "challenge_release",
        starts_at: "2026-04-10T09:00:00Z",
        linked_to: "event_start",
      })

      const result = await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "registration_open",
        toStatus: "active",
        trigger: "manual",
        triggeredBy: "user1",
      })

      expect(result.success).toBe(true)
      expect(mockGetTriggerItem).toHaveBeenCalledWith("h1", "challenge_release")
      expect(mockReleaseChallenges).toHaveBeenCalledWith(
        "h1",
        "t1",
        expect.objectContaining({
          dispatchNotification: false,
          trigger: "event_start",
        }),
      )
    })

    it("auto-releases challenges on active transition with linked_to event_publish (covers skipped-published path)", async () => {
      const hackathon = {
        id: "h1",
        tenant_id: "t1",
        name: "Test Hack",
        slug: "test-hack",
        status: "active",
      }

      setMockFromImplementation((table) => {
        if (table === "hackathon_transitions") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "hackathons") {
          return createChainableMock({ data: hackathon, error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      mockGetTriggerItem.mockResolvedValue({
        id: "item-1",
        trigger_type: "challenge_release",
        starts_at: "2026-04-10T09:00:00Z",
        linked_to: "event_publish",
      })

      const result = await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "registration_open",
        toStatus: "active",
        trigger: "manual",
        triggeredBy: "user1",
      })

      expect(result.success).toBe(true)
      expect(mockReleaseChallenges).toHaveBeenCalledWith(
        "h1",
        "t1",
        expect.objectContaining({
          dispatchNotification: false,
          trigger: "event_publish",
        }),
      )
    })

    it("auto-releases challenges when transitioning to published with linked_to event_publish", async () => {
      const hackathon = {
        id: "h1",
        tenant_id: "t1",
        name: "Test Hack",
        slug: "test-hack",
        status: "published",
      }

      setMockFromImplementation((table) => {
        if (table === "hackathon_transitions") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "hackathons") {
          return createChainableMock({ data: hackathon, error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      mockGetTriggerItem.mockResolvedValue({
        id: "item-1",
        trigger_type: "challenge_release",
        starts_at: "2026-04-10T09:00:00Z",
        linked_to: "event_publish",
      })

      const result = await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "draft",
        toStatus: "published",
        trigger: "manual",
        triggeredBy: "user1",
      })

      expect(result.success).toBe(true)
      expect(mockGetTriggerItem).toHaveBeenCalledWith("h1", "challenge_release")
      expect(mockReleaseChallenges).toHaveBeenCalledWith(
        "h1",
        "t1",
        expect.objectContaining({
          dispatchNotification: false,
          trigger: "event_publish",
        }),
      )
    })

    it("does NOT release challenges when transitioning to registration_open with linked_to event_publish", async () => {
      const hackathon = {
        id: "h1",
        tenant_id: "t1",
        name: "Test Hack",
        slug: "test-hack",
        status: "registration_open",
      }

      setMockFromImplementation((table) => {
        if (table === "hackathon_transitions") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "hackathons") {
          return createChainableMock({ data: hackathon, error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      mockGetTriggerItem.mockResolvedValue({
        id: "item-1",
        trigger_type: "challenge_release",
        starts_at: "2026-04-10T09:00:00Z",
        linked_to: "event_publish",
      })

      const result = await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "draft",
        toStatus: "registration_open",
        trigger: "manual",
        triggeredBy: "user1",
      })

      expect(result.success).toBe(true)
      expect(mockGetTriggerItem).not.toHaveBeenCalled()
      expect(mockReleaseChallenges).not.toHaveBeenCalled()
    })

    it("does NOT release challenges when transitioning to published with linked_to event_start", async () => {
      const hackathon = {
        id: "h1",
        tenant_id: "t1",
        name: "Test Hack",
        slug: "test-hack",
        status: "published",
      }

      setMockFromImplementation((table) => {
        if (table === "hackathon_transitions") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "hackathons") {
          return createChainableMock({ data: hackathon, error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      mockGetTriggerItem.mockResolvedValue({
        id: "item-1",
        trigger_type: "challenge_release",
        starts_at: "2026-04-10T09:00:00Z",
        linked_to: "event_start",
      })

      const result = await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "draft",
        toStatus: "published",
        trigger: "manual",
        triggeredBy: "user1",
      })

      expect(result.success).toBe(true)
      expect(mockReleaseChallenges).not.toHaveBeenCalled()
    })

    it("auto-releases challenges when going active with a custom time already in the past", async () => {
      const hackathon = {
        id: "h1",
        tenant_id: "t1",
        name: "Test Hack",
        slug: "test-hack",
        status: "active",
      }

      setMockFromImplementation((table) => {
        if (table === "hackathon_transitions") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "hackathons") {
          return createChainableMock({ data: hackathon, error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      mockGetTriggerItem.mockResolvedValue({
        id: "item-1",
        trigger_type: "challenge_release",
        starts_at: new Date(Date.now() - 60_000).toISOString(),
        linked_to: null,
      })

      const result = await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "registration_open",
        toStatus: "active",
        trigger: "manual",
        triggeredBy: "user1",
      })

      expect(result.success).toBe(true)
      expect(mockReleaseChallenges).toHaveBeenCalledWith(
        "h1",
        "t1",
        expect.objectContaining({
          dispatchNotification: false,
          trigger: "scheduled",
        }),
      )
    })

    it("does NOT release challenges when going active with a custom future time", async () => {
      const hackathon = {
        id: "h1",
        tenant_id: "t1",
        name: "Test Hack",
        slug: "test-hack",
        status: "active",
      }

      setMockFromImplementation((table) => {
        if (table === "hackathon_transitions") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "hackathons") {
          return createChainableMock({ data: hackathon, error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      mockGetTriggerItem.mockResolvedValue({
        id: "item-1",
        trigger_type: "challenge_release",
        starts_at: new Date(Date.now() + 60 * 60_000).toISOString(),
        linked_to: null,
      })

      const result = await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "registration_open",
        toStatus: "active",
        trigger: "manual",
        triggeredBy: "user1",
      })

      expect(result.success).toBe(true)
      expect(mockGetTriggerItem).toHaveBeenCalledWith("h1", "challenge_release")
      expect(mockReleaseChallenges).not.toHaveBeenCalled()
    })

    it("passes challenges to dispatcher when coincident with go-live", async () => {
      const hackathon = {
        id: "h1",
        tenant_id: "t1",
        name: "Test Hack",
        slug: "test-hack",
        status: "active",
      }

      setMockFromImplementation((table) => {
        if (table === "hackathon_transitions") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "hackathons") {
          return createChainableMock({ data: hackathon, error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      mockGetTriggerItem.mockResolvedValue({
        id: "item-1",
        trigger_type: "challenge_release",
        starts_at: "2026-04-10T09:00:00Z",
        linked_to: "event_start",
      })
      mockListChallenges.mockResolvedValue([
        { title: "Build It", description: "Make something cool" },
      ])

      const result = await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "registration_open",
        toStatus: "active",
        trigger: "manual",
        triggeredBy: "user1",
      })

      expect(result.success).toBe(true)
      expect(mockReleaseChallenges).toHaveBeenCalledWith(
        "h1",
        "t1",
        expect.objectContaining({
          dispatchNotification: false,
          trigger: "event_start",
        }),
      )

      expect(mockDispatch).toHaveBeenCalledTimes(1)
      const dispatchCall = mockDispatch.mock.calls[0][0] as {
        type: string
        challenges?: Array<{ title: string }>
      }
      expect(dispatchCall.type).toBe("hackathon_started")
      expect(dispatchCall.challenges).toBeDefined()
      expect(dispatchCall.challenges).toHaveLength(1)
      expect(dispatchCall.challenges![0].title).toBe("Build It")
    })

    it("does not release challenges when no challenge_release schedule item exists", async () => {
      const hackathon = {
        id: "h1",
        tenant_id: "t1",
        name: "Test Hack",
        slug: "test-hack",
        status: "active",
      }

      setMockFromImplementation((table) => {
        if (table === "hackathon_transitions") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "hackathons") {
          return createChainableMock({ data: hackathon, error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      mockGetTriggerItem.mockResolvedValue(null)

      const result = await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "registration_open",
        toStatus: "active",
        trigger: "manual",
        triggeredBy: "user1",
      })

      expect(result.success).toBe(true)
      expect(mockGetTriggerItem).toHaveBeenCalledWith("h1", "challenge_release")
      expect(mockReleaseChallenges).not.toHaveBeenCalled()
    })

    it("fails when status has already changed (optimistic lock)", async () => {
      setMockFromImplementation((table) => {
        if (table === "hackathons") {
          return createChainableMock({ data: null, error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "draft",
        toStatus: "published",
        trigger: "manual",
        triggeredBy: "user1",
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain("status has already changed")
      expect(result.code).toBe("event_changed")
    })

    it("handles DB update failure", async () => {
      setMockFromImplementation((table) => {
        if (table === "hackathons") {
          return createChainableMock({
            data: null,
            error: { message: "DB error" },
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await executeTransition({
        hackathonId: "h1",
        tenantId: "t1",
        fromStatus: "draft",
        toStatus: "published",
        trigger: "manual",
        triggeredBy: "user1",
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain("Failed to update status")
      expect(result.code).toBe("transition_unavailable")
    })
  })

  describe("processAutoTransitions", () => {
    it("returns empty when no hackathons need transitions", async () => {
      const hackathonQuery = createChainableMock({ data: [], error: null })
      setMockFromImplementation((table) => {
        if (table === "hackathons") {
          return hackathonQuery
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await processAutoTransitions()

      expect(result.processed).toBe(0)
      expect(result.transitions).toHaveLength(0)
      expect(hackathonQuery.order).toHaveBeenNthCalledWith(
        1,
        "updated_at",
        { ascending: true },
      )
      expect(hackathonQuery.order).toHaveBeenNthCalledWith(
        2,
        "id",
        { ascending: true },
      )
      expect(hackathonQuery.range).toHaveBeenCalledWith(
        0,
        AUTO_TRANSITION_BATCH_LIMIT - 1,
      )
    })

    it("rotates bounded pages so blocked events cannot starve later events", async () => {
      const firstPageQuery = createChainableMock({
        data: [{ id: "blocked" }],
        error: null,
        count: AUTO_TRANSITION_BATCH_LIMIT + 1,
      })
      const secondPageQuery = createChainableMock({ data: [], error: null })
      let hackathonQueries = 0
      setMockFromImplementation((table) => {
        if (table !== "hackathons") {
          return createChainableMock({ data: null, error: null })
        }
        hackathonQueries++
        return hackathonQueries === 1 ? firstPageQuery : secondPageQuery
      })

      const result = await processAutoTransitions(
        new Date(AUTO_TRANSITION_PAGE_WINDOW_MS),
      )

      expect(result).toEqual({ processed: 0, transitions: [], errors: [] })
      expect(firstPageQuery.range).toHaveBeenCalledWith(
        0,
        AUTO_TRANSITION_BATCH_LIMIT - 1,
      )
      expect(secondPageQuery.range).toHaveBeenCalledWith(
        AUTO_TRANSITION_BATCH_LIMIT,
        AUTO_TRANSITION_BATCH_LIMIT * 2 - 1,
      )
    })

    it("does not move test events through the lifecycle", async () => {
      setMockFromImplementation((table) => table === "hackathons"
        ? createChainableMock({
            data: [{
              id: "h1",
              tenant_id: "t1",
              status: "published",
              starts_at: "2026-08-29T12:00:00.000Z",
              ends_at: "2026-08-30T12:00:00.000Z",
              name: "Test Hack",
              slug: "test-hack",
              is_test_event: true,
            }],
            error: null,
          })
        : createChainableMock({ data: null, error: null }))

      expect(await processAutoTransitions(
        new Date("2026-08-31T12:00:00.000Z"),
      )).toEqual({ processed: 0, transitions: [], errors: [] })
      expect(mockWithEventMutationLease).not.toHaveBeenCalled()
    })

    it("detects and processes hackathon that should be active", async () => {
      const pastDate = new Date(Date.now() - 3600000).toISOString()
      const futureDate = new Date(Date.now() + 86400000).toISOString()

      const hackathons = [
        {
          id: "h1",
          tenant_id: "t1",
          status: "registration_open",
          starts_at: pastDate,
          ends_at: futureDate,
          name: "Test Hack",
          slug: "test-hack",
        },
      ]

      let callCount = 0
      setMockFromImplementation((table) => {
        if (table === "hackathons") {
          callCount++
          if (callCount === 1) {
            return createChainableMock({ data: hackathons, error: null })
          }
          return createChainableMock({
            data: { ...hackathons[0], status: "active" },
            error: null,
          })
        }
        if (table === "hackathon_transitions") {
          return createChainableMock({ data: [], error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await processAutoTransitions()

      expect(result.processed).toBe(1)
      expect(result.transitions[0].from).toBe("registration_open")
      expect(result.transitions[0].to).toBe("active")
    })

    it("opens registration automatically before the event starts", async () => {
      const now = new Date("2026-08-30T12:00:00.000Z")
      const hackathon = {
        id: "h1",
        tenant_id: "t1",
        status: "published",
        registration_opens_at: "2026-08-30T11:00:00.000Z",
        starts_at: "2026-09-02T12:00:00.000Z",
        ends_at: "2026-09-03T12:00:00.000Z",
        name: "Test Hack",
        slug: "test-hack",
      }
      let hackathonCalls = 0
      setMockFromImplementation((table) => {
        if (table === "hackathons") {
          hackathonCalls++
          return createChainableMock({
            data: hackathonCalls === 1
              ? [hackathon]
              : { ...hackathon, status: "registration_open" },
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await processAutoTransitions(now)

      expect(result).toEqual({
        processed: 1,
        transitions: [{
          hackathonId: "h1",
          from: "published",
          to: "registration_open",
        }],
        errors: [],
      })
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "registration_opened",
          fromStatus: "published",
          toStatus: "registration_open",
        }),
      )
    })

    it("catches up an ended registration event through active first", async () => {
      const past = new Date(Date.now() - 86400000).toISOString()
      const earlier = new Date(Date.now() - 2 * 86400000).toISOString()

      const hackathons = [
        {
          id: "h1",
          tenant_id: "t1",
          status: "registration_open",
          starts_at: earlier,
          ends_at: past,
          name: "Test Hack",
          slug: "test-hack",
        },
      ]

      let callCount = 0
      setMockFromImplementation((table) => {
        if (table === "hackathons") {
          callCount++
          if (callCount === 1) {
            return createChainableMock({ data: hackathons, error: null })
          }
          return createChainableMock({
            data: { ...hackathons[0], status: "active" },
            error: null,
          })
        }
        if (table === "hackathon_transitions") {
          return createChainableMock({ data: [], error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await processAutoTransitions()

      expect(result.processed).toBe(1)
      expect(result.errors).toHaveLength(0)
      expect(result.transitions[0].from).toBe("registration_open")
      expect(result.transitions[0].to).toBe("active")
    })

    it("starts judging when a custom project deadline passes and judging is ready", async () => {
      const now = new Date("2026-08-30T12:00:00.000Z")
      const hackathon = {
        id: "h1",
        tenant_id: "t1",
        status: "active",
        starts_at: "2026-08-29T12:00:00.000Z",
        ends_at: "2026-09-05T12:00:00.000Z",
        name: "Test Hack",
        slug: "test-hack",
      }
      const deadlineQuery = createChainableMock({
        data: { starts_at: "2026-08-30T11:00:00.000Z" },
        error: null,
      })
      let hackathonCalls = 0
      setMockFromImplementation((table) => {
        if (table === "hackathons") {
          hackathonCalls++
          return createChainableMock({
            data: hackathonCalls === 1
              ? [hackathon]
              : { ...hackathon, status: "judging" },
            error: null,
          })
        }
        if (table === "hackathon_schedule_items") {
          return deadlineQuery
        }
        if (table === "submissions") {
          return createChainableMock({
            data: [{ id: "project-1" }],
            error: null,
            count: 1,
          })
        }
        if (table === "prizes") {
          return createChainableMock({
            data: [{
              id: "weighted-prize",
              judging_style: "weighted_score",
              round_id: null,
            }],
            error: null,
          })
        }
        if (table === "hackathon_participants") {
          return createChainableMock({
            data: [{ id: "judge-1" }],
            error: null,
          })
        }
        if (table === "judge_assignments") {
          return createChainableMock({
            data: [{
              submission_id: "project-1",
              prize_id: null,
              judge_participant_id: "judge-1",
              assignment_kind: "unified_weighted_score",
            }],
            error: null,
          })
        }
        return createChainableMock({ data: [], error: null })
      })

      const result = await processAutoTransitions(now)

      expect(result).toEqual({
        processed: 1,
        transitions: [{ hackathonId: "h1", from: "active", to: "judging" }],
        errors: [],
      })
      expect(mockGetJudgingSetupStatus).toHaveBeenCalledTimes(2)
      expect(deadlineQuery.order).toHaveBeenCalledWith(
        "starts_at",
        { ascending: true },
      )
      expect(deadlineQuery.limit).toHaveBeenCalledWith(1)
    })

    it.each(["Finish the scorecard for Best overall.", "Assign eligible judges to every project for Best overall."])("keeps a scheduled opening closed and alerts the organizer: %s", async (issue) => {
      const now = new Date("2026-09-06T12:00:00Z")
      setMockFromImplementation((table) => createChainableMock({ data: table === "hackathons" ? [{
        id: "h1", tenant_id: "t1", status: "active", starts_at: "2026-09-01T12:00:00Z", ends_at: "2026-09-04T12:00:00Z", judging_opens_at: "2026-09-05T12:00:00Z", judging_closes_at: "2026-09-07T12:00:00Z",
      }] : null, error: null }))
      setMockRpcImplementation((name) => {
        expect(name).toBe("get_scheduled_judging_readiness")
        return Promise.resolve({ data: { isReady: false, issues: [issue], unassignedProjectCount: 1, requiresJudgeScoring: true }, error: null })
      })

      const result = await processAutoTransitions(now)

      expect(result).toMatchObject({ processed: 0, transitions: [], errors: [`h1: ${issue}`] })
      expect(mockReconcileJudging).toHaveBeenCalledWith("h1")
      expect(mockDispatch).not.toHaveBeenCalled()
    })

    it("keeps an ended event active and lists what judging still needs", async () => {
      const now = new Date("2026-08-30T12:00:00.000Z")
      const hackathon = {
        id: "h1",
        tenant_id: "t1",
        status: "active",
        starts_at: "2026-08-29T12:00:00.000Z",
        ends_at: "2026-08-30T11:00:00.000Z",
        name: "Test Hack",
        slug: "test-hack",
      }
      setMockFromImplementation((table) => {
        if (table === "hackathons") {
          return createChainableMock({ data: [hackathon], error: null })
        }
        if (table === "hackathon_schedule_items") {
          return createChainableMock({ data: null, error: null })
        }
        if (table === "submissions") {
          return createChainableMock({
            data: [{ id: "project-1" }, { id: "project-2" }],
            error: null,
            count: 2,
          })
        }
        if (table === "prizes") {
          return createChainableMock({
            data: [{
              id: "weighted-prize",
              judging_style: "weighted_score",
              round_id: null,
            }],
            error: null,
          })
        }
        if (table === "hackathon_participants") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "judge_assignments") {
          return createChainableMock({ data: [], error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await processAutoTransitions(now)

      expect(result.processed).toBe(0)
      expect(result.transitions).toEqual([])
      expect(result.errors).toEqual([
        "h1: Add at least one judge. 2 projects still need judge assignments.",
      ])
    })

    it("keeps committed transitions successful when pending-team closeout fails", async () => {
      const startsAt = new Date(Date.now() - 2 * 86400000).toISOString()
      const endsAt = new Date(Date.now() - 86400000).toISOString()
      const hackathons = [
        {
          id: "h1",
          tenant_id: "t1",
          status: "active",
          starts_at: startsAt,
          ends_at: endsAt,
          name: "First Hack",
          slug: "first-hack",
        },
        {
          id: "h2",
          tenant_id: "t2",
          status: "active",
          starts_at: startsAt,
          ends_at: endsAt,
          name: "Second Hack",
          slug: "second-hack",
        },
      ]
      let hackathonCalls = 0
      setMockFromImplementation((table) => {
        if (table === "hackathons") {
          hackathonCalls++
          return createChainableMock({
            data: hackathonCalls === 1
              ? hackathons
              : { ...hackathons[hackathonCalls - 2], status: "completed" },
            error: null,
          })
        }
        if (table === "hackathon_transitions") {
          return createChainableMock({ data: [], error: null })
        }
        return createChainableMock({ data: null, error: null })
      })
      mockDenyPendingTeamsForClosedHackathon
        .mockRejectedValueOnce(new Error("closeout unavailable"))
        .mockResolvedValue({ denied: 0, failed: [] })

      const result = await processAutoTransitions()

      expect(result.processed).toBe(2)
      expect(result.transitions).toEqual([
        { hackathonId: "h1", from: "active", to: "completed" },
        { hackathonId: "h2", from: "active", to: "completed" },
      ])
      expect(result.errors).toEqual([])
    })

    it("handles DB fetch error gracefully", async () => {
      setMockFromImplementation((table) => {
        if (table === "hackathons") {
          return createChainableMock({
            data: null,
            error: { message: "Connection failed" },
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await processAutoTransitions()

      expect(result.processed).toBe(0)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toContain("Connection failed")
    })
  })

  describe("closed judge work", () => {
    it("cancels invite links, queued emails, and reminders for a closed event", async () => {
      const invitationUpdate = createChainableMock({ data: null, error: null })
      const notificationDelete = createChainableMock({ data: null, error: null })
      const reminderUpdate = createChainableMock({ data: null, error: null })
      setMockFromImplementation((table) => {
        if (table === "hackathons") {
          return createChainableMock({ data: { status: "completed" }, error: null })
        }
        if (table === "judge_invitations") return invitationUpdate
        if (table === "judge_pending_notifications") return notificationDelete
        if (table === "scheduled_reminders") return reminderUpdate
        return createChainableMock({ data: null, error: null })
      })

      const now = new Date("2026-08-30T12:00:00.000Z")
      await expect(
        closePendingJudgeWorkForClosedHackathon("h1", now),
      ).resolves.toBe(true)

      expect(invitationUpdate.update).toHaveBeenCalledWith({
        status: "cancelled",
        updated_at: now.toISOString(),
      })
      expect(invitationUpdate.in).toHaveBeenCalledWith("status", [
        "pending",
        "expired",
      ])
      expect(notificationDelete.delete).toHaveBeenCalledTimes(1)
      expect(notificationDelete.is).toHaveBeenCalledWith("sent_at", null)
      expect(reminderUpdate.update).toHaveBeenCalledWith({
        cancelled_at: now.toISOString(),
      })
      expect(reminderUpdate.is).toHaveBeenCalledWith("sent_at", null)
      expect(reminderUpdate.is).toHaveBeenCalledWith("cancelled_at", null)
    })

    it("rechecks event status before clearing judge work", async () => {
      const invitationUpdate = createChainableMock({ data: null, error: null })
      setMockFromImplementation((table) => table === "hackathons"
        ? createChainableMock({ data: { status: "active" }, error: null })
        : invitationUpdate)

      await expect(
        closePendingJudgeWorkForClosedHackathon("h1"),
      ).resolves.toBe(false)
      expect(invitationUpdate.update).not.toHaveBeenCalled()
    })

    it("repairs a bounded set of closed events with stale judge work", async () => {
      const invitationCandidates = createChainableMock({
        data: [{ hackathon_id: "h1" }, { hackathon_id: "h1" }],
        error: null,
      })
      const invitationUpdate = createChainableMock({ data: null, error: null })
      let invitationCalls = 0
      setMockFromImplementation((table) => {
        if (table === "judge_invitations") {
          invitationCalls++
          return invitationCalls === 1 ? invitationCandidates : invitationUpdate
        }
        if (table === "judge_pending_notifications" || table === "scheduled_reminders") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "hackathons") {
          return createChainableMock({ data: { status: "archived" }, error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      await expect(
        reconcilePendingJudgeWorkForClosedHackathons(
          7,
          new Date("2026-08-30T12:00:00.000Z"),
        ),
      ).resolves.toEqual({ events: 1, failed: 0, errors: [] })
      expect(invitationCandidates.limit).toHaveBeenCalledWith(7)
      expect(invitationUpdate.update).toHaveBeenCalledTimes(1)
    })
  })

  describe("reconcilePendingTeamsForClosedHackathons", () => {
    it("retries closeout for each closed event with a waiting team", async () => {
      setMockFromImplementation((table) => {
        if (table === "teams") {
          return createChainableMock({
            data: [
              { hackathon_id: "h1" },
              { hackathon_id: "h1" },
              { hackathon_id: "h2" },
            ],
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })
      mockDenyPendingTeamsForClosedHackathon
        .mockResolvedValueOnce({ denied: 2, failed: [] })
        .mockResolvedValueOnce({
          denied: 0,
          failed: [{ teamId: "team-3", code: "failed" }],
        })

      const result = await reconcilePendingTeamsForClosedHackathons()

      expect(result).toEqual({
        events: 2,
        denied: 2,
        failed: 1,
        errors: ["h2: team-3:failed"],
      })
      expect(mockDenyPendingTeamsForClosedHackathon).toHaveBeenCalledTimes(2)
    })

    it("reports the closed-team queue read failure", async () => {
      setMockFromImplementation(() => createChainableMock({
        data: null,
        error: { message: "queue unavailable" },
      }))

      expect(await reconcilePendingTeamsForClosedHackathons()).toEqual({
        events: 0,
        denied: 0,
        failed: 0,
        errors: ["queue unavailable"],
      })
    })
  })
})
