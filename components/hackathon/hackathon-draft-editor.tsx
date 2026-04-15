"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useAuth, useOrganization } from "@clerk/nextjs"
import { HackathonPreviewClient } from "@/components/hackathon/preview/hackathon-preview-client"
import { SignInRequiredDialog } from "@/components/sign-in-required-dialog"
import { OrgGateDialog } from "@/components/org-gate-dialog"
import { Button } from "@/components/ui/button"
import { Check, Copy, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { PublicHackathon } from "@/lib/services/public-hackathons"

export const STORAGE_EXPIRY_MS = 24 * 60 * 60 * 1000

export type DraftSponsor = {
  name: string
  tier: string | null
}

export type DraftPrize = {
  name: string
  description: string | null
  value: string | null
}

export type DraftState = {
  name: string
  description: string | null
  startsAt: string | null
  endsAt: string | null
  locationType: "in_person" | "virtual" | "hybrid" | null
  locationName: string | null
  locationUrl: string | null
  imageUrl: string | null
  sponsors: DraftSponsor[]
  rules: string | null
  prizes: DraftPrize[]
}

type HackathonDraftEditorProps = {
  initialState: DraftState
  storageKey: string
  onSubmit: (state: DraftState) => Promise<{ slug: string }>
  sourceUrl?: string
  signInDescription?: string
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
    registration_opens_at: null,
    registration_closes_at: null,
    max_participants: null,
    min_team_size: 1,
    max_team_size: 5,
    allow_solo: true,
    status: "draft",
    phase: null,
    challenge_released_at: null,
    perks_none: false,
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
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
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
      created_at: new Date().toISOString(),
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
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })),
  }
}

export function loadSavedState(storageKey: string, sourceUrl?: string): DraftState | null {
  if (typeof window === "undefined") return null
  const saved = localStorage.getItem(storageKey)
  if (!saved) return null
  try {
    const parsed = JSON.parse(saved)
    if (Date.now() - parsed.savedAt >= STORAGE_EXPIRY_MS) {
      localStorage.removeItem(storageKey)
      return null
    }
    if (sourceUrl && parsed.sourceUrl && parsed.sourceUrl !== sourceUrl) {
      localStorage.removeItem(storageKey)
      return null
    }
    return parsed.state ?? null
  } catch {
    localStorage.removeItem(storageKey)
    return null
  }
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
  storageKey,
  onSubmit,
  sourceUrl,
  signInDescription = "Your edits have been saved. Sign in to continue.",
}: HackathonDraftEditorProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isSignedIn, isLoaded } = useAuth()
  const { organization, isLoaded: isOrgLoaded } = useOrganization()

  const [state, setState] = useState<DraftState>(() => {
    return loadSavedState(storageKey, sourceUrl) ?? initialState
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSignInDialog, setShowSignInDialog] = useState(false)
  const [orgGateOpen, setOrgGateOpen] = useState(false)
  const [sourceCopied, setSourceCopied] = useState(false)
  const pendingSubmit = useRef(false)
  const copyTimeoutRef = useRef<number | null>(null)
  const autoTriggeredRef = useRef(false)

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify({ state, sourceUrl, savedAt: Date.now() }))
  }, [state, storageKey, sourceUrl])

  useEffect(() => {
    if (!isLoaded || !isOrgLoaded || autoTriggeredRef.current) return
    if (searchParams.get("edit") !== "true") return
    if (!isSignedIn) return

    autoTriggeredRef.current = true

    if (organization) {
      doSubmitRef.current()
    } else {
      pendingSubmit.current = true
      setOrgGateOpen(true)
    }
  }, [isLoaded, isOrgLoaded, isSignedIn, organization, searchParams])

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current !== null) {
        window.clearTimeout(copyTimeoutRef.current)
      }
    }
  }, [])

  const hackathon = stateToHackathon(state)

  const doSubmit = useCallback(async () => {
    setIsSubmitting(true)
    setError(null)
    try {
      const { slug } = await onSubmit(state)
      localStorage.removeItem(storageKey)
      router.push(`/e/${slug}/manage`)
    } catch (err) {
      console.error("Failed to create hackathon:", err)
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }, [state, router, storageKey, onSubmit])

  const doSubmitRef = useRef(doSubmit)
  doSubmitRef.current = doSubmit

  const handleSubmit = useCallback(async () => {
    if (!state.name.trim()) {
      setError("Hackathon name is required")
      return
    }

    if (!isSignedIn) {
      setShowSignInDialog(true)
      return
    }

    if (!organization) {
      pendingSubmit.current = true
      setOrgGateOpen(true)
      return
    }

    await doSubmit()
  }, [state, isSignedIn, organization, doSubmit])

  const handleFormSave = useCallback(async (data: Record<string, unknown>) => {
    setState(prev => {
      const next = { ...prev }
      if ("name" in data) next.name = data.name as string
      if ("description" in data) next.description = data.description as string | null
      if ("startsAt" in data) next.startsAt = data.startsAt as string | null
      if ("endsAt" in data) next.endsAt = data.endsAt as string | null
      if ("locationType" in data) next.locationType = data.locationType as DraftState["locationType"]
      if ("locationName" in data) next.locationName = data.locationName as string | null
      if ("locationUrl" in data) next.locationUrl = data.locationUrl as string | null
      if ("imageUrl" in data) next.imageUrl = data.imageUrl as string | null
      if ("sponsors" in data) next.sponsors = data.sponsors as DraftSponsor[]
      if ("prizes" in data) next.prizes = data.prizes as DraftPrize[]
      return next
    })
    return true
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

  return (
    <div>
      <HackathonPreviewClient
        hackathon={hackathon}
        isEditable={true}
        onFormSave={handleFormSave}
        onBannerChange={(imageUrl) => {
          setState((prev) => ({ ...prev, imageUrl }))
        }}
        onAuthRequired={!isSignedIn ? () => setShowSignInDialog(true) : undefined}
      />
      <div className="fixed inset-x-0 bottom-4 z-50 px-4 sm:bottom-6">
        <div className={cn(
          "mx-auto flex w-full flex-col items-center gap-3 rounded-2xl border bg-background/95 shadow-xl backdrop-blur",
          (sourceDisplayUrl && !isSignedIn) || (isLoaded && isOrgLoaded && isSignedIn && !organization)
            ? "max-w-md px-3 py-2"
            : "max-w-3xl px-3 py-3 sm:px-4"
        )}>
          {sourceDisplayUrl && !(isLoaded && isOrgLoaded && isSignedIn && !organization) && (
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
          {isLoaded && isOrgLoaded && isSignedIn && !organization ? (
            <div className="flex w-full flex-col items-center gap-2">
              <p className="cursor-default select-none text-center text-sm text-muted-foreground">
                Connect an organization to save and publish your event
              </p>
              <Button
                size="lg"
                className="rounded-full px-8 text-base"
                onClick={handleSubmit}
                disabled={isSubmitting || !state.name.trim()}
              >
                {isSubmitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  "Connect Organization"
                )}
              </Button>
            </div>
          ) : (
            <Button
              size="lg"
              className="rounded-full px-8 text-base"
              onClick={handleSubmit}
              disabled={isSubmitting || !state.name.trim()}
            >
              {isSubmitting ? (
                <Loader2 className="size-4 animate-spin" />
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
        redirectQuery="edit=true"
      />

      <OrgGateDialog
        open={orgGateOpen}
        onOpenChange={(open) => {
          setOrgGateOpen(open)
          if (!open) pendingSubmit.current = false
        }}
        onOrgSelected={() => {
          if (pendingSubmit.current) {
            pendingSubmit.current = false
            doSubmitRef.current()
          }
        }}
      />
    </div>
  )
}
