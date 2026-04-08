import { supabase as getSupabase } from "@/lib/db/client"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Hackathon, HackathonParticipant } from "@/lib/db/hackathon-types"
import { sortByStartDate } from "@/lib/utils/format"
import { clerkClient } from "@clerk/nextjs/server"
import { trackEvent } from "@/lib/analytics/posthog"

type ParticipantWithHackathon = HackathonParticipant & {
  hackathons: Hackathon
}

export async function listParticipatingHackathons(
  clerkUserId: string,
  options?: { search?: string }
): Promise<(Hackathon & { role: string })[]> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data, error } = await client
    .from("hackathon_participants")
    .select("hackathon_id, role, hackathons(*)")
    .eq("clerk_user_id", clerkUserId)

  if (error) {
    console.error("Failed to list participating hackathons:", error)
    return []
  }

  let hackathons = (data as unknown as ParticipantWithHackathon[])
    .filter((r) => r.hackathons)
    .map((r) => ({ ...r.hackathons, role: r.role }))

  if (options?.search && options.search.length >= 2) {
    const q = options.search.toLowerCase()
    hackathons = hackathons.filter(
      (h) => h.name.toLowerCase().includes(q) || h.description?.toLowerCase().includes(q)
    )
  }

  return sortByStartDate(hackathons)
}

export async function listOrganizedHackathons(
  tenantId: string,
  options?: { search?: string }
): Promise<Hackathon[]> {
  const client = getSupabase() as unknown as SupabaseClient
  let query = client
    .from("hackathons")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("starts_at", { ascending: true, nullsFirst: false })

  if (options?.search && options.search.length >= 2) {
    const sanitized = options.search.replace(/[%_().,\\]/g, "")
    if (sanitized.length >= 2) {
      query = query.or(`name.ilike.%${sanitized}%,description.ilike.%${sanitized}%`)
    }
  }

  const { data, error } = await query

  if (error) {
    console.error("Failed to list organized hackathons:", error)
    return []
  }

  return data as unknown as Hackathon[]
}

type SponsorWithHackathon = {
  hackathon_id: string
  hackathons: Hackathon
}

export async function listSponsoredHackathons(
  tenantId: string,
  options?: { search?: string }
): Promise<Hackathon[]> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data, error } = await client
    .from("hackathon_sponsors")
    .select("hackathon_id, hackathons(*)")
    .eq("sponsor_tenant_id", tenantId)

  if (error) {
    console.error("Failed to list sponsored hackathons:", error)
    return []
  }

  let hackathons = (data as unknown as SponsorWithHackathon[])
    .filter((r) => r.hackathons)
    .map((r) => r.hackathons)

  if (options?.search && options.search.length >= 2) {
    const q = options.search.toLowerCase()
    hackathons = hackathons.filter(
      (h) => h.name.toLowerCase().includes(q) || h.description?.toLowerCase().includes(q)
    )
  }

  return sortByStartDate(hackathons)
}

export async function listJudgingHackathons(
  clerkUserId: string,
  options?: { search?: string }
): Promise<Hackathon[]> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data, error } = await client
    .from("hackathon_participants")
    .select("hackathon_id, role, hackathons(*)")
    .eq("clerk_user_id", clerkUserId)
    .eq("role", "judge")

  if (error) {
    console.error("Failed to list judging hackathons:", error)
    return []
  }

  let hackathons = (data as unknown as ParticipantWithHackathon[])
    .filter((r) => r.hackathons)
    .map((r) => r.hackathons)
    .filter((h) => h.status !== "draft")

  if (options?.search && options.search.length >= 2) {
    const q = options.search.toLowerCase()
    hackathons = hackathons.filter(
      (h) => h.name.toLowerCase().includes(q) || h.description?.toLowerCase().includes(q)
    )
  }

  return sortByStartDate(hackathons)
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

export type CreateHackathonInput = {
  name: string
  description?: string | null
}

export async function createHackathon(
  tenantId: string,
  input: CreateHackathonInput
): Promise<Hackathon | null> {
  const client = getSupabase() as unknown as SupabaseClient

  const baseSlug = generateSlug(input.name)
  let slug = baseSlug
  let attempt = 0

  while (attempt < 10) {
    const { data: existing } = await client
      .from("hackathons")
      .select("id")
      .eq("slug", slug)
      .maybeSingle()

    if (!existing) break
    attempt++
    slug = `${baseSlug}-${attempt}`
  }

  const { data, error } = await client
    .from("hackathons")
    .insert({
      tenant_id: tenantId,
      name: input.name,
      slug,
      description: input.description ?? null,
      status: "draft",
      min_team_size: 1,
      max_team_size: 5,
      allow_solo: true,
      metadata: {},
    })
    .select()
    .single()

  if (error) {
    console.error("Failed to create hackathon:", error)
    return null
  }

  trackEvent(tenantId, "hackathon.created", {
    hackathonId: data.id,
    name: input.name,
  })

  return data as unknown as Hackathon
}

export async function getHackathonById(
  hackathonId: string,
  tenantId: string
): Promise<Hackathon | null> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data, error } = await client
    .from("hackathons")
    .select("*")
    .eq("id", hackathonId)
    .eq("tenant_id", tenantId)
    .single()

  if (error) {
    console.error("Failed to get hackathon:", error)
    return null
  }

  return data as unknown as Hackathon
}

export async function isUserRegistered(
  hackathonId: string,
  clerkUserId: string
): Promise<boolean> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data, error } = await client
    .from("hackathon_participants")
    .select("id")
    .eq("hackathon_id", hackathonId)
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle()

  if (error) {
    console.error("Failed to check registration:", error)
    return false
  }

  return data !== null
}

export async function getParticipantCount(hackathonId: string): Promise<number> {
  const client = getSupabase() as unknown as SupabaseClient
  const { count, error } = await client
    .from("hackathon_participants")
    .select("*", { count: "exact", head: true })
    .eq("hackathon_id", hackathonId)
    .eq("role", "participant")

  if (error) {
    console.error("Failed to get participant count:", error)
    return 0
  }

  return count ?? 0
}

export type RegistrationInfo = {
  isRegistered: boolean
  participantId: string | null
  participantRole: string | null
  participantCount: number
}

export async function getRegistrationInfo(
  hackathonId: string,
  clerkUserId: string
): Promise<RegistrationInfo> {
  const client = getSupabase() as unknown as SupabaseClient

  const [registrationResult, countResult] = await Promise.all([
    client
      .from("hackathon_participants")
      .select("id, role")
      .eq("hackathon_id", hackathonId)
      .eq("clerk_user_id", clerkUserId)
      .maybeSingle(),
    client
      .from("hackathon_participants")
      .select("*", { count: "exact", head: true })
      .eq("hackathon_id", hackathonId)
      .eq("role", "participant"),
  ])

  if (registrationResult.error) {
    console.error("Failed to check registration:", registrationResult.error)
  }
  if (countResult.error) {
    console.error("Failed to get participant count:", countResult.error)
  }

  return {
    isRegistered: registrationResult.data !== null,
    participantId: registrationResult.data?.id ?? null,
    participantRole: registrationResult.data?.role ?? null,
    participantCount: countResult.count ?? 0,
  }
}

type RegisterResult =
  | { success: true; participantId: string; teamId: string }
  | { success: false; error: string; code: string }

export async function registerForHackathon(
  hackathonId: string,
  clerkUserId: string,
  teamName?: string
): Promise<RegisterResult> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data, error } = await client.rpc("register_for_hackathon", {
    p_hackathon_id: hackathonId,
    p_clerk_user_id: clerkUserId,
    p_team_name: teamName ?? null,
  })

  if (error) {
    console.error("Failed to register for hackathon:", error)
    return { success: false, error: "Failed to register", code: "rpc_failed" }
  }

  const result = data?.[0]
  if (!result) {
    return { success: false, error: "Failed to register", code: "no_result" }
  }

  if (result.success) {
    trackEvent(clerkUserId, "hackathon.registered", {
      hackathonId,
      participantId: result.participant_id,
      teamId: result.team_id,
    })
    return { success: true, participantId: result.participant_id, teamId: result.team_id }
  }

  return {
    success: false,
    error: result.error_message || "Failed to register",
    code: result.error_code || "unknown",
  }
}

export type TeamMember = {
  clerkUserId: string
  displayName: string | null
  email: string | null
  role: "participant" | "judge" | "mentor" | "organizer"
  isCaptain: boolean
  registeredAt: string
}

export type ParticipantTeamInfo = {
  team: {
    id: string
    name: string
    status: "forming" | "locked" | "disbanded"
    inviteCode: string
    captainClerkUserId: string
  }
  members: TeamMember[]
  pendingInvitations: {
    id: string
    email: string
    expiresAt: string
    createdAt: string
  }[]
  isCaptain: boolean
} | null

export async function getParticipantTeamInfo(
  hackathonId: string,
  clerkUserId: string
): Promise<ParticipantTeamInfo> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: participant } = await client
    .from("hackathon_participants")
    .select("team_id")
    .eq("hackathon_id", hackathonId)
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle()

  if (!participant?.team_id) {
    return null
  }

  const [teamResult, membersResult, invitationsResult] = await Promise.all([
    client
      .from("teams")
      .select("id, name, status, invite_code, captain_clerk_user_id")
      .eq("id", participant.team_id)
      .single(),
    client
      .from("hackathon_participants")
      .select("clerk_user_id, role, registered_at")
      .eq("team_id", participant.team_id)
      .order("registered_at", { ascending: true }),
    client
      .from("team_invitations")
      .select("id, email, expires_at, created_at")
      .eq("team_id", participant.team_id)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
  ])

  if (teamResult.error || !teamResult.data) {
    console.error("Failed to get team:", teamResult.error)
    return null
  }

  const team = teamResult.data
  const memberData = membersResult.data ?? []

  const memberUserIds = memberData.map((m) => m.clerk_user_id)
  const userDisplayNames: Record<string, string | null> = {}
  const userEmails: Record<string, string | null> = {}

  if (memberUserIds.length > 0) {
    try {
      const client = await clerkClient()
      const users = await client.users.getUserList({ userId: memberUserIds })
      for (const user of users.data) {
        const displayName = user.firstName
          ? `${user.firstName}${user.lastName ? ` ${user.lastName}` : ""}`
          : user.username || null
        userDisplayNames[user.id] = displayName
        userEmails[user.id] = user.emailAddresses[0]?.emailAddress ?? null
      }
    } catch {
      // Silently fail - displayName/email will be null
    }
  }

  const members = memberData.map((m) => ({
    clerkUserId: m.clerk_user_id,
    displayName: userDisplayNames[m.clerk_user_id] || null,
    email: userEmails[m.clerk_user_id] || null,
    role: m.role as TeamMember["role"],
    isCaptain: m.clerk_user_id === team.captain_clerk_user_id,
    registeredAt: m.registered_at,
  }))

  const pendingInvitations = (invitationsResult.data ?? []).map((inv) => ({
    id: inv.id,
    email: inv.email,
    expiresAt: inv.expires_at,
    createdAt: inv.created_at,
  }))

  return {
    team: {
      id: team.id,
      name: team.name,
      status: team.status,
      inviteCode: team.invite_code,
      captainClerkUserId: team.captain_clerk_user_id,
    },
    members,
    pendingInvitations,
    isCaptain: team.captain_clerk_user_id === clerkUserId,
  }
}

export type TeamWithMembers = {
  id: string
  name: string
  status: string
  captainClerkUserId: string | null
  pendingCaptainEmail: string | null
  members: { clerkUserId: string; displayName: string | null; email: string | null; role: string }[]
  submission: { id: string; title: string; status: string } | null
  room: { id: string; name: string } | null
}

export async function listTeamsWithMembers(hackathonId: string): Promise<TeamWithMembers[]> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: teams, error: teamsErr } = await client
    .from("teams")
    .select("id, name, status, captain_clerk_user_id, pending_captain_email")
    .eq("hackathon_id", hackathonId)
    .neq("status", "disbanded")
    .order("name")

  if (teamsErr || !teams || teams.length === 0) return []

  const teamIds = teams.map((t: { id: string }) => t.id)

  const [{ data: participants }, { data: submissions }, { data: roomTeams }] = await Promise.all([
    client
      .from("hackathon_participants")
      .select("clerk_user_id, role, team_id")
      .eq("hackathon_id", hackathonId)
      .in("team_id", teamIds),
    client
      .from("submissions")
      .select("id, title, status, team_id")
      .eq("hackathon_id", hackathonId)
      .in("team_id", teamIds),
    client
      .from("room_teams")
      .select("team_id, room_id, rooms(id, name)")
      .in("team_id", teamIds),
  ])

  const submissionByTeam: Record<string, { id: string; title: string; status: string }> = {}
  for (const s of submissions ?? []) {
    if (s.team_id) submissionByTeam[s.team_id] = { id: s.id, title: s.title, status: s.status }
  }

  const roomByTeam: Record<string, { id: string; name: string }> = {}
  for (const rt of roomTeams ?? []) {
    const room = rt.rooms as unknown as { id: string; name: string } | null
    if (rt.team_id && room) roomByTeam[rt.team_id] = { id: room.id, name: room.name }
  }

  const allUserIds = [...new Set((participants ?? []).map((p: { clerk_user_id: string }) => p.clerk_user_id))]
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
        // Silently fail
      }
    }
  }

  return teams.map((team: { id: string; name: string; status: string; captain_clerk_user_id: string | null; pending_captain_email: string | null }) => ({
    id: team.id,
    name: team.name,
    status: team.status,
    captainClerkUserId: team.captain_clerk_user_id,
    pendingCaptainEmail: team.pending_captain_email || null,
    members: (participants ?? [])
      .filter((p: { team_id: string }) => p.team_id === team.id)
      .map((p: { clerk_user_id: string; role: string }) => ({
        clerkUserId: p.clerk_user_id,
        displayName: userDisplayNames[p.clerk_user_id] || null,
        email: userEmails[p.clerk_user_id] || null,
        role: p.role,
      })),
    submission: submissionByTeam[team.id] ?? null,
    room: roomByTeam[team.id] ?? null,
  }))
}

export type CreateTeamResult =
  | { team: { id: string; name: string }; invited?: undefined }
  | { team: { id: string; name: string }; invited: true }
  | { error: string }

export async function createTeamWithMembers(
  hackathonId: string,
  input: { name: string; captainEmail: string; organizerClerkUserId?: string }
): Promise<CreateTeamResult> {
  const { clerkClient: getClerk } = await import("@clerk/nextjs/server")
  const clerk = await getClerk()
  const users = await clerk.users.getUserList({ emailAddress: [input.captainEmail], limit: 1 })

  const client = getSupabase() as unknown as SupabaseClient

  if (users.data.length === 0) {
    return createPendingTeamWithInvite(client, clerk, hackathonId, input)
  }

  const captainClerkUserId = users.data[0].id

  const { data: participant } = await client
    .from("hackathon_participants")
    .select("id, team_id")
    .eq("hackathon_id", hackathonId)
    .eq("clerk_user_id", captainClerkUserId)
    .single()

  if (!participant) {
    return { error: "That user is not registered for this hackathon" }
  }
  if (participant.team_id) {
    return { error: "That user is already on a team" }
  }

  const { data: team, error } = await client
    .from("teams")
    .insert({
      hackathon_id: hackathonId,
      name: input.name,
      captain_clerk_user_id: captainClerkUserId,
      invite_code: crypto.randomUUID().slice(0, 8),
      status: "forming",
    })
    .select("id, name")
    .single()

  if (error) {
    console.error("Failed to create team:", error)
    return { error: "Failed to create team" }
  }

  await client
    .from("hackathon_participants")
    .update({ team_id: team.id })
    .eq("hackathon_id", hackathonId)
    .eq("clerk_user_id", captainClerkUserId)

  return { team }
}

async function createPendingTeamWithInvite(
  client: SupabaseClient,
  clerk: Awaited<ReturnType<typeof import("@clerk/nextjs/server").clerkClient>>,
  hackathonId: string,
  input: { name: string; captainEmail: string; organizerClerkUserId?: string }
): Promise<CreateTeamResult> {
  const { data: hackathon } = await client
    .from("hackathons")
    .select("name")
    .eq("id", hackathonId)
    .single()

  if (!hackathon) {
    return { error: "Hackathon not found" }
  }

  let inviterName = "The organizer"
  if (input.organizerClerkUserId) {
    try {
      const organizer = await clerk.users.getUser(input.organizerClerkUserId)
      if (organizer.firstName) {
        inviterName = organizer.firstName + (organizer.lastName ? ` ${organizer.lastName}` : "")
      }
    } catch {
      // fallback to default
    }
  }

  const { data: team, error: teamError } = await client
    .from("teams")
    .insert({
      hackathon_id: hackathonId,
      name: input.name,
      captain_clerk_user_id: null,
      pending_captain_email: input.captainEmail.toLowerCase(),
      invite_code: crypto.randomUUID().slice(0, 8),
      status: "forming",
    })
    .select("id, name")
    .single()

  if (teamError) {
    console.error("Failed to create pending team:", teamError)
    return { error: "Failed to create team" }
  }

  const { randomBytes } = await import("crypto")
  const token = randomBytes(32).toString("base64url")
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  const { error: inviteError } = await client
    .from("team_invitations")
    .insert({
      team_id: team.id,
      hackathon_id: hackathonId,
      email: input.captainEmail.toLowerCase(),
      token,
      invited_by_clerk_user_id: input.organizerClerkUserId || "system",
      status: "pending",
      expires_at: expiresAt,
      is_captain_invite: true,
    })

  if (inviteError) {
    console.error("Failed to create captain invitation:", inviteError)
    await client.from("teams").delete().eq("id", team.id)
    return { error: "Failed to send invitation" }
  }

  const { sendTeamInvitationEmail } = await import("@/lib/email/team-invitations")
  await sendTeamInvitationEmail({
    to: input.captainEmail.toLowerCase(),
    teamName: input.name,
    hackathonName: hackathon.name,
    inviterName,
    inviteToken: token,
    expiresAt,
  })

  return { team, invited: true }
}

export async function modifyTeamMembers(
  teamId: string,
  hackathonId: string,
  changes: { add?: string[]; remove?: string[] }
): Promise<boolean> {
  const client = getSupabase() as unknown as SupabaseClient

  if (changes.add && changes.add.length > 0) {
    for (const clerkUserId of changes.add) {
      await client
        .from("hackathon_participants")
        .update({ team_id: teamId })
        .eq("hackathon_id", hackathonId)
        .eq("clerk_user_id", clerkUserId)
    }
  }

  if (changes.remove && changes.remove.length > 0) {
    for (const clerkUserId of changes.remove) {
      await client
        .from("hackathon_participants")
        .update({ team_id: null })
        .eq("hackathon_id", hackathonId)
        .eq("clerk_user_id", clerkUserId)
    }
  }

  return true
}

export async function bulkAssignTeams(
  hackathonId: string,
  assignments: { teamId: string; roomId: string }[]
): Promise<{ success: boolean; assignedCount: number }> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data, error } = await client.rpc("bulk_assign_teams", {
    p_hackathon_id: hackathonId,
    p_assignments: assignments,
  })

  if (error) {
    console.error("Failed to bulk assign teams:", error)
    return { success: false, assignedCount: 0 }
  }

  const result = Array.isArray(data) ? data[0] : data
  return {
    success: result?.success ?? false,
    assignedCount: result?.assigned_count ?? 0,
  }
}
