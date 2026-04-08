import { supabase as getSupabase } from "@/lib/db/client"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { HackathonJudgeDisplay } from "@/lib/db/hackathon-types"

export type CreateJudgeDisplayInput = {
  name: string
  title?: string | null
  organization?: string | null
  headshotUrl?: string | null
  clerkUserId?: string | null
  participantId?: string | null
  displayOrder?: number
}

export type UpdateJudgeDisplayInput = {
  name?: string
  title?: string | null
  organization?: string | null
  headshotUrl?: string | null
  clerkUserId?: string | null
  participantId?: string | null
  displayOrder?: number
}

export async function listJudgeDisplayProfiles(
  hackathonId: string
): Promise<HackathonJudgeDisplay[]> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data, error } = await client
    .from("hackathon_judges_display")
    .select("*")
    .eq("hackathon_id", hackathonId)
    .order("display_order")

  if (error) {
    console.error("Failed to list judge display profiles:", error)
    return []
  }

  return data as unknown as HackathonJudgeDisplay[]
}

export type CreateJudgeDisplayResult =
  | { status: "created"; judge: HackathonJudgeDisplay }
  | { status: "duplicate" }
  | { status: "error" }

export async function createJudgeDisplayProfile(
  hackathonId: string,
  input: CreateJudgeDisplayInput
): Promise<CreateJudgeDisplayResult> {
  const client = getSupabase() as unknown as SupabaseClient

  if (input.clerkUserId) {
    const { data: existing } = await client
      .from("hackathon_judges_display")
      .select("id")
      .eq("hackathon_id", hackathonId)
      .eq("clerk_user_id", input.clerkUserId)
      .maybeSingle()
    if (existing) return { status: "duplicate" }
  } else {
    const { data: existing } = await client
      .from("hackathon_judges_display")
      .select("id")
      .eq("hackathon_id", hackathonId)
      .eq("name", input.name)
      .is("clerk_user_id", null)
      .maybeSingle()
    if (existing) return { status: "duplicate" }
  }

  const { data, error } = await client
    .from("hackathon_judges_display")
    .insert({
      hackathon_id: hackathonId,
      name: input.name,
      title: input.title ?? null,
      organization: input.organization ?? null,
      headshot_url: input.headshotUrl ?? null,
      clerk_user_id: input.clerkUserId ?? null,
      participant_id: input.participantId ?? null,
      display_order: input.displayOrder ?? 0,
    })
    .select()
    .single()

  if (error) {
    console.error("Failed to create judge display profile:", error)
    return { status: "error" }
  }

  return { status: "created", judge: data as unknown as HackathonJudgeDisplay }
}

export async function updateJudgeDisplayProfile(
  id: string,
  hackathonId: string,
  input: UpdateJudgeDisplayInput
): Promise<HackathonJudgeDisplay | null> {
  const client = getSupabase() as unknown as SupabaseClient

  const updates: Record<string, unknown> = {}
  if (input.name !== undefined) updates.name = input.name
  if (input.title !== undefined) updates.title = input.title
  if (input.organization !== undefined) updates.organization = input.organization
  if (input.headshotUrl !== undefined) updates.headshot_url = input.headshotUrl
  if (input.clerkUserId !== undefined) updates.clerk_user_id = input.clerkUserId
  if (input.participantId !== undefined) updates.participant_id = input.participantId
  if (input.displayOrder !== undefined) updates.display_order = input.displayOrder
  updates.updated_at = new Date().toISOString()

  const { data, error } = await client
    .from("hackathon_judges_display")
    .update(updates)
    .eq("id", id)
    .eq("hackathon_id", hackathonId)
    .select()
    .single()

  if (error) {
    console.error("Failed to update judge display profile:", error)
    return null
  }

  return data as unknown as HackathonJudgeDisplay
}

export async function deleteJudgeDisplayProfile(
  id: string,
  hackathonId: string
): Promise<boolean> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: profile, error } = await client
    .from("hackathon_judges_display")
    .delete()
    .eq("id", id)
    .eq("hackathon_id", hackathonId)
    .select("participant_id, clerk_user_id")
    .maybeSingle()

  if (error) {
    console.error("Failed to delete judge display profile:", error)
    return false
  }

  let participantId = profile?.participant_id
  if (!participantId && profile?.clerk_user_id) {
    const { data: participant } = await client
      .from("hackathon_participants")
      .select("id")
      .eq("hackathon_id", hackathonId)
      .eq("clerk_user_id", profile.clerk_user_id)
      .eq("role", "judge")
      .maybeSingle()
    participantId = participant?.id
  }

  if (participantId) {
    const { error: assignmentError } = await client
      .from("judge_assignments")
      .delete()
      .eq("hackathon_id", hackathonId)
      .eq("judge_participant_id", participantId)

    if (assignmentError) {
      console.error("Failed to cascade-delete judge assignments:", assignmentError)
    }

    const { error: participantError } = await client
      .from("hackathon_participants")
      .delete()
      .eq("id", participantId)
      .eq("hackathon_id", hackathonId)
      .eq("role", "judge")

    if (participantError) {
      console.error("Failed to cascade-delete judge participant:", participantError)
    }
  }

  return true
}

export async function reorderJudgeDisplayProfiles(
  hackathonId: string,
  orderedIds: string[]
): Promise<boolean> {
  const client = getSupabase() as unknown as SupabaseClient
  const now = new Date().toISOString()

  const updates = orderedIds.map((id, i) =>
    client
      .from("hackathon_judges_display")
      .update({ display_order: i, updated_at: now })
      .eq("id", id)
      .eq("hackathon_id", hackathonId)
  )

  const results = await Promise.all(updates)
  const failed = results.find((r) => r.error)

  if (failed?.error) {
    console.error("Failed to reorder judge display profiles:", failed.error)
    return false
  }

  return true
}

export async function countJudgeDisplayProfiles(
  hackathonId: string
): Promise<number> {
  const client = getSupabase() as unknown as SupabaseClient
  const { count, error } = await client
    .from("hackathon_judges_display")
    .select("id", { count: "exact", head: true })
    .eq("hackathon_id", hackathonId)

  if (error) {
    console.error("Failed to count judge display profiles:", error)
    return 0
  }

  return count ?? 0
}
