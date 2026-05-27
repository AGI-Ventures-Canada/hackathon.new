import { supabase as getSupabase } from "@/lib/db/client"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Tables } from "@/lib/db/types"
import type { SubmissionStatus } from "@/lib/db/hackathon-types"

export type SubmissionExport = Tables<"submission_exports">

export type ExportFilters = {
  winnersOnly: boolean
  includeDrafts: boolean
  includeJudgeNotes: boolean
}

export const DEFAULT_EXPORT_FILTERS: ExportFilters = {
  winnersOnly: false,
  includeDrafts: false,
  includeJudgeNotes: true,
}

export function mergeExportFilters(
  raw: Partial<ExportFilters> | null | undefined
): ExportFilters {
  const r = raw ?? {}
  return {
    winnersOnly: r.winnersOnly ?? DEFAULT_EXPORT_FILTERS.winnersOnly,
    includeDrafts: r.includeDrafts ?? DEFAULT_EXPORT_FILTERS.includeDrafts,
    includeJudgeNotes:
      r.includeJudgeNotes ?? DEFAULT_EXPORT_FILTERS.includeJudgeNotes,
  }
}

export type CreateExportResult =
  | { success: true; exportId: string }
  | { success: false; code: "active_export_exists" | "insert_failed"; error: string }

export type ExportSubmissionRow = {
  id: string
  title: string
  description: string | null
  status: SubmissionStatus
  githubUrl: string | null
  liveAppUrl: string | null
  demoVideoUrl: string | null
  screenshotUrl: string | null
  createdAt: string
  team: {
    id: string
    name: string
    members: { clerkUserId: string; role: string }[]
  } | null
  result: {
    rank: number
    totalScore: number | null
    weightedScore: number | null
    judgeCount: number | null
  } | null
  prizes: { id: string; name: string; value: string | null }[]
  scores: { judgeClerkUserId: string | null; criteriaName: string; score: number }[]
  judgeNotes: { judgeClerkUserId: string | null; notes: string }[]
  socialSubmissions: {
    url: string
    platform: string | null
    ogTitle: string | null
    ogDescription: string | null
    ogImageUrl: string | null
  }[]
}

export type ExportPayload = {
  hackathon: {
    id: string
    name: string
    slug: string
    startsAt: string | null
    endsAt: string | null
  }
  filters: ExportFilters
  generatedAt: string
  submissions: ExportSubmissionRow[]
}

export type ExportUserDirectory = Record<
  string,
  { name: string | null; email: string | null }
>

export type EnrichedExportPayload = ExportPayload & {
  users: ExportUserDirectory
}

export function collectExportUserIds(payload: ExportPayload): string[] {
  const ids = new Set<string>()
  for (const sub of payload.submissions) {
    for (const member of sub.team?.members ?? []) ids.add(member.clerkUserId)
    for (const score of sub.scores) {
      if (score.judgeClerkUserId) ids.add(score.judgeClerkUserId)
    }
    for (const note of sub.judgeNotes) {
      if (note.judgeClerkUserId) ids.add(note.judgeClerkUserId)
    }
  }
  return Array.from(ids)
}

export function collectTeamMemberUserIds(payload: ExportPayload): Set<string> {
  const ids = new Set<string>()
  for (const sub of payload.submissions) {
    for (const member of sub.team?.members ?? []) ids.add(member.clerkUserId)
  }
  return ids
}

export function buildJsonExportPayload(
  payload: EnrichedExportPayload
): EnrichedExportPayload {
  if (payload.filters.includeJudgeNotes) return payload
  const teamMemberIds = collectTeamMemberUserIds(payload)
  const trimmedUsers: ExportUserDirectory = {}
  for (const [id, user] of Object.entries(payload.users)) {
    trimmedUsers[id] = teamMemberIds.has(id)
      ? user
      : { name: user.name, email: null }
  }
  return { ...payload, users: trimmedUsers }
}

export async function createSubmissionExport(
  hackathonId: string,
  requestedByUserId: string,
  filters: ExportFilters
): Promise<CreateExportResult> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data, error } = await client
    .from("submission_exports")
    .insert({
      hackathon_id: hackathonId,
      requested_by_user_id: requestedByUserId,
      filters: filters as unknown as Record<string, unknown>,
      status: "pending",
    })
    .select("id")
    .single()

  if (error) {
    if (error.code === "23505") {
      return {
        success: false,
        code: "active_export_exists",
        error: "An export is already being prepared for this hackathon. Please wait for it to finish.",
      }
    }
    console.error("Failed to create submission export:", error)
    return { success: false, code: "insert_failed", error: "Failed to create export" }
  }

  return { success: true, exportId: data.id }
}

export async function getExportById(
  exportId: string
): Promise<SubmissionExport | null> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data, error } = await client
    .from("submission_exports")
    .select("*")
    .eq("id", exportId)
    .maybeSingle()

  if (error) {
    console.error("Failed to get export:", error)
    return null
  }
  return (data as unknown as SubmissionExport) ?? null
}

export async function listExportsForHackathon(
  hackathonId: string,
  limit: number = 10
): Promise<SubmissionExport[]> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data, error } = await client
    .from("submission_exports")
    .select("*")
    .eq("hackathon_id", hackathonId)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) {
    console.error("Failed to list exports:", error)
    return []
  }
  return (data ?? []) as unknown as SubmissionExport[]
}

export type PurgeExpiredExportsResult = {
  scanned: number
  storageDeleted: number
  rowsUpdated: number
  errors: string[]
}

export async function purgeExpiredExports(): Promise<PurgeExpiredExportsResult> {
  const client = getSupabase() as unknown as SupabaseClient
  const result: PurgeExpiredExportsResult = {
    scanned: 0,
    storageDeleted: 0,
    rowsUpdated: 0,
    errors: [],
  }

  const { data: rows, error } = await client
    .from("submission_exports")
    .select("id, storage_path")
    .eq("status", "ready")
    .not("storage_path", "is", null)
    .not("expires_at", "is", null)
    .lt("expires_at", new Date().toISOString())
    .limit(500)

  if (error) {
    result.errors.push(`select_failed: ${error.message}`)
    return result
  }

  const expired = (rows ?? []) as { id: string; storage_path: string }[]
  result.scanned = expired.length
  if (expired.length === 0) return result

  const storagePaths = expired.map((r) => r.storage_path)
  const { data: removed, error: removeError } = await client.storage
    .from("exports")
    .remove(storagePaths)
  if (removeError) {
    result.errors.push(`storage_remove_failed: ${removeError.message}`)
    return result
  }

  const removedPaths = new Set(
    ((removed ?? []) as { name: string }[]).map((r) => r.name)
  )
  const idsToExpire = expired
    .filter((r) => removedPaths.has(r.storage_path))
    .map((r) => r.id)
  result.storageDeleted = idsToExpire.length

  if (idsToExpire.length === 0) return result

  const { error: updateError } = await client
    .from("submission_exports")
    .update({ status: "expired", storage_path: null })
    .in("id", idsToExpire)
  if (updateError) {
    result.errors.push(`update_failed: ${updateError.message}`)
  } else {
    result.rowsUpdated = idsToExpire.length
  }

  return result
}

export async function markExportProcessing(exportId: string): Promise<void> {
  const client = getSupabase() as unknown as SupabaseClient
  const { error } = await client
    .from("submission_exports")
    .update({ status: "processing" })
    .eq("id", exportId)
  if (error) console.error("Failed to mark export processing:", error)
}

export async function markExportReady(
  exportId: string,
  args: {
    storagePath: string
    fileSizeBytes: number
    submissionCount: number
    expiresAt: string
  }
): Promise<void> {
  const client = getSupabase() as unknown as SupabaseClient
  const { error } = await client
    .from("submission_exports")
    .update({
      status: "ready",
      storage_path: args.storagePath,
      file_size_bytes: args.fileSizeBytes,
      submission_count: args.submissionCount,
      ready_at: new Date().toISOString(),
      expires_at: args.expiresAt,
    })
    .eq("id", exportId)
  if (error) console.error("Failed to mark export ready:", error)
}

export async function markExportFailed(
  exportId: string,
  errorMessage: string
): Promise<void> {
  const client = getSupabase() as unknown as SupabaseClient
  const { error } = await client
    .from("submission_exports")
    .update({ status: "failed", error_message: errorMessage })
    .eq("id", exportId)
  if (error) console.error("Failed to mark export failed:", error)
}

export async function loadExportPayload(
  exportId: string
): Promise<ExportPayload | null> {
  const client = getSupabase() as unknown as SupabaseClient

  const exportRow = await getExportById(exportId)
  if (!exportRow) return null

  const filters = mergeExportFilters(exportRow.filters as Partial<ExportFilters>)

  const { data: hackathon, error: hackathonError } = await client
    .from("hackathons")
    .select("id, name, slug, starts_at, ends_at")
    .eq("id", exportRow.hackathon_id)
    .single()

  if (hackathonError || !hackathon) {
    console.error("Failed to load hackathon for export:", hackathonError)
    return null
  }

  let submissionQuery = client
    .from("submissions")
    .select(`
      id, title, description, status, github_url, live_app_url,
      demo_video_url, screenshot_url, created_at, team_id, participant_id
    `)
    .eq("hackathon_id", exportRow.hackathon_id)
    .order("created_at", { ascending: true })

  if (!filters.includeDrafts) {
    submissionQuery = submissionQuery.neq("status", "draft")
  }

  const { data: submissions, error: submissionsError } = await submissionQuery
  if (submissionsError || !submissions) {
    console.error("Failed to load submissions for export:", submissionsError)
    return null
  }

  const submissionIds = submissions.map((s) => s.id)

  const [
    teamsData,
    resultsData,
    prizeAssignmentsData,
    judgeAssignmentsData,
    socialData,
  ] = await Promise.all([
    loadTeams(client, submissions),
    loadResults(client, exportRow.hackathon_id, submissionIds),
    loadPrizeAssignments(client, submissionIds),
    loadJudgeData(client, submissionIds),
    loadSocialSubmissions(
      client,
      submissions.map((s) => ({
        id: s.id,
        team_id: s.team_id,
        participant_id: s.participant_id,
      }))
    ),
  ])

  let filteredSubmissions = submissions
  if (filters.winnersOnly) {
    const winnerIds = new Set(
      Object.keys(prizeAssignmentsData).filter(
        (id) => prizeAssignmentsData[id].length > 0
      )
    )
    filteredSubmissions = submissions.filter((s) => winnerIds.has(s.id))
  }

  const rows: ExportSubmissionRow[] = filteredSubmissions.map((s) => ({
    id: s.id,
    title: s.title,
    description: s.description,
    status: s.status as SubmissionStatus,
    githubUrl: s.github_url,
    liveAppUrl: s.live_app_url,
    demoVideoUrl: s.demo_video_url,
    screenshotUrl: s.screenshot_url,
    createdAt: s.created_at,
    team: s.team_id ? teamsData[s.team_id] ?? null : null,
    result: resultsData[s.id] ?? null,
    prizes: prizeAssignmentsData[s.id] ?? [],
    scores: judgeAssignmentsData.scores[s.id] ?? [],
    judgeNotes: filters.includeJudgeNotes
      ? judgeAssignmentsData.notes[s.id] ?? []
      : [],
    socialSubmissions: socialData[s.id] ?? [],
  }))

  return {
    hackathon: {
      id: hackathon.id,
      name: hackathon.name,
      slug: hackathon.slug,
      startsAt: hackathon.starts_at,
      endsAt: hackathon.ends_at,
    },
    filters,
    generatedAt: new Date().toISOString(),
    submissions: rows,
  }
}

async function loadTeams(
  client: SupabaseClient,
  submissions: { team_id: string | null }[]
): Promise<Record<string, NonNullable<ExportSubmissionRow["team"]>>> {
  const teamIds = Array.from(
    new Set(
      submissions
        .map((s) => s.team_id)
        .filter((id): id is string => id !== null)
    )
  )
  if (teamIds.length === 0) return {}

  const { data: teams } = await client
    .from("teams")
    .select("id, name")
    .in("id", teamIds)

  const { data: members } = await client
    .from("hackathon_participants")
    .select("team_id, role, clerk_user_id")
    .in("team_id", teamIds)

  const result: Record<string, NonNullable<ExportSubmissionRow["team"]>> = {}
  for (const team of teams ?? []) {
    result[team.id] = { id: team.id, name: team.name, members: [] }
  }
  for (const member of members ?? []) {
    if (!member.team_id || !result[member.team_id]) continue
    if (!member.clerk_user_id) continue
    result[member.team_id].members.push({
      clerkUserId: member.clerk_user_id,
      role: member.role,
    })
  }
  return result
}

async function loadResults(
  client: SupabaseClient,
  hackathonId: string,
  submissionIds: string[]
): Promise<Record<string, NonNullable<ExportSubmissionRow["result"]>>> {
  if (submissionIds.length === 0) return {}

  const { data: results } = await client
    .from("hackathon_results")
    .select("submission_id, rank, total_score, weighted_score, judge_count")
    .eq("hackathon_id", hackathonId)
    .in("submission_id", submissionIds)

  const out: Record<string, NonNullable<ExportSubmissionRow["result"]>> = {}
  for (const r of results ?? []) {
    out[r.submission_id] = {
      rank: r.rank,
      totalScore: r.total_score,
      weightedScore: r.weighted_score,
      judgeCount: r.judge_count,
    }
  }
  return out
}

async function loadPrizeAssignments(
  client: SupabaseClient,
  submissionIds: string[]
): Promise<Record<string, ExportSubmissionRow["prizes"]>> {
  if (submissionIds.length === 0) return {}

  const { data } = await client
    .from("prize_assignments")
    .select("submission_id, prize:prizes!prize_id(id, name, value)")
    .in("submission_id", submissionIds)

  const out: Record<string, ExportSubmissionRow["prizes"]> = {}
  for (const row of data ?? []) {
    const prize = (row as Record<string, unknown>).prize as
      | { id: string; name: string; value: string | null }
      | null
    if (!prize) continue
    const sid = (row as { submission_id: string }).submission_id
    if (!out[sid]) out[sid] = []
    out[sid].push(prize)
  }
  return out
}

async function loadJudgeData(
  client: SupabaseClient,
  submissionIds: string[]
): Promise<{
  scores: Record<string, ExportSubmissionRow["scores"]>
  notes: Record<string, ExportSubmissionRow["judgeNotes"]>
}> {
  if (submissionIds.length === 0) return { scores: {}, notes: {} }

  const { data: assignments } = await client
    .from("judge_assignments")
    .select("id, submission_id, notes, judge_participant_id")
    .in("submission_id", submissionIds)

  const assignmentList = assignments ?? []
  const assignmentIds = assignmentList.map((a) => a.id)
  const judgeParticipantIds = Array.from(
    new Set(assignmentList.map((a) => a.judge_participant_id))
  )

  const [scoresRes, judgesRes, criteriaRes] = await Promise.all([
    assignmentIds.length
      ? client
          .from("scores")
          .select("judge_assignment_id, criteria_id, score")
          .in("judge_assignment_id", assignmentIds)
      : Promise.resolve({ data: [] }),
    judgeParticipantIds.length
      ? client
          .from("hackathon_participants")
          .select("id, clerk_user_id")
          .in("id", judgeParticipantIds)
      : Promise.resolve({ data: [] }),
    client.from("judging_criteria").select("id, name"),
  ])

  const judgeClerkByParticipantId = new Map(
    (judgesRes.data ?? []).map((p) => [p.id, p.clerk_user_id])
  )
  const criteriaNameById = new Map(
    (criteriaRes.data ?? []).map((c) => [c.id, c.name])
  )
  const assignmentById = new Map(assignmentList.map((a) => [a.id, a]))

  const scores: Record<string, ExportSubmissionRow["scores"]> = {}
  const notes: Record<string, ExportSubmissionRow["judgeNotes"]> = {}

  for (const score of scoresRes.data ?? []) {
    const assignment = assignmentById.get(score.judge_assignment_id)
    if (!assignment) continue
    const judgeClerkUserId =
      judgeClerkByParticipantId.get(assignment.judge_participant_id) ?? null
    const criteriaName =
      criteriaNameById.get(score.criteria_id) ?? "Unknown criterion"
    if (!scores[assignment.submission_id]) scores[assignment.submission_id] = []
    scores[assignment.submission_id].push({
      judgeClerkUserId,
      criteriaName,
      score: score.score,
    })
  }

  for (const assignment of assignmentList) {
    if (!assignment.notes || assignment.notes.trim().length === 0) continue
    const judgeClerkUserId =
      judgeClerkByParticipantId.get(assignment.judge_participant_id) ?? null
    if (!notes[assignment.submission_id]) notes[assignment.submission_id] = []
    notes[assignment.submission_id].push({
      judgeClerkUserId,
      notes: assignment.notes,
    })
  }

  return { scores, notes }
}

async function loadSocialSubmissions(
  client: SupabaseClient,
  projectSubmissions: { id: string; team_id: string | null; participant_id: string | null }[]
): Promise<Record<string, ExportSubmissionRow["socialSubmissions"]>> {
  if (projectSubmissions.length === 0) return {}

  const teamIds = Array.from(
    new Set(
      projectSubmissions
        .map((s) => s.team_id)
        .filter((id): id is string => !!id)
    )
  )
  const participantIds = Array.from(
    new Set(
      projectSubmissions
        .map((s) => s.participant_id)
        .filter((id): id is string => !!id)
    )
  )

  if (teamIds.length === 0 && participantIds.length === 0) return {}

  const socialSelect =
    "team_id, participant_id, url, platform, og_title, og_description, og_image_url"

  const [teamSocialRes, participantSocialRes] = await Promise.all([
    teamIds.length
      ? client
          .from("social_media_submissions")
          .select(socialSelect)
          .eq("status", "approved")
          .in("team_id", teamIds)
      : Promise.resolve({ data: [] }),
    participantIds.length
      ? client
          .from("social_media_submissions")
          .select(socialSelect)
          .eq("status", "approved")
          .is("team_id", null)
          .in("participant_id", participantIds)
      : Promise.resolve({ data: [] }),
  ])

  const data = [...(teamSocialRes.data ?? []), ...(participantSocialRes.data ?? [])]

  const out: Record<string, ExportSubmissionRow["socialSubmissions"]> = {}
  for (const social of data) {
    const matching = projectSubmissions.filter((s) => {
      if (social.team_id && s.team_id === social.team_id) return true
      if (
        !social.team_id &&
        social.participant_id &&
        s.participant_id === social.participant_id
      )
        return true
      return false
    })
    for (const sub of matching) {
      if (!out[sub.id]) out[sub.id] = []
      out[sub.id].push({
        url: social.url,
        platform: social.platform,
        ogTitle: social.og_title,
        ogDescription: social.og_description,
        ogImageUrl: social.og_image_url,
      })
    }
  }
  return out
}
