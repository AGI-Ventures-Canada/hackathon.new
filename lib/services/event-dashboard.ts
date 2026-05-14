import { supabase as getSupabase } from "@/lib/db/client"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { HackathonPhase, HackathonStatus } from "@/lib/db/hackathon-types"

export type LiveStats = {
  phase: HackathonPhase | null
  status: HackathonStatus
  teamCount: number
  submissionCount: number
  judgingProgress: { round: string | null; roundName: string | null; complete: number; total: number }[]
  roomStatus: { id: string; name: string; presented: number; total: number }[]
  mentorQueue: { open: number; claimed: number }
  challengeReleased: boolean
}

export async function getLiveStats(hackathonId: string): Promise<LiveStats | null> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: hackathon, error: hErr } = await client
    .from("hackathons")
    .select("status, phase")
    .eq("id", hackathonId)
    .single()

  if (hErr || !hackathon) return null

  const [teamResult, subResult, assignResult, completeResult, roomsResult, roomTeamsResult, mentorOpenResult, mentorClaimedResult, releasedChallengeResult] = await Promise.all([
    client.from("teams").select("id", { count: "exact", head: true }).eq("hackathon_id", hackathonId).neq("status", "disbanded"),
    client.from("submissions").select("id", { count: "exact", head: true }).eq("hackathon_id", hackathonId).eq("status", "submitted"),
    client.from("judge_assignments").select("id, round_id", { count: "exact", head: true }).eq("hackathon_id", hackathonId),
    client.from("judge_assignments").select("id, round_id", { count: "exact", head: true }).eq("hackathon_id", hackathonId).eq("is_complete", true),
    client.from("rooms").select("id, name").eq("hackathon_id", hackathonId).order("display_order"),
    client.from("room_teams").select("room_id, has_presented"),
    client.from("mentor_requests").select("id", { count: "exact", head: true }).eq("hackathon_id", hackathonId).eq("status", "open"),
    client.from("mentor_requests").select("id", { count: "exact", head: true }).eq("hackathon_id", hackathonId).eq("status", "claimed"),
    client.from("challenges").select("id", { count: "exact", head: true }).eq("hackathon_id", hackathonId).not("released_at", "is", null),
  ])

  const rooms = roomsResult.data ?? []
  const allRoomTeams = roomTeamsResult.data ?? []

  const roomStatus = rooms.map((room: { id: string; name: string }) => {
    const rts = allRoomTeams.filter((rt: { room_id: string }) => rt.room_id === room.id)
    return {
      id: room.id,
      name: room.name,
      presented: rts.filter((rt: { has_presented: boolean }) => rt.has_presented).length,
      total: rts.length,
    }
  })

  return {
    phase: hackathon.phase,
    status: hackathon.status,
    teamCount: teamResult.count ?? 0,
    submissionCount: subResult.count ?? 0,
    judgingProgress: [{
      round: null,
      roundName: null,
      complete: completeResult.count ?? 0,
      total: assignResult.count ?? 0,
    }],
    roomStatus,
    mentorQueue: {
      open: mentorOpenResult.count ?? 0,
      claimed: mentorClaimedResult.count ?? 0,
    },
    challengeReleased: (releasedChallengeResult.count ?? 0) > 0,
  }
}
