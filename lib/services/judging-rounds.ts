import { supabase as getSupabase } from "@/lib/db/client"
import type { SupabaseClient } from "@supabase/supabase-js"

export type JudgingRound = {
  id: string
  hackathon_id: string
  name: string
  round_type: "preliminary" | "finals"
  is_active: boolean
  display_order: number
  created_at: string
}

export type CreateRoundInput = {
  name: string
  roundType: "preliminary" | "finals"
  displayOrder?: number
}

export type UpdateRoundInput = {
  name?: string
  roundType?: "preliminary" | "finals"
  displayOrder?: number
}

export async function listRounds(hackathonId: string): Promise<JudgingRound[]> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data, error } = await client
    .from("judging_rounds")
    .select("*")
    .eq("hackathon_id", hackathonId)
    .order("display_order")

  if (error) {
    console.error("Failed to list judging rounds:", error)
    return []
  }

  return data as JudgingRound[]
}

export async function createRound(
  hackathonId: string,
  input: CreateRoundInput
): Promise<JudgingRound | null> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data, error } = await client.rpc("create_judging_round_atomic", {
    p_hackathon_id: hackathonId,
    p_values: {
      name: input.name,
      round_type: input.roundType,
      ...(input.displayOrder !== undefined
        ? { display_order: input.displayOrder }
        : {}),
    },
  })

  if (error) {
    console.error("Failed to create judging round:", error)
    return null
  }

  return data as JudgingRound
}

export async function updateRound(
  roundId: string,
  hackathonId: string,
  input: UpdateRoundInput
): Promise<JudgingRound | null> {
  const client = getSupabase() as unknown as SupabaseClient

  const updates: Record<string, unknown> = {}
  if (input.name !== undefined) updates.name = input.name
  if (input.roundType !== undefined) updates.round_type = input.roundType
  if (input.displayOrder !== undefined) updates.display_order = input.displayOrder

  if (Object.keys(updates).length === 0) return null

  const { data, error } = await client.rpc("update_judging_round_atomic", {
    p_hackathon_id: hackathonId,
    p_round_id: roundId,
    p_updates: updates,
  })

  if (error) {
    console.error("Failed to update judging round:", error)
    return null
  }

  return data as JudgingRound
}

export async function deleteRound(roundId: string, hackathonId: string): Promise<boolean> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data, error } = await client.rpc("delete_judging_round_atomic", {
    p_hackathon_id: hackathonId,
    p_round_id: roundId,
  })

  if (error || data !== "deleted") {
    console.error("Failed to delete judging round:", error)
    return false
  }

  return true
}

export async function activateRound(roundId: string, hackathonId: string): Promise<boolean> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data, error } = await client.rpc("activate_judging_round_atomic", {
    p_hackathon_id: hackathonId,
    p_round_id: roundId,
  })

  if (error || data !== true) {
    console.error("Failed to activate round:", error)
    return false
  }

  return true
}

export async function getActiveRound(hackathonId: string): Promise<JudgingRound | null> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data, error } = await client
    .from("judging_rounds")
    .select("*")
    .eq("hackathon_id", hackathonId)
    .eq("is_active", true)
    .maybeSingle()

  if (error) {
    console.error("Failed to get active round:", error)
    return null
  }

  return data as JudgingRound | null
}
