import { createHackathon } from "@/lib/services/hackathons"
import { downloadAndUploadBanner } from "@/lib/services/storage"
import { addSponsor } from "@/lib/services/sponsors"
import { createPrize } from "@/lib/services/prizes"
import { createChallenge } from "@/lib/services/challenges"
import { extractExternalEventData, extractExternalRichContent, isLumaUrl } from "@/lib/services/external-import"
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
  primaryLocale,
  primary,
  translationLinks,
}: {
  hackathonId: string
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

  // One hop only: never follow translationLinks returned by a variant fetch.
  // Variants cross-link back to the primary (A→B→A), and loops would cost LLM + Tavily quota.
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
          description: eventData.description ?? richContent?.cleanedDescription ?? null,
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
  const { error } = await client
    .from("hackathons")
    .update({ translations })
    .eq("id", hackathonId)

  if (error) {
    console.error("Failed to write translations:", error)
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
