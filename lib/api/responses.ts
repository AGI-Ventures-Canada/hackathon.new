export type RouteSet = { status?: number | string }

export function pendingTeamApprovalResponse(set: RouteSet) {
  set.status = 409
  return {
    error: "Your team is waiting for approval.",
    code: "team_pending_approval" as const,
  }
}
