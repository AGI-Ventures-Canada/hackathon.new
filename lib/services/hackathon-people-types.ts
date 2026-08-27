export type PersonRole = "participant" | "judge" | "mentor" | "organizer"
export type PersonStatus = "accepted" | "pending"

export type Person = {
  id: string
  name: string | null
  email: string | null
  role: PersonRole
  status: PersonStatus
  teamId: string | null
  teamName: string | null
  isCaptain: boolean
  joinedOrInvitedAt: string
  remindedAt: string | null
  emailedAt: string | null
  notificationQueued: boolean
}

export const ROLE_LABEL: Record<PersonRole, string> = {
  participant: "Attendee",
  judge: "Judge",
  mentor: "Mentor",
  organizer: "Organizer",
}

export const STATUS_LABEL: Record<PersonStatus, string> = {
  accepted: "Accepted",
  pending: "Invited",
}
