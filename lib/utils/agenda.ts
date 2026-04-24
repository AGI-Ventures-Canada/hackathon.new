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
const ISO_TIME_PATTERN = /T(\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)(Z|[+-]\d{2}:?\d{2})?$/
const ISO_DATE_PATTERN = /^(\d{4}-\d{2}-\d{2})/
const ISO_OFFSET_PATTERN = /(Z|[+-]\d{2}:?\d{2})$/

function extractOffset(iso: string | null | undefined): string | null {
  if (!iso) return null
  const m = iso.match(ISO_OFFSET_PATTERN)
  return m?.[1] ?? null
}

// Agenda timestamps from the extractor are unreliable in two ways:
//
// 1. When the page only shows a time of day (e.g. "8:30 AM") the model
//    picks a nonsense date like 1970-01-01 or 2026-01-01. We detect those
//    by comparing to the hackathon's starts_at and swap the date for the
//    event's date when the gap is larger than the event could plausibly be.
//
// 2. When the page doesn't spell out a timezone, the model emits an ISO
//    string without an offset. Postgres timestamptz treats naked strings
//    as UTC, which then renders 7+ hours off in the organizer's browser
//    (e.g. "08:30 local" stored as 08:30Z renders as 01:30 PDT). To keep
//    the time anchored to the event's local zone, we borrow the offset
//    from the hackathon's starts_at whenever the item lacks one.
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
