export function composeAgendaDescription(
  speakers: string[] | undefined,
  description: string | null | undefined
): string | null {
  const cleanSpeakers = (speakers ?? [])
    .map((s) => s?.trim())
    .filter((s): s is string => !!s && s.length > 0)
  const trimmed = description?.trim() ?? ""

  if (!cleanSpeakers.length) return trimmed || null

  const speakerLine = `Speakers: ${cleanSpeakers.join(", ")}`
  return trimmed ? `${speakerLine}\n\n${trimmed}` : speakerLine
}

const ANCHOR_WINDOW_DAYS = 30
const ISO_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T(\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)(Z|[+-]\d{2}:?\d{2})?$/
const ISO_DATE_PATTERN = /^(\d{4}-\d{2}-\d{2})/
const ISO_OFFSET_PATTERN = /(Z|[+-]\d{2}:?\d{2})$/

function extractOffset(iso: string | null | undefined): string | null {
  if (!iso) return null
  const m = iso.match(ISO_OFFSET_PATTERN)
  return m?.[1] ?? null
}

export function anchorAgendaTimestamp(
  itemIso: string | null | undefined,
  eventStartsAt: string | null | undefined
): string | null {
  if (!itemIso) return null

  const time = itemIso.match(ISO_TIME_PATTERN)
  const itemOffset = time?.[2] ?? null
  const eventOffset = extractOffset(eventStartsAt)
  const effectiveOffset = itemOffset ?? eventOffset ?? ""

  if (!eventStartsAt) return itemIso

  const itemMs = Date.parse(itemIso)
  const eventMs = Date.parse(eventStartsAt)
  const datesParsed = !Number.isNaN(itemMs) && !Number.isNaN(eventMs)
  const daysDelta = datesParsed ? Math.abs(itemMs - eventMs) / 86_400_000 : Infinity

  if (daysDelta <= ANCHOR_WINDOW_DAYS) {
    if (!itemOffset && eventOffset) {
      return `${itemIso}${eventOffset}`
    }
    return itemIso
  }

  const eventDate = eventStartsAt.match(ISO_DATE_PATTERN)
  if (!time || !eventDate) return itemIso

  return `${eventDate[1]}T${time[1]}${effectiveOffset}`
}
