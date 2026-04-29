import { supabase as getSupabase } from "@/lib/db/client"
import type { SupabaseClient } from "@supabase/supabase-js"

export type ChallengeResource = {
  label: string
  url: string
}

export type Challenge = {
  id: string
  hackathonId: string
  title: string
  description: string | null
  resources: ChallengeResource[]
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export type ChallengeInput = {
  title: string
  description?: string | null
  resources?: ChallengeResource[]
}

type ChallengeRow = {
  id: string
  hackathon_id: string
  title: string
  description: string | null
  resources: unknown
  sort_order: number
  created_at: string
  updated_at: string
}

function normalizeResources(raw: unknown): ChallengeResource[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null)
    .map((r) => ({
      label: typeof r.label === "string" ? r.label : "",
      url: typeof r.url === "string" ? r.url : "",
    }))
    .filter((r) => r.url.length > 0)
}

function toChallenge(row: ChallengeRow): Challenge {
  return {
    id: row.id,
    hackathonId: row.hackathon_id,
    title: row.title,
    description: row.description,
    resources: normalizeResources(row.resources),
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listChallenges(hackathonId: string): Promise<Challenge[]> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data, error } = await client
    .from("challenges")
    .select("*")
    .eq("hackathon_id", hackathonId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })

  if (error) {
    console.error("Failed to list challenges:", error)
    return []
  }

  return (data ?? []).map(toChallenge)
}

export async function getChallengeById(challengeId: string): Promise<Challenge | null> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data, error } = await client
    .from("challenges")
    .select("*")
    .eq("id", challengeId)
    .single()

  if (error || !data) return null
  return toChallenge(data)
}

async function assertChallengeOwnership(
  client: SupabaseClient,
  challengeId: string,
  tenantId: string,
): Promise<string | null> {
  const { data, error } = await client
    .from("challenges")
    .select("hackathon_id, hackathons!inner(tenant_id)")
    .eq("id", challengeId)
    .single()

  if (error || !data) return null
  const row = data as unknown as { hackathon_id: string; hackathons: { tenant_id: string } | { tenant_id: string }[] }
  const hackathon = Array.isArray(row.hackathons) ? row.hackathons[0] : row.hackathons
  if (!hackathon || hackathon.tenant_id !== tenantId) return null
  return row.hackathon_id
}

async function assertHackathonOwnership(
  client: SupabaseClient,
  hackathonId: string,
  tenantId: string,
): Promise<boolean> {
  const { data, error } = await client
    .from("hackathons")
    .select("id")
    .eq("id", hackathonId)
    .eq("tenant_id", tenantId)
    .single()

  return !error && !!data
}

export async function createChallenge(
  hackathonId: string,
  tenantId: string,
  input: ChallengeInput,
): Promise<Challenge | null> {
  const client = getSupabase() as unknown as SupabaseClient

  const owns = await assertHackathonOwnership(client, hackathonId, tenantId)
  if (!owns) return null

  const { data: maxRow } = await client
    .from("challenges")
    .select("sort_order")
    .eq("hackathon_id", hackathonId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextOrder = (maxRow?.sort_order ?? -1) + 1

  const { data, error } = await client
    .from("challenges")
    .insert({
      hackathon_id: hackathonId,
      title: input.title,
      description: input.description ?? null,
      resources: input.resources ?? [],
      sort_order: nextOrder,
    })
    .select("*")
    .single()

  if (error || !data) {
    console.error("Failed to create challenge:", error)
    return null
  }

  return toChallenge(data)
}

export async function updateChallenge(
  challengeId: string,
  tenantId: string,
  patch: Partial<ChallengeInput>,
): Promise<Challenge | null> {
  const client = getSupabase() as unknown as SupabaseClient

  const hackathonId = await assertChallengeOwnership(client, challengeId, tenantId)
  if (!hackathonId) return null

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  if (patch.title !== undefined) update.title = patch.title
  if (patch.description !== undefined) update.description = patch.description
  if (patch.resources !== undefined) update.resources = patch.resources

  const { data, error } = await client
    .from("challenges")
    .update(update)
    .eq("id", challengeId)
    .select("*")
    .single()

  if (error || !data) {
    console.error("Failed to update challenge:", error)
    return null
  }

  return toChallenge(data)
}

export async function deleteChallenge(
  challengeId: string,
  tenantId: string,
): Promise<boolean> {
  const client = getSupabase() as unknown as SupabaseClient

  const hackathonId = await assertChallengeOwnership(client, challengeId, tenantId)
  if (!hackathonId) return false

  const { error } = await client.from("challenges").delete().eq("id", challengeId)

  if (error) {
    console.error("Failed to delete challenge:", error)
    return false
  }

  return true
}

export async function reorderChallenges(
  hackathonId: string,
  tenantId: string,
  orderedIds: string[],
): Promise<boolean> {
  const client = getSupabase() as unknown as SupabaseClient

  const owns = await assertHackathonOwnership(client, hackathonId, tenantId)
  if (!owns) return false

  const { data: existing, error: listErr } = await client
    .from("challenges")
    .select("id")
    .eq("hackathon_id", hackathonId)

  if (listErr || !existing) return false

  const existingIds = new Set(existing.map((r) => r.id))
  if (orderedIds.length !== existingIds.size) return false
  if (new Set(orderedIds).size !== orderedIds.length) return false
  if (orderedIds.some((id) => !existingIds.has(id))) return false

  const updates = orderedIds.map((id, idx) =>
    client
      .from("challenges")
      .update({ sort_order: idx, updated_at: new Date().toISOString() })
      .eq("id", id),
  )

  const results = await Promise.all(updates)
  for (const { error } of results) {
    if (error) {
      console.error("Failed to reorder challenges:", error)
      return false
    }
  }

  return true
}

async function releaseChallengesIfAny(
  client: SupabaseClient,
  hackathonId: string,
  tenantId: string,
): Promise<boolean> {
  const { count, error: countErr } = await client
    .from("challenges")
    .select("id", { count: "exact", head: true })
    .eq("hackathon_id", hackathonId)

  if (countErr) {
    console.error("Failed to count challenges:", countErr)
    return false
  }
  if (!count || count === 0) return false

  const { error } = await client
    .from("hackathons")
    .update({
      challenge_released_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", hackathonId)
    .eq("tenant_id", tenantId)

  if (error) {
    console.error("Failed to release challenges:", error)
    return false
  }

  return true
}

export async function releaseChallenges(
  hackathonId: string,
  tenantId: string,
): Promise<boolean> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: hackathon, error: fetchErr } = await client
    .from("hackathons")
    .select("challenge_released_at")
    .eq("id", hackathonId)
    .eq("tenant_id", tenantId)
    .single()

  if (fetchErr || !hackathon) {
    console.error("Failed to fetch hackathon for challenge release:", fetchErr)
    return false
  }

  if (hackathon.challenge_released_at) return true

  return releaseChallengesIfAny(client, hackathonId, tenantId)
}

export async function maybeReleaseChallengesForPublishLink(
  hackathonId: string,
  tenantId: string,
): Promise<boolean> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: row, error: fetchErr } = await client
    .from("hackathon_schedule_items")
    .select("linked_to, hackathons!inner(tenant_id, status, challenge_released_at)")
    .eq("hackathon_id", hackathonId)
    .eq("trigger_type", "challenge_release")
    .eq("hackathons.tenant_id", tenantId)
    .maybeSingle()

  if (fetchErr) {
    console.error("Failed to fetch trigger item for publish-link release:", fetchErr)
    return false
  }
  if (!row || row.linked_to !== "event_publish") return false

  // Supabase types the `hackathons!inner(...)` relation as an array even though PostgREST returns a single object for many-to-one.
  const hackathon = row.hackathons as unknown as { status: string; challenge_released_at: string | null }
  if (hackathon.challenge_released_at) return true
  if (hackathon.status !== "published") return false

  return releaseChallengesIfAny(client, hackathonId, tenantId)
}

export type ScheduledChallengeReleaseResult = {
  processed: number
  releases: Array<{ hackathonId: string }>
  errors: string[]
}

export async function processScheduledChallengeReleases(): Promise<ScheduledChallengeReleaseResult> {
  const client = getSupabase() as unknown as SupabaseClient

  const result: ScheduledChallengeReleaseResult = {
    processed: 0,
    releases: [],
    errors: [],
  }

  const { data: hackathons, error: hackErr } = await client
    .from("hackathons")
    .select("id, tenant_id")
    .eq("status", "active")
    .is("challenge_released_at", null)

  if (hackErr) {
    result.errors.push(`Failed to fetch active hackathons: ${hackErr.message}`)
    return result
  }
  if (!hackathons || hackathons.length === 0) return result

  const hackathonIds = hackathons.map((h) => h.id as string)
  const tenantById = new Map<string, string>(
    hackathons.map((h) => [h.id as string, h.tenant_id as string]),
  )

  const { data: items, error: itemsErr } = await client
    .from("hackathon_schedule_items")
    .select("hackathon_id, starts_at, linked_to")
    .in("hackathon_id", hackathonIds)
    .eq("trigger_type", "challenge_release")

  if (itemsErr) {
    result.errors.push(`Failed to fetch challenge_release items: ${itemsErr.message}`)
    return result
  }
  if (!items || items.length === 0) return result

  const nowIso = new Date().toISOString()
  for (const item of items) {
    if (item.linked_to !== null) continue
    if (typeof item.starts_at !== "string" || item.starts_at > nowIso) continue

    const hackathonId = item.hackathon_id as string
    const tenantId = tenantById.get(hackathonId)
    if (!tenantId) continue

    try {
      const released = await releaseChallenges(hackathonId, tenantId)
      if (released) {
        result.processed++
        result.releases.push({ hackathonId })
      }
    } catch (err) {
      result.errors.push(
        `Failed to release challenges for ${hackathonId}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  return result
}

export async function getSubmissionChallengeIds(submissionId: string): Promise<string[]> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data, error } = await client
    .from("submission_challenges")
    .select("challenge_id")
    .eq("submission_id", submissionId)

  if (error || !data) return []
  return data.map((r) => r.challenge_id)
}

export async function tagSubmissionChallenges(
  submissionId: string,
  challengeIds: string[],
): Promise<boolean> {
  const client = getSupabase() as unknown as SupabaseClient

  if (challengeIds.length > 0) {
    const { data: submission, error: subErr } = await client
      .from("submissions")
      .select("hackathon_id")
      .eq("id", submissionId)
      .single()

    if (subErr || !submission) {
      console.error("Failed to look up submission for tagging:", subErr)
      return false
    }

    const { data: validChallenges, error: valErr } = await client
      .from("challenges")
      .select("id")
      .eq("hackathon_id", submission.hackathon_id)
      .in("id", challengeIds)

    if (valErr) {
      console.error("Failed to validate challenge ownership:", valErr)
      return false
    }

    const validIds = new Set((validChallenges ?? []).map((r) => r.id))
    if (validIds.size !== challengeIds.length) {
      console.error("One or more challenge IDs do not belong to submission's hackathon")
      return false
    }
  }

  const { error: delErr } = await client
    .from("submission_challenges")
    .delete()
    .eq("submission_id", submissionId)

  if (delErr) {
    console.error("Failed to clear submission challenges:", delErr)
    return false
  }

  if (challengeIds.length === 0) return true

  const rows = challengeIds.map((challengeId) => ({
    submission_id: submissionId,
    challenge_id: challengeId,
  }))

  const { error: insErr } = await client.from("submission_challenges").insert(rows)

  if (insErr) {
    console.error("Failed to tag submission challenges:", insErr)
    return false
  }

  return true
}

export async function listChallengeIdsForSubmissions(
  submissionIds: string[],
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>()
  if (submissionIds.length === 0) return result

  const client = getSupabase() as unknown as SupabaseClient

  const { data, error } = await client
    .from("submission_challenges")
    .select("submission_id, challenge_id")
    .in("submission_id", submissionIds)

  if (error || !data) return result

  for (const row of data) {
    const existing = result.get(row.submission_id) ?? []
    existing.push(row.challenge_id)
    result.set(row.submission_id, existing)
  }

  return result
}
