import { supabase as getSupabase } from "@/lib/db/client"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { JudgePick } from "@/lib/db/hackathon-types"

export async function getJudgePicks(
  hackathonId: string,
  judgeParticipantId: string
): Promise<JudgePick[]> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data, error } = await client
    .from("judge_picks")
    .select("*")
    .eq("hackathon_id", hackathonId)
    .eq("judge_participant_id", judgeParticipantId)
    .order("prize_id")
    .order("rank")

  if (error) {
    console.error("Failed to get judge picks:", error)
    return []
  }

  return data as unknown as JudgePick[]
}

export async function getPicksForPrize(
  hackathonId: string,
  prizeId: string
): Promise<JudgePick[]> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data, error } = await client
    .from("judge_picks")
    .select("*")
    .eq("hackathon_id", hackathonId)
    .eq("prize_id", prizeId)
    .order("rank")

  if (error) {
    console.error("Failed to get picks for prize:", error)
    return []
  }

  return data as unknown as JudgePick[]
}

export type SubmitPickResult =
  | { success: true; pick: JudgePick }
  | { success: false; error: string }

export async function submitPick(
  hackathonId: string,
  judgeParticipantId: string,
  prizeId: string,
  submissionId: string,
  rank: number,
  reason?: string
): Promise<SubmitPickResult> {
  if (rank !== 1) {
    return { success: false, error: "Use the ranked picks form to add more than one project" }
  }

  const client = getSupabase() as unknown as SupabaseClient
  const { error: replaceError } = await client.rpc("replace_judge_picks_atomic", {
    p_hackathon_id: hackathonId,
    p_judge_participant_id: judgeParticipantId,
    p_prize_id: prizeId,
    p_picks: [{ submission_id: submissionId, rank: 1, reason: reason ?? null }],
  })
  if (replaceError) {
    console.error("Failed to submit pick:", replaceError)
    return { success: false, error: "This pick can't be saved. Check that judging is still open." }
  }

  const { data, error } = await client
    .from("judge_picks")
    .select("*")
    .eq("hackathon_id", hackathonId)
    .eq("judge_participant_id", judgeParticipantId)
    .eq("prize_id", prizeId)
    .eq("submission_id", submissionId)
    .single()

  if (error) {
    console.error("Failed to submit pick:", error)
    return { success: false, error: "Failed to submit pick" }
  }

  return { success: true, pick: data as unknown as JudgePick }
}

export async function removePick(
  hackathonId: string,
  judgeParticipantId: string,
  prizeId: string,
  submissionId: string
): Promise<boolean> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data, error } = await client.rpc("remove_judge_pick_atomic", {
    p_hackathon_id: hackathonId,
    p_judge_participant_id: judgeParticipantId,
    p_prize_id: prizeId,
    p_submission_id: submissionId,
  })

  if (error) {
    console.error("Failed to remove pick:", error)
    return false
  }

  return data === true
}

export type PickResultEntry = {
  submissionId: string
  firstPicks: number
  averageRank: number
  totalPicks: number
}

export async function getPickResults(
  hackathonId: string,
  prizeId: string
): Promise<PickResultEntry[]> {
  const picks = await getPicksForPrize(hackathonId, prizeId)

  const grouped: Record<string, { firstPicks: number; totalRank: number; count: number }> = {}
  for (const pick of picks) {
    if (!grouped[pick.submission_id]) {
      grouped[pick.submission_id] = { firstPicks: 0, totalRank: 0, count: 0 }
    }
    if (pick.rank === 1) grouped[pick.submission_id].firstPicks++
    grouped[pick.submission_id].totalRank += pick.rank
    grouped[pick.submission_id].count++
  }

  return Object.entries(grouped)
    .map(([submissionId, stats]) => ({
      submissionId,
      firstPicks: stats.firstPicks,
      averageRank: stats.totalRank / stats.count,
      totalPicks: stats.count,
    }))
    .sort((a, b) => {
      if (b.firstPicks !== a.firstPicks) return b.firstPicks - a.firstPicks
      return a.averageRank - b.averageRank
    })
}

export async function isJudgingComplete(
  hackathonId: string,
  judgeParticipantId: string
): Promise<boolean> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: prizes } = await client
    .from("prizes")
    .select("id")
    .eq("hackathon_id", hackathonId)

  if (!prizes || prizes.length === 0) return true

  const { data: picks } = await client
    .from("judge_picks")
    .select("prize_id")
    .eq("hackathon_id", hackathonId)
    .eq("judge_participant_id", judgeParticipantId)

  const pickedPrizeIds = new Set((picks ?? []).map((p) => p.prize_id))
  return prizes.every((p) => pickedPrizeIds.has(p.id))
}
