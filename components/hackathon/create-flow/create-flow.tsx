"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useAuth, useOrganization } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { ArrowLeft, Loader2, X } from "lucide-react"
import { SignInRequiredDialog } from "@/components/sign-in-required-dialog"
import { OrgGateDialog } from "@/components/org-gate-dialog"
import {
  type DraftState,
  loadSavedState,
} from "@/components/hackathon/hackathon-draft-editor"
import { addDays } from "date-fns"
import { CreateFlowProgress } from "./create-flow-progress"
import { CreateFlowStep } from "./create-flow-step"
import { StepImport } from "./step-import"
import { StepName } from "./step-name"
import { StepDates } from "./step-dates"
import { StepLocation } from "./step-location"
import { StepDescription } from "./step-description"
import { useCreateFlowKeyboard } from "./use-create-flow-keyboard"

const STORAGE_KEY = "oatmeal:create-from-scratch"
const TOTAL_STEPS = 5

function buildDefaultState(): DraftState {
  const start = addDays(new Date(), 14)
  start.setHours(8, 30, 0, 0)
  const end = addDays(new Date(), 15)
  end.setHours(17, 0, 0, 0)

  return {
    name: "",
    description: null,
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    locationType: null,
    locationName: null,
    locationUrl: null,
    imageUrl: null,
    sponsors: [],
    rules: null,
    prizes: [],
  }
}

interface CreateFlowProps {
  onSubmit: (state: DraftState) => Promise<{ id: string; slug: string }>
  onPatchSettings?: (
    id: string,
    data: Record<string, unknown>,
  ) => Promise<void>
}

export function CreateFlow({ onSubmit, onPatchSettings }: CreateFlowProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isSignedIn, isLoaded } = useAuth()
  const { organization, isLoaded: isOrgLoaded } = useOrganization()

  const [state, setState] = useState<DraftState>(() => {
    return loadSavedState(STORAGE_KEY) ?? buildDefaultState()
  })
  const [currentStep, setCurrentStep] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSignInDialog, setShowSignInDialog] = useState(false)
  const [orgGateOpen, setOrgGateOpen] = useState(false)
  const [importMode, setImportMode] = useState<"choose" | "import">("choose")
  const pendingSubmit = useRef(false)
  const autoTriggeredRef = useRef(false)

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state, savedAt: Date.now() }),
    )
  }, [state])

  useEffect(() => {
    if (autoTriggeredRef.current) return
    if (!isLoaded || !isOrgLoaded) return
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

  const canSkip = state.name.trim().length > 0

  const doSubmit = useCallback(async () => {
    if (!state.name.trim()) {
      setError("Hackathon name is required")
      return
    }

    setIsSubmitting(true)
    setError(null)
    try {
      const { id, slug } = await onSubmit(state)

      const hasExtras =
        state.startsAt ||
        state.endsAt ||
        state.locationType ||
        state.locationName ||
        state.locationUrl
      if (hasExtras && onPatchSettings) {
        const patch: Record<string, unknown> = {}
        if (state.startsAt) patch.startsAt = state.startsAt
        if (state.endsAt) patch.endsAt = state.endsAt
        if (state.locationType) patch.locationType = state.locationType
        if (state.locationName) patch.locationName = state.locationName
        if (state.locationUrl) patch.locationUrl = state.locationUrl
        await onPatchSettings(id, patch)
      }

      localStorage.removeItem(STORAGE_KEY)
      router.push(`/e/${slug}/manage`)
    } catch (err) {
      console.error("Failed to create hackathon:", err)
      setError(
        err instanceof Error ? err.message : "Something went wrong. Please try again.",
      )
    } finally {
      setIsSubmitting(false)
    }
  }, [state, router, onSubmit, onPatchSettings])

  const doSubmitRef = useRef(doSubmit)
  doSubmitRef.current = doSubmit

  const handleSubmit = useCallback(async () => {
    if (!state.name.trim()) {
      setError("Hackathon name is required")
      setCurrentStep(1)
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

  const importKeyRef = useRef(0)

  const goBack = useCallback(() => {
    if (currentStep === 0 && importMode === "import") {
      setImportMode("choose")
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

  useCreateFlowKeyboard({
    onNext: goNext,
    onSkip: () => void handleSubmit(),
    onClose: handleClose,
    canSkip,
  })

  const isLastStep = currentStep === TOTAL_STEPS - 1

  return (
    <div className="flex flex-1 flex-col bg-background overflow-y-auto">
      <div className="w-full px-4 pt-6 sm:px-8">
        <div className="mx-auto max-w-2xl">
          {currentStep === 0 ? (
            <div className="flex items-center">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClose}
                className="gap-1.5 text-muted-foreground"
              >
                <X className="size-4" />
                <span className="hidden sm:inline">Close</span>
              </Button>
            </div>
          ) : (
            <CreateFlowProgress
              currentStep={currentStep - 1}
              totalSteps={TOTAL_STEPS - 1}
              canSkip={canSkip}
              onSkip={() => void handleSubmit()}
              onClose={handleClose}
            />
          )}
        </div>
      </div>

      <div className="flex flex-1 items-center overflow-y-auto px-4 py-8 sm:px-8">
        <div className="mx-auto w-full max-w-2xl">
          <CreateFlowStep>
            {currentStep === 0 && (
              <StepImport
                key={importKeyRef.current}
                onSkipToScratch={() => setCurrentStep(1)}
                onModeChange={setImportMode}
              />
            )}
            {currentStep === 1 && (
              <StepName
                value={state.name}
                onChange={(name) => {
                  setState((prev) => ({ ...prev, name }))
                  if (error) setError(null)
                }}
              />
            )}
            {currentStep === 2 && (
              <StepDates
                startsAt={state.startsAt}
                endsAt={state.endsAt}
                onChange={(startsAt, endsAt) =>
                  setState((prev) => ({ ...prev, startsAt, endsAt }))
                }
              />
            )}
            {currentStep === 3 && (
              <StepLocation
                locationType={state.locationType}
                locationName={state.locationName}
                locationUrl={state.locationUrl}
                onChange={(data) => setState((prev) => ({ ...prev, ...data }))}
              />
            )}
            {currentStep === 4 && (
              <StepDescription
                value={state.description}
                onChange={(description) =>
                  setState((prev) => ({ ...prev, description }))
                }
              />
            )}
          </CreateFlowStep>

          {error && (
            <p className="mt-4 text-center text-sm text-destructive">{error}</p>
          )}
        </div>
      </div>

      {(currentStep > 0 || importMode === "import") && (
        <div className="w-full border-t px-4 py-4 sm:px-8">
          <div className="mx-auto flex max-w-2xl items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={goBack}
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
                  onClick={isLastStep ? () => void handleSubmit() : goNext}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <Loader2 className="size-4 animate-spin" />
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
        description="Your draft has been saved. Sign in to create your hackathon."
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
