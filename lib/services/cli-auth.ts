import { supabase as getSupabase } from "@/lib/db/client"
import { createApiKey, revokeApiKey } from "@/lib/services/api-keys"
import { encryptToken, decryptToken } from "@/lib/services/encryption"
import type { Scope } from "@/lib/auth/types"
import { randomBytes } from "node:crypto"

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

const DEVICE_TOKEN_PATTERN = /^[a-f0-9]{64}$/

export function isValidCliDeviceToken(deviceToken: string): boolean {
  return DEVICE_TOKEN_PATTERN.test(deviceToken)
}

export function getCliKeyScopes(callerScopes: readonly Scope[]): Scope[] {
  return CLI_KEY_SCOPES.filter((scope) => callerScopes.includes(scope))
}

interface CliAuthSession {
  id: string
  device_token: string
  tenant_id: string | null
  encrypted_api_key: string | null
  key_id: string | null
  status: string
  created_at: string
  expires_at: string
  user_code?: string | null
}

function db() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return getSupabase() as unknown as { from: (table: string) => any }
}

export async function createCliAuthSession(deviceToken: string) {
  if (!isValidCliDeviceToken(deviceToken)) {
    throw new Error("Invalid CLI device token")
  }
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  const random = randomBytes(6)
  const userCode = Array.from(random, (byte) => alphabet[byte % alphabet.length]).join("")
  const { data, error } = await db()
    .from("cli_auth_sessions")
    .insert({ device_token: deviceToken, user_code: userCode })
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
  userCode?: string
}> {
  if (!isValidCliDeviceToken(deviceToken)) return { status: "expired" }

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
      .update({ status: "expired", encrypted_api_key: null })
      .eq("id", data.id)
    if (data.key_id) await revokeApiKey(data.key_id, data.tenant_id ?? "")
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

  return { status: "pending", ...(data.user_code ? { userCode: data.user_code } : {}) }
}

export async function completeCliAuthSession(
  deviceToken: string,
  tenantId: string,
  scopes: Scope[],
  hostname?: string,
  userCode?: string,
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

  if (session.user_code && (!userCode || userCode.trim().toUpperCase() !== session.user_code)) {
    return { success: false, error: "The confirmation code does not match" }
  }

  const date = new Date().toISOString().split("T")[0]
  const keyName = `hackathon.new CLI (${hostname ?? "unknown"}, ${date})`

  const result = await createApiKey({
    tenantId,
    name: keyName,
    scopes,
  })

  if (!result) {
    return { success: false, error: "Failed to create API key" }
  }

  let encryptedKey: string
  try {
    encryptedKey = encryptToken(result.rawKey)
  } catch (encryptionError) {
    await revokeApiKey(result.apiKey.id, tenantId)
    console.error("Failed to encrypt CLI API key:", encryptionError)
    return { success: false, error: "Failed to secure API key" }
  }

  const { data: completedSession, error: completionError } = await db()
    .from("cli_auth_sessions")
    .update({
      tenant_id: tenantId,
      encrypted_api_key: encryptedKey,
      key_id: result.apiKey.id,
      status: "complete",
    })
    .eq("id", session.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle() as {
      data: { id: string } | null
      error: { message: string } | null
    }

  if (completionError || !completedSession) {
    await revokeApiKey(result.apiKey.id, tenantId)
    return { success: false, error: "Session was already completed or expired" }
  }

  return { success: true }
}
