export type Scope =
  | "keys:read"
  | "keys:write"
  | "webhooks:read"
  | "webhooks:write"
  | "hackathons:read"
  | "hackathons:write"
  | "teams:read"
  | "teams:write"
  | "submissions:read"
  | "submissions:write"
  | "analytics:read"
  | "schedules:read"
  | "schedules:write"
  | "jobs:read"
  | "org:read"
  | "org:write"
  | "admin:read"
  | "admin:write"
  | "admin:scenarios"

export const ALL_SCOPES: Scope[] = [
  "keys:read",
  "keys:write",
  "webhooks:read",
  "webhooks:write",
  "hackathons:read",
  "hackathons:write",
  "teams:read",
  "teams:write",
  "submissions:read",
  "submissions:write",
  "analytics:read",
  "schedules:read",
  "schedules:write",
  "jobs:read",
  "org:read",
  "org:write",
]

export const ADMIN_SCOPES: Scope[] = [
  ...ALL_SCOPES,
  "admin:read",
  "admin:write",
  "admin:scenarios",
]

export const DEFAULT_API_KEY_SCOPES: Scope[] = [
  "hackathons:read",
  "teams:read",
  "submissions:read",
  "submissions:write",
  "webhooks:read",
  "webhooks:write",
  "schedules:read",
  "jobs:read",
  "org:read",
]

export type UserPrincipal = {
  kind: "user"
  tenantId: string
  userId: string
  orgId: string | null
  orgRole: string | null
  scopes: Scope[]
}

export type ApiKeyPrincipal = {
  kind: "api_key"
  tenantId: string
  keyId: string
  scopes: Scope[]
}

export type AdminPrincipal = {
  kind: "admin"
  userId: string
  tenantId: string | null
  orgId: string | null
  scopes: Scope[]
}

export type AnonPrincipal = {
  kind: "anon"
}

export type Principal = UserPrincipal | ApiKeyPrincipal | AdminPrincipal | AnonPrincipal

export type PrincipalKindMap = {
  user: UserPrincipal
  api_key: ApiKeyPrincipal
  admin: AdminPrincipal
  anon: AnonPrincipal
}

export function scopesForRole(role: string | null): Scope[] {
  if (role === "org:admin") {
    return ALL_SCOPES
  }
  if (role === "org:member") {
    return [
      "keys:read",
      "keys:write",
      "webhooks:read",
      "webhooks:write",
      "hackathons:read",
      "teams:read",
      "teams:write",
      "submissions:read",
      "submissions:write",
      "analytics:read",
      "schedules:read",
      "org:read",
    ]
  }
  if (role === null) {
    return ALL_SCOPES
  }
  return ["hackathons:read", "teams:read", "submissions:read"]
}

export function getDelegableApiKeyScopes(
  requestedScopes: readonly string[] | undefined,
  callerScopes: readonly Scope[]
): Scope[] | null {
  const requested = requestedScopes ?? DEFAULT_API_KEY_SCOPES
  const unique = [...new Set(requested)]
  if (unique.some((scope) => !ALL_SCOPES.includes(scope as Scope))) return null
  if (unique.some((scope) => !callerScopes.includes(scope as Scope))) return null
  return unique as Scope[]
}

export function hasScope(principal: Principal, scope: Scope): boolean {
  if (principal.kind === "anon") return false
  return principal.scopes.includes(scope)
}

export function hasAllScopes(principal: Principal, scopes: Scope[]): boolean {
  return scopes.every((s) => hasScope(principal, s))
}

export function matchesExpectedOrganization(
  principal: Principal,
  expectedOrganizationId: string | undefined,
): boolean {
  if (expectedOrganizationId === undefined) return true
  return (
    (principal.kind === "user" || principal.kind === "admin") &&
    principal.orgId === expectedOrganizationId
  )
}
