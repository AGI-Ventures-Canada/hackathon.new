import { supabase as getSupabase } from "@/lib/db/client"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { PersonRole } from "./hackathon-people-types"
import { isValidUuid } from "@/lib/utils/uuid"

const LOCKED_STATUSES = new Set(["judging", "completed", "archived"])

type ParticipantRow = {
  id: string
  hackathon_id: string
  clerk_user_id: string
  role: PersonRole
  team_id: string | null
  registered_at: string
  hackathonStatus: string | null
}

async function fetchParticipant(
  client: SupabaseClient,
  participantId: string,
  hackathonId: string
): Promise<ParticipantRow | null> {
  const { data, error } = await client
    .from("hackathon_participants")
    .select("id, hackathon_id, clerk_user_id, role, team_id, registered_at, hackathons(status)")
    .eq("id", participantId)
    .eq("hackathon_id", hackathonId)
    .maybeSingle()

  if (error) {
    console.error("Failed to load participant:", error)
    return null
  }
  if (!data) return null
  const row = data as unknown as {
    id: string
    hackathon_id: string
    clerk_user_id: string
    role: PersonRole
    team_id: string | null
    registered_at: string
    hackathons?: { status?: string } | Array<{ status?: string }> | null
  }
  const joined = Array.isArray(row.hackathons) ? row.hackathons[0] : row.hackathons
  return {
    id: row.id,
    hackathon_id: row.hackathon_id,
    clerk_user_id: row.clerk_user_id,
    role: row.role,
    team_id: row.team_id,
    registered_at: row.registered_at,
    hackathonStatus: joined?.status ?? null,
  }
}

type PromoteCaptainResult = { ok: true; successor: string | null } | { ok: false }

async function promoteNextCaptain(
  client: SupabaseClient,
  teamId: string,
  excludeClerkUserId: string,
): Promise<PromoteCaptainResult> {
  const { data: candidates, error } = await client
    .from("hackathon_participants")
    .select("clerk_user_id, registered_at")
    .eq("team_id", teamId)
    .neq("clerk_user_id", excludeClerkUserId)
    .order("registered_at", { ascending: true })
    .limit(1)

  if (error) {
    console.error("Failed to find captain successor:", error)
    return { ok: false }
  }

  const next = candidates?.[0] as { clerk_user_id: string } | undefined
  const successor = next?.clerk_user_id ?? null

  const { error: updateErr } = await client
    .from("teams")
    .update({
      captain_clerk_user_id: successor,
      pending_captain_email: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", teamId)

  if (updateErr) {
    console.error("Failed to reassign captain:", updateErr)
    return { ok: false }
  }

  return { ok: true, successor }
}

async function isCaptainOf(client: SupabaseClient, teamId: string, clerkUserId: string): Promise<boolean> {
  const { data } = await client
    .from("teams")
    .select("captain_clerk_user_id")
    .eq("id", teamId)
    .maybeSingle()
  return ((data as { captain_clerk_user_id: string | null } | null)?.captain_clerk_user_id ?? null) === clerkUserId
}

async function deleteJudgeAssignments(client: SupabaseClient, participantId: string): Promise<void> {
  const [assignmentsRes, roomsRes] = await Promise.all([
    client.from("judge_assignments").delete().eq("judge_participant_id", participantId),
    client.from("judge_room_assignments").delete().eq("judge_participant_id", participantId),
  ])
  if (assignmentsRes.error) console.error("Failed to clear judge_assignments:", assignmentsRes.error)
  if (roomsRes.error) console.error("Failed to clear judge_room_assignments:", roomsRes.error)
}

export type AssignTeamResult =
  | { success: true; teamId: string | null; capacityHandedOff: boolean }
  | { error: string; code: "not_found" | "team_not_found" | "team_full" | "status_locked" | "failed" }

export async function assignParticipantToTeam(
  participantId: string,
  hackathonId: string,
  newTeamId: string | null,
): Promise<AssignTeamResult> {
  const client = getSupabase() as unknown as SupabaseClient
  const participant = await fetchParticipant(client, participantId, hackathonId)
  if (!participant) return { error: "Person not found", code: "not_found" }
  if (participant.hackathonStatus && LOCKED_STATUSES.has(participant.hackathonStatus)) {
    return { error: "Team changes are locked once judging has started", code: "status_locked" }
  }

  if (newTeamId) {
    if (!isValidUuid(newTeamId)) return { error: "Team not found", code: "team_not_found" }
    const { data: targetTeam } = await client
      .from("teams")
      .select("id, hackathon_id")
      .eq("id", newTeamId)
      .eq("hackathon_id", hackathonId)
      .neq("status", "disbanded")
      .maybeSingle()
    if (!targetTeam) return { error: "Team not found", code: "team_not_found" }

    const { data: hackathon } = await client
      .from("hackathons")
      .select("max_team_size")
      .eq("id", hackathonId)
      .maybeSingle()
    const maxSize = (hackathon as { max_team_size: number | null } | null)?.max_team_size ?? null
    if (maxSize) {
      const { count } = await client
        .from("hackathon_participants")
        .select("id", { count: "exact", head: true })
        .eq("team_id", newTeamId)
      if ((count ?? 0) >= maxSize) return { error: "That team is full", code: "team_full" }
    }
  }

  let capacityHandedOff = false
  if (participant.team_id && participant.team_id !== newTeamId) {
    const wasCaptain = await isCaptainOf(client, participant.team_id, participant.clerk_user_id)
    if (wasCaptain) {
      const promotion = await promoteNextCaptain(client, participant.team_id, participant.clerk_user_id)
      if (!promotion.ok) return { error: "Failed to reassign captain", code: "failed" }
      capacityHandedOff = true
    }
  }

  const { error: updateErr } = await client
    .from("hackathon_participants")
    .update({ team_id: newTeamId })
    .eq("id", participantId)
    .eq("hackathon_id", hackathonId)

  if (updateErr) {
    console.error("Failed to update participant team:", updateErr)
    return { error: "Failed to update team", code: "failed" }
  }

  return { success: true, teamId: newTeamId, capacityHandedOff }
}

export type UpdateRoleResult =
  | { success: true; role: PersonRole; capacityHandedOff: boolean }
  | { error: string; code: "not_found" | "invalid_role" | "status_locked" | "failed" }

const VALID_ROLES: PersonRole[] = ["participant", "judge", "mentor", "organizer"]

export async function updateParticipantRole(
  participantId: string,
  hackathonId: string,
  role: PersonRole,
): Promise<UpdateRoleResult> {
  if (!VALID_ROLES.includes(role)) return { error: "Invalid role", code: "invalid_role" }

  const client = getSupabase() as unknown as SupabaseClient
  const participant = await fetchParticipant(client, participantId, hackathonId)
  if (!participant) return { error: "Person not found", code: "not_found" }
  if (participant.hackathonStatus && LOCKED_STATUSES.has(participant.hackathonStatus)) {
    return { error: "Role changes are locked once judging has started", code: "status_locked" }
  }

  if (participant.role === role) return { success: true, role, capacityHandedOff: false }

  let capacityHandedOff = false
  const leavingParticipantRole = participant.role === "participant" && role !== "participant"
  if (leavingParticipantRole && participant.team_id) {
    const wasCaptain = await isCaptainOf(client, participant.team_id, participant.clerk_user_id)
    if (wasCaptain) {
      const promotion = await promoteNextCaptain(client, participant.team_id, participant.clerk_user_id)
      if (!promotion.ok) return { error: "Failed to reassign captain", code: "failed" }
      capacityHandedOff = true
    }
  }

  const updatePayload: Record<string, unknown> = { role }
  if (leavingParticipantRole) updatePayload.team_id = null

  const { error: updateErr } = await client
    .from("hackathon_participants")
    .update(updatePayload)
    .eq("id", participantId)
    .eq("hackathon_id", hackathonId)

  if (updateErr) {
    console.error("Failed to update participant role:", updateErr)
    return { error: "Failed to update role", code: "failed" }
  }

  if (participant.role === "judge" && role !== "judge") {
    await deleteJudgeAssignments(client, participantId)
  }

  return { success: true, role, capacityHandedOff }
}

export type RemoveParticipantResult =
  | { success: true; capacityHandedOff: boolean }
  | { error: string; code: "not_found" | "status_locked" | "failed" }

export async function removeParticipantFromEvent(
  participantId: string,
  hackathonId: string,
): Promise<RemoveParticipantResult> {
  const client = getSupabase() as unknown as SupabaseClient
  const participant = await fetchParticipant(client, participantId, hackathonId)
  if (!participant) return { error: "Person not found", code: "not_found" }
  if (participant.hackathonStatus && LOCKED_STATUSES.has(participant.hackathonStatus)) {
    return { error: "People can't be removed once judging has started", code: "status_locked" }
  }

  let capacityHandedOff = false
  if (participant.team_id) {
    const wasCaptain = await isCaptainOf(client, participant.team_id, participant.clerk_user_id)
    if (wasCaptain) {
      const promotion = await promoteNextCaptain(client, participant.team_id, participant.clerk_user_id)
      if (!promotion.ok) return { error: "Failed to reassign captain", code: "failed" }
      capacityHandedOff = true
    }
  }

  const { error: deleteErr } = await client
    .from("hackathon_participants")
    .delete()
    .eq("id", participantId)
    .eq("hackathon_id", hackathonId)

  if (deleteErr) {
    console.error("Failed to delete participant:", deleteErr)
    return { error: "Failed to remove person", code: "failed" }
  }

  return { success: true, capacityHandedOff }
}
