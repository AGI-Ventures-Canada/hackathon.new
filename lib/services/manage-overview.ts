import { supabase as getSupabase } from "@/lib/db/client"
import type { SupabaseClient } from "@supabase/supabase-js"

export type ManageOverviewStats = {
  participantCount: number
  teamCount: number
  mentorQueue: { open: number }
  challengeReleased: boolean
}

export async function getManageOverviewStats(hackathonId: string): Promise<ManageOverviewStats> {
  const client = getSupabase() as unknown as SupabaseClient

  const [participantResult, teamResult, mentorOpenResult, releasedChallengeResult] = await Promise.all([
    client.from("hackathon_participants").select("id", { count: "exact", head: true }).eq("hackathon_id", hackathonId),
    client.from("teams").select("id", { count: "exact", head: true }).eq("hackathon_id", hackathonId).neq("status", "disbanded"),
    client.from("mentor_requests").select("id", { count: "exact", head: true }).eq("hackathon_id", hackathonId).eq("status", "open"),
    client.from("challenges").select("id", { count: "exact", head: true }).eq("hackathon_id", hackathonId).not("released_at", "is", null),
  ])

  if (participantResult.error) console.error("Failed to count participants:", participantResult.error)
  if (teamResult.error) console.error("Failed to count teams:", teamResult.error)
  if (mentorOpenResult.error) console.error("Failed to count mentor requests:", mentorOpenResult.error)
  if (releasedChallengeResult.error) console.error("Failed to count released challenges:", releasedChallengeResult.error)

  return {
    participantCount: participantResult.count ?? 0,
    teamCount: teamResult.count ?? 0,
    mentorQueue: { open: mentorOpenResult.count ?? 0 },
    challengeReleased: (releasedChallengeResult.count ?? 0) > 0,
  }
}
