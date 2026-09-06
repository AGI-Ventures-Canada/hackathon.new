import { supabase as getSupabase } from "@/lib/db/client"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { HackathonStatus, SponsorTier } from "@/lib/db/hackathon-types"
import { countActionableJudgeReviews } from "@/lib/utils/judging-review-queue"
import { canWriteJudgingWindow, resolveJudgingWindow, type JudgingWindowEvent, type JudgingWindowRound } from "@/lib/utils/judging-window"
import { getEffectiveStatusAt } from "@/lib/utils/timeline"
import { isJudgingWindowOpen } from "@/lib/services/judging-readiness"

export type JudgeHackathonStats = {
  hackathonId: string
  totalAssignments: number
  completedAssignments: number
  actionableAssignments?: number
  hasActiveRound?: boolean
  judgingClosed?: boolean
}

export async function getBatchJudgeStats(
  hackathonIds: string[],
  clerkUserId: string,
): Promise<Map<string, JudgeHackathonStats>> {
  if (hackathonIds.length === 0) return new Map()

  const client = getSupabase() as unknown as SupabaseClient

  const { data: participants } = await client
    .from("hackathon_participants")
    .select("id, hackathon_id, team_id, judging_scope_ready")
    .eq("clerk_user_id", clerkUserId)
    .eq("role", "judge")
    .in("hackathon_id", hackathonIds)

  if (!participants || participants.length === 0) return new Map()

  const participantIds = participants.map((p: { id: string }) => p.id)
  const [assignmentResult, eventResult, roundResult] = await Promise.all([
    client.from("judge_assignments")
      .select("id,judge_participant_id,hackathon_id,submission_id,is_complete,round_id,prize_id,scoring_scope,prize:prizes!judge_assignments_prize_id_fkey(judging_style),submission:submissions!judge_assignments_submission_id_fkey!inner(team_id,status)")
      .in("judge_participant_id", participantIds),
    client.from("hackathons").select("id,status,phase,starts_at,ends_at,results_published_at,judging_opens_at,judging_closes_at").in("id", hackathonIds),
    client.from("judging_rounds").select("id,hackathon_id,status,opens_at,closes_at").in("hackathon_id", hackathonIds),
  ])
  const scopedEventIds = [...new Set((assignmentResult.data ?? []).filter((assignment) => !!assignment.scoring_scope).map((assignment) => String(assignment.hackathon_id)))]
  const visibleAssignmentIds = new Map(await Promise.all(scopedEventIds.map(async (eventId) => {
    const visibility = await client.rpc("get_judging_visible_assignment_ids", { p_hackathon_id: eventId })
    if (visibility.error || !Array.isArray(visibility.data) || !visibility.data.every((id): id is string => typeof id === "string")) {
      throw new Error("Could not load your judging progress. Please try again.")
    }
    return [eventId, new Set<string>(visibility.data)] as const
  })))
  type StatsEvent = JudgingWindowEvent & { id: string; status: HackathonStatus; phase: string | null; starts_at?: string | null; ends_at?: string | null; results_published_at: string | null }
  type StatsRound = JudgingWindowRound & { id: string; hackathon_id: string; status: string }
  const now = new Date()
  const events = new Map((eventResult.data as StatsEvent[] | null ?? []).map((event) => [event.id, {
    ...event,
    status: getEffectiveStatusAt({ ...event, starts_at: event.starts_at ?? null, ends_at: event.ends_at ?? null }, now),
  }]))
  const rounds = new Map((roundResult.data as StatsRound[] | null ?? []).map((round) => [round.id, round]))
  const activeRounds = new Map([...rounds.values()].filter((round) => round.status === "active").map((round) => [round.hackathon_id, round]))
  const scheduledAccess = new Map(await Promise.all([...events.values()].filter((event) =>
    resolveJudgingWindow(event, activeRounds.get(event.id), now).state !== "unscheduled",
  ).map(async (event) => [event.id, await isJudgingWindowOpen(event.id, activeRounds.get(event.id)?.id ?? null)] as const)))
  const activeRoundIds = [...activeRounds.values()].map((round) => round.id)
  const { data: finalists } = activeRoundIds.length
    ? await client.from("round_submissions").select("round_id,submission_id").in("round_id", activeRoundIds)
    : { data: [] }
  const finalistIds = new Map<string, Set<string>>()
  for (const finalist of finalists ?? []) {
    const ids = finalistIds.get(finalist.round_id) ?? new Set<string>()
    ids.add(finalist.submission_id)
    finalistIds.set(finalist.round_id, ids)
  }
  const result = new Map<string, JudgeHackathonStats>()
  for (const id of hackathonIds) {
    result.set(id, { hackathonId: id, totalAssignments: 0, completedAssignments: 0, actionableAssignments: 0, hasActiveRound: false })
  }

  for (const [eventId, stats] of result) {
    const event = events.get(eventId)
    const activeRound = activeRounds.get(eventId)
    stats.hasActiveRound = Boolean(activeRound)
    stats.judgingClosed = Boolean(event && (event.results_published_at || ["completed", "archived"].includes(event.status) || resolveJudgingWindow(event, activeRound, now).state === "closed"))
    const assignments = (assignmentResult.data ?? []).filter((assignment) => {
      if (assignment.hackathon_id !== eventId) return false
      if (visibleAssignmentIds.has(eventId) && !visibleAssignmentIds.get(eventId)?.has(assignment.id)) return false
      const judge = participants.find((participant) => participant.id === assignment.judge_participant_id)
      const submission = Array.isArray(assignment.submission) ? assignment.submission[0] : assignment.submission
      return judge && submission?.status === "submitted" && !(judge.team_id && judge.team_id === submission.team_id)
    })
    const toReview = (assignment: (typeof assignments)[number]) => {
      const prize = Array.isArray(assignment.prize) ? assignment.prize[0] : assignment.prize
      return { id: assignment.id, isComplete: Boolean(assignment.is_complete), prizeId: assignment.prize_id ?? null, judgingStyle: prize?.judging_style ?? null }
    }
    const reviews = assignments.map(toReview)
    stats.totalAssignments = countActionableJudgeReviews(reviews.map((review) => ({ ...review, isComplete: false })))
    stats.completedAssignments = stats.totalAssignments - countActionableJudgeReviews(reviews)
    const ready = event && !event.results_published_at && (event.status === "judging" || (event.status === "active" && (event.phase === "preliminaries" || event.phase === "finals" || activeRound || (event.judging_opens_at && event.judging_closes_at))))
    stats.actionableAssignments = !event || !ready || scheduledAccess.get(eventId) === false ? 0 : countActionableJudgeReviews(assignments.filter((assignment) => {
      const judge = participants.find((participant) => participant.id === assignment.judge_participant_id)
      if (judge?.judging_scope_ready === false) return false
      const round = assignment.round_id ? rounds.get(assignment.round_id) : undefined
      if (assignment.round_id && round?.status !== "active") return false
      const activeFinalists = activeRound ? finalistIds.get(activeRound.id) : undefined
      if (activeFinalists && !activeFinalists.has(assignment.submission_id)) return false
      return canWriteJudgingWindow(event, round ?? activeRound, now)
    }).map(toReview))
  }

  return result
}

export type SponsorshipInfo = {
  hackathonId: string
  tier: SponsorTier
  customTierLabel: string | null
  name: string
}

export async function getSponsorshipDetails(
  tenantId: string,
  hackathonIds: string[],
): Promise<Map<string, SponsorshipInfo>> {
  if (hackathonIds.length === 0) return new Map()

  const client = getSupabase() as unknown as SupabaseClient
  const { data, error } = await client
    .from("hackathon_sponsors")
    .select("hackathon_id, tier, custom_tier_label, name")
    .eq("sponsor_tenant_id", tenantId)
    .in("hackathon_id", hackathonIds)

  if (error || !data) return new Map()

  const result = new Map<string, SponsorshipInfo>()
  for (const row of data) {
    result.set(row.hackathon_id, {
      hackathonId: row.hackathon_id,
      tier: row.tier as SponsorTier,
      customTierLabel: row.custom_tier_label ?? null,
      name: row.name,
    })
  }

  return result
}
