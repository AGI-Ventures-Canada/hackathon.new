import { supabase as getSupabase } from "@/lib/db/client"
import type { SupabaseClient } from "@supabase/supabase-js"

export type Urgency = "low" | "medium" | "high"

export type ReminderScheduleEntry = {
  scheduledFor: Date
  urgency: Urgency
}

export type EntityType = "team_invitation" | "judge_invitation" | "hackathon_event"

export type ReminderType =
  | "invitation_reminder"
  | "registration_closing"
  | "event_starting"
  | "submission_due"

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const MIN_GAP = 4 * HOUR

export function computeReminderSchedule(
  createdAt: Date,
  deadline: Date
): ReminderScheduleEntry[] {
  const now = new Date()
  const window = deadline.getTime() - createdAt.getTime()
  const raw: ReminderScheduleEntry[] = []

  if (window <= 0) return []

  if (window < 2 * DAY) {
    // Tier 1: Short-notice (< 2 days)
    raw.push({
      scheduledFor: new Date(createdAt.getTime() + window * 0.5),
      urgency: "medium",
    })
    raw.push({
      scheduledFor: new Date(deadline.getTime() - 2 * HOUR),
      urgency: "high",
    })
  } else if (window <= 7 * DAY) {
    // Tier 2: Typical invitations (2-7 days)
    raw.push({
      scheduledFor: new Date(createdAt.getTime() + window * 0.4),
      urgency: "low",
    })
    raw.push({
      scheduledFor: new Date(deadline.getTime() - 1 * DAY),
      urgency: "medium",
    })
    raw.push({
      scheduledFor: new Date(deadline.getTime() - 3 * HOUR),
      urgency: "high",
    })
  } else if (window <= 30 * DAY) {
    // Tier 3: Pre-event deadlines (7-30 days)
    raw.push({
      scheduledFor: new Date(deadline.getTime() - 7 * DAY),
      urgency: "low",
    })
    raw.push({
      scheduledFor: new Date(deadline.getTime() - 2 * DAY),
      urgency: "medium",
    })
    raw.push({
      scheduledFor: new Date(deadline.getTime() - 6 * HOUR),
      urgency: "high",
    })
  } else {
    // Tier 4: Long-horizon events (30+ days)
    raw.push({
      scheduledFor: new Date(deadline.getTime() - 14 * DAY),
      urgency: "low",
    })
    raw.push({
      scheduledFor: new Date(deadline.getTime() - 7 * DAY),
      urgency: "low",
    })
    raw.push({
      scheduledFor: new Date(deadline.getTime() - 1 * DAY),
      urgency: "medium",
    })
    raw.push({
      scheduledFor: new Date(deadline.getTime() - 3 * HOUR),
      urgency: "high",
    })
  }

  const filtered = raw.filter((r) => r.scheduledFor.getTime() > now.getTime())

  const deduped: ReminderScheduleEntry[] = []
  for (const entry of filtered) {
    const tooClose = deduped.some(
      (existing) =>
        Math.abs(existing.scheduledFor.getTime() - entry.scheduledFor.getTime()) < MIN_GAP
    )
    if (!tooClose) {
      deduped.push(entry)
    }
  }

  return deduped.sort(
    (a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime()
  )
}

export async function scheduleReminders(
  entityType: EntityType,
  entityId: string,
  hackathonId: string,
  reminderType: ReminderType,
  createdAt: Date,
  deadline: Date,
  metadata: Record<string, unknown>
): Promise<number> {
  const schedule = computeReminderSchedule(createdAt, deadline)
  if (schedule.length === 0) return 0

  const client = getSupabase() as unknown as SupabaseClient

  const rows = schedule.map((entry) => ({
    entity_type: entityType,
    entity_id: entityId,
    hackathon_id: hackathonId,
    reminder_type: reminderType,
    scheduled_for: entry.scheduledFor.toISOString(),
    urgency: entry.urgency,
    metadata,
    sent_at: null,
    cancelled_at: null,
  }))

  const { data, error } = await client
    .from("scheduled_reminders")
    .upsert(rows, { onConflict: "entity_type,entity_id,scheduled_for" })
    .select("id")

  if (error) {
    console.error("Failed to schedule reminders:", error)
    return 0
  }

  return data?.length ?? 0
}

export async function cancelRemindersForEntity(
  entityType: EntityType,
  entityId: string
): Promise<number> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data, error } = await client
    .from("scheduled_reminders")
    .update({ cancelled_at: new Date().toISOString() })
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .is("sent_at", null)
    .is("cancelled_at", null)
    .select("id")

  if (error) {
    console.error("Failed to cancel reminders:", error)
    return 0
  }

  return data?.length ?? 0
}

export async function cancelUpcomingReminder(
  entityType: EntityType,
  entityId: string,
  withinMs: number = 6 * HOUR
): Promise<number> {
  const client = getSupabase() as unknown as SupabaseClient
  const cutoff = new Date(Date.now() + withinMs).toISOString()

  const { data, error } = await client
    .from("scheduled_reminders")
    .update({ cancelled_at: new Date().toISOString() })
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .is("sent_at", null)
    .is("cancelled_at", null)
    .lte("scheduled_for", cutoff)
    .select("id")

  if (error) {
    console.error("Failed to cancel upcoming reminder:", error)
    return 0
  }

  return data?.length ?? 0
}

export type ScheduledReminder = {
  id: string
  entity_type: EntityType
  entity_id: string
  hackathon_id: string
  reminder_type: ReminderType
  scheduled_for: string
  urgency: Urgency
  sent_at: string | null
  cancelled_at: string | null
  metadata: Record<string, unknown>
  fail_count: number
  last_error: string | null
  created_at: string
}

const MAX_RETRIES = 3

export type ProcessResult = {
  processed: number
  sent: number
  skipped: number
  errors: number
}

export async function processPendingReminders(
  limit: number = 50
): Promise<ProcessResult> {
  const client = getSupabase() as unknown as SupabaseClient
  const now = new Date().toISOString()

  const { data: reminders, error } = await client
    .from("scheduled_reminders")
    .update({ sent_at: now })
    .lte("scheduled_for", now)
    .is("sent_at", null)
    .is("cancelled_at", null)
    .lt("fail_count", MAX_RETRIES)
    .select("*")
    .limit(limit)

  if (error || !reminders) {
    console.error("Failed to claim pending reminders:", error)
    return { processed: 0, sent: 0, skipped: 0, errors: 0 }
  }

  const result: ProcessResult = { processed: reminders.length, sent: 0, skipped: 0, errors: 0 }

  for (const reminder of reminders as ScheduledReminder[]) {
    try {
      const shouldSend = await validateReminderEntity(reminder)
      if (!shouldSend) {
        result.skipped++
        continue
      }

      await dispatchReminderEmail(reminder)
      result.sent++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(
        `Failed to process reminder ${reminder.id} (entity=${reminder.entity_type}, entity_id=${reminder.entity_id}, hackathon=${reminder.hackathon_id}):`,
        err
      )
      await client
        .from("scheduled_reminders")
        .update({
          sent_at: null,
          fail_count: reminder.fail_count + 1,
          last_error: message,
        })
        .eq("id", reminder.id)
      result.errors++
    }
  }

  return result
}

async function validateReminderEntity(
  reminder: ScheduledReminder
): Promise<boolean> {
  const client = getSupabase() as unknown as SupabaseClient

  if (reminder.entity_type === "team_invitation" || reminder.entity_type === "judge_invitation") {
    const { data: hackathon } = await client
      .from("hackathons")
      .select("status")
      .eq("id", reminder.hackathon_id)
      .single()
    if (!hackathon || hackathon.status === "draft") return false
  }

  if (reminder.entity_type === "team_invitation") {
    const { data } = await client
      .from("team_invitations")
      .select("status, expires_at")
      .eq("id", reminder.entity_id)
      .single()

    if (!data) return false
    if (data.status !== "pending") return false
    if (new Date(data.expires_at) < new Date()) return false
    return true
  }

  if (reminder.entity_type === "judge_invitation") {
    const { data } = await client
      .from("judge_invitations")
      .select("status, expires_at")
      .eq("id", reminder.entity_id)
      .single()

    if (!data) return false
    if (data.status !== "pending") return false
    if (new Date(data.expires_at) < new Date()) return false
    return true
  }

  if (reminder.entity_type === "hackathon_event") {
    const { data } = await client
      .from("hackathons")
      .select("status")
      .eq("id", reminder.entity_id)
      .single()

    if (!data) return false
    if (data.status === "completed" || data.status === "archived") return false
    return true
  }

  return false
}

function requireMeta(meta: Record<string, unknown>, ...keys: string[]): void {
  const missing = keys.filter((k) => meta[k] == null || meta[k] === "")
  if (missing.length > 0) {
    throw new Error(`Missing required metadata fields: ${missing.join(", ")}`)
  }
}

async function dispatchReminderEmail(
  reminder: ScheduledReminder
): Promise<void> {
  const meta = reminder.metadata

  if (
    reminder.entity_type === "team_invitation" &&
    reminder.reminder_type === "invitation_reminder"
  ) {
    requireMeta(meta, "email", "teamName", "hackathonName", "inviterName", "inviteToken", "expiresAt")
    const { sendTeamInvitationReminderEmail } = await import(
      "@/lib/email/team-invitations"
    )
    await sendTeamInvitationReminderEmail({
      to: meta.email as string,
      teamName: meta.teamName as string,
      hackathonName: meta.hackathonName as string,
      inviterName: meta.inviterName as string,
      inviterEmail: typeof meta.inviterEmail === "string" ? meta.inviterEmail : undefined,
      inviteToken: meta.inviteToken as string,
      expiresAt: meta.expiresAt as string,
      urgency: reminder.urgency,
    })
    return
  }

  if (
    reminder.entity_type === "judge_invitation" &&
    reminder.reminder_type === "invitation_reminder"
  ) {
    requireMeta(meta, "email", "hackathonName", "inviterName", "inviteToken", "expiresAt")
    const { sendJudgeInvitationReminderEmail } = await import(
      "@/lib/email/judge-invitations"
    )
    await sendJudgeInvitationReminderEmail({
      to: meta.email as string,
      hackathonName: meta.hackathonName as string,
      inviterName: meta.inviterName as string,
      inviteToken: meta.inviteToken as string,
      expiresAt: meta.expiresAt as string,
      urgency: reminder.urgency,
    })
    return
  }

  if (reminder.entity_type === "hackathon_event") {
    requireMeta(meta, "hackathonName", "hackathonSlug", "deadlineDate")
    const { sendPreEventReminderEmail } = await import(
      "@/lib/email/pre-event-reminders"
    )
    await sendPreEventReminderEmail({
      hackathonId: reminder.hackathon_id,
      reminderType: reminder.reminder_type as "registration_closing" | "event_starting" | "submission_due",
      hackathonName: meta.hackathonName as string,
      hackathonSlug: meta.hackathonSlug as string,
      deadlineDate: meta.deadlineDate as string,
    })
    return
  }

  console.warn(`Unknown reminder dispatch: ${reminder.entity_type}/${reminder.reminder_type}`)
}
