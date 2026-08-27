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
  if (!nowIso) return false

  const now = new Date(nowIso).getTime()
  if (!Number.isFinite(now)) return false
  if (!["published", "registration_open", "active"].includes(hackathonStatus ?? "")) {
    return false
  }

  const eventStartsAt = startsAt ? new Date(startsAt).getTime() : null
  const eventEndsAt = endsAt ? new Date(endsAt).getTime() : null
  if (eventStartsAt !== null && !Number.isFinite(eventStartsAt)) return false
  if (eventEndsAt !== null && !Number.isFinite(eventEndsAt)) return false
  if (eventEndsAt !== null && now >= eventEndsAt) return false
  if (!registrationClosesAt) return true

  const registrationCloses = new Date(registrationClosesAt).getTime()
  if (!Number.isFinite(registrationCloses)) return false
  if (registrationCloses > now) return true

  const canInviteLate = Boolean(
    allowLateRegistration &&
    eventStartsAt !== null &&
    now >= eventStartsAt &&
    (eventEndsAt === null || now < eventEndsAt)
  )

  return canInviteLate
}
