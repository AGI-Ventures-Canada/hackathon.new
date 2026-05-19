import { supabase as getSupabase } from "@/lib/db/client"
import type { SupabaseClient } from "@supabase/supabase-js"

export type ManageOverviewStats = {
  participantCount: number
  teamCount: number
  pendingTeamApprovalCount: number
  mentorQueue: { open: number }
  challengeReleased: boolean
}

export async function getManageOverviewStats(hackathonId: string): Promise<ManageOverviewStats> {
  const client = getSupabase() as unknown as SupabaseClient

  const [participantResult, teamResult, pendingTeamResult, mentorOpenResult, hackathonResult] = await Promise.all([
    client.from("hackathon_participants").select("id", { count: "exact", head: true }).eq("hackathon_id", hackathonId),
    client.from("teams").select("id", { count: "exact", head: true }).eq("hackathon_id", hackathonId).neq("status", "disbanded"),
    client.from("teams").select("id", { count: "exact", head: true }).eq("hackathon_id", hackathonId).eq("status", "pending_approval"),
    client.from("mentor_requests").select("id", { count: "exact", head: true }).eq("hackathon_id", hackathonId).eq("status", "open"),
    client.from("hackathons").select("challenge_released_at").eq("id", hackathonId).single(),
  ])

  if (participantResult.error) console.error("Failed to count participants:", participantResult.error)
  if (teamResult.error) console.error("Failed to count teams:", teamResult.error)
  if (pendingTeamResult.error) console.error("Failed to count teams waiting for approval:", pendingTeamResult.error)
  if (mentorOpenResult.error) console.error("Failed to count mentor requests:", mentorOpenResult.error)
  if (hackathonResult.error) console.error("Failed to fetch hackathon:", hackathonResult.error)

  return {
    participantCount: participantResult.count ?? 0,
    teamCount: teamResult.count ?? 0,
    pendingTeamApprovalCount: pendingTeamResult.count ?? 0,
    mentorQueue: { open: mentorOpenResult.count ?? 0 },
    challengeReleased: !!hackathonResult.data?.challenge_released_at,
  }
}
