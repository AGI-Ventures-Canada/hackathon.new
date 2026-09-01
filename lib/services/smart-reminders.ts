import { supabase as getSupabase } from "@/lib/db/client"
import { getNotificationDisposition } from "@/lib/utils/notification-lifecycle"
import { canInviteTeamMembers, hasRegistrationOpened } from "@/lib/utils/team-invite"
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
  | "judge_event_starting"
  | "judge_scoring_starting"
  | "organizer_event_readiness"
  | "organizer_judging_readiness"

export type DesiredReminder = {
  hackathonId: string
  reminderType: ReminderType
  scheduledFor: Date
  urgency: Urgency
  metadata: Record<string, unknown>
}

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const MIN_GAP = 4 * HOUR

export function computeReminderSchedule(
  createdAt: Date,
  deadline: Date,
  now: Date = new Date(),
): ReminderScheduleEntry[] {
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
  metadata: Record<string, unknown>,
  now: Date = new Date(),
): Promise<number> {
  const schedule = computeReminderSchedule(createdAt, deadline, now)
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
    cancelled_at: null,
    fail_count: 0,
    last_error: null,
  }))

  const { data, error } = await client
    .from("scheduled_reminders")
    .upsert(rows, {
      onConflict: "entity_type,entity_id,reminder_type,scheduled_for",
      ignoreDuplicates: false,
    })
    .select("id")

  if (error) {
    throw new Error(`Failed to schedule reminders: ${error.message}`)
  }

  return data?.length ?? 0
}

type ExistingReminderState = {
  id: string
  reminder_type: ReminderType
  scheduled_for: string
  sent_at: string | null
  cancelled_at: string | null
  fail_count: number
  last_error: string | null
}

function reminderIdentity(reminderType: ReminderType, scheduledFor: string | Date): string {
  const parsed = scheduledFor instanceof Date ? scheduledFor : new Date(scheduledFor)
  const normalized = Number.isFinite(parsed.getTime())
    ? parsed.toISOString()
    : String(scheduledFor)
  return `${reminderType}:${normalized}`
}

export async function reconcileRemindersForEntity(
  entityType: EntityType,
  entityId: string,
  desired: DesiredReminder[],
  now: Date = new Date(),
): Promise<number> {
  const client = getSupabase() as unknown as SupabaseClient
  const desiredByIdentity = new Map(
    desired.map((reminder) => [
      reminderIdentity(reminder.reminderType, reminder.scheduledFor),
      reminder,
    ]),
  )

  const { data: existingRows, error: existingError } = await client
    .from("scheduled_reminders")
    .select("id, reminder_type, scheduled_for, sent_at, cancelled_at, fail_count, last_error")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)

  if (existingError) {
    throw new Error(`Failed to load reminders: ${existingError.message}`)
  }

  const existing = (existingRows ?? []) as ExistingReminderState[]
  const sentIdentities = new Set(
    existing
      .filter((reminder) => reminder.sent_at !== null)
      .map((reminder) =>
        reminderIdentity(reminder.reminder_type, reminder.scheduled_for),
      ),
  )
  const existingByIdentity = new Map(
    existing.map((reminder) => [
      reminderIdentity(reminder.reminder_type, reminder.scheduled_for),
      reminder,
    ]),
  )
  const rowsToActivate = [...desiredByIdentity.entries()]
    .filter(([identity]) => {
      if (sentIdentities.has(identity)) return false
      const current = existingByIdentity.get(identity)
      return !current || current.cancelled_at !== null
    })
    .map(([, reminder]) => ({
      entity_type: entityType,
      entity_id: entityId,
      hackathon_id: reminder.hackathonId,
      reminder_type: reminder.reminderType,
      scheduled_for: reminder.scheduledFor.toISOString(),
      urgency: reminder.urgency,
      metadata: reminder.metadata,
      cancelled_at: null,
      fail_count: 0,
      last_error: null,
    }))

  let activated = 0
  if (rowsToActivate.length > 0) {
    const { data, error } = await client
      .from("scheduled_reminders")
      .upsert(rowsToActivate, {
        onConflict: "entity_type,entity_id,reminder_type,scheduled_for",
        ignoreDuplicates: false,
      })
      .select("id")

    if (error) {
      throw new Error(`Failed to reconcile reminders: ${error.message}`)
    }
    activated = data?.length ?? 0
  }

  const obsoleteIds = existing
    .filter(
      (reminder) =>
        reminder.sent_at === null &&
        reminder.cancelled_at === null &&
        !desiredByIdentity.has(
          reminderIdentity(reminder.reminder_type, reminder.scheduled_for),
        ),
    )
    .map((reminder) => reminder.id)

  if (obsoleteIds.length > 0) {
    const { error } = await client
      .from("scheduled_reminders")
      .update({ cancelled_at: now.toISOString() })
      .in("id", obsoleteIds)
      .is("sent_at", null)

    if (error) {
      throw new Error(`Failed to cancel old reminders: ${error.message}`)
    }
  }

  return activated
}

export async function cancelRemindersForEntity(
  entityType: EntityType,
  entityId: string,
  now: Date = new Date(),
): Promise<number> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data, error } = await client
    .from("scheduled_reminders")
    .update({ cancelled_at: now.toISOString() })
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
  withinMs: number = 6 * HOUR,
  now: Date = new Date(),
): Promise<number> {
  const client = getSupabase() as unknown as SupabaseClient
  const cutoff = new Date(now.getTime() + withinMs).toISOString()

  const { data, error } = await client
    .from("scheduled_reminders")
    .update({ cancelled_at: now.toISOString() })
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
    .select("status, starts_at, ends_at, registration_opens_at, registration_closes_at, allow_late_registration, max_team_size, is_test_event")
    .eq("id", reminder.hackathon_id)
    .single()
  if (hackathonError) {
    throw new Error(`Failed to validate reminder event: ${hackathonError.message}`)
  }
  if (!hackathon) return false
  if (hackathon.is_test_event) return false
  const disposition = getNotificationDisposition({
    status: hackathon.status,
    starts_at: hackathon.starts_at ?? null,
    ends_at: hackathon.ends_at ?? null,
    is_test_event: hackathon.is_test_event,
  })
  if (disposition !== "send") return false

  if (reminder.entity_type === "team_invitation") {
    const { data, error } = await client
      .from("team_invitations")
      .select("status, expires_at, hackathon_id, team_id, teams!inner(status, hackathon_id)")
      .eq("id", reminder.entity_id)
      .single()

    if (error) throw new Error(`Failed to validate team invitation reminder: ${error.message}`)
    if (!data) return false
    if (data.hackathon_id !== reminder.hackathon_id) return false
    if (data.status !== "pending") return false
    if (new Date(data.expires_at) < new Date()) return false
    const team = data.teams as unknown as { status: string; hackathon_id: string } | null
    if (team?.hackathon_id !== reminder.hackathon_id) return false
    if (!team || !["forming", "pending_approval"].includes(team.status)) return false
    if (!hasRegistrationOpened(hackathon.registration_opens_at, new Date().toISOString())) {
      return false
    }
    if (!canInviteTeamMembers({
      isFormingCaptain: true,
      hackathonStatus: hackathon.status,
      startsAt: hackathon.starts_at,
      endsAt: hackathon.ends_at,
      registrationClosesAt: hackathon.registration_closes_at,
      allowLateRegistration: hackathon.allow_late_registration,
      nowIso: new Date().toISOString(),
    })) return false
    if (hackathon.max_team_size !== null && hackathon.max_team_size !== undefined) {
      const { count, error: countError } = await client
        .from("hackathon_participants")
        .select("id", { count: "exact", head: true })
        .eq("team_id", data.team_id)
        .eq("role", "participant")
      if (countError) {
        throw new Error(`Failed to validate team capacity: ${countError.message}`)
      }
      if ((count ?? 0) >= hackathon.max_team_size) return false
    }
    return true
  }

  if (reminder.entity_type === "judge_invitation") {
    const { data, error } = await client
      .from("judge_invitations")
      .select("status, expires_at, accepted_by_clerk_user_id")
      .eq("id", reminder.entity_id)
      .single()

    if (error) throw new Error(`Failed to validate judge invitation reminder: ${error.message}`)
    if (!data) return false
    if (reminder.reminder_type === "invitation_reminder") {
      if (data.status !== "pending") return false
      if (new Date(data.expires_at) < new Date()) return false
      return true
    }
    if (
      reminder.reminder_type !== "judge_event_starting" &&
      reminder.reminder_type !== "judge_scoring_starting"
    ) return false
    if (data.status !== "accepted") return false
    if (
      typeof reminder.metadata.recipientClerkUserId !== "string" ||
      data.accepted_by_clerk_user_id !== reminder.metadata.recipientClerkUserId
    ) return false
  }

  if (
    reminder.entity_type === "hackathon_event" ||
    (
      reminder.entity_type === "judge_invitation" &&
      (
        reminder.reminder_type === "judge_event_starting" ||
        reminder.reminder_type === "judge_scoring_starting"
      )
    )
  ) {
    if (
      reminder.entity_type === "hackathon_event" &&
      reminder.entity_id !== reminder.hackathon_id
    ) return false
    if (
      reminder.entity_type === "judge_invitation" &&
      reminder.entity_id === reminder.hackathon_id
    ) return false
    const scheduledDeadline = reminder.metadata.deadlineDate
    if (typeof scheduledDeadline !== "string") return false

    let currentDeadline: string | null = null
    if (reminder.reminder_type === "registration_closing") {
      currentDeadline = hackathon.registration_closes_at ?? null
    } else if (
      reminder.reminder_type === "event_starting" ||
      reminder.reminder_type === "judge_event_starting" ||
      reminder.reminder_type === "organizer_event_readiness"
    ) {
      currentDeadline = hackathon.starts_at ?? null
    } else if (
      reminder.reminder_type === "submission_due" ||
      reminder.reminder_type === "judge_scoring_starting" ||
      reminder.reminder_type === "organizer_judging_readiness"
    ) {
      const { data: deadline, error: deadlineError } = await client
        .from("hackathon_schedule_items")
        .select("starts_at")
        .eq("hackathon_id", reminder.hackathon_id)
        .eq("trigger_type", "submission_deadline")
        .maybeSingle()
      if (deadlineError) {
        throw new Error(`Failed to validate project deadline reminder: ${deadlineError.message}`)
      }
      currentDeadline = deadline?.starts_at ?? hackathon.ends_at ?? null
    }

    if (!currentDeadline) return false
    const currentDeadlineMs = new Date(currentDeadline).getTime()
    const scheduledDeadlineMs = new Date(scheduledDeadline).getTime()
    if (!Number.isFinite(currentDeadlineMs) || !Number.isFinite(scheduledDeadlineMs)) return false
    return currentDeadlineMs === scheduledDeadlineMs && currentDeadlineMs > Date.now()
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
      hackathonSlug:
        typeof meta.hackathonSlug === "string" ? meta.hackathonSlug : undefined,
      hackathonStartsAt:
        typeof meta.hackathonStartsAt === "string"
          ? meta.hackathonStartsAt
          : undefined,
      hackathonEndsAt:
        typeof meta.hackathonEndsAt === "string"
          ? meta.hackathonEndsAt
          : undefined,
      hackathonTimezone:
        typeof meta.hackathonTimezone === "string"
          ? meta.hackathonTimezone
          : undefined,
      urgency: reminder.urgency,
      deliveryId: reminder.id,
    })
    if (hasReminderDeliveryFailure(delivery)) {
      throw new Error("Judge invitation reminder email was not accepted")
    }
    return reminderDeliveryWasSent(delivery)
  }

  if (
    reminder.entity_type === "hackathon_event" &&
    (
      reminder.reminder_type === "organizer_event_readiness" ||
      reminder.reminder_type === "organizer_judging_readiness"
    )
  ) {
    requireMeta(meta, "hackathonName", "hackathonSlug", "deadlineDate")
    const { sendOrganizerReadinessReminder } = await import(
      "@/lib/email/organizer-notifications"
    )
    const delivery = await sendOrganizerReadinessReminder({
      hackathonId: reminder.hackathon_id,
      hackathonName: meta.hackathonName as string,
      hackathonSlug: meta.hackathonSlug as string,
      deadlineDate: meta.deadlineDate as string,
      reminderType: reminder.reminder_type,
      urgency: reminder.urgency,
      deliveryId: reminder.id,
      budget,
    })
    if (delivery.deferred) throw new DeliveryBudgetDeferredError()
    if (hasReminderDeliveryFailure(delivery)) {
      throw new Error("One or more organizer reminder emails were not accepted")
    }
    return reminderDeliveryWasSent(delivery)
  }

  if (
    reminder.entity_type === "hackathon_event" ||
    (
      reminder.entity_type === "judge_invitation" &&
      (
        reminder.reminder_type === "judge_event_starting" ||
        reminder.reminder_type === "judge_scoring_starting"
      )
    )
  ) {
    requireMeta(meta, "hackathonName", "hackathonSlug", "deadlineDate")
    const { sendPreEventReminderEmail } = await import(
      "@/lib/email/pre-event-reminders"
    )
    const delivery = await sendPreEventReminderEmail({
      hackathonId: reminder.hackathon_id,
      reminderType: reminder.reminder_type as
        | "registration_closing"
        | "event_starting"
        | "submission_due"
        | "judge_event_starting"
        | "judge_scoring_starting",
      hackathonName: meta.hackathonName as string,
      hackathonSlug: meta.hackathonSlug as string,
      deadlineDate: meta.deadlineDate as string,
      hackathonTimezone:
        typeof meta.hackathonTimezone === "string"
          ? meta.hackathonTimezone
          : undefined,
      urgency: reminder.urgency,
      deliveryId: reminder.id,
      recipientIds:
        typeof meta.recipientClerkUserId === "string"
          ? [meta.recipientClerkUserId]
          : undefined,
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
