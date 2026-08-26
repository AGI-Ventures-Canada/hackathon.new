import { z } from "zod"
import {
  isSafeExternalUrl,
  normalizeOptionalUrl,
  normalizeUrl,
  redactImportSourceUrl,
} from "@/lib/utils/url"

export const HACKATHON_DRAFT_VERSION = 1
export const HACKATHON_DRAFT_EXPIRY_MS = 24 * 60 * 60 * 1000
export const HACKATHON_DRAFT_CLOCK_SKEW_MS = 5 * 60 * 1000

const nullableText = (max: number) => z.string().max(max).nullable()
const draftTimestampSchema = z.iso.datetime({ offset: true, local: true }).nullable()
const strictDraftTimestampSchema = z.iso.datetime({ offset: true })
const draftUrlSchema = z
  .string()
  .max(2_048)
  .refine(
    (value) => !value.trim() || isSafeExternalUrl(normalizeUrl(value)),
    "Use a public HTTPS web address.",
  )

export const draftSponsorSchema = z.object({
  name: z.string().trim().min(1).max(120),
  tier: z.string().trim().max(80).nullable(),
}).strict()

export const draftPrizeSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: nullableText(1_000),
  value: nullableText(120),
}).strict()

export const draftChallengeResourceSchema = z.object({
  label: z.string().trim().max(120),
  url: draftUrlSchema.trim().min(1),
}).strict()

export const draftChallengeSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: nullableText(2_000),
  resources: z.array(draftChallengeResourceSchema).max(20),
}).strict()

export const draftAgendaItemSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: nullableText(1_000),
  startsAt: draftTimestampSchema,
  endsAt: draftTimestampSchema,
  location: nullableText(200),
  speakers: z.array(z.string().trim().min(1).max(120)).max(20),
}).strict()

const draftAgendaPatchItemSchema = draftAgendaItemSchema.extend({
  startsAt: strictDraftTimestampSchema.nullable(),
  endsAt: strictDraftTimestampSchema.nullable(),
})

export const hackathonDraftStateSchema = z.object({
  name: z.string().max(120),
  description: nullableText(5_000),
  startsAt: draftTimestampSchema,
  endsAt: draftTimestampSchema,
  registrationOpensAt: draftTimestampSchema,
  registrationClosesAt: draftTimestampSchema,
  locationType: z.enum(["in_person", "virtual", "hybrid"]).nullable(),
  locationName: nullableText(240),
  locationUrl: draftUrlSchema.nullable(),
  imageUrl: draftUrlSchema.nullable(),
  sponsors: z.array(draftSponsorSchema).max(50),
  rules: nullableText(10_000),
  prizes: z.array(draftPrizeSchema).max(50),
  challenges: z.array(draftChallengeSchema).max(50),
  agendaItems: z.array(draftAgendaItemSchema).max(50),
}).strict().superRefine((state, context) => {
  if (
    state.startsAt &&
    state.endsAt &&
    new Date(state.endsAt).getTime() <= new Date(state.startsAt).getTime()
  ) {
    context.addIssue({
      code: "custom",
      path: ["endsAt"],
      message: "The end time must be after the start time.",
    })
  }

  if (
    state.registrationOpensAt &&
    state.registrationClosesAt &&
    new Date(state.registrationClosesAt).getTime() <=
      new Date(state.registrationOpensAt).getTime()
  ) {
    context.addIssue({
      code: "custom",
      path: ["registrationClosesAt"],
      message: "Registration must close after it opens.",
    })
  }

  state.agendaItems.forEach((item, index) => {
    if (
      item.startsAt &&
      item.endsAt &&
      new Date(item.endsAt).getTime() <= new Date(item.startsAt).getTime()
    ) {
      context.addIssue({
        code: "custom",
        path: ["agendaItems", index, "endsAt"],
        message: "Each agenda item must end after it starts.",
      })
    }
  })
})

export const hackathonDraftPatchSchema = z.object({
  name: z.string().max(120).optional(),
  description: nullableText(5_000).optional(),
  startsAt: strictDraftTimestampSchema.nullable().optional(),
  endsAt: strictDraftTimestampSchema.nullable().optional(),
  registrationOpensAt: strictDraftTimestampSchema.nullable().optional(),
  registrationClosesAt: strictDraftTimestampSchema.nullable().optional(),
  locationType: z.enum(["in_person", "virtual", "hybrid"]).nullable().optional(),
  locationName: nullableText(240).optional(),
  locationUrl: draftUrlSchema.nullable().optional(),
  imageUrl: draftUrlSchema.nullable().optional(),
  sponsors: z.array(draftSponsorSchema).max(50).optional(),
  rules: nullableText(10_000).optional(),
  prizes: z.array(draftPrizeSchema).max(50).optional(),
  challenges: z.array(draftChallengeSchema).max(50).optional(),
  agendaItems: z.array(draftAgendaPatchItemSchema).max(50).optional(),
}).strict()

export function hasOffsetAwareDraftTimestamps(state: DraftState): boolean {
  const topLevel = [
    state.startsAt,
    state.endsAt,
    state.registrationOpensAt,
    state.registrationClosesAt,
  ]
  if (!topLevel.every((value) => value === null || strictDraftTimestampSchema.safeParse(value).success)) {
    return false
  }

  return state.agendaItems.every((item) =>
    [item.startsAt, item.endsAt].every(
      (value) => value === null || strictDraftTimestampSchema.safeParse(value).success,
    ),
  )
}

export const draftTranslationLinkSchema = z.object({
  url: draftUrlSchema.trim().min(1),
  languageCode: z.string().trim().min(1).max(35),
}).strict()

export const hackathonDraftSourceSchema = z.object({
  kind: z.enum(["scratch", "event_import"]),
  url: draftUrlSchema.nullable(),
  defaultLocale: z.string().trim().min(1).max(35).nullable().optional(),
  translationLinks: z.array(draftTranslationLinkSchema).max(10).optional(),
}).strict()

export const hackathonDraftEnvelopeSchema = z.object({
  version: z.literal(HACKATHON_DRAFT_VERSION),
  draftId: z.string().min(1).max(120),
  revision: z.number().int().nonnegative(),
  state: hackathonDraftStateSchema,
  source: hackathonDraftSourceSchema,
  savedAt: z.iso.datetime({ offset: true }),
}).strict()

export type DraftSponsor = z.infer<typeof draftSponsorSchema>
export type DraftPrize = z.infer<typeof draftPrizeSchema>
export type DraftChallengeResource = z.infer<typeof draftChallengeResourceSchema>
export type DraftChallenge = z.infer<typeof draftChallengeSchema>
export type DraftAgendaItem = z.infer<typeof draftAgendaItemSchema>
export type DraftState = z.infer<typeof hackathonDraftStateSchema>
export type DraftPatch = z.infer<typeof hackathonDraftPatchSchema>
export type DraftSource = z.infer<typeof hackathonDraftSourceSchema>
export type DraftEnvelope = z.infer<typeof hackathonDraftEnvelopeSchema>

export function createEmptyHackathonDraft(): DraftState {
  return {
    name: "",
    description: null,
    startsAt: null,
    endsAt: null,
    registrationOpensAt: null,
    registrationClosesAt: null,
    locationType: null,
    locationName: null,
    locationUrl: null,
    imageUrl: null,
    sponsors: [],
    rules: null,
    prizes: [],
    challenges: [],
    agendaItems: [],
  }
}

type CalendarDate = {
  year: number
  month: number
  day: number
}

function getZonedParts(date: Date, timeZone: string) {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date).map((part) => [part.type, part.value]),
  )

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  }
}

function addCalendarDays(date: CalendarDate, days: number): CalendarDate {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days))
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  }
}

function zonedDateTime(
  date: CalendarDate,
  hour: number,
  minute: number,
  timeZone: string,
  second = 0,
): Date {
  const wallClock = Date.UTC(date.year, date.month - 1, date.day, hour, minute, second)
  const guess = new Date(wallClock)
  const guessParts = getZonedParts(guess, timeZone)
  const guessOffset = Date.UTC(
    guessParts.year,
    guessParts.month - 1,
    guessParts.day,
    guessParts.hour,
    guessParts.minute,
    guessParts.second,
  ) - guess.getTime()
  let result = new Date(wallClock - guessOffset)
  const resultParts = getZonedParts(result, timeZone)
  const resultOffset = Date.UTC(
    resultParts.year,
    resultParts.month - 1,
    resultParts.day,
    resultParts.hour,
    resultParts.minute,
    resultParts.second,
  ) - result.getTime()
  if (resultOffset !== guessOffset) result = new Date(wallClock - resultOffset)
  return result
}

const LOCAL_DRAFT_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?$/

function normalizeDraftTimestamp(
  value: string | null,
  timeZone: string,
  label: string,
): string | null {
  if (value === null) return null

  if (strictDraftTimestampSchema.safeParse(value).success) {
    return new Date(value).toISOString()
  }

  if (!draftTimestampSchema.safeParse(value).success) {
    throw new Error(`${label} needs a real date and time.`)
  }

  const match = value.match(LOCAL_DRAFT_TIMESTAMP_PATTERN)
  if (!match) throw new Error(`${label} needs a real date and time.`)

  const [, year, month, day, hour, minute, second, fraction = ""] = match
  const parts = {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    second: Number(second),
  }
  const instant = zonedDateTime(
    { year: parts.year, month: parts.month, day: parts.day },
    parts.hour,
    parts.minute,
    timeZone,
    parts.second,
  )
  const zoned = getZonedParts(instant, timeZone)
  if (
    zoned.year !== parts.year ||
    zoned.month !== parts.month ||
    zoned.day !== parts.day ||
    zoned.hour !== parts.hour ||
    zoned.minute !== parts.minute ||
    zoned.second !== parts.second
  ) {
    throw new Error(`${label} falls in a skipped clock hour. Pick another time.`)
  }

  const milliseconds = Number(fraction.slice(0, 3).padEnd(3, "0"))
  return new Date(instant.getTime() + milliseconds).toISOString()
}

export type DraftTimestampNormalizationResult =
  | { ok: true; state: DraftState }
  | { ok: false; message: string }

export function normalizeDraftTimestampsForSubmission(
  state: DraftState,
  timeZone: string,
  options: { allowIncompleteAgenda?: boolean } = {},
): DraftTimestampNormalizationResult {
  try {
    if (
      !options.allowIncompleteAgenda &&
      state.agendaItems.some((item) => item.startsAt === null)
    ) {
      return {
        ok: false,
        message: "Add a start time to every agenda item.",
      }
    }
    getZonedParts(new Date(0), timeZone)
    const normalized = {
      ...state,
      startsAt: normalizeDraftTimestamp(state.startsAt, timeZone, "The event start"),
      endsAt: normalizeDraftTimestamp(state.endsAt, timeZone, "The event end"),
      registrationOpensAt: normalizeDraftTimestamp(
        state.registrationOpensAt,
        timeZone,
        "Registration opening",
      ),
      registrationClosesAt: normalizeDraftTimestamp(
        state.registrationClosesAt,
        timeZone,
        "Registration closing",
      ),
      agendaItems: state.agendaItems.map((item, index) => ({
        ...item,
        startsAt: normalizeDraftTimestamp(
          item.startsAt,
          timeZone,
          `Agenda item ${index + 1} start`,
        ),
        endsAt: normalizeDraftTimestamp(
          item.endsAt,
          timeZone,
          `Agenda item ${index + 1} end`,
        ),
      })),
    }
    const parsed = hackathonDraftStateSchema.safeParse(normalized)
    if (!parsed.success || !hasOffsetAwareDraftTimestamps(parsed.data)) {
      return {
        ok: false,
        message: parsed.success
          ? "Check the event dates and try again."
          : (parsed.error.issues[0]?.message ?? "Check the event dates and try again."),
      }
    }
    return { ok: true, state: parsed.data }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Check the event dates and try again.",
    }
  }
}

export function createDefaultHackathonDraft(now: Date, timeZone?: string): DraftState {
  if (timeZone) {
    const localNow = getZonedParts(now, timeZone)
    const calendar = { year: localNow.year, month: localNow.month, day: localNow.day }
    const start = zonedDateTime(addCalendarDays(calendar, 14), 8, 30, timeZone)
    const end = zonedDateTime(addCalendarDays(calendar, 15), 17, 0, timeZone)
    const registrationCloses = zonedDateTime(addCalendarDays(calendar, 13), 8, 30, timeZone)
    return {
      ...createEmptyHackathonDraft(),
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      registrationOpensAt: now.toISOString(),
      registrationClosesAt: registrationCloses.toISOString(),
    }
  }

  const start = new Date(now)
  start.setDate(start.getDate() + 14)
  start.setHours(8, 30, 0, 0)
  const end = new Date(now)
  end.setDate(end.getDate() + 15)
  end.setHours(17, 0, 0, 0)
  const registrationOpens = new Date(now)
  const registrationCloses = new Date(start)
  registrationCloses.setDate(registrationCloses.getDate() - 1)

  return {
    ...createEmptyHackathonDraft(),
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    registrationOpensAt: registrationOpens.toISOString(),
    registrationClosesAt: registrationCloses.toISOString(),
  }
}

type CreateDraftEnvelopeOptions = {
  draftId: string
  source?: DraftSource
  now?: Date
}

export function createDraftEnvelope(
  state: DraftState,
  { draftId, source = { kind: "scratch", url: null }, now = new Date() }: CreateDraftEnvelopeOptions,
): DraftEnvelope {
  return hackathonDraftEnvelopeSchema.parse({
    version: HACKATHON_DRAFT_VERSION,
    draftId,
    revision: 0,
    state,
    source,
    savedAt: now.toISOString(),
  })
}

export type StoredDraftParseResult =
  | { envelope: DraftEnvelope; migrated: boolean; sanitized: boolean }
  | null

function migrateLegacyDraftState(value: unknown): {
  state: DraftState
  sanitized: boolean
} | null {
  if (!value || typeof value !== "object") return null
  const legacy = value as Record<string, unknown>
  if (typeof legacy.name !== "string") return null
  let sanitized = false

  const boundedText = (
    field: unknown,
    maxLength: number,
    fallback: string | null,
  ): string | null => {
    if (field === undefined || field === null) return fallback
    if (typeof field !== "string") {
      sanitized = true
      return fallback
    }
    if (field.length <= maxLength) return field
    sanitized = true
    return field.slice(0, maxLength)
  }
  const trimmedText = (
    field: unknown,
    maxLength: number,
    allowEmpty: boolean,
  ): string | null => {
    if (typeof field !== "string") return null
    const trimmed = field.trim()
    if (!allowEmpty && !trimmed) return null
    const next = trimmed.slice(0, maxLength)
    if (next !== field) sanitized = true
    return next
  }
  const timestamp = (field: unknown): string | null => {
    if (field === undefined || field === null) return null
    const parsed = draftTimestampSchema.safeParse(field)
    if (parsed.success) return parsed.data
    sanitized = true
    return null
  }
  const safeUrl = (field: unknown): string | null => {
    if (field === undefined || field === null) return null
    const parsed = draftUrlSchema.safeParse(field)
    if (parsed.success) return parsed.data
    sanitized = true
    return null
  }
  const boundedArray = <T>(
    field: unknown,
    maxLength: number,
    migrate: (entry: unknown) => T | null,
  ): T[] => {
    if (field === undefined) return []
    if (!Array.isArray(field)) {
      sanitized = true
      return []
    }
    const migrated: T[] = []
    for (const entry of field) {
      const next = migrate(entry)
      if (next === null) {
        sanitized = true
        continue
      }
      if (migrated.length >= maxLength) {
        sanitized = true
        continue
      }
      migrated.push(next)
    }
    return migrated
  }
  const record = (entry: unknown): Record<string, unknown> | null =>
    entry && typeof entry === "object"
      ? entry as Record<string, unknown>
      : null

  const sponsors = boundedArray(legacy.sponsors, 50, (entry): DraftSponsor | null => {
    const item = record(entry)
    if (!item) return null
    const name = trimmedText(item.name, 120, false)
    if (name === null) return null
    const tier = item.tier === undefined || item.tier === null
      ? null
      : trimmedText(item.tier, 80, true)
    if (item.tier !== undefined && item.tier !== null && tier === null) {
      sanitized = true
    }
    return { name, tier }
  })
  const prizes = boundedArray(legacy.prizes, 50, (entry): DraftPrize | null => {
    const item = record(entry)
    if (!item) return null
    const name = trimmedText(item.name, 120, false)
    if (name === null) return null
    return {
      name,
      description: boundedText(item.description, 1_000, null),
      value: boundedText(item.value, 120, null),
    }
  })
  const challenges = boundedArray(
    legacy.challenges,
    50,
    (entry): DraftChallenge | null => {
      const item = record(entry)
      if (!item) return null
      const title = trimmedText(item.title, 200, false)
      if (title === null) return null
      const resources = boundedArray(
        item.resources,
        20,
        (resource): DraftChallengeResource | null => {
          const next = record(resource)
          if (!next) return null
          const label = trimmedText(next.label, 120, true)
          const url = typeof next.url === "string"
            ? draftUrlSchema.trim().min(1).safeParse(next.url)
            : null
          if (label === null || !url?.success) return null
          return { label, url: url.data }
        },
      )
      return {
        title,
        description: boundedText(item.description, 2_000, null),
        resources,
      }
    },
  )
  const agendaItems = boundedArray(
    legacy.agendaItems,
    50,
    (entry): DraftAgendaItem | null => {
      const item = record(entry)
      if (!item) return null
      const title = trimmedText(item.title, 200, false)
      if (title === null) return null
      const startsAt = timestamp(item.startsAt)
      let endsAt = timestamp(item.endsAt)
      if (
        startsAt &&
        endsAt &&
        new Date(endsAt).getTime() <= new Date(startsAt).getTime()
      ) {
        sanitized = true
        endsAt = null
      }
      return {
        title,
        description: boundedText(item.description, 1_000, null),
        startsAt,
        endsAt,
        location: boundedText(item.location, 200, null),
        speakers: boundedArray(item.speakers, 20, (speaker) =>
          trimmedText(speaker, 120, false),
        ),
      }
    },
  )
  const startsAt = timestamp(legacy.startsAt)
  let endsAt = timestamp(legacy.endsAt)
  if (
    startsAt &&
    endsAt &&
    new Date(endsAt).getTime() <= new Date(startsAt).getTime()
  ) {
    sanitized = true
    endsAt = null
  }
  const registrationOpensAt = timestamp(legacy.registrationOpensAt)
  let registrationClosesAt = timestamp(legacy.registrationClosesAt)
  if (
    registrationOpensAt &&
    registrationClosesAt &&
    new Date(registrationClosesAt).getTime() <=
      new Date(registrationOpensAt).getTime()
  ) {
    sanitized = true
    registrationClosesAt = null
  }
  const locationType = legacy.locationType === undefined || legacy.locationType === null
    ? null
    : legacy.locationType === "in_person" ||
        legacy.locationType === "virtual" ||
        legacy.locationType === "hybrid"
      ? legacy.locationType
      : null
  if (
    legacy.locationType !== undefined &&
    legacy.locationType !== null &&
    locationType === null
  ) sanitized = true

  const parsed = hackathonDraftStateSchema.safeParse({
    name: boundedText(legacy.name, 120, ""),
    description: boundedText(legacy.description, 5_000, null),
    startsAt,
    endsAt,
    registrationOpensAt,
    registrationClosesAt,
    locationType,
    locationName: boundedText(legacy.locationName, 240, null),
    locationUrl: safeUrl(legacy.locationUrl),
    imageUrl: safeUrl(legacy.imageUrl),
    sponsors,
    rules: boundedText(legacy.rules, 10_000, null),
    prizes,
    challenges,
    agendaItems,
  })
  return parsed.success ? { state: parsed.data, sanitized } : null
}

export function parseStoredDraft(
  raw: string,
  { sourceUrl, now = new Date(), draftId }: { sourceUrl?: string; now?: Date; draftId: string },
): StoredDraftParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  const current = hackathonDraftEnvelopeSchema.safeParse(parsed)
  if (current.success) {
    const savedAt = new Date(current.data.savedAt).getTime()
    if (now.getTime() - savedAt >= HACKATHON_DRAFT_EXPIRY_MS) return null
    if (
      sourceUrl &&
      (current.data.source.kind !== "event_import" || current.data.source.url !== sourceUrl)
    ) return null
    if (savedAt - now.getTime() > HACKATHON_DRAFT_CLOCK_SKEW_MS) {
      return {
        envelope: { ...current.data, savedAt: now.toISOString() },
        migrated: true,
        sanitized: false,
      }
    }
    return { envelope: current.data, migrated: false, sanitized: false }
  }

  if (!parsed || typeof parsed !== "object") return null
  const legacy = parsed as Record<string, unknown>
  const savedAt = typeof legacy.savedAt === "number" ? legacy.savedAt : Number.NaN
  if (
    !Number.isFinite(savedAt) ||
    now.getTime() - savedAt >= HACKATHON_DRAFT_EXPIRY_MS
  ) {
    return null
  }
  if (sourceUrl) {
    if (
      typeof legacy.sourceUrl !== "string" ||
      redactImportSourceUrl(legacy.sourceUrl) !== sourceUrl
    ) return null
  }

  const legacyState = migrateLegacyDraftState(legacy.state)
  if (!legacyState) return null

  return {
    envelope: createDraftEnvelope(legacyState.state, {
      draftId,
      source: sourceUrl
        ? { kind: "event_import", url: sourceUrl }
        : { kind: "scratch", url: null },
      now: savedAt - now.getTime() > HACKATHON_DRAFT_CLOCK_SKEW_MS
        ? now
        : new Date(savedAt),
    }),
    migrated: true,
    sanitized: legacyState.sanitized,
  }
}

export type DraftPatchResult =
  | { ok: true; envelope: DraftEnvelope }
  | { ok: false; code: "stale_revision" | "invalid_patch"; message: string }

export function applyDraftPatch(
  envelope: DraftEnvelope,
  expectedRevision: number,
  patch: DraftPatch,
  now = new Date(),
): DraftPatchResult {
  if (expectedRevision !== envelope.revision) {
    return {
      ok: false,
      code: "stale_revision",
      message: `The draft is now at revision ${envelope.revision}. Read it again before updating.`,
    }
  }

  const parsedPatch = hackathonDraftPatchSchema.safeParse(patch)
  if (!parsedPatch.success) {
    return {
      ok: false,
      code: "invalid_patch",
      message: parsedPatch.error.issues[0]?.message ?? "Check the draft update.",
    }
  }

  const normalizedPatch = {
    ...parsedPatch.data,
    ...(parsedPatch.data.locationUrl === undefined
      ? {}
      : { locationUrl: normalizeOptionalUrl(parsedPatch.data.locationUrl) ?? null }),
    ...(parsedPatch.data.imageUrl === undefined
      ? {}
      : { imageUrl: normalizeOptionalUrl(parsedPatch.data.imageUrl) ?? null }),
    ...(parsedPatch.data.challenges === undefined
      ? {}
      : {
          challenges: parsedPatch.data.challenges.map((challenge) => ({
            ...challenge,
            resources: challenge.resources.map((resource) => ({
              ...resource,
              url: normalizeUrl(resource.url),
            })),
          })),
        }),
  }

  const nextState = hackathonDraftStateSchema.safeParse({
    ...envelope.state,
    ...normalizedPatch,
  })
  if (!nextState.success) {
    return {
      ok: false,
      code: "invalid_patch",
      message: nextState.error.issues[0]?.message ?? "Check the draft update.",
    }
  }

  return {
    ok: true,
    envelope: {
      ...envelope,
      revision: envelope.revision + 1,
      state: nextState.data,
      savedAt: now.toISOString(),
    },
  }
}

export function serializeDraftEnvelope(envelope: DraftEnvelope): string {
  return JSON.stringify(hackathonDraftEnvelopeSchema.parse(envelope))
}
