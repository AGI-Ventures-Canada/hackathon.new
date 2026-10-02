import type { SupabaseClient } from "@supabase/supabase-js"
import { supabase } from "@/lib/db/client"

export type ScheduledJudgingReadiness = {
  isReady: boolean
  issues: string[]
  unassignedProjectCount: number
  requiresJudgeScoring: boolean
}

export async function getScheduledJudgingReadiness(hackathonId: string, roundId: string | null = null): Promise<ScheduledJudgingReadiness> {
  const client = supabase() as unknown as SupabaseClient
  const { data, error } = await client.rpc("get_scheduled_judging_readiness", { p_hackathon_id: hackathonId, p_round_id: roundId })
  if (error || !data) throw new Error("We couldn't check judging setup. Try again.")
  return data as ScheduledJudgingReadiness
}

export async function isJudgingWindowOpen(hackathonId: string, roundId: string | null = null): Promise<boolean> {
  const client = supabase() as unknown as SupabaseClient
  const { data, error } = await client.rpc("judging_window_is_open", { p_hackathon_id: hackathonId, p_round_id: roundId })
  return !error && data === true
}

export async function getConfiguredJudgingReadiness(hackathonId: string): Promise<ScheduledJudgingReadiness | null> {
  const client = supabase() as unknown as SupabaseClient
  const { data, error } = await client.rpc("judging_window_is_configured", { p_hackathon_id: hackathonId, p_round_id: null })
  if (error) throw new Error("We couldn't check judging setup. Try again.")
  return data === true ? getScheduledJudgingReadiness(hackathonId) : null
}
