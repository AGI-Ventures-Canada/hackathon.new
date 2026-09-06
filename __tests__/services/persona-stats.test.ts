import { describe, it, expect, beforeEach } from "bun:test"
import {
  createChainableMock,
  resetSupabaseMocks,
  setMockFromImplementation,
  setMockRpcImplementation,
  mockRpc,
} from "../lib/supabase-mock"

const { getBatchJudgeStats, getSponsorshipDetails } = await import(
  "@/lib/services/persona-stats"
)

describe("getBatchJudgeStats", () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  it("returns empty map for empty hackathonIds", async () => {
    const result = await getBatchJudgeStats([], "user_1")
    expect(result.size).toBe(0)
  })

  it("returns empty map when no judge participants found", async () => {
    setMockFromImplementation(() =>
      createChainableMock({ data: [], error: null }),
    )
    const result = await getBatchJudgeStats(["h1"], "user_1")
    expect(result.size).toBe(0)
  })

  it("returns stats with assignment counts", async () => {
    setMockFromImplementation((table) => {
      if (table === "hackathon_participants") {
        return createChainableMock({
          data: [{ id: "p1", hackathon_id: "h1" }],
          error: null,
        })
      }
      if (table !== "judge_assignments") return createChainableMock({ data: table === "hackathons" ? [{ id: "h1", status: "judging" }] : [], error: null })
      return createChainableMock({
        data: [
          { id: "a1", judge_participant_id: "p1", hackathon_id: "h1", is_complete: true, submission: { status: "submitted" } },
          { id: "a2", judge_participant_id: "p1", hackathon_id: "h1", is_complete: false, submission: { status: "submitted" } },
          { id: "a3", judge_participant_id: "p1", hackathon_id: "h1", is_complete: true, submission: { status: "submitted" } },
        ],
        error: null,
      })
    })

    const result = await getBatchJudgeStats(["h1"], "user_1")
    expect(result.size).toBe(1)
    const stats = result.get("h1")!
    expect(stats.totalAssignments).toBe(3)
    expect(stats.completedAssignments).toBe(2)
    expect(stats.actionableAssignments).toBe(1)
  })

  it("counts open judging after a live event starts without changing future or stopped events", async () => {
    const cases = [
      { id: "published", status: "published", starts_at: "2000-01-01T00:00:00Z", actionable: 1 },
      { id: "registration", status: "registration_open", starts_at: "2000-01-01T00:00:00Z", actionable: 1 },
      { id: "future", status: "registration_open", starts_at: "2999-01-01T00:00:00Z", actionable: 0 },
      { id: "draft", status: "draft", starts_at: "2000-01-01T00:00:00Z", actionable: 0 },
      { id: "completed", status: "completed", starts_at: "2000-01-01T00:00:00Z", actionable: 0 },
      { id: "archived", status: "archived", starts_at: "2000-01-01T00:00:00Z", actionable: 0 },
    ]
    setMockFromImplementation((table) => createChainableMock({ data: table === "hackathon_participants"
      ? cases.map(({ id }) => ({ id: `p-${id}`, hackathon_id: id }))
      : table === "hackathons"
        ? cases.map((event) => ({ ...event, ends_at: "2000-01-02T00:00:00Z", judging_opens_at: "2000-01-01T00:00:00Z", judging_closes_at: "2999-01-01T00:00:00Z" }))
        : table === "judge_assignments"
          ? cases.map(({ id }) => ({ id: `a-${id}`, judge_participant_id: `p-${id}`, hackathon_id: id, is_complete: false, submission: { status: "submitted" } }))
          : [], error: null }))
    const result = await getBatchJudgeStats(cases.map(({ id }) => id), "user_1")
    for (const event of cases) expect(result.get(event.id)).toMatchObject({ totalAssignments: 1, actionableAssignments: event.actionable })
  })

  it("uses the direct prize relation when coverage creates another route to prizes", async () => {
    const assignments = createChainableMock({ data: [], error: null })
    let selection = ""
    assignments.select.mockImplementation((...args: unknown[]) => { selection = String(args[0]); return assignments })
    assignments.then = (resolve) => selection.includes("prizes!judge_assignments_prize_id_fkey(")
      ? resolve({ data: [{ id: "a1", judge_participant_id: "p1", hackathon_id: "h1", prize_id: "prize", is_complete: false, prize: { judging_style: "judges_pick" }, submission: { status: "submitted" } }], error: null })
      : resolve({ data: null, error: { code: "PGRST201", message: "Multiple prize relationships" } })
    setMockFromImplementation((table) => table === "judge_assignments" ? assignments : createChainableMock({
      data: table === "hackathon_participants" ? [{ id: "p1", hackathon_id: "h1" }]
        : table === "hackathons" ? [{ id: "h1", status: "judging" }] : [],
      error: null,
    }))

    const result = await getBatchJudgeStats(["h1"], "user_1")

    expect(result.get("h1")).toMatchObject({ totalAssignments: 1, actionableAssignments: 1 })
    expect(selection).toContain("submissions!judge_assignments_submission_id_fkey!inner(")
  })

  it("handles multiple hackathons", async () => {
    setMockFromImplementation((table) => {
      if (table === "hackathon_participants") {
        return createChainableMock({
          data: [
            { id: "p1", hackathon_id: "h1" },
            { id: "p2", hackathon_id: "h2" },
          ],
          error: null,
        })
      }
      if (table !== "judge_assignments") return createChainableMock({ data: [], error: null })
      return createChainableMock({
        data: [
          { id: "a1", judge_participant_id: "p1", hackathon_id: "h1", is_complete: true, submission: { status: "submitted" } },
          { id: "a2", judge_participant_id: "p2", hackathon_id: "h2", is_complete: false, submission: { status: "submitted" } },
        ],
        error: null,
      })
    })

    const result = await getBatchJudgeStats(["h1", "h2"], "user_1")
    expect(result.size).toBe(2)
    expect(result.get("h1")!.completedAssignments).toBe(1)
    expect(result.get("h2")!.completedAssignments).toBe(0)
  })

  it("excludes own-team and withdrawn projects and treats a partially completed ballot as one pending review", async () => {
    const base = { judge_participant_id: "p1", hackathon_id: "h1", is_complete: false, submission: { team_id: "other-team", status: "submitted" } }
    const ballot = { ...base, prize_id: "prize-1", prize: { judging_style: "judges_pick" } }
    setMockFromImplementation((table) => createChainableMock({ data: table === "hackathon_participants" ? [{ id: "p1", hackathon_id: "h1", team_id: "own-team" }]
      : table === "hackathons" ? [{ id: "h1", status: "judging" }]
      : table === "judge_assignments" ? [
        { ...base, id: "own", submission: { team_id: "own-team", status: "submitted" } },
        { ...base, id: "withdrawn", submission: { team_id: "other-team", status: "draft" } },
        { ...ballot, id: "pick-1", is_complete: true },
        { ...ballot, id: "pick-2" },
      ] : [], error: null }))
    const result = await getBatchJudgeStats(["h1"], "user_1")
    expect(result.get("h1")).toMatchObject({ totalAssignments: 1, completedAssignments: 0, actionableAssignments: 1 })
  })

  it("recounts a narrowed judge panel using visible projects while keeping completed history", async () => {
    const base = { hackathon_id: "h1", judge_participant_id: "p1", is_complete: false, scoring_scope: "scoped", submission: { team_id: "other-team", status: "submitted" } }
    let visible = ["eligible", "removed", "history", "own", "withdrawn"]
    setMockRpcImplementation(() => Promise.resolve({ data: visible, error: null }))
    setMockFromImplementation((table) => createChainableMock({ data: table === "hackathon_participants" ? [{ id: "p1", hackathon_id: "h1", team_id: "own-team" }]
      : table === "hackathons" ? [{ id: "h1", status: "judging" }]
      : table === "judge_assignments" ? [
        { ...base, id: "eligible" },
        { ...base, id: "removed" },
        { ...base, id: "history", is_complete: true },
        { ...base, id: "own", submission: { team_id: "own-team", status: "submitted" } },
        { ...base, id: "withdrawn", submission: { team_id: "other-team", status: "draft" } },
      ] : [], error: null }))
    expect((await getBatchJudgeStats(["h1"], "user_1")).get("h1")).toMatchObject({ totalAssignments: 3, completedAssignments: 1, actionableAssignments: 2 })
    visible = visible.filter((id) => id !== "removed")
    expect((await getBatchJudgeStats(["h1"], "user_1")).get("h1")).toMatchObject({ totalAssignments: 2, completedAssignments: 1, actionableAssignments: 1 })
    expect(mockRpc).toHaveBeenCalledWith("get_judging_visible_assignment_ids", { p_hackathon_id: "h1" })
    expect(mockRpc).toHaveBeenCalledTimes(2)
  })

  it("surfaces a failed or malformed visibility response instead of showing invented counts", async () => {
    setMockFromImplementation((table) => createChainableMock({ data: table === "hackathon_participants" ? [{ id: "p1", hackathon_id: "h1" }]
      : table === "hackathons" ? [{ id: "h1", status: "judging" }]
      : table === "judge_assignments" ? [{ id: "a1", hackathon_id: "h1", judge_participant_id: "p1", scoring_scope: "scoped", is_complete: false, submission: { status: "submitted" } }]
      : [], error: null }))
    setMockRpcImplementation(() => Promise.resolve({ data: null, error: { code: "PGRST202", message: "Resolver missing" } }))
    await expect(getBatchJudgeStats(["h1"], "user_1")).rejects.toThrow("Could not load your judging progress")
    setMockRpcImplementation(() => Promise.resolve({ data: null, error: null }))
    await expect(getBatchJudgeStats(["h1"], "user_1")).rejects.toThrow("Could not load your judging progress")
  })

  it("applies event and round windows while retaining closed reviews in the history count", async () => {
    const past = { opens_at: "2000-01-01T00:00:00Z", closes_at: "2000-01-02T00:00:00Z" }
    const future = { opens_at: "2999-01-01T00:00:00Z", closes_at: "2999-01-02T00:00:00Z" }
    const eventIds = ["closed-event", "future-event", "round-event", "published-event"]
    setMockFromImplementation((table) => createChainableMock({ data: table === "hackathon_participants" ? eventIds.map((id) => ({ id: `p-${id}`, hackathon_id: id }))
      : table === "hackathons" ? [
        { id: "closed-event", status: "judging", judging_opens_at: past.opens_at, judging_closes_at: past.closes_at },
        { id: "future-event", status: "judging", judging_opens_at: future.opens_at, judging_closes_at: future.closes_at },
        { id: "round-event", status: "judging" },
        { id: "published-event", status: "judging", results_published_at: past.closes_at },
      ] : table === "judging_rounds" ? [{ id: "closed-round", hackathon_id: "round-event", status: "active", ...past }]
      : table === "judge_assignments" ? eventIds.map((id) => ({ id: `a-${id}`, judge_participant_id: `p-${id}`, hackathon_id: id, is_complete: false, round_id: id === "round-event" ? "closed-round" : null, submission: { status: "submitted" } })) : [], error: null }))
    const result = await getBatchJudgeStats(eventIds, "user_1")
    for (const id of eventIds) expect(result.get(id)).toMatchObject({ totalAssignments: 1, actionableAssignments: 0 })
  })

  it("keeps only active-round finalists actionable and waits for invitation scope to finish", async () => {
    setMockFromImplementation((table) => createChainableMock({ data: table === "hackathon_participants" ? [{ id: "p1", hackathon_id: "h1" }, { id: "p2", hackathon_id: "h2", judging_scope_ready: false }]
      : table === "hackathons" ? [{ id: "h1", status: "active" }, { id: "h2", status: "judging" }]
      : table === "judging_rounds" ? [{ id: "round-1", hackathon_id: "h1", status: "active" }]
      : table === "round_submissions" ? [{ round_id: "round-1", submission_id: "finalist" }]
      : table === "judge_assignments" ? [
        { id: "a1", judge_participant_id: "p1", hackathon_id: "h1", submission_id: "finalist", submission: { status: "submitted" } },
        { id: "a2", judge_participant_id: "p1", hackathon_id: "h1", submission_id: "other", submission: { status: "submitted" } },
        { id: "a3", judge_participant_id: "p2", hackathon_id: "h2", submission: { status: "submitted" } },
      ] : [], error: null }))
    const result = await getBatchJudgeStats(["h1", "h2"], "user_1")
    expect(result.get("h1")).toMatchObject({ totalAssignments: 2, actionableAssignments: 1, hasActiveRound: true })
    expect(result.get("h2")).toMatchObject({ totalAssignments: 1, actionableAssignments: 0 })
  })
})

describe("getSponsorshipDetails", () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  it("returns empty map for empty hackathonIds", async () => {
    const result = await getSponsorshipDetails("t1", [])
    expect(result.size).toBe(0)
  })

  it("returns sponsorship info with tiers", async () => {
    setMockFromImplementation(() =>
      createChainableMock({
        data: [
          { hackathon_id: "h1", tier: "gold", name: "Acme Corp" },
          { hackathon_id: "h2", tier: "silver", name: "Beta Inc" },
        ],
        error: null,
      }),
    )

    const result = await getSponsorshipDetails("t1", ["h1", "h2"])
    expect(result.size).toBe(2)
    expect(result.get("h1")!.tier).toBe("gold")
    expect(result.get("h2")!.name).toBe("Beta Inc")
  })

  it("returns empty map on error", async () => {
    setMockFromImplementation(() =>
      createChainableMock({ data: null, error: { message: "fail" } }),
    )

    const result = await getSponsorshipDetails("t1", ["h1"])
    expect(result.size).toBe(0)
  })
})
