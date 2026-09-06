import type {
  CoreCriterion,
  JudgeInfo,
  JudgingSetupStatus,
  PrizeWithProgress,
  RoundInfo,
} from "@/lib/services/judging"

export type JudgingEditor =
  "prizes" | "scorecard" | "judges" | "schedule" | "assignments" | "notifications" | "rounds"
export type JudgingDestination = "overview" | "judges" | "settings" | "results"

export type JudgingSetupIssue = {
  code: string
  message: string
  editor: JudgingEditor
  prizeId?: string
  blocking?: boolean
}

export type JudgingSettings = {
  opensAt: string | null
  closesAt: string | null
  timezone: string
  instructions: string
  browseEnabled: boolean
  targetReviewsPerProject: number
  remindersEnabled: boolean
}

export type JudgingSetup = {
  id: string
  slug: string
  name: string
  version: string
  status: string
  resultsPublishedAt: string | null
  submissionDeadline: string | null
  settings: JudgingSettings
  prizes: PrizeWithProgress[]
  coreCriteria: CoreCriterion[]
  prizeCriteria: Array<{ prizeId: string; criteria: CoreCriterion[] }>
  rounds: RoundInfo[]
  rooms: Array<{ id: string; name: string }>
  judges: JudgeInfo[]
  invitations: Array<{
    id: string
    email: string
    status: string
    createdAt: string
    emailedAt: string | null
    remindedAt: string | null
    delivery: "sent" | "queued" | "failed" | "pending"
    deliveryError: string | null
    nextAttemptAt: string | null
    nextReminderAt: string | null
    canRemind: boolean
    canRetry: boolean
  }>
  progress: {
    totalAssignments: number
    completedAssignments: number
    judges: Array<{ participantId: string; displayName: string; completed: number; total: number }>
  }
  submissionCount: number
  readiness: Omit<JudgingSetupStatus, "issues"> & {
    issues: JudgingSetupIssue[]
    scoringLocked: boolean
  }
}

export function judgingInvitationState(
  invite: {
    emailed_at?: string | null
    reminded_at?: string | null
    expires_at: string
    delivery_fail_count?: number
    delivery_last_error?: string | null
    delivery_next_attempt_at?: string | null
    reminders_stopped_at?: string | null
  },
  queued: boolean,
  now: Date,
  allowed = true,
) {
  const lastNotice = Math.max(
    Date.parse(invite.emailed_at ?? "") || 0,
    Date.parse(invite.reminded_at ?? "") || 0,
  )
  const nextReminderAt = lastNotice ? new Date(lastNotice + 24 * 3_600_000).toISOString() : null
  const delivery = invite.emailed_at
    ? "sent"
    : invite.delivery_fail_count || invite.delivery_last_error
      ? "failed"
      : queued
        ? "queued"
        : "pending"
  return {
    delivery: delivery as "sent" | "queued" | "failed" | "pending",
    deliveryError: invite.delivery_last_error ?? null,
    nextAttemptAt: allowed ? invite.delivery_next_attempt_at ?? null : null,
    nextReminderAt: allowed && !queued && !invite.reminders_stopped_at && Date.parse(invite.expires_at) > now.getTime() ? nextReminderAt : null,
    canRetry: allowed && delivery === "failed",
    canRemind:
      allowed &&
      !queued &&
      delivery === "sent" &&
      !invite.reminders_stopped_at &&
      Date.parse(invite.expires_at) > now.getTime() &&
      (!nextReminderAt || Date.parse(nextReminderAt) <= now.getTime()),
  }
}

export type ConfigureJudgingInput = {
  expectedVersion: string
  requestKey: string
  settings?: Partial<JudgingSettings>
  applyStarter?: boolean
  starterPrizeName?: string
}

export const JUDGING_DESTINATIONS = [
  { id: "overview", label: "Overview", path: "" },
  { id: "judges", label: "Judges", path: "/judges" },
  { id: "settings", label: "Settings", path: "/settings" },
  { id: "results", label: "Results", path: "/results" },
] as const

export function judgingHref(
  slug: string,
  destination: JudgingDestination = "overview",
  editor?: JudgingEditor,
) {
  const path = JUDGING_DESTINATIONS.find((item) => item.id === destination)?.path ?? ""
  return `/e/${encodeURIComponent(slug)}/manage/judging${path}${editor ? `?edit=${editor}` : ""}`
}

export function legacyJudgingHref(slug: string, subtab?: string) {
  if (subtab === "judges") return judgingHref(slug, "judges")
  if (subtab === "results") return judgingHref(slug, "results")
  if (subtab === "prizes") return judgingHref(slug, "settings", "prizes")
  if (subtab === "rounds") return judgingHref(slug, "settings", "rounds")
  if (subtab === "assignments") return judgingHref(slug, "overview", "assignments")
  if (subtab === "setup") return judgingHref(slug, "settings")
  return judgingHref(slug)
}

export function suggestedJudgingWindow(submissionDeadline: string | null, now: Date) {
  const existing = submissionDeadline ? new Date(submissionDeadline) : null
  const opens =
    existing && Number.isFinite(existing.getTime()) && existing > now
      ? existing
      : new Date(Math.ceil((now.getTime() + 60 * 60_000) / 900_000) * 900_000)
  return {
    opensAt: opens.toISOString(),
    closesAt: new Date(opens.getTime() + 2 * 60 * 60_000).toISOString(),
  }
}
