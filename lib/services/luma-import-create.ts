import { createHackathon } from "@/lib/services/hackathons"
import { downloadAndUploadBanner } from "@/lib/services/storage"
import { addSponsor } from "@/lib/services/sponsors"
import { createPrize } from "@/lib/services/prizes"
import { createChallenge } from "@/lib/services/challenges"
import { createScheduleItem } from "@/lib/services/schedule-items"
import { extractExternalEventData, extractExternalRichContent, isLumaUrl } from "@/lib/services/external-import"
import { anchorAgendaTimestamp, composeAgendaDescription } from "@/lib/utils/agenda"
import { sanitizeIsoTimestamp } from "@/lib/utils/timestamp"
import { normalizeUrl, isSafeExternalUrl } from "@/lib/utils/url"
import { supabase as getSupabase } from "@/lib/db/client"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Hackathon, SponsorTier } from "@/lib/db/hackathon-types"
import {
  buildTranslationRecord,
  normalizeLocale,
  type HackathonTranslations,
} from "@/lib/utils/language"

export type ImportHackathonInput = {
  name: string
  description: string | null
  startsAt: string | null
  endsAt: string | null
  registrationOpensAt?: string | null
  registrationClosesAt?: string | null
  locationType: "in_person" | "virtual" | null
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

export async function createHackathonFromImport(
  tenantId: string,
  input: ImportHackathonInput
): Promise<Hackathon | null> {
  const hackathon = await createHackathon(tenantId, {
    name: input.name,
    description: input.description,
  })

  if (!hackathon) return null

  const bannerResult = await downloadAndUploadBanner(hackathon.id, input.imageUrl)

  const client = getSupabase() as unknown as SupabaseClient
  const { error } = await client
    .from("hackathons")
    .update({
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      registration_opens_at: input.registrationOpensAt ?? null,
      registration_closes_at: input.registrationClosesAt ?? null,
      location_type: input.locationType,
      location_name: input.locationName,
      location_url: input.locationUrl,
      banner_url: bannerResult?.url ?? null,
      rules: input.rules ?? null,
      default_locale: normalizeLocale(input.defaultLocale ?? null) ?? "en",
    })
    .eq("id", hackathon.id)

  if (error) {
    console.error("Failed to update imported hackathon settings:", error)
  }

  return { ...hackathon, banner_url: bannerResult?.url ?? null } as Hackathon
}

type TranslationPrimary = {
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

  for (const link of safeLinks) {
    const url = link.url
    try {
      const [eventData, richContent] = await Promise.all([
        extractExternalEventData(url),
        extractExternalRichContent(url),
      ])

      if (!eventData) {
        console.warn(`Translation variant ${url} returned no event data; skipping.`)
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
    } catch (err) {
      console.error(`Failed to fetch translation variant ${url}:`, err)
    }
  }

  if (!Object.keys(translations).length) return

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
    }
  }
}

const VALID_TIERS = new Set<string>(["gold", "silver", "bronze", "custom", "none"])

export async function createSponsorsFromImport(
  hackathonId: string,
  sponsors: { name: string; tier: string | null }[]
): Promise<void> {
  for (let i = 0; i < sponsors.length; i++) {
    const s = sponsors[i]
    const tier = (s.tier && VALID_TIERS.has(s.tier) ? s.tier : "none") as SponsorTier
    await addSponsor({
      hackathonId,
      name: s.name,
      tier,
      displayOrder: i,
    })
  }
}

export async function createPrizesFromImport(
  hackathonId: string,
  prizes: { name: string; description?: string | null; value?: string | null }[]
): Promise<void> {
  for (let i = 0; i < prizes.length; i++) {
    const p = prizes[i]
    await createPrize(hackathonId, {
      name: p.name,
      description: p.description ?? null,
      value: p.value ?? null,
      displayOrder: i,
    })
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
      .filter((r) => r.url.length > 0)

    await createChallenge(hackathonId, tenantId, {
      title: c.title,
      description: c.description ?? null,
      resources: cleanedResources,
    })
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
): Promise<void> {
  const usable = pickUsable(items, eventStartsAt)
  if (!usable.length) return

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
      return
    }
    insertedIds.push(created.id)
  }

  // insertedIds are DB-generated UUIDs from createScheduleItem above — never user input — so direct interpolation here is safe.
  const { error: deleteError } = await client
    .from("hackathon_schedule_items")
    .delete()
    .eq("hackathon_id", hackathonId)
    .is("trigger_type", null)
    .not("id", "in", `(${insertedIds.join(",")})`)

  if (deleteError) {
    console.error("Failed to clear default agenda items after import:", deleteError)
  }
}
