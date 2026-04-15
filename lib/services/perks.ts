import { supabase as getSupabase } from "@/lib/db/client"
import type { SupabaseClient } from "@supabase/supabase-js"

export type PerkType = "api_key" | "credit" | "coupon" | "other"

export const PERK_TYPES: PerkType[] = ["api_key", "credit", "coupon", "other"]

export type Perk = {
  id: string
  hackathonId: string
  sponsorId: string | null
  name: string
  description: string | null
  type: PerkType
  code: string | null
  redemptionUrl: string | null
  instructions: string | null
  scheduledReleaseAt: string | null
  releasedAt: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export type PerkInput = {
  name: string
  description?: string | null
  type?: PerkType
  sponsorId?: string | null
  code?: string | null
  redemptionUrl?: string | null
  instructions?: string | null
  scheduledReleaseAt?: string | null
}

type PerkRow = {
  id: string
  hackathon_id: string
  sponsor_id: string | null
  name: string
  description: string | null
  type: string
  code: string | null
  redemption_url: string | null
  instructions: string | null
  scheduled_release_at: string | null
  released_at: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

function toPerkType(raw: string): PerkType {
  return PERK_TYPES.includes(raw as PerkType) ? (raw as PerkType) : "other"
}

function toPerk(row: PerkRow): Perk {
  return {
    id: row.id,
    hackathonId: row.hackathon_id,
    sponsorId: row.sponsor_id,
    name: row.name,
    description: row.description,
    type: toPerkType(row.type),
    code: row.code,
    redemptionUrl: row.redemption_url,
    instructions: row.instructions,
    scheduledReleaseAt: row.scheduled_release_at,
    releasedAt: row.released_at,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function isPerkReleased(
  perk: Pick<Perk, "releasedAt" | "scheduledReleaseAt">,
  hackathonStartsAt: string | null,
  now: Date = new Date(),
): boolean {
  if (perk.releasedAt) return true
  const nowMs = now.getTime()
  if (perk.scheduledReleaseAt) {
    return new Date(perk.scheduledReleaseAt).getTime() <= nowMs
  }
  if (hackathonStartsAt) {
    return new Date(hackathonStartsAt).getTime() <= nowMs
  }
  return false
}

async function assertHackathonOwnership(
  client: SupabaseClient,
  hackathonId: string,
  tenantId: string,
): Promise<boolean> {
  const { data, error } = await client
    .from("hackathons")
    .select("id")
    .eq("id", hackathonId)
    .eq("tenant_id", tenantId)
    .single()

  return !error && !!data
}

async function assertPerkOwnership(
  client: SupabaseClient,
  perkId: string,
  tenantId: string,
): Promise<string | null> {
  const { data, error } = await client
    .from("hackathon_perks")
    .select("hackathon_id, hackathons!inner(tenant_id)")
    .eq("id", perkId)
    .single()

  if (error || !data) return null
  const row = data as unknown as { hackathon_id: string; hackathons: { tenant_id: string } | { tenant_id: string }[] }
  const hackathon = Array.isArray(row.hackathons) ? row.hackathons[0] : row.hackathons
  if (!hackathon || hackathon.tenant_id !== tenantId) return null
  return row.hackathon_id
}

async function assertSponsorBelongsToHackathon(
  client: SupabaseClient,
  sponsorId: string,
  hackathonId: string,
): Promise<boolean> {
  const { data, error } = await client
    .from("hackathon_sponsors")
    .select("id")
    .eq("id", sponsorId)
    .eq("hackathon_id", hackathonId)
    .single()

  return !error && !!data
}

export async function listPerks(hackathonId: string): Promise<Perk[]> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data, error } = await client
    .from("hackathon_perks")
    .select("*")
    .eq("hackathon_id", hackathonId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })

  if (error) {
    console.error("Failed to list perks:", error)
    return []
  }

  return (data ?? []).map(toPerk)
}

export async function countPerks(hackathonId: string): Promise<number> {
  const client = getSupabase() as unknown as SupabaseClient

  const { count, error } = await client
    .from("hackathon_perks")
    .select("id", { count: "exact", head: true })
    .eq("hackathon_id", hackathonId)

  if (error) {
    console.error("Failed to count perks:", error)
    return 0
  }
  return count ?? 0
}

export async function getPerkById(perkId: string): Promise<Perk | null> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data, error } = await client
    .from("hackathon_perks")
    .select("*")
    .eq("id", perkId)
    .single()

  if (error || !data) return null
  return toPerk(data)
}

export async function createPerk(
  hackathonId: string,
  tenantId: string,
  input: PerkInput,
): Promise<Perk | null> {
  const client = getSupabase() as unknown as SupabaseClient

  const owns = await assertHackathonOwnership(client, hackathonId, tenantId)
  if (!owns) return null

  if (input.sponsorId) {
    const sponsorOk = await assertSponsorBelongsToHackathon(client, input.sponsorId, hackathonId)
    if (!sponsorOk) return null
  }

  const { data: maxRow } = await client
    .from("hackathon_perks")
    .select("sort_order")
    .eq("hackathon_id", hackathonId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextOrder = (maxRow?.sort_order ?? -1) + 1

  const { data, error } = await client
    .from("hackathon_perks")
    .insert({
      hackathon_id: hackathonId,
      sponsor_id: input.sponsorId ?? null,
      name: input.name,
      description: input.description ?? null,
      type: input.type ?? "other",
      code: input.code ?? null,
      redemption_url: input.redemptionUrl ?? null,
      instructions: input.instructions ?? null,
      scheduled_release_at: input.scheduledReleaseAt ?? null,
      sort_order: nextOrder,
    })
    .select("*")
    .single()

  if (error || !data) {
    console.error("Failed to create perk:", error)
    return null
  }

  return toPerk(data)
}

export async function updatePerk(
  perkId: string,
  tenantId: string,
  patch: Partial<PerkInput>,
): Promise<Perk | null> {
  const client = getSupabase() as unknown as SupabaseClient

  const hackathonId = await assertPerkOwnership(client, perkId, tenantId)
  if (!hackathonId) return null

  if (patch.sponsorId) {
    const sponsorOk = await assertSponsorBelongsToHackathon(client, patch.sponsorId, hackathonId)
    if (!sponsorOk) return null
  }

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  if (patch.name !== undefined) update.name = patch.name
  if (patch.description !== undefined) update.description = patch.description
  if (patch.type !== undefined) update.type = patch.type
  if (patch.sponsorId !== undefined) update.sponsor_id = patch.sponsorId
  if (patch.code !== undefined) update.code = patch.code
  if (patch.redemptionUrl !== undefined) update.redemption_url = patch.redemptionUrl
  if (patch.instructions !== undefined) update.instructions = patch.instructions
  if (patch.scheduledReleaseAt !== undefined) update.scheduled_release_at = patch.scheduledReleaseAt

  const { data, error } = await client
    .from("hackathon_perks")
    .update(update)
    .eq("id", perkId)
    .select("*")
    .single()

  if (error || !data) {
    console.error("Failed to update perk:", error)
    return null
  }

  return toPerk(data)
}

export async function deletePerk(
  perkId: string,
  tenantId: string,
): Promise<boolean> {
  const client = getSupabase() as unknown as SupabaseClient

  const hackathonId = await assertPerkOwnership(client, perkId, tenantId)
  if (!hackathonId) return false

  const { error } = await client.from("hackathon_perks").delete().eq("id", perkId)

  if (error) {
    console.error("Failed to delete perk:", error)
    return false
  }

  return true
}

export async function releasePerkNow(
  perkId: string,
  tenantId: string,
): Promise<Perk | null> {
  const client = getSupabase() as unknown as SupabaseClient

  const hackathonId = await assertPerkOwnership(client, perkId, tenantId)
  if (!hackathonId) return null

  const now = new Date().toISOString()
  const { data, error } = await client
    .from("hackathon_perks")
    .update({ released_at: now, updated_at: now })
    .eq("id", perkId)
    .select("*")
    .single()

  if (error || !data) {
    console.error("Failed to release perk:", error)
    return null
  }

  return toPerk(data)
}

export async function setPerksNone(
  hackathonId: string,
  tenantId: string,
  perksNone: boolean,
): Promise<boolean> {
  const client = getSupabase() as unknown as SupabaseClient

  const { error } = await client
    .from("hackathons")
    .update({ perks_none: perksNone, updated_at: new Date().toISOString() })
    .eq("id", hackathonId)
    .eq("tenant_id", tenantId)

  if (error) {
    console.error("Failed to set perks_none:", error)
    return false
  }
  return true
}

export async function getHackathonPerksContext(hackathonId: string): Promise<{
  startsAt: string | null
  perksNone: boolean
} | null> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data, error } = await client
    .from("hackathons")
    .select("starts_at, perks_none")
    .eq("id", hackathonId)
    .single()

  if (error || !data) return null
  const row = data as { starts_at: string | null; perks_none: boolean | null }
  return {
    startsAt: row.starts_at ?? null,
    perksNone: Boolean(row.perks_none),
  }
}
