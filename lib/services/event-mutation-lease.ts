import { randomInt } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { supabase as getSupabase } from "@/lib/db/client"

const EVENT_MUTATION_LEASE_MS = 120_000

export class EventMutationLeaseError extends Error {
  constructor(
    message: string,
    public readonly code: "event_busy" | "lease_unavailable",
  ) {
    super(message)
    this.name = "EventMutationLeaseError"
  }
}

export async function withEventMutationLease<T>(
  hackathonId: string,
  mutation: () => Promise<T>,
  tenantId?: string,
): Promise<T> {
  const client = getSupabase() as unknown as SupabaseClient
  if (tenantId) {
    const { data: ownedHackathon } = await client
      .from("hackathons")
      .select("id")
      .eq("id", hackathonId)
      .eq("tenant_id", tenantId)
      .maybeSingle()
    if (!ownedHackathon) return mutation()
  }
  const key = `event-mutation:${hackathonId}`
  const owner = randomInt(1, 2_147_483_647)
  const now = Date.now()
  const { error: cleanupError } = await client
    .from("rate_limits")
    .delete()
    .eq("key", key)
    .lt("reset_at", now)

  if (cleanupError) {
    throw new EventMutationLeaseError(
      "The event change lock is unavailable.",
      "lease_unavailable",
    )
  }

  const { error: insertError } = await client.from("rate_limits").insert({
    key,
    count: owner,
    reset_at: now + EVENT_MUTATION_LEASE_MS,
  })
  if (insertError?.code === "23505") {
    throw new EventMutationLeaseError(
      "Another event change is still being saved.",
      "event_busy",
    )
  }
  if (insertError) {
    throw new EventMutationLeaseError(
      "The event change lock is unavailable.",
      "lease_unavailable",
    )
  }

  const renewal = setInterval(() => {
    void client
      .from("rate_limits")
      .update({ reset_at: Date.now() + EVENT_MUTATION_LEASE_MS })
      .eq("key", key)
      .eq("count", owner)
      .then(({ error }) => {
        if (error) console.error("Failed to renew the event mutation lease:", error)
      })
  }, EVENT_MUTATION_LEASE_MS / 4)
  renewal.unref?.()

  try {
    return await mutation()
  } finally {
    clearInterval(renewal)
    const { error: releaseError } = await client
      .from("rate_limits")
      .delete()
      .eq("key", key)
      .eq("count", owner)
    if (releaseError) {
      console.error("Failed to release the event mutation lease:", releaseError)
    }
  }
}
