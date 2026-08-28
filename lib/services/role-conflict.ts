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
      error: "This person can't join this team. Ask an organizer for help.",
      code: "role_unavailable",
      existingRole: "judge",
    }
  }

  if (targetRole === "judge" && existing.role === "participant") {
    const ownershipFilter = [
      `participant_id.eq.${existing.id}`,
      existing.team_id ? `team_id.eq.${existing.team_id}` : null,
    ].filter(Boolean).join(",")
    const { data: projects, error: projectError } = await client
      .from("submissions")
      .select("id")
      .eq("hackathon_id", hackathonId)
      .or(ownershipFilter)
      .limit(1)

    if (projectError) {
      console.error("Failed to check project ownership:", projectError)
      return {
        conflict: true,
        error: "Unable to check this person's projects. Please try again.",
        code: "check_failed",
        existingRole: "participant",
      }
    }

    if (projects && projects.length > 0) {
      return {
        conflict: true,
        error: "This attendee has a project. Remove or move the project before making them a judge.",
        code: "project_role_conflict",
        existingRole: "participant",
      }
    }
  }

  return { conflict: false }
}
