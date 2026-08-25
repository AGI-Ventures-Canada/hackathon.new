import type { PrizeJudgingStyle } from "@/lib/db/hackathon-types"

type RoutableAssignment = {
  prizeId: string | null
  judgingStyle: PrizeJudgingStyle | null
}

export type JudgeAssignmentRoutes<T extends RoutableAssignment> = {
  scored: T[]
  bucketGroups: [string, T[]][]
  gateGroups: [string, T[]][]
  pickGroups: [string, T[]][]
}

function addToPrizeGroup<T>(groups: Map<string, T[]>, prizeId: string, assignment: T) {
  const group = groups.get(prizeId) ?? []
  group.push(assignment)
  groups.set(prizeId, group)
}

export function routeJudgeAssignments<T extends RoutableAssignment>(
  assignments: T[]
): JudgeAssignmentRoutes<T> {
  const scored: T[] = []
  const bucketGroups = new Map<string, T[]>()
  const gateGroups = new Map<string, T[]>()
  const pickGroups = new Map<string, T[]>()

  for (const assignment of assignments) {
    if (assignment.judgingStyle === null || assignment.judgingStyle === "weighted_score") {
      scored.push(assignment)
    } else if (assignment.judgingStyle === "bucket_sort" && assignment.prizeId) {
      addToPrizeGroup(bucketGroups, assignment.prizeId, assignment)
    } else if (assignment.judgingStyle === "gate_check" && assignment.prizeId) {
      addToPrizeGroup(gateGroups, assignment.prizeId, assignment)
    } else if (assignment.judgingStyle === "judges_pick" && assignment.prizeId) {
      addToPrizeGroup(pickGroups, assignment.prizeId, assignment)
    }
  }

  return {
    scored,
    bucketGroups: [...bucketGroups.entries()],
    gateGroups: [...gateGroups.entries()],
    pickGroups: [...pickGroups.entries()],
  }
}
