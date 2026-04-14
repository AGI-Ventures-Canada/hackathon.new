import { auth } from "@clerk/nextjs/server"
import { supabase as getSupabase } from "@/lib/db/client"
import type { AdminPrincipal, ApiKeyPrincipal, Principal, PrincipalKindMap, Scope } from "./types"
import { ADMIN_SCOPES, scopesForRole } from "./types"
import { verifyApiKey } from "@/lib/services/api-keys"
import { getOrCreateTenant, getOrCreatePersonalTenant } from "@/lib/services/tenants"

export function isAdminEnabled(): boolean {
  return process.env.ADMIN_ENABLED === "true"
}

export function hasAdminMetadata(sessionClaims: unknown): boolean {
  const metadata = (sessionClaims as Record<string, unknown> | undefined)?.metadata as
    | Record<string, unknown>
    | undefined
  return metadata?.admin === true
}

export async function resolvePrincipal(request: Request): Promise<Principal> {
  const authHeader = request.headers.get("authorization")

  if (authHeader?.startsWith("Bearer sk_")) {
    const token = authHeader.slice(7)
    const apiKey = await verifyApiKey(token)
    if (!apiKey) {
      return { kind: "anon" }
    }
    await getSupabase()
      .from("api_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", apiKey.id)

    return {
      kind: "api_key",
      tenantId: apiKey.tenant_id,
      keyId: apiKey.id,
      scopes: apiKey.scopes as Scope[],
    }
  }

  const session = await auth()
  const { userId, orgId, orgRole } = session
  if (!userId) {
    if (process.env.DEBUG) console.warn("[auth] resolvePrincipal: Clerk auth() returned null userId")
    return { kind: "anon" }
  }

  const isAdmin = isAdminEnabled() && hasAdminMetadata(session.sessionClaims)

  let tenant
  if (orgId) {
    tenant = await getOrCreateTenant(orgId)
  } else {
    tenant = await getOrCreatePersonalTenant(userId)
  }

  if (!tenant) {
    if (process.env.DEBUG) console.warn("[auth] resolvePrincipal: tenant lookup returned null for userId:", userId)
    if (isAdmin) {
      return { kind: "admin", userId, tenantId: null, orgId: orgId ?? null, scopes: ADMIN_SCOPES }
    }
    return { kind: "anon" }
  }

  if (isAdmin) {
    return {
      kind: "admin",
      userId,
      tenantId: tenant.id,
      orgId: orgId ?? null,
      scopes: ADMIN_SCOPES,
    }
  }

  return {
    kind: "user",
    tenantId: tenant.id,
    userId,
    orgId: orgId ?? null,
    orgRole: orgId ? (orgRole ?? "org:member") : null,
    scopes: scopesForRole(orgId ? (orgRole ?? "org:member") : null),
  }
}

export class AuthError extends Error {
  constructor(
    message: string,
    public statusCode: number = 401
  ) {
    super(message)
    this.name = "AuthError"
  }
}

const ADMIN_API_KEY_SCOPES: Scope[] = ["admin:read", "admin:write", "admin:scenarios"]

// Outer gate: confirms admin is enabled and the principal holds at least one admin scope.
// Per-endpoint scope enforcement is done separately via requireAdminScopes — keep both checks;
// collapsing them would either over-restrict (blocking valid admin Clerk sessions) or
// under-restrict (skipping scope verification on specific endpoints).
export function requireAdmin(principal: Principal): asserts principal is AdminPrincipal | ApiKeyPrincipal {
  if (!isAdminEnabled()) {
    throw new AuthError("Not found", 404)
  }
  if (principal.kind === "admin") {
    return
  }
  if (
    principal.kind === "api_key" &&
    ADMIN_API_KEY_SCOPES.some((s) => principal.scopes.includes(s))
  ) {
    return
  }
  throw new AuthError("Forbidden", 403)
}

export function requireAdminScopes(principal: AdminPrincipal | ApiKeyPrincipal, scopes: Scope[]): void {
  for (const scope of scopes) {
    if (!principal.scopes.includes(scope)) {
      throw new AuthError(`Missing required scope: ${scope}`, 403)
    }
  }
}

export function requirePrincipal<K extends Exclude<Principal["kind"], "anon">>(
  principal: Principal,
  allowedKinds: K[],
  requiredScopes: Scope[] = []
): asserts principal is PrincipalKindMap[K] {
  // Admin principals carry all user scopes plus admin-specific ones, so they are a
  // strict superset of user permissions. When a route allows "user", also admit admins
  // rather than forcing every call site to list "admin" explicitly. The tenantId guard
  // prevents an admin who has no org/personal-tenant context (tenantId === null) from
  // reaching tenant-scoped routes where downstream code assumes tenantId is present.
  if (principal.kind === "admin" && (allowedKinds as string[]).includes("user")) {
    if (!principal.tenantId) {
      throw new AuthError("Unauthorized", 401)
    }
    for (const scope of requiredScopes) {
      if (!principal.scopes.includes(scope)) {
        throw new AuthError(`Missing required scope: ${scope}`, 403)
      }
    }
    return
  }

  if (!allowedKinds.includes(principal.kind as K)) {
    throw new AuthError("Unauthorized", 401)
  }

  if (principal.kind === "anon") {
    throw new AuthError("Unauthorized", 401)
  }

  for (const scope of requiredScopes) {
    if (!principal.scopes.includes(scope)) {
      throw new AuthError(`Missing required scope: ${scope}`, 403)
    }
  }
}
