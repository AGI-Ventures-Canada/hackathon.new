import { FatalError, RetryableError } from "workflow"
import type { HackathonCreationFinalizationResult } from "@/lib/services/luma-import-create"

export function requireHackathonCreationFinalizationComplete(
  result: HackathonCreationFinalizationResult,
): void {
  if (result.status === "complete") return
  if (result.status === "invalid") {
    throw new FatalError(result.error.message)
  }
  throw new RetryableError("Event creation setup is not complete yet.", {
    retryAfter: result.status === "in_progress" ? "2m" : "30s",
  })
}
