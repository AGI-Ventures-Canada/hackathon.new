interface CanInviteTeamMembersInput {
  isFormingCaptain: boolean | null | undefined
  registrationClosesAt: string | null | undefined
  nowIso: string | null
}

export function canInviteTeamMembers({
  isFormingCaptain,
  registrationClosesAt,
  nowIso,
}: CanInviteTeamMembersInput): boolean {
  if (!isFormingCaptain) return false
  if (!registrationClosesAt) return true
  if (!nowIso) return false

  return new Date(registrationClosesAt).getTime() > new Date(nowIso).getTime()
}
