import type { JudgeAssignmentForJudge } from "@/lib/services/judging"

export type JudgeReviewTask = { id: string; title: string; prizeName: string | null; assignmentIds: string[]; ballot: boolean; isComplete: boolean; started: boolean; projectCount: number }

export function buildJudgeReviewTasks(assignments: JudgeAssignmentForJudge[], draftTargetIds: string[] = []): JudgeReviewTask[] {
  const drafts = new Set(draftTargetIds)
  const tasks = new Map<string, JudgeReviewTask>()
  for (const assignment of assignments) {
    if (assignment.selfJudging) continue
    const ballot = assignment.judgingStyle === "judges_pick" && Boolean(assignment.prizeId)
    const id = ballot ? assignment.prizeId! : assignment.id
    const existing = tasks.get(id)
    if (existing) { existing.assignmentIds.push(assignment.id); existing.projectCount += 1; existing.isComplete &&= assignment.isComplete; continue }
    tasks.set(id, { id, title: ballot ? `Pick your favorites for ${assignment.prizeName || "this prize"}` : assignment.submissionTitle, prizeName: assignment.prizeName, assignmentIds: [assignment.id], ballot, isComplete: assignment.isComplete, started: drafts.has(id) || Boolean(assignment.notes || assignment.viewedAt), projectCount: 1 })
  }
  return [...tasks.values()]
}

export function countActionableJudgeReviews(assignments: Array<{id: string; isComplete: boolean; prizeId: string | null; judgingStyle: string | null; selfJudging?: boolean}>): number {
  const reviews = new Map<string, boolean>()
  for (const assignment of assignments) {
    if (assignment.selfJudging) continue
    const id = assignment.judgingStyle === "judges_pick" && assignment.prizeId ? assignment.prizeId : assignment.id
    reviews.set(id, (reviews.get(id) ?? true) && assignment.isComplete)
  }
  return [...reviews.values()].filter((complete) => !complete).length
}
