import type { SupabaseClient } from "@supabase/supabase-js"
import { supabase as getSupabase } from "@/lib/db/client"
import { withDeliveryLease } from "@/lib/services/delivery-lease"
import type { TransitionNotificationInput } from "@/lib/workflows/transition-notifications"
import type { ChallengesReleasedNotificationInput } from "@/lib/workflows/challenges-released"

const MAX_ATTEMPTS = 5
const FIRST_RETRY_DELAY_MS = 5 * 60 * 1_000

export type LifecycleNotificationDispatchKind =
  | "transition"
  | "challenges_released"

type LifecycleNotificationPayload =
  | TransitionNotificationInput
  | ChallengesReleasedNotificationInput

type LifecycleNotificationDispatchRow = {
  id: string
  hackathon_id: string
  dispatch_kind: LifecycleNotificationDispatchKind
  payload: unknown
  fail_count: number
}

export type LifecycleNotificationRetryResult = {
  attempted: number
  started: number
  failed: number
  exhausted: number
  skippedDueToLease: boolean
}

export type LifecycleWorkflowStarter = (
  kind: LifecycleNotificationDispatchKind,
  payload: LifecycleNotificationPayload,
) => Promise<void>

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.slice(0, 500)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 10 && value.every(
    (item) => typeof item === "string" && item.length > 0 && item.length <= 50,
  )
}

function isChallengeArray(value: unknown): boolean {
  return value === undefined || (
    Array.isArray(value) &&
    value.length <= 100 &&
    value.every((challenge) =>
      isRecord(challenge) &&
      typeof challenge.title === "string" &&
      challenge.title.length <= 300 &&
      (challenge.description === null ||
        challenge.description === undefined ||
        (typeof challenge.description === "string" &&
          challenge.description.length <= 20_000)),
    )
  )
}

function validatePayload(
  row: LifecycleNotificationDispatchRow,
): LifecycleNotificationPayload | null {
  const payload = row.payload
  if (!isRecord(payload)) return null
  if (payload.notificationId !== row.id || payload.hackathonId !== row.hackathon_id) {
    return null
  }
  if (
    typeof payload.hackathonName !== "string" ||
    payload.hackathonName.length > 300 ||
    typeof payload.hackathonSlug !== "string" ||
    payload.hackathonSlug.length > 300 ||
    !isStringArray(payload.recipientRoles) ||
    !isChallengeArray(payload.challenges)
  ) {
    return null
  }
  if (row.dispatch_kind === "transition") {
    if (![
      "registration_opened",
      "hackathon_started",
      "judging_started",
      "results_published",
    ].includes(String(payload.event))) {
      return null
    }
    return payload as TransitionNotificationInput
  }
  if (row.dispatch_kind === "challenges_released" && Array.isArray(payload.challenges)) {
    return payload as ChallengesReleasedNotificationInput
  }
  return null
}

async function startLifecycleWorkflow(
  kind: LifecycleNotificationDispatchKind,
  payload: LifecycleNotificationPayload,
): Promise<void> {
  const { start } = await import("workflow/api")
  if (kind === "transition") {
    const { sendTransitionNotificationsWorkflow } = await import(
      "@/lib/workflows/transition-notifications"
    )
    await start(sendTransitionNotificationsWorkflow, [
      payload as TransitionNotificationInput,
    ])
    return
  }
  const { sendChallengesReleasedNotificationsWorkflow } = await import(
    "@/lib/workflows/challenges-released"
  )
  await start(sendChallengesReleasedNotificationsWorkflow, [
    payload as ChallengesReleasedNotificationInput,
  ])
}

export async function queueFailedLifecycleNotificationDispatch(input: {
  id: string
  hackathonId: string
  kind: LifecycleNotificationDispatchKind
  payload: LifecycleNotificationPayload
  error: unknown
}): Promise<void> {
  if (
    input.payload.notificationId !== input.id ||
    input.payload.hackathonId !== input.hackathonId
  ) {
    throw new Error("Lifecycle notification retry identity does not match.")
  }
  const client = getSupabase() as unknown as SupabaseClient
  const now = Date.now()
  const { error } = await client
    .from("lifecycle_notification_dispatches")
    .insert({
      id: input.id,
      hackathon_id: input.hackathonId,
      dispatch_kind: input.kind,
      payload: input.payload,
      fail_count: 1,
      last_error: safeError(input.error),
      next_attempt_at: new Date(now + FIRST_RETRY_DELAY_MS).toISOString(),
      updated_at: new Date(now).toISOString(),
    })
  if (error && error.code !== "23505") {
    throw new Error(`Failed to save lifecycle notification retry: ${error.message}`)
  }
}

function retryDelayMs(failCount: number): number {
  return Math.min(
    FIRST_RETRY_DELAY_MS * 2 ** Math.max(0, failCount - 1),
    60 * 60 * 1_000,
  )
}

async function markInvalid(
  client: SupabaseClient,
  row: LifecycleNotificationDispatchRow,
): Promise<void> {
  const now = new Date().toISOString()
  const { error } = await client
    .from("lifecycle_notification_dispatches")
    .update({
      fail_count: MAX_ATTEMPTS,
      last_error: "Stored lifecycle notification retry is invalid.",
      updated_at: now,
    })
    .eq("id", row.id)
    .is("resolved_at", null)
  if (error) throw new Error(`Failed to quarantine lifecycle notification retry: ${error.message}`)
}

async function retryPendingLifecycleNotificationDispatchesUnlocked(
  limit: number,
  starter: LifecycleWorkflowStarter,
): Promise<Omit<LifecycleNotificationRetryResult, "skippedDueToLease">> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data, error } = await client
    .from("lifecycle_notification_dispatches")
    .select("id, hackathon_id, dispatch_kind, payload, fail_count")
    .is("resolved_at", null)
    .lt("fail_count", MAX_ATTEMPTS)
    .lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at", { ascending: true })
    .limit(Math.min(50, Math.max(1, limit)))
  if (error) {
    throw new Error(`Failed to load lifecycle notification retries: ${error.message}`)
  }

  const result = { attempted: 0, started: 0, failed: 0, exhausted: 0 }
  for (const row of (data ?? []) as LifecycleNotificationDispatchRow[]) {
    const payload = validatePayload(row)
    if (!payload) {
      await markInvalid(client, row)
      result.failed++
      result.exhausted++
      continue
    }

    result.attempted++
    try {
      await starter(row.dispatch_kind, payload)
      const resolvedAt = new Date().toISOString()
      const resolved = await client
        .from("lifecycle_notification_dispatches")
        .update({
          resolved_at: resolvedAt,
          last_error: null,
          updated_at: resolvedAt,
        })
        .eq("id", row.id)
        .eq("fail_count", row.fail_count)
        .is("resolved_at", null)
        .select("id")
        .maybeSingle()
      if (resolved.error) {
        throw new Error(`Failed to finish lifecycle notification retry: ${resolved.error.message}`)
      }
      if (!resolved.data) {
        throw new Error("Lifecycle notification retry changed while it was running.")
      }
      result.started++
    } catch (startError) {
      const nextFailCount = Math.min(MAX_ATTEMPTS, row.fail_count + 1)
      const now = Date.now()
      const failed = await client
        .from("lifecycle_notification_dispatches")
        .update({
          fail_count: nextFailCount,
          last_error: safeError(startError),
          next_attempt_at: new Date(now + retryDelayMs(nextFailCount)).toISOString(),
          updated_at: new Date(now).toISOString(),
        })
        .eq("id", row.id)
        .eq("fail_count", row.fail_count)
        .is("resolved_at", null)
      if (failed.error) {
        throw new Error(`Failed to record lifecycle notification retry: ${failed.error.message}`)
      }
      result.failed++
      if (nextFailCount >= MAX_ATTEMPTS) result.exhausted++
    }
  }
  return result
}

export async function retryPendingLifecycleNotificationDispatches(
  limit = 10,
  starter: LifecycleWorkflowStarter = startLifecycleWorkflow,
): Promise<LifecycleNotificationRetryResult> {
  const claimed = await withDeliveryLease(
    "lifecycle-notification-workflow-starts",
    () => retryPendingLifecycleNotificationDispatchesUnlocked(limit, starter),
  )
  if (!claimed.acquired) {
    return {
      attempted: 0,
      started: 0,
      failed: 0,
      exhausted: 0,
      skippedDueToLease: true,
    }
  }
  return { ...claimed.value, skippedDueToLease: false }
}
