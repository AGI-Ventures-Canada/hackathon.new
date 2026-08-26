import { createHackathon } from "@/lib/services/hackathons"
import { createHash, randomUUID } from "node:crypto"
import { deleteBanner, downloadAndUploadBanner } from "@/lib/services/storage"
import { addSponsor } from "@/lib/services/sponsors"
import { createPrize } from "@/lib/services/prizes"
import { createChallenge } from "@/lib/services/challenges"
import { createScheduleItem } from "@/lib/services/schedule-items"
import { extractExternalEventData, extractExternalRichContent, isLumaUrl } from "@/lib/services/external-import"
import { anchorAgendaTimestamp, composeAgendaDescription } from "@/lib/utils/agenda"
import { sanitizeIsoTimestamp } from "@/lib/utils/timestamp"
import { normalizeUrl, isSafeExternalUrl, redactImportSourceUrl } from "@/lib/utils/url"
import { supabase as getSupabase } from "@/lib/db/client"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Hackathon, SponsorTier } from "@/lib/db/hackathon-types"
import {
  buildTranslationRecord,
  normalizeLocale,
  type HackathonTranslations,
} from "@/lib/utils/language"
import { isValidUuid } from "@/lib/utils/uuid"
import {
  redactFetchErrorForLogs,
  redactUrlForLogs,
} from "@/lib/utils/safe-fetch-url"
import {
  hackathonDraftStateSchema,
  hasOffsetAwareDraftTimestamps,
  type DraftState,
} from "@/lib/hackathon-draft"
import type { LogAuditInput } from "@/lib/services/audit"
import type { Json } from "@/lib/db/types"

export type ImportHackathonInput = {
  name: string
  description: string | null
  startsAt: string | null
  endsAt: string | null
  registrationOpensAt?: string | null
  registrationClosesAt?: string | null
  locationType: "in_person" | "virtual" | "hybrid" | null
  locationName: string | null
  locationUrl: string | null
  imageUrl: string | null
  rules?: string | null
  defaultLocale?: string | null
}

export type TranslationLinkInput = {
  url: string
  languageCode: string
}

function shouldRecoverAmbiguousWrite(
  error: { message: string; code?: string } | null,
): boolean {
  if (!error) return true
  if (error.code) return false
  return /connection|fetch|network|response\s+lost|socket|timed?\s*out|timeout/i.test(
    error.message,
  )
}

async function findCompensationTarget(
  baseHackathon: Hackathon,
  marker?: OwnedAggregateCreationMarker,
): Promise<Hackathon | null> {
  const current = await findAggregateByDraftId(
    baseHackathon.tenant_id,
    baseHackathon.id,
  )
  if (
    !current ||
    current.status !== "draft" ||
    current.updated_at !== (marker?.baseUpdatedAt ?? baseHackathon.updated_at)
  ) return null

  const expectedMetadata = marker
    ? {
        ...aggregateMetadata(baseHackathon),
        aggregate_creation: marker,
      }
    : baseHackathon.metadata
  return jsonbValuesEqual(
    current.metadata,
    expectedMetadata as Json,
  )
    ? current
    : null
}

async function persistAggregateBaseVersion(
  hackathon: Hackathon,
  marker: OwnedAggregateCreationMarker,
): Promise<Hackathon | null> {
  if (marker.baseUpdatedAt || !hackathon.updated_at) return hackathon

  const replacement = { ...marker, baseUpdatedAt: hackathon.updated_at }
  const currentMetadata = aggregateMetadata(hackathon)
  const metadata = {
    ...currentMetadata,
    aggregate_creation: replacement,
  }
  const client = getSupabase() as unknown as SupabaseClient
  const { data, error } = await client
    .from("hackathons")
    .update({ metadata })
    .eq("id", hackathon.id)
    .eq("tenant_id", hackathon.tenant_id)
    .eq("status", "draft")
    .eq("updated_at", hackathon.updated_at)
    .eq("metadata", JSON.stringify(currentMetadata))
    .eq("metadata->aggregate_creation", JSON.stringify(marker))
    .select("id")
    .maybeSingle()
  if (
    (error || data?.id !== hackathon.id) &&
    shouldRecoverAmbiguousWrite(error)
  ) {
    try {
      const current = await findAggregateByDraftId(
        hackathon.tenant_id,
        hackathon.id,
      )
      if (
        current?.status === "draft" &&
        current.updated_at === hackathon.updated_at &&
        jsonbValuesEqual(
          aggregateMetadata(current).aggregate_creation,
          replacement as unknown as Json,
        )
      ) return current
    } catch {
      return null
    }
  }
  if (error || data?.id !== hackathon.id) return null

  return { ...hackathon, metadata }
}

async function recoverPersistedImportedDetails(
  hackathon: Hackathon,
  marker: OwnedAggregateCreationMarker,
  details: Record<string, Json>,
): Promise<Hackathon | null> {
  try {
    const current = await findAggregateByDraftId(
      hackathon.tenant_id,
      hackathon.id,
    )
    const currentMarker = current ? readAggregateCreationMarker(current) : null
    if (
      !current ||
      current.status !== "draft" ||
      current.updated_at !== marker.baseUpdatedAt ||
      !isOwnedAggregateCreationMarker(currentMarker) ||
      !jsonbValuesEqual(
        aggregateMarkerOwnership(currentMarker) as unknown as Json,
        aggregateMarkerOwnership(marker) as unknown as Json,
      )
    ) return null

    return Object.entries(details).every(
      ([key, value]) => Reflect.get(current, key) === value,
    )
      ? current
      : null
  } catch {
    return null
  }
}

async function rollbackHackathon(hackathon: Hackathon): Promise<boolean> {
  const current = await findCompensationTarget(hackathon)
  if (!current) return false
  const client = getSupabase() as unknown as SupabaseClient
  const { data, error } = await client
    .from("hackathons")
    .delete()
    .eq("id", hackathon.id)
    .eq("tenant_id", hackathon.tenant_id)
    .eq("status", "draft")
    .eq("updated_at", hackathon.updated_at)
    .eq("metadata", JSON.stringify(current.metadata))
    .select("id")
    .maybeSingle()
  if (error || data?.id !== hackathon.id) {
    console.error("Failed to roll back hackathon draft:", error)
    return false
  }
  return true
}

async function compensateHackathon(hackathon: Hackathon): Promise<boolean> {
  if (!(await findCompensationTarget(hackathon))) return false
  let bannerRemoved = false
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      if (await deleteBanner(hackathon.id)) {
        bannerRemoved = true
        break
      }
    } catch (error) {
      console.error(`Banner cleanup attempt ${attempt} failed for event ${hackathon.id}:`, error)
    }
  }

  if (!bannerRemoved) {
    console.error(`Keeping partial event ${hackathon.id} so banner cleanup can be retried`)
    return false
  }

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      if (await rollbackHackathon(hackathon)) return true
    } catch (error) {
      console.error(`Hackathon rollback attempt ${attempt} failed:`, error)
    }
  }

  console.error(`Failed to remove partial hackathon draft ${hackathon.id} after three attempts`)
  return false
}

export async function createHackathonFromImport(
  tenantId: string,
  input: ImportHackathonInput,
  options: {
    draftId?: string
    metadata?: Record<string, Json | undefined>
    onCreated?: (hackathon: Hackathon) => void
  } = {},
): Promise<Hackathon | null> {
  let createdHackathon = await createHackathon(tenantId, {
    id: options.draftId,
    name: input.name,
    description: input.description,
    metadata: options.metadata,
  }, { track: false })

  if (!createdHackathon && options.metadata) {
    const requestedMarker = readAggregateCreationMarker({
      metadata: options.metadata,
    } as unknown as Hackathon)
    if (isOwnedAggregateCreationMarker(requestedMarker)) {
      createdHackathon = await recoverAmbiguousAggregateInsert(
        tenantId,
        options.draftId,
        requestedMarker,
      )
    }
  }
  if (!createdHackathon) return null
  let hackathon: Hackathon = options.metadata
    ? {
        ...createdHackathon,
        metadata: {
          ...(createdHackathon.metadata &&
          typeof createdHackathon.metadata === "object" &&
          !Array.isArray(createdHackathon.metadata)
            ? createdHackathon.metadata
            : {}),
          ...options.metadata,
        },
      }
    : createdHackathon
  const initialMarker = readAggregateCreationMarker(hackathon)
  if (isOwnedAggregateCreationMarker(initialMarker)) {
    const persisted = await persistAggregateBaseVersion(hackathon, initialMarker)
    if (!persisted) {
      const compensated = await compensateHackathon(hackathon)
      if (!compensated) await markAggregateFailed(hackathon, initialMarker)
      return null
    }
    hackathon = persisted
  }
  options.onCreated?.(hackathon)

  try {
    const bannerResult = await downloadAndUploadBanner(hackathon.id, input.imageUrl)
    if (input.imageUrl && !bannerResult) throw new Error("Failed to import event image")

    const client = getSupabase() as unknown as SupabaseClient
    const details = {
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      registration_opens_at: input.registrationOpensAt ?? null,
      registration_closes_at: input.registrationClosesAt ?? null,
      allow_late_registration: true,
      location_type: input.locationType,
      location_name: input.locationName,
      location_url: input.locationUrl,
      banner_url: bannerResult?.url ?? null,
      rules: input.rules ?? null,
      default_locale: normalizeLocale(input.defaultLocale ?? null) ?? "en",
    }
    const marker = readAggregateCreationMarker(hackathon)
    if (isOwnedAggregateCreationMarker(marker)) {
      let update = client
        .from("hackathons")
        .update(details)
        .eq("id", hackathon.id)
        .eq("tenant_id", tenantId)
        .eq("status", "draft")
      if (marker.baseUpdatedAt) update = update.eq("updated_at", marker.baseUpdatedAt)
      const { data, error } = await update
        .contains("metadata", {
          aggregate_creation: aggregateMarkerOwnership(marker),
        })
        .select("id")
        .maybeSingle()
      if (error || data?.id !== hackathon.id) {
        if (shouldRecoverAmbiguousWrite(error)) {
          const recovered = await recoverPersistedImportedDetails(
            hackathon,
            marker,
            details as unknown as Record<string, Json>,
          )
          if (recovered) return recovered
        }
        throw new Error(error?.message ?? "Event creation ownership changed")
      }
    } else {
      let update = client
        .from("hackathons")
        .update(details)
        .eq("id", hackathon.id)
        .eq("tenant_id", tenantId)
        .eq("status", "draft")
      if (hackathon.updated_at) update = update.eq("updated_at", hackathon.updated_at)
      const { error } = await update
      if (error) throw new Error("Failed to save event details")
    }
    return {
      ...hackathon,
      ...details,
    } as Hackathon
  } catch (error) {
    console.error("Failed to configure imported hackathon:", error)
    const marker = readAggregateCreationMarker(hackathon)
    if (!isOwnedAggregateCreationMarker(marker)) {
      const compensated = await compensateHackathon(hackathon)
      if (!compensated && marker) await markAggregateFailed(hackathon, marker)
    }
    return null
  }
}

export type TranslationPrimary = {
  name: string
  description: string | null
  rules: string | null
  location_name: string | null
  community_label: string | null
}

const MAX_TRANSLATION_LINKS = 10

export async function importTranslationVariants({
  hackathonId,
  tenantId,
  primaryLocale,
  primary,
  translationLinks,
}: {
  hackathonId: string
  tenantId: string
  primaryLocale: string
  primary: TranslationPrimary
  translationLinks: TranslationLinkInput[]
}): Promise<void> {
  if (!translationLinks.length) return

  const seen = new Set<string>()
  const safeLinks: TranslationLinkInput[] = []
  for (const link of translationLinks) {
    if (safeLinks.length >= MAX_TRANSLATION_LINKS) break
    const url = normalizeUrl(link.url)
    if (seen.has(url)) continue
    if (!isSafeExternalUrl(url)) continue
    if (!isLumaUrl(url)) continue
    seen.add(url)
    safeLinks.push({ url, languageCode: link.languageCode })
  }

  if (!safeLinks.length) return

  const translations: HackathonTranslations = {}
  let incomplete = false

  const variantResults = await Promise.allSettled(
    safeLinks.map(async (link) => {
      const url = link.url
      const [eventData, richContent] = await Promise.all([
        extractExternalEventData(url),
        extractExternalRichContent(url),
      ])
      return { link, eventData, richContent }
    })
  )

  for (let i = 0; i < variantResults.length; i++) {
    const result = variantResults[i]
    const url = safeLinks[i].url
    if (result.status === "rejected") {
      console.error(
        `Failed to fetch translation variant ${redactUrlForLogs(url)}:`,
        redactFetchErrorForLogs(result.reason, [url]),
      )
      incomplete = true
      continue
    }

    const { link, eventData, richContent } = result.value
    if (!eventData) {
      console.warn(
        `Translation variant ${redactUrlForLogs(url)} returned no event data; skipping.`,
      )
      incomplete = true
      continue
    }

    const variantLocale =
      normalizeLocale(link.languageCode) ??
      normalizeLocale(eventData.language) ??
      null

    if (!variantLocale || variantLocale === primaryLocale) continue

    const record = buildTranslationRecord({
      primary,
      variant: {
        name: eventData.name,
        description: richContent?.cleanedDescription ?? eventData.description ?? null,
        rules: richContent?.rules ?? null,
        location_name: eventData.locationName,
        community_label: null,
      },
    })

    if (Object.keys(record).length > 0) {
      translations[variantLocale] = record
    }
  }

  if (!Object.keys(translations).length) {
    if (incomplete) throw new Error("Some event translations could not be imported")
    return
  }

  const client = getSupabase() as unknown as SupabaseClient
  for (const [locale, record] of Object.entries(translations)) {
    const { error } = await client.rpc("upsert_hackathon_translation", {
      p_hackathon_id: hackathonId,
      p_tenant_id: tenantId,
      p_locale: locale,
      p_fields: record,
    })
    if (error) {
      console.error(`Failed to write translation for locale ${locale}:`, error)
      incomplete = true
    }
  }

  if (incomplete) throw new Error("Some event translations could not be imported")
}

const VALID_TIERS = new Set<string>(["gold", "silver", "bronze", "custom", "none"])

export async function createSponsorsFromImport(
  hackathonId: string,
  sponsors: { name: string; tier: string | null }[]
): Promise<void> {
  for (let i = 0; i < sponsors.length; i++) {
    const s = sponsors[i]
    const tier = (s.tier && VALID_TIERS.has(s.tier) ? s.tier : "none") as SponsorTier
    const created = await addSponsor({
      hackathonId,
      name: s.name,
      tier,
      displayOrder: i,
    })
    if (!created) throw new Error("Failed to create sponsor")
  }
}

export async function createPrizesFromImport(
  hackathonId: string,
  prizes: { name: string; description?: string | null; value?: string | null }[]
): Promise<void> {
  for (let i = 0; i < prizes.length; i++) {
    const p = prizes[i]
    const created = await createPrize(hackathonId, {
      name: p.name,
      description: p.description ?? null,
      value: p.value ?? null,
      displayOrder: i,
    })
    if (!created) throw new Error("Failed to create prize")
  }
}

export async function createChallengesFromImport(
  hackathonId: string,
  tenantId: string,
  challenges: {
    title: string
    description?: string | null
    resources?: { label: string; url: string }[]
  }[]
): Promise<void> {
  for (const c of challenges) {
    const cleanedResources = (c.resources ?? [])
      .map((r) => ({ label: r.label?.trim() ?? "", url: normalizeUrl(r.url?.trim() ?? "") }))
      .filter((r) => r.url.length > 0 && isSafeExternalUrl(r.url))

    const created = await createChallenge(hackathonId, tenantId, {
      title: c.title,
      description: c.description ?? null,
      resources: cleanedResources,
    })
    if (!created) throw new Error("Failed to create challenge")
  }
}

export type ImportedAgendaItem = {
  title: string
  description?: string | null
  startsAt?: string | null
  endsAt?: string | null
  location?: string | null
  speakers?: string[]
}

type UsableAgendaItem = ImportedAgendaItem & { startsAt: string; title: string }

const MAX_AGENDA_ITEMS = 50
const MAX_AGENDA_TITLE_LEN = 200

function pickUsable(
  items: ImportedAgendaItem[],
  eventStartsAt: string | null
): UsableAgendaItem[] {
  const safeEventStartsAt = sanitizeIsoTimestamp(eventStartsAt)
  const usable: UsableAgendaItem[] = []
  for (const item of items) {
    if (usable.length >= MAX_AGENDA_ITEMS) break
    const startsAt = anchorAgendaTimestamp(sanitizeIsoTimestamp(item.startsAt), safeEventStartsAt)
    const title = item.title?.trim()
    if (!startsAt || !title) continue
    const endsAt = anchorAgendaTimestamp(sanitizeIsoTimestamp(item.endsAt), safeEventStartsAt)
    usable.push({
      ...item,
      startsAt,
      endsAt,
      title: title.slice(0, MAX_AGENDA_TITLE_LEN),
    })
  }
  const dropped = items.length - usable.length
  if (dropped > 0) {
    const overCap = Math.max(0, items.length - MAX_AGENDA_ITEMS)
    const invalid = dropped - overCap
    const reason =
      overCap > 0 && invalid > 0
        ? `${overCap} over cap, ${invalid} missing title or startsAt`
        : overCap > 0
          ? `exceeded ${MAX_AGENDA_ITEMS}-item cap`
          : "missing title or startsAt"
    console.warn(`Dropped ${dropped} of ${items.length} imported agenda items (${reason})`)
  }
  return usable
}

export async function createAgendaFromImport(
  hackathonId: string,
  items: ImportedAgendaItem[],
  eventStartsAt: string | null = null
): Promise<boolean> {
  const usable = pickUsable(items, eventStartsAt)
  if (!usable.length) return true

  const client = getSupabase() as unknown as SupabaseClient
  const insertedIds: string[] = []
  for (let i = 0; i < usable.length; i++) {
    const item = usable[i]
    const created = await createScheduleItem(hackathonId, {
      title: item.title,
      description: composeAgendaDescription(item.speakers, item.description) ?? undefined,
      startsAt: item.startsAt,
      endsAt: item.endsAt ?? undefined,
      location: item.location?.trim() || undefined,
      sortOrder: i,
    })
    if (!created) {
      console.warn(
        `Agenda import failed at item ${i + 1} of ${usable.length} for hackathon ${hackathonId}; rolling back ${insertedIds.length} partial inserts`
      )
      if (insertedIds.length > 0) {
        const { error: rollbackError } = await client
          .from("hackathon_schedule_items")
          .delete()
          .eq("hackathon_id", hackathonId)
          .in("id", insertedIds)
        if (rollbackError) {
          console.error(
            `Failed to roll back partial agenda inserts for hackathon ${hackathonId}:`,
            rollbackError
          )
        }
      }
      return false
    }
    insertedIds.push(created.id)
  }

  if (!insertedIds.length) return true

  // insertedIds are DB-generated UUIDs, never user input.
  const { error: deleteError } = await client
    .from("hackathon_schedule_items")
    .delete()
    .eq("hackathon_id", hackathonId)
    .is("trigger_type", null)
    .not("id", "in", `(${insertedIds.join(",")})`)

  if (deleteError) {
    console.error("Failed to clear default agenda items after import:", deleteError)
    return false
  }
  return true
}

export type CreateHackathonAggregateInput = DraftState & {
  defaultLocale?: string | null
  draftId?: string
}

const AGGREGATE_FINALIZATION_STEPS = ["audit", "translations", "webhook", "analytics"] as const
type AggregateFinalizationStep = (typeof AGGREGATE_FINALIZATION_STEPS)[number]

type AggregateFinalizationMarker = {
  contentFingerprint: string
  state: "running" | "failed" | "complete"
  attemptToken: string
  startedAt: string
  heartbeatAt: string
  leaseExpiresAt: string
  completedSteps: AggregateFinalizationStep[]
  completedAt?: string
}

type AggregateCreationMarker = {
  draftId: string
  contentFingerprint: string
  state: "building" | "compensating" | "complete" | "failed"
  startedAt: string
  attemptToken?: string
  heartbeatAt?: string
  leaseExpiresAt?: string
  baseUpdatedAt?: string
  completedAt?: string
  finalization?: AggregateFinalizationMarker
}

type OwnedAggregateCreationMarker = AggregateCreationMarker & {
  attemptToken: string
  heartbeatAt: string
  leaseExpiresAt: string
}

export type CreateHackathonAggregateResult =
  | { status: "created"; hackathon: Hackathon }
  | { status: "replayed"; hackathon: Hackathon }
  | {
      status: "invalid"
      hackathon: null
      error: {
        code:
          | "invalid_draft"
          | "incomplete_agenda"
          | "draft_organization_conflict"
        message: string
      }
    }
  | {
      status: "invalid"
      hackathon: Hackathon
      error: {
        code: "draft_conflict"
        message: string
      }
    }
  | { status: "in_progress"; hackathon: null }
  | { status: "failed"; hackathon: null }

export type HackathonCreationFinalizationResult =
  | { status: "complete" }
  | { status: "in_progress" }
  | { status: "failed" }
  | {
      status: "invalid"
      error: {
        code: "draft_conflict"
        message: string
      }
    }

export type HackathonCreationFinalizationInput = {
  tenantId: string
  principal: LogAuditInput["principal"]
  hackathon: Hackathon
  auditMetadata: Record<string, Json>
  webhookData: Record<string, Json>
  translations?: {
    primaryLocale: string
    primary: TranslationPrimary
    translationLinks: TranslationLinkInput[]
  }
}

const STALE_AGGREGATE_BUILD_MS = 10 * 60 * 1_000
const AGGREGATE_HEARTBEAT_MS = Math.floor(STALE_AGGREGATE_BUILD_MS / 3)
const CONTENT_FINGERPRINT_PATTERN = /^sha256:[0-9a-f]{64}$/

function canonicalizeAggregateContent(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeAggregateContent)
  if (!value || typeof value !== "object") return value

  const sorted: Record<string, unknown> = {}
  const keys = Object.keys(value).sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0
  )
  for (const key of keys) {
    const entry = Reflect.get(value, key)
    if (entry !== undefined) sorted[key] = canonicalizeAggregateContent(entry)
  }
  return sorted
}

function fingerprintAggregateContent(value: unknown): string {
  const canonical = JSON.stringify(canonicalizeAggregateContent(value))
  return `sha256:${createHash("sha256").update(canonical).digest("hex")}`
}

function sanitizeFinalizationMetadata(
  metadata: Record<string, Json>,
): Record<string, Json> {
  const sanitized = { ...metadata }
  const sourceUrl = sanitized.sourceUrl
  if (typeof sourceUrl !== "string") return sanitized
  delete sanitized.sourceUrl
  const redacted = redactImportSourceUrl(sourceUrl)
  if (redacted) sanitized.sourceUrl = redacted
  return sanitized
}

function draftConflictResult(hackathon: Hackathon): CreateHackathonAggregateResult {
  return {
    status: "invalid",
    hackathon,
    error: {
      code: "draft_conflict",
      message: "This saved draft already created an event. Open that event to continue.",
    },
  }
}

function draftOrganizationConflictResult(): CreateHackathonAggregateResult {
  return {
    status: "invalid",
    hackathon: null,
    error: {
      code: "draft_organization_conflict",
      message: "This saved draft was already used with another organization. Switch back to the organization you first used, then try again.",
    },
  }
}

function aggregateMetadata(
  hackathon: Hackathon,
): Record<string, Json | undefined> {
  return hackathon.metadata &&
    typeof hackathon.metadata === "object" &&
    !Array.isArray(hackathon.metadata)
    ? hackathon.metadata
    : {}
}

function readAggregateFinalizationMarker(value: unknown): AggregateFinalizationMarker | null {
  if (!value || typeof value !== "object") return null
  const contentFingerprint = Reflect.get(value, "contentFingerprint")
  const state = Reflect.get(value, "state")
  const attemptToken = Reflect.get(value, "attemptToken")
  const startedAt = Reflect.get(value, "startedAt")
  const heartbeatAt = Reflect.get(value, "heartbeatAt")
  const leaseExpiresAt = Reflect.get(value, "leaseExpiresAt")
  const completedSteps = Reflect.get(value, "completedSteps")
  const completedAt = Reflect.get(value, "completedAt")
  if (
    typeof contentFingerprint !== "string" ||
    !CONTENT_FINGERPRINT_PATTERN.test(contentFingerprint) ||
    (state !== "running" && state !== "failed" && state !== "complete") ||
    typeof attemptToken !== "string" ||
    !attemptToken ||
    typeof startedAt !== "string" ||
    typeof heartbeatAt !== "string" ||
    typeof leaseExpiresAt !== "string" ||
    !Array.isArray(completedSteps) ||
    completedSteps.some(
      (step) => !AGGREGATE_FINALIZATION_STEPS.includes(step as AggregateFinalizationStep),
    ) ||
    new Set(completedSteps).size !== completedSteps.length ||
    (completedAt !== undefined && typeof completedAt !== "string") ||
    (state === "complete" && typeof completedAt !== "string")
  ) return null

  return {
    contentFingerprint,
    state,
    attemptToken,
    startedAt,
    heartbeatAt,
    leaseExpiresAt,
    completedSteps: completedSteps as AggregateFinalizationStep[],
    ...(completedAt === undefined ? {} : { completedAt }),
  }
}

function readAggregateCreationMarker(hackathon: Hackathon): AggregateCreationMarker | null {
  const metadata = hackathon.metadata
  if (!metadata || typeof metadata !== "object") return null
  const value = Reflect.get(metadata, "aggregate_creation")
  if (!value || typeof value !== "object") return null
  const draftId = Reflect.get(value, "draftId")
  const state = Reflect.get(value, "state")
  const startedAt = Reflect.get(value, "startedAt")
  const completedAt = Reflect.get(value, "completedAt")
  const contentFingerprint = Reflect.get(value, "contentFingerprint")
  const attemptToken = Reflect.get(value, "attemptToken")
  const heartbeatAt = Reflect.get(value, "heartbeatAt")
  const leaseExpiresAt = Reflect.get(value, "leaseExpiresAt")
  const baseUpdatedAt = Reflect.get(value, "baseUpdatedAt")
  const finalization = readAggregateFinalizationMarker(Reflect.get(value, "finalization"))
  if (
    typeof draftId !== "string" ||
    typeof contentFingerprint !== "string" ||
    !CONTENT_FINGERPRINT_PATTERN.test(contentFingerprint) ||
    (
      state !== "building" &&
      state !== "compensating" &&
      state !== "complete" &&
      state !== "failed"
    ) ||
    typeof startedAt !== "string" ||
    (attemptToken !== undefined && typeof attemptToken !== "string") ||
    (heartbeatAt !== undefined && typeof heartbeatAt !== "string") ||
    (leaseExpiresAt !== undefined && typeof leaseExpiresAt !== "string") ||
    (baseUpdatedAt !== undefined && typeof baseUpdatedAt !== "string") ||
    (
      attemptToken !== undefined &&
      (!attemptToken || heartbeatAt === undefined || leaseExpiresAt === undefined)
    ) ||
    (Reflect.get(value, "finalization") !== undefined && !finalization) ||
    (completedAt !== undefined && typeof completedAt !== "string")
  ) return null
  return {
    draftId,
    contentFingerprint,
    state,
    startedAt,
    ...(attemptToken === undefined ? {} : { attemptToken }),
    ...(heartbeatAt === undefined ? {} : { heartbeatAt }),
    ...(leaseExpiresAt === undefined ? {} : { leaseExpiresAt }),
    ...(baseUpdatedAt === undefined ? {} : { baseUpdatedAt }),
    ...(completedAt === undefined ? {} : { completedAt }),
    ...(finalization === null ? {} : { finalization }),
  }
}

function isOwnedAggregateCreationMarker(
  marker: AggregateCreationMarker | null,
): marker is OwnedAggregateCreationMarker {
  return Boolean(
    marker?.attemptToken && marker.heartbeatAt && marker.leaseExpiresAt,
  )
}

function createOwnedAggregateMarker(
  draftId: string,
  contentFingerprint: string,
  attemptToken: string,
  state: "building" | "compensating" = "building",
  baseUpdatedAt?: string,
): OwnedAggregateCreationMarker {
  const now = Date.now()
  const timestamp = new Date(now).toISOString()
  return {
    draftId,
    contentFingerprint,
    state,
    startedAt: timestamp,
    attemptToken,
    heartbeatAt: timestamp,
    leaseExpiresAt: new Date(now + STALE_AGGREGATE_BUILD_MS).toISOString(),
    ...(baseUpdatedAt === undefined ? {} : { baseUpdatedAt }),
  }
}

function renewAggregateMarker(
  marker: OwnedAggregateCreationMarker,
  state: "building" | "compensating" = marker.state === "compensating"
    ? "compensating"
    : "building",
): OwnedAggregateCreationMarker {
  const now = Date.now()
  return {
    ...marker,
    state,
    heartbeatAt: new Date(now).toISOString(),
    leaseExpiresAt: new Date(now + STALE_AGGREGATE_BUILD_MS).toISOString(),
  }
}

function aggregateMarkerOwnership(marker: OwnedAggregateCreationMarker) {
  return {
    draftId: marker.draftId,
    contentFingerprint: marker.contentFingerprint,
    state: marker.state,
    attemptToken: marker.attemptToken,
  }
}

async function recoverAmbiguousAggregateInsert(
  tenantId: string,
  draftId: string | undefined,
  marker: OwnedAggregateCreationMarker,
): Promise<Hackathon | null> {
  try {
    const client = getSupabase() as unknown as SupabaseClient
    let query = client
      .from("hackathons")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("status", "draft")
      .contains("metadata", {
        aggregate_creation: aggregateMarkerOwnership(marker),
      })
    if (draftId) query = query.eq("id", draftId)
    const { data, error } = await query.maybeSingle()
    if (error || !data) return null

    const recovered = data as unknown as Hackathon
    const recoveredMarker = readAggregateCreationMarker(recovered)
    if (
      recovered.tenant_id !== tenantId ||
      recovered.status !== "draft" ||
      (draftId !== undefined && recovered.id !== draftId) ||
      !isOwnedAggregateCreationMarker(recoveredMarker) ||
      !jsonbValuesEqual(
        recoveredMarker as unknown as Json,
        marker as unknown as Json,
      )
    ) return null
    return recovered
  } catch {
    return null
  }
}

function markerLeaseExpired(marker: AggregateCreationMarker): boolean {
  if (marker.state === "failed") return true
  const leaseExpiresAt = marker.leaseExpiresAt
    ? new Date(marker.leaseExpiresAt).getTime()
    : new Date(marker.startedAt).getTime() + STALE_AGGREGATE_BUILD_MS
  return !Number.isFinite(leaseExpiresAt) || Date.now() >= leaseExpiresAt
}

async function findAggregateByDraftId(
  tenantId: string,
  draftId: string,
): Promise<Hackathon | null> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data, error } = await client
    .from("hackathons")
    .select("*")
    .eq("id", draftId)
    .eq("tenant_id", tenantId)
    .maybeSingle()
  if (error) throw new Error(`Failed to check event creation: ${error.message}`)
  return data as Hackathon | null
}

async function hasTrustedForeignDraftCollision(
  tenantId: string,
  hackathonId: string,
  markerDraftId: string,
): Promise<boolean> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data, error } = await client
    .from("hackathons")
    .select("id, metadata")
    .eq("id", hackathonId)
    .neq("tenant_id", tenantId)
    .maybeSingle()
  if (error) throw new Error(`Failed to check saved draft ownership: ${error.message}`)
  if (!data) return false
  const marker = readAggregateCreationMarker(data as unknown as Hackathon)
  return marker?.draftId === markerDraftId
}

function canonicalizeJson(value: Json | undefined): Json | undefined {
  if (Array.isArray(value)) return value.map((item) => canonicalizeJson(item) as Json)
  if (!value || typeof value !== "object") return value

  const normalized: Record<string, Json | undefined> = {}
  for (const key of Object.keys(value).sort()) {
    const item = value[key]
    if (item !== undefined) normalized[key] = canonicalizeJson(item)
  }
  return normalized
}

function jsonbValuesEqual(left: Json | undefined, right: Json): boolean {
  return JSON.stringify(canonicalizeJson(left)) === JSON.stringify(canonicalizeJson(right))
}

const AGGREGATE_METADATA_CAS_ATTEMPTS = 3

type AggregateMarkerSwapOptions = {
  guardCreationRow?: boolean
  expectedUpdatedAt?: string
}

async function swapAggregateMarker(
  hackathon: Hackathon,
  expected: AggregateCreationMarker,
  replacement: AggregateCreationMarker,
  options: AggregateMarkerSwapOptions = {},
): Promise<boolean> {
  let currentHackathon = hackathon
  let lastError: Error | null = null
  for (let attempt = 0; attempt < AGGREGATE_METADATA_CAS_ATTEMPTS; attempt += 1) {
    const currentMetadata = aggregateMetadata(currentHackathon)
    if (
      !jsonbValuesEqual(
        currentMetadata.aggregate_creation,
        expected as unknown as Json,
      )
    ) return false

    const metadata = {
      ...currentMetadata,
      aggregate_creation: replacement,
    }
    const client = getSupabase() as unknown as SupabaseClient
    const update = client
      .from("hackathons")
      .update({ metadata })
      .eq("id", hackathon.id)
      .eq("tenant_id", hackathon.tenant_id)
      .eq("metadata", JSON.stringify(currentMetadata))
    if (options.guardCreationRow !== false) {
      update.eq("status", "draft")
      const expectedUpdatedAt = options.expectedUpdatedAt ?? expected.baseUpdatedAt
      if (expectedUpdatedAt) update.eq("updated_at", expectedUpdatedAt)
    }
    const { data, error } = await update
      .eq("metadata->aggregate_creation", JSON.stringify(expected))
      .select("id")
      .maybeSingle()
    if (data?.id === hackathon.id) return true
    if (error) {
      lastError = new Error(`Failed to update event creation lease: ${error.message}`)
      if (!shouldRecoverAmbiguousWrite(error)) throw lastError
    }

    let refreshed: Hackathon | null
    try {
      refreshed = await findAggregateByDraftId(
        hackathon.tenant_id,
        hackathon.id,
      )
    } catch (refreshError) {
      throw lastError ?? refreshError
    }
    if (!refreshed) return false
    if (
      jsonbValuesEqual(
        aggregateMetadata(refreshed).aggregate_creation,
        replacement as unknown as Json,
      )
    ) return true
    currentHackathon = refreshed
  }
  if (lastError) throw lastError
  return false
}

async function markAggregateFailed(
  hackathon: Hackathon,
  marker: AggregateCreationMarker,
): Promise<boolean> {
  try {
    const current = await findAggregateByDraftId(
      hackathon.tenant_id,
      hackathon.id,
    )
    if (
      !current ||
      current.status !== "draft" ||
      current.updated_at !== (marker.baseUpdatedAt ?? hackathon.updated_at)
    ) return false
    return await swapAggregateMarker(
      current,
      marker,
      { ...marker, state: "failed" },
      { expectedUpdatedAt: marker.baseUpdatedAt ?? hackathon.updated_at },
    )
  } catch (error) {
    console.error("Failed to mark partial event creation:", error)
    return false
  }
}

type AggregateLease = {
  renew: () => Promise<boolean>
  stop: () => Promise<{
    hackathon: Hackathon
    marker: OwnedAggregateCreationMarker
    owned: boolean
  }>
}

function startAggregateLease(
  initialHackathon: Hackathon,
  initialMarker: OwnedAggregateCreationMarker,
): AggregateLease {
  let hackathon = initialHackathon
  let marker = initialMarker
  let owned = true
  let stopped = false
  let pending = Promise.resolve()

  const heartbeat = async () => {
    if (stopped || !owned) return
    const replacement = renewAggregateMarker(marker)
    try {
      const swapped = await swapAggregateMarker(hackathon, marker, replacement)
      if (!swapped) {
        owned = false
        return
      }
      marker = replacement
      hackathon = {
        ...hackathon,
        metadata: {
          ...aggregateMetadata(hackathon),
          aggregate_creation: marker,
        },
      }
    } catch (error) {
      console.error("Failed to renew event creation lease:", error)
      owned = false
    }
  }

  const queueHeartbeat = () => {
    pending = pending.then(heartbeat)
    return pending
  }

  const timer = setInterval(() => {
    void queueHeartbeat()
  }, AGGREGATE_HEARTBEAT_MS)
  timer.unref?.()

  return {
    renew: async () => {
      await queueHeartbeat()
      return owned
    },
    stop: async () => {
      clearInterval(timer)
      await pending
      stopped = true
      return { hackathon, marker, owned }
    },
  }
}

type OwnedCompensationResult = "removed" | "lost" | "failed"

async function compensateOwnedAggregate(
  initialHackathon: Hackathon,
  initialMarker: OwnedAggregateCreationMarker,
): Promise<OwnedCompensationResult> {
  let hackathon = initialHackathon
  let marker = initialMarker

  if (marker.state !== "compensating") {
    const replacement = renewAggregateMarker(marker, "compensating")
    try {
      if (!(await swapAggregateMarker(hackathon, marker, replacement))) {
        return "lost"
      }
    } catch (error) {
      console.error("Failed to claim partial event cleanup:", error)
      return "failed"
    }
    marker = replacement
    hackathon = {
      ...hackathon,
      metadata: {
        ...aggregateMetadata(hackathon),
        aggregate_creation: marker,
      },
    }
  }

  const lease = startAggregateLease(hackathon, marker)
  if (!(await findCompensationTarget(initialHackathon, marker))) {
    await lease.stop()
    return "lost"
  }
  let bannerRemoved = false
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      if (await deleteBanner(hackathon.id)) {
        bannerRemoved = true
        break
      }
    } catch (error) {
      console.error(
        `Banner cleanup attempt ${attempt} failed for event ${hackathon.id}:`,
        error,
      )
    }
  }

  const leaseState = await lease.stop()
  hackathon = leaseState.hackathon
  marker = leaseState.marker
  if (!leaseState.owned) return "lost"
  if (!bannerRemoved) {
    console.error(`Keeping partial event ${hackathon.id} so banner cleanup can be retried`)
    await markAggregateFailed(hackathon, marker)
    return "failed"
  }

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const current = await findCompensationTarget(initialHackathon, marker)
    if (!current) return "lost"
    const currentMetadata = aggregateMetadata(current)
    const client = getSupabase() as unknown as SupabaseClient
    const { data, error } = await client
      .from("hackathons")
      .delete()
      .eq("id", hackathon.id)
      .eq("tenant_id", hackathon.tenant_id)
      .eq("status", "draft")
      .eq("updated_at", marker.baseUpdatedAt)
      .eq("metadata", JSON.stringify(currentMetadata))
      .eq("metadata->aggregate_creation", JSON.stringify(marker))
      .select("id")
      .maybeSingle()
    if (!error && data?.id === hackathon.id) return "removed"
    if (!error) return "lost"
    console.error(`Hackathon rollback attempt ${attempt} failed:`, error)
  }

  console.error(`Failed to remove partial hackathon draft ${hackathon.id} after three attempts`)
  await markAggregateFailed(hackathon, marker)
  return "failed"
}

async function resultAfterAggregateOwnershipChange(
  tenantId: string,
  hackathonId: string,
  markerDraftId: string,
  contentFingerprint: string,
): Promise<CreateHackathonAggregateResult> {
  const current = await findAggregateByDraftId(tenantId, hackathonId)
  if (!current) {
    return (await hasTrustedForeignDraftCollision(
      tenantId,
      hackathonId,
      markerDraftId,
    ))
      ? draftOrganizationConflictResult()
      : { status: "failed", hackathon: null }
  }
  const marker = readAggregateCreationMarker(current)
  if (!marker || marker.draftId !== markerDraftId) {
    return { status: "failed", hackathon: null }
  }
  if (marker.contentFingerprint !== contentFingerprint) return draftConflictResult(current)
  if (marker.state === "complete") {
    return { status: "replayed", hackathon: current }
  }
  if (marker.state === "building" || marker.state === "compensating") {
    return { status: "in_progress", hackathon: null }
  }
  return { status: "failed", hackathon: null }
}

type AggregateFinalizationCallback = (
  idempotencyKey: string,
  timestamp: string,
) => Promise<void>

type AggregateFinalizationCallbacks = Partial<
  Record<AggregateFinalizationStep, AggregateFinalizationCallback>
>

function finalizationConflictResult(): HackathonCreationFinalizationResult {
  return {
    status: "invalid",
    error: {
      code: "draft_conflict",
      message: "This saved draft already created an event with different import details. Open that event to continue.",
    },
  }
}

function finalizationLeaseExpired(marker: AggregateFinalizationMarker): boolean {
  const leaseExpiresAt = new Date(marker.leaseExpiresAt).getTime()
  return !Number.isFinite(leaseExpiresAt) || Date.now() >= leaseExpiresAt
}

function createAggregateFinalizationMarker(
  contentFingerprint: string,
  completedSteps: AggregateFinalizationStep[] = [],
): AggregateFinalizationMarker {
  const now = Date.now()
  const timestamp = new Date(now).toISOString()
  return {
    contentFingerprint,
    state: "running",
    attemptToken: randomUUID(),
    startedAt: timestamp,
    heartbeatAt: timestamp,
    leaseExpiresAt: new Date(now + STALE_AGGREGATE_BUILD_MS).toISOString(),
    completedSteps,
  }
}

function renewAggregateFinalizationMarker(
  marker: AggregateFinalizationMarker,
): AggregateFinalizationMarker {
  const now = Date.now()
  const pending = { ...marker }
  delete pending.completedAt
  return {
    ...pending,
    state: "running",
    heartbeatAt: new Date(now).toISOString(),
    leaseExpiresAt: new Date(now + STALE_AGGREGATE_BUILD_MS).toISOString(),
  }
}

function aggregateFinalizationIdempotencyKey(
  hackathonId: string,
  contentFingerprint: string,
  step: AggregateFinalizationStep,
): string {
  return `sha256:${createHash("sha256")
    .update(`hackathon.created:${hackathonId}:${contentFingerprint}:${step}`)
    .digest("hex")}`
}

async function resultAfterFinalizationOwnershipChange(
  tenantId: string,
  hackathonId: string,
  contentFingerprint: string,
): Promise<HackathonCreationFinalizationResult> {
  const current = await findAggregateByDraftId(tenantId, hackathonId)
  if (!current) return { status: "failed" }
  const marker = readAggregateCreationMarker(current)
  if (!marker || marker.state !== "complete") return { status: "failed" }
  const finalization = marker.finalization
  if (!finalization) return { status: "failed" }
  if (finalization.contentFingerprint !== contentFingerprint) {
    return finalizationConflictResult()
  }
  if (finalization.state === "complete") return { status: "complete" }
  if (finalization.state === "running") return { status: "in_progress" }
  return { status: "failed" }
}

async function markAggregateFinalizationFailed(
  hackathon: Hackathon,
  marker: AggregateCreationMarker,
  finalization: AggregateFinalizationMarker,
): Promise<HackathonCreationFinalizationResult> {
  const pending = { ...finalization }
  delete pending.completedAt
  const failedFinalization: AggregateFinalizationMarker = {
    ...pending,
    state: "failed",
    heartbeatAt: new Date().toISOString(),
  }
  const replacement = { ...marker, finalization: failedFinalization }
  try {
    if (await swapAggregateMarker(
      hackathon,
      marker,
      replacement,
      { guardCreationRow: false },
    )) {
      return { status: "failed" }
    }
  } catch (error) {
    console.error("Failed to save event creation finalization failure:", error)
  }
  return resultAfterFinalizationOwnershipChange(
    hackathon.tenant_id,
    hackathon.id,
    finalization.contentFingerprint,
  )
}

async function finalizeMarkedHackathonCreation(
  tenantId: string,
  hackathonId: string,
  contentFingerprint: string,
  callbacks: AggregateFinalizationCallbacks,
): Promise<HackathonCreationFinalizationResult> {
  let hackathon = await findAggregateByDraftId(tenantId, hackathonId)
  if (!hackathon) return { status: "failed" }
  let marker = readAggregateCreationMarker(hackathon)
  if (!marker || marker.state !== "complete") return { status: "failed" }

  const steps = AGGREGATE_FINALIZATION_STEPS.filter((step) => callbacks[step])
  const existing = marker.finalization
  if (existing?.contentFingerprint !== undefined &&
      existing.contentFingerprint !== contentFingerprint) {
    return finalizationConflictResult()
  }
  if (
    existing?.state === "complete" &&
    steps.every((step) => existing.completedSteps.includes(step))
  ) return { status: "complete" }
  if (existing?.state === "running" && !finalizationLeaseExpired(existing)) {
    return { status: "in_progress" }
  }

  let finalization = createAggregateFinalizationMarker(
    contentFingerprint,
    existing?.completedSteps ?? [],
  )
  if (existing) finalization.startedAt = existing.startedAt
  let replacement = { ...marker, finalization }
  try {
    if (!(await swapAggregateMarker(
      hackathon,
      marker,
      replacement,
      { guardCreationRow: false },
    ))) {
      return resultAfterFinalizationOwnershipChange(
        tenantId,
        hackathonId,
        contentFingerprint,
      )
    }
  } catch (error) {
    console.error("Failed to claim event creation finalization:", error)
    return { status: "failed" }
  }
  marker = replacement
  hackathon = {
    ...hackathon,
    metadata: {
      ...aggregateMetadata(hackathon),
      aggregate_creation: marker,
    },
  }

  const timestamp = marker.completedAt ?? hackathon.created_at ?? new Date().toISOString()

  for (const step of steps) {
    if (finalization.completedSteps.includes(step)) continue

    const renewedFinalization = renewAggregateFinalizationMarker(finalization)
    replacement = { ...marker, finalization: renewedFinalization }
    try {
      if (!(await swapAggregateMarker(
        hackathon,
        marker,
        replacement,
        { guardCreationRow: false },
      ))) {
        return resultAfterFinalizationOwnershipChange(
          tenantId,
          hackathonId,
          contentFingerprint,
        )
      }
    } catch (error) {
      console.error("Failed to renew event creation finalization:", error)
      return markAggregateFinalizationFailed(hackathon, marker, finalization)
    }
    marker = replacement
    finalization = renewedFinalization
    hackathon = {
      ...hackathon,
      metadata: {
        ...aggregateMetadata(hackathon),
        aggregate_creation: marker,
      },
    }

    try {
      await callbacks[step]!(
        aggregateFinalizationIdempotencyKey(hackathonId, contentFingerprint, step),
        timestamp,
      )
    } catch (error) {
      console.error(`Failed to finalize event creation step ${step}:`, error)
      return markAggregateFinalizationFailed(hackathon, marker, finalization)
    }

    const completedSteps = [...finalization.completedSteps, step]
    const allComplete = steps.every((candidate) => completedSteps.includes(candidate))
    const checkpoint: AggregateFinalizationMarker = {
      ...finalization,
      state: allComplete ? "complete" : "running",
      heartbeatAt: new Date().toISOString(),
      completedSteps,
      ...(allComplete ? { completedAt: new Date().toISOString() } : {}),
    }
    replacement = { ...marker, finalization: checkpoint }
    try {
      if (!(await swapAggregateMarker(
        hackathon,
        marker,
        replacement,
        { guardCreationRow: false },
      ))) {
        return resultAfterFinalizationOwnershipChange(
          tenantId,
          hackathonId,
          contentFingerprint,
        )
      }
    } catch (error) {
      console.error(`Failed to save event creation finalization step ${step}:`, error)
      return markAggregateFinalizationFailed(hackathon, marker, finalization)
    }
    marker = replacement
    finalization = checkpoint
    hackathon = {
      ...hackathon,
      metadata: {
        ...aggregateMetadata(hackathon),
        aggregate_creation: marker,
      },
    }
  }

  if (finalization.state === "complete") return { status: "complete" }

  const completedFinalization: AggregateFinalizationMarker = {
    ...finalization,
    state: "complete",
    completedAt: new Date().toISOString(),
  }
  replacement = { ...marker, finalization: completedFinalization }
  try {
    if (await swapAggregateMarker(
      hackathon,
      marker,
      replacement,
      { guardCreationRow: false },
    )) {
      return { status: "complete" }
    }
  } catch (error) {
    console.error("Failed to complete event creation finalization:", error)
  }
  return resultAfterFinalizationOwnershipChange(
    tenantId,
    hackathonId,
    contentFingerprint,
  )
}

async function finalizeUnmarkedHackathonCreation(
  hackathon: Hackathon,
  contentFingerprint: string,
  callbacks: AggregateFinalizationCallbacks,
): Promise<HackathonCreationFinalizationResult> {
  const timestamp = hackathon.created_at ?? new Date().toISOString()
  try {
    for (const step of AGGREGATE_FINALIZATION_STEPS) {
      const callback = callbacks[step]
      if (!callback) continue
      await callback(
        aggregateFinalizationIdempotencyKey(hackathon.id, contentFingerprint, step),
        timestamp,
      )
    }
    return { status: "complete" }
  } catch (error) {
    console.error("Failed to finalize event creation:", error)
    return { status: "failed" }
  }
}

async function finalizeHackathonCreationUnchecked(
  input: HackathonCreationFinalizationInput,
): Promise<HackathonCreationFinalizationResult> {
  const auditMetadata = sanitizeFinalizationMetadata(input.auditMetadata)
  const webhookData = sanitizeFinalizationMetadata(input.webhookData)
  const contentFingerprint = fingerprintAggregateContent({
    version: 1,
    auditMetadata,
    webhookData,
    translations: input.translations ?? null,
  })
  const callbacks: AggregateFinalizationCallbacks = {
    audit: async (idempotencyKey) => {
      const { logAudit } = await import("@/lib/services/audit")
      await logAudit({
        principal: input.principal,
        action: "hackathon.created",
        resourceType: "hackathon",
        resourceId: input.hackathon.id,
        metadata: auditMetadata,
        critical: true,
        idempotencyId: input.hackathon.id,
        idempotencyKey,
      })
    },
    ...(input.translations?.translationLinks.length
      ? {
          translations: async () => {
            try {
              await importTranslationVariants({
                hackathonId: input.hackathon.id,
                tenantId: input.tenantId,
                ...input.translations!,
              })
            } catch {
              console.warn(
                "Optional event translations could not be imported; required setup will continue.",
              )
            }
          },
        }
      : {}),
    webhook: async (idempotencyKey, timestamp) => {
      const { triggerWebhooks } = await import("@/lib/services/webhooks")
      await triggerWebhooks(input.tenantId, "hackathon.created", {
        event: "hackathon.created",
        timestamp,
        idempotencyKey,
        data: {
          ...webhookData,
          idempotencyKey,
        },
      }, {
        idempotencyKey,
        requireRecorded: true,
      })
    },
    analytics: async (_idempotencyKey, timestamp) => {
      const { trackEventImmediately } = await import("@/lib/analytics/posthog")
      await trackEventImmediately(input.tenantId, "hackathon.created", {
        hackathonId: input.hackathon.id,
        name: input.hackathon.name,
      }, {
        eventId: input.hackathon.id,
        timestamp,
      })
    },
  }

  const marker = readAggregateCreationMarker(input.hackathon)
  if (!marker) {
    return finalizeUnmarkedHackathonCreation(
      input.hackathon,
      contentFingerprint,
      callbacks,
    )
  }
  return finalizeMarkedHackathonCreation(
    input.tenantId,
    input.hackathon.id,
    contentFingerprint,
    callbacks,
  )
}

export async function finalizeHackathonCreation(
  input: HackathonCreationFinalizationInput,
): Promise<HackathonCreationFinalizationResult> {
  try {
    return await finalizeHackathonCreationUnchecked(input)
  } catch (error) {
    console.error("Failed to finalize event creation:", error)
    return { status: "failed" }
  }
}

export async function createHackathonAggregateWithResult(
  tenantId: string,
  input: CreateHackathonAggregateInput,
): Promise<CreateHackathonAggregateResult> {
  const { defaultLocale, draftId, ...draftInput } = input
  if (draftId && !isValidUuid(draftId)) {
    return {
      status: "invalid",
      hackathon: null,
      error: { code: "invalid_draft", message: "The saved draft ID is invalid." },
    }
  }
  const parsed = hackathonDraftStateSchema.safeParse(draftInput)
  if (!parsed.success || !hasOffsetAwareDraftTimestamps(parsed.data)) {
    return {
      status: "invalid",
      hackathon: null,
      error: {
        code: "invalid_draft",
        message: parsed.success
          ? "Check the event dates and try again."
          : (parsed.error.issues[0]?.message ?? "Check the event details and try again."),
      },
    }
  }
  if (parsed.data.agendaItems.some((item) => item.startsAt === null)) {
    return {
      status: "invalid",
      hackathon: null,
      error: {
        code: "incomplete_agenda",
        message: "Add a start time to every agenda item.",
      },
    }
  }
  const name = parsed.data.name.trim()
  if (!name) {
    return {
      status: "invalid",
      hackathon: null,
      error: { code: "invalid_draft", message: "Give your event a name." },
    }
  }
  const validated = {
    ...parsed.data,
    name,
    startsAt: parsed.data.startsAt ? new Date(parsed.data.startsAt).toISOString() : null,
    endsAt: parsed.data.endsAt ? new Date(parsed.data.endsAt).toISOString() : null,
    registrationOpensAt: parsed.data.registrationOpensAt
      ? new Date(parsed.data.registrationOpensAt).toISOString()
      : null,
    registrationClosesAt: parsed.data.registrationClosesAt
      ? new Date(parsed.data.registrationClosesAt).toISOString()
      : null,
    locationUrl: normalizeUrl(parsed.data.locationUrl ?? "") || null,
    imageUrl: normalizeUrl(parsed.data.imageUrl ?? "") || null,
    challenges: parsed.data.challenges.map((challenge) => ({
      ...challenge,
      resources: challenge.resources.map((resource) => ({
        ...resource,
        url: normalizeUrl(resource.url),
      })),
    })),
    agendaItems: parsed.data.agendaItems.map((item) => ({
      ...item,
      startsAt: item.startsAt ? new Date(item.startsAt).toISOString() : null,
      endsAt: item.endsAt ? new Date(item.endsAt).toISOString() : null,
    })),
    defaultLocale: normalizeLocale(defaultLocale ?? null) ?? "en",
  }
  const contentFingerprint = fingerprintAggregateContent(validated)
  const markerDraftId = draftId ?? randomUUID()
  const attemptToken = randomUUID()

  if (draftId) {
    const existing = await findAggregateByDraftId(tenantId, draftId)
    if (existing) {
      const marker = readAggregateCreationMarker(existing)
      if (!marker || marker.draftId !== draftId) {
        return { status: "failed", hackathon: null }
      }
      if (marker.contentFingerprint !== contentFingerprint) return draftConflictResult(existing)
      if (marker.state === "complete") {
        return { status: "replayed", hackathon: existing }
      }
      if (existing.status !== "draft") {
        return { status: "failed", hackathon: null }
      }
      if (
        (marker.state === "building" || marker.state === "compensating") &&
        !markerLeaseExpired(marker)
      ) {
        return { status: "in_progress", hackathon: null }
      }
      if (!marker.baseUpdatedAt) {
        return { status: "failed", hackathon: null }
      }
      if (existing.updated_at !== marker.baseUpdatedAt) {
        return { status: "failed", hackathon: null }
      }
      const takeoverMarker = createOwnedAggregateMarker(
        draftId,
        contentFingerprint,
        attemptToken,
        "compensating",
        marker.baseUpdatedAt,
      )
      let claimed = false
      try {
        claimed = await swapAggregateMarker(existing, marker, takeoverMarker)
      } catch (error) {
        console.error("Failed to claim stale event creation:", error)
        return { status: "failed", hackathon: null }
      }
      if (!claimed) {
        return resultAfterAggregateOwnershipChange(
          tenantId,
          draftId,
          draftId,
          contentFingerprint,
        )
      }
      const claimedHackathon = {
        ...existing,
        metadata: {
          ...aggregateMetadata(existing),
          aggregate_creation: takeoverMarker,
        },
      }
      const compensation = await compensateOwnedAggregate(
        claimedHackathon,
        takeoverMarker,
      )
      if (compensation === "lost") {
        return resultAfterAggregateOwnershipChange(
          tenantId,
          draftId,
          draftId,
          contentFingerprint,
        )
      }
      if (compensation !== "removed") {
        return { status: "failed", hackathon: null }
      }
    } else if (await hasTrustedForeignDraftCollision(tenantId, draftId, draftId)) {
      return draftOrganizationConflictResult()
    }
  }

  const creationMarker = createOwnedAggregateMarker(
    markerDraftId,
    contentFingerprint,
    attemptToken,
  )
  const leaseHolder: { current: AggregateLease | null } = { current: null }
  const readLease = () => leaseHolder.current
  let stoppedLeaseState: Awaited<ReturnType<AggregateLease["stop"]>> | null = null

  let hackathon = await createHackathonFromImport(tenantId, validated, {
    draftId,
    metadata: { aggregate_creation: creationMarker },
    onCreated: (created) => {
      const createdMarker = readAggregateCreationMarker(created)
      if (isOwnedAggregateCreationMarker(createdMarker)) {
        leaseHolder.current = startAggregateLease(created, createdMarker)
      }
    },
  })
  let lease = readLease()
  if (!hackathon) {
    if (lease) {
      const leaseState = await lease.stop()
      lease = null
      if (leaseState.owned) {
        const compensation = await compensateOwnedAggregate(
          leaseState.hackathon,
          leaseState.marker,
        )
        if (compensation === "lost") {
          return resultAfterAggregateOwnershipChange(
            tenantId,
            leaseState.hackathon.id,
            markerDraftId,
            contentFingerprint,
          )
        }
        return { status: "failed", hackathon: null }
      }
      return resultAfterAggregateOwnershipChange(
        tenantId,
        leaseState.hackathon.id,
        markerDraftId,
        contentFingerprint,
      )
    }
    if (draftId) {
      return resultAfterAggregateOwnershipChange(
        tenantId,
        draftId,
        draftId,
        contentFingerprint,
      )
    }
    return { status: "failed", hackathon: null }
  }

  try {
    if (validated.sponsors.length) {
      if (lease && !(await lease.renew())) throw new Error("Event creation ownership changed")
      await createSponsorsFromImport(hackathon.id, validated.sponsors)
    }
    if (validated.prizes.length) {
      if (lease && !(await lease.renew())) throw new Error("Event creation ownership changed")
      await createPrizesFromImport(hackathon.id, validated.prizes)
    }
    if (validated.challenges.length) {
      if (lease && !(await lease.renew())) throw new Error("Event creation ownership changed")
      await createChallengesFromImport(hackathon.id, tenantId, validated.challenges)
    }
    if (validated.agendaItems.length) {
      if (lease && !(await lease.renew())) throw new Error("Event creation ownership changed")
      const agendaCreated = await createAgendaFromImport(
        hackathon.id,
        validated.agendaItems,
        validated.startsAt,
      )
      if (!agendaCreated) throw new Error("Failed to create schedule")
    }
    if (!lease) throw new Error("Event creation lease was not started")
    const leaseState = await lease.stop()
    stoppedLeaseState = leaseState
    lease = null
    if (!leaseState.owned) {
      return resultAfterAggregateOwnershipChange(
        tenantId,
        hackathon.id,
        markerDraftId,
        contentFingerprint,
      )
    }
    const completedMarker: AggregateCreationMarker = {
      ...leaseState.marker,
      state: "complete",
      completedAt: new Date().toISOString(),
    }
    const metadata = {
      ...aggregateMetadata(hackathon),
      aggregate_creation: completedMarker,
    }
    const completed = await swapAggregateMarker(
      leaseState.hackathon,
      leaseState.marker,
      completedMarker,
    )
    if (!completed) {
      return resultAfterAggregateOwnershipChange(
        tenantId,
        hackathon.id,
        markerDraftId,
        contentFingerprint,
      )
    }
    hackathon = { ...hackathon, metadata }
  } catch (error) {
    console.error("Failed to create complete hackathon draft:", error)
    const leaseState = lease
      ? await lease.stop()
      : (stoppedLeaseState ?? { hackathon, marker: creationMarker, owned: false })
    lease = null
    if (!leaseState.owned) {
      return resultAfterAggregateOwnershipChange(
        tenantId,
        hackathon.id,
        markerDraftId,
        contentFingerprint,
      )
    }
    const compensation = await compensateOwnedAggregate(
      leaseState.hackathon,
      leaseState.marker,
    )
    if (compensation === "lost") {
      return resultAfterAggregateOwnershipChange(
        tenantId,
        hackathon.id,
        markerDraftId,
        contentFingerprint,
      )
    }
    return { status: "failed", hackathon: null }
  }

  return { status: "created", hackathon }
}

export async function createHackathonAggregate(
  tenantId: string,
  input: CreateHackathonAggregateInput,
): Promise<Hackathon | null> {
  const result = await createHackathonAggregateWithResult(tenantId, input)
  return result.status === "created" || result.status === "replayed"
    ? result.hackathon
    : null
}
