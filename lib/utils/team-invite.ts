interface CanInviteTeamMembersInput {
  canRenameTeam: boolean | null | undefined
  registrationClosesAt: string | null | undefined
  nowIso: string | null
}

export function canInviteTeamMembers({
  canRenameTeam,
  registrationClosesAt,
  nowIso,
}: CanInviteTeamMembersInput): boolean {
  if (!canRenameTeam) return false
  if (!registrationClosesAt) return true
  if (!nowIso) return false

  return new Date(registrationClosesAt).getTime() > new Date(nowIso).getTime()
}
