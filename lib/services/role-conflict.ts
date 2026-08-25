import { supabase as getSupabase } from "@/lib/db/client"
import type { SupabaseClient } from "@supabase/supabase-js"

export type RoleConflictCheck =
  | { conflict: false }
  | { conflict: true; error: string; code: string; existingRole: string }

export async function checkRoleConflict(
  hackathonId: string,
  clerkUserId: string,
  targetRole: "judge" | "participant"
): Promise<RoleConflictCheck> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: existing, error } = await client
    .from("hackathon_participants")
    .select("id, role, team_id")
    .eq("hackathon_id", hackathonId)
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle()

  if (error) {
    console.error("Failed to check role conflict:", error)
    return {
      conflict: true,
      error: "Unable to verify role eligibility. Please try again.",
      code: "check_failed",
      existingRole: "unknown",
    }
  }

  if (!existing) {
    return { conflict: false }
  }

  if (targetRole === "participant" && existing.role === "judge") {
    return {
      conflict: true,
      error: "This user is a judge in this event. They must be removed as a judge before joining a team.",
      code: "role_conflict",
      existingRole: "judge",
    }
  }

  return { conflict: false }
}
