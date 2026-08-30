export const QUEUE_REASON_CODES = ["event_draft", "registration_not_open", "test_event"] as const

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
  queuedReason: QueueReasonCode = "event_draft",
): QueueReasonCode | undefined {
  return delivery === "queued" ? queuedReason : undefined
}

export function getInvitationDeliveryState({
  emailedAt,
  hackathonStatus,
  notificationDisposition,
  queueReason,
}: {
  emailedAt: string | null
  hackathonStatus: string | null
  notificationDisposition?: "queue" | "send" | "reject"
  queueReason?: QueueReasonCode
}): NotificationDeliveryState {
  if (emailedAt) return "sent"
  if (notificationDisposition) {
    if (
      notificationDisposition === "send" &&
      queueReason === "registration_not_open"
    ) return "queued"
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
    registration_not_open: {
      reason: "Registration isn't open yet.",
      release: "We'll send it when registration opens.",
    },
    test_event: {
      reason: "This is a test event.",
      release: "Emails stay off until you make it a real event.",
    },
  }
  return copy[reason]
}
