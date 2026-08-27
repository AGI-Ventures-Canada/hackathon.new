import { supabase as getSupabase } from "@/lib/db/client"
import { isValidUuid } from "@/lib/utils/uuid"
import { resolveClerkUsers } from "./clerk-users"
import { ROLE_LABEL, STATUS_LABEL, type Person, type PersonRole } from "./hackathon-people-types"

export { ROLE_LABEL, STATUS_LABEL }
export type { Person, PersonRole, PersonStatus } from "./hackathon-people-types"

type ParticipantRow = {
  id: string
  clerk_user_id: string
  role: PersonRole
  team_id: string | null
  registered_at: string
}

type TeamRow = {
  id: string
  name: string
  captain_clerk_user_id: string | null
}

type TeamInvitationRow = {
  id: string
  team_id: string
  email: string
  created_at: string
  reminded_at: string | null
  emailed_at: string | null
}

type JudgeInvitationRow = {
  id: string
  email: string
  created_at: string
  reminded_at: string | null
  emailed_at: string | null
}

type JudgePendingNotificationRow = {
  participant_id: string
}

const PEOPLE_ROLES: PersonRole[] = ["participant", "judge", "mentor", "organizer"]

export async function listHackathonPeople(hackathonId: string): Promise<Person[]> {
  if (!isValidUuid(hackathonId)) return []

  const client = getSupabase()

  const [participantsRes, teamsRes, teamInvitesRes, judgeInvitesRes, judgeNotificationsRes] = await Promise.all([
    client
      .from("hackathon_participants")
      .select("id, clerk_user_id, role, team_id, registered_at")
      .eq("hackathon_id", hackathonId)
      .in("role", PEOPLE_ROLES),
    client
      .from("teams")
      .select("id, name, captain_clerk_user_id")
      .eq("hackathon_id", hackathonId),
    client
      .from("team_invitations")
      .select("id, team_id, email, created_at, reminded_at, emailed_at")
      .eq("hackathon_id", hackathonId)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString()),
    client
      .from("judge_invitations")
      .select("id, email, created_at, reminded_at, emailed_at")
      .eq("hackathon_id", hackathonId)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString()),
    client
      .from("judge_pending_notifications")
      .select("participant_id")
      .eq("hackathon_id", hackathonId)
      .is("sent_at", null),
  ])

  if (participantsRes.error) console.error("Failed to load hackathon_participants:", participantsRes.error)
  if (teamsRes.error) console.error("Failed to load teams:", teamsRes.error)
  if (teamInvitesRes.error) console.error("Failed to load team_invitations:", teamInvitesRes.error)
  if (judgeInvitesRes.error) console.error("Failed to load judge_invitations:", judgeInvitesRes.error)
  if (judgeNotificationsRes.error) console.error("Failed to load judge_pending_notifications:", judgeNotificationsRes.error)

  const participants = (participantsRes.data ?? []) as ParticipantRow[]
  const teams = (teamsRes.data ?? []) as TeamRow[]
  const teamInvites = (teamInvitesRes.data ?? []) as TeamInvitationRow[]
  const judgeInvites = (judgeInvitesRes.data ?? []) as JudgeInvitationRow[]
  const queuedJudgeParticipantIds = new Set(
    ((judgeNotificationsRes.data ?? []) as JudgePendingNotificationRow[])
      .map((notification) => notification.participant_id),
  )

  const teamById: Record<string, TeamRow> = {}
  for (const t of teams) teamById[t.id] = t

  const allUserIds = [...new Set(participants.map((p) => p.clerk_user_id))]
  const { displayNames: userDisplayNames, emails: userEmails } =
    await resolveClerkUsers(allUserIds)

  const acceptedEmails = new Set<string>()
  const accepted: Person[] = participants.map((p) => {
    const team = p.team_id ? teamById[p.team_id] ?? null : null
    const email = userEmails[p.clerk_user_id] ?? null
    if (email) acceptedEmails.add(email.trim().toLowerCase())
    return {
      id: p.id,
      name: userDisplayNames[p.clerk_user_id] ?? null,
      email,
      role: p.role,
      status: "accepted",
      teamId: team?.id ?? null,
      teamName: team?.name ?? null,
      isCaptain: team !== null && team.captain_clerk_user_id === p.clerk_user_id,
      joinedOrInvitedAt: p.registered_at,
      remindedAt: null,
      emailedAt: null,
      notificationQueued: queuedJudgeParticipantIds.has(p.id),
    }
  })

  const pending: Person[] = []

  for (const inv of teamInvites) {
    if (acceptedEmails.has(inv.email.trim().toLowerCase())) continue
    const team = teamById[inv.team_id] ?? null
    pending.push({
      id: `team_invitation:${inv.id}`,
      name: null,
      email: inv.email,
      role: "participant",
      status: "pending",
      teamId: team?.id ?? null,
      teamName: team?.name ?? null,
      isCaptain: false,
      joinedOrInvitedAt: inv.created_at,
      remindedAt: inv.reminded_at,
      emailedAt: inv.emailed_at,
      notificationQueued: false,
    })
  }

  for (const inv of judgeInvites) {
    if (acceptedEmails.has(inv.email.trim().toLowerCase())) continue
    pending.push({
      id: `judge_invitation:${inv.id}`,
      name: null,
      email: inv.email,
      role: "judge",
      status: "pending",
      teamId: null,
      teamName: null,
      isCaptain: false,
      joinedOrInvitedAt: inv.created_at,
      remindedAt: inv.reminded_at,
      emailedAt: inv.emailed_at,
      notificationQueued: false,
    })
  }

  const byTimeDesc = (a: Person, b: Person) =>
    b.joinedOrInvitedAt.localeCompare(a.joinedOrInvitedAt)

  accepted.sort(byTimeDesc)
  pending.sort(byTimeDesc)

  return [...accepted, ...pending]
}

export type PeopleCsvRow = {
  Name: string
  Email: string
  Role: string
  Status: string
  Team: string
  Captain: string
  "Joined or invited at": string
}

export function peopleToCsvRows(people: Person[]): PeopleCsvRow[] {
  return people.map((p) => ({
    Name: p.name ?? "",
    Email: p.email ?? "",
    Role: ROLE_LABEL[p.role],
    Status: STATUS_LABEL[p.status],
    Team: p.teamName ?? "",
    Captain: p.isCaptain ? "Yes" : "No",
    "Joined or invited at": p.joinedOrInvitedAt,
  }))
}
