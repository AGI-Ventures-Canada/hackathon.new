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

async function countPendingJudgeNotifications(
  client: SupabaseClient,
  hackathonId: string,
): Promise<number> {
  const { count, error } = await client
    .from("judge_pending_notifications")
    .select("id", { count: "exact", head: true })
    .eq("hackathon_id", hackathonId)
    .is("sent_at", null)

  if (error) {
    console.error("Failed to count unsent judge notifications:", error)
    return 0
  }
  return count ?? 0
}

export async function countUnsentInvitationEmails(
  hackathonId: string,
): Promise<number> {
  const counts = await getUnsentInvitationEmailCounts(hackathonId)
  return counts.total
}

export type UnsentInvitationEmailCounts = {
  teams: number
  judges: number
  total: number
}

export async function getUnsentInvitationEmailCounts(
  hackathonId: string,
): Promise<UnsentInvitationEmailCounts> {
  const client = getSupabase() as unknown as SupabaseClient
  const now = new Date().toISOString()
  const [teamCount, judgeInvitationCount, judgeNotificationCount] = await Promise.all([
    countUnsentForTable(client, "team_invitations", hackathonId, now),
    countUnsentForTable(client, "judge_invitations", hackathonId, now),
    countPendingJudgeNotifications(client, hackathonId),
  ])
  const judgeCount = judgeInvitationCount + judgeNotificationCount
  return {
    teams: teamCount,
    judges: judgeCount,
    total: teamCount + judgeCount,
  }
}

export async function countFailedReminderEmails(
  hackathonId: string,
): Promise<number> {
  const client = getSupabase() as unknown as SupabaseClient
  const [reminders, judgeNotifications, lifecycleDispatches] = await Promise.all([
    client
      .from("scheduled_reminders")
      .select("id", { count: "exact", head: true })
      .eq("hackathon_id", hackathonId)
      .is("sent_at", null)
      .is("cancelled_at", null)
      .gte("fail_count", 3),
    client
      .from("judge_pending_notifications")
      .select("id", { count: "exact", head: true })
      .eq("hackathon_id", hackathonId)
      .is("sent_at", null)
      .gte("fail_count", 5),
    client
      .from("lifecycle_notification_dispatches")
      .select("id", { count: "exact", head: true })
      .eq("hackathon_id", hackathonId)
      .is("resolved_at", null)
      .gte("fail_count", 5),
  ])

  const named = [
    ["reminder emails", reminders],
    ["judge notifications", judgeNotifications],
    ["lifecycle workflows", lifecycleDispatches],
  ] as const
  let total = 0
  for (const [name, result] of named) {
    if (result.error) {
      console.error(`Failed to count ${name} that need help:`, result.error)
      continue
    }
    total += result.count ?? 0
  }
  return total
}
