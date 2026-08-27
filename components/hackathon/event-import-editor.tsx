"use client"

import { useCallback, useMemo, type ReactNode } from "react"
import {
  HackathonDraftEditor,
} from "@/components/hackathon/hackathon-draft-editor"
import { Loader2 } from "lucide-react"
import {
  createEmptyHackathonDraft,
  normalizeDraftTimestampsForSubmission,
  type DraftSource,
  type DraftState,
} from "@/lib/hackathon-draft"
import { assertOkJson } from "@/lib/utils/fetch"
import {
  isSafeExternalUrl,
  normalizeUrl,
  redactImportSourceUrl,
} from "@/lib/utils/url"
import { useIsClient } from "@/hooks/use-is-client"
import type { EventPageData } from "@/lib/services/event-page-import"
import type { EventPageRichContent } from "@/lib/services/luma-extract"

type EventImportEditorProps = {
  eventData: EventPageData
  richContent: EventPageRichContent | null
  sourceUrl: string
  storageKey: string
  submitPath: string
}

type EventImportRecoveryProps = {
  sourceUrl: string
  storageKey: string
  submitPath: string
  fallback: ReactNode
}

export function importStorageKey(storageKey: string, sourceUrl: string): string {
  void sourceUrl
  return storageKey
}

function legacyImportStorageKeys(storageKey: string, sourceUrl: string): string[] {
  return [
    `${storageKey}:${encodeURIComponent(sourceUrl)}`,
    "oatmeal:external-import",
  ].filter((key) => key !== storageKey)
}

async function submitImportedDraft({
  state,
  draftId,
  sourceUrl,
  submitPath,
  expectedOrganizationId,
  defaultLocale,
  translationLinks,
}: {
  state: DraftState
  draftId: string
  sourceUrl: string
  submitPath: string
  expectedOrganizationId: string
  defaultLocale: string | null
  translationLinks: { url: string; languageCode: string }[]
}) {
  const normalized = normalizeDraftTimestampsForSubmission(
    state,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  )
  if (!normalized.ok) throw new Error(normalized.message)

  const res = await fetch(submitPath, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...normalized.state,
      draftId,
      expectedOrganizationId,
      sourceUrl,
      defaultLocale,
      translationLinks,
    }),
  })

  return assertOkJson<{ id: string; slug: string }>(res)
}

function capImportedText(
  value: string | null | undefined,
  maxLength: number,
): string | null {
  if (!value) return null
  return value.slice(0, maxLength)
}

function importedUrl(value: string | null | undefined): string | null {
  if (!value) return null
  const normalized = normalizeUrl(value)
  return normalized.length <= 2_048 && isSafeExternalUrl(normalized)
    ? normalized
    : null
}

function importedTimestamp(value: string | null | undefined): string | null {
  if (!value) return null
  const timestamp = new Date(value)
  return Number.isFinite(timestamp.getTime()) ? timestamp.toISOString() : null
}

export function eventDataToState(
  eventData: EventPageData,
  richContent: EventPageRichContent | null
): { state: DraftState; sanitized: boolean } {
  let sanitized = false
  const cap = (value: string | null | undefined, maxLength: number) => {
    const next = capImportedText(value, maxLength)
    if (value && next !== value) sanitized = true
    return next
  }
  const safeUrl = (value: string | null | undefined) => {
    const next = importedUrl(value)
    if (value && !next) sanitized = true
    return next
  }
  const safeTimestamp = (value: string | null | undefined) => {
    const next = importedTimestamp(value)
    if (value && !next) sanitized = true
    return next
  }
  const startsAt = safeTimestamp(eventData.startsAt)
  let endsAt = safeTimestamp(eventData.endsAt)
  if (startsAt && endsAt && new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
    endsAt = null
    sanitized = true
  }
  const sponsors = (richContent?.sponsors ?? []).slice(0, 50).flatMap((sponsor) => {
    const name = cap(sponsor.name?.trim(), 120)
    if (!name) {
      sanitized = true
      return []
    }
    return [{ name, tier: cap(sponsor.tier, 80) }]
  })
  if ((richContent?.sponsors.length ?? 0) > sponsors.length) sanitized = true
  const prizes = (richContent?.prizes ?? []).slice(0, 50).flatMap((prize) => {
    const name = cap(prize.name?.trim(), 120)
    if (!name) {
      sanitized = true
      return []
    }
    return [{
      name,
      description: cap(prize.description, 1_000),
      value: cap(prize.value, 120),
    }]
  })
  if ((richContent?.prizes.length ?? 0) > prizes.length) sanitized = true
  const challenges = (richContent?.challenges ?? []).slice(0, 50).flatMap((challenge) => {
    const title = cap(challenge.title?.trim(), 200)
    if (!title) {
      sanitized = true
      return []
    }
    const resources = (challenge.resources ?? []).slice(0, 20).flatMap((resource) => {
      const url = safeUrl(resource.url)
      if (!url) return []
      return [{ label: cap(resource.label, 120) ?? "Resource", url }]
    })
    if ((challenge.resources?.length ?? 0) > resources.length) sanitized = true
    return [{ title, description: cap(challenge.description, 2_000), resources }]
  })
  if ((richContent?.challenges.length ?? 0) > challenges.length) sanitized = true
  const agendaItems = (richContent?.agendaItems ?? []).slice(0, 50).flatMap((item) => {
    const title = cap(item.title?.trim(), 200)
    if (!title) {
      sanitized = true
      return []
    }
    const itemStartsAt = safeTimestamp(item.startsAt)
    let itemEndsAt = safeTimestamp(item.endsAt)
    if (
      itemStartsAt &&
      itemEndsAt &&
      new Date(itemEndsAt).getTime() <= new Date(itemStartsAt).getTime()
    ) {
      itemEndsAt = null
      sanitized = true
    }
    const speakers = (item.speakers ?? []).slice(0, 20).flatMap((speaker) => {
      const name = cap(speaker?.trim(), 120)
      return name ? [name] : []
    })
    if ((item.speakers?.length ?? 0) > speakers.length) sanitized = true
    return [{
      title,
      description: cap(item.description, 1_000),
      startsAt: itemStartsAt,
      endsAt: itemEndsAt,
      location: cap(item.location, 200),
      speakers,
    }]
  })
  if ((richContent?.agendaItems.length ?? 0) > agendaItems.length) sanitized = true
  const name = cap(eventData.name?.trim(), 120) ?? "Imported hackathon"
  if (!eventData.name?.trim()) sanitized = true
  return { state: {
    name,
    description: cap(richContent?.cleanedDescription ?? eventData.description, 5_000),
    startsAt,
    endsAt,
    registrationOpensAt: null,
    registrationClosesAt: null,
    locationType: eventData.locationType,
    locationName: cap(eventData.locationName, 240),
    locationUrl: safeUrl(eventData.locationUrl),
    imageUrl: safeUrl(eventData.imageUrl),
    sponsors,
    rules: cap(richContent?.rules, 10_000),
    prizes,
    challenges,
    agendaItems,
  }, sanitized }
}

export function createImportDraftSource(
  sourceUrl: string,
  defaultLocale: string | null | undefined,
  translationLinks: { url: string; languageCode: string }[],
): DraftSource {
  const links = new Map<string, { url: string; languageCode: string }>()
  for (const link of translationLinks) {
    const url = redactImportSourceUrl(link.url)
    const languageCode = link.languageCode.trim().slice(0, 35)
    if (!url || !languageCode) continue
    links.set(`${languageCode}:${url}`, { url, languageCode })
    if (links.size === 10) break
  }
  const locale = defaultLocale?.trim().slice(0, 35) || null
  return {
    kind: "event_import",
    url: redactImportSourceUrl(sourceUrl),
    defaultLocale: locale,
    translationLinks: [...links.values()],
  }
}

export function EventImportEditor({
  eventData,
  richContent,
  sourceUrl,
  storageKey,
  submitPath,
}: EventImportEditorProps) {
  const imported = useMemo(
    () => eventDataToState(eventData, richContent),
    [eventData, richContent],
  )
  const importedState = imported.state
  const draftSource = useMemo(() => createImportDraftSource(
    sourceUrl,
    eventData.language,
    [
      ...(eventData.translationLinks ?? []),
      ...(richContent?.translationLinks ?? []),
    ],
  ), [eventData.language, eventData.translationLinks, richContent?.translationLinks, sourceUrl])
  const sourceStorageKey = useMemo(
    () => importStorageKey(storageKey, sourceUrl),
    [sourceUrl, storageKey],
  )
  const legacyStorageKeys = useMemo(
    () => legacyImportStorageKeys(storageKey, sourceUrl),
    [sourceUrl, storageKey],
  )
  const handleSubmit = useCallback(async (
    state: DraftState,
    draftId: string,
    source: DraftSource,
    expectedOrganizationId: string,
  ) => {
    return submitImportedDraft({
      state,
      draftId,
      sourceUrl,
      submitPath,
      expectedOrganizationId,
      defaultLocale: source.defaultLocale ?? null,
      translationLinks: source.translationLinks ?? [],
    })
  }, [submitPath, sourceUrl])

  return (
    <HackathonDraftEditor
      key={sourceStorageKey}
      initialState={importedState}
      storageKey={sourceStorageKey}
      legacyStorageKeys={legacyStorageKeys}
      onSubmit={handleSubmit}
      sourceUrl={sourceUrl}
      draftSource={draftSource}
      initialNotice={
        imported.sanitized
          ? "Some imported details were shortened or removed. Review every section before you create the event."
          : undefined
      }
      signInDescription="Your edits have been saved. Sign in to upload images and create your hackathon."
    />
  )
}

export function EventImportRecovery({
  sourceUrl,
  storageKey,
  submitPath,
  fallback,
}: EventImportRecoveryProps) {
  const sourceStorageKey = useMemo(
    () => importStorageKey(storageKey, sourceUrl),
    [sourceUrl, storageKey],
  )
  const legacyStorageKeys = useMemo(
    () => legacyImportStorageKeys(storageKey, sourceUrl),
    [sourceUrl, storageKey],
  )
  const isClient = useIsClient()

  const handleSubmit = useCallback((
    state: DraftState,
    draftId: string,
    source: DraftSource,
    expectedOrganizationId: string,
  ) => {
    return submitImportedDraft({
      state,
      draftId,
      sourceUrl,
      submitPath,
      expectedOrganizationId,
      defaultLocale: source.defaultLocale ?? null,
      translationLinks: source.translationLinks ?? [],
    })
  }, [sourceUrl, submitPath])

  if (!isClient) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
        <span className="sr-only">Checking for your saved draft</span>
      </div>
    )
  }

  return (
    <EventImportRecoveryClient
      key={`${sourceStorageKey}:${sourceUrl}`}
      sourceStorageKey={sourceStorageKey}
      sourceUrl={sourceUrl}
      legacyStorageKeys={legacyStorageKeys}
      fallback={fallback}
      onSubmit={handleSubmit}
    />
  )
}

function EventImportRecoveryClient({
  sourceStorageKey,
  sourceUrl,
  legacyStorageKeys,
  fallback,
  onSubmit,
}: {
  sourceStorageKey: string
  sourceUrl: string
  legacyStorageKeys: string[]
  fallback: ReactNode
  onSubmit: (
    state: DraftState,
    draftId: string,
    source: DraftSource,
    expectedOrganizationId: string,
  ) => Promise<{ id: string; slug: string }>
}) {
  return (
    <HackathonDraftEditor
      initialState={createEmptyHackathonDraft()}
      storageKey={sourceStorageKey}
      legacyStorageKeys={legacyStorageKeys}
      onSubmit={onSubmit}
      sourceUrl={sourceUrl}
      draftSource={{ kind: "event_import", url: sourceUrl }}
      createIfMissing={false}
      fallbackWhenNoSavedDraft={fallback}
      signInDescription="Your edits have been saved. Sign in to upload images and create your hackathon."
    />
  )
}
