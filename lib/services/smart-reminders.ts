import { supabase as getSupabase } from "@/lib/db/client"
import { getNotificationDisposition } from "@/lib/utils/notification-lifecycle"
import type { SupabaseClient } from "@supabase/supabase-js"
import { withDeliveryLease } from "@/lib/services/delivery-lease"
import {
  consumeDeliverySlot,
  hasDeliveryCapacity,
  type DeliveryBudget,
} from "@/lib/services/delivery-budget"

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
    .upsert(rows, {
      onConflict: "entity_type,entity_id,scheduled_for",
      ignoreDuplicates: true,
    })
    .select("id")

  if (error) {
    throw new Error(`Failed to schedule reminders: ${error.message}`)
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
    throw new Error(`Failed to cancel reminders: ${error.message}`)
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
    throw new Error(`Failed to cancel upcoming reminder: ${error.message}`)
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

class DeliveryBudgetDeferredError extends Error {}

export async function processPendingReminders(
  limit: number = 50,
  dependencies: {
    validate?: (reminder: ScheduledReminder) => Promise<boolean>
    dispatch?: (reminder: ScheduledReminder, budget?: DeliveryBudget) => Promise<boolean>
  } = {},
  budget?: DeliveryBudget,
): Promise<ProcessResult> {
  const claimed = await withDeliveryLease(
    "scheduled-reminders",
    () => processPendingRemindersUnlocked(limit, dependencies, budget),
  )
  return claimed.acquired
    ? claimed.value
    : { processed: 0, sent: 0, skipped: 0, errors: 0 }
}

async function processPendingRemindersUnlocked(
  limit: number,
  dependencies: {
    validate?: (reminder: ScheduledReminder) => Promise<boolean>
    dispatch?: (reminder: ScheduledReminder, budget?: DeliveryBudget) => Promise<boolean>
  },
  budget?: DeliveryBudget,
): Promise<ProcessResult> {
  const client = getSupabase() as unknown as SupabaseClient
  const now = new Date().toISOString()

  const { data: reminders, error } = await client
    .from("scheduled_reminders")
    .select("*")
    .lte("scheduled_for", now)
    .is("sent_at", null)
    .is("cancelled_at", null)
    .lt("fail_count", MAX_RETRIES)
    .order("scheduled_for")
    .limit(limit)

  if (error) {
    throw new Error(`Failed to load pending reminders: ${error.message}`)
  }

  const pending = (reminders ?? []) as ScheduledReminder[]
  const result: ProcessResult = { processed: 0, sent: 0, skipped: 0, errors: 0 }

  for (const reminder of pending) {
    if (!hasDeliveryCapacity(budget)) break
    result.processed++
    let deliveryAccepted = false
    try {
      const shouldSend = await (dependencies.validate ?? validateReminderEntity)(reminder)
      if (!shouldSend) {
        await markReminderSkipped(client, reminder.id)
        result.skipped++
        continue
      }

      const delivered = await (dependencies.dispatch ?? dispatchReminderEmail)(reminder, budget)
      if (delivered) {
        deliveryAccepted = true
        await markScheduledReminderSent(client, reminder.id)
        result.sent++
      } else {
        await markReminderSkipped(client, reminder.id)
        result.skipped++
      }
    } catch (err) {
      if (err instanceof DeliveryBudgetDeferredError) break
      const message = err instanceof Error ? err.message : String(err)
      console.error(
        `Failed to process reminder ${reminder.id} (entity=${reminder.entity_type}, entity_id=${reminder.entity_id}, hackathon=${reminder.hackathon_id}):`,
        err
      )
      await recordReminderFailure(client, reminder, message, !deliveryAccepted)
      result.errors++
    }
  }

  return result
}

async function markScheduledReminderSent(
  client: SupabaseClient,
  reminderId: string,
): Promise<void> {
  const { error } = await client
    .from("scheduled_reminders")
    .update({
      sent_at: new Date().toISOString(),
      last_error: null,
    })
    .eq("id", reminderId)
    .is("sent_at", null)
    .is("cancelled_at", null)

  if (error) {
    throw new Error(`Failed to mark reminder sent: ${error.message}`)
  }
}

async function recordReminderFailure(
  client: SupabaseClient,
  reminder: ScheduledReminder,
  message: string,
  incrementAttempt: boolean,
): Promise<void> {
  const { error } = await client
    .from("scheduled_reminders")
    .update({
      ...(incrementAttempt ? { fail_count: reminder.fail_count + 1 } : {}),
      last_error: message,
    })
    .eq("id", reminder.id)
    .is("sent_at", null)
    .is("cancelled_at", null)

  if (error) {
    throw new Error(`Failed to record reminder failure: ${error.message}`)
  }
}

async function markReminderSkipped(
  client: SupabaseClient,
  reminderId: string,
): Promise<void> {
  const { error } = await client
    .from("scheduled_reminders")
    .update({
      cancelled_at: new Date().toISOString(),
      last_error: null,
    })
    .eq("id", reminderId)
    .is("sent_at", null)
    .is("cancelled_at", null)

  if (error) {
    throw new Error(`Failed to cancel skipped reminder: ${error.message}`)
  }
}

export async function validateReminderEntity(
  reminder: ScheduledReminder
): Promise<boolean> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: hackathon, error: hackathonError } = await client
    .from("hackathons")
    .select("status, starts_at, ends_at")
    .eq("id", reminder.hackathon_id)
    .single()
  if (hackathonError) {
    throw new Error(`Failed to validate reminder event: ${hackathonError.message}`)
  }
  if (!hackathon) return false
  const disposition = getNotificationDisposition({
    status: hackathon.status,
    starts_at: hackathon.starts_at ?? null,
    ends_at: hackathon.ends_at ?? null,
  })
  if (disposition !== "send") return false

  if (reminder.entity_type === "team_invitation") {
    const { data, error } = await client
      .from("team_invitations")
      .select("status, expires_at")
      .eq("id", reminder.entity_id)
      .single()

    if (error) throw new Error(`Failed to validate team invitation reminder: ${error.message}`)
    if (!data) return false
    if (data.status !== "pending") return false
    if (new Date(data.expires_at) < new Date()) return false
    return true
  }

  if (reminder.entity_type === "judge_invitation") {
    const { data, error } = await client
      .from("judge_invitations")
      .select("status, expires_at")
      .eq("id", reminder.entity_id)
      .single()

    if (error) throw new Error(`Failed to validate judge invitation reminder: ${error.message}`)
    if (!data) return false
    if (data.status !== "pending") return false
    if (new Date(data.expires_at) < new Date()) return false
    return true
  }

  if (reminder.entity_type === "hackathon_event") {
    return reminder.entity_id === reminder.hackathon_id
  }

  return false
}

function requireMeta(meta: Record<string, unknown>, ...keys: string[]): void {
  const missing = keys.filter((k) => meta[k] == null || meta[k] === "")
  if (missing.length > 0) {
    throw new Error(`Missing required metadata fields: ${missing.join(", ")}`)
  }
}

export function hasReminderDeliveryFailure(
  delivery: { success: boolean } | { sent: number; failed: number },
): boolean {
  return "success" in delivery ? !delivery.success : delivery.failed > 0
}

export function reminderDeliveryWasSent(
  delivery: { success: boolean } | { sent: number; failed: number },
): boolean {
  return "success" in delivery
    ? delivery.success
    : delivery.sent > 0 && delivery.failed === 0
}

async function dispatchReminderEmail(
  reminder: ScheduledReminder,
  budget?: DeliveryBudget,
): Promise<boolean> {
  const meta = reminder.metadata

  if (
    reminder.entity_type === "team_invitation" &&
    reminder.reminder_type === "invitation_reminder"
  ) {
    if (!consumeDeliverySlot(budget)) throw new DeliveryBudgetDeferredError()
    requireMeta(meta, "email", "teamName", "hackathonName", "inviterName", "inviteToken", "expiresAt")
    const { sendTeamInvitationReminderEmail } = await import(
      "@/lib/email/team-invitations"
    )
    const delivery = await sendTeamInvitationReminderEmail({
      to: meta.email as string,
      teamName: meta.teamName as string,
      hackathonName: meta.hackathonName as string,
      inviterName: meta.inviterName as string,
      inviterEmail: typeof meta.inviterEmail === "string" ? meta.inviterEmail : undefined,
      inviteToken: meta.inviteToken as string,
      expiresAt: meta.expiresAt as string,
      urgency: reminder.urgency,
      deliveryId: reminder.id,
    })
    if (hasReminderDeliveryFailure(delivery)) {
      throw new Error("Team invitation reminder email was not accepted")
    }
    return reminderDeliveryWasSent(delivery)
  }

  if (
    reminder.entity_type === "judge_invitation" &&
    reminder.reminder_type === "invitation_reminder"
  ) {
    if (!consumeDeliverySlot(budget)) throw new DeliveryBudgetDeferredError()
    requireMeta(meta, "email", "hackathonName", "inviterName", "inviteToken", "expiresAt")
    const { sendJudgeInvitationReminderEmail } = await import(
      "@/lib/email/judge-invitations"
    )
    const delivery = await sendJudgeInvitationReminderEmail({
      to: meta.email as string,
      hackathonName: meta.hackathonName as string,
      inviterName: meta.inviterName as string,
      inviteToken: meta.inviteToken as string,
      expiresAt: meta.expiresAt as string,
      urgency: reminder.urgency,
      deliveryId: reminder.id,
    })
    if (hasReminderDeliveryFailure(delivery)) {
      throw new Error("Judge invitation reminder email was not accepted")
    }
    return reminderDeliveryWasSent(delivery)
  }

  if (reminder.entity_type === "hackathon_event") {
    requireMeta(meta, "hackathonName", "hackathonSlug", "deadlineDate")
    const { sendPreEventReminderEmail } = await import(
      "@/lib/email/pre-event-reminders"
    )
    const delivery = await sendPreEventReminderEmail({
      hackathonId: reminder.hackathon_id,
      reminderType: reminder.reminder_type as "registration_closing" | "event_starting" | "submission_due",
      hackathonName: meta.hackathonName as string,
      hackathonSlug: meta.hackathonSlug as string,
      deadlineDate: meta.deadlineDate as string,
      urgency: reminder.urgency,
      deliveryId: reminder.id,
      budget,
    })
    if (delivery.deferred) throw new DeliveryBudgetDeferredError()
    if (hasReminderDeliveryFailure(delivery)) {
      throw new Error("One or more event reminder emails were not accepted")
    }
    return reminderDeliveryWasSent(delivery)
  }

  console.warn(`Unknown reminder dispatch: ${reminder.entity_type}/${reminder.reminder_type}`)
  return false
}
