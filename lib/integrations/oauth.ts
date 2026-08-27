import { supabase as getSupabase } from "@/lib/db/client"
import type { OrgIntegration, IntegrationProvider } from "@/lib/db/hackathon-types"
import { encryptToken, decryptToken } from "@/lib/services/encryption"
import { createHmac, timingSafeEqual } from "node:crypto"

export interface OAuthProviderConfig {
  name: IntegrationProvider
  authUrl: string
  tokenUrl: string
  scopes: string[]
  clientId: string
  clientSecret: string
}

type OAuthState = { tenantId: string; userId: string; expiresAt: number }

function oauthStateSecret(): string {
  const secret = process.env.ENCRYPTION_KEY
  if (!secret || !/^[a-f0-9]{64}$/.test(secret)) {
    throw new Error("ENCRYPTION_KEY must be exactly 64 lowercase hex characters")
  }
  return secret
}

export function createOAuthState(tenantId: string, userId: string): string {
  const payload = Buffer.from(JSON.stringify({
    tenantId,
    userId,
    expiresAt: Date.now() + 10 * 60_000,
  } satisfies OAuthState)).toString("base64url")
  const signature = createHmac("sha256", oauthStateSecret()).update(payload).digest("base64url")
  return `${payload}.${signature}`
}

export function verifyOAuthState(state: string): OAuthState | null {
  const [payload, providedSignature, extra] = state.split(".")
  if (!payload || !providedSignature || extra) return null
  const expectedSignature = createHmac("sha256", oauthStateSecret()).update(payload).digest()
  let actualSignature: Buffer
  try {
    actualSignature = Buffer.from(providedSignature, "base64url")
  } catch {
    return null
  }
  if (actualSignature.length !== expectedSignature.length || !timingSafeEqual(actualSignature, expectedSignature)) return null
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<OAuthState>
    if (typeof parsed.tenantId !== "string" || typeof parsed.userId !== "string") return null
    if (typeof parsed.expiresAt !== "number" || parsed.expiresAt < Date.now()) return null
    return parsed as OAuthState
  } catch {
    return null
  }
}

export const OAUTH_PROVIDERS: Record<IntegrationProvider, () => OAuthProviderConfig | null> = {
  gmail: () => {
    const clientId = process.env.GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET
    if (!clientId || !clientSecret) return null

    return {
      name: "gmail",
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: ["https://www.googleapis.com/auth/gmail.modify"],
      clientId,
      clientSecret,
    }
  },

  google_calendar: () => {
    const clientId = process.env.GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET
    if (!clientId || !clientSecret) return null

    return {
      name: "google_calendar",
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: ["https://www.googleapis.com/auth/calendar"],
      clientId,
      clientSecret,
    }
  },

  notion: () => {
    const clientId = process.env.NOTION_CLIENT_ID
    const clientSecret = process.env.NOTION_CLIENT_SECRET
    if (!clientId || !clientSecret) return null

    return {
      name: "notion",
      authUrl: "https://api.notion.com/v1/oauth/authorize",
      tokenUrl: "https://api.notion.com/v1/oauth/token",
      scopes: [],
      clientId,
      clientSecret,
    }
  },

  // NOTE: Luma now uses per-org API keys instead of OAuth.
  // See lib/services/org-credentials.ts for Luma API key management.
  // The 'luma' entry in IntegrationProvider enum is kept for backwards compatibility
  // but should not be used for new integrations.
  luma: () => null,
}

export function getProviderConfig(provider: IntegrationProvider): OAuthProviderConfig | null {
  if (!Object.hasOwn(OAUTH_PROVIDERS, provider)) return null
  const configFn = OAUTH_PROVIDERS[provider]
  return configFn ? configFn() : null
}

export function buildAuthUrl(provider: IntegrationProvider, state: string): string | null {
  const config = getProviderConfig(provider)
  if (!config) return null

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/dashboard/integrations/${provider}/callback`

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    state,
  })

  if (config.scopes.length > 0) {
    params.set("scope", config.scopes.join(" "))
  }

  if (provider === "gmail" || provider === "google_calendar") {
    params.set("access_type", "offline")
    params.set("prompt", "consent")
  }

  return `${config.authUrl}?${params}`
}

export interface TokenExchangeResult {
  accessToken: string
  refreshToken?: string
  expiresIn?: number
  email?: string
}

export async function exchangeCodeForTokens(
  provider: IntegrationProvider,
  code: string
): Promise<TokenExchangeResult | null> {
  const config = getProviderConfig(provider)
  if (!config) return null

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/dashboard/integrations/${provider}/callback`

  try {
    let body: URLSearchParams | string
    let headers: Record<string, string>

    if (provider === "notion") {
      body = JSON.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      })
      headers = {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
      }
    } else {
      body = new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      })
      headers = {
        "Content-Type": "application/x-www-form-urlencoded",
      }
    }

    const response = await fetch(config.tokenUrl, {
      method: "POST",
      headers,
      body: body instanceof URLSearchParams ? body.toString() : body,
    })

    if (!response.ok) {
      const error = await response.text()
      console.error("Token exchange failed:", error)
      return null
    }

    const data = await response.json()

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      email: data.email || data.owner?.user?.email,
    }
  } catch (err) {
    console.error("Token exchange error:", err)
    return null
  }
}

export async function refreshAccessToken(
  integration: OrgIntegration
): Promise<string | null> {
  if (!integration.refresh_token_encrypted) {
    return null
  }

  const config = getProviderConfig(integration.provider)
  if (!config) return null

  const refreshToken = decryptToken(integration.refresh_token_encrypted)

  try {
    const body = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    })

    const response = await fetch(config.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    })

    if (!response.ok) {
      console.error("Token refresh failed:", await response.text())
      return null
    }

    const data = await response.json()
    const newAccessToken = data.access_token

    await getSupabase()
      .from("org_integrations")
      .update({
        access_token_encrypted: encryptToken(newAccessToken),
        token_expires_at: data.expires_in
          ? new Date(Date.now() + data.expires_in * 1000).toISOString()
          : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", integration.id)

    return newAccessToken
  } catch (err) {
    console.error("Token refresh error:", err)
    return null
  }
}

export type SaveIntegrationInput = {
  tenantId: string
  provider: IntegrationProvider
  accountEmail?: string
  accessToken: string
  refreshToken?: string
  expiresIn?: number
  scopes?: string[]
}

export async function saveIntegration(
  input: SaveIntegrationInput
): Promise<OrgIntegration | null> {
  const accessTokenEncrypted = encryptToken(input.accessToken)
  const refreshTokenEncrypted = input.refreshToken
    ? encryptToken(input.refreshToken)
    : null

  const tokenExpiresAt = input.expiresIn
    ? new Date(Date.now() + input.expiresIn * 1000).toISOString()
    : null

  const { data, error } = await getSupabase()
    .from("org_integrations")
    .upsert(
      {
        tenant_id: input.tenantId,
        provider: input.provider,
        account_email: input.accountEmail ?? null,
        access_token_encrypted: accessTokenEncrypted,
        refresh_token_encrypted: refreshTokenEncrypted,
        token_expires_at: tokenExpiresAt,
        scopes: input.scopes ?? [],
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,provider" }
    )
    .select()
    .single()

  if (error || !data) {
    console.error("Failed to save integration:", error)
    return null
  }

  return data as OrgIntegration
}

export async function getIntegration(
  tenantId: string,
  provider: IntegrationProvider
): Promise<OrgIntegration | null> {
  const { data } = await getSupabase()
    .from("org_integrations")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("provider", provider)
    .single()

  return data as OrgIntegration | null
}

export async function listIntegrations(tenantId: string): Promise<OrgIntegration[]> {
  const { data } = await getSupabase()
    .from("org_integrations")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)

  return (data as OrgIntegration[] | null) ?? []
}

export async function deleteIntegration(
  tenantId: string,
  provider: IntegrationProvider
): Promise<boolean> {
  const { error } = await getSupabase()
    .from("org_integrations")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("provider", provider)

  return !error
}

export async function getDecryptedAccessToken(
  integration: OrgIntegration
): Promise<string | null> {
  if (!integration.access_token_encrypted) return null

  if (integration.token_expires_at) {
    const expiresAt = new Date(integration.token_expires_at)
    const bufferMs = 5 * 60 * 1000

    if (expiresAt.getTime() - bufferMs < Date.now()) {
      return refreshAccessToken(integration)
    }
  }

  return decryptToken(integration.access_token_encrypted)
}

export async function getIntegrationTokensForSandbox(
  tenantId: string,
  providers: IntegrationProvider[]
): Promise<Record<string, string>> {
  const tokens: Record<string, string> = {}

  for (const provider of providers) {
    const integration = await getIntegration(tenantId, provider)
    if (integration) {
      const token = await getDecryptedAccessToken(integration)
      if (token) {
        tokens[`${provider.toUpperCase()}_ACCESS_TOKEN`] = token
      }
    }
  }

  return tokens
}
