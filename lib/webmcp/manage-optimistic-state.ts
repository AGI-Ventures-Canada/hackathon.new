import type { Prize } from "@/lib/db/hackathon-types"
import type { Announcement } from "@/lib/services/announcements"
import type { Challenge } from "@/lib/services/challenges"
import type { ScheduleItem } from "@/lib/services/schedule-items"

type ChangeBase = {
  mutationId: string
  href: string
  summary: string
}

export type ManageWebMcpOptimisticChange =
  | (ChangeBase & {
      kind: "details"
      patch: { name?: string; description?: string | null }
    })
  | (ChangeBase & {
      kind: "timeline"
      timeline: { startsAt: string; endsAt: string }
    })
  | (ChangeBase & {
      kind: "schedule"
      item: ScheduleItem
    })
  | (ChangeBase & {
      kind: "challenge"
      challenge: Challenge
    })
  | (ChangeBase & {
      kind: "prize"
      prize: Prize
    })
  | (ChangeBase & {
      kind: "announcement"
      announcement: Announcement
    })
  | (ChangeBase & {
      kind: "settings"
      patch: Record<string, unknown>
    })

type CommitBase = {
  mutationId: string
}

export type ManageWebMcpCommittedChange =
  | (CommitBase & {
      kind: "details"
      details: { name: string; description: string | null }
    })
  | (CommitBase & {
      kind: "timeline"
      timeline: { startsAt: string | null; endsAt: string | null }
    })
  | (CommitBase & {
      kind: "schedule"
      item: ScheduleItem
    })
  | (CommitBase & {
      kind: "challenge"
      challenge: Challenge
    })
  | (CommitBase & {
      kind: "prize"
      prize: Prize
    })
  | (CommitBase & {
      kind: "announcement"
      announcement: Announcement
    })
  | (CommitBase & {
      kind: "settings"
      patch: Record<string, unknown>
    })

export type ManageWebMcpVisibleState = {
  details: {
    name: string
    description: string | null
  }
  timeline: {
    startsAt: string | null
    endsAt: string | null
  }
  scheduleItems: ScheduleItem[]
  challenges: Challenge[]
  prizes: Prize[]
  announcements: Announcement[]
}

export type ManageWebMcpState = {
  base: ManageWebMcpVisibleState
  pending: ManageWebMcpOptimisticChange[]
}

export type ManageWebMcpStateAction =
  | { type: "begin"; change: ManageWebMcpOptimisticChange }
  | { type: "commit"; change: ManageWebMcpCommittedChange }
  | { type: "rollback"; mutationId: string }
  | {
      type: "sync_details"
      details: ManageWebMcpVisibleState["details"]
    }
  | {
      type: "sync_timeline"
      timeline: ManageWebMcpVisibleState["timeline"]
    }
  | { type: "sync_schedule"; scheduleItems: ScheduleItem[] }
  | { type: "sync_challenges"; challenges: Challenge[] }
  | { type: "sync_prizes"; prizes: Prize[] }
  | { type: "sync_announcements"; announcements: Announcement[] }

export function createManageWebMcpState(
  base: ManageWebMcpVisibleState,
): ManageWebMcpState {
  return { base, pending: [] }
}

function upsertById<T extends { id: string }>(
  items: T[],
  item: T,
  placement: "start" | "end",
): T[] {
  const index = items.findIndex((candidate) => candidate.id === item.id)
  if (index >= 0) {
    const next = [...items]
    next[index] = item
    return next
  }
  return placement === "start" ? [item, ...items] : [...items, item]
}

function applyOptimisticChange(
  state: ManageWebMcpVisibleState,
  change: ManageWebMcpOptimisticChange,
): ManageWebMcpVisibleState {
  switch (change.kind) {
    case "details":
      return {
        ...state,
        details: { ...state.details, ...change.patch },
      }
    case "timeline":
      return { ...state, timeline: change.timeline }
    case "schedule":
      return {
        ...state,
        scheduleItems: upsertById(state.scheduleItems, change.item, "end"),
      }
    case "challenge":
      return {
        ...state,
        challenges: upsertById(state.challenges, change.challenge, "end"),
      }
    case "prize":
      return {
        ...state,
        prizes: upsertById(state.prizes, change.prize, "end"),
      }
    case "announcement":
      return {
        ...state,
        announcements: upsertById(
          state.announcements,
          change.announcement,
          "start",
        ),
      }
    case "settings":
      return state
  }
}

function applyCommittedChange(
  state: ManageWebMcpVisibleState,
  change: ManageWebMcpCommittedChange,
): ManageWebMcpVisibleState {
  switch (change.kind) {
    case "details":
      return { ...state, details: change.details }
    case "timeline":
      return { ...state, timeline: change.timeline }
    case "schedule":
      return {
        ...state,
        scheduleItems: upsertById(state.scheduleItems, change.item, "end"),
      }
    case "challenge":
      return {
        ...state,
        challenges: upsertById(state.challenges, change.challenge, "end"),
      }
    case "prize":
      return {
        ...state,
        prizes: upsertById(state.prizes, change.prize, "end"),
      }
    case "announcement":
      return {
        ...state,
        announcements: upsertById(
          state.announcements,
          change.announcement,
          "start",
        ),
      }
    case "settings":
      return state
  }
}

function withoutPendingItem<T extends { id: string }>(
  items: T[],
  state: ManageWebMcpState,
  kind: "schedule" | "challenge" | "prize" | "announcement",
): T[] {
  const pendingIds = new Set(
    state.pending.flatMap((change) => {
      if (change.kind !== kind) return []
      switch (change.kind) {
        case "schedule":
          return change.item.id
        case "challenge":
          return change.challenge.id
        case "prize":
          return change.prize.id
        case "announcement":
          return change.announcement.id
      }
    }),
  )
  return pendingIds.size === 0
    ? items
    : items.filter((item) => !pendingIds.has(item.id))
}

export function manageWebMcpStateReducer(
  state: ManageWebMcpState,
  action: ManageWebMcpStateAction,
): ManageWebMcpState {
  switch (action.type) {
    case "begin":
      return state.pending.some(
        (change) => change.mutationId === action.change.mutationId,
      )
        ? state
        : { ...state, pending: [...state.pending, action.change] }
    case "commit": {
      const optimistic = state.pending.find(
        (change) => change.mutationId === action.change.mutationId,
      )
      if (!optimistic || optimistic.kind !== action.change.kind) return state
      const pending = state.pending.filter(
        (change) => change.mutationId !== action.change.mutationId,
      )
      return {
        base: applyCommittedChange(state.base, action.change),
        pending,
      }
    }
    case "rollback": {
      const pending = state.pending.filter(
        (change) => change.mutationId !== action.mutationId,
      )
      return pending.length === state.pending.length
        ? state
        : { ...state, pending }
    }
    case "sync_details":
      return { ...state, base: { ...state.base, details: action.details } }
    case "sync_timeline":
      return { ...state, base: { ...state.base, timeline: action.timeline } }
    case "sync_schedule":
      return {
        ...state,
        base: {
          ...state.base,
          scheduleItems: withoutPendingItem(
            action.scheduleItems,
            state,
            "schedule",
          ),
        },
      }
    case "sync_challenges":
      return {
        ...state,
        base: {
          ...state.base,
          challenges: withoutPendingItem(
            action.challenges,
            state,
            "challenge",
          ),
        },
      }
    case "sync_prizes":
      return {
        ...state,
        base: {
          ...state.base,
          prizes: withoutPendingItem(action.prizes, state, "prize"),
        },
      }
    case "sync_announcements":
      return {
        ...state,
        base: {
          ...state.base,
          announcements: withoutPendingItem(
            action.announcements,
            state,
            "announcement",
          ),
        },
      }
  }
}

export function selectManageWebMcpVisibleState(
  state: ManageWebMcpState,
): ManageWebMcpVisibleState {
  return state.pending.reduce(applyOptimisticChange, state.base)
}
