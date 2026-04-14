import { supabase as getSupabase } from "@/lib/db/client"
import type { AuditLog } from "@/lib/db/hackathon-types"
import type { Json } from "@/lib/db/types"
import type { Principal } from "@/lib/auth/types"

export type AuditAction =
  | "api_key.created"
  | "api_key.revoked"
  | "job.created"
  | "job.canceled"
  | "agent.created"
  | "agent.updated"
  | "agent.deleted"
  | "agent_run.created"
  | "agent_run.input_provided"
  | "agent_run.canceled"
  | "skill.created"
  | "skill.updated"
  | "skill.deleted"
  | "webhook.created"
  | "webhook.deleted"
  | "schedule.created"
  | "schedule.updated"
  | "schedule.deleted"
  | "integration.deleted"
  | "email_address.created"
  | "email_address.deleted"
  | "credential.saved"
  | "credential.updated"
  | "credential.deleted"
  | "hackathon.created"
  | "hackathon.updated"
  | "hackathon.banner_uploaded"
  | "hackathon.banner_deleted"
  | "sponsor.added"
  | "sponsor.updated"
  | "sponsor.removed"
  | "sponsor.logo_uploaded"
  | "sponsor.logo_deleted"
  | "org_profile.updated"
  | "logo.uploaded"
  | "logo.deleted"
  | "team_invitation.sent"
  | "team_invitation.cancelled"
  | "judging_criteria.created"
  | "judging_criteria.deleted"
  | "judge.added"
  | "judge.removed"
  | "judge.invited"
  | "judge_invitation.cancelled"
  | "judging.auto_assigned"
  | "judging.track_assigned"
  | "judging.track_unassigned"
  | "rubric_level.created"
  | "rubric_level.updated"
  | "rubric_level.deleted"
  | "judge_display.created"
  | "judge_display.deleted"
  | "prize.created"
  | "prize.deleted"
  | "prize.assigned"
  | "prize_track.created"
  | "prize_track.deleted"
  | "prize_track.results_calculated"
  | "round.created"
  | "results.calculated"
  | "results.published"
  | "results.unpublished"
  | "cli_auth.completed"
  | "phase.changed"
  | "room.created"
  | "room.updated"
  | "room.deleted"
  | "room_team.added"
  | "room_team.removed"
  | "room_team.presented"
  | "room_timer.set"
  | "room_timer.cleared"
  | "room_timer.paused"
  | "room_timer.resumed"
  | "team.created"
  | "team.captain_invited"
  | "team.members_modified"
  | "team.bulk_assigned"
  | "team.name_updated"
  | "category.created"
  | "category.updated"
  | "category.deleted"
  | "judging_round.created"
  | "judging_round.updated"
  | "judging_round.deleted"
  | "judging_round.activated"
  | "social_submission.reviewed"
  | "challenge.saved"
  | "challenge.released"
  | "email_blast.sent"
  | "announcement.created"
  | "announcement.updated"
  | "announcement.deleted"
  | "announcement.published"
  | "announcement.unpublished"
  | "announcement.scheduled"
  | "hackathon.status_transition"
  | "schedule_item.created"
  | "schedule_item.updated"
  | "schedule_item.deleted"
  | "admin.hackathon.updated"
  | "admin.hackathon.deleted"
  | "admin.scenario.created"
  | "results_announcement.sent"
  | "feedback_survey.sent"
  | "fulfillment.initialized"
  | "fulfillment.updated"
  | "reminder.scheduled"
  | "reminder.sent"
  | "reminder.cancelled"

export type LogAuditInput = {
  principal: Exclude<Principal, { kind: "anon" }>
  action: AuditAction
  resourceType: string
  resourceId?: string
  metadata?: Json
  targetTenantId?: string
  critical?: boolean
}

export async function logAudit(input: LogAuditInput): Promise<AuditLog | null> {
  const { principal } = input

  let tenantId: string
  let actorType: "user" | "api_key"
  let actorId: string
  let metadata = input.metadata

  if (principal.kind === "admin") {
    const resolvedTenantId = input.targetTenantId ?? principal.tenantId
    if (!resolvedTenantId) {
      throw new Error("Admin audit log requires targetTenantId")
    }
    tenantId = resolvedTenantId
    actorType = "user"
    actorId = principal.userId
    metadata = { ...(input.metadata as Record<string, unknown> ?? {}), is_admin_action: true, admin_user_id: principal.userId }
  } else if (principal.kind === "user") {
    tenantId = principal.tenantId
    actorType = "user"
    actorId = principal.userId
  } else if (principal.kind === "api_key" && input.targetTenantId) {
    tenantId = input.targetTenantId
    actorType = "api_key"
    actorId = principal.keyId
    metadata = { ...(input.metadata as Record<string, unknown> ?? {}), is_admin_action: true, admin_key_id: principal.keyId }
  } else {
    tenantId = principal.tenantId
    actorType = "api_key"
    actorId = principal.keyId
  }

  const { data, error } = await getSupabase()
    .from("audit_logs")
    .insert({
      tenant_id: tenantId,
      action: input.action,
      actor_type: actorType,
      actor_id: actorId,
      resource_type: input.resourceType,
      resource_id: input.resourceId,
      metadata,
    })
    .select()
    .single()

  if (error || !data) {
    if (input.critical) {
      throw new Error(`Critical audit log failed: ${error?.message ?? "no data returned"}`)
    }
    console.error("Failed to log audit:", error)
    return null
  }

  return data as AuditLog
}

export async function listAuditLogs(
  tenantId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<AuditLog[]> {
  let query = getSupabase()
    .from("audit_logs")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })

  if (options.limit) {
    query = query.limit(options.limit)
  }
  if (options.offset) {
    query = query.range(options.offset, options.offset + (options.limit ?? 50) - 1)
  }

  const { data } = await query

  return (data as AuditLog[] | null) ?? []
}

export type ListHackathonAuditLogsOptions = {
  limit?: number
  offset?: number
  action?: string
  resourceType?: string
  since?: string
  until?: string
  sort?: "asc" | "desc"
}

export async function listHackathonAuditLogs(
  tenantId: string,
  hackathonId: string,
  options: ListHackathonAuditLogsOptions = {}
) {
  const { limit: rawLimit = 50, offset = 0, action, resourceType, since, until, sort = "desc" } = options
  const limit = Math.min(Math.max(rawLimit, 1), MAX_AUDIT_PAGE_SIZE)

  let query = getSupabase()
    .from("audit_logs")
    .select("*", { count: "exact" })
    .eq("tenant_id", tenantId)
    .or(`resource_id.eq.${hackathonId},metadata->>hackathonId.eq.${hackathonId}`)
    .order("created_at", { ascending: sort === "asc" })
    .range(offset, offset + limit - 1)

  if (action) {
    query = query.ilike("action", `%${action}%`)
  }
  if (resourceType) {
    query = query.eq("resource_type", resourceType)
  }
  if (since) {
    query = query.gte("created_at", since)
  }
  if (until) {
    query = query.lte("created_at", until)
  }

  const { data, error, count } = await query

  if (error) {
    throw new Error(`Failed to list hackathon audit logs: ${error.message}`)
  }

  return { logs: (data as AuditLog[] | null) ?? [], total: count ?? 0 }
}

export type ListAllAuditLogsOptions = {
  limit?: number
  offset?: number
  hackathonId?: string
  tenantId?: string
  action?: string
  resourceType?: string
  since?: string
  until?: string
  sort?: "asc" | "desc"
}

const MAX_AUDIT_PAGE_SIZE = 100

export async function listAllAuditLogs(options: ListAllAuditLogsOptions = {}) {
  const { limit: rawLimit = 50, offset = 0, hackathonId, tenantId, action, resourceType, since, until, sort = "desc" } = options
  const limit = Math.min(Math.max(rawLimit, 1), MAX_AUDIT_PAGE_SIZE)

  let query = getSupabase()
    .from("audit_logs")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: sort === "asc" })
    .range(offset, offset + limit - 1)

  if (tenantId) {
    query = query.eq("tenant_id", tenantId)
  }
  if (hackathonId) {
    query = query.or(`resource_id.eq.${hackathonId},metadata->>hackathonId.eq.${hackathonId}`)
  }
  if (action) {
    query = query.ilike("action", `%${action}%`)
  }
  if (resourceType) {
    query = query.eq("resource_type", resourceType)
  }
  if (since) {
    query = query.gte("created_at", since)
  }
  if (until) {
    query = query.lte("created_at", until)
  }

  const { data, error, count } = await query

  if (error) {
    throw new Error(`Failed to list audit logs: ${error.message}`)
  }

  return { logs: (data as AuditLog[] | null) ?? [], total: count ?? 0 }
}
