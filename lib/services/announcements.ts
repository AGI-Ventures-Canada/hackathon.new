import { supabase as getSupabase } from "@/lib/db/client"
import type { SupabaseClient } from "@supabase/supabase-js"

export const ANNOUNCEMENT_AUDIENCES = ["everyone", "organizers", "judges", "mentors", "attendees", "submitted", "not_submitted"] as const
export type AnnouncementAudience = (typeof ANNOUNCEMENT_AUDIENCES)[number]

export type Announcement = {
  id: string
  hackathon_id: string
  title: string
  body: string
  priority: "normal" | "urgent"
  audience: AnnouncementAudience
  published_at: string | null
  created_at: string
  updated_at: string
}

export type CreateAnnouncementInput = {
  title: string
  body: string
  priority?: "normal" | "urgent"
  audience?: AnnouncementAudience
}

export type UpdateAnnouncementInput = {
  title?: string
  body?: string
  priority?: "normal" | "urgent"
  audience?: AnnouncementAudience
}

export type AnnouncementViewer = {
  role: "public" | "organizer" | "judge" | "mentor" | "participant"
  hasSubmitted?: boolean
}

export function filterAnnouncementsForViewer(
  announcements: Announcement[],
  viewer: AnnouncementViewer,
): Announcement[] {
  return announcements.filter((announcement) => {
    switch (announcement.audience) {
      case "everyone":
        return true
      case "organizers":
        return viewer.role === "organizer"
      case "judges":
        return viewer.role === "judge"
      case "mentors":
        return viewer.role === "mentor"
      case "attendees":
        return viewer.role === "participant"
      case "submitted":
        return viewer.role === "participant" && viewer.hasSubmitted === true
      case "not_submitted":
        return viewer.role === "participant" && viewer.hasSubmitted === false
      default:
        return false
    }
  })
}

export async function listAnnouncements(hackathonId: string): Promise<Announcement[]> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data, error } = await client
    .from("hackathon_announcements")
    .select("*")
    .eq("hackathon_id", hackathonId)
    .order("created_at", { ascending: false })

  if (error || !data) {
    console.error("Failed to list announcements:", error)
    return []
  }
  return data as unknown as Announcement[]
}

export async function listPublishedAnnouncements(hackathonId: string): Promise<Announcement[]> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data, error } = await client
    .from("hackathon_announcements")
    .select("*")
    .eq("hackathon_id", hackathonId)
    .not("published_at", "is", null)
    .lte("published_at", new Date().toISOString())
    .order("published_at", { ascending: false })

  if (error || !data) {
    console.error("Failed to list published announcements:", error)
    return []
  }
  return data as unknown as Announcement[]
}

export async function createAnnouncement(hackathonId: string, input: CreateAnnouncementInput): Promise<Announcement | null> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data, error } = await client
    .from("hackathon_announcements")
    .insert({
      hackathon_id: hackathonId,
      title: input.title,
      body: input.body,
      priority: input.priority ?? "normal",
      audience: input.audience ?? "everyone",
    })
    .select()
    .single()

  if (error) {
    console.error("Failed to create announcement:", error)
    return null
  }
  return data as Announcement
}

export async function updateAnnouncement(announcementId: string, hackathonId: string, input: UpdateAnnouncementInput): Promise<Announcement | null> {
  const client = getSupabase() as unknown as SupabaseClient

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (input.title !== undefined) updates.title = input.title
  if (input.body !== undefined) updates.body = input.body
  if (input.priority !== undefined) updates.priority = input.priority
  if (input.audience !== undefined) updates.audience = input.audience

  const { data, error } = await client
    .from("hackathon_announcements")
    .update(updates)
    .eq("id", announcementId)
    .eq("hackathon_id", hackathonId)
    .select()
    .single()

  if (error) {
    console.error("Failed to update announcement:", error)
    return null
  }
  return data as Announcement
}

export async function deleteAnnouncement(announcementId: string, hackathonId: string): Promise<boolean> {
  const client = getSupabase() as unknown as SupabaseClient
  const { error } = await client
    .from("hackathon_announcements")
    .delete()
    .eq("id", announcementId)
    .eq("hackathon_id", hackathonId)

  if (error) {
    console.error("Failed to delete announcement:", error)
    return false
  }
  return true
}

export async function publishAnnouncement(announcementId: string, hackathonId: string): Promise<Announcement | null> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data, error } = await client
    .from("hackathon_announcements")
    .update({ published_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", announcementId)
    .eq("hackathon_id", hackathonId)
    .select()
    .single()

  if (error) {
    console.error("Failed to publish announcement:", error)
    return null
  }
  return data as Announcement
}

export async function scheduleAnnouncement(announcementId: string, hackathonId: string, scheduledAt: string): Promise<Announcement | null> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data, error } = await client
    .from("hackathon_announcements")
    .update({ published_at: scheduledAt, updated_at: new Date().toISOString() })
    .eq("id", announcementId)
    .eq("hackathon_id", hackathonId)
    .select()
    .single()

  if (error) {
    console.error("Failed to schedule announcement:", error)
    return null
  }
  return data as Announcement
}

export async function unpublishAnnouncement(announcementId: string, hackathonId: string): Promise<Announcement | null> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data, error } = await client
    .from("hackathon_announcements")
    .update({ published_at: null, updated_at: new Date().toISOString() })
    .eq("id", announcementId)
    .eq("hackathon_id", hackathonId)
    .select()
    .single()

  if (error) {
    console.error("Failed to unpublish announcement:", error)
    return null
  }
  return data as Announcement
}
