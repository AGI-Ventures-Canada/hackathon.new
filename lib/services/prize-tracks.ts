import { supabase as getSupabase } from "@/lib/db/client"
import type { SupabaseClient } from "@supabase/supabase-js"
import type {
  PrizeTrack,
  JudgingRound,
  BucketDefinition,
  BinaryResponse,
  BucketResponse,
  TrackIntent,
  JudgingStyle,
  AdvancementRule,
  RoundStatus,
} from "@/lib/db/hackathon-types"

const DEFAULT_BUCKETS: { level: number; label: string; description: string }[] = [
  { level: 1, label: "Not Ready", description: "No working demo or unclear problem statement" },
  { level: 2, label: "Solid Effort", description: "Working demo, clear problem, but incremental or execution has gaps" },
  { level: 3, label: "Strong Contender", description: "Working demo, novel approach, good execution" },
  { level: 4, label: "Outstanding", description: "Would invest in this team today. Exceptional on multiple dimensions" },
]

const INTENT_TO_STYLE: Record<TrackIntent, JudgingStyle> = {
  overall_winner: "bucket_sort",
  sponsor_prize: "compliance",
  crowd_favorite: "crowd",
  quick_comparison: "head_to_head",
  custom: "bucket_sort",
}

export type CreatePrizeTrackInput = {
  name: string
  description?: string | null
  intent?: TrackIntent
  style?: JudgingStyle
  displayOrder?: number
  sponsorId?: string | null
}

export type UpdatePrizeTrackInput = {
  name?: string
  description?: string | null
  intent?: TrackIntent
  displayOrder?: number
}

export async function listPrizeTracks(hackathonId: string): Promise<PrizeTrack[]> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data, error } = await client
    .from("prize_tracks")
    .select("*")
    .eq("hackathon_id", hackathonId)
    .order("display_order")

  if (error) {
    console.error("Failed to list prize tracks:", error)
    return []
  }

  return data as unknown as PrizeTrack[]
}

export async function getPrizeTrack(
  trackId: string,
  hackathonId?: string,
): Promise<PrizeTrack | null> {
  const client = getSupabase() as unknown as SupabaseClient
  let query = client
    .from("prize_tracks")
    .select("*")
    .eq("id", trackId)
  if (hackathonId) query = query.eq("hackathon_id", hackathonId)
  const { data, error } = await query.maybeSingle()

  if (error || !data) return null
  return data as unknown as PrizeTrack
}

export async function createPrizeTrack(
  hackathonId: string,
  input: CreatePrizeTrackInput
): Promise<PrizeTrack | null> {
  const client = getSupabase() as unknown as SupabaseClient
  const intent = input.intent ?? "custom"
  const style = input.style ?? INTENT_TO_STYLE[intent]

  if (input.sponsorId) {
    const { data: sponsor } = await client
      .from("hackathon_sponsors")
      .select("id")
      .eq("id", input.sponsorId)
      .eq("hackathon_id", hackathonId)
      .maybeSingle()
    if (!sponsor) return null
  }

  const { data: track, error } = await client
    .from("prize_tracks")
    .insert({
      hackathon_id: hackathonId,
      name: input.name,
      description: input.description ?? null,
      intent,
      sponsor_id: input.sponsorId ?? null,
      display_order: input.displayOrder ?? 0,
    })
    .select()
    .single()

  if (error || !track) {
    console.error("Failed to create prize track:", error)
    return null
  }

  const round = await createRound(hackathonId, track.id, {
    name: "Round 1",
    style,
    status: "planned",
  })

  if (round && style === "bucket_sort") {
    await createDefaultBuckets(round.id)
  }

  return track as unknown as PrizeTrack
}

export async function updatePrizeTrack(
  trackId: string,
  hackathonId: string,
  input: UpdatePrizeTrackInput
): Promise<PrizeTrack | null> {
  const client = getSupabase() as unknown as SupabaseClient

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (input.name !== undefined) updates.name = input.name
  if (input.description !== undefined) updates.description = input.description
  if (input.intent !== undefined) updates.intent = input.intent
  if (input.displayOrder !== undefined) updates.display_order = input.displayOrder

  const { data, error } = await client
    .from("prize_tracks")
    .update(updates)
    .eq("id", trackId)
    .eq("hackathon_id", hackathonId)
    .select()
    .single()

  if (error || !data) {
    console.error("Failed to update prize track:", error)
    return null
  }

  return data as unknown as PrizeTrack
}

export async function deletePrizeTrack(trackId: string, hackathonId: string): Promise<boolean> {
  const client = getSupabase() as unknown as SupabaseClient
  const { error } = await client
    .from("prize_tracks")
    .delete()
    .eq("id", trackId)
    .eq("hackathon_id", hackathonId)

  if (error) {
    console.error("Failed to delete prize track:", error)
    return false
  }

  return true
}

// ============================================================
// Rounds
// ============================================================

export type CreateRoundInput = {
  name: string
  style: JudgingStyle
  status?: RoundStatus
  advancement?: AdvancementRule
  advancementConfig?: Record<string, unknown>
  displayOrder?: number
}

export type UpdateRoundInput = {
  name?: string
  style?: JudgingStyle
  status?: RoundStatus
  advancement?: AdvancementRule
  advancementConfig?: Record<string, unknown>
  displayOrder?: number
}

export async function listRounds(prizeTrackId: string): Promise<JudgingRound[]> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data, error } = await client
    .from("judging_rounds")
    .select("*")
    .eq("prize_track_id", prizeTrackId)
    .order("display_order")

  if (error) {
    console.error("Failed to list rounds:", error)
    return []
  }

  return data as unknown as JudgingRound[]
}

export async function getRound(roundId: string): Promise<JudgingRound | null> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data, error } = await client
    .from("judging_rounds")
    .select("*")
    .eq("id", roundId)
    .maybeSingle()

  if (error || !data) return null
  return data as unknown as JudgingRound
}

export async function createRound(
  hackathonId: string,
  prizeTrackId: string,
  input: CreateRoundInput
): Promise<JudgingRound | null> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data: track } = await client
    .from("prize_tracks")
    .select("id")
    .eq("id", prizeTrackId)
    .eq("hackathon_id", hackathonId)
    .maybeSingle()
  if (!track) return null

  const { data, error } = await client
    .from("judging_rounds")
    .insert({
      hackathon_id: hackathonId,
      prize_track_id: prizeTrackId,
      name: input.name,
      style: input.style,
      status: input.status ?? "planned",
      advancement: input.advancement ?? "manual",
      advancement_config: input.advancementConfig ?? {},
      display_order: input.displayOrder ?? 0,
    })
    .select()
    .single()

  if (error || !data) {
    console.error("Failed to create round:", error)
    return null
  }

  return data as unknown as JudgingRound
}

export async function updateRound(
  roundId: string,
  input: UpdateRoundInput,
  hackathonId?: string,
  prizeTrackId?: string,
): Promise<JudgingRound | null> {
  const client = getSupabase() as unknown as SupabaseClient

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (input.name !== undefined) updates.name = input.name
  if (input.style !== undefined) updates.style = input.style
  if (input.status !== undefined) updates.status = input.status
  if (input.advancement !== undefined) updates.advancement = input.advancement
  if (input.advancementConfig !== undefined) updates.advancement_config = input.advancementConfig
  if (input.displayOrder !== undefined) updates.display_order = input.displayOrder

  let query = client
    .from("judging_rounds")
    .update(updates)
    .eq("id", roundId)
  if (hackathonId) query = query.eq("hackathon_id", hackathonId)
  if (prizeTrackId) query = query.eq("prize_track_id", prizeTrackId)
  const { data, error } = await query.select()
    .single()

  if (error || !data) {
    console.error("Failed to update round:", error)
    return null
  }

  return data as unknown as JudgingRound
}

export async function activateRound(
  roundId: string,
  prizeTrackId: string,
  hackathonId: string,
): Promise<boolean> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data: round } = await client
    .from("judging_rounds")
    .select("id")
    .eq("id", roundId)
    .eq("prize_track_id", prizeTrackId)
    .eq("hackathon_id", hackathonId)
    .maybeSingle()
  if (!round) return false

  const { data, error } = await client.rpc("activate_judging_round", {
    p_hackathon_id: hackathonId,
    p_round_id: roundId,
  })
  if (error || data !== true) {
    console.error("Failed to activate round:", error)
    return false
  }

  return true
}

// ============================================================
// Bucket Definitions
// ============================================================

export async function listBucketDefinitions(roundId: string): Promise<BucketDefinition[]> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data, error } = await client
    .from("bucket_definitions")
    .select("*")
    .eq("round_id", roundId)
    .order("level")

  if (error) {
    console.error("Failed to list bucket definitions:", error)
    return []
  }

  return data as unknown as BucketDefinition[]
}

export async function createDefaultBuckets(roundId: string): Promise<BucketDefinition[]> {
  const client = getSupabase() as unknown as SupabaseClient
  const inserts = DEFAULT_BUCKETS.map((b) => ({
    round_id: roundId,
    level: b.level,
    label: b.label,
    description: b.description,
    display_order: b.level,
  }))

  const { data, error } = await client
    .from("bucket_definitions")
    .insert(inserts)
    .select()

  if (error) {
    console.error("Failed to create default buckets:", error)
    return []
  }

  return data as unknown as BucketDefinition[]
}

export type UpsertBucketInput = {
  id?: string
  level: number
  label: string
  description?: string | null
}

export async function replaceRoundBucketDefinitions(
  roundId: string,
  buckets: UpsertBucketInput[],
  hackathonId?: string,
  prizeTrackId?: string,
): Promise<BucketDefinition[]> {
  const client = getSupabase() as unknown as SupabaseClient

  if (hackathonId || prizeTrackId) {
    let roundQuery = client.from("judging_rounds").select("id").eq("id", roundId)
    if (hackathonId) roundQuery = roundQuery.eq("hackathon_id", hackathonId)
    if (prizeTrackId) roundQuery = roundQuery.eq("prize_track_id", prizeTrackId)
    const { data: round } = await roundQuery.maybeSingle()
    if (!round) return []
  }

  const { error: deleteError } = await client
    .from("bucket_definitions")
    .delete()
    .eq("round_id", roundId)

  if (deleteError) {
    console.error("Failed to clear bucket definitions:", deleteError)
    return []
  }

  const inserts = buckets.map((b, i) => ({
    round_id: roundId,
    level: b.level,
    label: b.label,
    description: b.description ?? null,
    display_order: i,
  }))

  const { data, error } = await client
    .from("bucket_definitions")
    .insert(inserts)
    .select()

  if (error) {
    console.error("Failed to insert bucket definitions:", error)
    return []
  }

  return data as unknown as BucketDefinition[]
}

// ============================================================
// Bucket Responses (judge places submission into a bucket)
// ============================================================

export type SubmitBucketResponseInput = {
  bucketId: string
  notes?: string | null
}

export async function submitBucketResponse(
  assignmentId: string,
  input: SubmitBucketResponseInput
): Promise<BucketResponse | null> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data: assignment } = await client
    .from("judge_assignments")
    .select("prize_id, round_id")
    .eq("id", assignmentId)
    .maybeSingle()
  if (!assignment) return null

  let bucketQuery = client.from("bucket_definitions").select("id").eq("id", input.bucketId)
  if (assignment.prize_id) bucketQuery = bucketQuery.eq("prize_id", assignment.prize_id)
  else if (assignment.round_id) bucketQuery = bucketQuery.eq("round_id", assignment.round_id)
  else return null
  const { data: bucket } = await bucketQuery.maybeSingle()
  if (!bucket) return null

  const { data, error } = await client
    .from("bucket_responses")
    .upsert(
      {
        judge_assignment_id: assignmentId,
        bucket_id: input.bucketId,
        notes: input.notes ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "judge_assignment_id" }
    )
    .select()
    .single()

  if (error || !data) {
    console.error("Failed to submit bucket response:", error)
    return null
  }

  return data as unknown as BucketResponse
}

export async function getBucketResponse(assignmentId: string): Promise<BucketResponse | null> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data, error } = await client
    .from("bucket_responses")
    .select("*")
    .eq("judge_assignment_id", assignmentId)
    .maybeSingle()

  if (error || !data) return null
  return data as unknown as BucketResponse
}

// ============================================================
// Binary Responses (judge answers yes/no per gate criterion)
// ============================================================

export type SubmitBinaryResponseInput = {
  criteriaId: string
  passed: boolean
}

export type SubmitBinaryResponsesResult =
  | { success: true; results: BinaryResponse[] }
  | {
      success: false
      error: string
      code: "partial_save" | "invalid_response"
      savedCount: number
      totalCount: number
      results: BinaryResponse[]
    }

export async function submitBinaryResponses(
  assignmentId: string,
  responses: SubmitBinaryResponseInput[]
): Promise<SubmitBinaryResponsesResult> {
  const client = getSupabase() as unknown as SupabaseClient
  const now = new Date().toISOString()

  const uniqueCriteriaIds = [...new Set(responses.map((response) => response.criteriaId))]
  if (responses.length === 0 || uniqueCriteriaIds.length !== responses.length) {
    return {
      success: false,
      error: "Every gate must be answered exactly once",
      code: "invalid_response",
      savedCount: 0,
      totalCount: responses.length,
      results: [],
    }
  }

  const { data: assignment } = await client
    .from("judge_assignments")
    .select("hackathon_id, prize_id")
    .eq("id", assignmentId)
    .maybeSingle()
  if (!assignment?.prize_id) {
    return { success: false, error: "This assignment has no gate criteria", code: "invalid_response", savedCount: 0, totalCount: responses.length, results: [] }
  }

  const { data: criteria } = await client
    .from("judging_criteria")
    .select("id")
    .eq("hackathon_id", assignment.hackathon_id)
    .eq("prize_id", assignment.prize_id)
  const configuredCriteriaIds = new Set((criteria ?? []).map((criterion: { id: string }) => criterion.id))
  if (
    configuredCriteriaIds.size !== uniqueCriteriaIds.length ||
    uniqueCriteriaIds.some((criteriaId) => !configuredCriteriaIds.has(criteriaId))
  ) {
    return { success: false, error: "Answer every gate shown for this assignment", code: "invalid_response", savedCount: 0, totalCount: responses.length, results: [] }
  }

  const upserts = responses.map((r) => ({
    judge_assignment_id: assignmentId,
    criteria_id: r.criteriaId,
    passed: r.passed,
    updated_at: now,
  }))

  const results: BinaryResponse[] = []
  for (const upsert of upserts) {
    const { data, error } = await client
      .from("binary_responses")
      .upsert(upsert, { onConflict: "judge_assignment_id,criteria_id" })
      .select()
      .single()

    if (error) {
      console.error("Failed to submit binary response:", error)
      return {
        success: false,
        error: `Saved ${results.length} of ${upserts.length} responses before failing on criterion ${upsert.criteria_id}`,
        code: "partial_save",
        savedCount: results.length,
        totalCount: upserts.length,
        results,
      }
    }
    results.push(data as unknown as BinaryResponse)
  }

  return { success: true, results }
}

export async function listBinaryResponses(assignmentId: string): Promise<BinaryResponse[]> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data, error } = await client
    .from("binary_responses")
    .select("*")
    .eq("judge_assignment_id", assignmentId)

  if (error) {
    console.error("Failed to list binary responses:", error)
    return []
  }

  return data as unknown as BinaryResponse[]
}

// ============================================================
// Combined submission for bucket sort (gates + bucket in one call)
// ============================================================

export type SubmitBucketSortInput = {
  gates: SubmitBinaryResponseInput[]
  bucketId: string
  notes?: string | null
}

export async function submitBucketSortResponse(
  assignmentId: string,
  input: SubmitBucketSortInput
): Promise<{ success: true } | { success: false; error: string; code: string }> {
  const client = getSupabase() as unknown as SupabaseClient

  if (input.gates.length > 0) {
    const gatesResult = await submitBinaryResponses(assignmentId, input.gates)
    if (!gatesResult.success) {
      return { success: false, error: gatesResult.error, code: gatesResult.code }
    }
  }

  const bucketResult = await submitBucketResponse(assignmentId, {
    bucketId: input.bucketId,
    notes: input.notes,
  })

  if (!bucketResult) {
    return { success: false, error: "Failed to submit bucket response", code: "bucket_failed" }
  }

  const { error } = await client
    .from("judge_assignments")
    .update({
      is_complete: true,
      completed_at: new Date().toISOString(),
    })
    .eq("id", assignmentId)

  if (error) {
    console.error("Failed to mark assignment complete:", error)
    return { success: false, error: "Failed to mark assignment complete", code: "update_failed" }
  }

  return { success: true }
}

// ============================================================
// Combined submission for gate check (just gates)
// ============================================================

export async function submitGateCheckResponse(
  assignmentId: string,
  gates: SubmitBinaryResponseInput[]
): Promise<{ success: true } | { success: false; error: string; code: string }> {
  const client = getSupabase() as unknown as SupabaseClient

  const gatesResult = await submitBinaryResponses(assignmentId, gates)
  if (!gatesResult.success) {
    return { success: false, error: gatesResult.error, code: gatesResult.code }
  }

  const { error } = await client
    .from("judge_assignments")
    .update({
      is_complete: true,
      completed_at: new Date().toISOString(),
    })
    .eq("id", assignmentId)

  if (error) {
    console.error("Failed to mark assignment complete:", error)
    return { success: false, error: "Failed to mark assignment complete", code: "update_failed" }
  }

  return { success: true }
}

// ============================================================
// Track progress and results
// ============================================================

export type TrackProgress = {
  trackId: string
  trackName: string
  intent: TrackIntent
  style: JudgingStyle | null
  totalAssignments: number
  completedAssignments: number
  criteriaCount: number
  judgeCount: number
}

export async function getTrackProgress(hackathonId: string): Promise<TrackProgress[]> {
  const client = getSupabase() as unknown as SupabaseClient

  const tracks = await listPrizeTracks(hackathonId)
  const results: TrackProgress[] = []

  for (const track of tracks) {
    const rounds = await listRounds(track.id)
    const activeRound = rounds.find((r) => r.status === "active") ?? rounds[0]

    let totalAssignments = 0
    let completedAssignments = 0
    let criteriaCount = 0
    let judgeCount = 0

    if (activeRound) {
      const { data: assignments } = await client
        .from("judge_assignments")
        .select("is_complete, judge_participant_id")
        .eq("hackathon_id", hackathonId)
        .eq("round_id", activeRound.id)

      totalAssignments = assignments?.length ?? 0
      completedAssignments = assignments?.filter((a) => a.is_complete).length ?? 0

      const uniqueJudges = new Set(assignments?.map((a) => a.judge_participant_id) ?? [])
      judgeCount = uniqueJudges.size

      const { data: criteria } = await client
        .from("judging_criteria")
        .select("id")
        .eq("hackathon_id", hackathonId)
        .eq("round_id", activeRound.id)

      criteriaCount = criteria?.length ?? 0
    }

    results.push({
      trackId: track.id,
      trackName: track.name,
      intent: track.intent,
      style: activeRound?.style ?? null,
      totalAssignments,
      completedAssignments,
      criteriaCount,
      judgeCount,
    })
  }

  return results
}

export type TrackWithRoundsAndBuckets = PrizeTrack & {
  rounds: (JudgingRound & { buckets: BucketDefinition[] })[]
}

export async function getPrizeTrackWithDetails(
  trackId: string,
  hackathonId?: string,
): Promise<TrackWithRoundsAndBuckets | null> {
  const track = await getPrizeTrack(trackId, hackathonId)
  if (!track) return null

  const rounds = await listRounds(trackId)
  const roundsWithBuckets = await Promise.all(
    rounds.map(async (round) => {
      const buckets = round.style === "bucket_sort"
        ? await listBucketDefinitions(round.id)
        : []
      return { ...round, buckets }
    })
  )

  return { ...track, rounds: roundsWithBuckets }
}

// ============================================================
// Result calculation for bucket sort
// ============================================================

export async function calculateBucketSortResults(
  hackathonId: string,
  roundId: string,
  prizeTrackId: string
): Promise<{ success: boolean; count: number }> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: deletedRows, error: deleteError } = await client
    .from("hackathon_results")
    .delete()
    .eq("hackathon_id", hackathonId)
    .eq("prize_track_id", prizeTrackId)
    .eq("round_id", roundId)
    .select("*")

  if (deleteError) {
    console.error("Failed to clear existing results:", deleteError)
    return { success: false, count: 0 }
  }

  const { data: assignments } = await client
    .from("judge_assignments")
    .select("id, submission_id")
    .eq("hackathon_id", hackathonId)
    .eq("round_id", roundId)
    .eq("is_complete", true)

  if (!assignments || assignments.length === 0) {
    return { success: true, count: 0 }
  }

  const assignmentIds = assignments.map((a) => a.id)

  const { data: bucketResponses } = await client
    .from("bucket_responses")
    .select("judge_assignment_id, bucket_id")
    .in("judge_assignment_id", assignmentIds)

  const { data: bucketDefs } = await client
    .from("bucket_definitions")
    .select("id, level")
    .eq("round_id", roundId)

  if (!bucketResponses || !bucketDefs) {
    if (deletedRows && deletedRows.length > 0) await client.from("hackathon_results").insert(deletedRows)
    return { success: false, count: 0 }
  }

  const bucketLevelMap = new Map(bucketDefs.map((b) => [b.id, b.level]))
  const assignmentSubmissionMap = new Map(assignments.map((a) => [a.id, a.submission_id]))

  const submissionScores: Record<string, { totalLevel: number; judgeCount: number }> = {}

  for (const resp of bucketResponses) {
    const submissionId = assignmentSubmissionMap.get(resp.judge_assignment_id)
    const level = bucketLevelMap.get(resp.bucket_id)
    if (!submissionId || level === undefined) continue

    if (!submissionScores[submissionId]) {
      submissionScores[submissionId] = { totalLevel: 0, judgeCount: 0 }
    }
    submissionScores[submissionId].totalLevel += level
    submissionScores[submissionId].judgeCount++
  }

  const ranked = Object.entries(submissionScores)
    .map(([submissionId, { totalLevel, judgeCount }]) => ({
      submissionId,
      avgLevel: totalLevel / judgeCount,
      totalLevel,
      judgeCount,
    }))
    .sort((a, b) => b.avgLevel - a.avgLevel)

  let currentRank = 1
  const inserts = ranked.map((r, i) => {
    if (i > 0 && r.avgLevel < ranked[i - 1].avgLevel) {
      currentRank = i + 1
    }
    return {
      hackathon_id: hackathonId,
      submission_id: r.submissionId,
      rank: currentRank,
      total_score: r.totalLevel,
      weighted_score: r.avgLevel,
      judge_count: r.judgeCount,
      prize_track_id: prizeTrackId,
      round_id: roundId,
    }
  })

  if (inserts.length === 0) {
    return { success: true, count: 0 }
  }

  const { error: insertError } = await client
    .from("hackathon_results")
    .insert(inserts)

  if (insertError) {
    console.error("Failed to insert bucket sort results:", insertError)
    if (deletedRows && deletedRows.length > 0) await client.from("hackathon_results").insert(deletedRows)
    return { success: false, count: 0 }
  }

  return { success: true, count: inserts.length }
}

// ============================================================
// Result calculation for gate check
// ============================================================

export async function calculateGateCheckResults(
  hackathonId: string,
  roundId: string,
  prizeTrackId: string
): Promise<{ success: boolean; count: number }> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: deletedRows, error: deleteError } = await client
    .from("hackathon_results")
    .delete()
    .eq("hackathon_id", hackathonId)
    .eq("prize_track_id", prizeTrackId)
    .eq("round_id", roundId)
    .select("*")

  if (deleteError) {
    console.error("Failed to clear existing results:", deleteError)
    return { success: false, count: 0 }
  }

  const { data: assignments } = await client
    .from("judge_assignments")
    .select("id, submission_id")
    .eq("hackathon_id", hackathonId)
    .eq("round_id", roundId)
    .eq("is_complete", true)

  if (!assignments || assignments.length === 0) {
    return { success: true, count: 0 }
  }

  const assignmentIds = assignments.map((a) => a.id)

  const { data: binaryResponses } = await client
    .from("binary_responses")
    .select("judge_assignment_id, passed")
    .in("judge_assignment_id", assignmentIds)

  if (!binaryResponses) {
    if (deletedRows && deletedRows.length > 0) await client.from("hackathon_results").insert(deletedRows)
    return { success: false, count: 0 }
  }

  const assignmentSubmissionMap = new Map(assignments.map((a) => [a.id, a.submission_id]))

  const submissionGates: Record<string, { passed: number; total: number; judgeCount: number }> = {}

  const assignmentPassCounts: Record<string, { passed: number; total: number }> = {}
  for (const resp of binaryResponses) {
    if (!assignmentPassCounts[resp.judge_assignment_id]) {
      assignmentPassCounts[resp.judge_assignment_id] = { passed: 0, total: 0 }
    }
    assignmentPassCounts[resp.judge_assignment_id].total++
    if (resp.passed) assignmentPassCounts[resp.judge_assignment_id].passed++
  }

  for (const [assignmentId, counts] of Object.entries(assignmentPassCounts)) {
    const submissionId = assignmentSubmissionMap.get(assignmentId)
    if (!submissionId) continue

    if (!submissionGates[submissionId]) {
      submissionGates[submissionId] = { passed: 0, total: 0, judgeCount: 0 }
    }
    submissionGates[submissionId].passed += counts.passed
    submissionGates[submissionId].total += counts.total
    submissionGates[submissionId].judgeCount++
  }

  const ranked = Object.entries(submissionGates)
    .map(([submissionId, { passed, total, judgeCount }]) => ({
      submissionId,
      passRate: total > 0 ? passed / total : 0,
      totalPassed: passed,
      judgeCount,
    }))
    .sort((a, b) => b.passRate - a.passRate || b.totalPassed - a.totalPassed)

  let currentRank = 1
  const inserts = ranked.map((r, i) => {
    if (i > 0 && (r.passRate < ranked[i - 1].passRate || r.totalPassed < ranked[i - 1].totalPassed)) {
      currentRank = i + 1
    }
    return {
      hackathon_id: hackathonId,
      submission_id: r.submissionId,
      rank: currentRank,
      total_score: r.totalPassed,
      weighted_score: r.passRate,
      judge_count: r.judgeCount,
      prize_track_id: prizeTrackId,
      round_id: roundId,
    }
  })

  if (inserts.length === 0) {
    return { success: true, count: 0 }
  }

  const { error: insertError } = await client
    .from("hackathon_results")
    .insert(inserts)

  if (insertError) {
    console.error("Failed to insert gate check results:", insertError)
    if (deletedRows && deletedRows.length > 0) await client.from("hackathon_results").insert(deletedRows)
    return { success: false, count: 0 }
  }

  return { success: true, count: inserts.length }
}

// ============================================================
// Judge's view: get track assignments
// ============================================================

export type JudgeTrackAssignment = {
  trackId: string
  trackName: string
  intent: TrackIntent
  style: JudgingStyle | null
  roundId: string
  roundName: string
  totalAssignments: number
  completedAssignments: number
}

export async function getJudgeTrackAssignments(
  hackathonId: string,
  judgeParticipantId: string
): Promise<JudgeTrackAssignment[]> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: assignments } = await client
    .from("judge_assignments")
    .select("round_id, is_complete")
    .eq("hackathon_id", hackathonId)
    .eq("judge_participant_id", judgeParticipantId)
    .not("round_id", "is", null)

  if (!assignments || assignments.length === 0) return []

  const roundIds = [...new Set(assignments.map((a) => a.round_id).filter(Boolean))] as string[]

  const { data: rounds } = await client
    .from("judging_rounds")
    .select("id, name, style, prize_track_id, status")
    .in("id", roundIds)

  if (!rounds) return []

  const trackIds = [...new Set(rounds.map((r) => r.prize_track_id).filter(Boolean))] as string[]

  const { data: tracks } = await client
    .from("prize_tracks")
    .select("id, name, intent")
    .in("id", trackIds)

  if (!tracks) return []

  const trackMap = new Map(tracks.map((t) => [t.id, t]))
  const roundMap = new Map(rounds.map((r) => [r.id, r]))

  const roundAssignmentCounts: Record<string, { total: number; completed: number }> = {}
  for (const a of assignments) {
    if (!a.round_id) continue
    if (!roundAssignmentCounts[a.round_id]) {
      roundAssignmentCounts[a.round_id] = { total: 0, completed: 0 }
    }
    roundAssignmentCounts[a.round_id].total++
    if (a.is_complete) roundAssignmentCounts[a.round_id].completed++
  }

  return roundIds
    .map((roundId) => {
      const round = roundMap.get(roundId)
      if (!round?.prize_track_id) return null
      const track = trackMap.get(round.prize_track_id)
      if (!track) return null

      const counts = roundAssignmentCounts[roundId] ?? { total: 0, completed: 0 }

      return {
        trackId: track.id,
        trackName: track.name,
        intent: track.intent as TrackIntent,
        style: round.style as JudgingStyle | null,
        roundId: round.id,
        roundName: round.name,
        totalAssignments: counts.total,
        completedAssignments: counts.completed,
      }
    })
    .filter((t): t is JudgeTrackAssignment => t !== null)
}

// ============================================================
// Track Workflow Data (for prize workflow canvas)
// ============================================================

export type TrackJudgeInfo = {
  participantId: string
  name: string
  imageUrl: string | null
}

export type TrackRoundInfo = {
  id: string
  name: string
  style: JudgingStyle | null
  status: RoundStatus
  advancement: AdvancementRule
  isActive: boolean
  totalAssignments: number
  completedAssignments: number
  judges: TrackJudgeInfo[]
}

export type TrackWinnerInfo = {
  rank: number
  submissionId: string
  submissionTitle: string
  teamName: string | null
  weightedScore: number | null
  prizes: string[]
}

export type TrackWorkflowData = {
  trackId: string
  trackName: string
  intent: TrackIntent
  description: string | null
  rounds: TrackRoundInfo[]
  winners: TrackWinnerInfo[]
}

export async function getTrackWorkflowData(hackathonId: string): Promise<TrackWorkflowData[]> {
  const client = getSupabase() as unknown as SupabaseClient

  const tracks = await listPrizeTracks(hackathonId)
  const results: TrackWorkflowData[] = []
  const allParticipantIds = new Set<string>()
  const roundJudgeIds = new Map<string, string[]>()

  for (const track of tracks) {
    const rounds = await listRounds(track.id)

    const roundInfos: TrackRoundInfo[] = []
    for (const round of rounds) {
      const { data: assignments } = await client
        .from("judge_assignments")
        .select("is_complete, judge_participant_id")
        .eq("hackathon_id", hackathonId)
        .eq("round_id", round.id)

      const uniqueJudgeIds = [...new Set((assignments ?? []).map((a) => a.judge_participant_id))]
      uniqueJudgeIds.forEach((id) => allParticipantIds.add(id))
      roundJudgeIds.set(round.id, uniqueJudgeIds)

      roundInfos.push({
        id: round.id,
        name: round.name,
        style: round.style as JudgingStyle | null,
        status: round.status as RoundStatus,
        advancement: round.advancement as AdvancementRule,
        isActive: round.is_active,
        totalAssignments: assignments?.length ?? 0,
        completedAssignments: assignments?.filter((a) => a.is_complete).length ?? 0,
        judges: [],
      })
    }

    const { data: trackResults } = await client
      .from("hackathon_results")
      .select("rank, submission_id, weighted_score, total_score")
      .eq("hackathon_id", hackathonId)
      .eq("prize_track_id", track.id)
      .order("rank")
      .limit(5)

    let winners: TrackWinnerInfo[] = []
    if (trackResults && trackResults.length > 0) {
      const subIds = trackResults.map((r) => r.submission_id)
      const { data: subs } = await client
        .from("submissions")
        .select("id, title, team_id")
        .in("id", subIds)

      const teamIds = (subs ?? []).map((s) => s.team_id).filter((id): id is string => id !== null)
      let teamsMap: Record<string, string> = {}
      if (teamIds.length > 0) {
        const { data: teams } = await client.from("teams").select("id, name").in("id", teamIds)
        teamsMap = Object.fromEntries((teams ?? []).map((t) => [t.id, t.name]))
      }

      const { data: prizeAssignments } = await client
        .from("prize_assignments")
        .select("submission_id, prize:prizes!prize_id(name)")
        .in("submission_id", subIds)

      const prizeMap = new Map<string, string[]>()
      for (const pa of (prizeAssignments ?? []) as unknown as Array<{ submission_id: string; prize: { name: string } | null }>) {
        if (pa.prize?.name) {
          const existing = prizeMap.get(pa.submission_id) ?? []
          existing.push(pa.prize.name)
          prizeMap.set(pa.submission_id, existing)
        }
      }

      const subMap = new Map((subs ?? []).map((s) => [s.id, s]))

      winners = trackResults.map((r) => {
        const sub = subMap.get(r.submission_id)
        return {
          rank: r.rank,
          submissionId: r.submission_id,
          submissionTitle: sub?.title ?? "Unknown",
          teamName: sub?.team_id ? teamsMap[sub.team_id] ?? null : null,
          weightedScore: r.weighted_score,
          prizes: prizeMap.get(r.submission_id) ?? [],
        }
      })
    }

    results.push({
      trackId: track.id,
      trackName: track.name,
      intent: track.intent,
      description: track.description,
      rounds: roundInfos,
      winners,
    })
  }

  // Batch-fetch judge profiles (single Clerk API call for all judges)
  if (allParticipantIds.size > 0) {
    const judgeProfileMap = new Map<string, { name: string; imageUrl: string | null }>()

    const { data: participants } = await client
      .from("hackathon_participants")
      .select("id, clerk_user_id")
      .in("id", [...allParticipantIds])

    if (participants && participants.length > 0) {
      try {
        const { clerkClient } = await import("@clerk/nextjs/server")
        const clerk = await clerkClient()
        const clerkUserIds = participants.map((p) => p.clerk_user_id)
        const clerkUsers = await clerk.users.getUserList({ userId: clerkUserIds, limit: 100 })

        const clerkMap = new Map(
          clerkUsers.data.map((u) => [
            u.id,
            {
              name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.username || u.id,
              imageUrl: u.imageUrl ?? null,
            },
          ])
        )

        for (const p of participants) {
          const profile = clerkMap.get(p.clerk_user_id)
          if (profile) judgeProfileMap.set(p.id, profile)
        }
      } catch (err) {
        console.error("Failed to fetch Clerk users for track workflow:", err)
      }
    }

    for (const result of results) {
      for (const roundInfo of result.rounds) {
        const pIds = roundJudgeIds.get(roundInfo.id) ?? []
        roundInfo.judges = pIds.map((pid) => ({
          participantId: pid,
          name: judgeProfileMap.get(pid)?.name ?? "Judge",
          imageUrl: judgeProfileMap.get(pid)?.imageUrl ?? null,
        }))
      }
    }
  }

  return results
}
