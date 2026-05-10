import { supabase as getSupabase } from "@/lib/db/client"
import type { SupabaseClient } from "@supabase/supabase-js"
import { isValidUuid as isUuid } from "@/lib/utils/uuid"

export type PresenterViewKind = "round_finalists" | "manual"

export type PresenterViewConfig =
  | { kind: "round_finalists"; roundId: string }
  | { kind: "manual"; submissionIds: string[] }

export type PresenterView = {
  id: string
  hackathon_id: string
  name: string
  config: PresenterViewConfig
  created_by_clerk_user_id: string
  created_at: string
  updated_at: string
}

export type CreatePresenterViewInput = {
  hackathonId: string
  name: string
  config: PresenterViewConfig
  createdByClerkUserId: string
}

export type UpdatePresenterViewInput = {
  name?: string
  config?: PresenterViewConfig
}

export type ResolvedPresenterSubmission = {
  id: string
  title: string
  description: string | null
  github_url: string | null
  live_app_url: string | null
  demo_video_url: string | null
  screenshot_url: string | null
  submitter_name: string
}

const MAX_NAME_LENGTH = 80
const MAX_MANUAL_SUBMISSIONS = 200

function isValidUuid(value: unknown): value is string {
  return typeof value === "string" && isUuid(value)
}

export function validatePresenterViewConfig(value: unknown): PresenterViewConfig | null {
  if (!value || typeof value !== "object") return null
  const config = value as Record<string, unknown>
  if (config.kind === "round_finalists") {
    if (!isValidUuid(config.roundId)) return null
    return { kind: "round_finalists", roundId: config.roundId }
  }
  if (config.kind === "manual") {
    const ids = Array.isArray(config.submissionIds) ? config.submissionIds : []
    const cleaned: string[] = []
    const seen = new Set<string>()
    for (const id of ids) {
      if (!isValidUuid(id)) continue
      if (seen.has(id)) continue
      seen.add(id)
      cleaned.push(id)
      if (cleaned.length >= MAX_MANUAL_SUBMISSIONS) break
    }
    if (cleaned.length === 0) return null
    return { kind: "manual", submissionIds: cleaned }
  }
  return null
}

export function validatePresenterViewName(name: string): string | null {
  const trimmed = name.trim()
  if (!trimmed) return null
  return trimmed.slice(0, MAX_NAME_LENGTH)
}

function rowToView(row: Record<string, unknown>): PresenterView | null {
  if (
    typeof row.id !== "string" ||
    typeof row.hackathon_id !== "string" ||
    typeof row.name !== "string" ||
    typeof row.created_by_clerk_user_id !== "string" ||
    typeof row.created_at !== "string" ||
    typeof row.updated_at !== "string"
  ) {
    return null
  }
  const config = validatePresenterViewConfig(row.config)
  if (!config) return null
  return {
    id: row.id,
    hackathon_id: row.hackathon_id,
    name: row.name,
    config,
    created_by_clerk_user_id: row.created_by_clerk_user_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export async function listPresenterViews(hackathonId: string): Promise<PresenterView[]> {
  if (!isValidUuid(hackathonId)) return []
  const client = getSupabase() as unknown as SupabaseClient
  const { data, error } = await client
    .from("organizer_presenter_views")
    .select("*")
    .eq("hackathon_id", hackathonId)
    .order("updated_at", { ascending: false })

  if (error) {
    console.error("Failed to list presenter views:", error)
    return []
  }

  return (data ?? [])
    .map((row) => rowToView(row as Record<string, unknown>))
    .filter((v): v is PresenterView => v !== null)
}

export async function getPresenterView(viewId: string): Promise<PresenterView | null> {
  if (!isValidUuid(viewId)) return null
  const client = getSupabase() as unknown as SupabaseClient
  const { data, error } = await client
    .from("organizer_presenter_views")
    .select("*")
    .eq("id", viewId)
    .maybeSingle()

  if (error || !data) {
    if (error) console.error("Failed to get presenter view:", error)
    return null
  }

  return rowToView(data as Record<string, unknown>)
}

async function isRoundInHackathon(
  client: SupabaseClient,
  roundId: string,
  hackathonId: string
): Promise<boolean> {
  const { data } = await client
    .from("judging_rounds")
    .select("id")
    .eq("id", roundId)
    .eq("hackathon_id", hackathonId)
    .maybeSingle()
  return Boolean(data)
}

async function allSubmissionsInHackathon(
  client: SupabaseClient,
  submissionIds: string[],
  hackathonId: string
): Promise<boolean> {
  if (submissionIds.length === 0) return false
  const { data } = await client
    .from("submissions")
    .select("id")
    .eq("hackathon_id", hackathonId)
    .in("id", submissionIds)
  return (data?.length ?? 0) === submissionIds.length
}

export async function createPresenterView(
  input: CreatePresenterViewInput
): Promise<PresenterView | null> {
  if (!isValidUuid(input.hackathonId)) return null
  const name = validatePresenterViewName(input.name)
  if (!name) return null
  const config = validatePresenterViewConfig(input.config)
  if (!config) return null

  const client = getSupabase() as unknown as SupabaseClient

  if (config.kind === "round_finalists") {
    const ok = await isRoundInHackathon(client, config.roundId, input.hackathonId)
    if (!ok) return null
  } else {
    const ok = await allSubmissionsInHackathon(client, config.submissionIds, input.hackathonId)
    if (!ok) return null
  }

  const { data, error } = await client
    .from("organizer_presenter_views")
    .insert({
      hackathon_id: input.hackathonId,
      name,
      config,
      created_by_clerk_user_id: input.createdByClerkUserId,
    })
    .select()
    .single()

  if (error || !data) {
    if (error) console.error("Failed to create presenter view:", error)
    return null
  }
  return rowToView(data as Record<string, unknown>)
}

export async function updatePresenterView(
  viewId: string,
  input: UpdatePresenterViewInput
): Promise<PresenterView | null> {
  if (!isValidUuid(viewId)) return null

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  let nextConfig: PresenterViewConfig | null = null
  if (input.name !== undefined) {
    const name = validatePresenterViewName(input.name)
    if (!name) return null
    updates.name = name
  }
  if (input.config !== undefined) {
    const config = validatePresenterViewConfig(input.config)
    if (!config) return null
    updates.config = config
    nextConfig = config
  }

  const client = getSupabase() as unknown as SupabaseClient

  let viewHackathonId: string | null = null
  if (nextConfig) {
    const { data: view } = await client
      .from("organizer_presenter_views")
      .select("hackathon_id")
      .eq("id", viewId)
      .maybeSingle()
    if (!view) return null
    viewHackathonId = view.hackathon_id as string

    if (nextConfig.kind === "round_finalists") {
      const ok = await isRoundInHackathon(client, nextConfig.roundId, viewHackathonId)
      if (!ok) return null
    } else {
      const ok = await allSubmissionsInHackathon(
        client,
        nextConfig.submissionIds,
        viewHackathonId
      )
      if (!ok) return null
    }
  }

  let query = client
    .from("organizer_presenter_views")
    .update(updates)
    .eq("id", viewId)
  if (viewHackathonId) {
    query = query.eq("hackathon_id", viewHackathonId)
  }
  const { data, error } = await query.select().maybeSingle()

  if (error || !data) {
    if (error) console.error("Failed to update presenter view:", error)
    return null
  }
  return rowToView(data as Record<string, unknown>)
}

export async function deletePresenterView(viewId: string): Promise<boolean> {
  if (!isValidUuid(viewId)) return false
  const client = getSupabase() as unknown as SupabaseClient
  const { error } = await client
    .from("organizer_presenter_views")
    .delete()
    .eq("id", viewId)
  if (error) {
    console.error("Failed to delete presenter view:", error)
    return false
  }
  return true
}

export async function resolvePresenterSubmissions(
  view: PresenterView
): Promise<ResolvedPresenterSubmission[]> {
  const ids = await resolveSubmissionIds(view)
  if (ids.length === 0) return []

  const client = getSupabase() as unknown as SupabaseClient
  const { data: submissions, error } = await client
    .from("submissions")
    .select(
      "id, title, description, github_url, live_app_url, demo_video_url, screenshot_url, team_id, participant_id"
    )
    .eq("hackathon_id", view.hackathon_id)
    .in("id", ids)

  if (error) {
    console.error("Failed to resolve presenter submissions:", error)
    return []
  }

  const rows = submissions ?? []
  const teamIds = rows
    .map((s) => s.team_id as string | null)
    .filter((id): id is string => Boolean(id))
  const participantIds = rows
    .map((s) => s.participant_id as string | null)
    .filter((id): id is string => Boolean(id))

  const [teamsResult, participantsResult] = await Promise.all([
    teamIds.length > 0
      ? client.from("teams").select("id, name").in("id", teamIds)
      : Promise.resolve({ data: null as { id: string; name: string }[] | null }),
    participantIds.length > 0
      ? client
          .from("hackathon_participants")
          .select("id, display_name")
          .in("id", participantIds)
      : Promise.resolve({
          data: null as { id: string; display_name: string | null }[] | null,
        }),
  ])

  const teamsMap = new Map<string, string>(
    (teamsResult.data ?? []).map((t) => [t.id, t.name])
  )
  const participantsMap = new Map<string, string>(
    (participantsResult.data ?? []).map((p) => [p.id, p.display_name || "Anonymous"])
  )

  const ordered = ids
    .map((id) => rows.find((r) => r.id === id))
    .filter((r): r is NonNullable<typeof r> => r !== undefined)

  return ordered.map((s) => ({
    id: s.id as string,
    title: s.title as string,
    description: (s.description as string | null) ?? null,
    github_url: (s.github_url as string | null) ?? null,
    live_app_url: (s.live_app_url as string | null) ?? null,
    demo_video_url: (s.demo_video_url as string | null) ?? null,
    screenshot_url: (s.screenshot_url as string | null) ?? null,
    submitter_name:
      (s.team_id && teamsMap.get(s.team_id as string)) ||
      (s.participant_id && participantsMap.get(s.participant_id as string)) ||
      "Anonymous",
  }))
}

async function resolveSubmissionIds(view: PresenterView): Promise<string[]> {
  if (view.config.kind === "manual") {
    return view.config.submissionIds
  }
  const client = getSupabase() as unknown as SupabaseClient
  const { data, error } = await client
    .from("round_submissions")
    .select("submission_id")
    .eq("round_id", view.config.roundId)
  if (error) {
    console.error("Failed to load round submissions:", error)
    return []
  }
  return (data ?? []).map((r) => r.submission_id as string)
}
