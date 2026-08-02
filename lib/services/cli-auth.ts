import { supabase as getSupabase } from "@/lib/db/client"
import { createApiKey } from "@/lib/services/api-keys"
import { encryptToken, decryptToken } from "@/lib/services/encryption"
import type { Scope } from "@/lib/auth/types"

const CLI_KEY_SCOPES: Scope[] = [
  "hackathons:read",
  "hackathons:write",
  "teams:read",
  "teams:write",
  "submissions:read",
  "submissions:write",
  "webhooks:read",
  "webhooks:write",
  "schedules:read",
  "schedules:write",
  "analytics:read",
  "org:read",
  "org:write",
]

interface CliAuthSession {
  id: string
  device_token: string
  tenant_id: string | null
  encrypted_api_key: string | null
  key_id: string | null
  status: string
  created_at: string
  expires_at: string
}

function db() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return getSupabase() as unknown as { from: (table: string) => any }
}

export async function createCliAuthSession(deviceToken: string) {
  const { data, error } = await db()
    .from("cli_auth_sessions")
    .insert({ device_token: deviceToken })
    .select()
    .single() as { data: CliAuthSession | null; error: { message: string } | null }

  if (error) {
    throw new Error(`Failed to create CLI auth session: ${error.message}`)
  }

  return data!
}

export async function pollCliAuthSession(deviceToken: string): Promise<{
  status: "pending" | "complete" | "expired"
  apiKey?: string
}> {
  await cleanupExpiredSessions()

  const { data, error } = await db()
    .from("cli_auth_sessions")
    .select("*")
    .eq("device_token", deviceToken)
    .single() as { data: CliAuthSession | null; error: { message: string } | null }

  if (error || !data) {
    return { status: "expired" }
  }

  if (new Date(data.expires_at) < new Date()) {
    await db()
      .from("cli_auth_sessions")
      .update({ status: "expired" })
      .eq("id", data.id)
    return { status: "expired" }
  }

  if (data.status === "complete" && data.encrypted_api_key) {
    const apiKey = decryptToken(data.encrypted_api_key)

    await db()
      .from("cli_auth_sessions")
      .delete()
      .eq("id", data.id)

    return { status: "complete", apiKey }
  }

  if (data.status === "expired") {
    return { status: "expired" }
  }

  return { status: "pending" }
}

export async function completeCliAuthSession(
  deviceToken: string,
  tenantId: string,
  hostname?: string
): Promise<{ success: boolean; error?: string }> {
  const { data: session, error } = await db()
    .from("cli_auth_sessions")
    .select("*")
    .eq("device_token", deviceToken)
    .eq("status", "pending")
    .single() as { data: CliAuthSession | null; error: { message: string } | null }

  if (error || !session) {
    return { success: false, error: "Session not found or expired" }
  }

  if (new Date(session.expires_at) < new Date()) {
    await db()
      .from("cli_auth_sessions")
      .update({ status: "expired" })
      .eq("id", session.id)
    return { success: false, error: "Session expired" }
  }

  const date = new Date().toISOString().split("T")[0]
  const keyName = `hackathon.new CLI (${hostname ?? "unknown"}, ${date})`

  const result = await createApiKey({
    tenantId,
    name: keyName,
    scopes: CLI_KEY_SCOPES,
  })

  if (!result) {
    return { success: false, error: "Failed to create API key" }
  }

  const encryptedKey = encryptToken(result.rawKey)

  await db()
    .from("cli_auth_sessions")
    .update({
      tenant_id: tenantId,
      encrypted_api_key: encryptedKey,
      key_id: result.apiKey.id,
      status: "complete",
    })
    .eq("id", session.id)

  return { success: true }
}

async function cleanupExpiredSessions() {
  await db()
    .from("cli_auth_sessions")
    .delete()
    .lt("expires_at", new Date().toISOString())
    .neq("status", "complete")
}
