import { supabase as getSupabase } from "@/lib/db/client"
import type { SupabaseClient } from "@supabase/supabase-js"
import { clerkClient } from "@clerk/nextjs/server"

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
}

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
}

type JudgeInvitationRow = {
  id: string
  email: string
  created_at: string
}

const PEOPLE_ROLES: PersonRole[] = ["participant", "judge", "mentor", "organizer"]

export async function listHackathonPeople(hackathonId: string): Promise<Person[]> {
  const client = getSupabase() as unknown as SupabaseClient

  const [participantsRes, teamsRes, teamInvitesRes, judgeInvitesRes] = await Promise.all([
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
      .select("id, team_id, email, created_at")
      .eq("hackathon_id", hackathonId)
      .eq("status", "pending"),
    client
      .from("judge_invitations")
      .select("id, email, created_at")
      .eq("hackathon_id", hackathonId)
      .eq("status", "pending"),
  ])

  const participants = (participantsRes.data ?? []) as ParticipantRow[]
  const teams = (teamsRes.data ?? []) as TeamRow[]
  const teamInvites = (teamInvitesRes.data ?? []) as TeamInvitationRow[]
  const judgeInvites = (judgeInvitesRes.data ?? []) as JudgeInvitationRow[]

  const teamById: Record<string, TeamRow> = {}
  for (const t of teams) teamById[t.id] = t

  const allUserIds = [...new Set(participants.map((p) => p.clerk_user_id))]
  const userDisplayNames: Record<string, string | null> = {}
  const userEmails: Record<string, string | null> = {}

  if (allUserIds.length > 0) {
    const realUserIds = allUserIds.filter((id) => !id.startsWith("seed_user_"))
    const seedUserIds = allUserIds.filter((id) => id.startsWith("seed_user_"))

    for (const seedId of seedUserIds) {
      const name = seedId.replace(/^seed_user_/, "").replace(/_\d+$/, "")
      userDisplayNames[seedId] = name.charAt(0).toUpperCase() + name.slice(1)
      userEmails[seedId] = `${name}@seed.local`
    }

    if (realUserIds.length > 0) {
      try {
        const clerk = await clerkClient()
        for (let i = 0; i < realUserIds.length; i += 100) {
          const batch = realUserIds.slice(i, i + 100)
          const users = await clerk.users.getUserList({ userId: batch })
          for (const user of users.data) {
            userDisplayNames[user.id] = user.firstName
              ? `${user.firstName}${user.lastName ? ` ${user.lastName}` : ""}`
              : user.username || null
            userEmails[user.id] = user.emailAddresses[0]?.emailAddress ?? null
          }
        }
      } catch {
        // Clerk lookup failed; rows still render with null name/email
      }
    }
  }

  const acceptedEmails = new Set<string>()
  const accepted: Person[] = participants.map((p) => {
    const team = p.team_id ? teamById[p.team_id] ?? null : null
    const email = userEmails[p.clerk_user_id] ?? null
    if (email) acceptedEmails.add(email.toLowerCase())
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
    }
  })

  const pending: Person[] = []

  for (const inv of teamInvites) {
    if (acceptedEmails.has(inv.email.toLowerCase())) continue
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
    })
  }

  for (const inv of judgeInvites) {
    if (acceptedEmails.has(inv.email.toLowerCase())) continue
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
    })
  }

  const byTimeDesc = (a: Person, b: Person) =>
    b.joinedOrInvitedAt.localeCompare(a.joinedOrInvitedAt)

  accepted.sort(byTimeDesc)
  pending.sort(byTimeDesc)

  return [...accepted, ...pending]
}

const ROLE_LABEL: Record<PersonRole, string> = {
  participant: "Attendee",
  judge: "Judge",
  mentor: "Mentor",
  organizer: "Organizer",
}

const STATUS_LABEL: Record<PersonStatus, string> = {
  accepted: "Accepted",
  pending: "Invited",
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
