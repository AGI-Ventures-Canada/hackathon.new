import { supabase as getSupabase } from "@/lib/db/client"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { TenantProfile, Hackathon } from "@/lib/db/hackathon-types"
import { sortByStartDate } from "@/lib/utils/format"
import { isHackathonCreationReady } from "@/lib/utils/hackathon-creation-state"

export async function getPublicTenantBySlug(
  slug: string
): Promise<TenantProfile | null> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data, error } = await client
    .from("tenants")
    .select("id, clerk_org_id, clerk_user_id, name, slug, logo_url, logo_url_dark, description, website_url, created_at, updated_at")
    .eq("slug", slug)
    .single()

  if (error) {
    console.error("Failed to get public tenant by slug:", error)
    return null
  }

  return data as unknown as TenantProfile
}

export async function getPublicTenantById(
  tenantId: string
): Promise<TenantProfile | null> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data, error } = await client
    .from("tenants")
    .select("id, clerk_org_id, clerk_user_id, name, slug, logo_url, logo_url_dark, description, website_url, created_at, updated_at")
    .eq("id", tenantId)
    .single()

  if (error) {
    console.error("Failed to get public tenant by ID:", error)
    return null
  }

  return data as unknown as TenantProfile
}

export async function updateTenantProfile(
  tenantId: string,
  updates: {
    slug?: string | null
    logoUrl?: string | null
    logoUrlDark?: string | null
    description?: string | null
    websiteUrl?: string | null
    name?: string
  }
): Promise<TenantProfile | null> {
  const client = getSupabase() as unknown as SupabaseClient

  const updateData: Record<string, unknown> = {}
  if (updates.slug !== undefined) updateData.slug = updates.slug
  if (updates.logoUrl !== undefined) updateData.logo_url = updates.logoUrl
  if (updates.logoUrlDark !== undefined) updateData.logo_url_dark = updates.logoUrlDark
  if (updates.description !== undefined) updateData.description = updates.description
  if (updates.websiteUrl !== undefined) updateData.website_url = updates.websiteUrl
  if (updates.name !== undefined) updateData.name = updates.name

  const { data, error } = await client
    .from("tenants")
    .update(updateData)
    .eq("id", tenantId)
    .select("id, clerk_org_id, clerk_user_id, name, slug, logo_url, logo_url_dark, description, website_url, created_at, updated_at")
    .single()

  if (error) {
    console.error("Failed to update tenant profile:", error)
    return null
  }

  return data as unknown as TenantProfile
}

export async function isSlugAvailable(
  slug: string,
  excludeTenantId?: string
): Promise<boolean> {
  const client = getSupabase() as unknown as SupabaseClient

  let query = client
    .from("tenants")
    .select("id")
    .eq("slug", slug)

  if (excludeTenantId) {
    query = query.neq("id", excludeTenantId)
  }

  const { data, error } = await query.maybeSingle()

  if (error) {
    console.error("Failed to check slug availability:", error)
    return false
  }

  return data === null
}

export type OrganizedHackathon = Hackathon & { role: "organizer" }
export type SponsoredHackathon = Hackathon & {
  role: "sponsor"
  organizer: Pick<TenantProfile, "id" | "name" | "slug" | "logo_url" | "logo_url_dark">
}

export type TenantWithHackathons = TenantProfile & {
  hackathons: Hackathon[]
}

export type TenantWithEvents = TenantProfile & {
  organizedHackathons: OrganizedHackathon[]
  sponsoredHackathons: SponsoredHackathon[]
}

const PUBLIC_EVENT_FIELDS = "id, slug, name, description, banner_url, status, starts_at, ends_at, registration_opens_at, registration_closes_at, is_test_event, metadata"

export async function getPublicTenantWithHackathons(
  slug: string
): Promise<TenantWithHackathons | null> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: tenant, error: tenantError } = await client
    .from("tenants")
    .select("id, clerk_org_id, clerk_user_id, name, slug, logo_url, logo_url_dark, description, website_url, created_at, updated_at")
    .eq("slug", slug)
    .single()

  if (tenantError || !tenant) {
    console.error("Failed to get public tenant:", tenantError)
    return null
  }

  const { data: hackathons, error: hackathonsError } = await client
    .from("hackathons")
    .select(PUBLIC_EVENT_FIELDS)
    .eq("tenant_id", tenant.id)
    .eq("is_test_event", false)
    .in("status", ["published", "registration_open", "active", "judging", "completed"])
    .order("starts_at", { ascending: false })

  if (hackathonsError) {
    console.error("Failed to get tenant hackathons:", hackathonsError)
  }

  return {
    ...(tenant as unknown as TenantProfile),
    hackathons: ((hackathons || []) as unknown as Hackathon[])
      .filter(isHackathonCreationReady)
      .map((hackathon) => {
        const { metadata: _metadata, ...publicHackathon } = hackathon
        return publicHackathon as Hackathon
      }),
  }
}

export async function getPublicTenantWithEvents(
  slug: string
): Promise<TenantWithEvents | null> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: tenant, error: tenantError } = await client
    .from("tenants")
    .select("id, clerk_org_id, clerk_user_id, name, slug, logo_url, logo_url_dark, description, website_url, created_at, updated_at")
    .eq("slug", slug)
    .single()

  if (tenantError || !tenant) {
    if (tenantError && tenantError.code !== "PGRST116") {
      console.error("Failed to get public tenant:", tenantError)
    }
    return null
  }

  const { data: organizedHackathons, error: organizedError } = await client
    .from("hackathons")
    .select(PUBLIC_EVENT_FIELDS)
    .eq("tenant_id", tenant.id)
    .eq("is_test_event", false)
    .in("status", ["published", "registration_open", "active", "judging", "completed"])
    .order("starts_at", { ascending: false })

  if (organizedError) {
    console.error("Failed to get organized hackathons:", organizedError)
  }

  const { data: sponsorships, error: sponsorshipsError } = await client
    .from("hackathon_sponsors")
    .select(`
      hackathon_id,
      hackathons!inner(
        id, slug, name, description, banner_url, status, starts_at, ends_at, registration_opens_at, registration_closes_at, is_test_event, metadata,
        organizer:tenants!tenant_id(id, name, slug, logo_url, logo_url_dark)
      )
    `)
    .eq("sponsor_tenant_id", tenant.id)
    .eq("hackathons.is_test_event", false)

  if (sponsorshipsError) {
    console.error("Failed to get sponsored hackathons:", sponsorshipsError)
  }

  const sponsoredHackathons = sortByStartDate(
    (sponsorships || [])
      .map((s) => {
        const hackathon = s.hackathons as unknown as Hackathon & {
          organizer: Pick<TenantProfile, "id" | "name" | "slug" | "logo_url" | "logo_url_dark">
        }
        return hackathon
      })
      .filter(isHackathonCreationReady)
      .map((hackathon) => {
        const { metadata: _metadata, ...publicHackathon } = hackathon
        return publicHackathon
      })
      .filter((h) =>
        ["published", "registration_open", "active", "judging", "completed"].includes(h.status)
      ),
    true
  )

  return {
    ...(tenant as unknown as TenantProfile),
    organizedHackathons: ((organizedHackathons || []) as unknown as Hackathon[])
      .filter(isHackathonCreationReady)
      .map((h) => {
        const { metadata: _metadata, ...publicHackathon } = h
        return { ...publicHackathon, role: "organizer" as const } as OrganizedHackathon
      }),
    sponsoredHackathons: sponsoredHackathons.map((h) => ({
      ...h,
      role: "sponsor" as const,
    })) as SponsoredHackathon[],
  }
}
