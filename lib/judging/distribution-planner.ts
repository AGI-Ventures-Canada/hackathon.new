export type DistributionJudge = { id: string; name: string; teamId: string | null; roomIds?: string[]; prizeScope?: "all" | "selected"; prizeIds?: string[] }
export type DistributionProject = { id: string; title: string; teamId: string | null; mode: string | null; roomId: string | null; roomIds?: string[] }
export type DistributionPrize = { id: string; name: string; style: string; roundId: string | null; judgeScope: "all" | "selected"; judgeIds: string[]; projectIds: string[]; allowedTeamModes: string[] | null; categoryCount: number }
export type DistributionAssignment = { id: string; judgeId: string; projectId: string; prizeId: string | null; roundId: string | null; kind: string; complete: boolean; prizeIds: string[]; scopeMode: string }
export type DistributionSnapshot = { version: string; hackathonId: string; activeRoundId?: string | null; judges: DistributionJudge[]; projects: DistributionProject[]; prizes: DistributionPrize[]; assignments: DistributionAssignment[]; coreCategoryCount: number; closed: boolean }
export type PlannedAssignment = { judgeId: string; projectId: string; prizeId: string | null; roundId: string | null; kind: "per_prize" | "unified_weighted_score"; prizeIds: string[] }
export type JudgingDistributionPreview = {
  version: string
  targetReviewsPerProject: number
  assignments: PlannedAssignment[]
  coverage: { projectId: string; projectTitle: string; prizeId: string; prizeName: string; assigned: number; planned: number; target: number; eligibleJudges: number }[]
  workload: { judgeId: string; name: string; existing: number; added: number }[]
  warnings: string[]
}

function stableTie(value: string): number {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619)
  return hash >>> 0
}

export function canJudgePrize(judge: DistributionJudge, project: DistributionProject, prize: DistributionPrize): boolean {
  return !(judge.teamId && judge.teamId === project.teamId)
    && (!judge.roomIds?.length || (project.roomIds ?? (project.roomId ? [project.roomId] : [])).some((id) => judge.roomIds!.includes(id)))
    && (prize.judgeScope === "all" || prize.judgeIds.includes(judge.id))
    && (judge.prizeScope !== "selected" || !!judge.prizeIds?.includes(prize.id))
    && prize.projectIds.includes(project.id)
    && (!prize.allowedTeamModes?.length || (project.mode !== null && prize.allowedTeamModes.includes(project.mode)))
}

export function planJudgingDistribution(snapshot: DistributionSnapshot, targetReviewsPerProject = 3): JudgingDistributionPreview {
  if (!Number.isInteger(targetReviewsPerProject) || targetReviewsPerProject < 1 || targetReviewsPerProject > 20) throw new Error("Choose between 1 and 20 judges per project.")
  if (snapshot.closed) throw new Error("Judging assignments are closed for this event.")
  const prizes = snapshot.prizes.filter((prize) => ["weighted_score", "gate_check", "bucket_sort", "judges_pick"].includes(prize.style))
  const projects = new Map(snapshot.projects.map((project) => [project.id, project]))
  const judges = new Map(snapshot.judges.map((judge) => [judge.id, judge]))
  const planned: PlannedAssignment[] = []
  const work = new Map(snapshot.judges.map((judge) => [judge.id, { pending: 0, total: 0, existing: 0, added: 0 }]))
  const existingKeys = new Set<string>()
  const key = (judgeId: string, projectId: string, roundId: string | null, prizeId: string | null) => JSON.stringify([judgeId, projectId, roundId, prizeId])
  const coverage = prizes.flatMap((prize) => snapshot.projects.filter((project) => prize.projectIds.includes(project.id) && (!prize.allowedTeamModes?.length || (project.mode !== null && prize.allowedTeamModes.includes(project.mode)))).map((project) => {
    const eligible = snapshot.judges.filter((judge) => canJudgePrize(judge, project, prize))
    const assigned = new Set<string>()
    for (const assignment of snapshot.assignments) {
      const judge = judges.get(assignment.judgeId)
      if (!judge || assignment.projectId !== project.id || !canJudgePrize(judge, project, prize)) continue
      const covers = assignment.kind === "unified_weighted_score"
        ? prize.style === "weighted_score" && assignment.prizeIds.includes(prize.id)
        : assignment.prizeId === prize.id
      if (covers && assignment.roundId === prize.roundId) assigned.add(judge.id)
    }
    return { prize, project, eligible, assigned, initial: assigned.size, target: Math.min(targetReviewsPerProject, eligible.length) }
  }))
  for (const assignment of snapshot.assignments) {
    existingKeys.add(key(assignment.judgeId, assignment.projectId, assignment.roundId, assignment.kind === "unified_weighted_score" ? null : assignment.prizeId))
    const item = work.get(assignment.judgeId)
    if (!item) continue
    const categories = assignment.kind === "unified_weighted_score"
      ? Math.max(1, snapshot.coreCategoryCount + prizes.filter((prize) => assignment.prizeIds.includes(prize.id)).reduce((sum, prize) => sum + prize.categoryCount, 0))
      : Math.max(1, prizes.find((prize) => prize.id === assignment.prizeId)?.categoryCount ?? 1)
    item.total += categories
    item.existing++
    if (!assignment.complete) item.pending += categories
  }
  const warnings: string[] = []
  for (const slot of coverage) if (slot.eligible.length < targetReviewsPerProject) warnings.push(`${slot.project.title} has ${slot.eligible.length} eligible ${slot.eligible.length === 1 ? "judge" : "judges"} for ${slot.prize.name}; ${targetReviewsPerProject} requested.`)
  const ordered = [...coverage].sort((a, b) => a.eligible.length - b.eligible.length || a.initial - b.initial || a.prize.id.localeCompare(b.prize.id) || a.project.id.localeCompare(b.project.id))
  for (const slot of ordered) {
    while (slot.assigned.size < slot.target) {
      const candidates = slot.eligible.filter((judge) => !slot.assigned.has(judge.id) && !existingKeys.has(key(judge.id, slot.project.id, slot.prize.roundId, slot.prize.style === "weighted_score" ? null : slot.prize.id)))
      candidates.sort((a, b) => {
        const wa = work.get(a.id)!, wb = work.get(b.id)!
        return wa.pending - wb.pending || wa.total - wb.total || stableTie(`${snapshot.hackathonId}:${slot.prize.roundId}:${slot.project.id}:${a.id}`) - stableTie(`${snapshot.hackathonId}:${slot.prize.roundId}:${slot.project.id}:${b.id}`) || a.id.localeCompare(b.id)
      })
      const judge = candidates[0]
      if (!judge) {
        warnings.push(`${slot.project.title} needs more reviews for ${slot.prize.name}. Existing scorecards were kept unchanged.`)
        break
      }
      const weighted = slot.prize.style === "weighted_score"
      const covered = weighted ? prizes.filter((prize) => prize.style === "weighted_score" && prize.roundId === slot.prize.roundId && canJudgePrize(judge, slot.project, prize)) : [slot.prize]
      const item: PlannedAssignment = { judgeId: judge.id, projectId: slot.project.id, roundId: slot.prize.roundId, prizeId: weighted ? null : slot.prize.id, kind: weighted ? "unified_weighted_score" : "per_prize", prizeIds: covered.map((prize) => prize.id).sort() }
      planned.push(item)
      existingKeys.add(key(item.judgeId, item.projectId, item.roundId, item.prizeId))
      for (const other of coverage) if (other.project.id === slot.project.id && item.prizeIds.includes(other.prize.id)) other.assigned.add(judge.id)
      const load = work.get(judge.id)!
      const addedWork = Math.max(1, (weighted ? snapshot.coreCategoryCount : 0) + covered.reduce((sum, prize) => sum + prize.categoryCount, 0))
      load.pending += addedWork
      load.total += addedWork
      load.added++
    }
  }
  return { version: snapshot.version, targetReviewsPerProject, assignments: planned, coverage: coverage.map((slot) => ({ projectId: slot.project.id, projectTitle: projects.get(slot.project.id)!.title, prizeId: slot.prize.id, prizeName: slot.prize.name, assigned: slot.initial, planned: slot.assigned.size - slot.initial, target: slot.target, eligibleJudges: slot.eligible.length })), workload: snapshot.judges.map((judge) => ({ judgeId: judge.id, name: judge.name, existing: work.get(judge.id)!.existing, added: work.get(judge.id)!.added })), warnings: [...new Set(warnings)] }
}
