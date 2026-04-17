import { supabase as getSupabase } from "@/lib/db/client"
import type { SupabaseClient } from "@supabase/supabase-js"
import type {
  Prize,
  BucketDefinition,
  BinaryResponse,
  PrizeJudgingStyle,
  PrizeAssignmentMode,
} from "@/lib/db/hackathon-types"
import { checkRoleConflict } from "@/lib/services/role-conflict"

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
  criteria?: { name: string; description?: string | null }[]
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
}

export async function listPrizes(hackathonId: string): Promise<PrizeWithProgress[]> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: prizes, error } = await client
    .from("prizes")
    .select("*")
    .eq("hackathon_id", hackathonId)
    .not("judging_style", "is", null)
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

  return (prizes as unknown as Prize[]).map((p) => ({
    ...p,
    judgeCount: prizeStats[p.id]?.judges.size ?? 0,
    totalAssignments: prizeStats[p.id]?.total ?? 0,
    completedAssignments: prizeStats[p.id]?.completed ?? 0,
    buckets: bucketMap[p.id],
    criteria: criteriaMap[p.id],
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
    input.judgingStyle === "gate_check"
      ? (input.criteria ?? []).filter((c) => c.name.trim().length > 0)
      : []

  if (input.judgingStyle === "gate_check" && cleanCriteria.length === 0) {
    return {
      success: false,
      error: "At least one criterion is required for pass-or-fail prizes",
      code: "validation",
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
      await client.from("prizes").delete().eq("id", prize.id)
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
}

export async function replacePrizeCriteria(
  hackathonId: string,
  prizeId: string,
  criteria: ReplacePrizeCriteriaInput[]
): Promise<PrizeCriterion[] | null> {
  const client = getSupabase() as unknown as SupabaseClient
  const cleaned = criteria.filter((c) => c.name.trim().length > 0)

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
    max_score: 1,
    weight: 1,
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
  const roleCheck = await checkRoleConflict(hackathonId, clerkUserId, "judge")
  if (roleCheck.conflict) {
    return { success: false, error: roleCheck.error, code: roleCheck.code }
  }

  const client = getSupabase() as unknown as SupabaseClient

  const { data: existing } = await client
    .from("hackathon_participants")
    .select("id, role")
    .eq("hackathon_id", hackathonId)
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle()

  if (existing) {
    if (existing.role === "judge") {
      return { success: false, error: "Already registered as a judge", code: "already_judge" }
    }

    const { data: updated, error: updateError } = await client
      .from("hackathon_participants")
      .update({ role: "judge" })
      .eq("id", existing.id)
      .select()
      .single()

    if (updateError) {
      console.error("Failed to update participant role:", updateError)
      return { success: false, error: "Failed to update role", code: "update_failed" }
    }

    return { success: true, participant: { id: updated.id, clerkUserId } }
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
    .select("id, round_id")
    .eq("id", prizeId)
    .eq("hackathon_id", hackathonId)
    .single()

  if (!prize) return { success: false, assignedCount: 0, error: "Prize not found" }

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
}

export async function verifyAssignmentOwnership(
  assignmentId: string,
  clerkUserId: string
): Promise<AssignmentOwnership | false> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data } = await client
    .from("judge_assignments")
    .select("judge_participant_id, hackathon_id, prize_id, is_complete, submission_id, notes, hackathon_participants!inner(clerk_user_id)")
    .eq("id", assignmentId)
    .single()

  if (!data) return false
  const participant = data.hackathon_participants as unknown as { clerk_user_id: string }
  if (participant.clerk_user_id !== clerkUserId) return false
  return {
    hackathonId: data.hackathon_id,
    prizeId: data.prize_id ?? null,
    isComplete: data.is_complete === true,
    submissionId: data.submission_id,
    notes: data.notes ?? "",
  }
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
  submissionsPerJudge: number
): Promise<{ assignedCount: number }> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: prize } = await client
    .from("prizes")
    .select("id, round_id, allowed_team_modes")
    .eq("id", prizeId)
    .eq("hackathon_id", hackathonId)
    .single()

  if (!prize) return { assignedCount: 0 }

  const { data: judges } = await client
    .from("hackathon_participants")
    .select("id, team_id")
    .eq("hackathon_id", hackathonId)
    .eq("role", "judge")

  if (!judges || judges.length === 0) return { assignedCount: 0 }

  const pool = await getRoundPool(hackathonId, prize.round_id)
  if (pool.length === 0) return { assignedCount: 0 }

  const { data: submissionsRaw } = await client
    .from("submissions")
    .select("id, team_id, teams:teams!submissions_team_id_fkey(id, mode)")
    .in("id", pool)

  if (!submissionsRaw || submissionsRaw.length === 0) return { assignedCount: 0 }

  const allowedModes = (prize as { allowed_team_modes: ("in_person" | "virtual")[] | null }).allowed_team_modes
  const submissions = (submissionsRaw as unknown as { id: string; team_id: string; teams: { id: string; mode: "in_person" | "virtual" | null } | null }[])
    .filter((s) => {
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

  const { error: deleteError } = await client
    .from("judge_picks")
    .delete()
    .eq("hackathon_id", hackathonId)
    .eq("judge_participant_id", judgeParticipantId)
    .eq("prize_id", prizeId)

  if (deleteError) {
    return { success: false, error: "Failed to clear existing picks", code: "delete_failed" }
  }

  if (rankedSubmissionIds.length > 0) {
    const inserts = rankedSubmissionIds.map((sid, i) => ({
      hackathon_id: hackathonId,
      judge_participant_id: judgeParticipantId,
      prize_id: prizeId,
      submission_id: sid,
      rank: i + 1,
    }))

    const { error } = await client.from("judge_picks").insert(inserts)
    if (error) {
      return { success: false, error: "Failed to submit picks", code: "insert_failed" }
    }
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
    .sort((a, b) => b.avg - a.avg)

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
    if (i > 0 && r.avg < ranked[i - 1].avg) currentRank = i + 1
    return {
      hackathon_id: hackathonId,
      submission_id: r.sid,
      rank: currentRank,
      total_score: r.total,
      weighted_score: r.avg,
      judge_count: r.judgeCount,
      prize_id: prizeId,
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
  const { data } = await client
    .from("judge_assignments")
    .select("hackathon_id, prize_id")
    .eq("id", assignmentId)
    .single()

  if (data?.hackathon_id && data?.prize_id) {
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
}

export async function getJudgeAssignments(
  hackathonId: string,
  clerkUserId: string
): Promise<JudgeAssignmentForJudge[]> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: participant } = await client
    .from("hackathon_participants")
    .select("id")
    .eq("hackathon_id", hackathonId)
    .eq("clerk_user_id", clerkUserId)
    .eq("role", "judge")
    .maybeSingle()

  if (!participant) return []

  const { data: assignments, error } = await client
    .from("judge_assignments")
    .select(`
      id, submission_id, is_complete, notes, viewed_at, prize_id,
      submission:submissions!submission_id(title, description, github_url, live_app_url, screenshot_url, team_id)
    `)
    .eq("hackathon_id", hackathonId)
    .eq("judge_participant_id", participant.id)
    .order("assigned_at")

  if (error || !assignments) return []

  const prizeIds = [...new Set(assignments.map((a: Record<string, unknown>) => a.prize_id).filter(Boolean))] as string[]
  const prizeMap: Record<string, { name: string; judging_style: string | null }> = {}
  if (prizeIds.length > 0) {
    const { data: prizes } = await client
      .from("prizes")
      .select("id, name, judging_style")
      .in("id", prizeIds)
    for (const p of prizes ?? []) {
      prizeMap[p.id] = { name: p.name, judging_style: p.judging_style }
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
      screenshot_url: string | null
      team_id: string | null
    }
    const pid = a.prize_id as string | null
    return {
      id: a.id as string,
      submissionId: a.submission_id as string,
      submissionTitle: sub.title,
      submissionDescription: sub.description,
      submissionGithubUrl: sub.github_url,
      submissionLiveAppUrl: sub.live_app_url,
      submissionScreenshotUrl: sub.screenshot_url,
      teamName: sub.team_id ? teamsMap[sub.team_id] ?? null : null,
      teamMode: sub.team_id ? teamModeMap[sub.team_id] ?? null : null,
      teamMemberCount: sub.team_id ? memberCountMap[sub.team_id] ?? null : null,
      isComplete: a.is_complete as boolean,
      notes: a.notes as string,
      viewedAt: (a.viewed_at as string | null) ?? null,
      prizeId: pid,
      prizeName: pid ? prizeMap[pid]?.name ?? null : null,
      judgingStyle: pid ? (prizeMap[pid]?.judging_style as PrizeJudgingStyle | null) : null,
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
  max_score: number
  weight: number
  category: string | null
  currentScore: number | null
  rubricLevels: { id: string; level_number: number; label: string; description: string | null }[]
}

export type AssignmentDetail = {
  id: string
  submissionId: string
  submissionTitle: string
  submissionDescription: string | null
  submissionGithubUrl: string | null
  submissionLiveAppUrl: string | null
  submissionScreenshotUrl: string | null
  teamName: string | null
  isComplete: boolean
  notes: string
  criteria: AssignmentDetailCriterion[]
}

export async function getAssignmentDetail(
  assignmentId: string,
  ownership: AssignmentOwnership
): Promise<AssignmentDetail | null> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: sub, error: subError } = await client
    .from("submissions")
    .select("title, description, github_url, live_app_url, screenshot_url, team_id")
    .eq("id", ownership.submissionId)
    .single()

  if (subError || !sub) return null

  type CriteriaRow = {
    id: string
    name: string
    description: string | null
    max_score: number
    weight: number
    category: string | null
  }

  const teamNamePromise = sub.team_id
    ? client.from("teams").select("name").eq("id", sub.team_id).single().then(({ data }) => data?.name ?? null)
    : Promise.resolve(null)

  const fetchCriteria = async (): Promise<CriteriaRow[]> => {
    if (ownership.prizeId) {
      const { data } = await client
        .from("judging_criteria")
        .select("id, name, description, max_score, weight, category")
        .eq("prize_id", ownership.prizeId)
        .order("display_order")
      if (data && data.length > 0) return data as CriteriaRow[]
    }
    const { data } = await client
      .from("judging_criteria")
      .select("id, name, description, max_score, weight, category")
      .eq("hackathon_id", ownership.hackathonId)
      .is("prize_id", null)
      .order("display_order")
    return (data ?? []) as CriteriaRow[]
  }

  const [teamName, criteria] = await Promise.all([teamNamePromise, fetchCriteria()])

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
    submissionScreenshotUrl: sub.screenshot_url,
    teamName,
    isComplete: ownership.isComplete,
    notes: ownership.notes,
    criteria: criteria.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      max_score: c.max_score,
      weight: Number(c.weight), // Supabase returns Postgres numeric columns as strings
      category: c.category ?? null,
      currentScore: scoreMap[c.id] ?? null,
      rubricLevels: rubricMap[c.id] ?? [],
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
  if (ownership.isComplete) {
    return { success: false, error: "Assignment is already complete", code: "already_complete" }
  }

  const client = getSupabase() as unknown as SupabaseClient

  let criteriaQuery = client
    .from("judging_criteria")
    .select("id, max_score")

  if (ownership.prizeId) {
    criteriaQuery = criteriaQuery.eq("prize_id", ownership.prizeId)
  } else {
    criteriaQuery = criteriaQuery
      .eq("hackathon_id", ownership.hackathonId)
      .is("prize_id", null)
  }

  const { data: criteria } = await criteriaQuery

  if (scores.length === 0 && (criteria ?? []).length > 0) {
    return { success: false, error: "Scores are required for all criteria", code: "empty_scores" }
  }

  if (scores.length > 0) {
    const validCriteriaIds = new Set((criteria ?? []).map((c) => c.id))
    const maxScoreMap = new Map((criteria ?? []).map((c) => [c.id, c.max_score]))

    for (const s of scores) {
      if (!validCriteriaIds.has(s.criteriaId)) {
        return { success: false, error: "One or more criteria IDs are invalid", code: "invalid_criteria" }
      }
      if (s.score < 0) {
        return { success: false, error: "Scores cannot be negative", code: "invalid_score" }
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
