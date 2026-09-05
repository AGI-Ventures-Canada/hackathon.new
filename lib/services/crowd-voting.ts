import { supabase as getSupabase } from "@/lib/db/client"
import type { SupabaseClient } from "@supabase/supabase-js"

const VOTE_ERRORS: Record<string, string> = {
  not_found: "Event not found",
  voting_closed: "Voting is closed",
  invalid_prize: "This vote is not available",
  invalid_project: "Project not found",
}

export async function castVote(
  hackathonId: string,
  prizeId: string,
  submissionId: string,
  clerkUserId: string,
): Promise<{ success: boolean; error?: string; code?: string }> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data, error } = await client.rpc("cast_crowd_vote_atomic", {
    p_hackathon_id: hackathonId,
    p_prize_id: prizeId,
    p_submission_id: submissionId,
    p_clerk_user_id: clerkUserId,
  })
  if (error) {
    console.error("Failed to cast vote:", error)
    return { success: false, error: "Failed to cast vote" }
  }
  const code = data as string | null
  if (code !== "success") return { success: false, code: code ?? "vote_failed", error: VOTE_ERRORS[code ?? ""] ?? "Failed to cast vote" }
  return { success: true }
}

export async function removeVote(
  hackathonId: string,
  prizeId: string,
  clerkUserId: string,
): Promise<{ success: boolean; error?: string; code?: string }> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data, error } = await client.rpc("remove_crowd_vote_atomic", {
    p_hackathon_id: hackathonId,
    p_prize_id: prizeId,
    p_clerk_user_id: clerkUserId,
  })
  if (error) {
    console.error("Failed to remove vote:", error)
    return { success: false, error: "Failed to remove vote" }
  }
  const code = data as string | null
  if (code !== "success") return { success: false, code: code ?? "vote_failed", error: VOTE_ERRORS[code ?? ""] ?? "Failed to remove vote" }
  return { success: true }
}

export async function getVoteCounts(
  hackathonId: string,
  prizeId: string,
): Promise<{ submissionId: string; voteCount: number }[]> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data, error } = await client.rpc("get_crowd_vote_counts", {
    p_hackathon_id: hackathonId,
    p_prize_id: prizeId,
  })

  if (error || !data) {
    console.error("Failed to get vote counts:", error)
    return []
  }

  return (data as Array<{ submission_id: string; vote_count: number | string }>).map((vote) => ({
    submissionId: vote.submission_id,
    voteCount: Number(vote.vote_count),
  }))
}

export async function getUserVote(
  hackathonId: string,
  prizeId: string,
  clerkUserId: string,
): Promise<string | null> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data, error } = await client
    .from("crowd_votes")
    .select("submission_id")
    .eq("hackathon_id", hackathonId)
    .eq("prize_id", prizeId)
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle()

  if (error || !data) return null
  return data.submission_id
}

export async function getCrowdFavoriteWinner(
  hackathonId: string,
  prizeId: string,
): Promise<string | null> {
  const counts = await getVoteCounts(hackathonId, prizeId)
  if (counts.length === 0) return null
  counts.sort((a, b) => b.voteCount - a.voteCount || a.submissionId.localeCompare(b.submissionId))
  return counts[0].submissionId
}
