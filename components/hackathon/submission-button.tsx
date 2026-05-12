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
import type { HackathonStatus, Submission } from "@/lib/db/hackathon-types"
import {
  normalizeOptionalUrl,
  normalizeUrl,
  normalizeUrlFieldValue,
  urlInputProps,
} from "@/lib/utils/url"
import { cn } from "@/lib/utils"
import type { Json } from "@/lib/db/types"
import {
  buildSubmissionScreenshotMetadata,
  getSubmissionScreenshots,
  MAX_SUBMISSION_SCREENSHOTS,
  type SubmissionScreenshot,
  type SubmissionScreenshotSlot,
} from "@/lib/utils/submission-screenshots"
import { getVideoEmbedInfo } from "@/lib/utils/video-embed"
import { VideoEmbed } from "@/components/hackathon/video-embed"

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

type ScreenshotSyncResult =
  | { ok: true; screenshots: SubmissionScreenshot[] }
  | { ok: false; didChange: boolean; error: string }

const screenshotSlots = [0, 1] as const
const allowedScreenshotTypes = ["image/png", "image/jpeg", "image/webp"]

function isScreenshotSlot(value: unknown): value is SubmissionScreenshotSlot {
  return value === 0 || value === 1
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

interface SubmissionButtonProps {
  hackathonSlug: string
  status: HackathonStatus
  isRegistered: boolean
  submission: Submission | null
  teamSizeWarning?: string | null
}

export function SubmissionButton({
  hackathonSlug,
  status,
  isRegistered,
  submission: initialSubmission,
  teamSizeWarning,
}: SubmissionButtonProps) {
  const { isSignedIn, isLoaded } = useUser()
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const screenshotPickerModeRef = useRef<{ replaceSlot: SubmissionScreenshotSlot | null }>({
    replaceSlot: null,
  })
  const previewUrlsRef = useRef<Set<string>>(new Set())
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
  const [isUploadingScreenshot, setIsUploadingScreenshot] = useState(false)
  const [isDraggingScreenshots, setIsDraggingScreenshots] = useState(false)

  const canSubmit = status === "active"
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

    const rawDraft = window.localStorage.getItem(draftStorageKey)
    if (!rawDraft) {
      return null
    }

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
        title: parsed.title ?? "",
        githubUrl: parsed.githubUrl ?? "",
        liveAppUrl: parsed.liveAppUrl ?? "",
        demoVideoUrl: parsed.demoVideoUrl ?? "",
        description: parsed.description ?? "",
        currentStep: Math.min(
          Math.max(parsed.currentStep ?? 0, 0),
          submissionSteps.length - 1
        ),
        screenshots,
      }
    } catch {
      return null
    }
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
    setScreenshots(
      draft.screenshots.map((screenshot) => ({
        ...screenshot,
        id: `draft-${screenshot.slot}-${screenshot.url}`,
        file: null,
      }))
    )
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

    if (file.size > 10 * 1024 * 1024) {
      return "Screenshot must be smaller than 10MB"
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
      ? screenshotSlots.filter((slot) => !screenshots.some((screenshot) => screenshot.slot === slot))
      : [replaceSlot]

    if (availableSlots.length === 0) {
      setError("You can upload up to 2 screenshots.")
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

    setError(fileList.length > availableSlots.length ? "You can upload up to 2 screenshots." : null)
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
    if (!isSubmitting && !isUploadingScreenshot) {
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

    if (isSubmitting || isUploadingScreenshot) {
      return
    }

    handleScreenshotFiles(Array.from(e.dataTransfer.files), null)
  }

  async function syncScreenshots(
    previousScreenshots: SubmissionScreenshot[],
    nextScreenshots: ScreenshotDraftItem[]
  ): Promise<ScreenshotSyncResult> {
    const nextBySlot = new Map<SubmissionScreenshotSlot, string>()
    for (const screenshot of nextScreenshots) {
      if (!screenshot.file) {
        nextBySlot.set(screenshot.slot, screenshot.url)
      }
    }

    const currentSlots = new Set(nextScreenshots.map((screenshot) => screenshot.slot))
    const removedSlots = previousScreenshots
      .filter((screenshot) => !currentSlots.has(screenshot.slot))
      .map((screenshot) => screenshot.slot)
    const screenshotsToUpload = nextScreenshots.filter(
      (screenshot): screenshot is ScreenshotDraftItem & { file: File } => screenshot.file !== null
    )

    if (removedSlots.length === 0 && screenshotsToUpload.length === 0) {
      return {
        ok: true,
        screenshots: nextScreenshots.map(({ slot, url }) => ({ slot, url })),
      }
    }

    setIsUploadingScreenshot(true)
    const syncedPreviewUrls: string[] = []
    let didChange = false
    try {
      if (nextScreenshots.length === 0 && previousScreenshots.length > 0) {
        const response = await fetch(
          `/api/public/hackathons/${hackathonSlug}/submissions/screenshot`,
          { method: "DELETE" }
        )

        if (!response.ok) {
          const data = await response.json().catch(() => ({}))
          return {
            ok: false,
            didChange: data.code === "update_failed",
            error: data.error || "Failed to remove screenshot",
          }
        }

        didChange = true
        nextBySlot.clear()
      } else {
        // Uploads stay serial because each API call merges with the current saved screenshot metadata.
        for (const screenshot of screenshotsToUpload) {
          const formData = new FormData()
          formData.append("file", screenshot.file)
          formData.append("slot", String(screenshot.slot))

          try {
            const response = await fetch(
              `/api/public/hackathons/${hackathonSlug}/submissions/screenshot`,
              { method: "POST", body: formData }
            )
            const data = await response.json().catch(() => ({}))

            if (!response.ok) {
              return {
                ok: false,
                didChange: didChange || data.code === "update_failed",
                error: data.error || "Failed to upload screenshot",
              }
            }

            if (typeof data.screenshotUrl !== "string") {
              return {
                ok: false,
                didChange,
                error: "Failed to upload screenshot",
              }
            }

            nextBySlot.set(screenshot.slot, data.screenshotUrl)
            syncedPreviewUrls.push(screenshot.url)
            didChange = true
          } catch {
            return {
              ok: false,
              didChange,
              error: "Failed to upload screenshot",
            }
          }
        }

        for (const slot of removedSlots) {
          const response = await fetch(
            `/api/public/hackathons/${hackathonSlug}/submissions/screenshot?slot=${slot}`,
            { method: "DELETE" }
          )

          if (!response.ok) {
            const data = await response.json().catch(() => ({}))
            return {
              ok: false,
              didChange: didChange || data.code === "update_failed",
              error: data.error || "Failed to remove screenshot",
            }
          }

          nextBySlot.delete(slot)
          didChange = true
        }
      }

      const syncedScreenshots = Array.from(nextBySlot.entries())
        .sort(([a], [b]) => a - b)
        .map(([slot, url]) => ({ slot, url }))

      for (const url of syncedPreviewUrls) {
        revokePreviewUrl(url)
      }

      setScreenshots(
        syncedScreenshots.map((screenshot) => ({
          ...screenshot,
          id: `saved-${screenshot.slot}-${screenshot.url}`,
          file: null,
        }))
      )
      return { ok: true, screenshots: syncedScreenshots }
    } catch {
      return {
        ok: false,
        didChange,
        error: "Failed to upload screenshot",
      }
    } finally {
      setIsUploadingScreenshot(false)
    }
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
      file_too_large: "Screenshot must be smaller than 10MB.",
      upload_failed: "Failed to upload screenshot. Please try again.",
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
    setError(null)

    const validationError = validateForm()
    if (validationError) {
      setCurrentStep(validationError.step)
      setError(validationError.message)
      return
    }

    setIsSubmitting(true)

    try {
      const normalizedGithubUrl = normalizeUrl(githubUrl)
      const normalizedLiveAppUrl = normalizeOptionalUrl(liveAppUrl)
      const normalizedDemoVideoUrl = normalizeOptionalUrl(demoVideoUrl)
      const method = submission ? "PATCH" : "POST"
      const response = await fetch(`/api/public/hackathons/${hackathonSlug}/submissions`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          githubUrl: normalizedGithubUrl,
          liveAppUrl: normalizedLiveAppUrl,
          demoVideoUrl: normalizedDemoVideoUrl,
        }),
      })

      let data
      try {
        data = await response.json()
      } catch {
        setError("Unable to process response. Please try again.")
        return
      }

      if (!response.ok) {
        setError(getErrorMessage(data.code, data.error || "Failed to submit"))
        return
      }

      const previousScreenshots = submission ? getSubmissionScreenshots(submission) : []
      const screenshotSync = await syncScreenshots(previousScreenshots, screenshots)
      if (!screenshotSync.ok) {
        const prefix = screenshotSync.didChange
          ? "Your project was saved, but some screenshot changes did not finish."
          : "Your project was saved, but screenshots were not updated."
        setError(`${prefix} ${screenshotSync.error}`)
        return
      }
      const finalScreenshots = screenshotSync.screenshots
      const finalMetadata = buildSubmissionScreenshotMetadata(
        submission?.metadata,
        finalScreenshots
      ) as Json

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
      setIsDialogOpen(false)
      router.refresh()
    } catch (err) {
      if (err instanceof TypeError && err.message.includes("fetch")) {
        setError("Network error. Please check your connection and try again.")
      } else {
        setError("An unexpected error occurred. Please try again.")
      }
    } finally {
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
                        {screenshots.map((screenshot, index) => (
                          <div key={screenshot.id} className="space-y-2">
                            <div className="flex aspect-video items-center justify-center overflow-hidden rounded-md border bg-muted">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={screenshot.url}
                                alt={`Screenshot ${index + 1} preview`}
                                className="size-full object-contain"
                              />
                            </div>
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => openScreenshotPicker(screenshot.slot)}
                                disabled={isSubmitting || isUploadingScreenshot}
                              >
                                <Upload className="size-4" />
                                Replace
                              </Button>
                              <Button
                                type="button"
                                variant="destructive"
                                size="sm"
                                onClick={() => handleRemoveScreenshot(screenshot.slot)}
                                disabled={isSubmitting || isUploadingScreenshot}
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
                        disabled={isSubmitting || isUploadingScreenshot}
                        className={cn(
                          "flex min-h-36 w-full flex-col items-center justify-center gap-1.5 rounded-md bg-muted/50 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50",
                          screenshots.length > 0 && "mt-3"
                        )}
                      >
                        <ImageIcon className="size-6" />
                        <span className="text-xs font-medium">
                          {screenshots.length > 0 ? "Add another screenshot" : "Upload screenshots"}
                        </span>
                        <span className="text-xs text-muted-foreground">PNG, JPEG, or WebP (max 10MB)</span>
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
                  disabled={isSubmitting || isUploadingScreenshot}
                >
                  Cancel
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handlePreviousStep}
                  disabled={isSubmitting || isUploadingScreenshot}
                >
                  Back
                </Button>
              )}
              <Button type="submit" disabled={isSubmitting || isUploadingScreenshot}>
                {isSubmitting || isUploadingScreenshot ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    {isUploadingScreenshot ? "Uploading..." : submission ? "Saving..." : "Submitting..."}
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
