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

type AtomicParticipantResult = {
  success: boolean
  error_code: string | null
  capacity_handed_off: boolean
  cancelled_invitation_ids: string[] | null
}

async function cancelInvitationReminders(invitationIds: string[] | null): Promise<void> {
  if (!invitationIds?.length) return
  const { cancelRemindersForEntity } = await import("@/lib/services/smart-reminders")
  await Promise.allSettled(invitationIds.map((id) => cancelRemindersForEntity("team_invitation", id)))
}

export type AssignTeamResult =
  | { success: true; teamId: string | null; capacityHandedOff: boolean }
  | { error: string; code: "not_found" | "not_participant" | "team_not_found" | "team_full" | "status_locked" | "failed" }

export async function assignParticipantToTeam(
  participantId: string,
  hackathonId: string,
  newTeamId: string | null,
): Promise<AssignTeamResult> {
  if (newTeamId && !isValidUuid(newTeamId)) return { error: "Team not found", code: "team_not_found" }
  const client = getSupabase() as unknown as SupabaseClient
  const { data, error } = await client.rpc("assign_participant_to_team_atomic", {
    p_hackathon_id: hackathonId, p_participant_id: participantId, p_team_id: newTeamId,
  })
  if (error) return { error: "Failed to update team", code: "failed" }
  const result = (Array.isArray(data) ? data[0] : data) as AtomicParticipantResult | null
  if (!result?.success) {
    const code = result?.error_code as Exclude<AssignTeamResult, { success: true }>["code"] | undefined
    const messages: Record<string, string> = { not_found: "Person not found", not_participant: "Only participants can be assigned to a team", team_not_found: "Team not found", team_full: "That team is full", status_locked: "Team changes are locked once judging has started" }
    return { error: messages[code ?? ""] ?? "Failed to update team", code: code ?? "failed" }
  }
  await cancelInvitationReminders(result.cancelled_invitation_ids)
  return { success: true, teamId: newTeamId, capacityHandedOff: result.capacity_handed_off }
}

export type UpdateRoleResult =
  | { success: true; role: PersonRole; capacityHandedOff: boolean }
  | { error: string; code: "not_found" | "invalid_role" | "status_locked" | "project_role_conflict" | "failed" }

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
  const liveJudgePromotion =
    participant.hackathonStatus === "judging" &&
    participant.role === "participant" &&
    role === "judge"
  if (
    participant.hackathonStatus &&
    LOCKED_STATUSES.has(participant.hackathonStatus) &&
    !liveJudgePromotion
  ) {
    return { error: "Role changes are locked once judging has started", code: "status_locked" }
  }

  if (participant.role === role) return { success: true, role, capacityHandedOff: false }

  if (participant.role === "participant" && role === "judge") {
    const { data, error } = await client.rpc("promote_participant_to_judge_atomic", {
      p_hackathon_id: hackathonId,
      p_participant_id: participantId,
    })
    if (error) {
      console.error("Failed to promote participant to judge:", error)
      return { error: "Failed to update role", code: "failed" }
    }
    const result = (Array.isArray(data) ? data[0] : data) as {
      success: boolean
      error_code: string | null
      capacity_handed_off: boolean
      cancelled_invitation_ids: string[] | null
    } | null
    if (!result?.success) {
      if (result?.error_code === "project_role_conflict") {
        return {
          error: "This person is on a team with a project. Remove the project before making them a judge.",
          code: "project_role_conflict",
        }
      }
      if (result?.error_code === "not_found") return { error: "Person not found", code: "not_found" }
      if (result?.error_code === "status_locked") return { error: "Role changes are locked once judging has ended", code: "status_locked" }
      return { error: "Failed to update role", code: "failed" }
    }
    if (result.cancelled_invitation_ids?.length) {
      const { cancelRemindersForEntity } = await import("@/lib/services/smart-reminders")
      for (const invitationId of result.cancelled_invitation_ids) {
        cancelRemindersForEntity("team_invitation", invitationId).catch((err) =>
          console.error(`Failed to cancel reminders for team_invitation ${invitationId}:`, err)
        )
      }
    }
    return { success: true, role, capacityHandedOff: result.capacity_handed_off }
  }

  if (participant.role === "participant") {
    const { data, error } = await client.rpc("change_participant_role_atomic", {
      p_hackathon_id: hackathonId,
      p_participant_id: participantId,
      p_role: role,
    })
    if (error) return { error: "Failed to update role", code: "failed" }
    const result = (Array.isArray(data) ? data[0] : data) as AtomicParticipantResult | null
    if (!result?.success) {
      if (result?.error_code === "not_found") return { error: "Person not found", code: "not_found" }
      if (result?.error_code === "status_locked") return { error: "Role changes are locked once judging has started", code: "status_locked" }
      return { error: "Failed to update role", code: "failed" }
    }
    await cancelInvitationReminders(result.cancelled_invitation_ids)
    return { success: true, role, capacityHandedOff: result.capacity_handed_off }
  }

  if (participant.role === "judge") {
    const { data, error } = await client.rpc("change_judge_role_atomic", {
      p_hackathon_id: hackathonId,
      p_participant_id: participantId,
      p_role: role,
    })
    if (error || data !== true) return { error: "Failed to update role", code: "failed" }
    return { success: true, role, capacityHandedOff: false }
  }

  const { data, error } = await client.rpc("change_other_role_atomic", {
    p_hackathon_id: hackathonId,
    p_participant_id: participantId,
    p_role: role,
  })
  if (error || data !== true) return { error: "Failed to update role", code: "failed" }
  return { success: true, role, capacityHandedOff: false }
}

export type RemoveParticipantResult =
  | { success: true; capacityHandedOff: boolean }
  | { error: string; code: "not_found" | "status_locked" | "failed" }

export async function removeParticipantFromEvent(
  participantId: string,
  hackathonId: string,
): Promise<RemoveParticipantResult> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data, error } = await client.rpc("remove_participant_from_event_atomic", {
    p_hackathon_id: hackathonId,
    p_participant_id: participantId,
  })
  if (error) return { error: "Failed to remove person", code: "failed" }
  const result = (Array.isArray(data) ? data[0] : data) as AtomicParticipantResult | null
  if (!result?.success) {
    if (result?.error_code === "not_found") return { error: "Person not found", code: "not_found" }
    if (result?.error_code === "status_locked") return { error: "People can't be removed once judging has started", code: "status_locked" }
    return { error: "Failed to remove person", code: "failed" }
  }
  await cancelInvitationReminders(result.cancelled_invitation_ids)
  return { success: true, capacityHandedOff: result.capacity_handed_off }
}
