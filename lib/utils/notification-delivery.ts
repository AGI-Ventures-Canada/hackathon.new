export const QUEUE_REASON_CODES = ["event_draft"] as const

export type QueueReasonCode = (typeof QUEUE_REASON_CODES)[number]
export type NotificationDelivery = "sent" | "queued" | "failed"
export type NotificationDeliveryState = "queued" | "sent" | "not_sent"
export type NotificationDeliveryResult = {
  queued: boolean
  delivery: NotificationDelivery
  queueReason?: QueueReasonCode
}

export function getQueueReason(
  delivery: NotificationDelivery | undefined,
): QueueReasonCode | undefined {
  return delivery === "queued" ? "event_draft" : undefined
}

export function getInvitationDeliveryState({
  emailedAt,
  hackathonStatus,
  notificationDisposition,
}: {
  emailedAt: string | null
  hackathonStatus: string | null
  notificationDisposition?: "queue" | "send" | "reject"
}): NotificationDeliveryState {
  if (emailedAt) return "sent"
  if (notificationDisposition) {
    return notificationDisposition === "queue" ? "queued" : "not_sent"
  }
  return hackathonStatus === "draft" ? "queued" : "not_sent"
}

export function getQueueReasonText(reason: QueueReasonCode): {
  reason: string
  release: string
} {
  const copy: Record<QueueReasonCode, { reason: string; release: string }> = {
    event_draft: {
      reason: "This event is still a draft.",
      release: "We'll send it when you go live.",
    },
  }
  return copy[reason]
}
