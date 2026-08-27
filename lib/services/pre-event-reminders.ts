import { supabase as getSupabase } from "@/lib/db/client"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  scheduleReminders,
  cancelRemindersForEntity,
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

export async function schedulePreEventReminders(
  hackathonId: string
): Promise<number> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: hackathon, error: hackathonError } = await client
    .from("hackathons")
    .select("id, name, slug, registration_closes_at, starts_at, ends_at, created_at, status")
    .eq("id", hackathonId)
    .single()

  if (hackathonError) {
    throw new Error(`Failed to load the event: ${hackathonError.message}`)
  }
  if (!hackathon) return 0
  if (
    hackathon.status === "draft" ||
    hackathon.status === "completed" ||
    hackathon.status === "archived"
  ) {
    return 0
  }

  const now = new Date()
  let scheduled = 0

  const { data: submissionDeadline, error: submissionDeadlineError } = await client
    .from("hackathon_schedule_items")
    .select("starts_at")
    .eq("hackathon_id", hackathonId)
    .eq("trigger_type", "submission_deadline")
    .maybeSingle()

  if (submissionDeadlineError) {
    throw new Error(`Failed to load the project deadline: ${submissionDeadlineError.message}`)
  }

  const deadlineConfigs = [
    ...DEADLINE_CONFIGS.map((config) => ({
      reminderType: config.reminderType,
      deadlineStr: hackathon[config.dateField] as string | null,
    })),
    {
      reminderType: "submission_due" as const,
      deadlineStr: submissionDeadline?.starts_at ?? hackathon.ends_at,
    },
  ]

  for (const config of deadlineConfigs) {
    const deadlineStr = config.deadlineStr
    if (!deadlineStr) continue

    const deadline = new Date(deadlineStr)
    if (!Number.isFinite(deadline.getTime())) continue
    if (deadline <= now) continue

    const createdAt = new Date(hackathon.created_at as string)
    if (!Number.isFinite(createdAt.getTime())) {
      throw new Error("The event creation date is invalid")
    }

    const count = await scheduleReminders(
      "hackathon_event",
      hackathonId,
      hackathonId,
      config.reminderType,
      createdAt,
      deadline,
      {
        hackathonName: hackathon.name as string,
        hackathonSlug: hackathon.slug as string,
        deadlineDate: deadlineStr,
      }
    )

    scheduled += count
  }

  return scheduled
}

export async function reschedulePreEventReminders(
  hackathonId: string
): Promise<number> {
  await cancelRemindersForEntity("hackathon_event", hackathonId)
  return schedulePreEventReminders(hackathonId)
}
