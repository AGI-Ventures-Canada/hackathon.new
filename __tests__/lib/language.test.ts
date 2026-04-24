import { describe, it, expect } from "bun:test"
import {
  applyHackathonTranslation,
  availableLocales,
  buildTranslationRecord,
  isTitleSuffixVariant,
  normalizeLocale,
  type HackathonTranslations,
} from "@/lib/utils/language"

describe("normalizeLocale", () => {
  it("returns null for empty input", () => {
    expect(normalizeLocale(null)).toBeNull()
    expect(normalizeLocale(undefined)).toBeNull()
    expect(normalizeLocale("")).toBeNull()
    expect(normalizeLocale("   ")).toBeNull()
  })

  it("strips region codes to the primary subtag", () => {
    expect(normalizeLocale("fr-CA")).toBe("fr")
    expect(normalizeLocale("en_US")).toBe("en")
    expect(normalizeLocale("ZH-HANS")).toBe("zh")
  })

  it("maps language names to ISO codes", () => {
    expect(normalizeLocale("English")).toBe("en")
    expect(normalizeLocale("Français")).toBe("fr")
    expect(normalizeLocale("francais")).toBe("fr")
    expect(normalizeLocale("Spanish")).toBe("es")
    expect(normalizeLocale("Japanese")).toBe("ja")
  })

  it("returns null for unrecognized input", () => {
    expect(normalizeLocale("klingon")).toBeNull()
    expect(normalizeLocale("123")).toBeNull()
  })
})

describe("isTitleSuffixVariant", () => {
  it("matches trailing FR marker variations", () => {
    expect(isTitleSuffixVariant("AGI Montreal", "AGI Montreal - FR")).toBe(true)
    expect(isTitleSuffixVariant("AGI Montreal", "AGI Montreal (FR)")).toBe(true)
    expect(isTitleSuffixVariant("AGI Montreal", "AGI Montreal – Français")).toBe(true)
    expect(isTitleSuffixVariant("AGI Montreal", "AGI Montreal | Français")).toBe(true)
  })

  it("matches identical titles", () => {
    expect(isTitleSuffixVariant("AGI Montreal", "AGI Montreal")).toBe(true)
    expect(isTitleSuffixVariant("AGI Montreal", "  agi montreal  ")).toBe(true)
  })

  it("does not match genuinely different titles", () => {
    expect(isTitleSuffixVariant("AGI Montreal", "Hackathon IA de Montréal")).toBe(false)
    expect(isTitleSuffixVariant("Build Day", "Journée Construction")).toBe(false)
  })

  it("handles empty inputs", () => {
    expect(isTitleSuffixVariant("", "Anything")).toBe(false)
    expect(isTitleSuffixVariant("Anything", "")).toBe(false)
  })
})

const baseHackathon = {
  name: "AGI Montreal",
  description: "Build stuff.",
  rules: "Be nice.",
  location_name: "Montreal",
  community_label: "Join community",
  default_locale: "en",
  translations: {
    fr: {
      description: "Construisez des trucs.",
      rules: "Soyez gentils.",
      community_label: "Rejoindre la communauté",
    },
  } as HackathonTranslations,
}

describe("applyHackathonTranslation", () => {
  it("returns the hackathon unchanged when locale is null", () => {
    expect(applyHackathonTranslation(baseHackathon, null)).toBe(baseHackathon)
  })

  it("returns the hackathon unchanged when locale equals default_locale", () => {
    expect(applyHackathonTranslation(baseHackathon, "en")).toBe(baseHackathon)
  })

  it("returns the hackathon unchanged when translations is null", () => {
    const h = { ...baseHackathon, translations: null }
    expect(applyHackathonTranslation(h, "fr")).toBe(h)
  })

  it("overlays only fields present in the translation", () => {
    const result = applyHackathonTranslation(baseHackathon, "fr")
    expect(result.description).toBe("Construisez des trucs.")
    expect(result.rules).toBe("Soyez gentils.")
    expect(result.community_label).toBe("Rejoindre la communauté")
    expect(result.name).toBe("AGI Montreal")
    expect(result.location_name).toBe("Montreal")
  })

  it("ignores empty translation values", () => {
    const h = {
      ...baseHackathon,
      translations: { fr: { description: "" } } as HackathonTranslations,
    }
    const result = applyHackathonTranslation(h, "fr")
    expect(result.description).toBe("Build stuff.")
  })

  it("returns original when requested locale not present", () => {
    expect(applyHackathonTranslation(baseHackathon, "de")).toBe(baseHackathon)
  })
})

describe("availableLocales", () => {
  it("lists default first, then translations", () => {
    expect(availableLocales(baseHackathon)).toEqual(["en", "fr"])
  })

  it("dedupes when translations include the default locale", () => {
    const h = {
      ...baseHackathon,
      translations: { en: { description: "..." }, fr: { description: "..." } } as HackathonTranslations,
    }
    expect(availableLocales(h)).toEqual(["en", "fr"])
  })

  it("returns just default when no translations", () => {
    const h = { ...baseHackathon, translations: null }
    expect(availableLocales(h)).toEqual(["en"])
  })

  it("falls back to en when default_locale is null", () => {
    const h = { ...baseHackathon, default_locale: null, translations: null }
    expect(availableLocales(h)).toEqual(["en"])
  })
})

describe("buildTranslationRecord", () => {
  it("includes fields that differ from primary", () => {
    const record = buildTranslationRecord({
      primary: {
        name: "AGI Montreal",
        description: "Build stuff.",
        rules: "Be nice.",
        location_name: "Montreal",
        community_label: "Join community",
      },
      variant: {
        name: "Hackathon IA de Montréal",
        description: "Construisez des trucs.",
        rules: "Soyez gentils.",
        location_name: "Montréal",
        community_label: "Rejoindre la communauté",
      },
    })
    expect(record.name).toBe("Hackathon IA de Montréal")
    expect(record.description).toBe("Construisez des trucs.")
    expect(record.community_label).toBe("Rejoindre la communauté")
  })

  it("omits name when variant is a suffix variant of primary", () => {
    const record = buildTranslationRecord({
      primary: {
        name: "AGI Montreal",
        description: "Build stuff.",
        rules: null,
        location_name: null,
        community_label: null,
      },
      variant: {
        name: "AGI Montreal - FR",
        description: "Construisez des trucs.",
      },
    })
    expect(record.name).toBeUndefined()
    expect(record.description).toBe("Construisez des trucs.")
  })

  it("omits fields whose variant value matches primary", () => {
    const record = buildTranslationRecord({
      primary: {
        name: "AGI Montreal",
        description: "Build stuff.",
        rules: "Be nice.",
        location_name: "Montreal",
        community_label: null,
      },
      variant: {
        description: "Build stuff.",
        rules: "Soyez gentils.",
      },
    })
    expect(record.description).toBeUndefined()
    expect(record.rules).toBe("Soyez gentils.")
  })

  it("omits empty / whitespace-only variant values", () => {
    const record = buildTranslationRecord({
      primary: {
        name: "AGI Montreal",
        description: "Build stuff.",
        rules: null,
        location_name: null,
        community_label: null,
      },
      variant: {
        description: "   ",
        rules: "",
      },
    })
    expect(record.description).toBeUndefined()
    expect(record.rules).toBeUndefined()
  })
})
