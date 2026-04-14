import { supabase as getSupabase } from "@/lib/db/client"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { SponsorTier } from "@/lib/db/hackathon-types"

export type JudgeHackathonStats = {
  hackathonId: string
  totalAssignments: number
  completedAssignments: number
}

export async function getBatchJudgeStats(
  hackathonIds: string[],
  clerkUserId: string,
): Promise<Map<string, JudgeHackathonStats>> {
  if (hackathonIds.length === 0) return new Map()

  const client = getSupabase() as unknown as SupabaseClient

  const { data: participants } = await client
    .from("hackathon_participants")
    .select("id, hackathon_id")
    .eq("clerk_user_id", clerkUserId)
    .eq("role", "judge")
    .in("hackathon_id", hackathonIds)

  if (!participants || participants.length === 0) return new Map()

  const participantMap = new Map<string, string>()
  for (const p of participants) {
    participantMap.set(p.id, p.hackathon_id)
  }

  const participantIds = participants.map((p: { id: string }) => p.id)
  const { data: assignments } = await client
    .from("judge_assignments")
    .select("judge_participant_id, hackathon_id, is_complete")
    .in("judge_participant_id", participantIds)

  const result = new Map<string, JudgeHackathonStats>()
  for (const id of hackathonIds) {
    result.set(id, { hackathonId: id, totalAssignments: 0, completedAssignments: 0 })
  }

  for (const a of assignments ?? []) {
    const stats = result.get(a.hackathon_id)
    if (stats) {
      stats.totalAssignments++
      if (a.is_complete) stats.completedAssignments++
    }
  }

  return result
}

export type SponsorshipInfo = {
  hackathonId: string
  tier: SponsorTier
  customTierLabel: string | null
  name: string
}

export async function getSponsorshipDetails(
  tenantId: string,
  hackathonIds: string[],
): Promise<Map<string, SponsorshipInfo>> {
  if (hackathonIds.length === 0) return new Map()

  const client = getSupabase() as unknown as SupabaseClient
  const { data, error } = await client
    .from("hackathon_sponsors")
    .select("hackathon_id, tier, custom_tier_label, name")
    .eq("sponsor_tenant_id", tenantId)
    .in("hackathon_id", hackathonIds)

  if (error || !data) return new Map()

  const result = new Map<string, SponsorshipInfo>()
  for (const row of data) {
    result.set(row.hackathon_id, {
      hackathonId: row.hackathon_id,
      tier: row.tier as SponsorTier,
      customTierLabel: row.custom_tier_label ?? null,
      name: row.name,
    })
  }

  return result
}
