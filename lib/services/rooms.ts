import { supabase as getSupabase } from "@/lib/db/client"
import { listJudges } from "@/lib/services/judging"
import type { SupabaseClient } from "@supabase/supabase-js"
import { isValidUuid } from "@/lib/utils/uuid"

export type Room = {
  id: string
  hackathon_id: string
  name: string
  display_order: number
  timer_ends_at: string | null
  timer_remaining_ms: number | null
  timer_label: string | null
  created_at: string
}

export type RoomWithTeams = Room & {
  teamCount: number
  presentedCount: number
  teams: RoomTeamInfo[]
  judges: RoomJudgeInfo[]
}

export type RoomTeamInfo = {
  id: string
  room_id: string
  team_id: string
  has_presented: boolean
  present_order: number | null
  team_name: string
}

export type RoomJudgeInfo = {
  id: string
  room_id: string
  judge_participant_id: string
  clerk_user_id: string
  display_name: string
  email: string | null
  image_url: string | null
}

export type CreateRoomInput = {
  name: string
  displayOrder?: number
}

export type UpdateRoomInput = {
  name?: string
  displayOrder?: number
}

export async function listRooms(hackathonId: string): Promise<RoomWithTeams[]> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: rooms, error } = await client
    .from("rooms")
    .select("*")
    .eq("hackathon_id", hackathonId)
    .order("display_order")

  if (error || !rooms) {
    console.error("Failed to list rooms:", error)
    return []
  }

  const roomIds = rooms.map((r: Room) => r.id)
  if (roomIds.length === 0) return rooms.map((r: Room) => ({ ...r, teamCount: 0, presentedCount: 0, teams: [], judges: [] }))

  const { data: roomTeams } = await client
    .from("room_teams")
    .select("id, room_id, team_id, has_presented, present_order")
    .in("room_id", roomIds)

  const teamIds = [...new Set((roomTeams ?? []).map((rt: { team_id: string }) => rt.team_id))]
  let teamNames: Record<string, string> = {}
  if (teamIds.length > 0) {
    const { data: teams } = await client
      .from("teams")
      .select("id, name")
      .in("id", teamIds)
    if (teams) {
      teamNames = Object.fromEntries(teams.map((t: { id: string; name: string }) => [t.id, t.name]))
    }
  }

  const { data: roomJudges } = await client
    .from("judge_room_assignments")
    .select("id, room_id, judge_participant_id")
    .in("room_id", roomIds)

  const hasJudgeAssignments = (roomJudges ?? []).length > 0
  const judgeInfoByParticipantId: Record<
    string,
    { clerkUserId: string; displayName: string; email: string | null; imageUrl: string | null }
  > = {}
  if (hasJudgeAssignments) {
    const judgeList = await listJudges(hackathonId)
    for (const j of judgeList) {
      judgeInfoByParticipantId[j.participantId] = {
        clerkUserId: j.clerkUserId,
        displayName: j.displayName,
        email: j.email,
        imageUrl: j.imageUrl,
      }
    }
  }

  return rooms.map((room: Room) => {
    const rts = (roomTeams ?? []).filter((rt: { room_id: string }) => rt.room_id === room.id)
    const rjs = (roomJudges ?? []).filter((rj: { room_id: string }) => rj.room_id === room.id)
    return {
      ...room,
      teamCount: rts.length,
      presentedCount: rts.filter((rt: { has_presented: boolean }) => rt.has_presented).length,
      teams: rts.map((rt: { id: string; room_id: string; team_id: string; has_presented: boolean; present_order: number | null }) => ({
        ...rt,
        team_name: teamNames[rt.team_id] ?? "Unknown Team",
      })),
      judges: rjs.map((rj: { id: string; room_id: string; judge_participant_id: string }) => {
        const info = judgeInfoByParticipantId[rj.judge_participant_id]
        return {
          id: rj.id,
          room_id: rj.room_id,
          judge_participant_id: rj.judge_participant_id,
          clerk_user_id: info?.clerkUserId ?? "",
          display_name: info?.displayName ?? "Unknown Judge",
          email: info?.email ?? null,
          image_url: info?.imageUrl ?? null,
        }
      }),
    }
  })
}

export async function createRoom(hackathonId: string, input: CreateRoomInput): Promise<Room | null> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data, error } = await client
    .from("rooms")
    .insert({
      hackathon_id: hackathonId,
      name: input.name,
      display_order: input.displayOrder ?? 0,
    })
    .select()
    .single()

  if (error) {
    console.error("Failed to create room:", error)
    return null
  }

  return data as Room
}

export async function updateRoom(roomId: string, hackathonId: string, input: UpdateRoomInput): Promise<Room | null> {
  const client = getSupabase() as unknown as SupabaseClient

  const updates: Record<string, unknown> = {}
  if (input.name !== undefined) updates.name = input.name
  if (input.displayOrder !== undefined) updates.display_order = input.displayOrder

  if (Object.keys(updates).length === 0) return null

  const { data, error } = await client
    .from("rooms")
    .update(updates)
    .eq("id", roomId)
    .eq("hackathon_id", hackathonId)
    .select()
    .single()

  if (error) {
    console.error("Failed to update room:", error)
    return null
  }

  return data as Room
}

export async function deleteRoom(roomId: string, hackathonId: string): Promise<boolean> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data, error } = await client
    .from("rooms")
    .delete()
    .eq("id", roomId)
    .eq("hackathon_id", hackathonId)
    .select("id")

  if (error) {
    console.error("Failed to delete room:", error)
    return false
  }

  return (data ?? []).length > 0
}

export async function addTeamToRoom(
  roomId: string,
  teamId: string,
  hackathonId: string
): Promise<boolean> {
  if (![roomId, teamId, hackathonId].every(isValidUuid)) return false

  const client = getSupabase() as unknown as SupabaseClient

  const [roomMatches, teamMatches] = await Promise.all([
    roomBelongsToHackathon(client, roomId, hackathonId),
    teamBelongsToHackathon(client, teamId, hackathonId),
  ])
  if (!roomMatches || !teamMatches) return false

  const { error } = await client
    .from("room_teams")
    .upsert({ room_id: roomId, team_id: teamId }, { onConflict: "team_id" })

  if (error) {
    console.error("Failed to add team to room:", error)
    return false
  }

  return true
}

export async function removeTeamFromRoom(
  roomId: string,
  teamId: string,
  hackathonId: string
): Promise<boolean> {
  if (![roomId, teamId, hackathonId].every(isValidUuid)) return false

  const client = getSupabase() as unknown as SupabaseClient

  const [roomMatches, teamMatches] = await Promise.all([
    roomBelongsToHackathon(client, roomId, hackathonId),
    teamBelongsToHackathon(client, teamId, hackathonId),
  ])
  if (!roomMatches || !teamMatches) return false

  const { data, error } = await client
    .from("room_teams")
    .delete()
    .eq("room_id", roomId)
    .eq("team_id", teamId)
    .select("id")

  if (error) {
    console.error("Failed to remove team from room:", error)
    return false
  }

  return (data ?? []).length > 0
}

export async function getAutoAssignByRoom(hackathonId: string): Promise<boolean> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data, error } = await client
    .from("hackathons")
    .select("auto_assign_by_room")
    .eq("id", hackathonId)
    .maybeSingle()

  if (error || !data) {
    if (error) console.error("Failed to read auto_assign_by_room:", error)
    return false
  }

  return Boolean((data as { auto_assign_by_room: boolean }).auto_assign_by_room)
}

export async function setAutoAssignByRoom(hackathonId: string, enabled: boolean): Promise<boolean> {
  const client = getSupabase() as unknown as SupabaseClient

  const { error } = await client
    .from("hackathons")
    .update({ auto_assign_by_room: enabled })
    .eq("id", hackathonId)

  if (error) {
    console.error("Failed to set auto_assign_by_room:", error)
    return false
  }

  return true
}

async function roomBelongsToHackathon(
  client: SupabaseClient,
  roomId: string,
  hackathonId: string
): Promise<boolean> {
  const { data } = await client
    .from("rooms")
    .select("id")
    .eq("id", roomId)
    .eq("hackathon_id", hackathonId)
    .maybeSingle()
  return Boolean(data)
}

async function teamBelongsToHackathon(
  client: SupabaseClient,
  teamId: string,
  hackathonId: string
): Promise<boolean> {
  const { data } = await client
    .from("teams")
    .select("id")
    .eq("id", teamId)
    .eq("hackathon_id", hackathonId)
    .maybeSingle()
  return Boolean(data)
}

export type RoomJudgeMutationResult =
  | { ok: true; changed: boolean }
  | { ok: false }

export async function addJudgeToRoom(
  roomId: string,
  hackathonId: string,
  judgeParticipantId: string
): Promise<RoomJudgeMutationResult> {
  const client = getSupabase() as unknown as SupabaseClient

  if (!(await roomBelongsToHackathon(client, roomId, hackathonId))) {
    console.error("Room not found for hackathon:", { roomId, hackathonId })
    return { ok: false }
  }

  const { data: participant } = await client
    .from("hackathon_participants")
    .select("id, hackathon_id, role")
    .eq("id", judgeParticipantId)
    .eq("hackathon_id", hackathonId)
    .eq("role", "judge")
    .maybeSingle()

  if (!participant) {
    console.error("Judge not found for hackathon:", { roomId, judgeParticipantId, hackathonId })
    return { ok: false }
  }

  const { data, error } = await client
    .from("judge_room_assignments")
    .upsert(
      { room_id: roomId, judge_participant_id: judgeParticipantId, hackathon_id: hackathonId },
      { onConflict: "room_id,judge_participant_id", ignoreDuplicates: true }
    )
    .select()

  if (error) {
    console.error("Failed to add judge to room:", error)
    return { ok: false }
  }

  return { ok: true, changed: (data ?? []).length > 0 }
}

export async function removeJudgeFromRoom(
  roomId: string,
  judgeParticipantId: string,
  hackathonId: string
): Promise<RoomJudgeMutationResult> {
  const client = getSupabase() as unknown as SupabaseClient

  if (!(await roomBelongsToHackathon(client, roomId, hackathonId))) {
    console.error("Room not found for hackathon:", { roomId, hackathonId })
    return { ok: false }
  }

  const { data: participant } = await client
    .from("hackathon_participants")
    .select("id")
    .eq("id", judgeParticipantId)
    .eq("hackathon_id", hackathonId)
    .eq("role", "judge")
    .maybeSingle()

  if (!participant) {
    console.error("Judge not found for hackathon:", { roomId, judgeParticipantId, hackathonId })
    return { ok: false }
  }

  const { data, error } = await client
    .from("judge_room_assignments")
    .delete()
    .eq("room_id", roomId)
    .eq("judge_participant_id", judgeParticipantId)
    .eq("hackathon_id", hackathonId)
    .select()

  if (error) {
    console.error("Failed to remove judge from room:", error)
    return { ok: false }
  }

  return { ok: true, changed: (data ?? []).length > 0 }
}

export async function togglePresented(
  roomId: string,
  teamId: string,
  hackathonId: string,
  presented: boolean
): Promise<boolean> {
  if (![roomId, teamId, hackathonId].every(isValidUuid)) return false

  const client = getSupabase() as unknown as SupabaseClient

  const [roomMatches, teamMatches] = await Promise.all([
    roomBelongsToHackathon(client, roomId, hackathonId),
    teamBelongsToHackathon(client, teamId, hackathonId),
  ])
  if (!roomMatches || !teamMatches) return false

  const { data, error } = await client
    .from("room_teams")
    .update({ has_presented: presented })
    .eq("room_id", roomId)
    .eq("team_id", teamId)
    .select("id")

  if (error) {
    console.error("Failed to toggle presented:", error)
    return false
  }

  return (data ?? []).length > 0
}

export async function setRoomTimer(
  roomId: string,
  hackathonId: string,
  input: { endsAt: string; label?: string }
): Promise<Room | null> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data, error } = await client
    .from("rooms")
    .update({ timer_ends_at: input.endsAt, timer_remaining_ms: null, timer_label: input.label ?? null })
    .eq("id", roomId)
    .eq("hackathon_id", hackathonId)
    .select()
    .single()

  if (error) {
    console.error("Failed to set room timer:", error)
    return null
  }

  return data as Room
}

export async function clearRoomTimer(roomId: string, hackathonId: string): Promise<Room | null> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data, error } = await client
    .from("rooms")
    .update({ timer_ends_at: null, timer_remaining_ms: null, timer_label: null })
    .eq("id", roomId)
    .eq("hackathon_id", hackathonId)
    .select()
    .single()

  if (error) {
    console.error("Failed to clear room timer:", error)
    return null
  }

  return data as Room
}

export async function pauseRoomTimer(roomId: string, hackathonId: string): Promise<Room | null> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: room, error: fetchErr } = await client
    .from("rooms")
    .select("timer_ends_at")
    .eq("id", roomId)
    .eq("hackathon_id", hackathonId)
    .single()

  if (fetchErr || !room?.timer_ends_at) return null

  const remaining = Math.max(0, new Date(room.timer_ends_at).getTime() - Date.now())

  const { data, error } = await client
    .from("rooms")
    .update({ timer_ends_at: null, timer_remaining_ms: remaining })
    .eq("id", roomId)
    .eq("hackathon_id", hackathonId)
    .select()
    .single()

  if (error) {
    console.error("Failed to pause room timer:", error)
    return null
  }

  return data as Room
}

export async function resumeRoomTimer(roomId: string, hackathonId: string): Promise<Room | null> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: room, error: fetchErr } = await client
    .from("rooms")
    .select("timer_remaining_ms")
    .eq("id", roomId)
    .eq("hackathon_id", hackathonId)
    .single()

  if (fetchErr || !room?.timer_remaining_ms) return null

  const endsAt = new Date(Date.now() + room.timer_remaining_ms).toISOString()

  const { data, error } = await client
    .from("rooms")
    .update({ timer_ends_at: endsAt, timer_remaining_ms: null })
    .eq("id", roomId)
    .eq("hackathon_id", hackathonId)
    .select()
    .single()

  if (error) {
    console.error("Failed to resume room timer:", error)
    return null
  }

  return data as Room
}
