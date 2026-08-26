import { supabase as getSupabase } from "@/lib/db/client"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { HackathonPhase, HackathonStatus } from "@/lib/db/hackathon-types"
import type { Challenge } from "@/lib/services/challenges"
import { listChallenges } from "@/lib/services/challenges"

export interface PollAnnouncement {
  id: string
  title: string
  body: string
  priority: "normal" | "urgent"
  audience: "everyone"
  published_at: string
}

export interface PollScheduleItem {
  id: string
  title: string
  description: string | null
  starts_at: string
  ends_at: string | null
  location: string | null
}

export interface PollResponse {
  ts: number
  phase: HackathonPhase | null
  status: HackathonStatus
  timers: {
    global?: { endsAt: string; label: string }
    rooms: { id: string; name: string; endsAt: string | null; label: string | null }[]
  }
  challenge: {
    released: boolean
    releasedAt: string | null
    challenges: Challenge[]
  } | null
  stats: {
    submissionCount: number
    teamCount: number
    judgingComplete: number
    judgingTotal: number
    mentorQueueOpen: number
  }
  announcements: PollAnnouncement[]
  scheduleItems: PollScheduleItem[]
}

export async function buildPollPayload(hackathonId: string): Promise<PollResponse | null> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: hackathon, error: hErr } = await client
    .from("hackathons")
    .select("status, phase, starts_at, ends_at, challenge_released_at")
    .eq("id", hackathonId)
    .single()

  if (hErr || !hackathon) return null

  const challenges = hackathon.challenge_released_at
    ? await listChallenges(hackathonId)
    : []

  const { count: submissionCount } = await client
    .from("submissions")
    .select("id", { count: "exact", head: true })
    .eq("hackathon_id", hackathonId)
    .eq("status", "submitted")

  const { count: teamCount } = await client
    .from("teams")
    .select("id", { count: "exact", head: true })
    .eq("hackathon_id", hackathonId)
    .neq("status", "disbanded")

  const { count: judgingTotal } = await client
    .from("judge_assignments")
    .select("id", { count: "exact", head: true })
    .eq("hackathon_id", hackathonId)

  const { count: judgingComplete } = await client
    .from("judge_assignments")
    .select("id", { count: "exact", head: true })
    .eq("hackathon_id", hackathonId)
    .eq("is_complete", true)

  let mentorQueueOpen = 0
  const { count: mentorCount } = await client
    .from("mentor_requests")
    .select("id", { count: "exact", head: true })
    .eq("hackathon_id", hackathonId)
    .eq("status", "open")
  if (mentorCount !== null) mentorQueueOpen = mentorCount

  const [{ data: rooms }, { data: announcements }, { data: scheduleRows }] = await Promise.all([
    client
      .from("rooms")
      .select("id, name, timer_ends_at, timer_label")
      .eq("hackathon_id", hackathonId)
      .order("display_order"),
    client
      .from("hackathon_announcements")
      .select("id, title, body, priority, audience, published_at")
      .eq("hackathon_id", hackathonId)
      .eq("audience", "everyone")
      .not("published_at", "is", null)
      .lte("published_at", new Date().toISOString())
      .order("published_at", { ascending: false })
      .limit(10),
    client
      .from("hackathon_schedule_items")
      .select("id, title, description, starts_at, ends_at, location")
      .eq("hackathon_id", hackathonId)
      .order("starts_at")
      .order("sort_order"),
  ])

  let globalTimer: { endsAt: string; label: string } | undefined
  if (hackathon.ends_at && hackathon.status === "active") {
    globalTimer = { endsAt: hackathon.ends_at, label: "Build ends" }
  }

  return {
    ts: Date.now(),
    phase: hackathon.phase,
    status: hackathon.status,
    timers: {
      global: globalTimer,
      rooms: (rooms ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        endsAt: r.timer_ends_at,
        label: r.timer_label,
      })),
    },
    challenge: {
      released: !!hackathon.challenge_released_at,
      releasedAt: hackathon.challenge_released_at,
      challenges,
    },
    stats: {
      submissionCount: submissionCount ?? 0,
      teamCount: teamCount ?? 0,
      judgingComplete: judgingComplete ?? 0,
      judgingTotal: judgingTotal ?? 0,
      mentorQueueOpen,
    },
    announcements: (announcements ?? []).filter(
      (announcement): announcement is PollAnnouncement =>
        announcement.audience === "everyone",
    ),
    scheduleItems: (scheduleRows ?? []) as PollScheduleItem[],
  }
}
