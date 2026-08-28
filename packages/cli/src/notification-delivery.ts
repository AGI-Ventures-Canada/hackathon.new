export type QueueReasonCode = "event_draft"

export function formatQueueReason(reason: QueueReasonCode | undefined): string {
  if (reason === "event_draft" || reason === undefined) {
    return "This event is still a draft. We'll send it when you go live."
  }
  return "This email is queued."
}
