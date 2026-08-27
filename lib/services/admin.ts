import { supabase as getSupabase } from "@/lib/db/client"
import type { HackathonStatus } from "@/lib/db/hackathon-types"
import type { Database } from "@/lib/db/types"

export async function getPlatformStats() {
  const db = getSupabase()

  const [tenants, hackathons, participants, submissions] = await Promise.all([
    db.from("tenants").select("id", { count: "exact", head: true }),
    db.from("hackathons").select("id", { count: "exact", head: true }),
    db.from("hackathon_participants").select("id", { count: "exact", head: true }),
    db.from("submissions").select("id", { count: "exact", head: true }),
  ])

  return {
    tenants: tenants.count ?? 0,
    hackathons: hackathons.count ?? 0,
    participants: participants.count ?? 0,
    submissions: submissions.count ?? 0,
  }
}

export type ListHackathonsOptions = {
  limit?: number
  offset?: number
  status?: string
  tenantId?: string
  search?: string
}

const MAX_PAGE_SIZE = 100

export async function listAllHackathons(options: ListHackathonsOptions = {}) {
  const db = getSupabase()
  const { limit: rawLimit = 50, offset = 0, status, tenantId, search } = options
  const limit = Math.min(Math.max(rawLimit, 1), MAX_PAGE_SIZE)

  let query = db
    .from("hackathons")
    .select("*, tenants!inner(id, name, slug)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)

  if (status) {
    query = query.eq("status", status as HackathonStatus)
  }
  if (tenantId) {
    query = query.eq("tenant_id", tenantId)
  }
  if (search) {
    query = query.ilike("name", `%${search}%`)
  }

  const { data, error, count } = await query

  if (error) {
    throw new Error(`Failed to list hackathons: ${error.message}`)
  }

  return { hackathons: data ?? [], total: count ?? 0 }
}

export async function getHackathonById(id: string) {
  const db = getSupabase()

  const { data, error } = await db
    .from("hackathons")
    .select("*, tenants!inner(id, name, slug)")
    .eq("id", id)
    .single()

  if (error || !data) {
    return null
  }

  return data
}

type LocationType = Database["public"]["Enums"]["location_type"]

export type UpdateHackathonFields = {
  name?: string
  slug?: string
  description?: string | null
  starts_at?: string | null
  ends_at?: string | null
  registration_opens_at?: string | null
  registration_closes_at?: string | null
  min_team_size?: number | null
  max_team_size?: number | null
  max_participants?: number | null
  allow_solo?: boolean | null
  anonymous_judging?: boolean
  rules?: string | null
  location_type?: LocationType | null
  location_name?: string | null
  location_url?: string | null
}

export async function updateHackathonAsAdmin(id: string, fields: UpdateHackathonFields) {
  const db = getSupabase()

  const { data, error } = await db
    .from("hackathons")
    .update(fields)
    .eq("id", id)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to update hackathon: ${error.message}`)
  }

  return data
}

export async function deleteHackathon(id: string) {
  const db = getSupabase()

  const { error } = await db.from("hackathons").delete().eq("id", id)

  if (error) {
    throw new Error(`Failed to delete hackathon: ${error.message}`)
  }
}
