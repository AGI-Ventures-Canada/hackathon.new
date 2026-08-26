import { supabase as getSupabase } from "@/lib/db/client"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  scheduleReminders,
  cancelRemindersForEntity,
  type ReminderType,
} from "./smart-reminders"

type DeadlineConfig = {
  dateField: "registration_closes_at" | "starts_at" | "ends_at"
  reminderType: ReminderType
}

const DEADLINE_CONFIGS: DeadlineConfig[] = [
  { dateField: "registration_closes_at", reminderType: "registration_closing" },
  { dateField: "starts_at", reminderType: "event_starting" },
  { dateField: "ends_at", reminderType: "submission_due" },
]

export async function schedulePreEventReminders(
  hackathonId: string
): Promise<number> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: hackathon } = await client
    .from("hackathons")
    .select("id, name, slug, registration_closes_at, starts_at, ends_at, created_at, status")
    .eq("id", hackathonId)
    .single()

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

  for (const config of DEADLINE_CONFIGS) {
    const deadlineStr = hackathon[config.dateField] as string | null
    if (!deadlineStr) continue

    const deadline = new Date(deadlineStr)
    if (deadline <= now) continue

    const createdAt = new Date(hackathon.created_at as string)

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
