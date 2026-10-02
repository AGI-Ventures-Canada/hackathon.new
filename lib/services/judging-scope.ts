import type { SupabaseClient } from "@supabase/supabase-js"
import { supabase } from "@/lib/db/client"

export type AssignmentScoringScope = {
  prizeIds: string[]
  criteriaVersion: string
  scopeMode: "legacy_unscoped" | "scoped"
  criteria: { id: string; name: string; description: string | null; min_score: number; max_score: number; weight: number; prize_id: string | null; prize_name: string | null; category: string | null }[]
}

export async function getAssignmentScoringScope(assignmentId: string, ownership: { hackathonId: string; prizeId: string | null; submissionId: string; assignmentKind?: string }): Promise<AssignmentScoringScope> {
  const client = supabase() as unknown as SupabaseClient
  const { data, error } = await client.rpc("get_judging_assignment_scope", { p_assignment_id: assignmentId, p_hackathon_id: ownership.hackathonId })
  if (error || !data) throw new Error(error?.message ?? "We couldn't check this scorecard.")
  return data as AssignmentScoringScope
}
