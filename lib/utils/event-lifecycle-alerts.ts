import type { HackathonStatus } from "@/lib/db/hackathon-types"

export const EVENT_LIFECYCLE_ALERT_CODES = [
  "draft_dates_started",
  "draft_dates_ended",
  "event_should_be_live",
  "event_should_be_finished",
  "registration_dates_invalid",
  "location_check_in_required",
] as const

export type EventLifecycleAlertCode =
  (typeof EVENT_LIFECYCLE_ALERT_CODES)[number]

export type EventLifecycleAlert = {
  code: EventLifecycleAlertCode
  title: string
  message: string
  severity: "warning" | "error"
  action: "update_dates" | "update_location" | "start_event" | "finish_event"
}

type EventLifecycleAlertInput = {
  storedStatus: HackathonStatus
  startsAt: string | null
  endsAt: string | null
  registrationOpensAt?: string | null
  registrationClosesAt?: string | null
  requireLocationVerification?: boolean
  now?: string | Date
}

function time(value: string | Date | null | undefined): number | null {
  if (!value) return null
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : null
}

export function getEventLifecycleAlerts(
  input: EventLifecycleAlertInput,
): EventLifecycleAlert[] {
  const now = time(input.now ?? new Date()) ?? Date.now()
  const startsAt = time(input.startsAt)
  const endsAt = time(input.endsAt)
  const registrationOpensAt = time(input.registrationOpensAt)
  const registrationClosesAt = time(input.registrationClosesAt)
  const alerts: EventLifecycleAlert[] = []

  if (input.requireLocationVerification) {
    alerts.push({
      code: "location_check_in_required",
      title: "Online signup is off",
      message: "Location checks need organizer check-in. Turn this setting off to let people sign up online.",
      severity: "warning",
      action: "update_location",
    })
  }

  if (
    registrationOpensAt !== null &&
    registrationClosesAt !== null &&
    registrationOpensAt >= registrationClosesAt
  ) {
    alerts.push({
      code: "registration_dates_invalid",
      title: "Fix your signup dates",
      message: "Signup must open before it closes.",
      severity: "error",
      action: "update_dates",
    })
  }

  if (input.storedStatus === "draft") {
    if (endsAt !== null && endsAt <= now) {
      alerts.push({
        code: "draft_dates_ended",
        title: "Your event dates have passed",
        message:
          "Pick new dates before you publish. Saved invite emails won't send for an event that's already over.",
        severity: "error",
        action: "update_dates",
      })
    } else if (startsAt !== null && startsAt <= now) {
      alerts.push({
        code: "draft_dates_started",
        title: "Your event has already started",
        message:
          "Update the dates or publish now. Saved invite emails only send after the event goes live.",
        severity: "warning",
        action: "update_dates",
      })
    }
    return alerts
  }

  if (
    endsAt !== null &&
    endsAt <= now &&
    ["published", "registration_open", "active"].includes(input.storedStatus)
  ) {
    alerts.push({
      code: "event_should_be_finished",
      title: "This event has ended",
      message:
        "Finish the event or move its dates. Invite emails won't send after the end time.",
      severity: "error",
      action: "finish_event",
    })
  } else if (
    startsAt !== null &&
    startsAt <= now &&
    ["published", "registration_open"].includes(input.storedStatus)
  ) {
    alerts.push({
      code: "event_should_be_live",
      title: "This event should be live",
      message: "Start the event now or move its dates.",
      severity: "warning",
      action: "start_event",
    })
  }

  return alerts
}

export function canPublishEventDates(input: {
  startsAt: string | null
  endsAt: string | null
  now?: string | Date
}): boolean {
  const startsAt = time(input.startsAt)
  const endsAt = time(input.endsAt)
  const now = time(input.now ?? new Date()) ?? Date.now()
  return (
    startsAt !== null &&
    endsAt !== null &&
    startsAt < endsAt &&
    endsAt > now
  )
}
