import { cache } from "react"
import { normalizeLocale } from "@/lib/utils/language"

export type LumaEventData = {
  name: string
  description: string | null
  startsAt: string | null
  endsAt: string | null
  locationType: "in_person" | "virtual" | null
  locationName: string | null
  locationUrl: string | null
  imageUrl: string | null
  language: string | null
  translationLinks: { url: string; languageCode: string }[]
}

export function normalizeEventDate(isoString: string | null): string | null {
  if (!isoString) return null

  const match = isoString.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/
  )
  if (!match) return isoString

  const [, year, month, day, hour, minute, second] = match

  return `${year}-${month}-${day}T${hour}:${minute}:${second}`
}

const ATTENDANCE_MODE_MAP: Record<string, "in_person" | "virtual"> = {
  "https://schema.org/OfflineEventAttendanceMode": "in_person",
  "https://schema.org/OnlineEventAttendanceMode": "virtual",
  "https://schema.org/MixedEventAttendanceMode": "in_person",
}

export const extractLumaEventData = cache(async function extractLumaEventData(
  slug: string
): Promise<LumaEventData | null> {
  const url = `https://luma.com/${slug}`

  let response: Response
  try {
    response = await fetch(url)
  } catch (err) {
    console.error(`Failed to fetch Luma event from ${url}:`, err)
    return null
  }

  if (!response.ok) return null

  const html = await response.text()
  const data = parseJsonLd(html) ?? parseOgMetaFallback(html)
  if (!data) return null

  const richDescription = extractDescriptionFromNextData(html)

  return {
    ...data,
    description: richDescription ?? data.description,
    translationLinks: parseTranslationLinksFromHtml(html, slug),
  }
})

function parseJsonLd(html: string): LumaEventData | null {
  const jsonLdMatch = html.match(
    /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/
  )
  if (!jsonLdMatch) return null

  let data: Record<string, unknown>
  try {
    data = JSON.parse(jsonLdMatch[1])
  } catch (err) {
    console.error("Failed to parse JSON-LD from Luma page:", err)
    return null
  }

  if (data["@type"] !== "Event") return null

  const name = data.name as string | undefined
  if (!name) return null

  const location = data.location as Record<string, unknown> | undefined
  const images = data.image as string[] | undefined
  const attendanceMode = data.eventAttendanceMode as string | undefined
  const locationType = attendanceMode ? (ATTENDANCE_MODE_MAP[attendanceMode] ?? null) : null

  return {
    name,
    description: (data.description as string) ?? null,
    startsAt: normalizeEventDate((data.startDate as string) ?? null),
    endsAt: normalizeEventDate((data.endDate as string) ?? null),
    locationType,
    locationName: buildLocationName(location),
    locationUrl: locationType === "virtual" ? null : (location?.url as string) ?? null,
    imageUrl: images?.[0] ?? null,
    language: normalizeLocale((data.inLanguage as string | undefined) ?? null),
    translationLinks: [],
  }
}

type ProseMirrorNode = {
  type?: string
  text?: string
  content?: ProseMirrorNode[]
  marks?: { type?: string }[]
}

function extractDescriptionFromNextData(html: string): string | null {
  const match = html.match(/<script\s+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
  if (!match) return null

  let payload: unknown
  try {
    payload = JSON.parse(match[1])
  } catch {
    return null
  }

  const data = (payload as { props?: { pageProps?: { initialData?: { data?: unknown } } } })
    ?.props?.pageProps?.initialData?.data as Record<string, unknown> | undefined
  if (!data) return null

  const mirror = data.description_mirror as ProseMirrorNode | undefined
  if (!mirror?.content?.length) return null

  const text = renderProseMirrorToText(mirror).trim()
  return text.length > 0 ? text : null
}

function renderProseMirrorToText(node: ProseMirrorNode): string {
  if (node.type === "text") return node.text ?? ""

  const children = (node.content ?? []).map(renderProseMirrorToText).join("")

  switch (node.type) {
    case "paragraph":
    case "heading":
    case "blockquote":
    case "list_item":
    case "code_block":
      return children ? `${children}\n\n` : ""
    case "hard_break":
      return "\n"
    case "bullet_list":
    case "ordered_list":
    case "doc":
      return children
    default:
      return children
  }
}

function parseOgMetaFallback(html: string): Omit<LumaEventData, "translationLinks"> | null {
  const ogTitle = matchMeta(html, "og:title")
  if (!ogTitle) return null

  const rawName = ogTitle.replace(/\s*[·|]\s*Luma\s*$/i, "").trim()
  if (!rawName) return null

  return {
    name: rawName,
    description: matchMeta(html, "og:description"),
    startsAt: null,
    endsAt: null,
    locationType: null,
    locationName: null,
    locationUrl: null,
    imageUrl: matchMeta(html, "og:image"),
    language: null,
  }
}

function matchMeta(html: string, property: string): string | null {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["']`,
    "i"
  )
  const m = html.match(re)
  return (m?.[1] ?? m?.[2] ?? null)?.trim() || null
}

const LANGUAGE_KEYWORD_TO_CODE: { keywords: RegExp; code: string }[] = [
  { keywords: /\b(french|français|francais|french\s*version|version\s*française|version\s*francaise)\b/i, code: "fr" },
  { keywords: /\b(english|anglais|english\s*version|version\s*anglaise)\b/i, code: "en" },
  { keywords: /\b(spanish|español|espanol|versión\s*española|version\s*espagnole)\b/i, code: "es" },
  { keywords: /\b(portuguese|português|portugues|versão\s*portuguesa)\b/i, code: "pt" },
  { keywords: /\b(german|deutsch|deutsche\s*version)\b/i, code: "de" },
  { keywords: /\b(italian|italiano|versione\s*italiana)\b/i, code: "it" },
  { keywords: /\b(japanese|日本語)\b/i, code: "ja" },
  { keywords: /\b(korean|한국어)\b/i, code: "ko" },
  { keywords: /\b(chinese|中文|mandarin)\b/i, code: "zh" },
]

export function parseTranslationLinksFromHtml(
  html: string,
  currentSlug: string
): { url: string; languageCode: string }[] {
  const anchorRe = /<a\b[^>]*\bhref=["'](https:\/\/(?:www\.)?(?:luma\.com|lu\.ma)\/[a-z0-9][a-z0-9-]{2,40})["'][^>]*>/gi
  const seen = new Set<string>()
  const results: { url: string; languageCode: string }[] = []

  for (const match of html.matchAll(anchorRe)) {
    const url = match[1]
    if (seen.has(url)) continue

    const slug = url.split("/").filter(Boolean).pop() ?? ""
    if (slug === currentSlug) continue

    const idx = match.index ?? 0
    const windowText = stripHtmlTags(html.slice(Math.max(0, idx - 200), idx))
    let detected: string | null = null
    for (const { keywords, code } of LANGUAGE_KEYWORD_TO_CODE) {
      if (keywords.test(windowText)) {
        detected = code
        break
      }
    }
    if (!detected) continue

    seen.add(url)
    results.push({ url, languageCode: detected })
  }

  return results
}

function stripHtmlTags(input: string): string {
  return input.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ")
}

const PLACEHOLDER_ADDRESS_PATTERNS = [
  /register to see/i,
  /rsvp to see/i,
  /sign up to see/i,
]

function isPlaceholderAddress(address: string): boolean {
  return PLACEHOLDER_ADDRESS_PATTERNS.some((p) => p.test(address))
}

function buildLocationName(
  location: Record<string, unknown> | undefined
): string | null {
  if (!location) return null

  const locationName = (location.name as string) ?? null
  const rawAddress = location.address

  let addressStr: string | null = null

  if (typeof rawAddress === "string" && rawAddress.trim()) {
    if (!isPlaceholderAddress(rawAddress)) {
      addressStr = rawAddress.trim()
    }
  } else if (rawAddress && typeof rawAddress === "object") {
    const postal = rawAddress as Record<string, unknown>
    const parts = [
      postal.streetAddress,
      postal.addressLocality,
      postal.addressRegion,
    ].filter((p): p is string => typeof p === "string" && p.trim().length > 0)

    if (parts.length > 0) {
      addressStr = parts.join(", ")
    }
  }

  if (locationName && addressStr) {
    if (addressStr.includes(locationName)) return addressStr
    if (locationName.includes(addressStr)) return locationName
    return `${locationName} (${addressStr})`
  }

  return locationName ?? addressStr ?? null
}
