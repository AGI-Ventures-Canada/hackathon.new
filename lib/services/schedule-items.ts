import { supabase as getSupabase } from "@/lib/db/client"
import type { SupabaseClient } from "@supabase/supabase-js"

export type ScheduleItem = {
  id: string
  hackathon_id: string
  title: string
  description: string | null
  starts_at: string
  ends_at: string | null
  location: string | null
  sort_order: number
  trigger_type: "challenge_release" | "submission_deadline" | null
  linked_to: "event_start" | "event_end" | null
  created_at: string
  updated_at: string
}

export type CreateScheduleItemInput = {
  title: string
  description?: string
  startsAt: string
  endsAt?: string
  location?: string
  sortOrder?: number
  triggerType?: "challenge_release" | "submission_deadline" | null
}

export type UpdateScheduleItemInput = {
  title?: string
  description?: string | null
  startsAt?: string
  endsAt?: string | null
  location?: string | null
  sortOrder?: number
  linkedTo?: "event_start" | "event_end" | null
}

export async function listScheduleItems(hackathonId: string): Promise<ScheduleItem[]> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data, error } = await client
    .from("hackathon_schedule_items")
    .select("*")
    .eq("hackathon_id", hackathonId)
    .order("starts_at")
    .order("sort_order")

  if (error || !data) {
    console.error("Failed to list schedule items:", error)
    return []
  }
  return data as unknown as ScheduleItem[]
}

export async function createScheduleItem(hackathonId: string, input: CreateScheduleItemInput): Promise<ScheduleItem | null> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data, error } = await client
    .from("hackathon_schedule_items")
    .insert({
      hackathon_id: hackathonId,
      title: input.title,
      description: input.description ?? null,
      starts_at: input.startsAt,
      ends_at: input.endsAt ?? null,
      location: input.location ?? null,
      sort_order: input.sortOrder ?? 0,
      trigger_type: input.triggerType ?? null,
    })
    .select()
    .single()

  if (error) {
    console.error("Failed to create schedule item:", error)
    return null
  }
  return data as ScheduleItem
}

export async function updateScheduleItem(itemId: string, hackathonId: string, input: UpdateScheduleItemInput): Promise<ScheduleItem | null> {
  const client = getSupabase() as unknown as SupabaseClient

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (input.title !== undefined) updates.title = input.title
  if (input.description !== undefined) updates.description = input.description
  if (input.startsAt !== undefined) updates.starts_at = input.startsAt
  if (input.endsAt !== undefined) updates.ends_at = input.endsAt
  if (input.location !== undefined) updates.location = input.location
  if (input.sortOrder !== undefined) updates.sort_order = input.sortOrder
  if (input.linkedTo !== undefined) updates.linked_to = input.linkedTo

  const { data, error } = await client
    .from("hackathon_schedule_items")
    .update(updates)
    .eq("id", itemId)
    .eq("hackathon_id", hackathonId)
    .select()
    .single()

  if (error) {
    console.error("Failed to update schedule item:", error)
    return null
  }
  return data as ScheduleItem
}

export async function deleteScheduleItem(itemId: string, hackathonId: string): Promise<boolean> {
  const client = getSupabase() as unknown as SupabaseClient
  const { error } = await client
    .from("hackathon_schedule_items")
    .delete()
    .eq("id", itemId)
    .eq("hackathon_id", hackathonId)

  if (error) {
    console.error("Failed to delete schedule item:", error)
    return false
  }
  return true
}

export async function getSubmissionDeadline(hackathonId: string): Promise<string | null> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data, error } = await client
    .from("hackathon_schedule_items")
    .select("starts_at")
    .eq("hackathon_id", hackathonId)
    .eq("trigger_type", "submission_deadline")
    .single()

  if (error || !data) return null
  return data.starts_at
}

export function buildDefaultAgendaItems(startsAt: string | null, endsAt: string | null): CreateScheduleItemInput[] {
  const now = new Date()
  const defaultStart = new Date(now)
  defaultStart.setDate(defaultStart.getDate() + 14)
  defaultStart.setHours(8, 30, 0, 0)
  const defaultEnd = new Date(defaultStart)
  defaultEnd.setDate(defaultEnd.getDate() + 1)
  defaultEnd.setHours(17, 0, 0, 0)

  const start = startsAt ? new Date(startsAt) : defaultStart
  const end = endsAt ? new Date(endsAt) : defaultEnd

  function offset(base: Date, minutes: number): string {
    return new Date(base.getTime() + minutes * 60_000).toISOString()
  }

  return [
    { title: "Opening Kickoff", startsAt: start.toISOString(), endsAt: offset(start, 30) },
    { title: "Challenge Release", startsAt: start.toISOString(), endsAt: start.toISOString(), triggerType: "challenge_release" },
    { title: "Hacking Begins", startsAt: offset(start, 30), endsAt: offset(start, 60) },
    { title: "Submissions Close", startsAt: offset(end, -60), endsAt: offset(end, -60), triggerType: "submission_deadline" },
    { title: "Presentations", startsAt: offset(end, -30), endsAt: end.toISOString() },
    { title: "Awards Ceremony", startsAt: end.toISOString(), endsAt: offset(end, 30) },
  ]
}

export async function getTriggerItem(
  hackathonId: string,
  triggerType: "challenge_release" | "submission_deadline"
): Promise<ScheduleItem | null> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data, error } = await client
    .from("hackathon_schedule_items")
    .select("*")
    .eq("hackathon_id", hackathonId)
    .eq("trigger_type", triggerType)
    .single()

  if (error || !data) return null
  return data as ScheduleItem
}
