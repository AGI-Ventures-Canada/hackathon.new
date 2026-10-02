import { describe, expect, it } from "bun:test"
import { planJudgingDistribution, type DistributionSnapshot } from "@/lib/judging/distribution-planner"

function snapshot(): DistributionSnapshot {
  const projects = Array.from({ length: 6 }, (_, i) => ({ id: `project-${i}`, title: `Project ${i}`, teamId: `team-${i}`, mode: "in_person", roomId: null }))
  return {
    version: "v1", hackathonId: "event", coreCategoryCount: 4, closed: false,
    judges: Array.from({ length: 4 }, (_, i) => ({ id: `judge-${i}`, name: `Judge ${i}`, teamId: null })),
    projects,
    prizes: [{ id: "overall", name: "Overall", style: "weighted_score", roundId: null, judgeScope: "all", judgeIds: [], projectIds: projects.map((p) => p.id), allowedTeamModes: null, categoryCount: 0 }],
    assignments: [],
  }
}

describe("judging assignment planner", () => {
  it("balances three reviews per project and stays deterministic across query order", () => {
    const source = snapshot()
    const plan = planJudgingDistribution(source)
    expect(plan.assignments).toHaveLength(18)
    expect(plan.coverage.every((c) => c.planned === 3)).toBe(true)
    const workload = plan.workload.map((w) => w.added)
    expect(Math.max(...workload) - Math.min(...workload)).toBeLessThanOrEqual(1)
    expect(planJudgingDistribution({ ...source, judges: [...source.judges].reverse(), projects: [...source.projects].reverse() }).assignments).toEqual(plan.assignments)
  })

  it("shares a weighted card only across prizes the judge can review", () => {
    const source = snapshot()
    source.prizes.push({ ...source.prizes[0], id: "sponsor", name: "Sponsor", judgeScope: "selected", judgeIds: ["judge-0"], categoryCount: 2 })
    const plan = planJudgingDistribution(source, 2)
    expect(plan.assignments.filter((a) => a.prizeIds.includes("sponsor"))).toHaveLength(6)
    expect(plan.assignments.filter((a) => a.prizeIds.includes("sponsor")).every((a) => a.judgeId === "judge-0" && a.prizeIds.includes("overall"))).toBe(true)
    expect(new Set(plan.assignments.map((a) => `${a.judgeId}:${a.projectId}`)).size).toBe(plan.assignments.length)
    expect(plan.warnings.length).toBeGreaterThan(0)
  })

  it("keeps an invited specialist out of unrelated prizes with an open panel", () => {
    const source = snapshot()
    source.judges[0] = { ...source.judges[0], prizeScope: "selected", prizeIds: ["sponsor"] }
    source.prizes.push({ ...source.prizes[0], id: "sponsor", name: "Sponsor", categoryCount: 1 })
    const plan = planJudgingDistribution(source, 4)
    const specialistCards = plan.assignments.filter((a) => a.judgeId === "judge-0")
    expect(specialistCards.length).toBeGreaterThan(0)
    expect(specialistCards.every((a) => a.prizeIds.length === 1 && a.prizeIds[0] === "sponsor")).toBe(true)
    expect(plan.coverage.filter((c) => c.prizeId === "overall").every((c) => c.eligibleJudges === 3)).toBe(true)
  })

  it("excludes own teams, room conflicts, and projects outside the allowed mode", () => {
    const source = snapshot()
    source.judges[0].teamId = "team-0"
    source.judges[1] = { ...source.judges[1], roomIds: ["room-a"] }
    source.projects[0].roomId = "room-a"
    source.projects[1].mode = "virtual"
    source.prizes[0].allowedTeamModes = ["in_person"]
    const plan = planJudgingDistribution(source, 4)
    expect(plan.assignments.some((a) => a.judgeId === "judge-0" && a.projectId === "project-0")).toBe(false)
    expect(plan.assignments.some((a) => a.projectId === "project-1")).toBe(false)
    expect(plan.assignments.filter((a) => a.judgeId === "judge-1").every((a) => a.projectId === "project-0")).toBe(true)
  })

  it("preserves assignments and produces no duplicate work when reapplied", () => {
    const source = snapshot()
    const first = planJudgingDistribution(source)
    source.assignments = first.assignments.map((a, i) => ({ ...a, id: `assignment-${i}`, complete: i % 2 === 0, scopeMode: "scoped" }))
    const next = planJudgingDistribution(source)
    expect(next.assignments).toEqual([])
    expect(next.coverage.every((c) => c.assigned === 3)).toBe(true)
  })

  it("keeps completed scorecards unchanged when a newly scoped prize needs coverage", () => {
    const source = snapshot()
    source.judges = source.judges.slice(0, 1)
    source.assignments = source.projects.map((p, i) => ({ id: `a-${i}`, judgeId: "judge-0", projectId: p.id, prizeId: null, roundId: null, kind: "unified_weighted_score", complete: true, prizeIds: ["old"], scopeMode: "scoped" }))
    const plan = planJudgingDistribution(source, 1)
    expect(plan.assignments).toEqual([])
    expect(plan.coverage.every((c) => c.assigned === 0)).toBe(true)
    expect(plan.warnings.some((warning) => warning.includes("kept unchanged"))).toBe(true)
  })

  it("keeps legacy assignment coverage while ignoring audience voting", () => {
    const source = snapshot()
    source.prizes.push({ ...source.prizes[0], id: "audience", style: "audience_vote" })
    source.assignments = source.projects.map((p, i) => ({ id: `a-${i}`, judgeId: "judge-0", projectId: p.id, prizeId: null, roundId: null, kind: "unified_weighted_score", complete: true, prizeIds: ["overall"], scopeMode: "legacy_unscoped" }))
    const plan = planJudgingDistribution(source, 1)
    expect(plan.assignments).toEqual([])
    expect(plan.coverage).toHaveLength(6)
  })

  it("rejects invalid targets and closed events", () => {
    for (const target of [0, 21, 1.5, NaN]) expect(() => planJudgingDistribution(snapshot(), target)).toThrow()
    expect(() => planJudgingDistribution({ ...snapshot(), closed: true })).toThrow("closed")
  })
})
