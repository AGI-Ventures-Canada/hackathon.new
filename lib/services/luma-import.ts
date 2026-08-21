import { cache } from "react"
import { LANGUAGE_NAMES, normalizeLocale } from "@/lib/utils/language"
import { fetchAllowedUrl, readResponseText } from "@/lib/utils/safe-fetch-url"

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
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?/
  )
  if (!match) return isoString

  const [, year, month, day, hour, minute, second, offset] = match

  return `${year}-${month}-${day}T${hour}:${minute}:${second}${offset ?? ""}`
}

const ATTENDANCE_MODE_MAP: Record<string, "in_person" | "virtual"> = {
  "https://schema.org/OfflineEventAttendanceMode": "in_person",
  "https://schema.org/OnlineEventAttendanceMode": "virtual",
  "https://schema.org/MixedEventAttendanceMode": "in_person",
}

type LumaNextData = {
  description: string | null
  startsAt: string | null
  endsAt: string | null
}

export const extractLumaEventData = cache(async function extractLumaEventData(
  slug: string
): Promise<LumaEventData | null> {
  const url = `https://luma.com/${slug}`

  let response: Response
  try {
    const fetched = await fetchAllowedUrl(
      url,
      { signal: AbortSignal.timeout(8000) },
      { requireHttps: true }
    )
    if (!fetched) return null
    response = fetched
  } catch (err) {
    console.error(`Failed to fetch Luma event from ${url}:`, err)
    return null
  }

  if (!response.ok) return null

  const html = await readResponseText(response, 2 * 1024 * 1024)
  if (html === null) return null
  const data = parseJsonLd(html) ?? parseOgMetaFallback(html)
  if (!data) return null

  const nextData = extractLumaNextData(html)

  return {
    name: data.name,
    description: nextData?.description ?? data.description,
    startsAt: nextData?.startsAt ?? data.startsAt,
    endsAt: nextData?.endsAt ?? data.endsAt,
    locationType: data.locationType,
    locationName: data.locationName,
    locationUrl: data.locationUrl,
    imageUrl: data.imageUrl,
    language: data.language,
    translationLinks: parseTranslationLinksFromHtml(html, slug),
  }
})

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null
}

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

function extractLumaNextData(html: string): LumaNextData | null {
  const match = html.match(/<script\s+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
  if (!match) return null

  let payload: unknown
  try {
    payload = JSON.parse(match[1])
  } catch {
    return null
  }

  const root = asRecord(payload)
  const props = asRecord(root?.props)
  const pageProps = asRecord(props?.pageProps)
  const initialData = asRecord(pageProps?.initialData)
  const data = asRecord(initialData?.data)
  if (!data) return null

  const event = asRecord(data.event) ?? data
  const mirror =
    asProseMirrorNode(event.description_mirror) ??
    asProseMirrorNode(data.description_mirror)
  const description = mirror ? renderProseMirrorToText(mirror).trim() : ""
  const startsAt = normalizeEventDate(getString(event.start_at))
  const endsAt = normalizeEventDate(getString(event.end_at))

  if (!description && !startsAt && !endsAt) return null

  return {
    description: description.length > 0 ? description : null,
    startsAt,
    endsAt,
  }
}

function asProseMirrorNode(value: unknown): ProseMirrorNode | null {
  const node = asRecord(value)
  if (!node) return null

  return Array.isArray(node.content) ? (node as ProseMirrorNode) : null
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

const VERSION_MODIFIERS: Record<string, string[]> = {
  fr: ["french\\s*version", "version\\s*française", "version\\s*francaise"],
  en: ["english\\s*version", "version\\s*anglaise"],
  es: ["versión\\s*española", "version\\s*espagnole"],
  pt: ["versão\\s*portuguesa"],
  de: ["deutsche\\s*version"],
  it: ["versione\\s*italiana"],
}

const KEYWORD_MATCH_ORDER = ["fr", "en", "es", "pt", "de", "it", "ja", "ko", "zh"] as const

const LANGUAGE_KEYWORD_TO_CODE: { keywords: RegExp; code: string }[] = KEYWORD_MATCH_ORDER.map(
  (code) => {
    const names = LANGUAGE_NAMES[code] ?? []
    const escapedNames = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    const alternatives = [...escapedNames, ...(VERSION_MODIFIERS[code] ?? [])].join("|")
    return { keywords: new RegExp(`\\b(${alternatives})\\b`, "i"), code }
  }
)

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
    const anchorEnd = html.indexOf("</a>", idx + match[0].length)
    const afterStart = anchorEnd >= 0 ? anchorEnd + 4 : idx + match[0].length
    const before = stripHtmlTags(html.slice(Math.max(0, idx - 200), idx))
    const after = stripHtmlTags(html.slice(afterStart, afterStart + 200))
    const windowText = `${before} ${after}`
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
