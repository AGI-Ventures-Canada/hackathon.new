import { supabase as getSupabase } from "@/lib/db/client"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  type Hackathon,
  type TenantProfile,
  type HackathonSponsor,
  type HackathonStatus,
  type HackathonJudgeDisplay,
  type Prize,
  type JudgingMode,
} from "@/lib/db/hackathon-types"
import { currentTermsHash } from "@/lib/services/hackathon-terms"
import { notifyReviewedTeamMembers } from "@/lib/services/hackathons"

export type PublicPrize = Omit<Prize, "distribution_method" | "monetary_value" | "currency">
export const PUBLISHED_STATUSES: HackathonStatus[] = ["published", "registration_open", "active", "judging", "completed"]
import { getEffectiveStatus } from "@/lib/utils/timeline"
import { sortByStatusPriority } from "@/lib/utils/sort-hackathons"
import {
  isHackathonCreationReady,
  READY_HACKATHON_POSTGREST_FILTER,
} from "@/lib/utils/hackathon-creation-state"

export type PublicHackathon = Hackathon & {
  stored_status?: HackathonStatus
  organizer: Pick<TenantProfile, "id" | "name" | "slug" | "logo_url" | "logo_url_dark" | "clerk_org_id" | "clerk_user_id">
  sponsors: (HackathonSponsor & {
    tenant?: Pick<
      TenantProfile,
      "slug" | "name" | "logo_url" | "logo_url_dark" | "website_url" | "description"
    > | null
  })[]
  judges: HackathonJudgeDisplay[]
  prizes: PublicPrize[]
  terms_hash: string | null
}

export type PublicHackathonClientDto = PublicHackathon

export function isPublicHackathonOrganizer(
  hackathon: PublicHackathon,
  viewer: { orgId: string | null; userId: string | null },
): boolean {
  return Boolean(
    (viewer.orgId && hackathon.organizer.clerk_org_id === viewer.orgId) ||
    (viewer.userId &&
      hackathon.organizer.clerk_user_id &&
      hackathon.organizer.clerk_user_id === viewer.userId),
  )
}

export function toPublicHackathonClientDto(
  hackathon: PublicHackathon,
  options?: { includeEditorSponsorData?: boolean; includePrivateLocation?: boolean },
): PublicHackathonClientDto {
  const {
    stored_status: _storedStatus,
    tenant_id: _tenantId,
    metadata: _metadata,
    created_at: _createdAt,
    updated_at: _updatedAt,
    location_latitude: _locationLatitude,
    location_longitude: _locationLongitude,
    location_url: privateLocationUrl,
    community_url: privateCommunityUrl,
    winner_emails_sent_at: _winnerEmailsSentAt,
    results_announcement_sent_at: _resultsAnnouncementSentAt,
    feedback_survey_sent_at: _feedbackSurveySentAt,
    feedback_survey_url: _feedbackSurveyUrl,
    organizer: _organizer,
    sponsors: _sponsors,
    judges: _judges,
    prizes: _prizes,
    ...visibleHackathon
  } = hackathon
  const {
    id: _organizerId,
    clerk_org_id: _clerkOrgId,
    clerk_user_id: _clerkUserId,
    ...organizer
  } = hackathon.organizer
  const sponsors = hackathon.sponsors.map((sponsor) =>
    options?.includeEditorSponsorData ? sponsor : (() => {
      const {
        hackathon_id: _hackathonId,
        sponsor_tenant_id: _sponsorTenantId,
        tenant_sponsor_id: _tenantSponsorId,
        created_at: _sponsorCreatedAt,
        ...visibleSponsor
      } = sponsor
      return visibleSponsor
    })(),
  )

  return {
    ...visibleHackathon,
    location_url: options?.includePrivateLocation ? privateLocationUrl : null,
    community_url: options?.includePrivateLocation ? privateCommunityUrl : null,
    organizer,
    sponsors,
    judges: hackathon.judges.map((judge) => {
      const {
        hackathon_id: _hackathonId,
        clerk_user_id: _judgeClerkUserId,
        participant_id: _participantId,
        created_at: _judgeCreatedAt,
        updated_at: _judgeUpdatedAt,
        ...visibleJudge
      } = judge
      return visibleJudge
    }),
    prizes: hackathon.prizes
      .filter((prize) => options?.includeEditorSponsorData || !prize.is_screening)
      .map((prize) => {
      const {
        hackathon_id: _hackathonId,
        criteria_id: _criteriaId,
        prize_track_id: _prizeTrackId,
        round_id: _roundId,
        assignment_mode: _assignmentMode,
        max_picks: _maxPicks,
        created_at: _prizeCreatedAt,
        updated_at: _prizeUpdatedAt,
        ...visiblePrize
      } = prize
      return visiblePrize
      }),
  } as unknown as PublicHackathonClientDto
}

export async function getPublicHackathonById(
  id: string
): Promise<{ slug: string } | null> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data, error } = await client
    .from("hackathons")
    .select("slug, metadata")
    .eq("id", id)
    .single()

  if (error || !data || !isHackathonCreationReady(data)) {
    return null
  }

  return { slug: data.slug }
}

export async function getPublicHackathon(
  slug: string,
  options?: { includeUnpublished?: boolean }
): Promise<PublicHackathon | null> {
  const client = getSupabase() as unknown as SupabaseClient

  let query = client
    .from("hackathons")
    .select(`
      *,
      organizer:tenants!tenant_id(id, name, slug, logo_url, logo_url_dark, clerk_org_id, clerk_user_id)
    `)
    .eq("slug", slug)

  if (!options?.includeUnpublished) {
    query = query.in("status", PUBLISHED_STATUSES)
  }

  const { data: hackathon, error: hackathonError } = await query.single()

  if (hackathonError || !hackathon) {
    // Only log actual errors, not "not found" (PGRST116 = 0 rows)
    if (hackathonError && hackathonError.code !== "PGRST116") {
      console.error("Failed to get public hackathon:", hackathonError)
    }
    return null
  }
  if (!isHackathonCreationReady(hackathon)) return null

  const { data: sponsors, error: sponsorsError } = await client
    .from("hackathon_sponsors")
    .select(`
      *,
      tenant:tenants!sponsor_tenant_id(slug, name, logo_url, logo_url_dark, website_url, description)
    `)
    .eq("hackathon_id", hackathon.id)
    .order("tier")
    .order("display_order")

  if (sponsorsError) {
    console.error("Failed to get hackathon sponsors:", sponsorsError)
  }

  const { data: judges, error: judgesError } = await client
    .from("hackathon_judges_display")
    .select("*")
    .eq("hackathon_id", hackathon.id)
    .order("display_order")

  if (judgesError) {
    console.error("Failed to get hackathon judges:", judgesError)
  }

  const { data: prizes, error: prizesError } = await client
    .from("prizes")
    .select("*")
    .eq("hackathon_id", hackathon.id)
    .order("display_order")

  if (prizesError) {
    console.error("Failed to get hackathon prizes:", prizesError)
  }

  const publicPrizes = ((prizes || []) as unknown as Prize[]).map(({
    distribution_method: _distributionMethod,
    monetary_value: _monetaryValue,
    currency: _currency,
    ...rest
  }) => rest)

  const termsHash = await currentTermsHash(hackathon as Hackathon)

  return {
    ...hackathon,
    stored_status: hackathon.status,
    status: getEffectiveStatus(hackathon),
    sponsors: sponsors || [],
    judges: (judges || []) as unknown as HackathonJudgeDisplay[],
    prizes: publicPrizes,
    terms_hash: termsHash,
  } as unknown as PublicHackathon
}

type HackathonWithOrganizer = Hackathon & {
  organizer: Pick<TenantProfile, "id" | "name" | "slug" | "logo_url" | "logo_url_dark" | "clerk_org_id">
}

export async function listPublicHackathons(
  options?: { search?: string; page?: number; limit?: number }
): Promise<{ hackathons: HackathonWithOrganizer[]; total: number }> {
  const client = getSupabase() as unknown as SupabaseClient
  const page = options?.page ?? 1
  const limit = options?.limit ?? 9
  const offset = (page - 1) * limit

  let countQuery = client
    .from("hackathons")
    .select("id", { count: "exact", head: true })
    .in("status", PUBLISHED_STATUSES)
    .or(READY_HACKATHON_POSTGREST_FILTER)

  let dataQuery = client
    .from("hackathons")
    .select(`
      *,
      organizer:tenants!tenant_id(id, name, slug, logo_url, logo_url_dark, clerk_org_id)
    `)
    .in("status", PUBLISHED_STATUSES)
    .or(READY_HACKATHON_POSTGREST_FILTER)
    .order("status", { ascending: true })
    .order("starts_at", { ascending: true })
    .range(offset, offset + limit - 1)

  if (options?.search && options.search.length >= 2) {
    const sanitized = options.search.replace(/[%_().,\\]/g, "")
    if (sanitized.length >= 2) {
      const filter = `name.ilike.%${sanitized}%,description.ilike.%${sanitized}%`
      countQuery = countQuery.or(filter)
      dataQuery = dataQuery.or(filter)
    }
  }

  const [{ count, error: countError }, { data, error }] = await Promise.all([
    countQuery,
    dataQuery,
  ])

  if (error || countError) {
    console.error("Failed to list public hackathons:", error ?? countError)
    return { hackathons: [], total: 0 }
  }

  const hackathons = sortByStatusPriority(
    (data as unknown as HackathonWithOrganizer[]).filter(isHackathonCreationReady),
  )
    .map((h) => ({ ...h, status: getEffectiveStatus(h) })) as unknown as HackathonWithOrganizer[]

  return { hackathons, total: count ?? 0 }
}

export type OrganizerCheckResult =
  | { status: "ok"; hackathon: Hackathon }
  | { status: "not_found" }
  | { status: "not_authorized" }

export async function getHackathonByIdForOrganizer(
  hackathonId: string,
  tenantId: string
): Promise<Hackathon | null> {
  const result = await checkHackathonOrganizer(hackathonId, tenantId)
  return result.status === "ok" ? result.hackathon : null
}

export async function checkHackathonOrganizer(
  hackathonId: string,
  tenantId: string
): Promise<OrganizerCheckResult> {
  const { isValidUuid } = await import("@/lib/utils/uuid")
  if (!isValidUuid(hackathonId)) {
    return { status: "not_found" }
  }

  const client = getSupabase() as unknown as SupabaseClient

  const { data, error } = await client
    .from("hackathons")
    .select("*")
    .eq("id", hackathonId)
    .single()

  if (error || !data) {
    return { status: "not_found" }
  }

  if (!isHackathonCreationReady(data)) {
    return { status: "not_found" }
  }

  if (data.tenant_id !== tenantId) {
    return { status: "not_authorized" }
  }

  return { status: "ok", hackathon: data as unknown as Hackathon }
}

export async function getHackathonByIdWithFullData(
  hackathonId: string,
  tenantId: string
): Promise<PublicHackathon | null> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: hackathon, error: hackathonError } = await client
    .from("hackathons")
    .select(`
      *,
      organizer:tenants!tenant_id(id, name, slug, logo_url, logo_url_dark, clerk_org_id)
    `)
    .eq("id", hackathonId)
    .eq("tenant_id", tenantId)
    .single()

  if (hackathonError || !hackathon) {
    if (hackathonError && hackathonError.code !== "PGRST116") {
      console.error("Failed to get hackathon with full data:", hackathonError)
    }
    return null
  }
  if (!isHackathonCreationReady(hackathon)) return null

  const { data: sponsors, error: sponsorsError } = await client
    .from("hackathon_sponsors")
    .select(`
      *,
      tenant:tenants!sponsor_tenant_id(slug, name, logo_url, logo_url_dark)
    `)
    .eq("hackathon_id", hackathon.id)
    .order("tier")
    .order("display_order")

  if (sponsorsError) {
    console.error("Failed to get hackathon sponsors:", sponsorsError)
  }

  const { data: judges } = await client
    .from("hackathon_judges_display")
    .select("*")
    .eq("hackathon_id", hackathon.id)
    .order("display_order")

  const { data: prizes } = await client
    .from("prizes")
    .select("*")
    .eq("hackathon_id", hackathon.id)
    .order("display_order")

  const fullPrizes = ((prizes || []) as unknown as Prize[]).map(({
    distribution_method: _distributionMethod,
    monetary_value: _monetaryValue,
    currency: _currency,
    ...rest
  }) => rest)

  const termsHash = await currentTermsHash(hackathon as Hackathon)

  return {
    ...hackathon,
    status: getEffectiveStatus(hackathon),
    sponsors: sponsors || [],
    judges: (judges || []) as unknown as HackathonJudgeDisplay[],
    prizes: fullPrizes,
    terms_hash: termsHash,
  } as unknown as PublicHackathon
}

export async function getHackathonByIdWithAccess(
  hackathonId: string,
  tenantId: string,
  clerkUserId: string
): Promise<(Hackathon & { isOrganizer: boolean; isSponsor: boolean }) | null> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data: hackathon, error: hackathonError } = await client
    .from("hackathons")
    .select("*")
    .eq("id", hackathonId)
    .single()

  if (hackathonError || !hackathon) {
    return null
  }
  if (!isHackathonCreationReady(hackathon)) return null

  const isOrganizer = hackathon.tenant_id === tenantId

  if (isOrganizer) {
    return { ...(hackathon as unknown as Hackathon), isOrganizer: true, isSponsor: false }
  }

  const { data: sponsor } = await client
    .from("hackathon_sponsors")
    .select("id")
    .eq("hackathon_id", hackathonId)
    .eq("sponsor_tenant_id", tenantId)
    .single()

  if (sponsor) {
    return { ...(hackathon as unknown as Hackathon), isOrganizer: false, isSponsor: true }
  }

  const { data: participant } = await client
    .from("hackathon_participants")
    .select("id")
    .eq("hackathon_id", hackathonId)
    .eq("clerk_user_id", clerkUserId)
    .single()

  if (participant) {
    return { ...(hackathon as unknown as Hackathon), isOrganizer: false, isSponsor: false }
  }

  return null
}

export async function updateHackathonSettings(
  hackathonId: string,
  tenantId: string,
  updates: {
    bannerUrl?: string | null
    name?: string
    description?: string | null
    rules?: string | null
    startsAt?: string | null
    endsAt?: string | null
    registrationOpensAt?: string | null
    registrationClosesAt?: string | null
    allowLateRegistration?: boolean
    status?: HackathonStatus
    anonymousJudging?: boolean
    judgingMode?: JudgingMode
    locationType?: "in_person" | "virtual" | "hybrid" | null
    locationName?: string | null
    locationUrl?: string | null
    locationLatitude?: number | null
    locationLongitude?: number | null
    requireLocationVerification?: boolean
    maxParticipants?: number | null
    minTeamSize?: number
    maxTeamSize?: number
    allowSolo?: boolean
    requireTeamApproval?: boolean
    communityUrl?: string | null
    communityLabel?: string | null
    requireTermsAcceptance?: boolean
    termsContent?: string | null
  },
  guard?: {
    expectedVersion: string
    allowedStatuses: readonly HackathonStatus[]
  },
): Promise<Hackathon | null> {
  const client = getSupabase() as unknown as SupabaseClient

  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  if (updates.bannerUrl !== undefined) updateData.banner_url = updates.bannerUrl
  if (updates.name !== undefined) updateData.name = updates.name
  if (updates.description !== undefined) updateData.description = updates.description
  if (updates.rules !== undefined) updateData.rules = updates.rules
  if (updates.startsAt !== undefined) updateData.starts_at = updates.startsAt
  if (updates.endsAt !== undefined) updateData.ends_at = updates.endsAt
  if (updates.registrationOpensAt !== undefined) updateData.registration_opens_at = updates.registrationOpensAt
  if (updates.registrationClosesAt !== undefined) updateData.registration_closes_at = updates.registrationClosesAt
  if (updates.allowLateRegistration !== undefined) updateData.allow_late_registration = updates.allowLateRegistration
  if (updates.status !== undefined) updateData.status = updates.status
  if (updates.anonymousJudging !== undefined) updateData.anonymous_judging = updates.anonymousJudging
  if (updates.judgingMode !== undefined) updateData.judging_mode = updates.judgingMode
  if (updates.locationType !== undefined) updateData.location_type = updates.locationType
  if (updates.locationName !== undefined) updateData.location_name = updates.locationName
  if (updates.locationUrl !== undefined) updateData.location_url = updates.locationUrl
  if (updates.locationLatitude !== undefined) updateData.location_latitude = updates.locationLatitude
  if (updates.locationLongitude !== undefined) updateData.location_longitude = updates.locationLongitude
  if (updates.requireLocationVerification !== undefined) updateData.require_location_verification = updates.requireLocationVerification
  if (updates.maxParticipants !== undefined) updateData.max_participants = updates.maxParticipants
  if (updates.minTeamSize !== undefined) updateData.min_team_size = updates.minTeamSize
  if (updates.maxTeamSize !== undefined) updateData.max_team_size = updates.maxTeamSize
  if (updates.allowSolo !== undefined) updateData.allow_solo = updates.allowSolo
  if (updates.requireTeamApproval !== undefined) updateData.require_team_approval = updates.requireTeamApproval
  if (updates.communityUrl !== undefined) updateData.community_url = updates.communityUrl
  if (updates.communityLabel !== undefined) updateData.community_label = updates.communityLabel
  if (updates.requireTermsAcceptance !== undefined) updateData.require_terms_acceptance = updates.requireTermsAcceptance
  if (updates.termsContent !== undefined) updateData.terms_content = updates.termsContent

  let pendingTeamsToNotify: Array<{
    id: string
    name: string
    hackathon_participants: { clerk_user_id: string }[] | null
  }> = []
  if (updates.requireTeamApproval === false) {
    const { data: pendingTeams, error: pendingTeamsError } = await client
      .from("teams")
      .select("id, name, hackathon_participants(clerk_user_id)")
      .eq("hackathon_id", hackathonId)
      .eq("status", "pending_approval")
    if (pendingTeamsError) {
      console.error("Failed to load waiting teams before disabling review:", pendingTeamsError)
    } else {
      pendingTeamsToNotify = (pendingTeams ?? []) as typeof pendingTeamsToNotify
    }
  }

  let query = client
    .from("hackathons")
    .update(updateData)
    .eq("id", hackathonId)
    .eq("tenant_id", tenantId)
  if (guard) {
    query = query
      .eq("updated_at", guard.expectedVersion)
      .in("status", [...guard.allowedStatuses])
  }
  const { data, error } = await query.select().maybeSingle()

  if (error || !data) {
    console.error("Failed to update hackathon settings:", error)
    return null
  }

  if (updates.requireTeamApproval === false) {
    await notifyAutoPromotedTeams(
      hackathonId,
      pendingTeamsToNotify,
    )
  }

  return data as unknown as Hackathon
}

async function notifyAutoPromotedTeams(
  hackathonId: string,
  promoted: Array<{
    id: string
    name: string
    hackathon_participants: { clerk_user_id: string }[] | null
  }>,
): Promise<void> {
  if (promoted.length === 0) return

  await Promise.all(
    promoted.map((team) =>
      notifyReviewedTeamMembers({
        hackathonId,
        acceptedMemberClerkUserIds: (team.hackathon_participants ?? []).map(
          (m) => m.clerk_user_id
        ),
        review: "approved",
      }).catch((err) =>
        console.error(`Failed to notify auto-promoted team ${team.id}:`, err)
      )
    )
  )
}

export async function updateHackathonTranslation(
  hackathonId: string,
  tenantId: string,
  locale: string,
  fields: {
    name?: string | null
    description?: string | null
    rules?: string | null
    location_name?: string | null
    community_label?: string | null
  }
): Promise<Hackathon | null> {
  const client = getSupabase() as unknown as SupabaseClient

  const payload: Record<string, string | null> = {}
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue
    payload[key] = value
  }

  const { data, error } = await client.rpc("upsert_hackathon_translation", {
    p_hackathon_id: hackathonId,
    p_tenant_id: tenantId,
    p_locale: locale,
    p_fields: payload,
  })

  if (error) {
    console.error("Failed to update hackathon translation:", error)
    return null
  }

  const rows = Array.isArray(data) ? data : data ? [data] : []
  if (rows.length === 0) return null

  return rows[0] as unknown as Hackathon
}

export async function deleteHackathon(
  hackathonId: string,
  tenantId: string
): Promise<boolean> {
  const client = getSupabase() as unknown as SupabaseClient

  const { error } = await client
    .from("hackathons")
    .delete()
    .eq("id", hackathonId)
    .eq("tenant_id", tenantId)

  if (error) {
    console.error("Failed to delete hackathon:", error)
    return false
  }

  return true
}
