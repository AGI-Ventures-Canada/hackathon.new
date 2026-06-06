interface CanInviteTeamMembersInput {
  isFormingCaptain: boolean | null | undefined
  hackathonStatus?: string | null | undefined
  startsAt?: string | null | undefined
  endsAt?: string | null | undefined
  registrationClosesAt: string | null | undefined
  allowLateRegistration?: boolean | null | undefined
  nowIso: string | null
}

export function canInviteTeamMembers({
  isFormingCaptain,
  hackathonStatus,
  startsAt,
  endsAt,
  registrationClosesAt,
  allowLateRegistration = true,
  nowIso,
}: CanInviteTeamMembersInput): boolean {
  if (!isFormingCaptain) return false
  if (!registrationClosesAt) return true
  if (!nowIso) return false

  const now = new Date(nowIso).getTime()
  const eventStartsAt = startsAt ? new Date(startsAt).getTime() : null
  const eventEndsAt = endsAt ? new Date(endsAt).getTime() : null
  const canInviteLate = Boolean(
    allowLateRegistration &&
    eventStartsAt &&
    now >= eventStartsAt &&
    (!eventEndsAt || now <= eventEndsAt) &&
    ["published", "registration_open", "active"].includes(hackathonStatus ?? "")
  )

  if (canInviteLate) return true

  return new Date(registrationClosesAt).getTime() > new Date(nowIso).getTime()
}
