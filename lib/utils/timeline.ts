import type { HackathonStatus } from "@/lib/db/hackathon-types"

export function getEffectiveStatus(hackathon: {
  status: HackathonStatus
  starts_at: string | null
  ends_at: string | null
}): HackathonStatus {
  return getEffectiveStatusAt(hackathon, new Date())
}

export function getEffectiveStatusAt(
  hackathon: {
    status: HackathonStatus
    starts_at: string | null
    ends_at: string | null
  },
  now: Date,
): HackathonStatus {
  const { status, starts_at, ends_at } = hackathon

  if (status === "draft" || status === "completed" || status === "archived") {
    return status
  }

  const startsAt = starts_at ? new Date(starts_at) : null
  const endsAt = ends_at ? new Date(ends_at) : null

  if (endsAt && now >= endsAt) {
    return status === "judging" ? "judging" : "completed"
  }

  if (startsAt && now >= startsAt) {
    return "active"
  }

  return status
}

export interface TimelineState {
  label: string
  variant: "default" | "secondary" | "outline"
  showCountdown?: boolean
  startsAt?: string
}

export interface TimelineInput {
  status: HackathonStatus
  registration_opens_at?: string | null
  registration_closes_at?: string | null
  starts_at?: string | null
  ends_at?: string | null
}

const persistedTimelineStates = {
  completed: { label: "Completed", variant: "outline" },
  judging: { label: "Judging", variant: "default" },
  active: { label: "Live", variant: "default" },
  draft: { label: "Draft", variant: "secondary" },
  archived: { label: "Archived", variant: "outline" },
  published: { label: "Published", variant: "secondary" },
  registration_open: { label: "Registration Open", variant: "default" },
} satisfies Record<HackathonStatus, TimelineState>

export function getPersistedTimelineState(status: HackathonStatus): TimelineState {
  return persistedTimelineStates[status]
}

export function getHydrationSafeTimelineState(
  hackathon: TimelineInput,
  isClient: boolean,
): TimelineState {
  return isClient
    ? getTimelineState(hackathon)
    : getPersistedTimelineState(hackathon.status)
}

export function getTimelineState(hackathon: TimelineInput): TimelineState {
  return getTimelineStateAt(hackathon, new Date())
}

export function getTimelineStateAt(
  hackathon: TimelineInput,
  now: Date,
): TimelineState {
  const {
    status,
    registration_opens_at,
    registration_closes_at,
    starts_at,
    ends_at,
  } = hackathon

  const effectiveStatus = getEffectiveStatusAt(
    {
      status,
      starts_at: starts_at ?? null,
      ends_at: ends_at ?? null,
    },
    now,
  )

  if (effectiveStatus === "completed") {
    return { label: "Completed", variant: "outline" }
  }

  if (status === "judging") {
    return { label: "Judging", variant: "default" }
  }

  if (status === "active") {
    return { label: "Live", variant: "default" }
  }

  if (status === "draft") {
    return { label: "Draft", variant: "secondary" }
  }

  if (status === "archived") {
    return { label: "Archived", variant: "outline" }
  }

  const opensAt = registration_opens_at ? new Date(registration_opens_at) : null
  const closesAt = registration_closes_at
    ? new Date(registration_closes_at)
    : null
  const startsAt = starts_at ? new Date(starts_at) : null
  const endsAt = ends_at ? new Date(ends_at) : null

  if (opensAt && closesAt) {
    if (now < opensAt) {
      return { label: "Coming Soon", variant: "secondary" }
    }
    if (now >= opensAt && now <= closesAt) {
      if (startsAt && now < startsAt) {
        return {
          label: "Registration Open",
          variant: "default",
          showCountdown: true,
          startsAt: starts_at!,
        }
      }
      return { label: "Registration Open", variant: "default" }
    }
    if (now > closesAt && startsAt && now < startsAt) {
      return {
        label: "Registration Closed",
        variant: "secondary",
        showCountdown: true,
        startsAt: starts_at!,
      }
    }
    if (startsAt && endsAt && now >= startsAt && now <= endsAt) {
      return { label: "Live", variant: "default" }
    }
    if (endsAt && now > endsAt) {
      return { label: "Completed", variant: "outline" }
    }
  }

  if (status === "registration_open" || status === "published") {
    if (startsAt && now < startsAt) {
      return {
        label: "Registration Open",
        variant: "default",
        showCountdown: true,
        startsAt: starts_at!,
      }
    }
    return { label: "Registration Open", variant: "default" }
  }

  return { label: "Coming Soon", variant: "secondary" }
}

export interface TimelineDates {
  startsAt?: string | Date | null
  endsAt?: string | Date | null
}

export function validateTimelineDates(dates: TimelineDates): string | null {
  const starts = dates.startsAt ? new Date(dates.startsAt) : null
  const ends = dates.endsAt ? new Date(dates.endsAt) : null

  if (starts && ends && starts >= ends) {
    return "Event must start before it ends"
  }

  return null
}
