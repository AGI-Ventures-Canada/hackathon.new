"use client"

import { useState, useCallback, useEffect, useRef, useMemo, type ReactNode } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useAuth, useOrganization } from "@clerk/nextjs"
import { HackathonPreviewClient } from "@/components/hackathon/preview/hackathon-preview-client"
import { SignInRequiredDialog } from "@/components/sign-in-required-dialog"
import { OrgGateDialog } from "@/components/org-gate-dialog"
import { Button } from "@/components/ui/button"
import { Check, Copy, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { PublicHackathon } from "@/lib/services/public-hackathons"
import type { Challenge } from "@/lib/services/challenges"
import type { ScheduleItem } from "@/lib/services/schedule-items"
import { anchorAgendaTimestamp, composeAgendaDescription } from "@/lib/utils/agenda"
import {
  HACKATHON_DRAFT_EXPIRY_MS,
  hackathonDraftSourceSchema,
  parseStoredDraft,
  type DraftAgendaItem,
  type DraftChallenge,
  type DraftEnvelope,
  type DraftPrize,
  type DraftSource,
  type DraftSponsor,
  type DraftState,
} from "@/lib/hackathon-draft"
import {
  browserDraftStorages,
  useHackathonDraft,
} from "@/hooks/use-hackathon-draft"
import { CreateDraftWebMcpTools } from "@/components/hackathon/create-draft-webmcp-tools"
import { DraftReview } from "@/components/hackathon/draft-review"
import { FetchResponseError } from "@/lib/utils/fetch"
import { isValidSlugFormat } from "@/lib/utils/slug"
import {
  getPendingCreatedEventNavigation,
  rememberCreatedEventNavigation,
} from "@/lib/created-event-navigation"

export const STORAGE_EXPIRY_MS = HACKATHON_DRAFT_EXPIRY_MS
export type {
  DraftAgendaItem,
  DraftChallenge,
  DraftChallengeResource,
  DraftPrize,
  DraftSponsor,
  DraftState,
} from "@/lib/hackathon-draft"

type HackathonDraftEditorProps = {
  initialState: DraftState
  createInitialStateAfterMount?: () => DraftState
  storageKey: string
  legacyStorageKeys?: string[]
  onSubmit: (
    state: DraftState,
    draftId: string,
    source: DraftSource,
    expectedOrganizationId: string,
  ) => Promise<{ slug: string }>
  sourceUrl?: string
  draftSource?: DraftSource
  signInDescription?: string
  createIfMissing?: boolean
  fallbackWhenNoSavedDraft?: ReactNode
  initialNotice?: string
}

const PLACEHOLDER_ORGANIZER: PublicHackathon["organizer"] = {
  id: "",
  name: "Your Organization",
  slug: null,
  logo_url: null,
  logo_url_dark: null,
  clerk_org_id: "",
  clerk_user_id: null,
}

const DRAFT_TIMESTAMP = "1970-01-01T00:00:00.000Z"

function stateToHackathon(state: DraftState): PublicHackathon {
  return {
    id: "draft",
    tenant_id: "",
    name: state.name,
    slug: "",
    description: state.description,
    rules: state.rules,
    starts_at: state.startsAt,
    ends_at: state.endsAt,
    registration_opens_at: state.registrationOpensAt,
    registration_closes_at: state.registrationClosesAt,
    allow_late_registration: true,
    max_participants: null,
    min_team_size: 1,
    max_team_size: 5,
    allow_solo: true,
    require_team_approval: false,
    status: "draft",
    phase: null,
    challenge_released_at: null,
    perks_none: false,
    community_url: null,
    community_label: null,
    require_terms_acceptance: false,
    terms_content: null,
    translations: null,
    default_locale: null,
    banner_url: state.imageUrl,
    location_type: state.locationType,
    location_name: state.locationName,
    location_url: state.locationUrl,
    location_latitude: null,
    location_longitude: null,
    require_location_verification: false,
    anonymous_judging: false,
    judging_mode: "points",
    results_published_at: null,
    winner_emails_sent_at: null,
    results_announcement_sent_at: null,
    feedback_survey_sent_at: null,
    feedback_survey_url: null,
    metadata: {},
    created_at: DRAFT_TIMESTAMP,
    updated_at: DRAFT_TIMESTAMP,
    organizer: PLACEHOLDER_ORGANIZER,
    sponsors: state.sponsors.map((s, i) => ({
      id: `draft-${i}`,
      hackathon_id: "draft",
      sponsor_tenant_id: null,
      tenant_sponsor_id: null,
      use_org_assets: false,
      name: s.name,
      logo_url: null,
      logo_url_dark: null,
      website_url: null,
      tier: (s.tier ?? "none") as "none" | "gold" | "silver" | "bronze",
      custom_tier_label: null,
      display_order: i,
      created_at: DRAFT_TIMESTAMP,
    })),
    judges: [],
    prizes: state.prizes.map((p, i) => ({
      id: `draft-${i}`,
      hackathon_id: "draft",
      name: p.name,
      description: p.description,
      value: p.value,
      type: "favorite" as const,
      rank: null,
      kind: "other",
      display_value: null,
      criteria_id: null,
      prize_track_id: null,
      judging_style: null,
      round_id: null,
      assignment_mode: null,
      max_picks: null,
      is_screening: false,
      allowed_team_modes: null,
      display_order: i,
      created_at: DRAFT_TIMESTAMP,
      updated_at: DRAFT_TIMESTAMP,
    })),
    terms_hash: null,
  }
}

export function loadSavedState(
  storageKey: string,
  sourceUrl?: string,
  legacyStorageKeys: string[] = [],
): DraftState | null {
  if (typeof window === "undefined") return null
  const storages = browserDraftStorages()
  const keys = [storageKey, ...legacyStorageKeys.filter((key) => key !== storageKey)]
  const draftId = crypto.randomUUID()
  for (const key of keys) {
    for (const storage of storages) {
      let saved: string | null = null
      try {
        saved = storage.getItem(key)
      } catch {}
      if (!saved) continue
      const parsed = parseStoredDraft(saved, { sourceUrl, draftId })
      if (parsed) return parsed.envelope.state
    }
  }
  return null
}

function formatSourceDisplayUrl(sourceUrl: string): string {
  try {
    const url = new URL(sourceUrl)
    const path = `${url.pathname}${url.search}${url.hash}`.replace(/\/$/, "")
    return `${url.hostname}${path}`
  } catch {
    return sourceUrl.replace(/^https?:\/\//, "")
  }
}

export function HackathonDraftEditor({
  initialState,
  createInitialStateAfterMount,
  storageKey,
  legacyStorageKeys,
  onSubmit,
  sourceUrl,
  draftSource,
  signInDescription = "Your edits have been saved. Sign in to continue.",
  createIfMissing = true,
  fallbackWhenNoSavedDraft,
  initialNotice,
}: HackathonDraftEditorProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { isSignedIn, isLoaded, has } = useAuth()
  const { organization, isLoaded: isOrgLoaded } = useOrganization()

  const source = useMemo(() => {
    const candidate = draftSource ?? (sourceUrl
      ? { kind: "event_import" as const, url: sourceUrl }
      : { kind: "scratch" as const, url: null })
    const parsed = hackathonDraftSourceSchema.safeParse(candidate)
    if (parsed.success) return parsed.data
    return candidate.kind === "event_import"
      ? { kind: "event_import" as const, url: null }
      : { kind: "scratch" as const, url: null }
  }, [draftSource, sourceUrl])
  const draft = useHackathonDraft({
    initialState,
    storageKey,
    legacyStorageKeys,
    source,
    createInitialStateAfterMount,
    createIfMissing,
  })
  const {
    state,
    envelope,
    hydrated,
    persistenceStatus,
    updateState,
    patchState,
    ensureSavedDraft,
    getCurrentEnvelope,
    preserveDraftAfterConflict,
    clearSavedDraft,
    conflictMessage,
    hasStoredDraft,
    recentCompletedEventSlug,
  } = draft
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSignInDialog, setShowSignInDialog] = useState(false)
  const [reviewAfterSignIn, setReviewAfterSignIn] = useState(false)
  const [orgGateOpen, setOrgGateOpen] = useState(false)
  const [sourceCopied, setSourceCopied] = useState(false)
  const submitInFlightRef = useRef(false)
  const copyTimeoutRef = useRef<number | null>(null)
  const autoTriggeredRef = useRef(false)
  const completedEventNavigationRef = useRef<string | null>(null)
  const canCreateInActiveOrganization = Boolean(
    organization && has?.({ role: "org:admin" }) === true,
  )
  const eventAlreadyCreated = persistenceStatus === "completed"
  const canOpenCompletedEvent = eventAlreadyCreated && Boolean(recentCompletedEventSlug)
  const openCreatedEvent = useCallback((slug: string) => {
    rememberCreatedEventNavigation(slug)
    completedEventNavigationRef.current = slug
    router.replace(`/e/${encodeURIComponent(slug)}/manage`)
  }, [router])

  useEffect(() => {
    if (!hydrated || autoTriggeredRef.current) return
    const shouldOpenReview =
      searchParams.get("review") === "true" ||
      searchParams.get("create") === "true" ||
      searchParams.get("edit") === "true"
    if (!shouldOpenReview) return

    autoTriggeredRef.current = true
    const nextSearchParams = new URLSearchParams(searchParams.toString())
    nextSearchParams.delete("review")
    nextSearchParams.delete("create")
    nextSearchParams.delete("edit")
    const nextSearch = nextSearchParams.toString()
    router.replace(`${pathname}${nextSearch ? `?${nextSearch}` : ""}`)
    queueMicrotask(() => {
      document.querySelector("[data-webmcp-draft-review]")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      })
    })
  }, [hydrated, pathname, router, searchParams])

  useEffect(() => {
    if (
      !recentCompletedEventSlug ||
      (!eventAlreadyCreated && (
        hasStoredDraft !== false ||
        getPendingCreatedEventNavigation() !== recentCompletedEventSlug
      ))
    ) return
    if (completedEventNavigationRef.current === recentCompletedEventSlug) return
    openCreatedEvent(recentCompletedEventSlug)
  }, [
    eventAlreadyCreated,
    hasStoredDraft,
    openCreatedEvent,
    recentCompletedEventSlug,
  ])

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current !== null) {
        window.clearTimeout(copyTimeoutRef.current)
      }
    }
  }, [])

  const hackathon = stateToHackathon(state)
  const draftChallenges: Challenge[] = useMemo(
    () =>
      (state.challenges ?? []).map((c, i) => ({
        id: `draft-${i}`,
        hackathonId: "draft",
        title: c.title,
        description: c.description,
        resources: c.resources,
        sortOrder: i,
        createdAt: "draft",
        updatedAt: "draft",
      })),
    [state.challenges]
  )

  const draftScheduleItems: ScheduleItem[] = useMemo(() => {
    const out: ScheduleItem[] = []
    for (const item of state.agendaItems ?? []) {
      const startsAt = anchorAgendaTimestamp(item.startsAt?.trim() || null, state.startsAt)
      const title = item.title?.trim()
      if (!startsAt || !title) continue
      out.push({
        id: `draft-${out.length}`,
        hackathon_id: "draft",
        title,
        description: composeAgendaDescription(item.speakers, item.description),
        starts_at: startsAt,
        ends_at: anchorAgendaTimestamp(item.endsAt?.trim() || null, state.startsAt),
        location: item.location,
        sort_order: out.length,
        trigger_type: null,
        linked_to: null,
        created_at: DRAFT_TIMESTAMP,
        updated_at: DRAFT_TIMESTAMP,
      })
    }
    return out
  }, [state.agendaItems, state.startsAt])

  const doSubmit = useCallback(async (submittedEnvelope: DraftEnvelope) => {
    if (!submittedEnvelope.state.name.trim()) {
      setError("Hackathon name is required")
      return
    }
    if (submitInFlightRef.current) return

    submitInFlightRef.current = true
    setIsSubmitting(true)
    setError(null)
    try {
      const { slug } = await onSubmit(
        submittedEnvelope.state,
        submittedEnvelope.draftId,
        submittedEnvelope.source,
        organization!.id,
      )
      if (slug.length > 100 || !isValidSlugFormat(slug)) {
        throw new Error("The event was created, but its page address was invalid. Keep this page open and try again.")
      }
      const completion = clearSavedDraft(submittedEnvelope, slug)
      if (completion === "preservation_failed") {
        setError(
          "Your event was created, but newer edits aren't saved yet. Keep this page open and try again.",
        )
        return
      }
      if (completion === "completion_failed") {
        console.warn("The completed event could not be recorded in browser storage.")
      }
      if (completion === "cleanup_failed") {
        console.warn("The completed draft could not be cleared from browser storage.")
      }
      openCreatedEvent(slug)
    } catch (err) {
      console.error("Failed to create hackathon:", err)
      if (err instanceof FetchResponseError && err.status === 401) {
        const saveResult = ensureSavedDraft()
        if (saveResult === "saved" || saveResult === "conflict") {
          setReviewAfterSignIn(true)
          setShowSignInDialog(true)
          return
        }
        setError(
          saveResult === "completed"
            ? "This event was created in another tab. Reload to start a new draft."
            : "Your sign-in ended, but browser storage couldn't save your draft. Keep this page open and turn on browser storage.",
        )
        return
      }
      if (
        err instanceof FetchResponseError &&
        err.code === "draft_organization_conflict"
      ) {
        setError(
          "This draft was already used with another organization. Switch back to the organization you first used, then try again.",
        )
        return
      }
      if (err instanceof FetchResponseError && err.code === "finalization_unscheduled") {
        if (!err.committed || !err.existingEvent) {
          setError(err.message)
          return
        }
        const preservation = preserveDraftAfterConflict(
          submittedEnvelope,
          err.existingEvent.slug,
        )
        if (preservation === "preservation_failed") {
          setError(
            `${err.message} Your event is at /e/${err.existingEvent.slug}/manage. Keep this page open so your draft stays safe.`,
          )
          return
        }
        if (preservation === "completion_failed") {
          console.warn("The completed event could not be recorded in browser storage.")
        }
        setError(
          preservation === "preserved" || preservation === "already_rotated"
            ? "Your event was created. We're opening it now. Newer edits are saved as a new draft."
            : "Your event was created. We're opening it now.",
        )
        openCreatedEvent(err.existingEvent.slug)
        return
      }
      if (err instanceof FetchResponseError && err.code === "draft_conflict") {
        const preservation = preserveDraftAfterConflict(
          submittedEnvelope,
          err.existingEvent?.slug,
          { rotateSubmittedDraft: true },
        )
        if (err.existingEvent) {
          if (preservation === "preservation_failed") {
            setError(
              `This event was already created. Newer edits aren't saved yet. Keep this page open, then open /e/${err.existingEvent.slug}/manage in another tab.`,
            )
            return
          }
          setError(
            preservation === "preserved" || preservation === "already_rotated"
              ? "This event was already created. We're opening it now. Newer edits are saved as a new draft."
              : "This event was already created. We're opening it now.",
          )
          openCreatedEvent(err.existingEvent.slug)
          return
        }
        setError(
          preservation === "preservation_failed"
            ? "This event was already created. Keep this page open so newer edits aren't lost."
            : preservation === "preserved" || preservation === "already_rotated"
              ? "This event was already created. Newer edits are saved as a new draft."
              : "This event was already created.",
        )
        return
      }
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.")
    } finally {
      submitInFlightRef.current = false
      setIsSubmitting(false)
    }
  }, [
    openCreatedEvent,
    onSubmit,
    clearSavedDraft,
    ensureSavedDraft,
    preserveDraftAfterConflict,
    organization,
  ])

  const handleSubmit = useCallback(async () => {
    if (!state.name.trim()) {
      setError("Hackathon name is required")
      return
    }

    if (!hydrated || !isLoaded || !isOrgLoaded) {
      setError("Wait a moment while we restore your draft.")
      return
    }

    const saveResult = ensureSavedDraft()
    if (saveResult === "completed") {
      setError("This event was created in another tab. Reload to start a new draft.")
      return
    }
    if (saveResult === "conflict") {
      setError("Review the newest draft before you create it.")
      return
    }
    if (saveResult === "unavailable") {
      setError("Turn on browser storage so we can safely create this event.")
      return
    }

    if (!isSignedIn) {
      setReviewAfterSignIn(true)
      setShowSignInDialog(true)
      return
    }

    if (!canCreateInActiveOrganization) {
      setOrgGateOpen(true)
      return
    }

    await doSubmit(getCurrentEnvelope())
  }, [
    state,
    hydrated,
    isLoaded,
    isOrgLoaded,
    isSignedIn,
    ensureSavedDraft,
    getCurrentEnvelope,
    canCreateInActiveOrganization,
    doSubmit,
  ])

  const handleFormSave = useCallback(async (data: Record<string, unknown>) => {
    const updated = updateState(prev => {
      const next = { ...prev }
      if ("name" in data) next.name = data.name as string
      if ("description" in data) next.description = data.description as string | null
      if ("startsAt" in data) next.startsAt = data.startsAt as string | null
      if ("endsAt" in data) next.endsAt = data.endsAt as string | null
      if ("registrationOpensAt" in data) next.registrationOpensAt = data.registrationOpensAt as string | null
      if ("registrationClosesAt" in data) next.registrationClosesAt = data.registrationClosesAt as string | null
      if ("locationType" in data) next.locationType = data.locationType as DraftState["locationType"]
      if ("locationName" in data) next.locationName = data.locationName as string | null
      if ("locationUrl" in data) next.locationUrl = data.locationUrl as string | null
      if ("imageUrl" in data) next.imageUrl = data.imageUrl as string | null
      if ("sponsors" in data) next.sponsors = data.sponsors as DraftSponsor[]
      if ("rules" in data) next.rules = data.rules as string | null
      if ("prizes" in data) next.prizes = data.prizes as DraftPrize[]
      if ("challenges" in data) next.challenges = data.challenges as DraftChallenge[]
      if ("agendaItems" in data) next.agendaItems = data.agendaItems as DraftAgendaItem[]
      return next
    })
    return Object.entries(data).every(([key, value]) =>
      JSON.stringify(updated.state[key as keyof DraftState]) === JSON.stringify(value),
    )
  }, [updateState])

  const openReview = useCallback(() => {
    document.querySelector("[data-webmcp-draft-review]")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    })
  }, [])

  const handleCopySource = useCallback(async () => {
    if (!sourceUrl) {
      return
    }

    await navigator.clipboard.writeText(sourceUrl)
    setSourceCopied(true)

    if (copyTimeoutRef.current !== null) {
      window.clearTimeout(copyTimeoutRef.current)
    }

    copyTimeoutRef.current = window.setTimeout(() => {
      setSourceCopied(false)
      copyTimeoutRef.current = null
    }, 2000)
  }, [sourceUrl])

  const sourceDisplayUrl = sourceUrl ? formatSourceDisplayUrl(sourceUrl) : null

  if (!hydrated) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-2">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Restoring your draft…</p>
      </div>
    )
  }

  if (!createIfMissing && hasStoredDraft === false) {
    if (recentCompletedEventSlug) {
      return (
        <div className="mx-auto flex min-h-[50vh] max-w-lg flex-col items-center justify-center gap-4 px-4 text-center">
          <h1 className="text-lg font-semibold">Your event was created</h1>
          <p className="text-sm text-muted-foreground">
            Open it to keep setting it up.
          </p>
          <Button
            type="button"
            onClick={() => openCreatedEvent(recentCompletedEventSlug)}
          >
            Open Event
          </Button>
        </div>
      )
    }
    return fallbackWhenNoSavedDraft ?? null
  }

  return (
    <div>
      <HackathonPreviewClient
        hackathon={hackathon}
        challenges={draftChallenges}
        scheduleItems={draftScheduleItems}
        isEditable={hydrated && !isSubmitting && !eventAlreadyCreated}
        onFormSave={handleFormSave}
        onBannerChange={(imageUrl) => {
          updateState((prev) => ({ ...prev, imageUrl }))
        }}
        onAuthRequired={!isSignedIn ? () => {
          const saveResult = ensureSavedDraft()
          if (saveResult === "completed") {
            setError("This event was created in another tab. Reload to start a new draft.")
            return
          }
          if (saveResult === "conflict") {
            setError("Review the newest draft before you continue.")
            return
          }
          if (saveResult === "unavailable") {
            setError("Turn on browser storage so we can safely save this draft.")
            return
          }
          setReviewAfterSignIn(false)
          setShowSignInDialog(true)
        } : undefined}
      />
      <div className="mx-auto max-w-5xl px-4 pb-40 pt-8">
        <DraftReview state={state} />
      </div>
      <div className="fixed inset-x-0 bottom-4 z-50 px-4 sm:bottom-6">
        <div className={cn(
          "mx-auto flex w-full flex-col items-center gap-3 rounded-2xl border bg-background/95 shadow-xl backdrop-blur",
          (sourceDisplayUrl && !isSignedIn) ||
          (isLoaded && isOrgLoaded && isSignedIn && !canCreateInActiveOrganization)
            ? "max-w-md px-3 py-2"
            : "max-w-3xl px-3 py-3 sm:px-4"
        )}>
          {sourceDisplayUrl && !(
            isLoaded && isOrgLoaded && isSignedIn && !canCreateInActiveOrganization
          ) && (
            <div className="flex w-full items-center gap-2 rounded-full border bg-muted/50 px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={sourceUrl}>
                {sourceDisplayUrl}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="rounded-full"
                onClick={() => void handleCopySource()}
                aria-label={sourceCopied ? "Source URL copied" : "Copy source URL"}
                title={sourceCopied ? "Source URL copied" : "Copy source URL"}
              >
                {sourceCopied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              </Button>
            </div>
          )}
          {error && (
            <p className="text-center text-sm text-destructive">{error}</p>
          )}
          {initialNotice && (
            <p className="text-center text-sm text-muted-foreground">
              {initialNotice}
            </p>
          )}
          {conflictMessage && conflictMessage !== error && (
            <p className="text-center text-sm text-muted-foreground">
              {conflictMessage}
            </p>
          )}
          {recentCompletedEventSlug && !eventAlreadyCreated && (
            <div className="flex w-full flex-col items-center gap-2 sm:flex-row sm:justify-center">
              <p className="text-center text-sm text-muted-foreground">
                Your last event was created.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => openCreatedEvent(recentCompletedEventSlug)}
              >
                Open Event
              </Button>
            </div>
          )}
          {persistenceStatus === "unavailable" && !error && (
            <p className="text-center text-sm text-destructive">
              Turn on browser storage so we can safely create this event.
            </p>
          )}
          {!eventAlreadyCreated &&
          isLoaded && isOrgLoaded && isSignedIn && !canCreateInActiveOrganization ? (
            <div className="flex w-full flex-col items-center gap-2">
              <p className="cursor-default select-none text-center text-sm text-muted-foreground">
                Connect an organization to create your private event draft
              </p>
              <Button
                size="lg"
                className="rounded-full px-8 text-base"
                onClick={canOpenCompletedEvent && recentCompletedEventSlug
                  ? () => openCreatedEvent(recentCompletedEventSlug)
                  : handleSubmit}
                disabled={
                  !canOpenCompletedEvent && (
                    isSubmitting ||
                    eventAlreadyCreated ||
                    !hydrated ||
                    !isLoaded ||
                    !isOrgLoaded ||
                    !state.name.trim()
                  )
                }
              >
                {isSubmitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : eventAlreadyCreated ? (
                  recentCompletedEventSlug ? "Open Event" : "Opening Event…"
                ) : (
                  "Connect Organization"
                )}
              </Button>
            </div>
          ) : (
            <Button
              size="lg"
              className="rounded-full px-8 text-base"
              onClick={canOpenCompletedEvent && recentCompletedEventSlug
                ? () => openCreatedEvent(recentCompletedEventSlug)
                : handleSubmit}
              disabled={
                !canOpenCompletedEvent && (
                  isSubmitting ||
                  eventAlreadyCreated ||
                  !hydrated ||
                  !isLoaded ||
                  !isOrgLoaded ||
                  !state.name.trim()
                )
              }
            >
              {isSubmitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : eventAlreadyCreated ? (
                recentCompletedEventSlug ? "Open Event" : "Opening Event…"
              ) : (
                "Create Event"
              )}
            </Button>
          )}
        </div>
      </div>
      <SignInRequiredDialog
        open={showSignInDialog}
        onOpenChange={setShowSignInDialog}
        description={signInDescription}
        redirectQuery={reviewAfterSignIn ? "review=true" : "review=false"}
        resumeImport={sourceUrl ? { sourceUrl, storageKey } : undefined}
        beforeNavigate={() => {
          const result = ensureSavedDraft()
          if (result === "saved" || result === "conflict") return true
          return result === "completed"
            ? "This event was created in another tab. Reload to start a new draft."
            : "We couldn't save your draft. Keep this page open and turn on browser storage."
        }}
      />

      <OrgGateDialog
        open={orgGateOpen}
        onOpenChange={setOrgGateOpen}
        onOrgSelected={() => {}}
      />
      <CreateDraftWebMcpTools
        enabled={hydrated && !isSubmitting && !eventAlreadyCreated}
        canOpenSignIn={Boolean(
          isLoaded && !isSignedIn && persistenceStatus === "saved"
        )}
        envelope={envelope}
        onPatch={patchState}
        onOpenReview={openReview}
        onOpenSignIn={() => {
          const saveResult = ensureSavedDraft()
          if (saveResult !== "saved") {
            setError(
              saveResult === "completed"
                ? "This event was created in another tab. Reload to start a new draft."
                : saveResult === "conflict"
                ? "Review the newest draft before you continue."
                : "Turn on browser storage so we can safely save this draft.",
            )
            return
          }
          setReviewAfterSignIn(false)
          setShowSignInDialog(true)
        }}
      />
    </div>
  )
}
