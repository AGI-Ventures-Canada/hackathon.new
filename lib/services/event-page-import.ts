import { cache } from "react"
import { normalizeUrl } from "@/lib/utils/url"
import { normalizeLocale } from "@/lib/utils/language"

export type EventPageData = {
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

const ATTENDANCE_MODE_MAP: Record<string, "in_person" | "virtual"> = {
  "https://schema.org/OfflineEventAttendanceMode": "in_person",
  "https://schema.org/OnlineEventAttendanceMode": "virtual",
  "https://schema.org/MixedEventAttendanceMode": "in_person",
}

const PLACEHOLDER_ADDRESS_PATTERNS = [
  /register to see/i,
  /rsvp to see/i,
  /sign up to see/i,
]

export function normalizeEventDate(isoString: string | null): string | null {
  if (!isoString) return null

  const match = isoString.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/
  )
  if (!match) return isoString

  const [, year, month, day, hour, minute, second] = match

  return `${year}-${month}-${day}T${hour}:${minute}:${second}`
}

export const extractEventPageData = cache(async function extractEventPageData(
  inputUrl: string
): Promise<EventPageData | null> {
  const url = normalizeUrl(inputUrl)

  let response: Response
  try {
    response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; OatmealBot/1.0; +https://oatmeal.sh)",
      },
      signal: AbortSignal.timeout(8000),
    })
  } catch (err) {
    console.error(`Failed to fetch event page from ${url}:`, err)
    return null
  }

  if (!response.ok) return null

  const html = await response.text()
  return parseEventPage(html)
})

function parseEventPage(html: string): EventPageData | null {
  return parseJsonLdEvent(html) ?? parseMetaFallback(html)
}

function parseJsonLdEvent(html: string): EventPageData | null {
  const matches = html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  )

  for (const match of matches) {
    const rawJson = match[1]?.trim()
    if (!rawJson) continue

    try {
      const parsed = JSON.parse(rawJson) as unknown
      const event = findEventNode(parsed)
      if (event) {
        return mapEventNode(event)
      }
    } catch {
      continue
    }
  }

  return null
}

function findEventNode(input: unknown): Record<string, unknown> | null {
  if (!input) return null

  if (Array.isArray(input)) {
    for (const item of input) {
      const event = findEventNode(item)
      if (event) return event
    }

    return null
  }

  if (typeof input !== "object") return null

  const record = input as Record<string, unknown>
  if (record["@type"] === "Event") return record

  if (Array.isArray(record["@graph"])) {
    for (const item of record["@graph"]) {
      const event = findEventNode(item)
      if (event) return event
    }
  }

  return null
}

function mapEventNode(event: Record<string, unknown>): EventPageData | null {
  const name = getString(event.name)
  if (!name) return null

  const location = toRecord(event.location)
  const attendanceMode = getString(event.eventAttendanceMode)
  const locationType = attendanceMode ? (ATTENDANCE_MODE_MAP[attendanceMode] ?? null) : inferLocationType(location)

  return {
    name,
    description: getString(event.description),
    startsAt: normalizeEventDate(getString(event.startDate)),
    endsAt: normalizeEventDate(getString(event.endDate)),
    locationType,
    locationName: buildLocationName(location),
    locationUrl: locationType === "virtual"
      ? getString(location?.url)
      : getString(location?.url),
    imageUrl: getImageUrl(event.image),
    language: normalizeLocale(getString(event.inLanguage)),
    translationLinks: [],
  }
}

function parseMetaFallback(html: string): EventPageData | null {
  const name = getMetaContent(html, "property", "og:title") ?? getTitleContent(html)
  const startsAt = normalizeEventDate(getMetaContent(html, "property", "event:start_time"))

  if (!name || !startsAt) {
    return null
  }

  const locationText = getMetaContent(html, "name", "twitter:data1")
  const htmlLang = html.match(/<html[^>]*\blang=["']([^"']+)["']/i)?.[1] ?? null

  return {
    name,
    description: getMetaContent(html, "name", "description") ?? getMetaContent(html, "property", "og:description"),
    startsAt,
    endsAt: normalizeEventDate(getMetaContent(html, "property", "event:end_time")),
    locationType: locationText ? "in_person" : null,
    locationName: locationText,
    locationUrl: null,
    imageUrl: getMetaContent(html, "property", "og:image") ?? getMetaContent(html, "name", "twitter:image"),
    language: normalizeLocale(htmlLang),
    translationLinks: [],
  }
}

function getMetaContent(
  html: string,
  attrName: "name" | "property",
  attrValue: string
): string | null {
  const escapedAttrValue = escapeRegExp(attrValue)
  const patterns = [
    new RegExp(
      `<meta[^>]*${attrName}=["']${escapedAttrValue}["'][^>]*content=["']([^"']*)["'][^>]*>`,
      "i"
    ),
    new RegExp(
      `<meta[^>]*content=["']([^"']*)["'][^>]*${attrName}=["']${escapedAttrValue}["'][^>]*>`,
      "i"
    ),
  ]

  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match?.[1]) {
      return decodeHtml(match[1].trim())
    }
  }

  return null
}

function getTitleContent(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return match?.[1] ? decodeHtml(match[1].trim()) : null
}

function getImageUrl(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    return value
  }

  if (Array.isArray(value)) {
    const first = value.find((item): item is string => typeof item === "string" && item.trim().length > 0)
    return first ?? null
  }

  if (value && typeof value === "object") {
    const url = getString((value as Record<string, unknown>).url)
    if (url) return url
  }

  return null
}

function inferLocationType(location: Record<string, unknown> | null): "in_person" | "virtual" | null {
  if (!location) return null

  const type = location["@type"]
  if (type === "VirtualLocation") return "virtual"
  if (type === "Place") return "in_person"
  return null
}

function buildLocationName(location: Record<string, unknown> | null): string | null {
  if (!location) return null

  const locationName = getString(location.name)
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
    ].filter((part): part is string => typeof part === "string" && part.trim().length > 0)

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

function isPlaceholderAddress(address: string): boolean {
  return PLACEHOLDER_ADDRESS_PATTERNS.some((pattern) => pattern.test(address))
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? decodeHtml(value.trim()) : null
}

function decodeHtml(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
