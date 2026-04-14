import { supabase as getSupabase } from "@/lib/db/client"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { HackathonSponsor, SponsorTier } from "@/lib/db/hackathon-types"

export interface AddSponsorInput {
  hackathonId: string
  name: string
  logoUrl?: string | null
  logoUrlDark?: string | null
  websiteUrl?: string | null
  tier?: SponsorTier
  customTierLabel?: string | null
  sponsorTenantId?: string | null
  tenantSponsorId?: string | null
  useOrgAssets?: boolean
  displayOrder?: number
}

export async function addSponsor(input: AddSponsorInput): Promise<HackathonSponsor | null> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data, error } = await client
    .from("hackathon_sponsors")
    .insert({
      hackathon_id: input.hackathonId,
      name: input.name,
      logo_url: input.logoUrl ?? null,
      logo_url_dark: input.logoUrlDark ?? null,
      website_url: input.websiteUrl ?? null,
      tier: input.tier ?? "none",
      custom_tier_label: input.tier === "custom" ? (input.customTierLabel ?? null) : null,
      sponsor_tenant_id: input.sponsorTenantId ?? null,
      tenant_sponsor_id: input.tenantSponsorId ?? null,
      use_org_assets: input.useOrgAssets ?? false,
      display_order: input.displayOrder ?? 0,
    })
    .select()
    .single()

  if (error) {
    console.error("Failed to add sponsor:", error)
    return null
  }

  return data as unknown as HackathonSponsor
}

export async function removeSponsor(sponsorId: string, hackathonId: string): Promise<boolean> {
  const client = getSupabase() as unknown as SupabaseClient

  try {
    const { deleteSponsorLogo } = await import("@/lib/services/storage")
    await deleteSponsorLogo(hackathonId, sponsorId, "light")
    await deleteSponsorLogo(hackathonId, sponsorId, "dark")
  } catch {
    // Logo cleanup is best-effort, don't fail sponsor removal
  }

  const { error } = await client
    .from("hackathon_sponsors")
    .delete()
    .eq("id", sponsorId)
    .eq("hackathon_id", hackathonId)

  if (error) {
    console.error("Failed to remove sponsor:", error)
    return false
  }

  return true
}

export async function listHackathonSponsors(
  hackathonId: string
): Promise<HackathonSponsor[]> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data, error } = await client
    .from("hackathon_sponsors")
    .select("*")
    .eq("hackathon_id", hackathonId)
    .order("tier")
    .order("display_order")

  if (error) {
    console.error("Failed to list sponsors:", error)
    return []
  }

  return data as unknown as HackathonSponsor[]
}

export async function updateSponsor(
  sponsorId: string,
  updates: Partial<Omit<AddSponsorInput, "hackathonId">>,
  hackathonId: string
): Promise<HackathonSponsor | null> {
  const client = getSupabase() as unknown as SupabaseClient

  const updateData: Record<string, unknown> = {}
  if (updates.name !== undefined) updateData.name = updates.name
  if (updates.logoUrl !== undefined) updateData.logo_url = updates.logoUrl
  if (updates.logoUrlDark !== undefined) updateData.logo_url_dark = updates.logoUrlDark
  if (updates.websiteUrl !== undefined) updateData.website_url = updates.websiteUrl
  if (updates.tier !== undefined) {
    updateData.tier = updates.tier
    if (updates.tier !== "custom") updateData.custom_tier_label = null
  }
  if (updates.customTierLabel !== undefined) updateData.custom_tier_label = updates.customTierLabel
  if (updates.sponsorTenantId !== undefined) updateData.sponsor_tenant_id = updates.sponsorTenantId
  if (updates.useOrgAssets !== undefined) updateData.use_org_assets = updates.useOrgAssets
  if (updates.displayOrder !== undefined) updateData.display_order = updates.displayOrder

  const { data, error } = await client
    .from("hackathon_sponsors")
    .update(updateData)
    .eq("id", sponsorId)
    .eq("hackathon_id", hackathonId)
    .select()
    .single()

  if (error) {
    console.error("Failed to update sponsor:", error)
    return null
  }

  return data as unknown as HackathonSponsor
}

export async function reorderSponsors(
  hackathonId: string,
  sponsorIds: string[]
): Promise<boolean> {
  const client = getSupabase() as unknown as SupabaseClient

  const updates = sponsorIds.map((id, index) => ({
    id,
    display_order: index,
  }))

  for (const update of updates) {
    const { error } = await client
      .from("hackathon_sponsors")
      .update({ display_order: update.display_order })
      .eq("id", update.id)
      .eq("hackathon_id", hackathonId)

    if (error) {
      console.error("Failed to reorder sponsor:", error)
      return false
    }
  }

  return true
}

export type SponsorWithTenant = HackathonSponsor & {
  tenant?: {
    slug: string | null
    name: string
    logo_url: string | null
    logo_url_dark: string | null
    website_url: string | null
    description: string | null
  } | null
}

export async function listHackathonSponsorsWithTenants(
  hackathonId: string
): Promise<SponsorWithTenant[]> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data, error } = await client
    .from("hackathon_sponsors")
    .select(`
      *,
      tenant:tenants!sponsor_tenant_id(slug, name, logo_url, logo_url_dark, website_url, description)
    `)
    .eq("hackathon_id", hackathonId)
    .order("tier")
    .order("display_order")

  if (error) {
    console.error("Failed to list sponsors with tenants:", error)
    return []
  }

  return data as unknown as SponsorWithTenant[]
}
