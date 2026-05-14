import { supabase as getSupabase } from "@/lib/db/client"
import type { SupabaseClient } from "@supabase/supabase-js"

export type ChallengeResource = {
  label: string
  url: string
}

export type ReleaseLinkedTo = "event_start" | "event_publish"

export type Challenge = {
  id: string
  hackathonId: string
  title: string
  description: string | null
  resources: ChallengeResource[]
  sortOrder: number
  createdAt: string
  updatedAt: string
  releasedAt: string | null
  scheduledReleaseAt: string | null
  releaseLinkedTo: ReleaseLinkedTo | null
}

export type ChallengeInput = {
  title: string
  description?: string | null
  resources?: ChallengeResource[]
  scheduledReleaseAt?: string | null
  releaseLinkedTo?: ReleaseLinkedTo | null
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
  released_at: string | null
  scheduled_release_at: string | null
  release_linked_to: string | null
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

function normalizeLinkedTo(raw: string | null): ReleaseLinkedTo | null {
  if (raw === "event_start" || raw === "event_publish") return raw
  return null
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
    releasedAt: row.released_at,
    scheduledReleaseAt: row.scheduled_release_at,
    releaseLinkedTo: normalizeLinkedTo(row.release_linked_to),
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

async function resolveScheduledReleaseFields(
  client: SupabaseClient,
  hackathonId: string,
  scheduledReleaseAt: string | null | undefined,
  releaseLinkedTo: ReleaseLinkedTo | null | undefined,
): Promise<{ scheduled_release_at: string | null; release_linked_to: ReleaseLinkedTo | null }> {
  if (releaseLinkedTo === "event_publish") {
    return { scheduled_release_at: null, release_linked_to: "event_publish" }
  }
  if (releaseLinkedTo === "event_start") {
    const { data } = await client
      .from("hackathons")
      .select("starts_at")
      .eq("id", hackathonId)
      .single()
    return {
      scheduled_release_at: (data?.starts_at as string | null) ?? null,
      release_linked_to: "event_start",
    }
  }
  if (typeof scheduledReleaseAt === "string" && scheduledReleaseAt.length > 0) {
    return { scheduled_release_at: scheduledReleaseAt, release_linked_to: null }
  }
  return { scheduled_release_at: null, release_linked_to: null }
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

  const scheduleFields =
    input.scheduledReleaseAt !== undefined || input.releaseLinkedTo !== undefined
      ? await resolveScheduledReleaseFields(
          client,
          hackathonId,
          input.scheduledReleaseAt,
          input.releaseLinkedTo,
        )
      : await resolveScheduledReleaseFields(client, hackathonId, null, "event_start")

  const { data, error } = await client
    .from("challenges")
    .insert({
      hackathon_id: hackathonId,
      title: input.title,
      description: input.description ?? null,
      resources: input.resources ?? [],
      sort_order: nextOrder,
      scheduled_release_at: scheduleFields.scheduled_release_at,
      release_linked_to: scheduleFields.release_linked_to,
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

  if (patch.scheduledReleaseAt !== undefined || patch.releaseLinkedTo !== undefined) {
    const fields = await resolveScheduledReleaseFields(
      client,
      hackathonId,
      patch.scheduledReleaseAt,
      patch.releaseLinkedTo,
    )
    update.scheduled_release_at = fields.scheduled_release_at
    update.release_linked_to = fields.release_linked_to
  }

  const { data, error } = await client
    .from("challenges")
    .update(update)
    .eq("id", challengeId)
    .is("released_at", null)
    .select("*")
    .single()

  if (error || !data) {
    if (patch.title !== undefined || patch.description !== undefined || patch.resources !== undefined) {
      const contentOnly: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (patch.title !== undefined) contentOnly.title = patch.title
      if (patch.description !== undefined) contentOnly.description = patch.description
      if (patch.resources !== undefined) contentOnly.resources = patch.resources
      const { data: contentData, error: contentErr } = await client
        .from("challenges")
        .update(contentOnly)
        .eq("id", challengeId)
        .select("*")
        .single()
      if (!contentErr && contentData) return toChallenge(contentData)
    }
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

export type ReleaseTrigger = "manual" | "scheduled" | "event_publish" | "event_start"

type HackathonForDispatch = {
  id: string
  tenant_id: string
  name: string
  slug: string
  status: string
  challenge_released_at: string | null
}

async function fetchHackathonForDispatch(
  client: SupabaseClient,
  hackathonId: string,
): Promise<HackathonForDispatch | null> {
  const { data, error } = await client
    .from("hackathons")
    .select("id, tenant_id, name, slug, status, challenge_released_at")
    .eq("id", hackathonId)
    .single()
  if (error || !data) return null
  return data as unknown as HackathonForDispatch
}

async function markChallengesReleased(
  client: SupabaseClient,
  challengeIds: string[],
  releasedAt: string,
): Promise<Challenge[]> {
  if (challengeIds.length === 0) return []
  const { data, error } = await client
    .from("challenges")
    .update({ released_at: releasedAt, updated_at: releasedAt })
    .in("id", challengeIds)
    .is("released_at", null)
    .select("*")

  if (error) {
    console.error("Failed to mark challenges released:", error)
    return []
  }
  return (data ?? []).map(toChallenge)
}

async function backfillHackathonReleasedAt(
  client: SupabaseClient,
  hackathonId: string,
  tenantId: string,
  releasedAt: string,
  existingHackathonReleasedAt: string | null,
): Promise<void> {
  if (existingHackathonReleasedAt) return
  await client
    .from("hackathons")
    .update({ challenge_released_at: releasedAt, updated_at: releasedAt })
    .eq("id", hackathonId)
    .eq("tenant_id", tenantId)
    .is("challenge_released_at", null)
}

async function dispatchReleaseNotification(
  hackathon: HackathonForDispatch,
  challenges: Challenge[],
  trigger: ReleaseTrigger,
): Promise<void> {
  if (challenges.length === 0) return
  const eligibleStatus =
    hackathon.status === "published" || hackathon.status === "active"
  if (!eligibleStatus) return

  try {
    const { dispatchChallengesReleasedNotifications } = await import(
      "./notification-dispatcher"
    )
    dispatchChallengesReleasedNotifications({
      hackathonId: hackathon.id,
      tenantId: hackathon.tenant_id,
      hackathon: { name: hackathon.name, slug: hackathon.slug },
      challenges: challenges.map((c) => ({ title: c.title, description: c.description })),
      trigger,
    }).catch((err) => {
      console.error(
        `Failed to dispatch challenges-released notifications for ${hackathon.id}:`,
        err,
      )
    })
  } catch (err) {
    console.error(
      `Failed to start challenges-released dispatch for ${hackathon.id}:`,
      err,
    )
  }
}

export type ReleaseOptions = {
  dispatchNotification?: boolean
  trigger?: ReleaseTrigger
}

export async function releaseChallenge(
  challengeId: string,
  tenantId: string,
  options?: ReleaseOptions,
): Promise<Challenge | null> {
  const client = getSupabase() as unknown as SupabaseClient

  const hackathonId = await assertChallengeOwnership(client, challengeId, tenantId)
  if (!hackathonId) return null

  const hackathon = await fetchHackathonForDispatch(client, hackathonId)
  if (!hackathon) return null

  const releasedAt = new Date().toISOString()
  const [released] = await markChallengesReleased(client, [challengeId], releasedAt)
  if (!released) return null

  await backfillHackathonReleasedAt(
    client,
    hackathonId,
    tenantId,
    releasedAt,
    hackathon.challenge_released_at,
  )

  if (options?.dispatchNotification !== false) {
    await dispatchReleaseNotification(hackathon, [released], options?.trigger ?? "manual")
  }

  return released
}

export async function releaseLinkedChallenges(
  hackathonId: string,
  tenantId: string,
  linkedTo: ReleaseLinkedTo,
  options?: ReleaseOptions,
): Promise<Challenge[]> {
  const client = getSupabase() as unknown as SupabaseClient

  const hackathon = await fetchHackathonForDispatch(client, hackathonId)
  if (!hackathon || hackathon.tenant_id !== tenantId) return []

  const { data: pending } = await client
    .from("challenges")
    .select("id")
    .eq("hackathon_id", hackathonId)
    .eq("release_linked_to", linkedTo)
    .is("released_at", null)

  const ids = (pending ?? []).map((r) => r.id as string)
  if (ids.length === 0) return []

  const releasedAt = new Date().toISOString()
  const released = await markChallengesReleased(client, ids, releasedAt)
  if (released.length === 0) return []

  await backfillHackathonReleasedAt(
    client,
    hackathonId,
    tenantId,
    releasedAt,
    hackathon.challenge_released_at,
  )

  const triggerDefault: ReleaseTrigger =
    linkedTo === "event_publish" ? "event_publish" : "event_start"
  if (options?.dispatchNotification !== false) {
    await dispatchReleaseNotification(hackathon, released, options?.trigger ?? triggerDefault)
  }

  return released
}

export async function releaseAllUnreleasedChallenges(
  hackathonId: string,
  tenantId: string,
  options?: ReleaseOptions,
): Promise<Challenge[]> {
  const client = getSupabase() as unknown as SupabaseClient

  const hackathon = await fetchHackathonForDispatch(client, hackathonId)
  if (!hackathon || hackathon.tenant_id !== tenantId) return []

  const { data: pending } = await client
    .from("challenges")
    .select("id")
    .eq("hackathon_id", hackathonId)
    .is("released_at", null)

  const ids = (pending ?? []).map((r) => r.id as string)
  if (ids.length === 0) return []

  const releasedAt = new Date().toISOString()
  const released = await markChallengesReleased(client, ids, releasedAt)
  if (released.length === 0) return []

  await backfillHackathonReleasedAt(
    client,
    hackathonId,
    tenantId,
    releasedAt,
    hackathon.challenge_released_at,
  )

  if (options?.dispatchNotification !== false) {
    await dispatchReleaseNotification(hackathon, released, options?.trigger ?? "manual")
  }

  return released
}

export type ScheduledChallengeReleaseResult = {
  processed: number
  releases: Array<{ hackathonId: string; challengeIds: string[] }>
  errors: string[]
}

export async function processScheduledChallengeReleases(): Promise<ScheduledChallengeReleaseResult> {
  const client = getSupabase() as unknown as SupabaseClient

  const result: ScheduledChallengeReleaseResult = {
    processed: 0,
    releases: [],
    errors: [],
  }

  const nowIso = new Date().toISOString()
  const { data: due, error } = await client
    .from("challenges")
    .select("id, hackathon_id")
    .is("released_at", null)
    .is("release_linked_to", null)
    .not("scheduled_release_at", "is", null)
    .lte("scheduled_release_at", nowIso)

  if (error) {
    result.errors.push(`Failed to fetch due challenges: ${error.message}`)
    return result
  }
  if (!due || due.length === 0) return result

  const byHackathon = new Map<string, string[]>()
  for (const row of due) {
    const hackathonId = row.hackathon_id as string
    const list = byHackathon.get(hackathonId) ?? []
    list.push(row.id as string)
    byHackathon.set(hackathonId, list)
  }

  for (const [hackathonId, ids] of byHackathon) {
    try {
      const hackathon = await fetchHackathonForDispatch(client, hackathonId)
      if (!hackathon) continue
      if (hackathon.status !== "active" && hackathon.status !== "published") continue

      const released = await markChallengesReleased(client, ids, nowIso)
      if (released.length === 0) continue

      await backfillHackathonReleasedAt(
        client,
        hackathonId,
        hackathon.tenant_id,
        nowIso,
        hackathon.challenge_released_at,
      )

      await dispatchReleaseNotification(hackathon, released, "scheduled")

      result.processed += released.length
      result.releases.push({ hackathonId, challengeIds: released.map((c) => c.id) })
    } catch (err) {
      result.errors.push(
        `Failed to release scheduled challenges for ${hackathonId}: ${err instanceof Error ? err.message : String(err)}`,
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
      .select("id, released_at")
      .eq("hackathon_id", submission.hackathon_id)
      .in("id", challengeIds)

    if (valErr) {
      console.error("Failed to validate challenge ownership:", valErr)
      return false
    }

    const validRows = validChallenges ?? []
    if (validRows.length !== challengeIds.length) {
      console.error("One or more challenge IDs do not belong to submission's hackathon")
      return false
    }
    if (validRows.some((r) => r.released_at === null)) {
      console.error("Cannot tag submission with an unreleased challenge")
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

export type SubmissionChallengeResolution =
  | { ok: true; challengeIds: string[] }
  | { ok: false; code: "challenge_required" | "invalid_challenge_id"; message: string }

export async function resolveSubmissionChallengeIds(
  hackathonId: string,
  providedIds: string[] | undefined,
): Promise<SubmissionChallengeResolution> {
  const released = (await listChallenges(hackathonId)).filter((c) => !!c.releasedAt)

  if (released.length === 0) {
    return { ok: true, challengeIds: [] }
  }

  if (released.length === 1) {
    return { ok: true, challengeIds: [released[0].id] }
  }

  if (!providedIds || providedIds.length === 0) {
    return {
      ok: false,
      code: "challenge_required",
      message: "Pick which challenge this project is for.",
    }
  }

  const releasedIds = new Set(released.map((c) => c.id))
  for (const id of providedIds) {
    if (!releasedIds.has(id)) {
      return {
        ok: false,
        code: "invalid_challenge_id",
        message: "One of the picked challenges is not available.",
      }
    }
  }

  return { ok: true, challengeIds: providedIds }
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
