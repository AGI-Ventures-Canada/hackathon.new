import { beforeEach, describe, expect, it, mock } from "bun:test"

const id = "11111111-1111-4111-8111-111111111111"
const event = {
  id,
  slug: "demo",
  name: "Demo",
  status: "active",
  updated_at: "2026-09-05T12:00:00Z",
  results_published_at: null,
  judging_opens_at: null,
  judging_closes_at: null,
  judging_timezone: "UTC",
  judging_instructions: "",
  judging_browse_enabled: false,
  judging_target_reviews: 3,
  judging_reminders_enabled: true,
}
const core = [
  {
    id: "criterion",
    name: "Does it work?",
    description: null,
    weight: 100,
    minScore: 0,
    maxScore: 10,
    displayOrder: 0,
  },
]
const prizes = [
  { id: "prize-a", name: "Best build", judging_style: "weighted_score" },
  { id: "prize-b", name: "Best idea", judging_style: "weighted_score" },
]
let coveredB = false
let notificationFails = false
let rpcError: { message: string } | null = null
const rpc = mock(async (name: string, _body: unknown) => name === "judging_window_is_configured" ? ({ data: false, error: null }) : ({
  data: rpcError ? null : { saved: true },
  error: rpcError,
}))
function chain(result: unknown) {
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: () => query,
    then: <T>(resolve: (result: unknown) => T) => resolve(result),
  }
  return query
}
mock.module("@/lib/db/client", () => ({
  supabase: () => ({
    from: (table: string) =>
      chain({ data: table === "hackathons" ? event : null, error: null, count: 1 }),
    rpc,
  }),
}))
mock.module("@/lib/services/schedule-items", () => ({ getSubmissionDeadline: async () => null }))
mock.module("@/lib/services/judge-invitations", () => ({ listJudgeInvitations: async () => [] }))
mock.module("@/lib/services/judging", () => ({
  listPrizes: async () => prizes,
  listJudges: async () => [{ participantId: "judge", displayName: "Judge" }],
  listRounds: async () => [],
  listCoreCriteria: async () => core,
  listPrizeCriteriaByPrizeIds: async () => new Map(),
  getJudgingProgress: async () => ({ totalAssignments: 1, completedAssignments: 0, judges: [] }),
  evaluateJudgingSetup: () => ({ isReady: true, requiresJudgeScoring: true, issues: [] }),
}))
mock.module("@/lib/services/judging-distribution", () => ({
  getJudgingDistributionPreview: async () => ({
    coverage: [
      {
        projectId: "project",
        projectTitle: "Project",
        prizeId: "prize-a",
        prizeName: "Best build",
        assigned: 3,
        planned: 0,
        target: 3,
        eligibleJudges: 3,
      },
      {
        projectId: "project",
        projectTitle: "Project",
        prizeId: "prize-b",
        prizeName: "Best idea",
        assigned: coveredB ? 3 : 0,
        planned: 3,
        target: 3,
        eligibleJudges: 3,
      },
    ],
  }),
}))
mock.module("@/lib/services/judging-notifications", () => ({
  reconcileJudgingNotifications: async () => {
    if (notificationFails) throw new Error("offline")
  },
}))
const { getJudgingSetup, configureJudgingSetup } = await import("@/lib/services/judging-setup")

describe("shared judging readiness", () => {
  beforeEach(() => {
    coveredB = false
    notificationFails = false
    rpcError = null
    rpc.mockClear()
  })
  it("reports a missing prize review even when the project already has another assignment", async () => {
    const setup = await getJudgingSetup(id)
    expect(setup.readiness.isReady).toBe(false)
    expect(setup.readiness.issues).toContainEqual({
      code: "coverage:project:prize-b",
      message: "Project needs judges for Best idea.",
      editor: "assignments",
      prizeId: "prize-b",
    })
  })
  it("does not count planned assignments as applied coverage", async () => {
    expect(
      (await getJudgingSetup(id)).readiness.issues.some((issue) =>
        issue.code.startsWith("coverage:"),
      ),
    ).toBe(true)
    coveredB = true
    const ready = await getJudgingSetup(id)
    expect(ready.readiness.isReady).toBe(true)
    expect(ready.readiness.issues).toContainEqual({
      code: "judging_schedule",
      message: "Set when judging opens and closes.",
      editor: "schedule",
      blocking: false,
    })
  })
  it("retains manual scheduling for old events with no judging dates", async () => {
    coveredB = true
    const setup = await getJudgingSetup(id)
    expect(setup.settings.opensAt).toBeNull()
    expect(setup.settings.closesAt).toBeNull()
    expect(setup.readiness.isReady).toBe(true)
  })
  it("returns committed configuration if only its notification reconciliation fails", async () => {
    notificationFails = true
    const saved = await configureJudgingSetup(id, {
      expectedVersion: event.updated_at,
      requestKey: "retry-1",
      settings: { timezone: "UTC" },
    })
    expect(saved.id).toBe(id)
    expect(rpc).toHaveBeenCalledWith("configure_judging_setup", {
      p_hackathon_id: id,
      p_expected_updated_at: event.updated_at,
      p_request_key: "retry-1",
      p_settings: { timezone: "UTC" },
      p_apply_starter: false,
      p_prize_name: "Best overall",
    })
  })
  it("rejects invalid schedule pairs without mutating setup", async () => {
    await expect(
      configureJudgingSetup(id, {
        expectedVersion: event.updated_at,
        requestKey: "retry-1",
        settings: { opensAt: "2026-09-06T14:00:00Z", closesAt: null },
      }),
    ).rejects.toThrow("later deadline")
    expect(rpc.mock.calls.map(([name]) => name)).not.toContain("configure_judging_setup")
  })
  it("keeps stale configuration a recoverable conflict", async () => {
    rpcError = { message: "judging_changed" }
    await expect(
      configureJudgingSetup(id, { expectedVersion: event.updated_at, requestKey: "retry-1" }),
    ).rejects.toMatchObject({ code: "judging_changed" })
  })
})
