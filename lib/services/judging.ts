import { supabase as getSupabase } from "@/lib/db/client"
import type { SupabaseClient } from "@supabase/supabase-js"
import type {
  Prize,
  BucketDefinition,
  BinaryResponse,
  PrizeJudgingStyle,
  PrizeAssignmentMode,
} from "@/lib/db/hackathon-types"

const DEFAULT_BUCKETS = [
  { level: 1, label: "Not Ready", description: "No working demo or unclear problem statement" },
  { level: 2, label: "Solid Effort", description: "Working demo, clear problem, but incremental or execution has gaps" },
  { level: 3, label: "Strong Contender", description: "Working demo, novel approach, good execution" },
  { level: 4, label: "Outstanding", description: "Would invest in this team today. Exceptional on multiple dimensions" },
]

// ============================================================
// Prize CRUD
// ============================================================

export type CreatePrizeInput = {
  name: string
  description?: string | null
  value?: string | null
  judgingStyle?: PrizeJudgingStyle
  roundId?: string | null
  assignmentMode?: PrizeAssignmentMode
  maxPicks?: number
  displayOrder?: number
  isScreening?: boolean
  type?: "score" | "favorite" | "crowd" | "criteria"
  rank?: number | null
  kind?: string
  monetaryValue?: number | null
  currency?: string | null
  criteriaId?: string | null
  criteria?: {
    name: string
    description?: string | null
    weight?: number
    minScore?: number
    maxScore?: number
  }[]
  buckets?: { level: number; label: string; description?: string | null }[]
  distributionMethod?: string | null
  displayValue?: string | null
}

export type UpdatePrizeInput = {
  name?: string
  description?: string | null
  value?: string | null
  judgingStyle?: PrizeJudgingStyle
  roundId?: string | null
  assignmentMode?: PrizeAssignmentMode
  maxPicks?: number
  displayOrder?: number
  type?: "score" | "favorite" | "crowd" | "criteria"
  rank?: number | null
  kind?: string
  monetaryValue?: number | null
  currency?: string | null
  criteriaId?: string | null
  distributionMethod?: string | null
  displayValue?: string | null
}

export type PrizeCriterion = {
  id: string
  name: string
  description: string | null
  displayOrder: number
}

export type PrizeWithProgress = Prize & {
  judgeCount: number
  totalAssignments: number
  completedAssignments: number
  buckets?: BucketDefinition[]
  criteria?: PrizeCriterion[]
  sponsorName?: string | null
}

type JudgingSetupPrize = Pick<Prize, "id" | "name" | "judging_style" | "max_picks">

type JudgingSetupCriterion = {
  prize_id: string | null
  weight: number
  min_score: number
  max_score: number
}

type JudgingSetupBucket = {
  prize_id: string
  label: string
}

export type JudgingSetupStatus = {
  isReady: boolean
  issues: string[]
}

export function evaluateJudgingSetup(
  prizes: JudgingSetupPrize[],
  criteria: JudgingSetupCriterion[],
  buckets: JudgingSetupBucket[],
): JudgingSetupStatus {
  const judgedPrizes = prizes.filter((prize) => prize.judging_style !== null)
  const issues: string[] = []

  if (judgedPrizes.length === 0) {
    issues.push("Pick how judges should score at least one prize.")
  }

  const coreCriteria = criteria.filter((criterion) => criterion.prize_id === null)

  for (const prize of judgedPrizes) {
    const prizeCriteria = criteria.filter((criterion) => criterion.prize_id === prize.id)

    if (prize.judging_style === "weighted_score") {
      const scoringCriteria = [...coreCriteria, ...prizeCriteria]
      if (scoringCriteria.length === 0) {
        issues.push(`Add score categories for ${prize.name}.`)
        continue
      }

      if (scoringCriteria.some((criterion) => criterion.weight <= 0)) {
        issues.push(`Give every score category for ${prize.name} a weight above 0.`)
      }

      if (scoringCriteria.some((criterion) => criterion.min_score >= criterion.max_score)) {
        issues.push(`Fix the lowest and highest scores for ${prize.name}.`)
      }

      const totalWeight = scoringCriteria.reduce((sum, criterion) => sum + criterion.weight, 0)
      if (Math.abs(totalWeight - 100) > 0.01) {
        issues.push(`Make the score weights for ${prize.name} add up to 100%.`)
      }
    }

    if (prize.judging_style === "gate_check" && prizeCriteria.length === 0) {
      issues.push(`Add at least one check for ${prize.name}.`)
    }

    if (
      prize.judging_style === "bucket_sort" &&
      buckets.filter((bucket) => bucket.prize_id === prize.id && bucket.label.trim().length > 0).length < 2
    ) {
      issues.push(`Add at least two sort groups for ${prize.name}.`)
    }

    if (
      prize.judging_style === "judges_pick" &&
      (!prize.max_picks || prize.max_picks < 1 || prize.max_picks > 100)
    ) {
      issues.push(`Set picks for ${prize.name} between 1 and 100.`)
    }
  }

  return { isReady: issues.length === 0, issues }
}

export async function getJudgingSetupStatus(hackathonId: string): Promise<JudgingSetupStatus> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data: prizes, error: prizesError } = await client
    .from("prizes")
    .select("id, name, judging_style, max_picks")
    .eq("hackathon_id", hackathonId)

  if (prizesError || !prizes) {
    console.error("Failed to check judging prizes:", prizesError)
    return { isReady: false, issues: ["We couldn't check scoring setup. Try again."] }
  }

  const bucketPrizeIds = prizes
    .filter((prize) => prize.judging_style === "bucket_sort")
    .map((prize) => prize.id)

  const [criteriaResult, bucketsResult] = await Promise.all([
    client
      .from("judging_criteria")
      .select("prize_id, weight, min_score, max_score")
      .eq("hackathon_id", hackathonId),
    bucketPrizeIds.length > 0
      ? client
          .from("bucket_definitions")
          .select("prize_id, label")
          .in("prize_id", bucketPrizeIds)
      : Promise.resolve({ data: [] as JudgingSetupBucket[], error: null }),
  ])

  if (criteriaResult.error || bucketsResult.error) {
    console.error("Failed to check judging rules:", criteriaResult.error ?? bucketsResult.error)
    return { isReady: false, issues: ["We couldn't check scoring setup. Try again."] }
  }

  return evaluateJudgingSetup(
    prizes as unknown as JudgingSetupPrize[],
    (criteriaResult.data ?? []) as JudgingSetupCriterion[],
    (bucketsResult.data ?? []) as JudgingSetupBucket[],
  )
}

export async function listPrizes(hackathonId: string): Promise<PrizeWithProgress[]> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: prizes, error } = await client
    .from("prizes")
    .select("*")
    .eq("hackathon_id", hackathonId)
    .order("display_order")

  if (error || !prizes) {
    console.error("Failed to list prizes:", error)
    return []
  }

  const prizeIds = prizes.map((p) => p.id)
  if (prizeIds.length === 0) return []

  const { data: assignments } = await client
    .from("judge_assignments")
    .select("prize_id, judge_participant_id, is_complete")
    .in("prize_id", prizeIds)

  const prizeStats: Record<string, { judges: Set<string>; total: number; completed: number }> = {}
  for (const a of assignments ?? []) {
    if (!a.prize_id) continue
    if (!prizeStats[a.prize_id]) prizeStats[a.prize_id] = { judges: new Set(), total: 0, completed: 0 }
    prizeStats[a.prize_id].judges.add(a.judge_participant_id)
    prizeStats[a.prize_id].total++
    if (a.is_complete) prizeStats[a.prize_id].completed++
  }

  const bucketSortPrizeIds = prizes.filter((p) => p.judging_style === "bucket_sort").map((p) => p.id)
  const bucketMap: Record<string, BucketDefinition[]> = {}
  if (bucketSortPrizeIds.length > 0) {
    const { data: buckets } = await client
      .from("bucket_definitions")
      .select("*")
      .in("prize_id", bucketSortPrizeIds)
      .order("level")

    for (const b of (buckets ?? []) as unknown as BucketDefinition[]) {
      if (!b.prize_id) continue
      if (!bucketMap[b.prize_id]) bucketMap[b.prize_id] = []
      bucketMap[b.prize_id].push(b)
    }
  }

  const gateCheckPrizeIds = prizes.filter((p) => p.judging_style === "gate_check").map((p) => p.id)
  const criteriaMap: Record<string, PrizeCriterion[]> = {}
  if (gateCheckPrizeIds.length > 0) {
    const { data: criteriaRows } = await client
      .from("judging_criteria")
      .select("id, prize_id, name, description, display_order")
      .in("prize_id", gateCheckPrizeIds)
      .order("display_order")

    for (const c of criteriaRows ?? []) {
      if (!c.prize_id) continue
      if (!criteriaMap[c.prize_id]) criteriaMap[c.prize_id] = []
      criteriaMap[c.prize_id].push({
        id: c.id,
        name: c.name,
        description: c.description,
        displayOrder: c.display_order,
      })
    }
  }

  const trackIds = Array.from(
    new Set(
      prizes
        .map((p) => (p as unknown as Prize).prize_track_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    )
  )
  const sponsorByTrackId: Record<string, string> = {}
  if (trackIds.length > 0) {
    const { data: trackRows } = await client
      .from("prize_tracks")
      .select("id, sponsor:hackathon_sponsors!sponsor_id(name)")
      .in("id", trackIds)

    for (const row of (trackRows ?? []) as unknown as { id: string; sponsor: { name: string } | { name: string }[] | null }[]) {
      const sponsorName = Array.isArray(row.sponsor)
        ? row.sponsor[0]?.name ?? null
        : row.sponsor?.name ?? null
      if (sponsorName) sponsorByTrackId[row.id] = sponsorName
    }
  }

  return (prizes as unknown as Prize[]).map((p) => ({
    ...p,
    judgeCount: prizeStats[p.id]?.judges.size ?? 0,
    totalAssignments: prizeStats[p.id]?.total ?? 0,
    completedAssignments: prizeStats[p.id]?.completed ?? 0,
    buckets: bucketMap[p.id],
    criteria: criteriaMap[p.id],
    sponsorName: p.prize_track_id ? sponsorByTrackId[p.prize_track_id] ?? null : null,
  }))
}

export type CreatePrizeErrorCode = "validation" | "db_error"

export type CreatePrizeResult =
  | { success: true; prize: Prize }
  | { success: false; error: string; code: CreatePrizeErrorCode }

export async function createPrize(
  hackathonId: string,
  input: CreatePrizeInput
): Promise<CreatePrizeResult> {
  const client = getSupabase() as unknown as SupabaseClient

  let safeRoundId: string | null = input.roundId ?? null
  if (safeRoundId) {
    const { data: round } = await client
      .from("judging_rounds")
      .select("id")
      .eq("id", safeRoundId)
      .eq("hackathon_id", hackathonId)
      .maybeSingle()
    if (!round) safeRoundId = null
  }

  const row: Record<string, unknown> = {
    hackathon_id: hackathonId,
    name: input.name,
    description: input.description ?? null,
    value: input.value ?? null,
    judging_style: input.judgingStyle ?? null,
    round_id: safeRoundId,
    assignment_mode: input.assignmentMode ?? "organizer_assigned",
    max_picks: input.maxPicks ?? 3,
    display_order: input.displayOrder ?? 0,
    is_screening: input.isScreening ?? false,
  }
  if (input.type !== undefined) row.type = input.type
  if (input.rank !== undefined) row.rank = input.rank
  if (input.kind !== undefined) row.kind = input.kind
  if (input.monetaryValue !== undefined) row.monetary_value = input.monetaryValue
  if (input.currency !== undefined) row.currency = input.currency
  if (input.criteriaId !== undefined) row.criteria_id = input.criteriaId
  if (input.distributionMethod !== undefined) row.distribution_method = input.distributionMethod
  if (input.displayValue !== undefined) row.display_value = input.displayValue

  const cleanCriteria =
    input.judgingStyle === "gate_check" || input.judgingStyle === "weighted_score"
      ? (input.criteria ?? []).filter((c) => c.name.trim().length > 0)
      : []

  if (input.judgingStyle === "gate_check" && cleanCriteria.length === 0) {
    return {
      success: false,
      error: "At least one criterion is required for pass-or-fail prizes",
      code: "validation",
    }
  }

  if (
    input.judgingStyle === "weighted_score" &&
    cleanCriteria.some((c) => (c.weight ?? 0) <= 0)
  ) {
    return {
      success: false,
      error: "Each weighted criterion needs a weight greater than zero",
      code: "validation",
    }
  }

  if (input.judgingStyle === "weighted_score" && cleanCriteria.length === 0) {
    const { count: coreCount, error: coreCountError } = await client
      .from("judging_criteria")
      .select("id", { count: "exact", head: true })
      .eq("hackathon_id", hackathonId)
      .is("prize_id", null)
    if (coreCountError) {
      console.error("Failed to count core criteria for weighted prize check:", coreCountError)
      return { success: false, error: coreCountError.message, code: "db_error" }
    }
    if (!coreCount || coreCount === 0) {
      return {
        success: false,
        error: "Add at least one shared category before creating a weighted prize, or give this prize its own categories",
        code: "validation",
      }
    }
  }

  const cleanBuckets =
    input.judgingStyle === "bucket_sort" && input.buckets !== undefined
      ? input.buckets.filter((b) => b.label.trim().length > 0)
      : null

  if (cleanBuckets !== null && cleanBuckets.length < 2) {
    return {
      success: false,
      error: "Sort groups need at least two named labels",
      code: "validation",
    }
  }

  const { data: prize, error } = await client
    .from("prizes")
    .insert(row)
    .select()
    .single()

  if (error || !prize) {
    console.error("Failed to create prize:", error)
    return {
      success: false,
      error: error?.message ?? "Database insert failed",
      code: "db_error",
    }
  }

  if (input.judgingStyle === "gate_check") {
    const criteriaRows = cleanCriteria.map((c, i) => ({
      hackathon_id: hackathonId,
      prize_id: prize.id,
      name: c.name.trim(),
      description: c.description?.trim() || null,
      max_score: 1,
      weight: 1,
      display_order: i,
    }))
    const { error: critError } = await client.from("judging_criteria").insert(criteriaRows)
    if (critError) {
      console.error("Failed to insert criteria, rolling back prize:", critError)
      const { error: rollbackError } = await client.from("prizes").delete().eq("id", prize.id)
      if (rollbackError) {
        console.error("Prize rollback failed; orphaned prize id:", prize.id, rollbackError)
      }
      return { success: false, error: critError.message, code: "db_error" }
    }
  }

  if (input.judgingStyle === "weighted_score" && cleanCriteria.length > 0) {
    const criteriaRows = cleanCriteria.map((c, i) => ({
      hackathon_id: hackathonId,
      prize_id: prize.id,
      name: c.name.trim(),
      description: c.description?.trim() || null,
      min_score: c.minScore ?? 1,
      max_score: c.maxScore ?? 10,
      weight: c.weight ?? 0,
      display_order: i,
    }))
    const { error: critError } = await client.from("judging_criteria").insert(criteriaRows)
    if (critError) {
      console.error("Failed to insert weighted criteria, rolling back prize:", critError)
      const { error: rollbackError } = await client.from("prizes").delete().eq("id", prize.id)
      if (rollbackError) {
        console.error("Prize rollback failed; orphaned prize id:", prize.id, rollbackError)
      }
      return { success: false, error: critError.message, code: "db_error" }
    }
  }

  if (input.judgingStyle === "bucket_sort") {
    const created =
      cleanBuckets !== null
        ? await replaceBucketDefinitions(
            prize.id,
            cleanBuckets.map((b, i) => ({
              level: b.level ?? i + 1,
              label: b.label.trim(),
              description: b.description?.trim() || null,
            }))
          )
        : await createDefaultBucketsForPrize(prize.id)

    if (created.length === 0) {
      console.error("Failed to create bucket definitions, rolling back prize")
      await client.from("prizes").delete().eq("id", prize.id)
      return {
        success: false,
        error: "Failed to create sort groups",
        code: "db_error",
      }
    }
  }

  return { success: true, prize: prize as unknown as Prize }
}

export async function updatePrize(
  prizeId: string,
  hackathonId: string,
  input: UpdatePrizeInput
): Promise<Prize | null> {
  const client = getSupabase() as unknown as SupabaseClient

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (input.name !== undefined) updates.name = input.name
  if (input.description !== undefined) updates.description = input.description
  if (input.value !== undefined) updates.value = input.value
  if (input.judgingStyle !== undefined) updates.judging_style = input.judgingStyle
  if (input.roundId !== undefined) updates.round_id = input.roundId
  if (input.assignmentMode !== undefined) updates.assignment_mode = input.assignmentMode
  if (input.maxPicks !== undefined) updates.max_picks = input.maxPicks
  if (input.displayOrder !== undefined) updates.display_order = input.displayOrder
  if (input.type !== undefined) updates.type = input.type
  if (input.rank !== undefined) updates.rank = input.rank
  if (input.kind !== undefined) updates.kind = input.kind
  if (input.monetaryValue !== undefined) updates.monetary_value = input.monetaryValue
  if (input.currency !== undefined) updates.currency = input.currency
  if (input.criteriaId !== undefined) updates.criteria_id = input.criteriaId
  if (input.distributionMethod !== undefined) updates.distribution_method = input.distributionMethod
  if (input.displayValue !== undefined) updates.display_value = input.displayValue

  const { data, error } = await client
    .from("prizes")
    .update(updates)
    .eq("id", prizeId)
    .eq("hackathon_id", hackathonId)
    .select()
    .single()

  if (error || !data) {
    console.error("Failed to update prize:", error)
    return null
  }

  return data as unknown as Prize
}

export type ReplacePrizeCriteriaInput = {
  name: string
  description?: string | null
  weight?: number
  minScore?: number
  maxScore?: number
}

export type ReplacePrizeCriteriaOptions = {
  style?: PrizeJudgingStyle | null
}

export async function replacePrizeCriteria(
  hackathonId: string,
  prizeId: string,
  criteria: ReplacePrizeCriteriaInput[],
  options: ReplacePrizeCriteriaOptions = {}
): Promise<PrizeCriterion[] | null> {
  const client = getSupabase() as unknown as SupabaseClient
  const cleaned = criteria.filter((c) => c.name.trim().length > 0)

  const isWeighted = options.style === "weighted_score"

  const { error: deleteError } = await client
    .from("judging_criteria")
    .delete()
    .eq("prize_id", prizeId)

  if (deleteError) {
    console.error("Failed to clear prize criteria:", deleteError)
    return null
  }

  if (cleaned.length === 0) return []

  const rows = cleaned.map((c, i) => ({
    hackathon_id: hackathonId,
    prize_id: prizeId,
    name: c.name.trim(),
    description: c.description?.trim() || null,
    min_score: isWeighted ? c.minScore ?? 1 : 0,
    max_score: isWeighted ? c.maxScore ?? 10 : 1,
    weight: isWeighted ? c.weight ?? 0 : 1,
    display_order: i,
  }))

  const { data, error } = await client
    .from("judging_criteria")
    .insert(rows)
    .select("id, name, description, display_order")

  if (error) {
    console.error("Failed to insert prize criteria:", error)
    return null
  }

  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    displayOrder: c.display_order,
  }))
}

export async function deletePrize(prizeId: string, hackathonId: string): Promise<boolean> {
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

export async function getPrizeDetails(prizeId: string): Promise<PrizeWithProgress | null> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: prize, error } = await client
    .from("prizes")
    .select("*")
    .eq("id", prizeId)
    .maybeSingle()

  if (error || !prize) return null

  const { data: assignments } = await client
    .from("judge_assignments")
    .select("judge_participant_id, is_complete")
    .eq("prize_id", prizeId)

  const judges = new Set((assignments ?? []).map((a) => a.judge_participant_id))
  const total = assignments?.length ?? 0
  const completed = assignments?.filter((a) => a.is_complete).length ?? 0

  let buckets: BucketDefinition[] | undefined
  if ((prize as unknown as Prize).judging_style === "bucket_sort") {
    const { data } = await client
      .from("bucket_definitions")
      .select("*")
      .eq("prize_id", prizeId)
      .order("level")
    buckets = (data ?? []) as unknown as BucketDefinition[]
  }

  let criteria: PrizeCriterion[] | undefined
  if ((prize as unknown as Prize).judging_style === "gate_check") {
    const { data } = await client
      .from("judging_criteria")
      .select("id, name, description, display_order")
      .eq("prize_id", prizeId)
      .order("display_order")
    criteria = (data ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      displayOrder: c.display_order,
    }))
  }

  return {
    ...(prize as unknown as Prize),
    judgeCount: judges.size,
    totalAssignments: total,
    completedAssignments: completed,
    buckets,
    criteria,
  }
}

// ============================================================
// Bucket Definitions (for bucket_sort prizes)
// ============================================================

export async function createDefaultBucketsForPrize(prizeId: string): Promise<BucketDefinition[]> {
  const client = getSupabase() as unknown as SupabaseClient
  const inserts = DEFAULT_BUCKETS.map((b) => ({
    prize_id: prizeId,
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

  return (data ?? []) as unknown as BucketDefinition[]
}

export type UpsertBucketInput = {
  id?: string
  level: number
  label: string
  description?: string | null
}

export async function replaceBucketDefinitions(
  prizeId: string,
  buckets: UpsertBucketInput[]
): Promise<BucketDefinition[]> {
  const client = getSupabase() as unknown as SupabaseClient

  const { error: deleteError } = await client
    .from("bucket_definitions")
    .delete()
    .eq("prize_id", prizeId)

  if (deleteError) {
    console.error("Failed to clear bucket definitions:", deleteError)
    return []
  }

  const inserts = buckets.map((b, i) => ({
    prize_id: prizeId,
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

  return (data ?? []) as unknown as BucketDefinition[]
}

export async function listBucketDefinitions(prizeId: string): Promise<BucketDefinition[]> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data, error } = await client
    .from("bucket_definitions")
    .select("*")
    .eq("prize_id", prizeId)
    .order("level")

  if (error) {
    console.error("Failed to list bucket definitions:", error)
    return []
  }

  return data as unknown as BucketDefinition[]
}

// ============================================================
// Rounds (hackathon-level)
// ============================================================

export type AdvancementRule = "manual" | "top_n" | "threshold"

export type AdvancementConfig = {
  topN?: number
  threshold?: number
}

export type RoundInfo = {
  id: string
  hackathonId: string
  name: string
  status: string
  displayOrder: number
  submissionCount: number
  advancement: AdvancementRule
  advancementConfig: AdvancementConfig
  prizeCount: number
  screeningPrizeId: string | null
}

export type CreateRoundInput = {
  name: string
  advancement?: AdvancementRule
  advancementConfig?: AdvancementConfig
}

export type UpdateRoundInput = {
  name?: string
  status?: string
  advancement?: AdvancementRule
  advancementConfig?: AdvancementConfig
}

function normalizeAdvancementConfig(value: unknown): AdvancementConfig {
  if (!value || typeof value !== "object") return {}
  const config = value as Record<string, unknown>
  const out: AdvancementConfig = {}
  if (typeof config.topN === "number") out.topN = config.topN
  else if (typeof config.top_n === "number") out.topN = config.top_n
  if (typeof config.threshold === "number") out.threshold = config.threshold
  return out
}

export async function listRounds(hackathonId: string): Promise<RoundInfo[]> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data, error } = await client
    .from("judging_rounds")
    .select("*")
    .eq("hackathon_id", hackathonId)
    .order("display_order")

  if (error) {
    console.error("Failed to list rounds:", error)
    return []
  }

  const roundIds = (data ?? []).map((r) => r.id)
  const roundSubCounts: Record<string, number> = {}
  const prizeCountByRound: Record<string, number> = {}
  const screeningPrizeByRound: Record<string, string> = {}

  if (roundIds.length > 0) {
    const { data: roundSubs } = await client
      .from("round_submissions")
      .select("round_id")
      .in("round_id", roundIds)

    for (const rs of roundSubs ?? []) {
      roundSubCounts[rs.round_id] = (roundSubCounts[rs.round_id] ?? 0) + 1
    }

    const { data: roundPrizes } = await client
      .from("prizes")
      .select("id, round_id, is_screening")
      .in("round_id", roundIds)
      .not("judging_style", "is", null)

    for (const p of roundPrizes ?? []) {
      if (!p.round_id) continue
      prizeCountByRound[p.round_id] = (prizeCountByRound[p.round_id] ?? 0) + 1
      if (p.is_screening) screeningPrizeByRound[p.round_id] = p.id
    }
  }

  return (data ?? []).map((r) => ({
    id: r.id,
    hackathonId: r.hackathon_id,
    name: r.name,
    status: r.status ?? "planned",
    displayOrder: r.display_order,
    submissionCount: roundSubCounts[r.id] ?? 0,
    advancement: (r.advancement ?? "manual") as AdvancementRule,
    advancementConfig: normalizeAdvancementConfig(r.advancement_config),
    prizeCount: prizeCountByRound[r.id] ?? 0,
    screeningPrizeId: screeningPrizeByRound[r.id] ?? null,
  }))
}

export async function createRound(
  hackathonId: string,
  input: CreateRoundInput | string
): Promise<RoundInfo | null> {
  const params: CreateRoundInput =
    typeof input === "string" ? { name: input } : input
  const client = getSupabase() as unknown as SupabaseClient

  const { data: existing } = await client
    .from("judging_rounds")
    .select("display_order")
    .eq("hackathon_id", hackathonId)
    .order("display_order", { ascending: false })
    .limit(1)

  const nextOrder = ((existing?.[0]?.display_order ?? -1) + 1)

  const { data, error } = await client
    .from("judging_rounds")
    .insert({
      hackathon_id: hackathonId,
      name: params.name,
      status: "planned",
      advancement: params.advancement ?? "manual",
      advancement_config: params.advancementConfig ?? {},
      display_order: nextOrder,
    })
    .select()
    .single()

  if (error || !data) {
    console.error("Failed to create round:", error)
    return null
  }

  return {
    id: data.id,
    hackathonId: data.hackathon_id,
    name: data.name,
    status: data.status ?? "planned",
    displayOrder: data.display_order,
    submissionCount: 0,
    advancement: (data.advancement ?? "manual") as AdvancementRule,
    advancementConfig: normalizeAdvancementConfig(data.advancement_config),
    prizeCount: 0,
    screeningPrizeId: null,
  }
}

export async function updateRound(
  roundId: string,
  input: UpdateRoundInput
): Promise<boolean> {
  const client = getSupabase() as unknown as SupabaseClient
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (input.name !== undefined) updates.name = input.name
  if (input.status !== undefined) updates.status = input.status
  if (input.advancement !== undefined) updates.advancement = input.advancement
  if (input.advancementConfig !== undefined) updates.advancement_config = input.advancementConfig

  const { error } = await client
    .from("judging_rounds")
    .update(updates)
    .eq("id", roundId)

  if (error) {
    console.error("Failed to update round:", error)
    return false
  }
  return true
}

export type DeleteRoundResult = {
  success: boolean
  error?: string
  code?: "round_active" | "delete_failed" | "not_found"
}

export async function deleteRound(
  roundId: string,
  hackathonId: string
): Promise<DeleteRoundResult> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: round } = await client
    .from("judging_rounds")
    .select("id, status")
    .eq("id", roundId)
    .eq("hackathon_id", hackathonId)
    .maybeSingle()

  if (!round) {
    return { success: false, error: "Round not found", code: "not_found" }
  }

  if (round.status === "active") {
    return {
      success: false,
      error: "Complete the round before deleting it",
      code: "round_active",
    }
  }

  await client
    .from("prizes")
    .update({ round_id: null })
    .eq("round_id", roundId)
    .eq("is_screening", true)

  const { data: screeningPrizes } = await client
    .from("prizes")
    .select("id")
    .eq("round_id", roundId)
    .eq("is_screening", true)

  const screeningPrizeIds = (screeningPrizes ?? []).map((p) => p.id)
  if (screeningPrizeIds.length > 0) {
    await client.from("prizes").delete().in("id", screeningPrizeIds)
  }

  const { error } = await client
    .from("judging_rounds")
    .delete()
    .eq("id", roundId)
    .eq("hackathon_id", hackathonId)

  if (error) {
    console.error("Failed to delete round:", error)
    return { success: false, error: "Database delete failed", code: "delete_failed" }
  }

  return { success: true }
}

export type RoundsPresetKind = "single" | "shortlist" | "threshold" | "finalists_pick"

export type RoundsPresetInput = {
  preset: RoundsPresetKind
  round1Name?: string
  round2Name?: string
  advanceTopN?: number
  threshold?: number
  seedScreeningPrize?: boolean
  prizeName?: string
  maxPicks?: number
}

export type RoundsPresetResult =
  | {
      success: true
      roundIds: string[]
      screeningPrizeId: string | null
      prizeId?: string | null
    }
  | { success: false; error: string }

function defaultRoundName(preset: RoundsPresetKind, which: 1 | 2): string {
  if (preset === "single") return "Judging"
  if (preset === "shortlist") return which === 1 ? "Shortlist" : "Finals"
  if (preset === "finalists_pick") return "Finals"
  return which === 1 ? "First round" : "Finals"
}

export async function createRoundsPreset(
  hackathonId: string,
  input: RoundsPresetInput
): Promise<RoundsPresetResult> {
  const preset = input.preset

  if (preset === "single") {
    const name = (input.round1Name ?? defaultRoundName("single", 1)).trim() || defaultRoundName("single", 1)
    const round = await createRound(hackathonId, {
      name,
      advancement: "manual",
      advancementConfig: {},
    })
    if (!round) return { success: false, error: "Failed to create round" }
    return { success: true, roundIds: [round.id], screeningPrizeId: null }
  }

  if (preset === "shortlist") {
    const topN = input.advanceTopN
    if (!Number.isInteger(topN) || (topN as number) < 1) {
      return { success: false, error: "advanceTopN must be a positive integer" }
    }
    const round1Name = (input.round1Name ?? defaultRoundName("shortlist", 1)).trim() || defaultRoundName("shortlist", 1)
    const round2Name = (input.round2Name ?? defaultRoundName("shortlist", 2)).trim() || defaultRoundName("shortlist", 2)

    const round1 = await createRound(hackathonId, {
      name: round1Name,
      advancement: "top_n",
      advancementConfig: { topN: topN as number },
    })
    if (!round1) return { success: false, error: "Failed to create round 1" }

    const round2 = await createRound(hackathonId, {
      name: round2Name,
      advancement: "manual",
      advancementConfig: {},
    })
    if (!round2) return { success: false, error: "Failed to create round 2" }

    let screeningPrizeId: string | null = null
    if (input.seedScreeningPrize !== false) {
      const screening = await createPrize(hackathonId, {
        name: "Screening Scores",
        description: `Hidden helper prize so judges have something to score in round 1. The top ${topN} by score move on.`,
        judgingStyle: "bucket_sort",
        roundId: round1.id,
        isScreening: true,
      })
      if (screening.success) {
        screeningPrizeId = screening.prize.id
      } else {
        console.error("Failed to seed screening prize:", screening.error)
      }
    }

    return {
      success: true,
      roundIds: [round1.id, round2.id],
      screeningPrizeId,
    }
  }

  if (preset === "threshold") {
    const threshold = input.threshold
    if (typeof threshold !== "number" || Number.isNaN(threshold)) {
      return { success: false, error: "threshold must be a number" }
    }
    const round1Name = (input.round1Name ?? defaultRoundName("threshold", 1)).trim() || defaultRoundName("threshold", 1)
    const round2Name = (input.round2Name ?? defaultRoundName("threshold", 2)).trim() || defaultRoundName("threshold", 2)

    const round1 = await createRound(hackathonId, {
      name: round1Name,
      advancement: "threshold",
      advancementConfig: { threshold },
    })
    if (!round1) return { success: false, error: "Failed to create round 1" }

    const round2 = await createRound(hackathonId, {
      name: round2Name,
      advancement: "manual",
      advancementConfig: {},
    })
    if (!round2) return { success: false, error: "Failed to create round 2" }

    let screeningPrizeId: string | null = null
    if (input.seedScreeningPrize !== false) {
      const screening = await createPrize(hackathonId, {
        name: "Screening Scores",
        description: `Hidden helper prize so judges have something to score in round 1. Everyone scoring ${threshold} or higher moves on.`,
        judgingStyle: "bucket_sort",
        roundId: round1.id,
        isScreening: true,
      })
      if (screening.success) {
        screeningPrizeId = screening.prize.id
      } else {
        console.error("Failed to seed screening prize:", screening.error)
      }
    }

    return {
      success: true,
      roundIds: [round1.id, round2.id],
      screeningPrizeId,
    }
  }

  if (preset === "finalists_pick") {
    const name = (input.round1Name ?? defaultRoundName("finalists_pick", 1)).trim() || defaultRoundName("finalists_pick", 1)
    const round = await createRound(hackathonId, {
      name,
      advancement: "manual",
      advancementConfig: {},
    })
    if (!round) return { success: false, error: "Failed to create round" }

    const prizeName = (input.prizeName ?? "Grand Prize").trim() || "Grand Prize"
    const maxPicks = Number.isInteger(input.maxPicks) && (input.maxPicks as number) >= 1 ? (input.maxPicks as number) : 1
    const prize = await createPrize(hackathonId, {
      name: prizeName,
      description: "Each judge picks their favorites. The project with the most picks wins.",
      judgingStyle: "judges_pick",
      roundId: round.id,
      maxPicks,
    })

    if (!prize.success) {
      return { success: false, error: prize.error }
    }

    return {
      success: true,
      roundIds: [round.id],
      screeningPrizeId: null,
      prizeId: prize.prize.id,
    }
  }

  return { success: false, error: `Unknown preset: ${preset}` }
}

export type FinalistsPresetInput = {
  advanceTopN: number
  round1Name?: string
  round2Name?: string
  seedScreeningPrize?: boolean
}

export type FinalistsPresetResult =
  | {
      success: true
      roundIds: { round1: string; round2: string }
      screeningPrizeId: string | null
    }
  | { success: false; error: string }

export async function createFinalistsPreset(
  hackathonId: string,
  input: FinalistsPresetInput
): Promise<FinalistsPresetResult> {
  const result = await createRoundsPreset(hackathonId, {
    preset: "shortlist",
    advanceTopN: input.advanceTopN,
    round1Name: input.round1Name ?? "Semifinals",
    round2Name: input.round2Name ?? "Finals",
    seedScreeningPrize: input.seedScreeningPrize,
  })

  if (!result.success) return result

  const [r1, r2] = result.roundIds
  return {
    success: true,
    roundIds: { round1: r1, round2: r2 },
    screeningPrizeId: result.screeningPrizeId,
  }
}

export async function activateRound(roundId: string, hackathonId: string): Promise<boolean> {
  const client = getSupabase() as unknown as SupabaseClient

  const { error: deactivateError } = await client
    .from("judging_rounds")
    .update({ status: "planned", is_active: false, updated_at: new Date().toISOString() })
    .eq("hackathon_id", hackathonId)
    .eq("status", "active")
    .neq("id", roundId)

  if (deactivateError) {
    console.error("Failed to deactivate other rounds:", deactivateError)
    return false
  }

  const { data, error } = await client
    .from("judging_rounds")
    .update({ status: "active", is_active: true, updated_at: new Date().toISOString() })
    .eq("id", roundId)
    .eq("hackathon_id", hackathonId)
    .select("id")
    .single()

  if (error || !data) {
    console.error("Failed to activate round:", error)
    return false
  }
  return true
}

export async function completeRound(roundId: string): Promise<boolean> {
  const client = getSupabase() as unknown as SupabaseClient
  const { error } = await client
    .from("judging_rounds")
    .update({ status: "complete", is_active: false, updated_at: new Date().toISOString() })
    .eq("id", roundId)

  if (error) {
    console.error("Failed to complete round:", error)
    return false
  }
  return true
}

// ============================================================
// Round advancement
// ============================================================

export async function getRoundSubmissions(roundId: string): Promise<string[]> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data, error } = await client
    .from("round_submissions")
    .select("submission_id")
    .eq("round_id", roundId)

  if (error) {
    console.error("Failed to get round submissions:", error)
    return []
  }

  return (data ?? []).map((r) => r.submission_id)
}

export async function getRoundPool(hackathonId: string, roundId: string | null): Promise<string[]> {
  const client = getSupabase() as unknown as SupabaseClient

  if (roundId) {
    const subs = await getRoundSubmissions(roundId)
    if (subs.length > 0) return subs
  }

  const { data } = await client
    .from("submissions")
    .select("id")
    .eq("hackathon_id", hackathonId)
    .eq("status", "submitted")

  return (data ?? []).map((s) => s.id)
}

export async function getActiveRoundId(hackathonId: string): Promise<string | null> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data } = await client
    .from("judging_rounds")
    .select("id")
    .eq("hackathon_id", hackathonId)
    .eq("status", "active")
    .maybeSingle()
  return (data as { id: string } | null)?.id ?? null
}

// null = no scoping; caller falls back to full submitted pool.
export async function getActiveRoundFinalistIds(hackathonId: string): Promise<string[] | null> {
  const activeRoundId = await getActiveRoundId(hackathonId)
  if (!activeRoundId) return null
  const subs = await getRoundSubmissions(activeRoundId)
  return subs.length > 0 ? subs : null
}

async function getTeamIdsInRoom(client: SupabaseClient, roomId: string): Promise<string[]> {
  const { data } = await client
    .from("room_teams")
    .select("team_id")
    .eq("room_id", roomId)

  return (data ?? []).map((rt: { team_id: string }) => rt.team_id)
}

export type PrizeScore = {
  prizeId: string
  prizeName: string
  score: number
  judgeCount: number
}

export type AdvanceCandidate = {
  submissionId: string
  projectTitle: string
  teamId: string | null
  teamName: string | null
  score: number | null
  judgeCount: number
  prizeScores: PrizeScore[]
  alreadyAdvanced: boolean
}

export async function listAdvanceCandidates(
  hackathonId: string,
  fromRoundId: string,
  toRoundId: string
): Promise<AdvanceCandidate[]> {
  const client = getSupabase() as unknown as SupabaseClient

  const submissionIds = await getRoundPool(hackathonId, fromRoundId)
  if (submissionIds.length === 0) return []

  const { data: submissions } = await client
    .from("submissions")
    .select("id, title, team_id, teams(name)")
    .in("id", submissionIds)

  const { data: toRows } = await client
    .from("round_submissions")
    .select("submission_id")
    .eq("round_id", toRoundId)
  const alreadyAdvanced = new Set((toRows ?? []).map((r) => r.submission_id))

  const { data: scorablePrizes } = await client
    .from("prizes")
    .select("id, name, is_screening, round_id")
    .eq("hackathon_id", hackathonId)
    .in("round_id", [fromRoundId, toRoundId])
    .not("judging_style", "is", null)

  type PrizeRow = { id: string; name: string; is_screening: boolean; round_id: string | null }
  const prizeRows = (scorablePrizes as PrizeRow[]) ?? []
  const prizeNameById = new Map(prizeRows.map((p) => [p.id, p.name]))
  const prizeIds = prizeRows.map((p) => p.id)

  const prizeScoresByCandidate = new Map<string, PrizeScore[]>()
  if (prizeIds.length > 0) {
    const { data: results } = await client
      .from("hackathon_results")
      .select("submission_id, prize_id, weighted_score, judge_count")
      .in("prize_id", prizeIds)
      .in("submission_id", submissionIds)
    for (const r of results ?? []) {
      if (!r.submission_id || !r.prize_id) continue
      const list = prizeScoresByCandidate.get(r.submission_id) ?? []
      list.push({
        prizeId: r.prize_id,
        prizeName: prizeNameById.get(r.prize_id) ?? "Prize",
        score: r.weighted_score ?? 0,
        judgeCount: r.judge_count ?? 0,
      })
      prizeScoresByCandidate.set(r.submission_id, list)
    }
    for (const list of prizeScoresByCandidate.values()) {
      list.sort((a, b) => b.score - a.score)
    }
  }

  type SubmissionRow = {
    id: string
    title: string | null
    team_id: string | null
    teams: { name: string | null } | { name: string | null }[] | null
  }
  const candidates: AdvanceCandidate[] = ((submissions as SubmissionRow[]) ?? []).map((s) => {
    const team = Array.isArray(s.teams) ? s.teams[0] : s.teams
    const prizeScores = prizeScoresByCandidate.get(s.id) ?? []
    const aggregateScore =
      prizeScores.length > 0
        ? prizeScores.reduce((sum, ps) => sum + ps.score, 0) / prizeScores.length
        : null
    const aggregateJudgeCount = prizeScores.reduce((max, ps) => Math.max(max, ps.judgeCount), 0)
    return {
      submissionId: s.id,
      projectTitle: s.title ?? "Untitled project",
      teamId: s.team_id,
      teamName: team?.name ?? null,
      score: aggregateScore,
      judgeCount: aggregateJudgeCount,
      prizeScores,
      alreadyAdvanced: alreadyAdvanced.has(s.id),
    }
  })

  candidates.sort((a, b) => {
    if (a.score !== null && b.score === null) return -1
    if (a.score === null && b.score !== null) return 1
    if (a.score !== null && b.score !== null && a.score !== b.score) {
      return b.score - a.score
    }
    return a.projectTitle.localeCompare(b.projectTitle)
  })

  return candidates
}

export async function advanceSubmissions(
  fromRoundId: string,
  toRoundId: string,
  submissionIds: string[]
): Promise<{ advancedCount: number }> {
  const client = getSupabase() as unknown as SupabaseClient

  if (submissionIds.length === 0) return { advancedCount: 0 }

  const inserts = submissionIds.map((sid) => ({
    round_id: toRoundId,
    submission_id: sid,
  }))

  const { error } = await client
    .from("round_submissions")
    .upsert(inserts, { onConflict: "round_id,submission_id" })

  if (error) {
    console.error("Failed to advance submissions:", error)
    return { advancedCount: 0 }
  }

  return { advancedCount: submissionIds.length }
}

export type WinnerPickerPrize = {
  id: string
  name: string
}

export type WinnerPickerProject = {
  submissionId: string
  projectTitle: string
  teamId: string | null
  teamName: string | null
  prizeIds: string[]
  score: number | null
  judgeCount: number
  prizeScores: PrizeScore[]
}

export type WinnerPickerData = {
  prizes: WinnerPickerPrize[]
  projects: WinnerPickerProject[]
}

export async function listRoundWinnerPicker(
  hackathonId: string,
  roundId: string
): Promise<WinnerPickerData> {
  const client = getSupabase() as unknown as SupabaseClient

  const submissionIds = await getRoundPool(hackathonId, roundId)

  const { data: prizeRows } = await client
    .from("prizes")
    .select("id, name")
    .eq("hackathon_id", hackathonId)
    .eq("round_id", roundId)
    .eq("is_screening", false)
    .not("judging_style", "is", null)
    .order("display_order", { ascending: true })

  const prizes: WinnerPickerPrize[] = (prizeRows ?? []).map((p) => ({
    id: p.id,
    name: p.name,
  }))

  if (submissionIds.length === 0) {
    return { prizes, projects: [] }
  }

  const { data: submissionRows } = await client
    .from("submissions")
    .select("id, title, team_id, teams(name)")
    .in("id", submissionIds)

  const assignmentsBySubmission = new Map<string, string[]>()
  const prizeScoresBySubmission = new Map<string, PrizeScore[]>()
  if (prizes.length > 0) {
    const prizeIds = prizes.map((p) => p.id)
    const prizeNameById = new Map(prizes.map((p) => [p.id, p.name]))
    const { data: assignments } = await client
      .from("prize_assignments")
      .select("prize_id, submission_id")
      .in("prize_id", prizeIds)
      .in("submission_id", submissionIds)
    for (const a of assignments ?? []) {
      const list = assignmentsBySubmission.get(a.submission_id) ?? []
      list.push(a.prize_id)
      assignmentsBySubmission.set(a.submission_id, list)
    }

    const { data: resultRows } = await client
      .from("hackathon_results")
      .select("submission_id, prize_id, weighted_score, judge_count")
      .in("prize_id", prizeIds)
      .in("submission_id", submissionIds)
    for (const r of resultRows ?? []) {
      if (!r.submission_id || !r.prize_id) continue
      const list = prizeScoresBySubmission.get(r.submission_id) ?? []
      list.push({
        prizeId: r.prize_id,
        prizeName: prizeNameById.get(r.prize_id) ?? "Prize",
        score: r.weighted_score ?? 0,
        judgeCount: r.judge_count ?? 0,
      })
      prizeScoresBySubmission.set(r.submission_id, list)
    }
    for (const list of prizeScoresBySubmission.values()) {
      list.sort((a, b) => b.score - a.score)
    }
  }

  type SubmissionRow = {
    id: string
    title: string | null
    team_id: string | null
    teams: { name: string | null } | { name: string | null }[] | null
  }
  const projects: WinnerPickerProject[] = ((submissionRows as SubmissionRow[]) ?? []).map((s) => {
    const team = Array.isArray(s.teams) ? s.teams[0] : s.teams
    const prizeScores = prizeScoresBySubmission.get(s.id) ?? []
    const aggregateScore =
      prizeScores.length > 0
        ? prizeScores.reduce((sum, ps) => sum + ps.score, 0) / prizeScores.length
        : null
    const aggregateJudgeCount = prizeScores.reduce((max, ps) => Math.max(max, ps.judgeCount), 0)
    return {
      submissionId: s.id,
      projectTitle: s.title ?? "Untitled project",
      teamId: s.team_id,
      teamName: team?.name ?? null,
      prizeIds: assignmentsBySubmission.get(s.id) ?? [],
      score: aggregateScore,
      judgeCount: aggregateJudgeCount,
      prizeScores,
    }
  })

  projects.sort((a, b) => {
    if (a.score !== null && b.score === null) return -1
    if (a.score === null && b.score !== null) return 1
    if (a.score !== null && b.score !== null && a.score !== b.score) {
      return b.score - a.score
    }
    return a.projectTitle.localeCompare(b.projectTitle)
  })

  return { prizes, projects }
}

export async function roundBelongsToHackathon(
  hackathonId: string,
  roundId: string
): Promise<boolean> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data } = await client
    .from("judging_rounds")
    .select("id")
    .eq("id", roundId)
    .eq("hackathon_id", hackathonId)
    .maybeSingle()
  return !!data
}

export async function unadvanceSubmissions(
  toRoundId: string,
  submissionIds: string[]
): Promise<{ removedCount: number }> {
  const client = getSupabase() as unknown as SupabaseClient

  if (submissionIds.length === 0) return { removedCount: 0 }

  const { data, error } = await client
    .from("round_submissions")
    .delete()
    .eq("round_id", toRoundId)
    .in("submission_id", submissionIds)
    .select("submission_id")

  if (error) {
    throw new Error(`Failed to unadvance submissions: ${error.message}`)
  }

  return { removedCount: (data ?? []).length }
}

export type AutoAdvanceResult =
  | { success: true; advancedCount: number; submissionIds: string[] }
  | { success: false; error: string; code: "no_screening_prize" | "no_scores" | "no_config" | "advance_failed" }

export async function autoAdvanceFinalists(
  hackathonId: string,
  fromRoundId: string,
  toRoundId: string
): Promise<AutoAdvanceResult> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: round } = await client
    .from("judging_rounds")
    .select("id, advancement, advancement_config")
    .eq("id", fromRoundId)
    .eq("hackathon_id", hackathonId)
    .maybeSingle()

  if (!round) {
    return { success: false, error: "Round not found", code: "no_config" }
  }

  if (round.advancement !== "top_n") {
    return {
      success: false,
      error: "Auto-advance requires a top-N advancement rule",
      code: "no_config",
    }
  }

  const topN = normalizeAdvancementConfig(round.advancement_config).topN
  if (!topN || topN < 1) {
    return {
      success: false,
      error: "Round is missing a valid topN in advancement_config",
      code: "no_config",
    }
  }

  const { data: screeningPrize } = await client
    .from("prizes")
    .select("id")
    .eq("hackathon_id", hackathonId)
    .eq("round_id", fromRoundId)
    .eq("is_screening", true)
    .maybeSingle()

  if (!screeningPrize) {
    return {
      success: false,
      error: "No screening prize found in this round",
      code: "no_screening_prize",
    }
  }

  await calculatePrizeResults(hackathonId, screeningPrize.id)

  const { data: results } = await client
    .from("hackathon_results")
    .select("submission_id, rank, total_score, weighted_score")
    .eq("prize_id", screeningPrize.id)
    .order("rank", { ascending: true })
    .limit(topN)

  const submissionIds = (results ?? [])
    .map((r) => r.submission_id)
    .filter((id): id is string => !!id)

  if (submissionIds.length === 0) {
    return {
      success: false,
      error: "No screening scores yet. Ask judges to finish scoring before advancing.",
      code: "no_scores",
    }
  }

  const { advancedCount } = await advanceSubmissions(fromRoundId, toRoundId, submissionIds)

  if (advancedCount === 0) {
    return {
      success: false,
      error: "Failed to advance submissions",
      code: "advance_failed",
    }
  }

  return { success: true, advancedCount, submissionIds }
}

// ============================================================
// Judge management
// ============================================================

export type AddJudgeResult =
  | { success: true; participant: { id: string; clerkUserId: string } }
  | { success: false; error: string; code: string }

export async function addJudge(
  hackathonId: string,
  clerkUserId: string
): Promise<AddJudgeResult> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: existing, error: lookupError } = await client
    .from("hackathon_participants")
    .select("id, role")
    .eq("hackathon_id", hackathonId)
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle()

  if (lookupError) {
    console.error("Failed to check existing judge:", lookupError)
    return { success: false, error: "Failed to check event role", code: "lookup_failed" }
  }

  if (existing) {
    if (existing.role === "judge") {
      return { success: false, error: "Already registered as a judge", code: "already_judge" }
    }

    const { updateParticipantRole } = await import("@/lib/services/hackathon-participants-admin")
    const updateResult = await updateParticipantRole(existing.id, hackathonId, "judge")
    if ("error" in updateResult) {
      return {
        success: false,
        error: updateResult.error,
        code: updateResult.code === "failed" ? "update_failed" : updateResult.code,
      }
    }

    return { success: true, participant: { id: existing.id, clerkUserId } }
  }

  const { data: participant, error: insertError } = await client
    .from("hackathon_participants")
    .insert({
      hackathon_id: hackathonId,
      clerk_user_id: clerkUserId,
      role: "judge",
    })
    .select()
    .single()

  if (insertError) {
    console.error("Failed to add judge:", insertError)
    return { success: false, error: "Failed to add judge", code: "insert_failed" }
  }

  return { success: true, participant: { id: participant.id, clerkUserId } }
}

export type JudgeInfo = {
  participantId: string
  clerkUserId: string
  displayName: string
  email: string | null
  imageUrl: string | null
  assignmentCount: number
  completedCount: number
  prizeIds: string[]
}

export async function countJudges(hackathonId: string): Promise<number> {
  const client = getSupabase() as unknown as SupabaseClient
  const { count, error } = await client
    .from("hackathon_participants")
    .select("id", { count: "exact", head: true })
    .eq("hackathon_id", hackathonId)
    .eq("role", "judge")

  if (error) {
    console.error("Failed to count judges:", error)
    return 0
  }
  return count ?? 0
}

export async function countUnassignedSubmissions(hackathonId: string): Promise<number> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data, error } = await client.rpc("count_unassigned_submissions", {
    p_hackathon_id: hackathonId,
  })

  if (error) {
    console.error("Failed to count unassigned submissions:", error)
    return 0
  }

  return (data as number | null) ?? 0
}

export async function listJudges(hackathonId: string): Promise<JudgeInfo[]> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: judges, error } = await client
    .from("hackathon_participants")
    .select("id, clerk_user_id")
    .eq("hackathon_id", hackathonId)
    .eq("role", "judge")

  if (error || !judges) {
    console.error("Failed to list judges:", error)
    return []
  }

  if (judges.length === 0) return []

  const judgeIds = judges.map((j) => j.id)

  const { data: assignments } = await client
    .from("judge_assignments")
    .select("judge_participant_id, prize_id, is_complete")
    .eq("hackathon_id", hackathonId)
    .in("judge_participant_id", judgeIds)

  const { data: prizeLinks } = await client
    .from("judge_prize_assignments")
    .select("judge_participant_id, prize_id")
    .eq("hackathon_id", hackathonId)
    .in("judge_participant_id", judgeIds)

  const countMap: Record<string, { total: number; completed: number; prizeIds: Set<string> }> = {}
  for (const a of assignments ?? []) {
    if (!countMap[a.judge_participant_id]) {
      countMap[a.judge_participant_id] = { total: 0, completed: 0, prizeIds: new Set() }
    }
    countMap[a.judge_participant_id].total++
    if (a.is_complete) countMap[a.judge_participant_id].completed++
    if (a.prize_id) countMap[a.judge_participant_id].prizeIds.add(a.prize_id)
  }

  for (const link of prizeLinks ?? []) {
    if (!countMap[link.judge_participant_id]) {
      countMap[link.judge_participant_id] = { total: 0, completed: 0, prizeIds: new Set() }
    }
    countMap[link.judge_participant_id].prizeIds.add(link.prize_id)
  }

  const userMap: Record<string, { displayName: string; email: string | null; imageUrl: string | null }> = {}
  try {
    const { clerkClient } = await import("@clerk/nextjs/server")
    const clerk = await clerkClient()
    const clerkUserIds = judges.map((j) => j.clerk_user_id)
    const clerkUsers = await clerk.users.getUserList({ userId: clerkUserIds, limit: 100 })
    for (const u of clerkUsers.data) {
      const name = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.username || u.id
      userMap[u.id] = {
        displayName: name,
        email: u.primaryEmailAddress?.emailAddress ?? null,
        imageUrl: u.imageUrl ?? null,
      }
    }
  } catch (err) {
    console.error("Failed to fetch Clerk users for judges:", err)
  }

  return judges.map((j) => ({
    participantId: j.id,
    clerkUserId: j.clerk_user_id,
    displayName: userMap[j.clerk_user_id]?.displayName ?? j.clerk_user_id,
    email: userMap[j.clerk_user_id]?.email ?? null,
    imageUrl: userMap[j.clerk_user_id]?.imageUrl ?? null,
    assignmentCount: countMap[j.id]?.total ?? 0,
    completedCount: countMap[j.id]?.completed ?? 0,
    prizeIds: [...(countMap[j.id]?.prizeIds ?? [])],
  }))
}

export type RemoveJudgeResult = {
  success: boolean
  resultsStale?: boolean
}

export async function removeJudge(
  hackathonId: string,
  judgeParticipantId: string
): Promise<RemoveJudgeResult> {
  const client = getSupabase() as unknown as SupabaseClient

  const { error: assignmentError } = await client
    .from("judge_assignments")
    .delete()
    .eq("hackathon_id", hackathonId)
    .eq("judge_participant_id", judgeParticipantId)

  if (assignmentError) {
    console.error("Failed to remove judge assignments:", assignmentError)
    return { success: false }
  }

  const { error: displayError } = await client
    .from("hackathon_judges_display")
    .delete()
    .eq("hackathon_id", hackathonId)
    .eq("participant_id", judgeParticipantId)

  if (displayError) {
    console.error("Failed to remove judge display profile:", displayError)
  }

  const { error } = await client
    .from("hackathon_participants")
    .delete()
    .eq("id", judgeParticipantId)
    .eq("hackathon_id", hackathonId)
    .eq("role", "judge")

  if (error) {
    console.error("Failed to remove judge:", error)
    return { success: false }
  }

  const { data: existingResults } = await client
    .from("hackathon_results")
    .select("id")
    .eq("hackathon_id", hackathonId)
    .limit(1)

  const resultsStale = (existingResults?.length ?? 0) > 0
  return { success: true, resultsStale }
}

// ============================================================
// Judge-Prize assignments
// ============================================================

export async function assignJudgeToPrize(
  hackathonId: string,
  judgeParticipantId: string,
  prizeId: string
): Promise<{ success: boolean; assignedCount: number; error?: string }> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: prize } = await client
    .from("prizes")
    .select("id, round_id, judging_style")
    .eq("id", prizeId)
    .eq("hackathon_id", hackathonId)
    .single()

  if (!prize) return { success: false, assignedCount: 0, error: "Prize not found" }

  if ((prize as { judging_style: string | null }).judging_style === "weighted_score") {
    return {
      success: false,
      assignedCount: 0,
      error: "Weight-based prizes use unified assignments — assign judges from the Assignments tab.",
    }
  }

  const { error: linkError } = await client
    .from("judge_prize_assignments")
    .upsert(
      { hackathon_id: hackathonId, judge_participant_id: judgeParticipantId, prize_id: prizeId },
      { onConflict: "judge_participant_id,prize_id" }
    )

  if (linkError) {
    console.error("[judging] Failed to link judge to prize:", linkError)
    return { success: false, assignedCount: 0, error: "Failed to assign judge" }
  }

  const pool = await getRoundPool(hackathonId, prize.round_id)
  if (pool.length === 0) return { success: true, assignedCount: 0 }

  const { data: judge } = await client
    .from("hackathon_participants")
    .select("id, team_id")
    .eq("id", judgeParticipantId)
    .single()

  const { data: submissions } = await client
    .from("submissions")
    .select("id, team_id")
    .in("id", pool)

  const { data: existing } = await client
    .from("judge_assignments")
    .select("submission_id")
    .eq("judge_participant_id", judgeParticipantId)
    .eq("prize_id", prizeId)

  const existingSet = new Set((existing ?? []).map((e) => e.submission_id))

  const newAssignments = (submissions ?? [])
    .filter((s) => !existingSet.has(s.id))
    .filter((s) => !(judge?.team_id && s.team_id && judge.team_id === s.team_id))
    .map((s) => ({
      hackathon_id: hackathonId,
      judge_participant_id: judgeParticipantId,
      submission_id: s.id,
      prize_id: prizeId,
      round_id: prize.round_id,
    }))

  if (newAssignments.length === 0) return { success: true, assignedCount: 0 }

  const { error } = await client.from("judge_assignments").insert(newAssignments)
  if (error) {
    console.error("[judging] Failed to create per-submission assignments:", error)
    return { success: true, assignedCount: 0 }
  }

  return { success: true, assignedCount: newAssignments.length }
}

export type AssignmentOwnership = {
  hackathonId: string
  prizeId: string | null
  isComplete: boolean
  submissionId: string
  notes: string
  assignmentKind?: "per_prize" | "unified_weighted_score"
}

export async function verifyAssignmentOwnership(
  assignmentId: string,
  clerkUserId: string
): Promise<AssignmentOwnership | false> {
  const client = getSupabase() as unknown as SupabaseClient
  type Row = {
    hackathon_id: string
    prize_id: string | null
    assignment_kind: "per_prize" | "unified_weighted_score" | null
    is_complete: boolean | null
    submission_id: string
    notes: string | null
    hackathon_participants: { clerk_user_id: string }
  }
  const { data } = await client
    .from("judge_assignments")
    .select("judge_participant_id, hackathon_id, prize_id, assignment_kind, is_complete, submission_id, notes, hackathon_participants!inner(clerk_user_id)")
    .eq("id", assignmentId)
    .single<Row>()

  if (!data) return false
  if (data.hackathon_participants.clerk_user_id !== clerkUserId) return false
  return {
    hackathonId: data.hackathon_id,
    prizeId: data.prize_id ?? null,
    isComplete: data.is_complete === true,
    submissionId: data.submission_id,
    notes: data.notes ?? "",
    assignmentKind: data.assignment_kind ?? "per_prize",
  }
}

export type AssignmentWritableErrorCode =
  | "not_found"
  | "not_judging"
  | "round_not_active"
  | "self_judging"

export type AssertAssignmentWritableResult =
  | { ok: true; ownership: AssignmentOwnership }
  | { ok: false; error: string; code: AssignmentWritableErrorCode; status: number }

function toJudgeShape(value: unknown): { clerk_user_id: string; team_id: string | null } | null {
  if (!value || typeof value !== "object") return null
  const v = value as Record<string, unknown>
  if (typeof v.clerk_user_id !== "string") return null
  const teamId = v.team_id
  if (teamId !== null && typeof teamId !== "string") return null
  return { clerk_user_id: v.clerk_user_id, team_id: teamId as string | null }
}

function toSubmissionShape(value: unknown): { team_id: string | null } | null {
  if (!value || typeof value !== "object") return null
  const v = value as Record<string, unknown>
  const teamId = v.team_id
  if (teamId !== null && typeof teamId !== "string") return null
  return { team_id: teamId as string | null }
}

export async function assertAssignmentWritable(
  assignmentId: string,
  clerkUserId: string,
  hackathon: { id: string; status: string }
): Promise<AssertAssignmentWritableResult> {
  const client = getSupabase()

  if (hackathon.status !== "judging" && hackathon.status !== "active") {
    return {
      ok: false,
      error: "Hackathon is not in judging phase",
      code: "not_judging",
      status: 400,
    }
  }

  type Row = {
    submission_id: string
    round_id: string | null
    hackathon_id: string
    prize_id: string | null
    assignment_kind: "per_prize" | "unified_weighted_score" | null
    is_complete: boolean | null
    notes: string | null
    judge: unknown
    submission: unknown
  }
  const { data } = await client
    .from("judge_assignments")
    .select(`
      submission_id, round_id, hackathon_id, prize_id, assignment_kind, is_complete, notes,
      judge:hackathon_participants!judge_participant_id(clerk_user_id, team_id),
      submission:submissions!submission_id(team_id)
    `)
    .eq("id", assignmentId)
    .maybeSingle<Row>()

  if (!data) {
    return {
      ok: false,
      error: "Assignment not found",
      code: "not_found",
      status: 404,
    }
  }

  if (data.hackathon_id !== hackathon.id) {
    return {
      ok: false,
      error: "Assignment not found",
      code: "not_found",
      status: 404,
    }
  }

  const judge = toJudgeShape(data.judge)
  const submission = toSubmissionShape(data.submission)

  if (judge?.clerk_user_id !== clerkUserId) {
    return {
      ok: false,
      error: "Assignment not found",
      code: "not_found",
      status: 404,
    }
  }

  if (judge.team_id && submission?.team_id && judge.team_id === submission.team_id) {
    return {
      ok: false,
      error: "You cannot score a project from your own team",
      code: "self_judging",
      status: 409,
    }
  }

  const roundId = data.round_id
  if (roundId) {
    const { data: round } = await client
      .from("judging_rounds")
      .select("status")
      .eq("id", roundId)
      .maybeSingle()

    if (round && round.status !== "active" && round.status !== "planned") {
      return {
        ok: false,
        error: "This round is no longer open for scoring",
        code: "round_not_active",
        status: 400,
      }
    }
  }

  return {
    ok: true,
    ownership: {
      hackathonId: data.hackathon_id,
      prizeId: data.prize_id ?? null,
      isComplete: data.is_complete === true,
      submissionId: data.submission_id,
      notes: data.notes ?? "",
      assignmentKind: data.assignment_kind ?? "per_prize",
    },
  }
}

export type ClearJudgeAssignmentsResult = {
  success: boolean
  removedCount: number
  resultsStale: boolean
  partialFailure?: "prize_assignments"
}

export async function clearAllJudgeAssignments(
  hackathonId: string
): Promise<ClearJudgeAssignmentsResult> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: deleted, error: assignmentError } = await client
    .from("judge_assignments")
    .delete()
    .eq("hackathon_id", hackathonId)
    .select("id")

  if (assignmentError) {
    console.error("Failed to clear judge assignments:", assignmentError)
    return { success: false, removedCount: 0, resultsStale: false }
  }

  const removedCount = deleted?.length ?? 0

  if (removedCount === 0) {
    return { success: true, removedCount: 0, resultsStale: false }
  }

  const { error: prizeAssignmentError } = await client
    .from("judge_prize_assignments")
    .delete()
    .eq("hackathon_id", hackathonId)

  if (prizeAssignmentError) {
    console.error("Failed to clear judge_prize_assignments:", prizeAssignmentError)
    return {
      success: false,
      removedCount,
      resultsStale: false,
      partialFailure: "prize_assignments",
    }
  }

  const { data: existingResults } = await client
    .from("hackathon_results")
    .select("id")
    .eq("hackathon_id", hackathonId)
    .limit(1)

  const resultsStale = (existingResults?.length ?? 0) > 0
  return { success: true, removedCount, resultsStale }
}

export async function removeJudgeFromPrize(
  hackathonId: string,
  judgeParticipantId: string,
  prizeId: string
): Promise<{ removedCount: number }> {
  const client = getSupabase() as unknown as SupabaseClient

  await client
    .from("judge_prize_assignments")
    .delete()
    .eq("judge_participant_id", judgeParticipantId)
    .eq("prize_id", prizeId)

  const { data: toDelete } = await client
    .from("judge_assignments")
    .select("id")
    .eq("hackathon_id", hackathonId)
    .eq("judge_participant_id", judgeParticipantId)
    .eq("prize_id", prizeId)

  if (!toDelete || toDelete.length === 0) return { removedCount: 0 }

  const { error } = await client
    .from("judge_assignments")
    .delete()
    .eq("hackathon_id", hackathonId)
    .eq("judge_participant_id", judgeParticipantId)
    .eq("prize_id", prizeId)

  if (error) {
    console.error("Failed to remove judge from prize:", error)
    return { removedCount: 0 }
  }

  return { removedCount: toDelete.length }
}

export async function autoAssignJudges(
  hackathonId: string,
  prizeId: string,
  submissionsPerJudge: number,
  options?: { roomId?: string | null }
): Promise<{ assignedCount: number }> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: prize } = await client
    .from("prizes")
    .select("id, round_id, allowed_team_modes, judging_style")
    .eq("id", prizeId)
    .eq("hackathon_id", hackathonId)
    .single()

  if (!prize) return { assignedCount: 0 }

  if ((prize as { judging_style: string | null }).judging_style === "weighted_score") {
    return { assignedCount: 0 }
  }

  const { data: judges } = await client
    .from("hackathon_participants")
    .select("id, team_id")
    .eq("hackathon_id", hackathonId)
    .eq("role", "judge")

  if (!judges || judges.length === 0) return { assignedCount: 0 }

  const pool = await getRoundPool(hackathonId, prize.round_id)
  if (pool.length === 0) return { assignedCount: 0 }

  const roomTeamIds = options?.roomId
    ? await getTeamIdsInRoom(client, options.roomId)
    : null

  if (roomTeamIds && roomTeamIds.length === 0) return { assignedCount: 0 }

  const { data: submissionsRaw } = await client
    .from("submissions")
    .select("id, team_id, teams:teams!submissions_team_id_fkey(id, mode)")
    .in("id", pool)

  if (!submissionsRaw || submissionsRaw.length === 0) return { assignedCount: 0 }

  const allowedModes = (prize as { allowed_team_modes: ("in_person" | "virtual")[] | null }).allowed_team_modes
  const roomTeamIdSet = roomTeamIds ? new Set(roomTeamIds) : null
  const submissions = (submissionsRaw as unknown as { id: string; team_id: string; teams: { id: string; mode: "in_person" | "virtual" | null } | null }[])
    .filter((s) => {
      if (roomTeamIdSet && !roomTeamIdSet.has(s.team_id)) return false
      if (!allowedModes || allowedModes.length === 0) return true
      return s.teams?.mode ? allowedModes.includes(s.teams.mode) : false
    })

  if (submissions.length === 0) return { assignedCount: 0 }

  const { data: existing } = await client
    .from("judge_assignments")
    .select("judge_participant_id, submission_id")
    .eq("prize_id", prizeId)

  const existingSet = new Set(
    (existing ?? []).map((e) => `${e.judge_participant_id}:${e.submission_id}`)
  )

  const judgeAssignCounts: Record<string, number> = {}
  const subAssignCounts: Record<string, number> = {}
  for (const e of existing ?? []) {
    judgeAssignCounts[e.judge_participant_id] = (judgeAssignCounts[e.judge_participant_id] ?? 0) + 1
    subAssignCounts[e.submission_id] = (subAssignCounts[e.submission_id] ?? 0) + 1
  }

  const newAssignments: { hackathon_id: string; judge_participant_id: string; submission_id: string; prize_id: string; round_id: string | null }[] = []

  let changed = true
  while (changed) {
    changed = false
    const sortedSubs = [...submissions].sort(
      (a, b) => (subAssignCounts[a.id] ?? 0) - (subAssignCounts[b.id] ?? 0)
    )

    for (const sub of sortedSubs) {
      const sortedJudges = [...judges].sort(
        (a, b) => (judgeAssignCounts[a.id] ?? 0) - (judgeAssignCounts[b.id] ?? 0)
      )

      for (const judge of sortedJudges) {
        if ((judgeAssignCounts[judge.id] ?? 0) >= submissionsPerJudge) continue
        if (judge.team_id && sub.team_id && judge.team_id === sub.team_id) continue
        const key = `${judge.id}:${sub.id}`
        if (existingSet.has(key)) continue

        newAssignments.push({
          hackathon_id: hackathonId,
          judge_participant_id: judge.id,
          submission_id: sub.id,
          prize_id: prizeId,
          round_id: prize.round_id,
        })
        existingSet.add(key)
        judgeAssignCounts[judge.id] = (judgeAssignCounts[judge.id] ?? 0) + 1
        subAssignCounts[sub.id] = (subAssignCounts[sub.id] ?? 0) + 1
        changed = true
        break
      }
    }
  }

  if (newAssignments.length === 0) return { assignedCount: 0 }

  const { error } = await client.from("judge_assignments").insert(newAssignments)
  if (error) {
    console.error("Failed to auto-assign judges:", error)
    return { assignedCount: 0 }
  }

  return { assignedCount: newAssignments.length }
}

// ============================================================
// Room-based auto-assignment on submission
// ============================================================

export const ROOM_ROUTING_STATUSES = new Set(["active", "judging"])

export type RoomRoutingResult = {
  routed: boolean
  reason?:
    | "team_has_no_room"
    | "room_has_no_judges"
    | "self_judging_only"
    | "all_existed"
  assignedCount: number
}

export async function autoAssignSubmissionToRoomJudges(input: {
  hackathonId: string
  submissionId: string
  teamId: string | null
}): Promise<RoomRoutingResult> {
  if (!input.teamId) {
    return { routed: false, reason: "team_has_no_room", assignedCount: 0 }
  }

  const client = getSupabase() as unknown as SupabaseClient

  const { data: roomTeam } = await client
    .from("room_teams")
    .select("room_id")
    .eq("team_id", input.teamId)
    .maybeSingle()

  if (!roomTeam) {
    return { routed: false, reason: "team_has_no_room", assignedCount: 0 }
  }

  const { data: roomJudges } = await client
    .from("judge_room_assignments")
    .select("judge_participant_id")
    .eq("room_id", (roomTeam as { room_id: string }).room_id)

  const judgeIds = (roomJudges ?? []).map((rj: { judge_participant_id: string }) => rj.judge_participant_id)
  if (judgeIds.length === 0) {
    return { routed: false, reason: "room_has_no_judges", assignedCount: 0 }
  }

  const { data: judgeRows } = await client
    .from("hackathon_participants")
    .select("id, team_id")
    .in("id", judgeIds)

  const eligibleJudgeIds = (judgeRows ?? [])
    .filter((j: { id: string; team_id: string | null }) => !(j.team_id && j.team_id === input.teamId))
    .map((j: { id: string }) => j.id)

  if (eligibleJudgeIds.length === 0) {
    return { routed: false, reason: "self_judging_only", assignedCount: 0 }
  }

  const { data: existing } = await client
    .from("judge_assignments")
    .select("judge_participant_id")
    .eq("submission_id", input.submissionId)
    .eq("assignment_kind", "unified_weighted_score")
    .in("judge_participant_id", eligibleJudgeIds)

  const existingSet = new Set(
    (existing ?? []).map((e: { judge_participant_id: string }) => e.judge_participant_id)
  )

  const rows = eligibleJudgeIds
    .filter((id) => !existingSet.has(id))
    .map((id) => ({
      hackathon_id: input.hackathonId,
      judge_participant_id: id,
      submission_id: input.submissionId,
      prize_id: null,
      round_id: null,
      assignment_kind: "unified_weighted_score",
    }))

  if (rows.length === 0) {
    return { routed: true, reason: "all_existed", assignedCount: 0 }
  }

  const { error } = await client.from("judge_assignments").insert(rows)
  if (error) {
    console.error("Failed to route submission to room judges:", error)
    return { routed: false, assignedCount: 0 }
  }

  return { routed: true, assignedCount: rows.length }
}

export type RoomRoutingSyncResult = {
  submissionsProcessed: number
  totalAssignmentsCreated: number
  reasonCounts: Record<string, number>
  skipped?: "hackathon_status"
}

export async function syncRoomSubmissionsToJudges(
  hackathonId: string
): Promise<RoomRoutingSyncResult> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: hackathon } = await client
    .from("hackathons")
    .select("status")
    .eq("id", hackathonId)
    .maybeSingle()

  if (!hackathon || !ROOM_ROUTING_STATUSES.has((hackathon as { status: string }).status)) {
    return {
      submissionsProcessed: 0,
      totalAssignmentsCreated: 0,
      reasonCounts: {},
      skipped: "hackathon_status",
    }
  }

  const { data: rooms } = await client
    .from("rooms")
    .select("id")
    .eq("hackathon_id", hackathonId)

  const roomIds = (rooms ?? []).map((r: { id: string }) => r.id)
  if (roomIds.length === 0) {
    return { submissionsProcessed: 0, totalAssignmentsCreated: 0, reasonCounts: {} }
  }

  const [{ data: roomTeams }, { data: roomJudges }] = await Promise.all([
    client.from("room_teams").select("room_id, team_id").in("room_id", roomIds),
    client.from("judge_room_assignments").select("room_id, judge_participant_id").in("room_id", roomIds),
  ])

  const teamToRoom = new Map<string, string>()
  for (const rt of (roomTeams ?? []) as { room_id: string; team_id: string }[]) {
    teamToRoom.set(rt.team_id, rt.room_id)
  }

  const judgesByRoom = new Map<string, string[]>()
  const allJudgeIds = new Set<string>()
  for (const rj of (roomJudges ?? []) as { room_id: string; judge_participant_id: string }[]) {
    const list = judgesByRoom.get(rj.room_id) ?? []
    list.push(rj.judge_participant_id)
    judgesByRoom.set(rj.room_id, list)
    allJudgeIds.add(rj.judge_participant_id)
  }

  const teamIds = Array.from(teamToRoom.keys())
  if (teamIds.length === 0) {
    return { submissionsProcessed: 0, totalAssignmentsCreated: 0, reasonCounts: {} }
  }

  const { data: submissions } = await client
    .from("submissions")
    .select("id, team_id")
    .eq("hackathon_id", hackathonId)
    .eq("status", "submitted")
    .in("team_id", teamIds)

  const subs = (submissions ?? []) as { id: string; team_id: string }[]

  const judgeTeams = new Map<string, string | null>()
  if (allJudgeIds.size > 0) {
    const { data: judgeRows } = await client
      .from("hackathon_participants")
      .select("id, team_id")
      .in("id", Array.from(allJudgeIds))
    for (const j of (judgeRows ?? []) as { id: string; team_id: string | null }[]) {
      judgeTeams.set(j.id, j.team_id)
    }
  }

  const submissionIds = subs.map((s) => s.id)
  const existingBySubmission = new Map<string, Set<string>>()
  if (submissionIds.length > 0) {
    const { data: existing } = await client
      .from("judge_assignments")
      .select("submission_id, judge_participant_id")
      .eq("assignment_kind", "unified_weighted_score")
      .in("submission_id", submissionIds)
    for (const e of (existing ?? []) as { submission_id: string; judge_participant_id: string }[]) {
      const set = existingBySubmission.get(e.submission_id) ?? new Set<string>()
      set.add(e.judge_participant_id)
      existingBySubmission.set(e.submission_id, set)
    }
  }

  const reasonCounts: Record<string, number> = {}
  const bumpReason = (key: string) => {
    reasonCounts[key] = (reasonCounts[key] ?? 0) + 1
  }

  const rowsToInsert: {
    hackathon_id: string
    judge_participant_id: string
    submission_id: string
    prize_id: null
    round_id: null
    assignment_kind: string
  }[] = []

  for (const sub of subs) {
    const roomId = teamToRoom.get(sub.team_id)
    if (!roomId) {
      bumpReason("team_has_no_room")
      continue
    }
    const judges = judgesByRoom.get(roomId) ?? []
    if (judges.length === 0) {
      bumpReason("room_has_no_judges")
      continue
    }
    const eligible = judges.filter((id) => {
      const judgeTeamId = judgeTeams.get(id)
      return !(judgeTeamId && judgeTeamId === sub.team_id)
    })
    if (eligible.length === 0) {
      bumpReason("self_judging_only")
      continue
    }
    const existing = existingBySubmission.get(sub.id) ?? new Set<string>()
    const newJudges = eligible.filter((id) => !existing.has(id))
    if (newJudges.length === 0) {
      bumpReason("all_existed")
      continue
    }
    for (const id of newJudges) {
      rowsToInsert.push({
        hackathon_id: hackathonId,
        judge_participant_id: id,
        submission_id: sub.id,
        prize_id: null,
        round_id: null,
        assignment_kind: "unified_weighted_score",
      })
    }
    bumpReason("routed")
  }

  if (rowsToInsert.length === 0) {
    return { submissionsProcessed: subs.length, totalAssignmentsCreated: 0, reasonCounts }
  }

  const CHUNK_SIZE = 500
  let inserted = 0
  for (let i = 0; i < rowsToInsert.length; i += CHUNK_SIZE) {
    const chunk = rowsToInsert.slice(i, i + CHUNK_SIZE)
    const { error } = await client.from("judge_assignments").insert(chunk)
    if (error) {
      console.error("Failed to bulk-insert room-routed judge assignments:", error)
      return { submissionsProcessed: subs.length, totalAssignmentsCreated: inserted, reasonCounts }
    }
    inserted += chunk.length
  }

  return { submissionsProcessed: subs.length, totalAssignmentsCreated: inserted, reasonCounts }
}

// ============================================================
// Scoring: Bucket Sort
// ============================================================

export type SubmitBinaryResponseInput = {
  criteriaId: string
  passed: boolean
}

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
    await submitBinaryResponses(assignmentId, input.gates)
  }

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
    return { success: false, error: "Failed to submit bucket response", code: "bucket_failed" }
  }

  const { error: updateError } = await client
    .from("judge_assignments")
    .update({ is_complete: true, completed_at: new Date().toISOString() })
    .eq("id", assignmentId)

  if (updateError) {
    return { success: false, error: "Failed to mark assignment complete", code: "update_failed" }
  }

  return { success: true }
}

// ============================================================
// Scoring: Gate Check
// ============================================================

export async function submitBinaryResponses(
  assignmentId: string,
  responses: SubmitBinaryResponseInput[]
): Promise<BinaryResponse[]> {
  const client = getSupabase() as unknown as SupabaseClient
  const now = new Date().toISOString()

  const results: BinaryResponse[] = []
  for (const r of responses) {
    const { data, error } = await client
      .from("binary_responses")
      .upsert(
        {
          judge_assignment_id: assignmentId,
          criteria_id: r.criteriaId,
          passed: r.passed,
          updated_at: now,
        },
        { onConflict: "judge_assignment_id,criteria_id" }
      )
      .select()
      .single()

    if (error) {
      console.error("Failed to submit binary response:", error)
      continue
    }
    results.push(data as unknown as BinaryResponse)
  }

  return results
}

export async function submitGateCheckResponse(
  assignmentId: string,
  gates: SubmitBinaryResponseInput[]
): Promise<{ success: true } | { success: false; error: string; code: string }> {
  const client = getSupabase() as unknown as SupabaseClient

  await submitBinaryResponses(assignmentId, gates)

  const { error } = await client
    .from("judge_assignments")
    .update({ is_complete: true, completed_at: new Date().toISOString() })
    .eq("id", assignmentId)

  if (error) {
    return { success: false, error: "Failed to mark assignment complete", code: "update_failed" }
  }

  return { success: true }
}

// ============================================================
// Scoring: Judge's Pick
// ============================================================

export async function submitJudgesPick(
  hackathonId: string,
  judgeParticipantId: string,
  prizeId: string,
  rankedSubmissionIds: string[]
): Promise<{ success: true } | { success: false; error: string; code: string }> {
  const client = getSupabase() as unknown as SupabaseClient

  const uniqueSubmissionIds = [...new Set(rankedSubmissionIds)]
  if (uniqueSubmissionIds.length === 0) {
    return { success: false, error: "Pick at least one project", code: "picks_required" }
  }

  const { data: prize } = await client
    .from("prizes")
    .select("id, max_picks")
    .eq("id", prizeId)
    .eq("hackathon_id", hackathonId)
    .eq("judging_style", "judges_pick")
    .maybeSingle()

  if (!prize) {
    return { success: false, error: "Prize not found", code: "prize_not_found" }
  }

  const maxPicks = Math.max(1, prize.max_picks ?? 1)
  if (uniqueSubmissionIds.length > maxPicks) {
    return {
      success: false,
      error: `Pick up to ${maxPicks} ${maxPicks === 1 ? "project" : "projects"}`,
      code: "too_many_picks",
    }
  }

  const { data: assignments } = await client
    .from("judge_assignments")
    .select("submission_id")
    .eq("hackathon_id", hackathonId)
    .eq("judge_participant_id", judgeParticipantId)
    .eq("prize_id", prizeId)

  const assignedSubmissionIds = new Set((assignments ?? []).map((assignment) => assignment.submission_id))
  if (uniqueSubmissionIds.some((submissionId) => !assignedSubmissionIds.has(submissionId))) {
    return {
      success: false,
      error: "One or more projects aren't assigned to you",
      code: "not_assigned",
    }
  }

  const inserts = uniqueSubmissionIds.map((submissionId, index) => ({
    hackathon_id: hackathonId,
    judge_participant_id: judgeParticipantId,
    prize_id: prizeId,
    submission_id: submissionId,
    rank: index + 1,
    updated_at: new Date().toISOString(),
  }))

  const { error: upsertError } = await client.from("judge_picks").upsert(inserts, {
    onConflict: "hackathon_id,judge_participant_id,prize_id,submission_id",
  })
  if (upsertError) {
    return { success: false, error: "Failed to submit picks", code: "insert_failed" }
  }

  const { error: deleteError } = await client
    .from("judge_picks")
    .delete()
    .eq("hackathon_id", hackathonId)
    .eq("judge_participant_id", judgeParticipantId)
    .eq("prize_id", prizeId)
    .not("submission_id", "in", `(${uniqueSubmissionIds.join(",")})`)

  if (deleteError) {
    return { success: false, error: "Failed to clear older picks", code: "delete_failed" }
  }

  const { error: completeError } = await client
    .from("judge_assignments")
    .update({ is_complete: true, completed_at: new Date().toISOString() })
    .eq("hackathon_id", hackathonId)
    .eq("judge_participant_id", judgeParticipantId)
    .eq("prize_id", prizeId)

  if (completeError) {
    console.error("Failed to mark assignments complete:", completeError)
  }

  return { success: true }
}

// ============================================================
// Results calculation
// ============================================================

export async function calculatePrizeResults(
  hackathonId: string,
  prizeId: string
): Promise<{ success: boolean; count: number }> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: prize } = await client
    .from("prizes")
    .select("judging_style")
    .eq("id", prizeId)
    .eq("hackathon_id", hackathonId)
    .single()

  if (!prize) return { success: false, count: 0 }

  const style = (prize as unknown as Prize).judging_style

  switch (style) {
    case "bucket_sort":
      return calculateBucketSortResults(hackathonId, prizeId)
    case "gate_check":
      return calculateGateCheckResults(hackathonId, prizeId)
    case "judges_pick":
      return calculateJudgesPickResults(hackathonId, prizeId)
    case "crowd_vote":
      return calculateCrowdVoteResults(hackathonId, prizeId)
    case "weighted_score":
      return calculateWeightedScoreResults(hackathonId, prizeId)
    default:
      return { success: false, count: 0 }
  }
}

async function calculateBucketSortResults(
  hackathonId: string,
  prizeId: string
): Promise<{ success: boolean; count: number }> {
  const client = getSupabase() as unknown as SupabaseClient

  const { error: deleteError } = await client
    .from("hackathon_results")
    .delete()
    .eq("hackathon_id", hackathonId)
    .eq("prize_id", prizeId)

  if (deleteError) {
    console.error("Failed to clear results:", deleteError)
    return { success: false, count: 0 }
  }

  const { data: assignments } = await client
    .from("judge_assignments")
    .select("id, submission_id")
    .eq("hackathon_id", hackathonId)
    .eq("prize_id", prizeId)
    .eq("is_complete", true)

  if (!assignments || assignments.length === 0) return { success: true, count: 0 }

  const { data: bucketResponses } = await client
    .from("bucket_responses")
    .select("judge_assignment_id, bucket_id")
    .in("judge_assignment_id", assignments.map((a) => a.id))

  const { data: bucketDefs } = await client
    .from("bucket_definitions")
    .select("id, level")
    .eq("prize_id", prizeId)

  if (!bucketResponses || !bucketDefs) return { success: false, count: 0 }

  const bucketLevelMap = new Map(bucketDefs.map((b) => [b.id, b.level]))
  const assignmentSubMap = new Map(assignments.map((a) => [a.id, a.submission_id]))

  const scores: Record<string, { totalLevel: number; judgeCount: number }> = {}
  for (const resp of bucketResponses) {
    const sid = assignmentSubMap.get(resp.judge_assignment_id)
    const level = bucketLevelMap.get(resp.bucket_id)
    if (!sid || level === undefined) continue

    if (!scores[sid]) scores[sid] = { totalLevel: 0, judgeCount: 0 }
    scores[sid].totalLevel += level
    scores[sid].judgeCount++
  }

  const ranked = Object.entries(scores)
    .map(([sid, { totalLevel, judgeCount }]) => ({
      sid,
      avg: totalLevel / judgeCount,
      total: totalLevel,
      judgeCount,
    }))
    .sort((a, b) => b.avg - a.avg || b.total - a.total)

  return insertRankedResults(hackathonId, prizeId, ranked)
}

async function calculateGateCheckResults(
  hackathonId: string,
  prizeId: string
): Promise<{ success: boolean; count: number }> {
  const client = getSupabase() as unknown as SupabaseClient

  const { error: deleteError } = await client
    .from("hackathon_results")
    .delete()
    .eq("hackathon_id", hackathonId)
    .eq("prize_id", prizeId)

  if (deleteError) return { success: false, count: 0 }

  const { data: assignments } = await client
    .from("judge_assignments")
    .select("id, submission_id")
    .eq("hackathon_id", hackathonId)
    .eq("prize_id", prizeId)
    .eq("is_complete", true)

  if (!assignments || assignments.length === 0) return { success: true, count: 0 }

  const { data: binaryResponses } = await client
    .from("binary_responses")
    .select("judge_assignment_id, passed")
    .in("judge_assignment_id", assignments.map((a) => a.id))

  if (!binaryResponses) return { success: false, count: 0 }

  const assignmentSubMap = new Map(assignments.map((a) => [a.id, a.submission_id]))
  const subGates: Record<string, { passed: number; total: number; judgeCount: number }> = {}

  const assignPassCounts: Record<string, { passed: number; total: number }> = {}
  for (const resp of binaryResponses) {
    if (!assignPassCounts[resp.judge_assignment_id]) assignPassCounts[resp.judge_assignment_id] = { passed: 0, total: 0 }
    assignPassCounts[resp.judge_assignment_id].total++
    if (resp.passed) assignPassCounts[resp.judge_assignment_id].passed++
  }

  for (const [aId, counts] of Object.entries(assignPassCounts)) {
    const sid = assignmentSubMap.get(aId)
    if (!sid) continue
    if (!subGates[sid]) subGates[sid] = { passed: 0, total: 0, judgeCount: 0 }
    subGates[sid].passed += counts.passed
    subGates[sid].total += counts.total
    subGates[sid].judgeCount++
  }

  const ranked = Object.entries(subGates)
    .map(([sid, { passed, total, judgeCount }]) => ({
      sid,
      avg: total > 0 ? passed / total : 0,
      total: passed,
      judgeCount,
    }))
    .sort((a, b) => b.avg - a.avg || b.total - a.total)

  return insertRankedResults(hackathonId, prizeId, ranked)
}

async function calculateJudgesPickResults(
  hackathonId: string,
  prizeId: string
): Promise<{ success: boolean; count: number }> {
  const client = getSupabase() as unknown as SupabaseClient

  const { error: deleteError } = await client
    .from("hackathon_results")
    .delete()
    .eq("hackathon_id", hackathonId)
    .eq("prize_id", prizeId)

  if (deleteError) return { success: false, count: 0 }

  const { data: prize } = await client
    .from("prizes")
    .select("max_picks")
    .eq("id", prizeId)
    .single()

  const maxPicks = (prize as unknown as Prize)?.max_picks ?? 3

  const { data: picks } = await client
    .from("judge_picks")
    .select("judge_participant_id, submission_id, rank")
    .eq("hackathon_id", hackathonId)
    .eq("prize_id", prizeId)

  if (!picks || picks.length === 0) return { success: true, count: 0 }

  const judgeIds = [...new Set(picks.map((p) => p.judge_participant_id))]

  // Borda count: 1st pick gets maxPicks points, 2nd gets maxPicks-1, etc.
  const bordaScores: Record<string, { score: number; pickCount: number }> = {}
  for (const pick of picks) {
    if (!bordaScores[pick.submission_id]) bordaScores[pick.submission_id] = { score: 0, pickCount: 0 }
    bordaScores[pick.submission_id].score += Math.max(0, maxPicks - pick.rank + 1)
    bordaScores[pick.submission_id].pickCount++
  }

  const ranked = Object.entries(bordaScores)
    .map(([sid, { score }]) => ({
      sid,
      avg: score,
      total: score,
      judgeCount: judgeIds.length,
    }))
    .sort((a, b) => b.avg - a.avg)

  return insertRankedResults(hackathonId, prizeId, ranked)
}

async function calculateCrowdVoteResults(
  hackathonId: string,
  prizeId: string
): Promise<{ success: boolean; count: number }> {
  const client = getSupabase() as unknown as SupabaseClient

  const { error: deleteError } = await client
    .from("hackathon_results")
    .delete()
    .eq("hackathon_id", hackathonId)
    .eq("prize_id", prizeId)

  if (deleteError) return { success: false, count: 0 }

  const { data: votes } = await client
    .from("crowd_votes")
    .select("submission_id")
    .eq("hackathon_id", hackathonId)
    .eq("prize_id", prizeId)

  if (!votes || votes.length === 0) return { success: true, count: 0 }

  const voteCounts: Record<string, number> = {}
  for (const v of votes) {
    voteCounts[v.submission_id] = (voteCounts[v.submission_id] ?? 0) + 1
  }

  const ranked = Object.entries(voteCounts)
    .map(([sid, count]) => ({
      sid,
      avg: count,
      total: count,
      judgeCount: votes.length,
    }))
    .sort((a, b) => b.avg - a.avg)

  return insertRankedResults(hackathonId, prizeId, ranked)
}

async function insertRankedResults(
  hackathonId: string,
  prizeId: string,
  ranked: { sid: string; avg: number; total: number; judgeCount: number }[]
): Promise<{ success: boolean; count: number }> {
  if (ranked.length === 0) return { success: true, count: 0 }

  const client = getSupabase() as unknown as SupabaseClient

  let currentRank = 1
  const inserts = ranked.map((r, i) => {
    if (
      i > 0 &&
      (r.avg !== ranked[i - 1].avg || r.total !== ranked[i - 1].total)
    ) {
      currentRank = i + 1
    }
    return {
      hackathon_id: hackathonId,
      submission_id: r.sid,
      rank: currentRank,
      total_score: r.total,
      weighted_score: r.avg,
      judge_count: r.judgeCount,
      prize_id: prizeId,
      result_kind: "prize" as const,
    }
  })

  const { error } = await client.from("hackathon_results").insert(inserts)
  if (error) {
    console.error("Failed to insert results:", error)
    return { success: false, count: 0 }
  }

  return { success: true, count: inserts.length }
}

export async function recalculateForAssignment(assignmentId: string): Promise<void> {
  const client = getSupabase() as unknown as SupabaseClient
  type Row = {
    hackathon_id: string
    prize_id: string | null
    assignment_kind: "per_prize" | "unified_weighted_score" | null
  }
  const { data } = await client
    .from("judge_assignments")
    .select("hackathon_id, prize_id, assignment_kind")
    .eq("id", assignmentId)
    .single<Row>()

  if (!data?.hackathon_id) return

  if (data.assignment_kind === "unified_weighted_score") {
    const { data: weightedPrizes } = await client
      .from("prizes")
      .select("id")
      .eq("hackathon_id", data.hackathon_id)
      .eq("judging_style", "weighted_score")

    await Promise.all([
      ...(weightedPrizes ?? []).map((p) => calculateWeightedScoreResults(data.hackathon_id, p.id)),
      calculateCoreOnlyResults(data.hackathon_id),
    ])
    return
  }

  if (data.prize_id) {
    await calculatePrizeResults(data.hackathon_id, data.prize_id)
  }
}

// ============================================================
// Progress
// ============================================================

export type JudgingProgress = {
  totalAssignments: number
  completedAssignments: number
  judges: { participantId: string; clerkUserId: string; displayName: string; completed: number; total: number }[]
}

export async function getJudgingProgress(hackathonId: string): Promise<JudgingProgress> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: assignments } = await client
    .from("judge_assignments")
    .select("judge_participant_id, is_complete")
    .eq("hackathon_id", hackathonId)

  const { data: judges } = await client
    .from("hackathon_participants")
    .select("id, clerk_user_id")
    .eq("hackathon_id", hackathonId)
    .eq("role", "judge")

  const totalAssignments = assignments?.length ?? 0
  const completedAssignments = assignments?.filter((a) => a.is_complete).length ?? 0

  const judgeMap: Record<string, { completed: number; total: number }> = {}
  for (const a of assignments ?? []) {
    if (!judgeMap[a.judge_participant_id]) judgeMap[a.judge_participant_id] = { completed: 0, total: 0 }
    judgeMap[a.judge_participant_id].total++
    if (a.is_complete) judgeMap[a.judge_participant_id].completed++
  }

  const userMap: Record<string, string> = {}
  if (judges && judges.length > 0) {
    try {
      const { clerkClient } = await import("@clerk/nextjs/server")
      const clerk = await clerkClient()
      const clerkUserIds = judges.map((j) => j.clerk_user_id)
      const clerkUsers = await clerk.users.getUserList({ userId: clerkUserIds, limit: 100 })
      for (const u of clerkUsers.data) {
        userMap[u.id] = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.username || u.id
      }
    } catch (err) {
      console.error("Failed to fetch Clerk users for judging progress:", err)
    }
  }

  return {
    totalAssignments,
    completedAssignments,
    judges: (judges ?? []).map((j) => ({
      participantId: j.id,
      clerkUserId: j.clerk_user_id,
      displayName: userMap[j.clerk_user_id] ?? j.clerk_user_id,
      completed: judgeMap[j.id]?.completed ?? 0,
      total: judgeMap[j.id]?.total ?? 0,
    })),
  }
}

// ============================================================
// Judge-facing: get assignments and mark viewed
// ============================================================

export type JudgeAssignmentForJudge = {
  id: string
  submissionId: string
  submissionTitle: string
  submissionDescription: string | null
  submissionGithubUrl: string | null
  submissionLiveAppUrl: string | null
  submissionDemoVideoUrl: string | null
  submissionScreenshotUrl: string | null
  teamName: string | null
  teamMode: "in_person" | "virtual" | null
  teamMemberCount: number | null
  isComplete: boolean
  notes: string
  viewedAt: string | null
  prizeId: string | null
  prizeName: string | null
  judgingStyle: PrizeJudgingStyle | null
  maxPicks: number | null
  selfJudging: boolean
  assignmentKind: "per_prize" | "unified_weighted_score"
}

export async function getJudgeAssignments(
  hackathonId: string,
  clerkUserId: string
): Promise<JudgeAssignmentForJudge[]> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: participant } = await client
    .from("hackathon_participants")
    .select("id, team_id")
    .eq("hackathon_id", hackathonId)
    .eq("clerk_user_id", clerkUserId)
    .eq("role", "judge")
    .maybeSingle()

  if (!participant) return []

  const judgeTeamId = (participant as { team_id: string | null }).team_id

  const { data: assignmentsRaw, error } = await client
    .from("judge_assignments")
    .select(`
      id, submission_id, is_complete, notes, viewed_at, prize_id, assignment_kind,
      submission:submissions!submission_id(title, description, github_url, live_app_url, demo_video_url, screenshot_url, team_id)
    `)
    .eq("hackathon_id", hackathonId)
    .eq("judge_participant_id", participant.id)
    .order("assigned_at")

  if (error || !assignmentsRaw) return []

  const finalistIds = await getActiveRoundFinalistIds(hackathonId)
  const assignments = finalistIds
    ? assignmentsRaw.filter((a: Record<string, unknown>) =>
        finalistIds.includes(a.submission_id as string)
      )
    : assignmentsRaw

  const prizeIds = [...new Set(assignments.map((a: Record<string, unknown>) => a.prize_id).filter(Boolean))] as string[]
  const prizeMap: Record<string, { name: string; judging_style: string | null; max_picks: number | null }> = {}
  if (prizeIds.length > 0) {
    const { data: prizes } = await client
      .from("prizes")
      .select("id, name, judging_style, max_picks")
      .in("id", prizeIds)
    for (const p of prizes ?? []) {
      prizeMap[p.id] = {
        name: p.name,
        judging_style: p.judging_style,
        max_picks: p.max_picks,
      }
    }
  }

  const teamIds = assignments
    .map((a: Record<string, unknown>) => (a.submission as unknown as { team_id: string | null })?.team_id)
    .filter((id): id is string => id !== null)

  let teamsMap: Record<string, string> = {}
  let teamModeMap: Record<string, "in_person" | "virtual" | null> = {}
  const memberCountMap: Record<string, number> = {}
  if (teamIds.length > 0) {
    const { data: teams } = await client.from("teams").select("id, name, mode").in("id", teamIds)
    teamsMap = Object.fromEntries((teams ?? []).map((t) => [t.id, t.name]))
    teamModeMap = Object.fromEntries(
      (teams ?? []).map((t) => [t.id, (t as { mode: "in_person" | "virtual" | null }).mode ?? null])
    )

    const { data: members } = await client
      .from("hackathon_participants")
      .select("team_id")
      .in("team_id", teamIds)
      .eq("role", "participant")
    if (members) {
      for (const row of members) {
        if (row.team_id) {
          memberCountMap[row.team_id] = (memberCountMap[row.team_id] || 0) + 1
        }
      }
    }
  }

  return assignments.map((a: Record<string, unknown>) => {
    const sub = a.submission as unknown as {
      title: string
      description: string | null
      github_url: string | null
      live_app_url: string | null
      demo_video_url: string | null
      screenshot_url: string | null
      team_id: string | null
    }
    const pid = a.prize_id as string | null
    const kind = ((a.assignment_kind as string | null) ?? "per_prize") as
      | "per_prize"
      | "unified_weighted_score"
    const selfJudging = Boolean(judgeTeamId && sub.team_id && judgeTeamId === sub.team_id)
    return {
      id: a.id as string,
      submissionId: a.submission_id as string,
      submissionTitle: sub.title,
      submissionDescription: sub.description,
      submissionGithubUrl: sub.github_url,
      submissionLiveAppUrl: sub.live_app_url,
      submissionDemoVideoUrl: sub.demo_video_url,
      submissionScreenshotUrl: sub.screenshot_url,
      teamName: sub.team_id ? teamsMap[sub.team_id] ?? null : null,
      teamMode: sub.team_id ? teamModeMap[sub.team_id] ?? null : null,
      teamMemberCount: sub.team_id ? memberCountMap[sub.team_id] ?? null : null,
      isComplete: a.is_complete as boolean,
      notes: a.notes as string,
      viewedAt: (a.viewed_at as string | null) ?? null,
      prizeId: pid,
      prizeName: pid ? prizeMap[pid]?.name ?? null : null,
      judgingStyle: pid
        ? (prizeMap[pid]?.judging_style as PrizeJudgingStyle | null)
        : kind === "unified_weighted_score"
          ? "weighted_score"
          : null,
      maxPicks: pid ? prizeMap[pid]?.max_picks ?? null : null,
      selfJudging,
      assignmentKind: kind,
    }
  })
}

export async function markAssignmentViewed(
  assignmentId: string,
  clerkUserId: string
): Promise<boolean> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: assignment } = await client
    .from("judge_assignments")
    .select("id, viewed_at, judge:hackathon_participants!judge_participant_id(clerk_user_id)")
    .eq("id", assignmentId)
    .single()

  if (!assignment) return false

  const judge = assignment.judge as unknown as { clerk_user_id: string } | null
  if (judge?.clerk_user_id !== clerkUserId) return false
  if (assignment.viewed_at) return true

  const { error } = await client
    .from("judge_assignments")
    .update({ viewed_at: new Date().toISOString() })
    .eq("id", assignmentId)

  if (error) {
    console.error("Failed to mark assignment viewed:", error)
    return false
  }

  return true
}

export async function saveNotes(
  assignmentId: string,
  clerkUserId: string,
  notes: string
): Promise<boolean> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: assignment } = await client
    .from("judge_assignments")
    .select("id, judge:hackathon_participants!judge_participant_id(clerk_user_id)")
    .eq("id", assignmentId)
    .single()

  if (!assignment) return false

  const judge = assignment.judge as unknown as { clerk_user_id: string } | null
  if (judge?.clerk_user_id !== clerkUserId) return false

  const { error } = await client
    .from("judge_assignments")
    .update({ notes })
    .eq("id", assignmentId)

  if (error) {
    console.error("Failed to save notes:", error)
    return false
  }

  return true
}

export type AssignmentDetailCriterion = {
  id: string
  name: string
  description: string | null
  min_score: number
  max_score: number
  weight: number
  category: string | null
  currentScore: number | null
  rubricLevels: { id: string; level_number: number; label: string; description: string | null }[]
  prizeId?: string | null
  prizeName?: string | null
}

export type AssignmentDetail = {
  id: string
  submissionId: string
  submissionTitle: string
  submissionDescription: string | null
  submissionGithubUrl: string | null
  submissionLiveAppUrl: string | null
  submissionDemoVideoUrl: string | null
  submissionScreenshotUrl: string | null
  teamName: string | null
  isComplete: boolean
  notes: string
  criteria: AssignmentDetailCriterion[]
  buckets: {
    id: string
    level: number
    label: string
    description: string | null
  }[]
  existingGateResponses: { criteriaId: string; passed: boolean }[]
  existingBucketId: string | null
  assignmentKind?: "per_prize" | "unified_weighted_score"
}

export async function getAssignmentDetail(
  assignmentId: string,
  ownership: AssignmentOwnership
): Promise<AssignmentDetail | null> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: sub, error: subError } = await client
    .from("submissions")
    .select("title, description, github_url, live_app_url, demo_video_url, screenshot_url, team_id")
    .eq("id", ownership.submissionId)
    .single()

  if (subError || !sub) return null

  type CriteriaRow = {
    id: string
    name: string
    description: string | null
    min_score: number
    max_score: number
    weight: number
    category: string | null
  }

  const teamNamePromise = sub.team_id
    ? client.from("teams").select("name").eq("id", sub.team_id).single().then(({ data }) => data?.name ?? null)
    : Promise.resolve(null)

  type CriteriaRowWithPrize = CriteriaRow & { prize_id: string | null; prize_name?: string | null }

  const fetchCriteria = async (): Promise<CriteriaRowWithPrize[]> => {
    if (ownership.assignmentKind === "unified_weighted_score") {
      const { data: weightedPrizes } = await client
        .from("prizes")
        .select("id, name")
        .eq("hackathon_id", ownership.hackathonId)
        .eq("judging_style", "weighted_score")
        .order("display_order")

      const prizeIds = (weightedPrizes ?? []).map((p) => p.id)
      const prizeNameMap = new Map((weightedPrizes ?? []).map((p) => [p.id, p.name]))

      const { data: coreCriteria } = await client
        .from("judging_criteria")
        .select("id, name, description, min_score, max_score, weight, category, prize_id")
        .eq("hackathon_id", ownership.hackathonId)
        .is("prize_id", null)
        .order("display_order")

      let prizeCriteria: Array<CriteriaRow & { prize_id: string | null }> = []
      if (prizeIds.length > 0) {
        const { data } = await client
          .from("judging_criteria")
          .select("id, name, description, min_score, max_score, weight, category, prize_id")
          .in("prize_id", prizeIds)
          .order("display_order")
        prizeCriteria = (data ?? []) as Array<CriteriaRow & { prize_id: string | null }>
      }

      const result: CriteriaRowWithPrize[] = []
      for (const c of (coreCriteria ?? []) as Array<CriteriaRow & { prize_id: string | null }>) {
        result.push({ ...c, prize_id: null, prize_name: null })
      }
      for (const c of prizeCriteria) {
        result.push({ ...c, prize_name: c.prize_id ? prizeNameMap.get(c.prize_id) ?? null : null })
      }
      return result
    }

    if (ownership.prizeId) {
      const { data } = await client
        .from("judging_criteria")
        .select("id, name, description, min_score, max_score, weight, category")
        .eq("prize_id", ownership.prizeId)
        .order("display_order")
      if (data && data.length > 0) {
        return (data as CriteriaRow[]).map((c) => ({ ...c, prize_id: ownership.prizeId, prize_name: null }))
      }
    }
    const { data } = await client
      .from("judging_criteria")
      .select("id, name, description, min_score, max_score, weight, category")
      .eq("hackathon_id", ownership.hackathonId)
      .is("prize_id", null)
      .order("display_order")
    return ((data ?? []) as CriteriaRow[]).map((c) => ({ ...c, prize_id: null, prize_name: null }))
  }

  const styleDetailsPromise = ownership.prizeId
    ? Promise.all([
        client
          .from("bucket_definitions")
          .select("id, level, label, description")
          .eq("prize_id", ownership.prizeId)
          .order("level"),
        client
          .from("binary_responses")
          .select("criteria_id, passed")
          .eq("judge_assignment_id", assignmentId),
        client
          .from("bucket_responses")
          .select("bucket_id")
          .eq("judge_assignment_id", assignmentId)
          .maybeSingle(),
      ])
    : Promise.resolve([
        { data: [] },
        { data: [] },
        { data: null },
      ] as const)

  const [teamName, criteria, styleDetails] = await Promise.all([
    teamNamePromise,
    fetchCriteria(),
    styleDetailsPromise,
  ])
  const [bucketResult, gateResult, bucketResponseResult] = styleDetails

  const criteriaIds = criteria.map((c) => c.id)

  const rubricMap: Record<string, { id: string; level_number: number; label: string; description: string | null }[]> = {}
  const scoreMap: Record<string, number> = {}

  if (criteriaIds.length > 0) {
    const [levelsResult, scoresResult] = await Promise.all([
      client
        .from("rubric_levels")
        .select("id, criteria_id, level_number, label, description")
        .in("criteria_id", criteriaIds)
        .order("level_number"),
      client
        .from("scores")
        .select("criteria_id, score")
        .eq("judge_assignment_id", assignmentId)
        .in("criteria_id", criteriaIds),
    ])

    for (const lvl of levelsResult.data ?? []) {
      const cid = (lvl as unknown as { criteria_id: string }).criteria_id
      if (!rubricMap[cid]) rubricMap[cid] = []
      rubricMap[cid].push({
        id: lvl.id,
        level_number: lvl.level_number,
        label: lvl.label,
        description: lvl.description ?? null,
      })
    }

    for (const s of scoresResult.data ?? []) {
      scoreMap[s.criteria_id] = s.score
    }
  }

  return {
    id: assignmentId,
    submissionId: ownership.submissionId,
    submissionTitle: sub.title,
    submissionDescription: sub.description,
    submissionGithubUrl: sub.github_url,
    submissionLiveAppUrl: sub.live_app_url,
    submissionDemoVideoUrl: sub.demo_video_url,
    submissionScreenshotUrl: sub.screenshot_url,
    teamName,
    isComplete: ownership.isComplete,
    notes: ownership.notes,
    assignmentKind: ownership.assignmentKind ?? "per_prize",
    buckets: (bucketResult.data ?? []).map((bucket) => ({
      id: bucket.id,
      level: bucket.level,
      label: bucket.label,
      description: bucket.description ?? null,
    })),
    existingGateResponses: (gateResult.data ?? []).map((response) => ({
      criteriaId: response.criteria_id,
      passed: response.passed,
    })),
    existingBucketId: bucketResponseResult.data?.bucket_id ?? null,
    criteria: criteria.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      min_score: Number(c.min_score),
      max_score: c.max_score,
      weight: Number(c.weight), // Supabase returns Postgres numeric columns as strings
      category: c.category ?? null,
      currentScore: scoreMap[c.id] ?? null,
      rubricLevels: rubricMap[c.id] ?? [],
      prizeId: c.prize_id ?? null,
      prizeName: c.prize_name ?? null,
    })),
  }
}

export type SubmitScoresResult =
  | { success: true }
  | { success: false; error: string; code: string }

export async function submitScores(
  assignmentId: string,
  ownership: AssignmentOwnership,
  scores: { criteriaId: string; score: number }[],
  notes: string
): Promise<SubmitScoresResult> {
  const client = getSupabase() as unknown as SupabaseClient

  type CriterionRow = { id: string; min_score: number; max_score: number }
  let criteria: CriterionRow[] = []

  if (ownership.assignmentKind === "unified_weighted_score") {
    const { data: weightedPrizes } = await client
      .from("prizes")
      .select("id")
      .eq("hackathon_id", ownership.hackathonId)
      .eq("judging_style", "weighted_score")
    const prizeIds = (weightedPrizes ?? []).map((p) => p.id)

    const corePromise = client
      .from("judging_criteria")
      .select("id, min_score, max_score")
      .eq("hackathon_id", ownership.hackathonId)
      .is("prize_id", null)
    const prizePromise =
      prizeIds.length > 0
        ? client
            .from("judging_criteria")
            .select("id, min_score, max_score")
            .in("prize_id", prizeIds)
        : Promise.resolve({ data: [] as CriterionRow[] })

    const [coreResult, prizeResult] = await Promise.all([corePromise, prizePromise])
    criteria = [...((coreResult.data ?? []) as CriterionRow[]), ...((prizeResult.data ?? []) as CriterionRow[])]
  } else if (ownership.prizeId) {
    const { data } = await client
      .from("judging_criteria")
      .select("id, min_score, max_score")
      .eq("prize_id", ownership.prizeId)
    criteria = (data ?? []) as CriterionRow[]
  } else {
    const { data } = await client
      .from("judging_criteria")
      .select("id, min_score, max_score")
      .eq("hackathon_id", ownership.hackathonId)
      .is("prize_id", null)
    criteria = (data ?? []) as CriterionRow[]
  }

  if (scores.length === 0 && criteria.length > 0) {
    return { success: false, error: "Scores are required for all criteria", code: "empty_scores" }
  }

  if (scores.length > 0) {
    const validCriteriaIds = new Set(criteria.map((c) => c.id))
    const maxScoreMap = new Map(criteria.map((c) => [c.id, c.max_score]))
    const minScoreMap = new Map(criteria.map((c) => [c.id, c.min_score]))

    for (const s of scores) {
      if (!validCriteriaIds.has(s.criteriaId)) {
        return { success: false, error: "One or more criteria IDs are invalid", code: "invalid_criteria" }
      }
      const minScore = minScoreMap.get(s.criteriaId) ?? 0
      if (s.score < minScore) {
        return {
          success: false,
          error: `Score ${s.score} is below minimum ${minScore}`,
          code: "invalid_score",
        }
      }
      const maxScore = maxScoreMap.get(s.criteriaId)
      if (maxScore != null && s.score > maxScore) {
        return { success: false, error: `Score ${s.score} exceeds maximum ${maxScore}`, code: "score_exceeds_max" }
      }
    }
  }

  const rows = scores.map((s) => ({
    judge_assignment_id: assignmentId,
    criteria_id: s.criteriaId,
    score: s.score,
    updated_at: new Date().toISOString(),
  }))

  if (rows.length > 0) {
    const { error: upsertError } = await client
      .from("scores")
      .upsert(rows, { onConflict: "judge_assignment_id,criteria_id" })

    if (upsertError) {
      console.error("Failed to upsert scores:", upsertError)
      return { success: false, error: "Failed to save scores", code: "upsert_failed" }
    }
  }

  const { error: updateError } = await client
    .from("judge_assignments")
    .update({
      notes,
      is_complete: true,
      completed_at: new Date().toISOString(),
    })
    .eq("id", assignmentId)

  if (updateError) {
    console.error("Failed to mark assignment complete:", updateError)
    return { success: false, error: "Failed to complete assignment", code: "update_failed" }
  }

  return { success: true }
}

export type CoreCriterionInput = {
  name: string
  description?: string | null
  weight: number
  minScore?: number
  maxScore?: number
}

export type CoreCriterion = {
  id: string
  name: string
  description: string | null
  weight: number
  minScore: number
  maxScore: number
  displayOrder: number
}

export async function listCoreCriteria(hackathonId: string): Promise<CoreCriterion[]> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data, error } = await client
    .from("judging_criteria")
    .select("id, name, description, weight, min_score, max_score, display_order")
    .eq("hackathon_id", hackathonId)
    .is("prize_id", null)
    .order("display_order")

  if (error || !data) return []

  return data.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    weight: Number(c.weight),
    minScore: Number(c.min_score ?? 1),
    maxScore: Number(c.max_score ?? 10),
    displayOrder: c.display_order,
  }))
}

export async function listPrizeCriteria(prizeId: string): Promise<CoreCriterion[]> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data, error } = await client
    .from("judging_criteria")
    .select("id, name, description, weight, min_score, max_score, display_order")
    .eq("prize_id", prizeId)
    .order("display_order")

  if (error || !data) return []

  return data.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    weight: Number(c.weight),
    minScore: Number(c.min_score ?? 1),
    maxScore: Number(c.max_score ?? 10),
    displayOrder: c.display_order,
  }))
}

export async function listPrizeCriteriaByPrizeIds(
  prizeIds: string[]
): Promise<Map<string, CoreCriterion[]>> {
  const map = new Map<string, CoreCriterion[]>()
  if (prizeIds.length === 0) return map

  const client = getSupabase() as unknown as SupabaseClient
  const { data, error } = await client
    .from("judging_criteria")
    .select("id, name, description, weight, min_score, max_score, display_order, prize_id")
    .in("prize_id", prizeIds)
    .order("display_order")

  if (error || !data) return map

  for (const c of data as Array<{
    id: string
    name: string
    description: string | null
    weight: number
    min_score?: number
    max_score?: number
    display_order: number
    prize_id: string | null
  }>) {
    if (!c.prize_id) continue
    const list = map.get(c.prize_id) ?? []
    list.push({
      id: c.id,
      name: c.name,
      description: c.description,
      weight: Number(c.weight),
      minScore: Number(c.min_score ?? 1),
      maxScore: Number(c.max_score ?? 10),
      displayOrder: c.display_order,
    })
    map.set(c.prize_id, list)
  }
  return map
}

export async function createCoreCriterion(
  hackathonId: string,
  input: CoreCriterionInput
): Promise<{ success: true; criterion: CoreCriterion } | { success: false; error: string; offendingPrizes?: { id: string; name: string; sum: number }[] }> {
  const client = getSupabase() as unknown as SupabaseClient

  const existing = await listCoreCriteria(hackathonId)
  const displayOrder = existing.length
  const minScore = input.minScore ?? 1
  const maxScore = input.maxScore ?? 10
  if (!(minScore < maxScore)) {
    return { success: false, error: "Minimum score must be less than maximum score" }
  }

  const { data, error } = await client
    .from("judging_criteria")
    .insert({
      hackathon_id: hackathonId,
      prize_id: null,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      min_score: minScore,
      max_score: maxScore,
      weight: input.weight,
      display_order: displayOrder,
    })
    .select("id, name, description, weight, min_score, max_score, display_order")
    .single()

  if (error || !data) {
    return { success: false, error: error?.message ?? "Failed to create criterion" }
  }

  return {
    success: true,
    criterion: {
      id: data.id,
      name: data.name,
      description: data.description,
      weight: Number(data.weight),
      minScore: Number(data.min_score ?? 1),
      maxScore: Number(data.max_score ?? 10),
      displayOrder: data.display_order,
    },
  }
}

export async function updateCoreCriterion(
  hackathonId: string,
  criterionId: string,
  input: Partial<CoreCriterionInput>
): Promise<{ success: true; criterion: CoreCriterion } | { success: false; error: string; offendingPrizes?: { id: string; name: string; sum: number }[] }> {
  const client = getSupabase() as unknown as SupabaseClient

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (input.name !== undefined) updates.name = input.name.trim()
  if (input.description !== undefined) updates.description = input.description?.trim() || null
  if (input.weight !== undefined) updates.weight = input.weight
  if (input.minScore !== undefined) updates.min_score = input.minScore
  if (input.maxScore !== undefined) updates.max_score = input.maxScore

  if (input.minScore !== undefined || input.maxScore !== undefined) {
    let nextMin = input.minScore
    let nextMax = input.maxScore
    if (nextMin === undefined || nextMax === undefined) {
      const { data: current } = await client
        .from("judging_criteria")
        .select("min_score, max_score")
        .eq("id", criterionId)
        .eq("hackathon_id", hackathonId)
        .is("prize_id", null)
        .single()
      if (!current) return { success: false, error: "Criterion not found" }
      if (nextMin === undefined) nextMin = Number(current.min_score)
      if (nextMax === undefined) nextMax = Number(current.max_score)
    }
    if (!(nextMin < nextMax)) {
      return { success: false, error: "Minimum score must be less than maximum score" }
    }
  }

  const { data, error } = await client
    .from("judging_criteria")
    .update(updates)
    .eq("id", criterionId)
    .eq("hackathon_id", hackathonId)
    .is("prize_id", null)
    .select("id, name, description, weight, min_score, max_score, display_order")
    .single()

  if (error || !data) {
    return { success: false, error: error?.message ?? "Failed to update criterion" }
  }

  return {
    success: true,
    criterion: {
      id: data.id,
      name: data.name,
      description: data.description,
      weight: Number(data.weight),
      minScore: Number(data.min_score ?? 1),
      maxScore: Number(data.max_score ?? 10),
      displayOrder: data.display_order,
    },
  }
}

export async function deleteCoreCriterion(
  hackathonId: string,
  criterionId: string
): Promise<{ success: true } | { success: false; error: string; offendingPrizes?: { id: string; name: string; sum: number }[] }> {
  const client = getSupabase() as unknown as SupabaseClient

  const { error } = await client
    .from("judging_criteria")
    .delete()
    .eq("id", criterionId)
    .eq("hackathon_id", hackathonId)
    .is("prize_id", null)

  if (error) return { success: false, error: error.message }
  return { success: true }
}

export const DEFAULT_CORE_CRITERIA: CoreCriterionInput[] = [
  { name: "Innovation", description: "How original and creative is the idea?", weight: 25, minScore: 0, maxScore: 10 },
  { name: "Technical execution", description: "How well is it built? Does it work?", weight: 25, minScore: 0, maxScore: 10 },
  { name: "Design and UX", description: "How easy and pleasant is it to use?", weight: 25, minScore: 0, maxScore: 10 },
  { name: "Impact", description: "How useful is this? Who benefits?", weight: 25, minScore: 0, maxScore: 10 },
]

export async function seedDefaultCoreCriteria(
  hackathonId: string
): Promise<{ success: true; criteria: CoreCriterion[] } | { success: false; error: string }> {
  const client = getSupabase() as unknown as SupabaseClient

  const existing = await listCoreCriteria(hackathonId)
  if (existing.length > 0) {
    return { success: false, error: "Core categories already exist" }
  }

  const rows = DEFAULT_CORE_CRITERIA.map((c, i) => ({
    hackathon_id: hackathonId,
    prize_id: null,
    name: c.name,
    description: c.description ?? null,
    min_score: c.minScore ?? 1,
    max_score: c.maxScore ?? 10,
    weight: c.weight,
    display_order: i,
  }))

  const { data, error } = await client
    .from("judging_criteria")
    .insert(rows)
    .select("id, name, description, weight, min_score, max_score, display_order")

  if (error || !data) {
    return { success: false, error: error?.message ?? "Failed to seed core criteria" }
  }

  return {
    success: true,
    criteria: data.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      weight: Number(c.weight),
      minScore: Number(c.min_score ?? 1),
      maxScore: Number(c.max_score ?? 10),
      displayOrder: c.display_order,
    })),
  }
}

type CriteriaMap = Map<string, { weight: number; minScore: number; maxScore: number }>

async function aggregateWeightedScores(
  client: SupabaseClient,
  hackathonId: string,
  criteriaMap: CriteriaMap,
  weightSum: number
): Promise<{ sid: string; avg: number; total: number; judgeCount: number }[]> {
  type ScoreRow = {
    criteria_id: string
    score: number
    judge_assignments: { submission_id: string; judge_participant_id: string } | null
  }

  const { data } = await client
    .from("scores")
    .select("criteria_id, score, judge_assignments!inner(submission_id, judge_participant_id, hackathon_id, assignment_kind, is_complete)")
    .eq("judge_assignments.hackathon_id", hackathonId)
    .eq("judge_assignments.assignment_kind", "unified_weighted_score")
    .eq("judge_assignments.is_complete", true)
    .in("criteria_id", Array.from(criteriaMap.keys()))

  const scores = (data ?? []) as unknown as ScoreRow[]
  const subScores: Record<string, { judgeIds: Set<string>; perJudge: Record<string, number> }> = {}

  for (const s of scores) {
    const ja = s.judge_assignments
    const c = criteriaMap.get(s.criteria_id)
    if (!ja || !c) continue
    const range = c.maxScore - c.minScore
    if (range <= 0) continue
    const normalized = (s.score - c.minScore) / range
    const sid = ja.submission_id
    const jid = ja.judge_participant_id
    if (!subScores[sid]) subScores[sid] = { judgeIds: new Set(), perJudge: {} }
    if (subScores[sid].perJudge[jid] === undefined) subScores[sid].perJudge[jid] = 0
    subScores[sid].perJudge[jid] += normalized * c.weight
    subScores[sid].judgeIds.add(jid)
  }

  return Object.entries(subScores)
    .map(([sid, info]) => {
      const judgeCount = info.judgeIds.size
      const avgWeightedSum = judgeCount > 0 ? Object.values(info.perJudge).reduce((a, b) => a + b, 0) / judgeCount : 0
      const avg = avgWeightedSum / weightSum
      return { sid, avg, total: avgWeightedSum, judgeCount }
    })
    .sort((a, b) => b.avg - a.avg)
}

export async function calculateWeightedScoreResults(
  hackathonId: string,
  prizeId: string
): Promise<{ success: boolean; count: number }> {
  const client = getSupabase() as unknown as SupabaseClient

  const { error: deleteError } = await client
    .from("hackathon_results")
    .delete()
    .eq("hackathon_id", hackathonId)
    .eq("prize_id", prizeId)
    .eq("result_kind", "prize")

  if (deleteError) {
    console.error("Failed to clear weighted results:", deleteError)
    return { success: false, count: 0 }
  }

  const [{ data: coreCriteria }, { data: prizeCriteria }] = await Promise.all([
    client
      .from("judging_criteria")
      .select("id, weight, min_score, max_score")
      .eq("hackathon_id", hackathonId)
      .is("prize_id", null),
    client
      .from("judging_criteria")
      .select("id, weight, min_score, max_score")
      .eq("prize_id", prizeId),
  ])

  const allCriteria = [...(coreCriteria ?? []), ...(prizeCriteria ?? [])]
  const criteriaMap = new Map(
    allCriteria.map((c) => [
      c.id,
      { weight: Number(c.weight), minScore: Number(c.min_score), maxScore: Number(c.max_score) },
    ])
  )
  if (allCriteria.length === 0) return { success: true, count: 0 }

  const totalWeightSum = Array.from(criteriaMap.values()).reduce((a, c) => a + c.weight, 0)
  if (totalWeightSum <= 0) return { success: true, count: 0 }

  const ranked = await aggregateWeightedScores(client, hackathonId, criteriaMap, totalWeightSum)
  return insertRankedResults(hackathonId, prizeId, ranked)
}

export async function calculateCoreOnlyResults(
  hackathonId: string
): Promise<{ success: boolean; count: number }> {
  const client = getSupabase() as unknown as SupabaseClient

  const { error: deleteError } = await client
    .from("hackathon_results")
    .delete()
    .eq("hackathon_id", hackathonId)
    .eq("result_kind", "core_only")

  if (deleteError) {
    console.error("Failed to clear core-only results:", deleteError)
    return { success: false, count: 0 }
  }

  const { data: coreCriteria } = await client
    .from("judging_criteria")
    .select("id, weight, min_score, max_score")
    .eq("hackathon_id", hackathonId)
    .is("prize_id", null)

  if (!coreCriteria || coreCriteria.length === 0) return { success: true, count: 0 }

  const criteriaMap = new Map(
    coreCriteria.map((c) => [
      c.id,
      { weight: Number(c.weight), minScore: Number(c.min_score), maxScore: Number(c.max_score) },
    ])
  )
  const coreWeightSum = Array.from(criteriaMap.values()).reduce((a, c) => a + c.weight, 0)
  if (coreWeightSum <= 0) return { success: true, count: 0 }

  const ranked = await aggregateWeightedScores(client, hackathonId, criteriaMap, coreWeightSum)
  if (ranked.length === 0) return { success: true, count: 0 }

  let currentRank = 1
  const inserts = ranked.map((r, i) => {
    if (i > 0 && r.avg < ranked[i - 1].avg) currentRank = i + 1
    return {
      hackathon_id: hackathonId,
      submission_id: r.sid,
      rank: currentRank,
      total_score: r.total,
      weighted_score: r.avg,
      judge_count: r.judgeCount,
      prize_id: null,
      result_kind: "core_only" as const,
    }
  })

  const { error } = await client.from("hackathon_results").insert(inserts)
  if (error) {
    console.error("Failed to insert core-only results:", error)
    return { success: false, count: 0 }
  }

  return { success: true, count: inserts.length }
}

export async function assignWeightedScoreJudge(
  hackathonId: string,
  judgeParticipantId: string,
  options?: { roomId?: string | null }
): Promise<{ success: boolean; assignedCount: number; error?: string }> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: judge } = await client
    .from("hackathon_participants")
    .select("id, team_id")
    .eq("id", judgeParticipantId)
    .eq("hackathon_id", hackathonId)
    .single()

  if (!judge) return { success: false, assignedCount: 0, error: "Judge not found" }

  const roomTeamIds = options?.roomId
    ? await getTeamIdsInRoom(client, options.roomId)
    : null

  if (roomTeamIds && roomTeamIds.length === 0) {
    return { success: true, assignedCount: 0 }
  }

  // Two-step (not getActiveRoundFinalistIds) because we need activeRoundId for the insert.
  const activeRoundId = await getActiveRoundId(hackathonId)
  const finalistIds = activeRoundId ? await getRoundSubmissions(activeRoundId) : []
  const scopeToFinalists = activeRoundId !== null && finalistIds.length > 0

  let submissionsQuery = client
    .from("submissions")
    .select("id, team_id")
    .eq("hackathon_id", hackathonId)
    .eq("status", "submitted")

  if (roomTeamIds) {
    submissionsQuery = submissionsQuery.in("team_id", roomTeamIds)
  }

  if (scopeToFinalists) {
    submissionsQuery = submissionsQuery.in("id", finalistIds)
  }

  const { data: submissions } = await submissionsQuery

  const { data: existing } = await client
    .from("judge_assignments")
    .select("submission_id")
    .eq("hackathon_id", hackathonId)
    .eq("judge_participant_id", judgeParticipantId)
    .eq("assignment_kind", "unified_weighted_score")

  const existingSet = new Set((existing ?? []).map((e) => e.submission_id))

  const newAssignments = (submissions ?? [])
    .filter((s) => !existingSet.has(s.id))
    .filter((s) => !((judge as { team_id: string | null }).team_id && s.team_id && (judge as { team_id: string | null }).team_id === s.team_id))
    .map((s) => ({
      hackathon_id: hackathonId,
      judge_participant_id: judgeParticipantId,
      submission_id: s.id,
      prize_id: null,
      round_id: scopeToFinalists ? activeRoundId : null,
      assignment_kind: "unified_weighted_score",
    }))

  if (newAssignments.length === 0) return { success: true, assignedCount: 0 }

  const { error } = await client.from("judge_assignments").insert(newAssignments)
  if (error) {
    console.error("Failed to create unified assignments:", error)
    return { success: false, assignedCount: 0, error: error.message }
  }

  return { success: true, assignedCount: newAssignments.length }
}

export async function getWeightedScoreAssignmentCounts(
  hackathonId: string
): Promise<Record<string, number>> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data } = await client
    .from("judge_assignments")
    .select("judge_participant_id")
    .eq("hackathon_id", hackathonId)
    .eq("assignment_kind", "unified_weighted_score")

  const counts: Record<string, number> = {}
  for (const row of data ?? []) {
    const id = (row as { judge_participant_id: string }).judge_participant_id
    counts[id] = (counts[id] ?? 0) + 1
  }
  return counts
}

export type WeightedScoreRoomSummary = {
  totalSubmissionCount: number
  rooms: { id: string; name: string; submissionCount: number }[]
  countsByJudge: Record<string, { all: number; byRoom: Record<string, number> }>
}

export async function getWeightedScoreAssignmentSummary(
  hackathonId: string
): Promise<WeightedScoreRoomSummary> {
  const client = getSupabase() as unknown as SupabaseClient

  const [submissionsResult, roomsResult, roomTeamsResult, assignmentsResult, finalistIds] =
    await Promise.all([
      client.from("submissions").select("id, team_id").eq("hackathon_id", hackathonId),
      client.from("rooms").select("id, name, display_order").eq("hackathon_id", hackathonId).order("display_order"),
      client
        .from("room_teams")
        .select("room_id, team_id, rooms!inner(hackathon_id)")
        .eq("rooms.hackathon_id", hackathonId),
      client
        .from("judge_assignments")
        .select("judge_participant_id, submission_id")
        .eq("hackathon_id", hackathonId)
        .eq("assignment_kind", "unified_weighted_score"),
      getActiveRoundFinalistIds(hackathonId),
    ])

  const allSubmissions = (submissionsResult.data ?? []) as { id: string; team_id: string | null }[]
  const submissions = finalistIds
    ? allSubmissions.filter((s) => finalistIds.includes(s.id))
    : allSubmissions
  const rooms = (roomsResult.data ?? []) as { id: string; name: string; display_order: number }[]
  const allRoomTeams = (roomTeamsResult.data ?? []) as { room_id: string; team_id: string }[]
  const finalistSet = finalistIds ? new Set(finalistIds) : null
  const assignments = ((assignmentsResult.data ?? []) as {
    judge_participant_id: string
    submission_id: string
  }[]).filter((a) => !finalistSet || finalistSet.has(a.submission_id))

  const roomIdSet = new Set(rooms.map((r) => r.id))
  const teamIdToRoomId: Record<string, string> = {}
  for (const rt of allRoomTeams) {
    if (roomIdSet.has(rt.room_id)) teamIdToRoomId[rt.team_id] = rt.room_id
  }

  const submissionToRoomId: Record<string, string> = {}
  const submissionsPerRoom: Record<string, number> = {}
  for (const s of submissions) {
    if (!s.team_id) continue
    const roomId = teamIdToRoomId[s.team_id]
    if (!roomId) continue
    submissionToRoomId[s.id] = roomId
    submissionsPerRoom[roomId] = (submissionsPerRoom[roomId] ?? 0) + 1
  }

  const countsByJudge: Record<string, { all: number; byRoom: Record<string, number> }> = {}
  for (const a of assignments) {
    const entry = (countsByJudge[a.judge_participant_id] ??= { all: 0, byRoom: {} })
    entry.all += 1
    const roomId = submissionToRoomId[a.submission_id]
    if (roomId) entry.byRoom[roomId] = (entry.byRoom[roomId] ?? 0) + 1
  }

  return {
    totalSubmissionCount: submissions.length,
    rooms: rooms.map((r) => ({
      id: r.id,
      name: r.name,
      submissionCount: submissionsPerRoom[r.id] ?? 0,
    })),
    countsByJudge,
  }
}

export type JudgeSubmissionAssignmentRow = {
  submissionId: string
  projectTitle: string
  teamId: string | null
  teamName: string | null
  isAssigned: boolean
  isOwnTeam: boolean
}

type JudgeSubmissionAssignmentDbRow = {
  id: string
  title: string | null
  team_id: string | null
  teams: { name: string | null } | { name: string | null }[] | null
}

export async function listJudgeSubmissionAssignments(
  hackathonId: string,
  judgeParticipantId: string
): Promise<JudgeSubmissionAssignmentRow[]> {
  const client = getSupabase() as unknown as SupabaseClient

  const [judgeResult, finalistIds] = await Promise.all([
    client
      .from("hackathon_participants")
      .select("id, team_id")
      .eq("id", judgeParticipantId)
      .eq("hackathon_id", hackathonId)
      .eq("role", "judge")
      .maybeSingle(),
    getActiveRoundFinalistIds(hackathonId),
  ])

  if (judgeResult.error) {
    console.error("Failed to list judge submission assignments:", judgeResult.error)
    throw new Error(`Failed to list judge submission assignments: ${judgeResult.error.message}`)
  }

  if (!judgeResult.data) return []

  const submissionsQuery = client
    .from("submissions")
    .select("id, title, team_id, teams(name)")
    .eq("hackathon_id", hackathonId)
    .eq("status", "submitted")

  const submissionsResult = await (finalistIds
    ? submissionsQuery.in("id", finalistIds)
    : submissionsQuery)

  if (submissionsResult.error) {
    console.error("Failed to list judge submission assignments:", submissionsResult.error)
    throw new Error(`Failed to list judge submission assignments: ${submissionsResult.error.message}`)
  }

  const judgeTeamId = (judgeResult.data as { team_id: string | null }).team_id
  const submissions = (submissionsResult.data as JudgeSubmissionAssignmentDbRow[]) ?? []
  const submissionIds = submissions.map((s) => s.id)

  const assigned = new Set<string>()
  if (submissionIds.length > 0) {
    const assignmentsResult = await client
      .from("judge_assignments")
      .select("submission_id")
      .eq("hackathon_id", hackathonId)
      .eq("judge_participant_id", judgeParticipantId)
      .eq("assignment_kind", "unified_weighted_score")
      .in("submission_id", submissionIds)

    if (assignmentsResult.error) {
      console.error("Failed to list judge submission assignments:", assignmentsResult.error)
      throw new Error(`Failed to list judge submission assignments: ${assignmentsResult.error.message}`)
    }

    for (const row of assignmentsResult.data ?? []) {
      assigned.add((row as { submission_id: string }).submission_id)
    }
  }

  return submissions
    .map((s) => {
      const team = Array.isArray(s.teams) ? s.teams[0] : s.teams
      return {
        submissionId: s.id,
        projectTitle: s.title ?? "Untitled project",
        teamId: s.team_id,
        teamName: team?.name ?? null,
        isAssigned: assigned.has(s.id),
        isOwnTeam: !!(judgeTeamId && s.team_id && judgeTeamId === s.team_id),
      }
    })
    .sort((a, b) => a.projectTitle.localeCompare(b.projectTitle))
}

export async function assignJudgeToSubmission(
  hackathonId: string,
  judgeParticipantId: string,
  submissionId: string
): Promise<{ success: true; alreadyAssigned: boolean } | { success: false; error: string }> {
  const client = getSupabase() as unknown as SupabaseClient

  const [judgeResult, submissionResult] = await Promise.all([
    client
      .from("hackathon_participants")
      .select("id, team_id")
      .eq("id", judgeParticipantId)
      .eq("hackathon_id", hackathonId)
      .maybeSingle(),
    client
      .from("submissions")
      .select("id, team_id")
      .eq("id", submissionId)
      .eq("hackathon_id", hackathonId)
      .maybeSingle(),
  ])

  const lookupError = judgeResult.error ?? submissionResult.error
  if (lookupError) {
    console.error("Failed to look up judge/submission for assignment:", lookupError)
    return { success: false, error: lookupError.message }
  }

  if (!judgeResult.data) return { success: false, error: "Judge not found" }
  if (!submissionResult.data) return { success: false, error: "Project not found" }

  const judgeTeamId = (judgeResult.data as { team_id: string | null }).team_id
  const submissionTeamId = (submissionResult.data as { team_id: string | null }).team_id
  if (judgeTeamId && submissionTeamId && judgeTeamId === submissionTeamId) {
    return { success: false, error: "Judges can't score their own team's project" }
  }

  const activeRoundId = await getActiveRoundId(hackathonId)
  const finalistIds = activeRoundId ? await getRoundSubmissions(activeRoundId) : []
  const roundId =
    activeRoundId && finalistIds.includes(submissionId) ? activeRoundId : null

  const { error } = await client.from("judge_assignments").insert({
    hackathon_id: hackathonId,
    judge_participant_id: judgeParticipantId,
    submission_id: submissionId,
    prize_id: null,
    round_id: roundId,
    assignment_kind: "unified_weighted_score",
  })

  if (error) {
    if ((error as { code?: string }).code === "23505") {
      return { success: true, alreadyAssigned: true }
    }
    console.error("Failed to assign judge to submission:", error)
    return { success: false, error: error.message }
  }

  return { success: true, alreadyAssigned: false }
}

export async function unassignJudgeFromSubmission(
  hackathonId: string,
  judgeParticipantId: string,
  submissionId: string
): Promise<{ success: true; removed: boolean } | { success: false; error: string }> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: rows, error } = await client
    .from("judge_assignments")
    .delete()
    .eq("hackathon_id", hackathonId)
    .eq("judge_participant_id", judgeParticipantId)
    .eq("submission_id", submissionId)
    .eq("assignment_kind", "unified_weighted_score")
    .select("id")

  if (error) {
    console.error("Failed to unassign judge from submission:", error)
    return { success: false, error: error.message }
  }

  return { success: true, removed: (rows ?? []).length > 0 }
}

export type JudgeSummaryEntry = {
  submissionId: string
  title: string
  teamName: string | null
  score: number
}

export type JudgeSummary =
  | { unlocked: false; total: number; completed: number }
  | {
      unlocked: true
      total: number
      completed: number
      prizeRankings: { prizeId: string; prizeName: string; top: JudgeSummaryEntry[] }[]
      coreRanking: { top: JudgeSummaryEntry[] }
    }

export async function getJudgeSummary(
  hackathonId: string,
  judgeParticipantId: string,
  options: { anonymousJudging?: boolean } = {},
): Promise<JudgeSummary> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: assignments } = await client
    .from("judge_assignments")
    .select("id, submission_id, is_complete")
    .eq("hackathon_id", hackathonId)
    .eq("judge_participant_id", judgeParticipantId)
    .eq("assignment_kind", "unified_weighted_score")

  const total = assignments?.length ?? 0
  const completed = assignments?.filter((a) => a.is_complete).length ?? 0

  if (total === 0 || completed < total) {
    return { unlocked: false, total, completed }
  }

  const assignmentIds = (assignments ?? []).map((a) => a.id)
  const submissionIds = Array.from(new Set((assignments ?? []).map((a) => a.submission_id)))

  const [{ data: subs }, { data: weightedPrizes }, { data: coreCriteria }, { data: scores }] = await Promise.all([
    client
      .from("submissions")
      .select("id, title, team_id")
      .in("id", submissionIds.length > 0 ? submissionIds : ["00000000-0000-0000-0000-000000000000"]),
    client
      .from("prizes")
      .select("id, name")
      .eq("hackathon_id", hackathonId)
      .eq("judging_style", "weighted_score")
      .order("display_order"),
    client
      .from("judging_criteria")
      .select("id, weight, min_score, max_score")
      .eq("hackathon_id", hackathonId)
      .is("prize_id", null),
    client
      .from("scores")
      .select("judge_assignment_id, criteria_id, score")
      .in("judge_assignment_id", assignmentIds.length > 0 ? assignmentIds : ["00000000-0000-0000-0000-000000000000"]),
  ])

  const teamIds = options.anonymousJudging
    ? []
    : (subs ?? []).map((s) => s.team_id).filter((id): id is string => Boolean(id))
  const teamMap: Record<string, string> = {}
  if (teamIds.length > 0) {
    const { data: teams } = await client.from("teams").select("id, name").in("id", teamIds)
    for (const t of teams ?? []) teamMap[t.id] = t.name
  }

  const subInfoMap = new Map(
    (subs ?? []).map((s) => [
      s.id,
      {
        title: s.title as string,
        teamName:
          options.anonymousJudging || !s.team_id
            ? null
            : teamMap[s.team_id] ?? null,
      },
    ])
  )

  const assignmentSubMap = new Map((assignments ?? []).map((a) => [a.id, a.submission_id]))

  type CriterionMeta = { weight: number; minScore: number; maxScore: number }
  const toMeta = (c: { weight: number; min_score: number; max_score: number }): CriterionMeta => ({
    weight: Number(c.weight),
    minScore: Number(c.min_score),
    maxScore: Number(c.max_score),
  })

  const coreCriteriaMap = new Map<string, CriterionMeta>(
    (coreCriteria ?? []).map((c) => [c.id, toMeta(c)])
  )
  const coreWeightSum = Array.from(coreCriteriaMap.values()).reduce((a, c) => a + c.weight, 0)

  const prizeCriteriaMaps = new Map<string, Map<string, CriterionMeta>>()
  const prizeIds = (weightedPrizes ?? []).map((p) => p.id)
  if (prizeIds.length > 0) {
    const { data: prizeCriteriaRows } = await client
      .from("judging_criteria")
      .select("id, weight, min_score, max_score, prize_id")
      .in("prize_id", prizeIds)
    for (const pid of prizeIds) prizeCriteriaMaps.set(pid, new Map())
    for (const row of prizeCriteriaRows ?? []) {
      const pid = (row as { prize_id: string }).prize_id
      const map = prizeCriteriaMaps.get(pid)
      if (map) map.set(row.id, toMeta(row))
    }
  }

  const buildRanking = (criteriaMap: Map<string, CriterionMeta>, denom: number): JudgeSummaryEntry[] => {
    if (denom <= 0) return []
    const subTotals: Record<string, number> = {}
    for (const s of scores ?? []) {
      const sid = assignmentSubMap.get(s.judge_assignment_id)
      const c = criteriaMap.get(s.criteria_id)
      if (!sid || !c) continue
      const range = c.maxScore - c.minScore
      if (range <= 0) continue
      const normalized = (s.score - c.minScore) / range
      if (!subTotals[sid]) subTotals[sid] = 0
      subTotals[sid] += normalized * c.weight
    }
    return Object.entries(subTotals)
      .map(([sid, total]) => {
        const info = subInfoMap.get(sid)
        return {
          submissionId: sid,
          title: info?.title ?? "Unknown",
          teamName: info?.teamName ?? null,
          score: total / denom,
        }
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
  }

  const prizeRankings = (weightedPrizes ?? []).map((p) => {
    const prizeMap = prizeCriteriaMaps.get(p.id) ?? new Map<string, CriterionMeta>()
    const combined = new Map<string, CriterionMeta>([...coreCriteriaMap, ...prizeMap])
    const denom = Array.from(combined.values()).reduce((a, c) => a + c.weight, 0)
    return { prizeId: p.id, prizeName: p.name, top: buildRanking(combined, denom) }
  })

  const coreRanking = { top: buildRanking(coreCriteriaMap, coreWeightSum) }

  return { unlocked: true, total, completed, prizeRankings, coreRanking }
}
