import { supabase as getSupabase } from "@/lib/db/client"
import type { SupabaseClient } from "@supabase/supabase-js"
import { isValidUuid } from "@/lib/utils/uuid"

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

export async function createMentorRequest(
  hackathonId: string,
  participantId: string,
  teamId: string | null,
  input: { category?: string; description?: string }
): Promise<MentorRequest | null> {
  if (
    !isValidUuid(hackathonId) ||
    !isValidUuid(participantId) ||
    (teamId !== null && !isValidUuid(teamId))
  ) return null

  const client = getSupabase() as unknown as SupabaseClient

  const { data, error } = await client
    .from("mentor_requests")
    .insert({
      hackathon_id: hackathonId,
      requester_participant_id: participantId,
      team_id: teamId,
      category: input.category ?? null,
      description: input.description ?? null,
    })
    .select()
    .single()

  if (error) {
    console.error("Failed to create mentor request:", error)
    return null
  }

  return data as MentorRequest
}

export async function listMentorQueue(hackathonId: string): Promise<MentorRequestWithNames[]> {
  if (!isValidUuid(hackathonId)) return []

  const client = getSupabase() as unknown as SupabaseClient

  const { data: requests, error } = await client
    .from("mentor_requests")
    .select("*")
    .eq("hackathon_id", hackathonId)
    .in("status", ["open", "claimed"])
    .order("created_at", { ascending: true })

  if (error || !requests) {
    console.error("Failed to list mentor queue:", error)
    return []
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

  return requests.map((r: MentorRequest) => ({
    ...r,
    team_name: r.team_id ? (teamNames[r.team_id] ?? null) : null,
    requester_name: null,
    mentor_name: null,
  }))
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
): Promise<boolean> {
  if (![requestId, mentorParticipantId, hackathonId].every(isValidUuid)) return false

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
    return false
  }

  return Boolean(data)
}

export async function resolveRequest(
  requestId: string,
  mentorParticipantId: string,
  hackathonId: string
): Promise<boolean> {
  if (![requestId, mentorParticipantId, hackathonId].every(isValidUuid)) return false

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
    return false
  }

  return Boolean(data)
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
