export type QueueReasonCode = "event_draft" | "registration_not_open"

export function formatQueueReason(reason: QueueReasonCode | undefined): string {
  if (reason === "event_draft" || reason === undefined) {
    return "This event is still a draft. We'll send it when you go live."
  }
  if (reason === "registration_not_open") {
    return "Registration isn't open yet. We'll send it when registration opens."
  }
  return "This email is queued."
}
