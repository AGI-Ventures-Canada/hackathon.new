"use client"

import { useState, useRef, useEffect } from "react"
import { useUser } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog } from "@/components/ui/dialog"
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldGroup,
} from "@/components/ui/field"
import { SteppedDialogContent } from "@/components/ui/stepped-dialog-content"
import {
  AlertTriangle,
  Clock,
  ExternalLink,
  FileText,
  Github,
  ImageIcon,
  Loader2,
  Lock,
  Pencil,
  Send,
  Type,
  Upload,
  Video,
  X,
} from "lucide-react"
import type { HackathonStatus, Submission, TeamStatus } from "@/lib/db/hackathon-types"
import {
  normalizeOptionalUrl,
  normalizeUrl,
  normalizeUrlFieldValue,
  urlInputProps,
} from "@/lib/utils/url"
import { cn } from "@/lib/utils"
import {
  buildSubmissionScreenshotMetadata,
  getSubmissionScreenshots,
  MAX_SUBMISSION_SCREENSHOTS,
  MAX_SUBMISSION_SCREENSHOT_REQUEST_BYTES,
  SUBMISSION_SCREENSHOT_SLOTS,
  type SubmissionScreenshot,
  type SubmissionScreenshotSlot,
} from "@/lib/utils/submission-screenshots"
import { getVideoEmbedInfo } from "@/lib/utils/video-embed"
import { VideoEmbed } from "@/components/hackathon/video-embed"
import {
  PREPARE_PROJECT_EVENT,
  type PrepareProjectEvent,
} from "@/lib/webmcp/client-events"

const submissionSteps = [
  { key: "title", label: "Title", icon: Type },
  { key: "githubUrl", label: "GitHub", icon: Github },
  { key: "demoVideoUrl", label: "Video link", icon: Video },
  { key: "liveAppUrl", label: "Project URL", icon: ExternalLink },
  { key: "description", label: "What is this?", icon: FileText },
  { key: "screenshots", label: "Screenshots", icon: ImageIcon },
] as const

type SubmissionStep = (typeof submissionSteps)[number]["key"]

type SubmissionDraft = {
  title: string
  githubUrl: string
  liveAppUrl: string
  demoVideoUrl: string
  description: string
  currentStep: number
  screenshots: SubmissionScreenshot[]
  screenshotPreview?: string | null
}

type ScreenshotDraftItem = SubmissionScreenshot & {
  id: string
  file: File | null
}

const allowedScreenshotTypes = ["image/png", "image/jpeg", "image/webp"]

function isScreenshotSlot(value: unknown): value is SubmissionScreenshotSlot {
  return (
    typeof value === "number" &&
    SUBMISSION_SCREENSHOT_SLOTS.includes(value as SubmissionScreenshotSlot)
  )
}

function getInitialScreenshotDrafts(submission: Submission | null): ScreenshotDraftItem[] {
  if (!submission) {
    return []
  }

  return getSubmissionScreenshots(submission).map((screenshot) => ({
    ...screenshot,
    id: `existing-${screenshot.slot}-${screenshot.url}`,
    file: null,
  }))
}

function parseSubmissionDraft(rawDraft: string | null): SubmissionDraft | null {
  if (!rawDraft) return null

  try {
    const parsed = JSON.parse(rawDraft) as Partial<SubmissionDraft>
    const savedScreenshots: SubmissionScreenshot[] = Array.isArray(parsed.screenshots)
      ? parsed.screenshots.flatMap((screenshot) =>
          isScreenshotSlot(screenshot.slot) &&
          typeof screenshot.url === "string" &&
          screenshot.url.trim()
            ? [{ slot: screenshot.slot, url: screenshot.url }]
            : []
        )
      : []
    const screenshots: SubmissionScreenshot[] = savedScreenshots.length
      ? savedScreenshots.slice(0, MAX_SUBMISSION_SCREENSHOTS)
      : typeof parsed.screenshotPreview === "string" && parsed.screenshotPreview
        ? [{ slot: 0 as const, url: parsed.screenshotPreview }]
        : []

    return {
      title: typeof parsed.title === "string" ? parsed.title : "",
      githubUrl: typeof parsed.githubUrl === "string" ? parsed.githubUrl : "",
      liveAppUrl: typeof parsed.liveAppUrl === "string" ? parsed.liveAppUrl : "",
      demoVideoUrl: typeof parsed.demoVideoUrl === "string" ? parsed.demoVideoUrl : "",
      description: typeof parsed.description === "string" ? parsed.description : "",
      currentStep: Math.min(
        Math.max(typeof parsed.currentStep === "number" ? parsed.currentStep : 0, 0),
        submissionSteps.length - 1
      ),
      screenshots,
    }
  } catch {
    return null
  }
}

function toScreenshotDraftItems(
  screenshots: SubmissionScreenshot[],
  idPrefix: string
): ScreenshotDraftItem[] {
  return screenshots.map((screenshot) => ({
    ...screenshot,
    id: `${idPrefix}-${screenshot.slot}-${screenshot.url}`,
    file: null,
  }))
}

interface SubmissionButtonProps {
  hackathonSlug: string
  status: HackathonStatus
  isRegistered: boolean
  submission: Submission | null
  teamSizeWarning?: string | null
  pendingTeamApproval?: boolean
  teamStatus?: TeamStatus | null
}

export function SubmissionButton({
  hackathonSlug,
  status,
  isRegistered,
  submission: initialSubmission,
  teamSizeWarning,
  pendingTeamApproval = false,
  teamStatus = null,
}: SubmissionButtonProps) {
  const { isSignedIn, isLoaded } = useUser()
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const screenshotPickerModeRef = useRef<{ replaceSlot: SubmissionScreenshotSlot | null }>({
    replaceSlot: null,
  })
  const previewUrlsRef = useRef<Set<string>>(new Set())
  const aggregateRequestIdRef = useRef<string | null>(null)
  const submissionInFlightRef = useRef(false)
  const [submission, setSubmission] = useState(initialSubmission)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentStep, setCurrentStep] = useState(0)

  const [title, setTitle] = useState(submission?.title || "")
  const [githubUrl, setGithubUrl] = useState(submission?.github_url || "")
  const [liveAppUrl, setLiveAppUrl] = useState(submission?.live_app_url || "")
  const [demoVideoUrl, setDemoVideoUrl] = useState(submission?.demo_video_url || "")
  const [description, setDescription] = useState(submission?.description || "")
  const [screenshots, setScreenshots] = useState<ScreenshotDraftItem[]>(() =>
    getInitialScreenshotDrafts(initialSubmission)
  )
  const [isDraggingScreenshots, setIsDraggingScreenshots] = useState(false)

  const canSubmit = status === "active"
  const isPendingTeam = pendingTeamApproval || teamStatus === "pending_approval"
  const isDisbandedTeam = teamStatus === "disbanded"
  const draftStorageKey = `oatmeal:submission-draft:${hackathonSlug}`
  const videoPreview = demoVideoUrl.trim() ? getVideoEmbedInfo(demoVideoUrl) : null

  useEffect(() => {
    const previewUrls = previewUrlsRef.current
    return () => {
      for (const url of previewUrls) {
        URL.revokeObjectURL(url)
      }
    }
  }, [])

  useEffect(() => {
    if (!isDialogOpen || typeof window === "undefined") {
      return
    }

    const draft: SubmissionDraft = {
      title,
      githubUrl,
      liveAppUrl,
      demoVideoUrl,
      description,
      currentStep,
      screenshots: screenshots
        .filter((screenshot) => !screenshot.url.startsWith("blob:"))
        .map(({ slot, url }) => ({ slot, url })),
    }

    window.localStorage.setItem(draftStorageKey, JSON.stringify(draft))
  }, [
    currentStep,
    description,
    demoVideoUrl,
    draftStorageKey,
    githubUrl,
    isDialogOpen,
    liveAppUrl,
    screenshots,
    title,
  ])

  useEffect(() => {
    const prepareProject = (event: Event) => {
      const { draft, acknowledge } = (event as PrepareProjectEvent).detail
      try {
        const savedDraft = parseSubmissionDraft(window.localStorage.getItem(draftStorageKey))
        const preservedProgress = isDialogOpen
          ? {
              currentStep,
              screenshots: screenshots
                .filter((screenshot) => !screenshot.url.startsWith("blob:"))
                .map(({ slot, url }) => ({ slot, url })),
            }
          : {
              currentStep: savedDraft?.currentStep ?? 0,
              screenshots: savedDraft?.screenshots ?? [],
            }
        const mergedDraft: SubmissionDraft = {
          ...draft,
          ...preservedProgress,
        }
        const serializedDraft = JSON.stringify(mergedDraft)

        window.localStorage.setItem(draftStorageKey, serializedDraft)
        if (window.localStorage.getItem(draftStorageKey) !== serializedDraft) {
          throw new Error("Project draft storage verification failed")
        }
        aggregateRequestIdRef.current = null
        setTitle(draft.title)
        setGithubUrl(draft.githubUrl)
        setLiveAppUrl(draft.liveAppUrl)
        setDemoVideoUrl(draft.demoVideoUrl)
        setDescription(draft.description)
        setError(null)
        if (!isDialogOpen) {
          setCurrentStep(mergedDraft.currentStep)
          for (const screenshot of screenshots) {
            if (screenshot.url.startsWith("blob:")) {
              URL.revokeObjectURL(screenshot.url)
              previewUrlsRef.current.delete(screenshot.url)
            }
          }
          setScreenshots(toScreenshotDraftItems(mergedDraft.screenshots, "prepared"))
        }
        if (isSignedIn && isRegistered && canSubmit && !isPendingTeam && !isDisbandedTeam) {
          setIsDialogOpen(true)
        }
        acknowledge({ ok: true })
      } catch {
        acknowledge({
          ok: false,
          error: {
            code: "storage_unavailable",
            message: "Turn on browser storage, then try again.",
            retryable: false,
          },
        })
      }
    }
    window.addEventListener(PREPARE_PROJECT_EVENT, prepareProject)
    return () => window.removeEventListener(PREPARE_PROJECT_EVENT, prepareProject)
  }, [
    canSubmit,
    currentStep,
    draftStorageKey,
    isDialogOpen,
    isRegistered,
    isSignedIn,
    isDisbandedTeam,
    isPendingTeam,
    screenshots,
  ])

  if (!isLoaded) {
    return (
      <Button disabled variant="outline" size="lg">
        <Loader2 className="size-4 animate-spin" />
        Loading...
      </Button>
    )
  }

  if (!isSignedIn) {
    return null
  }

  if (!isRegistered) {
    return null
  }

  if (!canSubmit) {
    if (status === "judging" || status === "completed") {
      return (
        <Button disabled variant="outline" size="lg">
          <Lock className="size-4" />
          Submissions Closed
        </Button>
      )
    }
    return null
  }

  if (isDisbandedTeam) {
    return (
      <Button
        disabled
        variant="outline"
        size="lg"
        title="Your team is no longer active. Ask the organizer if you need help."
      >
        <Lock className="size-4" />
        Team is no longer active
      </Button>
    )
  }

  if (isPendingTeam) {
    return (
      <Button disabled variant="outline" size="lg" title="Your team is waiting for organizer approval before you can submit.">
        <Clock className="size-4" />
        Waiting for team approval
      </Button>
    )
  }

  function revokePreviewUrl(url: string) {
    if (!url.startsWith("blob:")) {
      return
    }

    URL.revokeObjectURL(url)
    previewUrlsRef.current.delete(url)
  }

  function revokePreviewUrls(items: ScreenshotDraftItem[]) {
    for (const screenshot of items) {
      revokePreviewUrl(screenshot.url)
    }
  }

  function createPreviewUrl(file: File) {
    const url = URL.createObjectURL(file)
    previewUrlsRef.current.add(url)
    return url
  }

  function resetForm() {
    setTitle(submission?.title || "")
    setGithubUrl(submission?.github_url || "")
    setLiveAppUrl(submission?.live_app_url || "")
    setDemoVideoUrl(submission?.demo_video_url || "")
    setDescription(submission?.description || "")
    revokePreviewUrls(screenshots)
    setScreenshots(getInitialScreenshotDrafts(submission))
    setIsDraggingScreenshots(false)
    setError(null)
    setCurrentStep(0)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  function getSavedDraft(): SubmissionDraft | null {
    if (typeof window === "undefined") {
      return null
    }

    return parseSubmissionDraft(window.localStorage.getItem(draftStorageKey))
  }

  function restoreDraft() {
    const draft = getSavedDraft()
    if (!draft) {
      return
    }

    setTitle(draft.title)
    setGithubUrl(draft.githubUrl)
    setLiveAppUrl(draft.liveAppUrl)
    setDemoVideoUrl(draft.demoVideoUrl)
    setDescription(draft.description)
    setCurrentStep(draft.currentStep)
    revokePreviewUrls(screenshots)
    setScreenshots(toScreenshotDraftItems(draft.screenshots, "draft"))
  }

  function clearDraft() {
    if (typeof window === "undefined") {
      return
    }

    window.localStorage.removeItem(draftStorageKey)
  }

  function validateScreenshotFile(file: File): string | null {
    if (!allowedScreenshotTypes.includes(file.type)) {
      return "Please select a PNG, JPEG, or WebP image"
    }

    if (file.size > MAX_SUBMISSION_SCREENSHOT_REQUEST_BYTES) {
      return "Screenshots must be 4MB or less in total"
    }

    return null
  }

  function openScreenshotPicker(replaceSlot: SubmissionScreenshotSlot | null = null) {
    screenshotPickerModeRef.current.replaceSlot = replaceSlot
    fileInputRef.current?.click()
  }

  function handleScreenshotFiles(
    fileList: File[],
    replaceSlot: SubmissionScreenshotSlot | null
  ) {
    const availableSlots = replaceSlot === null
      ? SUBMISSION_SCREENSHOT_SLOTS.filter((slot) =>
          !screenshots.some((screenshot) => screenshot.slot === slot)
        )
      : [replaceSlot]

    if (availableSlots.length === 0) {
      setError(null)
      return
    }

    const files = fileList.slice(0, availableSlots.length)
    for (const file of files) {
      const message = validateScreenshotFile(file)
      if (message) {
        setError(message)
        return
      }
    }

    const retainedBytes = screenshots
      .filter((screenshot) => screenshot.file && screenshot.slot !== replaceSlot)
      .reduce((total, screenshot) => total + (screenshot.file?.size ?? 0), 0)
    const selectedBytes = files.reduce((total, file) => total + file.size, 0)
    if (retainedBytes + selectedBytes > MAX_SUBMISSION_SCREENSHOT_REQUEST_BYTES) {
      setError("Screenshots must be 4MB or less in total")
      return
    }

    setError(fileList.length > availableSlots.length ? "You can upload up to 2 screenshots." : null)
    aggregateRequestIdRef.current = null
    setScreenshots((previous) => {
      const next = replaceSlot === null
        ? [...previous]
        : previous.filter((screenshot) => {
            if (screenshot.slot === replaceSlot) {
              revokePreviewUrl(screenshot.url)
              return false
            }
            return true
          })

      for (const [index, file] of files.entries()) {
        const slot = availableSlots[index]
        if (slot === undefined) {
          continue
        }
        next.push({
          id: `draft-${slot}-${file.name}-${file.lastModified}`,
          slot,
          url: createPreviewUrl(file),
          file,
        })
      }

      return next.sort((a, b) => a.slot - b.slot)
    })
  }

  function handleScreenshotSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    handleScreenshotFiles(files, screenshotPickerModeRef.current.replaceSlot)
    screenshotPickerModeRef.current.replaceSlot = null
    e.target.value = ""
  }

  function handleRemoveScreenshot(slot: SubmissionScreenshotSlot) {
    aggregateRequestIdRef.current = null
    setScreenshots((previous) =>
      previous.filter((screenshot) => {
        if (screenshot.slot === slot) {
          revokePreviewUrl(screenshot.url)
          return false
        }
        return true
      })
    )
    setError(null)
  }

  function handleScreenshotDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    if (!isSubmitting) {
      setIsDraggingScreenshots(true)
    }
  }

  function handleScreenshotDragLeave(e: React.DragEvent<HTMLDivElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      setIsDraggingScreenshots(false)
    }
  }

  function handleScreenshotDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDraggingScreenshots(false)

    if (isSubmitting) {
      return
    }

    handleScreenshotFiles(Array.from(e.dataTransfer.files), null)
  }

  function handleOpenChange(open: boolean) {
    setIsDialogOpen(open)
    if (open) {
      resetForm()
      restoreDraft()
    } else {
      setError(null)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !isSubmitting) {
      e.preventDefault()
      if (currentStep === submissionSteps.length - 1) {
        handleSubmit(e as unknown as React.FormEvent)
        return
      }
      handleNextStep()
    }
  }

  function getErrorMessage(code: string, fallback: string): string {
    const errorMessages: Record<string, string> = {
      not_authenticated: "Please sign in to submit.",
      hackathon_not_found: "This hackathon no longer exists.",
      not_registered: "You must register before submitting.",
      submissions_closed: "Submissions are not currently open.",
      already_submitted: "You have already submitted. Edit your existing submission.",
      invalid_github_url: "Please enter a valid GitHub repository URL.",
      invalid_demo_video_url: "Please enter a valid video link.",
      no_file: "Please select a screenshot to upload.",
      invalid_file_type: "Please select a PNG, JPEG, or WebP image.",
      file_too_large: "Screenshots must be 4MB or less in total.",
      upload_failed: "Failed to upload screenshot. Please try again.",
      invalid_screenshot_slot: "One of the screenshot slots is invalid.",
      screenshot_sync_failed: "Your project was saved, but screenshot changes did not finish.",
    }
    return errorMessages[code] || fallback
  }

  function validateStep(step: SubmissionStep): string | null {
    if (step === "title" && !title.trim()) {
      return "Title is required"
    }

    if (step === "githubUrl") {
      if (!githubUrl.trim()) {
        return "GitHub URL is required"
      }
      try {
        const url = new URL(normalizeUrl(githubUrl))
        if (url.hostname !== "github.com" && url.hostname !== "www.github.com") {
          return "Please enter a valid GitHub URL"
        }
      } catch {
        return "Please enter a valid GitHub URL"
      }
    }

    if (step === "liveAppUrl" && liveAppUrl.trim()) {
      try {
        new URL(normalizeUrl(liveAppUrl))
      } catch {
        return "Please enter a valid project URL"
      }
    }

    if (step === "demoVideoUrl" && demoVideoUrl.trim()) {
      try {
        new URL(normalizeUrl(demoVideoUrl))
      } catch {
        return "Please enter a valid video link"
      }
    }

    if (step === "description") {
      if (!description.trim()) {
        return "Please tell judges what your project is"
      }
      if (description.length > 280) {
        return "Keep this description to 280 characters or less"
      }
    }

    return null
  }

  function validateForm(): { step: number; message: string } | null {
    for (const [index, step] of submissionSteps.entries()) {
      const message = validateStep(step.key)
      if (message) {
        return { step: index, message }
      }
    }

    return null
  }

  function handleNextStep() {
    const validationError = validateStep(submissionSteps[currentStep].key)
    if (validationError) {
      setError(validationError)
      return
    }

    setError(null)
    setCurrentStep((step) => Math.min(step + 1, submissionSteps.length - 1))
  }

  function handlePreviousStep() {
    setError(null)
    setCurrentStep((step) => Math.max(step - 1, 0))
  }

  function handleChange(setter: (value: string) => void, value: string) {
    aggregateRequestIdRef.current = null
    setter(value)
    if (error) {
      setError(null)
    }
  }

  async function handleFormSubmit(e: React.FormEvent) {
    if (currentStep < submissionSteps.length - 1) {
      e.preventDefault()
      handleNextStep()
      return
    }

    await handleSubmit(e)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submissionInFlightRef.current) return
    setError(null)

    const validationError = validateForm()
    if (validationError) {
      setCurrentStep(validationError.step)
      setError(validationError.message)
      return
    }

    submissionInFlightRef.current = true
    setIsSubmitting(true)

    try {
      const normalizedGithubUrl = normalizeUrl(githubUrl)
      const normalizedLiveAppUrl = normalizeOptionalUrl(liveAppUrl)
      const normalizedDemoVideoUrl = normalizeOptionalUrl(demoVideoUrl)
      const formData = new FormData()
      const requestId = aggregateRequestIdRef.current ?? crypto.randomUUID()
      aggregateRequestIdRef.current = requestId
      formData.append("payload", JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          githubUrl: normalizedGithubUrl,
          liveAppUrl: normalizedLiveAppUrl,
          demoVideoUrl: normalizedDemoVideoUrl,
          retainedScreenshotSlots: screenshots
            .filter((screenshot) => screenshot.file === null)
            .map((screenshot) => screenshot.slot),
          requestId,
        }))
      for (const screenshot of screenshots) {
        if (screenshot.file) {
          formData.append(`screenshot_${screenshot.slot}`, screenshot.file)
        }
      }

      const response = await fetch(`/api/public/hackathons/${hackathonSlug}/submissions/complete`, {
        method: "POST",
        body: formData,
      })

      let data
      try {
        data = await response.json()
      } catch {
        setError("Unable to process response. Please try again.")
        return
      }

      if (!response.ok) {
        if (data.projectSaved && typeof data.submissionId === "string") {
          const savedScreenshots: SubmissionScreenshot[] = Array.isArray(data.screenshots)
            ? data.screenshots.filter(
                (screenshot: unknown): screenshot is SubmissionScreenshot =>
                  !!screenshot &&
                  typeof screenshot === "object" &&
                  isScreenshotSlot((screenshot as SubmissionScreenshot).slot) &&
                  typeof (screenshot as SubmissionScreenshot).url === "string" &&
                  Boolean((screenshot as SubmissionScreenshot).url.trim())
              )
            : submission
              ? getSubmissionScreenshots(submission)
              : []
          const savedSlots = new Set(savedScreenshots.map((screenshot) => screenshot.slot))
          const pendingScreenshots = screenshots.filter(
            (screenshot) => screenshot.file && !savedSlots.has(screenshot.slot)
          )
          for (const screenshot of screenshots) {
            if (screenshot.file && savedSlots.has(screenshot.slot)) {
              revokePreviewUrl(screenshot.url)
            }
          }
          setScreenshots([
            ...pendingScreenshots,
            ...toScreenshotDraftItems(savedScreenshots, "saved"),
          ].sort((left, right) => left.slot - right.slot))
          setSubmission({
            ...submission,
            id: data.submissionId,
            title: title.trim(),
            description: description.trim(),
            github_url: normalizedGithubUrl,
            live_app_url: normalizedLiveAppUrl,
            demo_video_url: normalizedDemoVideoUrl,
            screenshot_url: savedScreenshots[0]?.url ?? null,
            metadata: buildSubmissionScreenshotMetadata(submission?.metadata, savedScreenshots),
          } as Submission)
          setError(`Your project was saved, but screenshot changes did not finish. ${data.error || "Try again."}`)
          return
        }
        setError(getErrorMessage(data.code, data.error || "Failed to submit"))
        return
      }

      const finalScreenshots: SubmissionScreenshot[] = Array.isArray(data.screenshots)
        ? data.screenshots.filter(
            (screenshot: unknown): screenshot is SubmissionScreenshot =>
              !!screenshot &&
              typeof screenshot === "object" &&
              isScreenshotSlot((screenshot as SubmissionScreenshot).slot) &&
              typeof (screenshot as SubmissionScreenshot).url === "string" &&
              Boolean((screenshot as SubmissionScreenshot).url.trim())
          )
        : []
      const finalMetadata = buildSubmissionScreenshotMetadata(
        submission?.metadata,
        finalScreenshots
      )

      for (const screenshot of screenshots) {
        if (screenshot.file) {
          revokePreviewUrl(screenshot.url)
        }
      }
      setScreenshots(toScreenshotDraftItems(finalScreenshots, "saved"))

      setSubmission({
        ...submission,
        id: data.submissionId,
        title: title.trim(),
        description: description.trim(),
        github_url: normalizedGithubUrl,
        live_app_url: normalizedLiveAppUrl,
        demo_video_url: normalizedDemoVideoUrl,
        screenshot_url: finalScreenshots[0]?.url ?? null,
        metadata: finalMetadata,
      } as Submission)

      clearDraft()
      aggregateRequestIdRef.current = null
      setIsDialogOpen(false)
      router.refresh()
    } catch (err) {
      if (err instanceof TypeError && err.message.includes("fetch")) {
        setError("Network error. Please check your connection and try again.")
      } else {
        setError("An unexpected error occurred. Please try again.")
      }
    } finally {
      submissionInFlightRef.current = false
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <Button onClick={() => handleOpenChange(true)} variant="outline" size="lg">
        {submission ? (
          <>
            <Pencil className="size-4" />
            Edit Submission
          </>
        ) : (
          <>
            <Send className="size-4" />
            Submit Project
          </>
        )}
      </Button>

      <Dialog open={isDialogOpen} onOpenChange={handleOpenChange}>
        <SteppedDialogContent
          className="sm:max-w-5xl"
          currentStep={currentStep}
          description={
            submission
              ? "Update your project for the competition."
              : "Submit your hackathon project to the competition."
          }
          onStepChange={(index) => {
            setError(null)
            setCurrentStep(index)
          }}
          stepsLayout="timeline"
          steps={submissionSteps.map((step) => ({
            key: step.key,
            label: step.label,
            complete:
              step.key === "title"
                ? title.trim().length > 0
                : step.key === "githubUrl"
                  ? githubUrl.trim().length > 0
                  : step.key === "demoVideoUrl"
                    ? demoVideoUrl.trim().length > 0
                    : step.key === "liveAppUrl"
                      ? liveAppUrl.trim().length > 0
                      : step.key === "description"
                        ? description.trim().length > 0
                        : screenshots.length > 0,
            icon: step.icon,
          }))}
          title={submission ? "Edit Your Submission" : "Submit Your Project"}
        >
          {teamSizeWarning && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2.5">
              <AlertTriangle className="size-4 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-destructive">Team size warning</p>
                <p className="text-xs text-destructive/90">{teamSizeWarning}</p>
                <p className="text-xs text-muted-foreground mt-1">You can still submit, but judges will see this warning.</p>
              </div>
            </div>
          )}
          <form onSubmit={handleFormSubmit} onKeyDown={handleKeyDown} className="space-y-4" autoComplete="off">
            <FieldGroup>
              {currentStep === 0 && (
                <Field>
                  <FieldLabel htmlFor="submission-title">Title</FieldLabel>
                  <Input
                    id="submission-title"
                    name="title"
                    placeholder="My Awesome Project"
                    value={title}
                    onChange={(e) => handleChange(setTitle, e.target.value)}
                    maxLength={100}
                    autoComplete="off"
                    autoFocus
                    data-1p-ignore
                    data-lpignore="true"
                    data-form-type="other"
                  />
                </Field>
              )}

              {currentStep === 1 && (
                <Field>
                  <FieldLabel htmlFor="submission-github">GitHub URL</FieldLabel>
                  <Input
                    id="submission-github"
                    name="githubUrl"
                    {...urlInputProps}
                    placeholder="github.com/username/repo"
                    value={githubUrl}
                    onChange={(e) => handleChange(setGithubUrl, e.target.value)}
                    onBlur={() => setGithubUrl(normalizeUrlFieldValue(githubUrl))}
                    autoComplete="off"
                    autoFocus
                    data-1p-ignore
                    data-lpignore="true"
                    data-form-type="other"
                  />
                </Field>
              )}


              {currentStep === 2 && (
                <Field>
                  <FieldLabel htmlFor="submission-demo-video-url">
                    Video link <span className="text-muted-foreground font-normal">(optional)</span>
                  </FieldLabel>
                  <Input
                    id="submission-demo-video-url"
                    name="demoVideoUrl"
                    {...urlInputProps}
                    placeholder="youtube.com/watch?v=..."
                    value={demoVideoUrl}
                    onChange={(e) => handleChange(setDemoVideoUrl, e.target.value)}
                    onBlur={() => setDemoVideoUrl(normalizeUrlFieldValue(demoVideoUrl))}
                    autoComplete="off"
                    autoFocus
                    data-1p-ignore
                    data-lpignore="true"
                    data-form-type="other"
                  />
                  <FieldDescription>Add YouTube, Loom, Vimeo, or another video link.</FieldDescription>
                  {videoPreview && (
                    <div className="mt-3">
                      <VideoEmbed video={videoPreview} />
                    </div>
                  )}
                </Field>
              )}

              {currentStep === 3 && (
                <Field>
                  <FieldLabel htmlFor="submission-live-url">Live App / Project URL</FieldLabel>
                  <Input
                    id="submission-live-url"
                    name="liveAppUrl"
                    {...urlInputProps}
                    placeholder="myproject.vercel.app"
                    value={liveAppUrl}
                    onChange={(e) => handleChange(setLiveAppUrl, e.target.value)}
                    onBlur={() => setLiveAppUrl(normalizeUrlFieldValue(liveAppUrl))}
                    autoComplete="off"
                    autoFocus
                    data-1p-ignore
                    data-lpignore="true"
                    data-form-type="other"
                  />
                  <FieldDescription>Optional if your project is not live yet.</FieldDescription>
                </Field>
              )}

              {currentStep === 4 && (
                <Field>
                  <FieldLabel htmlFor="submission-description">What is this?</FieldLabel>
                  <Textarea
                    id="submission-description"
                    name="description"
                    rows={4}
                    placeholder="Tell judges what your project does and why it matters."
                    value={description}
                    onChange={(e) => handleChange(setDescription, e.target.value)}
                    maxLength={280}
                    autoComplete="off"
                    autoFocus
                    data-1p-ignore
                    data-lpignore="true"
                    data-form-type="other"
                  />
                  <FieldDescription>{description.length}/280 characters</FieldDescription>
                </Field>
              )}

              {currentStep === 5 && (
                <Field>
                  <FieldLabel>Screenshots <span className="text-muted-foreground font-normal">(optional)</span></FieldLabel>
                  <FieldDescription className="mb-2">
                    Add up to 2 screenshots of your project in action. No external art, logos, or promotional graphics.
                  </FieldDescription>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    multiple
                    className="hidden"
                    onChange={handleScreenshotSelect}
                  />
                  <div
                    onDragOver={handleScreenshotDragOver}
                    onDragLeave={handleScreenshotDragLeave}
                    onDrop={handleScreenshotDrop}
                    className={cn(
                      "rounded-lg border border-dashed p-3 transition-colors",
                      isDraggingScreenshots && "border-primary bg-primary/5"
                    )}
                  >
                    {screenshots.length > 0 && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {screenshots.map((screenshot) => (
                          <div key={screenshot.id} className="space-y-2">
                            <div className="flex aspect-video items-center justify-center overflow-hidden rounded-md border bg-muted">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={screenshot.url}
                                alt={`Screenshot ${screenshot.slot + 1} preview`}
                                className="size-full object-contain"
                              />
                            </div>
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => openScreenshotPicker(screenshot.slot)}
                                disabled={isSubmitting}
                              >
                                <Upload className="size-4" />
                                Replace
                              </Button>
                              <Button
                                type="button"
                                variant="destructive"
                                size="sm"
                                onClick={() => handleRemoveScreenshot(screenshot.slot)}
                                disabled={isSubmitting}
                              >
                                <X className="size-4" />
                                Remove
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {screenshots.length < MAX_SUBMISSION_SCREENSHOTS && (
                      <button
                        type="button"
                        onClick={() => openScreenshotPicker()}
                        disabled={isSubmitting}
                        className={cn(
                          "flex min-h-36 w-full flex-col items-center justify-center gap-1.5 rounded-md bg-muted/50 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50",
                          screenshots.length > 0 && "mt-3"
                        )}
                      >
                        <ImageIcon className="size-6" />
                        <span className="text-xs font-medium">
                          {screenshots.length > 0 ? "Add another screenshot" : "Upload screenshots"}
                        </span>
                        <span className="text-xs text-muted-foreground">PNG, JPEG, or WebP (4MB total)</span>
                      </button>
                    )}

                  </div>
                </Field>
              )}

              {error && (
                <p className="text-destructive text-sm">{error}</p>
              )}
            </FieldGroup>

            <div className="flex gap-2 justify-end">
              {currentStep === 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handlePreviousStep}
                  disabled={isSubmitting}
                >
                  Back
                </Button>
              )}
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    {submission ? "Saving..." : "Submitting..."}
                  </>
                ) : currentStep < submissionSteps.length - 1 ? (
                  "Next"
                ) : (
                  submission ? "Save Changes" : "Submit Project"
                )}
              </Button>
            </div>
          </form>
        </SteppedDialogContent>
      </Dialog>
    </>
  )
}
