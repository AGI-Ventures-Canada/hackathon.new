import { supabase as getSupabase } from "@/lib/db/client"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Prize, PrizeAssignment, PrizeType, TeamMode } from "@/lib/db/hackathon-types"

export type CreatePrizeInput = {
  name: string
  description?: string | null
  value?: string | null
  type?: PrizeType
  rank?: number | null
  kind?: string
  monetaryValue?: number | null
  currency?: string | null
  distributionMethod?: string | null
  displayValue?: string | null
  criteriaId?: string | null
  displayOrder?: number
  allowedTeamModes?: TeamMode[] | null
}

export type UpdatePrizeInput = {
  name?: string
  description?: string | null
  value?: string | null
  type?: PrizeType
  rank?: number | null
  kind?: string
  monetaryValue?: number | null
  currency?: string | null
  distributionMethod?: string | null
  displayValue?: string | null
  criteriaId?: string | null
  displayOrder?: number
  allowedTeamModes?: TeamMode[] | null
}

export async function listPrizes(hackathonId: string): Promise<Prize[]> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data, error } = await client
    .from("prizes")
    .select("*")
    .eq("hackathon_id", hackathonId)
    .order("display_order")

  if (error) {
    console.error("Failed to list prizes:", error)
    return []
  }

  return data as unknown as Prize[]
}

export async function createPrize(
  hackathonId: string,
  input: CreatePrizeInput
): Promise<Prize | null> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data, error } = await client
    .from("prizes")
    .insert({
      hackathon_id: hackathonId,
      name: input.name,
      description: input.description ?? null,
      value: input.value ?? null,
      type: input.type ?? "favorite",
      rank: input.rank ?? null,
      kind: input.kind ?? "other",
      monetary_value: input.monetaryValue ?? null,
      currency: input.currency ?? "USD",
      distribution_method: input.distributionMethod ?? null,
      display_value: input.displayValue ?? null,
      criteria_id: input.criteriaId ?? null,
      display_order: input.displayOrder ?? 0,
      allowed_team_modes: input.allowedTeamModes ?? null,
    })
    .select()
    .single()

  if (error) {
    console.error("Failed to create prize:", error)
    return null
  }

  return data as unknown as Prize
}

export async function updatePrize(
  prizeId: string,
  hackathonId: string,
  input: UpdatePrizeInput
): Promise<Prize | null> {
  const client = getSupabase() as unknown as SupabaseClient

  const updates: Record<string, unknown> = {}
  if (input.name !== undefined) updates.name = input.name
  if (input.description !== undefined) updates.description = input.description
  if (input.value !== undefined) updates.value = input.value
  if (input.type !== undefined) updates.type = input.type
  if (input.rank !== undefined) updates.rank = input.rank
  if (input.kind !== undefined) updates.kind = input.kind
  if (input.monetaryValue !== undefined) updates.monetary_value = input.monetaryValue
  if (input.currency !== undefined) updates.currency = input.currency
  if (input.distributionMethod !== undefined) updates.distribution_method = input.distributionMethod
  if (input.displayValue !== undefined) updates.display_value = input.displayValue
  if (input.criteriaId !== undefined) updates.criteria_id = input.criteriaId
  if (input.displayOrder !== undefined) updates.display_order = input.displayOrder
  if (input.allowedTeamModes !== undefined) updates.allowed_team_modes = input.allowedTeamModes
  updates.updated_at = new Date().toISOString()

  const { data, error } = await client
    .from("prizes")
    .update(updates)
    .eq("id", prizeId)
    .eq("hackathon_id", hackathonId)
    .select()
    .single()

  if (error) {
    console.error("Failed to update prize:", error)
    return null
  }

  return data as unknown as Prize
}

export async function deletePrize(
  prizeId: string,
  hackathonId: string
): Promise<boolean> {
  const client = getSupabase() as unknown as SupabaseClient
  const { error } = await client
    .from("prizes")
    .delete()
    .eq("id", prizeId)
    .eq("hackathon_id", hackathonId)

  if (error) {
    console.error("Failed to delete prize:", error)
    return false
  }

  return true
}

export async function prizeBelongsToHackathon(
  hackathonId: string,
  prizeId: string
): Promise<boolean> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data } = await client
    .from("prizes")
    .select("id")
    .eq("id", prizeId)
    .eq("hackathon_id", hackathonId)
    .maybeSingle()
  return !!data
}

export async function assignPrize(
  prizeId: string,
  submissionId: string,
  { skipNotifications = false }: { skipNotifications?: boolean } = {}
): Promise<PrizeAssignment | null> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data, error } = await client
    .from("prize_assignments")
    .insert({
      prize_id: prizeId,
      submission_id: submissionId,
    })
    .select()
    .single()

  if (error) {
    if (error.code === "23505") {
      console.error("Prize already assigned to this submission")
      return null
    }
    console.error("Failed to assign prize:", error)
    return null
  }

  const assignment = data as unknown as PrizeAssignment

  if (!skipNotifications) {
    try {
      const { data: prize } = await client
        .from("prizes")
        .select("hackathon_id")
        .eq("id", prizeId)
        .single()

      if (prize) {
        const { data: hackathon } = await client
          .from("hackathons")
          .select("results_published_at")
          .eq("id", prize.hackathon_id)
          .single()

        if (hackathon?.results_published_at) {
          const { initializeFulfillments } = await import("@/lib/services/prize-fulfillment")
          await initializeFulfillments(prize.hackathon_id)

          const { sendPrizeClaimEmail } = await import("@/lib/email/winner-notifications")
          void sendPrizeClaimEmail(prize.hackathon_id, assignment.id).catch(console.error)
        }
      }
    } catch (err) {
      console.error("Failed to send prize claim email (non-blocking):", err)
    }
  }

  return assignment
}

export async function removePrizeAssignment(
  prizeId: string,
  submissionId: string
): Promise<boolean> {
  const client = getSupabase() as unknown as SupabaseClient
  const { error } = await client
    .from("prize_assignments")
    .delete()
    .eq("prize_id", prizeId)
    .eq("submission_id", submissionId)

  if (error) {
    console.error("Failed to remove prize assignment:", error)
    return false
  }

  return true
}

export async function reorderPrizes(
  hackathonId: string,
  orderedIds: string[]
): Promise<boolean> {
  const client = getSupabase() as unknown as SupabaseClient
  const now = new Date().toISOString()

  const updates = orderedIds.map((id, i) =>
    client
      .from("prizes")
      .update({ display_order: i, updated_at: now })
      .eq("id", id)
      .eq("hackathon_id", hackathonId)
  )

  const results = await Promise.all(updates)
  const failed = results.find((r) => r.error)

  if (failed?.error) {
    console.error("Failed to reorder prizes:", failed.error)
    return false
  }

  return true
}

export async function autoAssignPrizes(hackathonId: string): Promise<void> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: prizes } = await client
    .from("prizes")
    .select("id, type, rank, criteria_id")
    .eq("hackathon_id", hackathonId)

  if (!prizes || prizes.length === 0) return

  const scorePrizes = prizes.filter(
    (p: { type: string; rank: number | null }) => p.type === "score" && p.rank !== null
  )

  if (scorePrizes.length > 0) {
    const { data: results } = await client
      .from("hackathon_results")
      .select("submission_id, rank")
      .eq("hackathon_id", hackathonId)

    if (results) {
      const rankToSubmission = Object.fromEntries(
        results.map((r: { submission_id: string; rank: number }) => [r.rank, r.submission_id])
      )

      for (const prize of scorePrizes) {
        const submissionId = rankToSubmission[prize.rank as number]
        if (submissionId) {
          await assignPrize(prize.id, submissionId, { skipNotifications: true })
        }
      }
    }
  }

  const criteriaPrizes = prizes.filter(
    (p: { type: string; criteria_id: string | null }) => p.type === "criteria" && p.criteria_id !== null
  )

  for (const prize of criteriaPrizes) {
    const { data: topSubmission } = await client
      .from("scores")
      .select(`
        score,
        judge_assignment:judge_assignments!judge_assignment_id(submission_id, is_complete, hackathon_id)
      `)
      .eq("criteria_id", prize.criteria_id)

    if (!topSubmission) continue

    const submissionScores: Record<string, number> = {}
    for (const s of topSubmission) {
      const assignment = s.judge_assignment as unknown as { submission_id: string; is_complete: boolean; hackathon_id: string } | null
      if (!assignment || !assignment.is_complete || assignment.hackathon_id !== hackathonId) continue
      submissionScores[assignment.submission_id] = (submissionScores[assignment.submission_id] ?? 0) + s.score
    }

    const sorted = Object.entries(submissionScores).sort(([, a], [, b]) => b - a)
    if (sorted.length > 0) {
      await assignPrize(prize.id, sorted[0][0], { skipNotifications: true })
    }
  }

  const crowdPrizes = prizes.filter(
    (p: { type: string }) => p.type === "crowd"
  )

  if (crowdPrizes.length > 0) {
    const { getCrowdFavoriteWinner } = await import("@/lib/services/crowd-voting")
    const winnerId = await getCrowdFavoriteWinner(hackathonId)
    if (winnerId) {
      for (const prize of crowdPrizes) {
        await assignPrize(prize.id, winnerId, { skipNotifications: true })
      }
    }
  }

  const { data: hackathon } = await client
    .from("hackathons")
    .select("judging_mode")
    .eq("id", hackathonId)
    .single()

  if (hackathon?.judging_mode === "subjective") {
    const favoritePrizes = prizes.filter(
      (p: { type: string }) => p.type === "favorite"
    )

    for (const prize of favoritePrizes) {
      const { data: picks } = await client
        .from("judge_picks")
        .select("submission_id, rank")
        .eq("hackathon_id", hackathonId)
        .eq("prize_id", prize.id)

      if (!picks || picks.length === 0) continue

      const pickCounts: Record<string, { firstPicks: number; totalRank: number; count: number }> = {}
      for (const pick of picks) {
        if (!pickCounts[pick.submission_id]) {
          pickCounts[pick.submission_id] = { firstPicks: 0, totalRank: 0, count: 0 }
        }
        if (pick.rank === 1) pickCounts[pick.submission_id].firstPicks++
        pickCounts[pick.submission_id].totalRank += pick.rank
        pickCounts[pick.submission_id].count++
      }

      const sorted = Object.entries(pickCounts).sort(([, a], [, b]) => {
        if (b.firstPicks !== a.firstPicks) return b.firstPicks - a.firstPicks
        return (a.totalRank / a.count) - (b.totalRank / b.count)
      })

      if (sorted.length > 0) {
        await assignPrize(prize.id, sorted[0][0], { skipNotifications: true })
      }
    }
  }
}

export type PrizeAssignmentWithDetails = PrizeAssignment & {
  prizeName: string
  submissionTitle: string
  teamName: string | null
}

export async function listPrizeAssignments(
  hackathonId: string
): Promise<PrizeAssignmentWithDetails[]> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: prizes } = await client
    .from("prizes")
    .select("id, name")
    .eq("hackathon_id", hackathonId)

  if (!prizes || prizes.length === 0) return []

  const prizeIds = prizes.map((p) => p.id)
  const prizeNameMap = Object.fromEntries(prizes.map((p) => [p.id, p.name]))

  const { data: assignments, error } = await client
    .from("prize_assignments")
    .select(`
      *,
      submission:submissions!submission_id(title, team_id)
    `)
    .in("prize_id", prizeIds)

  if (error || !assignments) {
    console.error("Failed to list prize assignments:", error)
    return []
  }

  const teamIds = assignments
    .map((a: Record<string, unknown>) => {
      const sub = a.submission as unknown as { team_id: string | null } | null
      return sub?.team_id
    })
    .filter((id): id is string => id !== null)

  let teamsMap: Record<string, string> = {}
  if (teamIds.length > 0) {
    const { data: teams } = await client
      .from("teams")
      .select("id, name")
      .in("id", teamIds)
    teamsMap = Object.fromEntries((teams ?? []).map((t) => [t.id, t.name]))
  }

  return assignments.map((a: Record<string, unknown>) => {
    const sub = a.submission as unknown as { title: string; team_id: string | null }
    return {
      ...(a as unknown as PrizeAssignment),
      prizeName: prizeNameMap[a.prize_id as string] ?? "Unknown",
      submissionTitle: sub.title,
      teamName: sub.team_id ? teamsMap[sub.team_id] ?? null : null,
    }
  })
}
