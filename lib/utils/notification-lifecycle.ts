import type { HackathonStatus } from "@/lib/db/hackathon-types"
import { getEffectiveStatus } from "@/lib/utils/timeline"

const NOTIFICATION_DELIVERY_STATUSES = new Set<HackathonStatus>([
  "published",
  "registration_open",
  "active",
  "judging",
])

export type NotificationDisposition = "queue" | "send" | "reject"

export type NotificationLifecycleHackathon = {
  status: HackathonStatus
  starts_at?: string | null
  ends_at?: string | null
}

export function getNotificationDisposition(
  hackathon: NotificationLifecycleHackathon,
): NotificationDisposition {
  if (hackathon.status === "draft") return "queue"
  if (hackathon.status === "completed" || hackathon.status === "archived") return "reject"

  const effectiveStatus = getEffectiveStatus({
    status: hackathon.status,
    starts_at: hackathon.starts_at ?? null,
    ends_at: hackathon.ends_at ?? null,
  })

  return NOTIFICATION_DELIVERY_STATUSES.has(effectiveStatus) ? "send" : "reject"
}

export function getNotificationLifecycleError(
  disposition: NotificationDisposition,
): { status: 400 | 409; error: string; code: "hackathon_draft" | "hackathon_ended" } | null {
  if (disposition === "queue") {
    return {
      status: 400,
      error: "Go live before sending this message.",
      code: "hackathon_draft",
    }
  }
  if (disposition === "reject") {
    return {
      status: 409,
      error: "This event has ended.",
      code: "hackathon_ended",
    }
  }
  return null
}
