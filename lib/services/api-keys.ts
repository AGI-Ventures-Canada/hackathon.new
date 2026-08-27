import { createHmac, randomBytes } from "crypto"
import { supabase as getSupabase } from "@/lib/db/client"
import type { ApiKey } from "@/lib/db/hackathon-types"
import type { Scope } from "@/lib/auth/types"
import { DEFAULT_API_KEY_SCOPES } from "@/lib/auth/types"

const API_KEY_SECRET = process.env.API_KEY_SECRET
if (!API_KEY_SECRET) {
  console.warn("API_KEY_SECRET not set - API key operations will fail")
}

function hashKey(raw: string): string {
  if (!API_KEY_SECRET) throw new Error("API_KEY_SECRET not configured")
  return createHmac("sha256", API_KEY_SECRET).update(raw).digest("hex")
}

function generateRawKey(): string {
  const random = randomBytes(24).toString("base64url")
  return `sk_live_${random}`
}

export type CreateApiKeyInput = {
  tenantId: string
  name: string
  scopes?: Scope[]
}

export type CreateApiKeyResult = {
  apiKey: ApiKey
  rawKey: string
}

export async function createApiKey(
  input: CreateApiKeyInput
): Promise<CreateApiKeyResult | null> {
  const raw = generateRawKey()
  const prefix = raw.slice(0, 12)
  const hash = hashKey(raw)

  const { data, error } = await getSupabase()
    .from("api_keys")
    .insert({
      tenant_id: input.tenantId,
      name: input.name,
      prefix,
      hash,
      scopes: input.scopes ?? DEFAULT_API_KEY_SCOPES,
    })
    .select()
    .single()

  if (error || !data) {
    console.error("Failed to create API key:", error)
    return null
  }

  return { apiKey: data as ApiKey, rawKey: raw }
}

export async function verifyApiKey(raw: string): Promise<ApiKey | null> {
  if (!/^sk_live_[A-Za-z0-9_-]{32}$/.test(raw)) {
    return null
  }

  const prefix = raw.slice(0, 12)
  const hash = hashKey(raw)

  const { data } = await getSupabase()
    .from("api_keys")
    .select("*")
    .eq("prefix", prefix)
    .eq("hash", hash)
    .is("revoked_at", null)
    .single()

  return data as ApiKey | null
}

export async function listApiKeys(tenantId: string): Promise<ApiKey[]> {
  const { data } = await getSupabase()
    .from("api_keys")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })

  return (data as ApiKey[] | null) ?? []
}

export async function revokeApiKey(
  keyId: string,
  tenantId: string
): Promise<boolean> {
  const { error } = await getSupabase()
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", keyId)
    .eq("tenant_id", tenantId)

  return !error
}

export async function getApiKeyById(
  keyId: string,
  tenantId: string
): Promise<ApiKey | null> {
  const { data } = await getSupabase()
    .from("api_keys")
    .select("*")
    .eq("id", keyId)
    .eq("tenant_id", tenantId)
    .single()

  return data as ApiKey | null
}
