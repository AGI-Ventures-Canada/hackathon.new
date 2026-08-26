export function canRegisterNow({
  status,
  startsAt,
  endsAt,
  opensAt,
  closesAt,
  allowLate,
  atCapacity,
  now = Date.now(),
}: {
  status: string
  startsAt: string | null
  endsAt: string | null
  opensAt: string | null
  closesAt: string | null
  allowLate: boolean
  atCapacity: boolean
  now?: number
}): boolean {
  if (atCapacity || ["draft", "archived", "completed", "judging"].includes(status)) return false
  if (endsAt && now > new Date(endsAt).getTime()) return false
  if (opensAt && now < new Date(opensAt).getTime()) return false
  if (!closesAt || now <= new Date(closesAt).getTime()) {
    return ["published", "registration_open", "active"].includes(status)
  }
  return Boolean(
    allowLate &&
    startsAt &&
    now >= new Date(startsAt).getTime() &&
    (!endsAt || now <= new Date(endsAt).getTime()) &&
    ["published", "registration_open", "active"].includes(status),
  )
}
