import type { SupabaseClient } from "@supabase/supabase-js"
import { supabase as getSupabase } from "@/lib/db/client"

const DELIVERY_LEASE_MS = 10 * 60 * 1_000
const EMAIL_RESOLUTION_RETRY_WINDOW_MS = 7 * 24 * 60 * 60 * 1_000
const EMAIL_RESOLUTION_RETRY_LIMIT = 3

export class DeliveryLeaseUnavailableError extends Error {
  constructor(message = "The delivery lock is unavailable.") {
    super(message)
    this.name = "DeliveryLeaseUnavailableError"
  }
}

export type DeliveryLeaseResult<T> =
  | { acquired: true; value: T }
  | { acquired: false }

export async function withDeliveryLease<T>(
  workKey: string,
  work: () => Promise<T>,
): Promise<DeliveryLeaseResult<T>> {
  const key = `delivery:${workKey}`
  const client = getSupabase() as unknown as SupabaseClient
  const ownerBytes = new Uint32Array(1)
  globalThis.crypto.getRandomValues(ownerBytes)
  const owner = (ownerBytes[0] % 2_147_483_646) + 1
  const now = Date.now()
  const { error: cleanupError } = await client
    .from("rate_limits")
    .delete()
    .eq("key", key)
    .lt("reset_at", now)

  if (cleanupError) throw new DeliveryLeaseUnavailableError()

  const { error: insertError } = await client.from("rate_limits").insert({
    key,
    count: owner,
    reset_at: now + DELIVERY_LEASE_MS,
  })

  if (insertError?.code === "23505") return { acquired: false }
  if (insertError) throw new DeliveryLeaseUnavailableError()

  try {
    return { acquired: true, value: await work() }
  } finally {
    const { error: releaseError } = await client
      .from("rate_limits")
      .delete()
      .eq("key", key)
      .eq("count", owner)
    if (releaseError) {
      console.error("Failed to release a delivery lease:", releaseError)
    }
  }
}

export async function getUnresolvedEmailDecision(
  workKey: string,
): Promise<"retry" | "exhausted"> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data, error } = await client.rpc("check_rate_limit", {
    p_key: `email-resolution:${workKey}`,
    p_max_requests: EMAIL_RESOLUTION_RETRY_LIMIT,
    p_window_ms: EMAIL_RESOLUTION_RETRY_WINDOW_MS,
  })

  if (error || !data || typeof data !== "object") return "retry"
  const allowed = (data as Record<string, unknown>).allowed
  return allowed === false ? "exhausted" : "retry"
}
