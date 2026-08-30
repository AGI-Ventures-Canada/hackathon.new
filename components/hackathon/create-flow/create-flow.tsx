"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useAuth } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { ArrowLeft, Loader2 } from "lucide-react"
import { SignInRequiredDialog } from "@/components/sign-in-required-dialog"
import { OrgGateDialog } from "@/components/org-gate-dialog"
import type { DraftEnvelope, DraftState } from "@/lib/hackathon-draft"
import { useHackathonDraft } from "@/hooks/use-hackathon-draft"
import { CreateDraftWebMcpTools } from "@/components/hackathon/create-draft-webmcp-tools"
import { DraftReview } from "@/components/hackathon/draft-review"
import { assertOkJson, FetchResponseError } from "@/lib/utils/fetch"
import { isValidSlugFormat } from "@/lib/utils/slug"
import {
  isTestEventStage,
  type TestEventStage,
} from "@/lib/fixtures/test-event"
import {
  getPendingCreatedEventNavigation,
  rememberCreatedEventNavigation,
} from "@/lib/created-event-navigation"
import { CreateFlowProgress } from "./create-flow-progress"
import { CreateFlowStep } from "./create-flow-step"
import { StepImport } from "./step-import"
import { StepName } from "./step-name"
import { StepDates } from "./step-dates"
import { StepLocation } from "./step-location"
import { StepDescription } from "./step-description"
import { useCreateFlowKeyboard } from "./use-create-flow-keyboard"

const STORAGE_KEY = "oatmeal:create-from-scratch"
const TOTAL_STEPS = 6

interface CreateFlowProps {
  initialState: DraftState
  createInitialStateAfterMount?: () => DraftState
  onSubmit: (
    state: DraftState,
    draftId: string,
    expectedOrganizationId: string,
  ) => Promise<{ id: string; slug: string }>
}

type TestEventCreateResponse = {
  id: string
  slug: string
  committed: boolean
  replayed: boolean
}

export function CreateFlow({
  initialState,
  createInitialStateAfterMount,
  onSubmit,
}: CreateFlowProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { isSignedIn, isLoaded, has, orgId } = useAuth()

  const draft = useHackathonDraft({
    initialState,
    storageKey: STORAGE_KEY,
    createInitialStateAfterMount,
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
  const [currentStep, setCurrentStep] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSignInDialog, setShowSignInDialog] = useState(false)
  const [orgGateOpen, setOrgGateOpen] = useState(false)
  const requestedTestStage = isTestEventStage(searchParams.get("testEvent"))
    ? searchParams.get("testEvent") as TestEventStage
    : "registration"
  const [importMode, setImportMode] = useState<"choose" | "import" | "test">(
    isTestEventStage(searchParams.get("testEvent")) ? "test" : "choose",
  )
  const [testStage, setTestStage] = useState<TestEventStage>(requestedTestStage)
  const [pendingTestStage, setPendingTestStage] = useState<TestEventStage | null>(null)
  const [resumeTestAfterOrg, setResumeTestAfterOrg] = useState(false)
  const submitInFlightRef = useRef(false)
  const testCreationRef = useRef<{
    id: string
    stage: TestEventStage
    organizationId: string
  } | null>(null)
  const autoTriggeredRef = useRef(false)
  const completedEventNavigationRef = useRef<string | null>(null)

  useEffect(() => {
    if (autoTriggeredRef.current) return
    if (!hydrated || hasStoredDraft === null) return
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
    if (!hasStoredDraft) {
      setError(
        recentCompletedEventSlug
          ? "That draft already created an event. Open it below or start a new one."
          : "We couldn't restore your saved draft. Start a new event.",
      )
      setCurrentStep(0)
      return
    }
    setError(null)
    setCurrentStep(TOTAL_STEPS - 1)
  }, [hasStoredDraft, hydrated, pathname, recentCompletedEventSlug, router, searchParams])

  const canSkip = state.name.trim().length > 0
  const canCreateInActiveOrganization = Boolean(
    orgId && has?.({ role: "org:admin" }) === true,
  )
  const eventAlreadyCreated = persistenceStatus === "completed"
  const canOpenCompletedEvent = eventAlreadyCreated && Boolean(recentCompletedEventSlug)
  const openCreatedEvent = useCallback((slug: string) => {
    rememberCreatedEventNavigation(slug)
    completedEventNavigationRef.current = slug
    router.replace(`/e/${encodeURIComponent(slug)}/manage`)
  }, [router])

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
        orgId!,
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
      setError(
        err instanceof Error ? err.message : "Something went wrong. Please try again.",
      )
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
    orgId,
  ])

  const handleCreateTestEvent = useCallback(async (stage: TestEventStage) => {
    setTestStage(stage)
    setPendingTestStage(stage)
    if (!isLoaded) {
      setError("Wait a moment while we check your sign-in.")
      return
    }
    if (!isSignedIn) {
      setShowSignInDialog(true)
      return
    }
    if (!canCreateInActiveOrganization || !orgId) {
      setOrgGateOpen(true)
      return
    }
    if (submitInFlightRef.current) return

    submitInFlightRef.current = true
    setIsSubmitting(true)
    setError(null)
    if (
      !testCreationRef.current ||
      testCreationRef.current.stage !== stage ||
      testCreationRef.current.organizationId !== orgId
    ) {
      testCreationRef.current = {
        id: crypto.randomUUID(),
        stage,
        organizationId: orgId,
      }
    }

    try {
      const result = await fetch("/api/dashboard/hackathons/test-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creationId: testCreationRef.current.id,
          stage,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          expectedOrganizationId: orgId,
        }),
      }).then(assertOkJson<TestEventCreateResponse>)

      if (!result.committed || result.slug.length > 100 || !isValidSlugFormat(result.slug)) {
        throw new Error("The test event was made, but its page address was invalid. Try again.")
      }
      openCreatedEvent(result.slug)
    } catch (err) {
      if (err instanceof FetchResponseError && err.status === 401) {
        setShowSignInDialog(true)
        return
      }
      if (err instanceof FetchResponseError && err.code === "organization_context_changed") {
        setOrgGateOpen(true)
        return
      }
      setError(err instanceof Error ? err.message : "We couldn't make the test event. Try again.")
    } finally {
      submitInFlightRef.current = false
      setIsSubmitting(false)
    }
  }, [
    canCreateInActiveOrganization,
    isLoaded,
    isSignedIn,
    openCreatedEvent,
    orgId,
  ])

  useEffect(() => {
    if (
      !resumeTestAfterOrg ||
      !pendingTestStage ||
      orgGateOpen ||
      !canCreateInActiveOrganization
    ) return
    setResumeTestAfterOrg(false)
    void handleCreateTestEvent(pendingTestStage)
  }, [
    canCreateInActiveOrganization,
    handleCreateTestEvent,
    orgGateOpen,
    pendingTestStage,
    resumeTestAfterOrg,
  ])

  const handleSubmit = useCallback(async () => {
    if (!state.name.trim()) {
      setError("Hackathon name is required")
      setCurrentStep(1)
      return
    }

    if (!hydrated || !isLoaded) {
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
    isSignedIn,
    ensureSavedDraft,
    getCurrentEnvelope,
    canCreateInActiveOrganization,
    doSubmit,
  ])

  const goNext = useCallback(() => {
    if (currentStep === 1 && !state.name.trim()) {
      setError("Give your hackathon a name first")
      return
    }
    setError(null)
    if (currentStep < TOTAL_STEPS - 1) {
      setCurrentStep((s) => s + 1)
    } else {
      void handleSubmit()
    }
  }, [currentStep, state.name, handleSubmit])

  const openReview = useCallback(() => {
    setError(null)
    setCurrentStep(TOTAL_STEPS - 1)
  }, [])

  const importKeyRef = useRef(0)

  const goBack = useCallback(() => {
    if (currentStep === 0 && importMode !== "choose") {
      setImportMode("choose")
      setPendingTestStage(null)
      importKeyRef.current += 1
    } else if (currentStep > 0) {
      setError(null)
      setCurrentStep((s) => s - 1)
    }
  }, [currentStep, importMode])

  const handleClose = useCallback(() => {
    if (window.history.length > 1) {
      router.back()
    } else {
      router.push("/home")
    }
  }, [router])

  const isLastStep = currentStep === TOTAL_STEPS - 1
  const submitFromKeyboard = useCallback(() => void handleSubmit(), [handleSubmit])

  useCreateFlowKeyboard({
    onNext: goNext,
    onSkip: openReview,
    onPrimary: isLastStep ? submitFromKeyboard : undefined,
    onClose: handleClose,
    canSkip: currentStep > 0 && !isLastStep && canSkip,
    disabled: isSubmitting || eventAlreadyCreated || showSignInDialog || orgGateOpen,
  })

  if (!hydrated) {
    return (
      <div className="flex flex-1 items-center justify-center bg-background" aria-busy="true">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Restoring your draft…
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col bg-background overflow-y-auto">
      {currentStep > 0 && (
        <div className="w-full px-4 pt-6 sm:px-8">
          <div className="mx-auto max-w-2xl">
            <CreateFlowProgress
              currentStep={currentStep - 1}
              totalSteps={TOTAL_STEPS - 1}
              canSkip={canSkip && !isLastStep}
              onSkip={openReview}
              onClose={handleClose}
              skipLabel="Skip to review"
            />
          </div>
        </div>
      )}

      <div
        className="flex flex-1 items-center overflow-y-auto px-4 py-8 sm:px-8"
        inert={isSubmitting ? true : undefined}
      >
        <div className="mx-auto w-full max-w-2xl">
          <CreateFlowStep>
            {currentStep === 0 && (
              <StepImport
                key={importKeyRef.current}
                onSkipToScratch={() => {
                  setPendingTestStage(null)
                  setCurrentStep(1)
                }}
                onModeChange={(mode) => {
                  setImportMode(mode)
                  if (mode !== "test") setPendingTestStage(null)
                }}
                onCreateTestEvent={(stage) => void handleCreateTestEvent(stage)}
                initialMode={importMode}
                initialTestStage={testStage}
                isCreatingTestEvent={isSubmitting}
                testEventError={importMode === "test" ? error : null}
                savedDraftName={hasStoredDraft ? state.name.trim() || null : null}
              />
            )}
            {currentStep === 1 && (
              <StepName
                value={state.name}
                onChange={(name) => {
                  updateState((prev) => ({ ...prev, name }))
                  if (error) setError(null)
                }}
              />
            )}
            {currentStep === 2 && (
              <StepDates
                startsAt={state.startsAt}
                endsAt={state.endsAt}
                onChange={(startsAt, endsAt) =>
                  updateState((prev) => ({ ...prev, startsAt, endsAt }))
                }
              />
            )}
            {currentStep === 3 && (
              <StepLocation
                locationType={state.locationType}
                locationName={state.locationName}
                locationUrl={state.locationUrl}
                onChange={(data) => updateState((prev) => ({ ...prev, ...data }))}
              />
            )}
            {currentStep === 4 && (
              <StepDescription
                value={state.description}
                onChange={(description) =>
                  updateState((prev) => ({ ...prev, description }))
                }
              />
            )}
            {currentStep === 5 && <DraftReview state={state} />}
          </CreateFlowStep>

          {error && importMode !== "test" && (
            <p className="mt-4 text-center text-sm text-destructive">{error}</p>
          )}
          {conflictMessage && conflictMessage !== error && (
            <p className="mt-4 text-center text-sm text-muted-foreground">
              {conflictMessage}
            </p>
          )}
          {recentCompletedEventSlug && !eventAlreadyCreated && (
            <div className="mt-4 flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
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
            <p className="mt-4 text-center text-sm text-destructive">
              Turn on browser storage so we can safely create this event.
            </p>
          )}
        </div>
      </div>

      {(currentStep > 0 || importMode !== "choose") && (
        <div className="w-full border-t px-4 py-4 sm:px-8">
          <div className="mx-auto flex max-w-2xl items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={goBack}
              disabled={isSubmitting}
              aria-label="Back"
              className="gap-1.5 text-muted-foreground"
            >
              <ArrowLeft className="size-4" />
              <span className="hidden sm:inline">Back</span>
            </Button>
            {currentStep > 0 && (
              <div className="flex items-center gap-3">
                <span className="hidden text-xs text-muted-foreground sm:inline">
                  <Kbd>Enter</Kbd> to continue
                </span>
                <Button
                  type="button"
                  size="lg"
                  onClick={canOpenCompletedEvent && recentCompletedEventSlug
                    ? () => openCreatedEvent(recentCompletedEventSlug)
                    : isLastStep
                      ? () => void handleSubmit()
                      : goNext}
                  disabled={
                    !canOpenCompletedEvent && (
                      isSubmitting ||
                      eventAlreadyCreated ||
                      !hydrated ||
                      !isLoaded
                    )
                  }
                >
                  {isSubmitting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : eventAlreadyCreated ? (
                    recentCompletedEventSlug ? "Open Event" : "Opening Event…"
                  ) : isLastStep ? (
                    "Create Event"
                  ) : (
                    "Continue"
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      <SignInRequiredDialog
        open={showSignInDialog}
        onOpenChange={setShowSignInDialog}
        title={pendingTestStage ? "Sign in to make a test event" : undefined}
        description={pendingTestStage
          ? "Sign in, then review and create your private test event."
          : "Your draft has been saved. Sign in to create your hackathon."}
        redirectQuery={pendingTestStage
          ? `testEvent=${pendingTestStage}`
          : "review=true"}
        beforeNavigate={() => {
          if (pendingTestStage) return true
          const result = ensureSavedDraft()
          if (result === "saved" || result === "conflict") return true
          return result === "completed"
            ? "This event was created in another tab. Reload to start a new draft."
            : "We couldn't save your draft. Keep this page open and turn on browser storage."
        }}
      />

      {isSignedIn && (
        <OrgGateDialog
          open={orgGateOpen}
          onOpenChange={setOrgGateOpen}
          onOrgSelected={() => {
            if (pendingTestStage) setResumeTestAfterOrg(true)
          }}
        />
      )}
      <CreateDraftWebMcpTools
        enabled={hydrated && !isSubmitting && !eventAlreadyCreated}
        canOpenSignIn={Boolean(
          isLoaded && !isSignedIn && persistenceStatus === "saved"
        )}
        envelope={envelope}
        onPatch={patchState}
        onOpenReview={openReview}
        onOpenTestEvent={(stage) => {
          setImportMode("test")
          setTestStage(stage)
          setPendingTestStage(stage)
        }}
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
          setShowSignInDialog(true)
        }}
      />
    </div>
  )
}
