export const TRANSLATABLE_FIELDS = [
  "name",
  "description",
  "rules",
  "location_name",
  "community_label",
] as const

export type TranslatableField = (typeof TRANSLATABLE_FIELDS)[number]

export type HackathonTranslation = Partial<Record<TranslatableField, string>>

export type HackathonTranslations = Record<string, HackathonTranslation>

export const LANGUAGE_LABELS: Record<string, string> = {
  en: "English",
  fr: "Français",
  es: "Español",
  pt: "Português",
  de: "Deutsch",
  it: "Italiano",
  ja: "日本語",
  ko: "한국어",
  zh: "中文",
  ar: "العربية",
  ru: "Русский",
  nl: "Nederlands",
  hi: "हिन्दी",
}

const NAME_TO_CODE: Record<string, string> = {
  english: "en",
  anglais: "en",
  french: "fr",
  français: "fr",
  francais: "fr",
  spanish: "es",
  español: "es",
  espanol: "es",
  portuguese: "pt",
  português: "pt",
  portugues: "pt",
  german: "de",
  deutsch: "de",
  italian: "it",
  italiano: "it",
  japanese: "ja",
  korean: "ko",
  chinese: "zh",
  mandarin: "zh",
  arabic: "ar",
  russian: "ru",
  dutch: "nl",
  hindi: "hi",
}

export function normalizeLocale(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim().toLowerCase()
  if (!trimmed) return null
  const namedMatch = NAME_TO_CODE[trimmed]
  if (namedMatch) return namedMatch
  const primary = trimmed.split(/[-_]/)[0]
  if (/^[a-z]{2,3}$/.test(primary)) return primary
  return null
}

const SUFFIX_PATTERN = /[\s\-–—_|/]+\(?\s*(fr|en|es|pt|de|it|ja|ko|zh|français|francais|english|español|espanol|português|portugues|deutsch|italiano|日本語|한국어|中文)\s*\)?\s*$/iu

export function isTitleSuffixVariant(primary: string, variant: string): boolean {
  if (!primary || !variant) return false
  const p = primary.trim()
  const v = variant.trim()
  if (!p || !v) return false
  if (p.toLowerCase() === v.toLowerCase()) return true
  const stripped = v.replace(SUFFIX_PATTERN, "").trim()
  if (!stripped) return false
  return stripped.toLowerCase() === p.toLowerCase()
}

type MinimalHackathon = {
  name: string
  description: string | null
  rules: string | null
  location_name: string | null
  community_label: string | null
  default_locale: string | null
  translations: HackathonTranslations | null
}

export function availableLocales<H extends MinimalHackathon>(hackathon: H): string[] {
  const primary = hackathon.default_locale ?? "en"
  const extras = hackathon.translations
    ? Object.keys(hackathon.translations).filter((code) => code !== primary)
    : []
  return [primary, ...extras]
}

export function applyHackathonTranslation<H extends MinimalHackathon>(
  hackathon: H,
  locale: string | null | undefined
): H {
  if (!locale) return hackathon
  const primary = hackathon.default_locale ?? "en"
  if (locale === primary) return hackathon
  const translation = hackathon.translations?.[locale]
  if (!translation) return hackathon

  const overlay: Partial<H> = {}
  for (const field of TRANSLATABLE_FIELDS) {
    const value = translation[field]
    if (typeof value === "string" && value.length > 0) {
      ;(overlay as Record<string, string>)[field] = value
    }
  }
  return { ...hackathon, ...overlay }
}

export function buildTranslationRecord({
  primary,
  variant,
}: {
  primary: Pick<MinimalHackathon, "name" | "description" | "rules" | "location_name" | "community_label">
  variant: Partial<Pick<MinimalHackathon, "name" | "description" | "rules" | "location_name" | "community_label">>
}): HackathonTranslation {
  const record: HackathonTranslation = {}

  if (variant.name && variant.name.trim() && !isTitleSuffixVariant(primary.name, variant.name)) {
    if (variant.name.trim() !== primary.name.trim()) {
      record.name = variant.name.trim()
    }
  }

  for (const field of ["description", "rules", "location_name", "community_label"] as const) {
    const v = variant[field]
    const p = primary[field]
    if (typeof v === "string" && v.trim().length > 0 && v.trim() !== (p ?? "").trim()) {
      record[field] = v.trim()
    }
  }

  return record
}
