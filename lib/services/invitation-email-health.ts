import type { SupabaseClient } from "@supabase/supabase-js"
import { supabase as getSupabase } from "@/lib/db/client"

async function countUnsentForTable(
  client: SupabaseClient,
  table: "team_invitations" | "judge_invitations",
  hackathonId: string,
  now: string,
): Promise<number> {
  const { count, error } = await client
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("hackathon_id", hackathonId)
    .eq("status", "pending")
    .is("emailed_at", null)
    .gt("expires_at", now)

  if (error) {
    console.error(`Failed to count unsent ${table}:`, error)
    return 0
  }
  return count ?? 0
}

export async function countUnsentInvitationEmails(
  hackathonId: string,
): Promise<number> {
  const client = getSupabase() as unknown as SupabaseClient
  const now = new Date().toISOString()
  const [teamCount, judgeCount] = await Promise.all([
    countUnsentForTable(client, "team_invitations", hackathonId, now),
    countUnsentForTable(client, "judge_invitations", hackathonId, now),
  ])
  return teamCount + judgeCount
}
