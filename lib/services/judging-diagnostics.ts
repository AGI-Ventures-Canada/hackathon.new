type JudgingDatabaseOperation =
  | "invitation_batch_read"
  | "invitation_batch_claim"
  | "invitation_batch_results"
  | "notification_event"
  | "notification_judges"
  | "notification_assignments"
  | "notification_rounds"
  | "notification_visibility"

export function logJudgingDatabaseError(operation: JudgingDatabaseOperation, error: { code?: string }) {
  const code = error.code && /^(?:[A-Z0-9]{5}|PGRST[0-9]{3})$/.test(error.code) ? error.code : "unknown"
  console.error("Judging database operation failed.", { operation, code })
}
