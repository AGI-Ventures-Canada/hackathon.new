import { auth, clerkClient } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { supabase as getSupabase } from "@/lib/db/client"
import type { Tenant } from "@/lib/db/hackathon-types"

async function fetchClerkOrgName(clerkOrgId: string): Promise<string | undefined> {
  try {
    const client = await clerkClient()
    const org = await client.organizations.getOrganization({ organizationId: clerkOrgId })
    return org.name
  } catch {
    return undefined
  }
}

const FALLBACK_NAME_RE = /^Org org_|^Unnamed Organization$|^Personal user_|^Personal Account$/

async function fetchTenantBy(
  column: "clerk_org_id" | "clerk_user_id",
  value: string
): Promise<Tenant | null> {
  const { data } = await getSupabase()
    .from("tenants")
    .select("*")
    .eq(column, value)
    .maybeSingle()
  return (data as Tenant) ?? null
}

async function upsertAndFetchTenant(
  column: "clerk_org_id" | "clerk_user_id",
  value: string,
  name: string,
  options: { overwriteNameOnConflict: boolean }
): Promise<Tenant | null> {
  const { data, error } = await getSupabase()
    .from("tenants")
    .upsert(
      { [column]: value, name },
      { onConflict: column, ignoreDuplicates: !options.overwriteNameOnConflict }
    )
    .select()
    .maybeSingle()

  if (error) {
    console.error("Failed to upsert tenant:", error.message, error.code, error.details)
    return null
  }

  if (!data) {
    return fetchTenantBy(column, value)
  }

  return data as Tenant
}

export async function getOrCreateTenant(
  clerkOrgId: string,
  clerkOrgName?: string
): Promise<Tenant | null> {
  const existing = await fetchTenantBy("clerk_org_id", clerkOrgId)

  if (existing) {
    if (!clerkOrgName && FALLBACK_NAME_RE.test(existing.name)) {
      clerkOrgName = await fetchClerkOrgName(clerkOrgId)
    }
    if (clerkOrgName && existing.name !== clerkOrgName) {
      const { data: updated } = await getSupabase()
        .from("tenants")
        .update({ name: clerkOrgName, updated_at: new Date().toISOString() })
        .eq("id", existing.id)
        .select()
        .single()
      return (updated as Tenant) ?? existing
    }
    return existing
  }

  if (!clerkOrgName) {
    clerkOrgName = await fetchClerkOrgName(clerkOrgId)
  }

  return upsertAndFetchTenant(
    "clerk_org_id",
    clerkOrgId,
    clerkOrgName ?? "Unnamed Organization",
    { overwriteNameOnConflict: true }
  )
}

export async function getOrCreatePersonalTenant(
  clerkUserId: string,
  userName?: string
): Promise<Tenant | null> {
  const existing = await fetchTenantBy("clerk_user_id", clerkUserId)

  if (existing) {
    if (userName && existing.name !== userName && FALLBACK_NAME_RE.test(existing.name)) {
      const { data: updated } = await getSupabase()
        .from("tenants")
        .update({ name: userName, updated_at: new Date().toISOString() })
        .eq("id", existing.id)
        .select()
        .single()
      return (updated as Tenant) ?? existing
    }
    return existing
  }

  return upsertAndFetchTenant(
    "clerk_user_id",
    clerkUserId,
    userName ?? "Personal Account",
    { overwriteNameOnConflict: false }
  )
}

export async function resolvePageTenant(): Promise<Tenant> {
  const { userId, orgId } = await auth()

  if (!userId) {
    redirect("/sign-in")
  }

  let tenant: Tenant | null

  if (orgId) {
    const orgName = await fetchClerkOrgName(orgId)
    tenant = await getOrCreateTenant(orgId, orgName)
  } else {
    tenant = await getOrCreatePersonalTenant(userId)
  }

  if (!tenant) {
    throw new Error("Failed to resolve tenant")
  }

  return tenant
}

export async function getTenantById(id: string): Promise<Tenant | null> {
  const { data } = await getSupabase()
    .from("tenants")
    .select("*")
    .eq("id", id)
    .single()

  return data as Tenant | null
}

export async function isOrgTenant(tenantId: string): Promise<boolean> {
  const tenant = await getTenantById(tenantId)
  return Boolean(tenant?.clerk_org_id)
}

export const ORGANIZATION_REQUIRED_ERROR = {
  error:
    "Switch to an organization to create a hackathon. Personal accounts can't host events.",
  code: "organization_required" as const,
}

export function organizationRequiredResponse(): Response {
  return new Response(JSON.stringify(ORGANIZATION_REQUIRED_ERROR), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  })
}

export async function updateTenantName(
  tenantId: string,
  name: string
): Promise<Tenant | null> {
  const { data, error } = await getSupabase()
    .from("tenants")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", tenantId)
    .select()
    .single()

  if (error || !data) {
    console.error("Failed to update tenant:", error)
    return null
  }

  return data as Tenant
}

export interface TenantSearchResult {
  id: string
  name: string
  slug: string | null
  logo_url: string | null
  logo_url_dark: string | null
  website_url: string | null
}

export async function searchTenants(
  query: string,
  options?: { excludeIds?: string[]; limit?: number }
): Promise<TenantSearchResult[]> {
  if (!query || query.length < 2) return []

  const limit = options?.limit ?? 10
  const excludeIds = options?.excludeIds ?? []

  const sanitized = query.replace(/[%_().,\\]/g, "")
  if (sanitized.length < 2) return []

  let queryBuilder = getSupabase()
    .from("tenants")
    .select("id, name, slug, logo_url, logo_url_dark, website_url")
    .or(`name.ilike.%${sanitized}%,slug.ilike.%${sanitized}%`)
    .not("slug", "is", null)
    .limit(limit)

  if (excludeIds.length > 0) {
    queryBuilder = queryBuilder.not("id", "in", `(${excludeIds.join(",")})`)
  }

  const { data, error } = await queryBuilder

  if (error) {
    console.error("Failed to search tenants:", error)
    return []
  }

  return (data ?? []) as TenantSearchResult[]
}
