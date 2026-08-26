import { supabase as getSupabase } from "@/lib/db/client"
import type { SupabaseClient } from "@supabase/supabase-js"
import { isValidUuid } from "@/lib/utils/uuid"
import { randomInt } from "node:crypto"

export type MentorRequest = {
  id: string
  hackathon_id: string
  team_id: string | null
  requester_participant_id: string
  category: string | null
  description: string | null
  status: "open" | "claimed" | "resolved" | "cancelled"
  claimed_by_participant_id: string | null
  claimed_at: string | null
  resolved_at: string | null
  created_at: string
}

export type MentorRequestWithNames = MentorRequest & {
  team_name: string | null
  requester_name: string | null
  mentor_name: string | null
}

export type QueueStats = {
  open: number
  claimed: number
  resolved: number
}

export const MENTOR_REQUEST_CATEGORY_MAX_LENGTH = 80
export const MENTOR_REQUEST_DESCRIPTION_MAX_LENGTH = 2_000
export const MENTOR_REQUESTS_PER_HOUR = 3
export const MENTOR_QUEUE_MAX_ITEMS = 50
const MENTOR_REQUEST_LOCK_LEASE_MS = 30_000

export type MentorQueuePage = {
  requests: MentorRequestWithNames[]
  total: number
  truncated: boolean
}

export type CreateMentorRequestResult =
  | { success: true; request: MentorRequest }
  | {
      success: false
      code: "invalid_input" | "already_open" | "rate_limited" | "db_error"
      error: string
    }

export type MentorRequestMutationResult =
  | { success: true }
  | {
      success: false
      code: "invalid_id" | "already_claimed" | "not_claimed_by_you" | "db_error"
      error: string
    }

type MentorRequestConstraintRow = Pick<MentorRequest, "id" | "status" | "created_at">

type MentorRequestLock = {
  key: string
  owner: number
}

type MentorRequestLockResult =
  | { status: "acquired"; lock: MentorRequestLock }
  | { status: "busy" }
  | { status: "error" }

function mentorRequestLockKey(
  hackathonId: string,
  participantId: string,
  teamId: string | null,
): string {
  return `mentor-request:${hackathonId}:${teamId ? `team:${teamId}` : `person:${participantId}`}`
}

async function acquireMentorRequestLock(
  client: SupabaseClient,
  key: string,
): Promise<MentorRequestLockResult> {
  const now = Date.now()
  const owner = randomInt(1, 2_147_483_647)
  const { error: cleanupError } = await client
    .from("rate_limits")
    .delete()
    .eq("key", key)
    .lt("reset_at", now)

  if (cleanupError) {
    console.error("Failed to clear an expired mentor request lock:", cleanupError)
    return { status: "error" }
  }

  const { error } = await client.from("rate_limits").insert({
    key,
    count: owner,
    reset_at: now + MENTOR_REQUEST_LOCK_LEASE_MS,
  })

  if (!error) return { status: "acquired", lock: { key, owner } }
  if (error.code === "23505") return { status: "busy" }
  console.error("Failed to acquire a mentor request lock:", error)
  return { status: "error" }
}

async function releaseMentorRequestLock(
  client: SupabaseClient,
  lock: MentorRequestLock,
): Promise<void> {
  const { error } = await client
    .from("rate_limits")
    .delete()
    .eq("key", lock.key)
    .eq("count", lock.owner)
  if (error) console.error("Failed to release a mentor request lock:", error)
}

function compareConstraintRows(
  left: MentorRequestConstraintRow,
  right: MentorRequestConstraintRow,
): number {
  const timeDifference = left.created_at.localeCompare(right.created_at)
  return timeDifference !== 0 ? timeDifference : left.id.localeCompare(right.id)
}

async function cancelOpenRequest(
  client: SupabaseClient,
  requestId: string,
): Promise<boolean> {
  const { data, error } = await client
    .from("mentor_requests")
    .update({ status: "cancelled" })
    .eq("id", requestId)
    .eq("status", "open")
    .select("id")
    .maybeSingle()

  if (error) {
    console.error("Failed to reconcile mentor request:", error)
    return false
  }

  return Boolean(data)
}

async function reconcileCreatedMentorRequest(
  client: SupabaseClient,
  createdRequest: MentorRequest,
  participantId: string,
  teamId: string | null,
  oneHourAgo: string,
): Promise<CreateMentorRequestResult> {
  let activeQuery = client
    .from("mentor_requests")
    .select("id, status, created_at")
    .eq("hackathon_id", createdRequest.hackathon_id)
    .in("status", ["open", "claimed"])

  activeQuery = teamId
    ? activeQuery.eq("team_id", teamId)
    : activeQuery.eq("requester_participant_id", participantId).is("team_id", null)

  const boundedActiveQuery = activeQuery
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(10)

  let recentQuery = client
    .from("mentor_requests")
    .select("id, status, created_at")
    .eq("hackathon_id", createdRequest.hackathon_id)
    .gte("created_at", oneHourAgo)

  recentQuery = teamId
    ? recentQuery.eq("team_id", teamId)
    : recentQuery.eq("requester_participant_id", participantId).is("team_id", null)

  const boundedRecentQuery = recentQuery
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(MENTOR_REQUESTS_PER_HOUR + 1)

  const [activeResult, recentResult] = await Promise.all([
    boundedActiveQuery,
    boundedRecentQuery,
  ])
  if (activeResult.error || recentResult.error) {
    console.error(
      "Failed to reconcile mentor request limits:",
      activeResult.error ?? recentResult.error,
    )
    await cancelOpenRequest(client, createdRequest.id)
    return { success: false, code: "db_error", error: "We couldn't add your request." }
  }

  const activeRows = (activeResult.data ?? []) as MentorRequestConstraintRow[]
  const claimedRows = activeRows
    .filter((request) => request.status === "claimed")
    .sort(compareConstraintRows)
  const openRows = activeRows
    .filter((request) => request.status === "open")
    .sort(compareConstraintRows)
  const activeWinner = claimedRows[0] ?? openRows[0]

  if (!activeWinner || activeWinner.id !== createdRequest.id) {
    const cancelled = await cancelOpenRequest(client, createdRequest.id)
    return cancelled
      ? {
          success: false,
          code: "already_open",
          error: "You already have a mentor request in the queue.",
        }
      : { success: false, code: "db_error", error: "We couldn't add your request." }
  }

  const recentRows = ((recentResult.data ?? []) as MentorRequestConstraintRow[])
    .sort(compareConstraintRows)
  const recentRank = recentRows.findIndex((request) => request.id === createdRequest.id)
  if (recentRank < 0 || recentRank >= MENTOR_REQUESTS_PER_HOUR) {
    const cancelled = await cancelOpenRequest(client, createdRequest.id)
    return cancelled
      ? {
          success: false,
          code: "rate_limited",
          error: "You've asked three times this hour. Try again later.",
        }
      : { success: false, code: "db_error", error: "We couldn't add your request." }
  }

  return { success: true, request: createdRequest }
}

export async function createMentorRequest(
  hackathonId: string,
  participantId: string,
  teamId: string | null,
  input: { category?: string; description?: string }
): Promise<CreateMentorRequestResult> {
  if (
    !isValidUuid(hackathonId) ||
    !isValidUuid(participantId) ||
    (teamId !== null && !isValidUuid(teamId))
  ) {
    return { success: false, code: "invalid_input", error: "Check the request and try again." }
  }

  const category = input.category?.trim() || null
  const description = input.description?.trim() || null
  if (
    (!category && !description) ||
    (category?.length ?? 0) > MENTOR_REQUEST_CATEGORY_MAX_LENGTH ||
    (description?.length ?? 0) > MENTOR_REQUEST_DESCRIPTION_MAX_LENGTH
  ) {
    return { success: false, code: "invalid_input", error: "Add a short topic or note." }
  }

  const client = getSupabase() as unknown as SupabaseClient
  const lockResult = await acquireMentorRequestLock(
    client,
    mentorRequestLockKey(hackathonId, participantId, teamId),
  )
  if (lockResult.status === "busy") {
    return {
      success: false,
      code: "already_open",
      error: "Another mentor request is being added. Try again.",
    }
  }
  if (lockResult.status === "error") {
    return { success: false, code: "db_error", error: "We couldn't check the queue." }
  }

  try {

    let duplicateQuery = client
      .from("mentor_requests")
      .select("id")
      .eq("hackathon_id", hackathonId)
      .in("status", ["open", "claimed"])

    duplicateQuery = teamId
      ? duplicateQuery.eq("team_id", teamId)
      : duplicateQuery.eq("requester_participant_id", participantId).is("team_id", null)

    const { data: existing, error: existingError } = await duplicateQuery.limit(1).maybeSingle()
    if (existingError) {
      console.error("Failed to check mentor requests:", existingError)
      return { success: false, code: "db_error", error: "We couldn't check the queue." }
    }
    if (existing) {
      return {
        success: false,
        code: "already_open",
        error: "You already have a mentor request in the queue.",
      }
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1_000).toISOString()
    let rateQuery = client
      .from("mentor_requests")
      .select("id", { count: "exact", head: true })
      .eq("hackathon_id", hackathonId)
      .gte("created_at", oneHourAgo)

    rateQuery = teamId
      ? rateQuery.eq("team_id", teamId)
      : rateQuery.eq("requester_participant_id", participantId).is("team_id", null)

    const { count, error: countError } = await rateQuery

    if (countError) {
      console.error("Failed to check mentor request rate:", countError)
      return { success: false, code: "db_error", error: "We couldn't check the queue." }
    }
    if ((count ?? 0) >= MENTOR_REQUESTS_PER_HOUR) {
      return {
        success: false,
        code: "rate_limited",
        error: "You've asked three times this hour. Try again later.",
      }
    }

    const { data, error } = await client
      .from("mentor_requests")
      .insert({
        hackathon_id: hackathonId,
        requester_participant_id: participantId,
        team_id: teamId,
        category,
        description,
      })
      .select()
      .single()

    if (error) {
      console.error("Failed to create mentor request:", error)
      return { success: false, code: "db_error", error: "We couldn't add your request." }
    }

    return reconcileCreatedMentorRequest(
      client,
      data as MentorRequest,
      participantId,
      teamId,
      oneHourAgo,
    )
  } finally {
    await releaseMentorRequestLock(client, lockResult.lock)
  }
}

export async function getActiveMentorRequest(
  hackathonId: string,
  participantId: string,
  teamId: string | null,
): Promise<MentorRequest | null> {
  if (
    !isValidUuid(hackathonId) ||
    !isValidUuid(participantId) ||
    (teamId !== null && !isValidUuid(teamId))
  ) return null

  const client = getSupabase() as unknown as SupabaseClient
  let query = client
    .from("mentor_requests")
    .select("*")
    .eq("hackathon_id", hackathonId)
    .in("status", ["open", "claimed"])

  query = teamId
    ? query.eq("team_id", teamId)
    : query.eq("requester_participant_id", participantId).is("team_id", null)

  const { data, error } = await query.order("created_at", { ascending: false }).limit(1).maybeSingle()
  if (error) {
    console.error("Failed to get mentor request:", error)
    return null
  }
  return data as MentorRequest | null
}

export async function getMentorQueuePage(hackathonId: string): Promise<MentorQueuePage> {
  if (!isValidUuid(hackathonId)) {
    return { requests: [], total: 0, truncated: false }
  }

  const client = getSupabase() as unknown as SupabaseClient

  const { data: requests, error, count } = await client
    .from("mentor_requests")
    .select("*", { count: "exact" })
    .eq("hackathon_id", hackathonId)
    .in("status", ["open", "claimed"])
    .order("created_at", { ascending: true })
    .limit(MENTOR_QUEUE_MAX_ITEMS)

  if (error || !requests) {
    console.error("Failed to list mentor queue:", error)
    return { requests: [], total: 0, truncated: false }
  }

  const teamIds = [...new Set(requests.filter((r: MentorRequest) => r.team_id).map((r: MentorRequest) => r.team_id!))]
  let teamNames: Record<string, string> = {}
  if (teamIds.length > 0) {
    const { data: teams } = await client
      .from("teams")
      .select("id, name")
      .in("id", teamIds)
    if (teams) {
      teamNames = Object.fromEntries(teams.map((t: { id: string; name: string }) => [t.id, t.name]))
    }
  }

  const queue = requests.map((r: MentorRequest) => ({
    ...r,
    team_name: r.team_id ? (teamNames[r.team_id] ?? null) : null,
    requester_name: null,
    mentor_name: null,
  }))

  const total = Math.max(count ?? queue.length, queue.length)
  return {
    requests: queue,
    total,
    truncated: total > queue.length,
  }
}

export async function listMentorQueue(hackathonId: string): Promise<MentorRequestWithNames[]> {
  return (await getMentorQueuePage(hackathonId)).requests
}

export async function getMentorParticipantId(
  hackathonId: string,
  clerkUserId: string
): Promise<string | null> {
  if (!isValidUuid(hackathonId)) return null

  const client = getSupabase() as unknown as SupabaseClient
  const { data, error } = await client
    .from("hackathon_participants")
    .select("id")
    .eq("hackathon_id", hackathonId)
    .eq("clerk_user_id", clerkUserId)
    .eq("role", "mentor")
    .maybeSingle()

  if (error) {
    console.error("Failed to find mentor:", error)
    return null
  }

  return (data as { id: string } | null)?.id ?? null
}

export async function claimRequest(
  requestId: string,
  mentorParticipantId: string,
  hackathonId: string
): Promise<MentorRequestMutationResult> {
  if (![requestId, mentorParticipantId, hackathonId].every(isValidUuid)) {
    return { success: false, code: "invalid_id", error: "Request not found." }
  }

  const client = getSupabase() as unknown as SupabaseClient

  const { data, error } = await client
    .from("mentor_requests")
    .update({
      status: "claimed",
      claimed_by_participant_id: mentorParticipantId,
      claimed_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .eq("hackathon_id", hackathonId)
    .eq("status", "open")
    .select("id")
    .maybeSingle()

  if (error) {
    console.error("Failed to claim mentor request:", error)
    return { success: false, code: "db_error", error: "We couldn't claim this request." }
  }

  if (!data) {
    return {
      success: false,
      code: "already_claimed",
      error: "Another mentor already claimed this request.",
    }
  }
  return { success: true }
}

export async function resolveRequest(
  requestId: string,
  mentorParticipantId: string,
  hackathonId: string
): Promise<MentorRequestMutationResult> {
  if (![requestId, mentorParticipantId, hackathonId].every(isValidUuid)) {
    return { success: false, code: "invalid_id", error: "Request not found." }
  }

  const client = getSupabase() as unknown as SupabaseClient

  const { data, error } = await client
    .from("mentor_requests")
    .update({
      status: "resolved",
      resolved_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .eq("hackathon_id", hackathonId)
    .eq("claimed_by_participant_id", mentorParticipantId)
    .eq("status", "claimed")
    .select("id")
    .maybeSingle()

  if (error) {
    console.error("Failed to resolve mentor request:", error)
    return { success: false, code: "db_error", error: "We couldn't finish this request." }
  }

  if (!data) {
    return {
      success: false,
      code: "not_claimed_by_you",
      error: "Only the mentor who claimed this request can finish it.",
    }
  }
  return { success: true }
}

export async function cancelRequest(requestId: string, participantId: string): Promise<boolean> {
  if (![requestId, participantId].every(isValidUuid)) return false

  const client = getSupabase() as unknown as SupabaseClient

  const { data, error } = await client
    .from("mentor_requests")
    .update({ status: "cancelled" })
    .eq("id", requestId)
    .eq("requester_participant_id", participantId)
    .in("status", ["open", "claimed"])
    .select("id")
    .maybeSingle()

  if (error) {
    console.error("Failed to cancel mentor request:", error)
    return false
  }

  return Boolean(data)
}

export async function getQueueStats(hackathonId: string): Promise<QueueStats> {
  if (!isValidUuid(hackathonId)) return { open: 0, claimed: 0, resolved: 0 }

  const client = getSupabase() as unknown as SupabaseClient

  const [openResult, claimedResult, resolvedResult] = await Promise.all([
    client.from("mentor_requests").select("id", { count: "exact", head: true }).eq("hackathon_id", hackathonId).eq("status", "open"),
    client.from("mentor_requests").select("id", { count: "exact", head: true }).eq("hackathon_id", hackathonId).eq("status", "claimed"),
    client.from("mentor_requests").select("id", { count: "exact", head: true }).eq("hackathon_id", hackathonId).eq("status", "resolved"),
  ])

  return {
    open: openResult.count ?? 0,
    claimed: claimedResult.count ?? 0,
    resolved: resolvedResult.count ?? 0,
  }
}
