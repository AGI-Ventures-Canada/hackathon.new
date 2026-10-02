import { supabase as getSupabase } from "@/lib/db/client"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  computeReminderSchedule,
  reconcileRemindersForEntity,
  type DesiredReminder,
  type ReminderType,
} from "./smart-reminders"

type DeadlineConfig = {
  dateField: "registration_closes_at" | "starts_at"
  reminderType: ReminderType
}

const DEADLINE_CONFIGS: DeadlineConfig[] = [
  { dateField: "registration_closes_at", reminderType: "registration_closing" },
  { dateField: "starts_at", reminderType: "event_starting" },
]

const HOUR = 60 * 60 * 1000
const JUDGE_REMINDER_WINDOWS = [
  { offsetMs: 24 * HOUR, urgency: "medium" as const, window: "24_hours" },
  { offsetMs: HOUR, urgency: "high" as const, window: "1_hour" },
]
const ORGANIZER_EVENT_WINDOWS = [
  { offsetMs: 7 * 24 * HOUR, urgency: "low" as const, window: "7_days" },
  { offsetMs: 24 * HOUR, urgency: "medium" as const, window: "24_hours" },
]
const ORGANIZER_JUDGING_WINDOWS = [
  { offsetMs: 24 * HOUR, urgency: "medium" as const, window: "24_hours" },
  { offsetMs: HOUR, urgency: "high" as const, window: "1_hour" },
]

function appendOrganizerReminders(
  desired: DesiredReminder[],
  input: {
    hackathonId: string
    hackathonName: string
    hackathonSlug: string
    reminderType: "organizer_event_readiness" | "organizer_judging_readiness"
    deadlineStr: string | null
    now: Date
  },
): void {
  if (!input.deadlineStr) return
  const deadline = new Date(input.deadlineStr)
  if (!Number.isFinite(deadline.getTime()) || deadline <= input.now) return
  const windows = input.reminderType === "organizer_event_readiness"
    ? ORGANIZER_EVENT_WINDOWS
    : ORGANIZER_JUDGING_WINDOWS
  const scheduled = windows.map((window) => ({
    ...window,
    scheduledFor: new Date(deadline.getTime() - window.offsetMs),
  }))
  const latestMissed = scheduled
    .filter((window) => window.scheduledFor <= input.now)
    .sort((left, right) => right.scheduledFor.getTime() - left.scheduledFor.getTime())[0]
  const selected = latestMissed
    ? [latestMissed, ...scheduled.filter((window) => window.scheduledFor > input.now)]
    : scheduled.filter((window) => window.scheduledFor > input.now)

  for (const window of selected) {
    desired.push({
      hackathonId: input.hackathonId,
      reminderType: input.reminderType,
      scheduledFor: window.scheduledFor,
      urgency: window.urgency,
      metadata: {
        hackathonName: input.hackathonName,
        hackathonSlug: input.hackathonSlug,
        deadlineDate: input.deadlineStr,
        reminderWindow: window.window,
      },
    })
  }
}

function appendJudgeReminders(
  desired: DesiredReminder[],
  input: {
    hackathonId: string
    hackathonName: string
    hackathonSlug: string
    hackathonTimezone: string
    reminderType: "judge_event_starting" | "judge_scoring_starting"
    deadlineStr: string | null
    now: Date
    recipientClerkUserId?: string
    catchUpOnly?: boolean
  },
): void {
  if (!input.deadlineStr) return
  const deadline = new Date(input.deadlineStr)
  if (!Number.isFinite(deadline.getTime())) return

  if (deadline <= input.now) return

  const scheduledWindows = JUDGE_REMINDER_WINDOWS.map((window) => ({
    ...window,
    scheduledFor: new Date(deadline.getTime() - window.offsetMs),
  }))
  const futureWindows = scheduledWindows.filter(
    (window) => window.scheduledFor > input.now,
  )
  const latestMissedWindow = scheduledWindows
    .filter((window) => window.scheduledFor <= input.now)
    .sort((a, b) => b.scheduledFor.getTime() - a.scheduledFor.getTime())[0]
  const windowsToSchedule = input.catchUpOnly
    ? latestMissedWindow ? [latestMissedWindow] : []
    : latestMissedWindow
      ? [latestMissedWindow, ...futureWindows]
      : futureWindows

  for (const window of windowsToSchedule) {
    desired.push({
      hackathonId: input.hackathonId,
      reminderType: input.reminderType,
      scheduledFor: window.scheduledFor,
      urgency: window.urgency,
      metadata: {
        hackathonName: input.hackathonName,
        hackathonSlug: input.hackathonSlug,
        hackathonTimezone: input.hackathonTimezone,
        deadlineDate: input.deadlineStr,
        reminderWindow: window.window,
        ...(input.recipientClerkUserId
          ? { recipientClerkUserId: input.recipientClerkUserId }
          : {}),
      },
    })
  }
}

export async function scheduleAcceptedJudgeReminders(input: {
  invitationId: string
  hackathonId: string
  hackathonName: string
  hackathonSlug: string
  startsAt: string | null
  endsAt: string | null
  recipientClerkUserId: string
  isTestEvent?: boolean
  now?: Date
}): Promise<number> {
  const now = input.now ?? new Date()
  if (input.isTestEvent) {
    return reconcileRemindersForEntity(
      "judge_invitation",
      input.invitationId,
      [],
      now,
    )
  }

  const client = getSupabase() as unknown as SupabaseClient
  const { data: submissionDeadline, error } = await client
    .from("hackathon_schedule_items")
    .select("starts_at")
    .eq("hackathon_id", input.hackathonId)
    .eq("trigger_type", "submission_deadline")
    .order("starts_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) {
    throw new Error(`Failed to load the project deadline: ${error.message}`)
  }

  const desired: DesiredReminder[] = []
  const base = {
    hackathonId: input.hackathonId,
    hackathonName: input.hackathonName,
    hackathonSlug: input.hackathonSlug,
    hackathonTimezone: "UTC",
    recipientClerkUserId: input.recipientClerkUserId,
    now,
    catchUpOnly: true,
  }
  appendJudgeReminders(desired, {
    ...base,
    reminderType: "judge_event_starting",
    deadlineStr: input.startsAt,
  })
  appendJudgeReminders(desired, {
    ...base,
    reminderType: "judge_scoring_starting",
    deadlineStr: submissionDeadline?.starts_at ?? input.endsAt,
  })

  return reconcileRemindersForEntity(
    "judge_invitation",
    input.invitationId,
    desired,
    now,
  )
}

export async function schedulePreEventReminders(
  hackathonId: string,
  now: Date = new Date(),
): Promise<number> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: hackathon, error: hackathonError } = await client
    .from("hackathons")
    .select("id, name, slug, registration_closes_at, starts_at, ends_at, created_at, status, is_test_event, judging_opens_at, judging_closes_at")
    .eq("id", hackathonId)
    .single()

  if (hackathonError) {
    throw new Error(`Failed to load the event: ${hackathonError.message}`)
  }
  if (!hackathon) return 0
  if (hackathon.is_test_event) {
    return reconcileRemindersForEntity("hackathon_event", hackathonId, [], now)
  }
  const shouldSchedule = !(
    hackathon.status === "draft" ||
    hackathon.status === "judging" ||
    hackathon.status === "completed" ||
    hackathon.status === "archived"
  )
  if (!shouldSchedule) {
    return reconcileRemindersForEntity("hackathon_event", hackathonId, [], now)
  }

  const { data: submissionDeadline, error: submissionDeadlineError } = await client
    .from("hackathon_schedule_items")
    .select("starts_at")
    .eq("hackathon_id", hackathonId)
    .eq("trigger_type", "submission_deadline")
    .order("starts_at", { ascending: true })
    .limit(1)
    .maybeSingle()

  if (submissionDeadlineError) {
    throw new Error(`Failed to load the project deadline: ${submissionDeadlineError.message}`)
  }

  const submissionDeadlineStr = submissionDeadline?.starts_at ?? hackathon.ends_at
  const deadlineConfigs = [
    ...DEADLINE_CONFIGS.map((config) => ({
      reminderType: config.reminderType,
      deadlineStr: hackathon[config.dateField] as string | null,
    })),
    {
      reminderType: "submission_due" as const,
      deadlineStr: submissionDeadlineStr,
    },
  ]

  const createdAt = new Date(hackathon.created_at as string)
  if (!Number.isFinite(createdAt.getTime())) {
    throw new Error("The event creation date is invalid")
  }

  const desired: DesiredReminder[] = []
  for (const config of deadlineConfigs) {
    const deadlineStr = config.deadlineStr
    if (!deadlineStr) continue

    const deadline = new Date(deadlineStr)
    if (!Number.isFinite(deadline.getTime())) continue
    if (deadline <= now) continue

    for (const entry of computeReminderSchedule(createdAt, deadline, now)) {
      desired.push({
        hackathonId,
        reminderType: config.reminderType,
        scheduledFor: entry.scheduledFor,
        urgency: entry.urgency,
        metadata: {
          hackathonName: hackathon.name as string,
          hackathonSlug: hackathon.slug as string,
          deadlineDate: deadlineStr,
        },
      })
    }
  }

  const judgeReminderBase = {
    hackathonId,
    hackathonName: hackathon.name as string,
    hackathonSlug: hackathon.slug as string,
    hackathonTimezone: "UTC",
    now,
  }
  if (!hackathon.judging_opens_at) appendJudgeReminders(desired, {
    ...judgeReminderBase,
    reminderType: "judge_event_starting",
    deadlineStr: hackathon.starts_at as string | null,
  })
  if (!hackathon.judging_opens_at) appendJudgeReminders(desired, {
    ...judgeReminderBase,
    reminderType: "judge_scoring_starting",
    deadlineStr: submissionDeadlineStr as string | null,
  })
  appendOrganizerReminders(desired, {
    hackathonId,
    hackathonName: hackathon.name as string,
    hackathonSlug: hackathon.slug as string,
    reminderType: "organizer_event_readiness",
    deadlineStr: hackathon.starts_at as string | null,
    now,
  })
  if (!hackathon.judging_opens_at) appendOrganizerReminders(desired, {
    hackathonId,
    hackathonName: hackathon.name as string,
    hackathonSlug: hackathon.slug as string,
    reminderType: "organizer_judging_readiness",
    deadlineStr: submissionDeadlineStr as string | null,
    now,
  })

  return reconcileRemindersForEntity(
    "hackathon_event",
    hackathonId,
    desired,
    now,
  )
}

export async function reschedulePreEventReminders(
  hackathonId: string,
  now: Date = new Date(),
): Promise<number> {
  return schedulePreEventReminders(hackathonId, now)
}
