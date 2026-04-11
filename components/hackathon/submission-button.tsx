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
import { Loader2, Send, Pencil, Lock, Upload, X, ImageIcon, AlertTriangle } from "lucide-react"
import type { HackathonStatus, Submission } from "@/lib/db/hackathon-types"
import {
  normalizeOptionalUrl,
  normalizeUrl,
  normalizeUrlFieldValue,
  urlInputProps,
} from "@/lib/utils/url"

const submissionSteps = [
  { key: "title", label: "Title" },
  { key: "githubUrl", label: "GitHub" },
  { key: "liveAppUrl", label: "Project URL" },
  { key: "description", label: "What is this?" },
  { key: "screenshots", label: "Screenshots" },
] as const

type SubmissionStep = (typeof submissionSteps)[number]["key"]

type SubmissionDraft = {
  title: string
  githubUrl: string
  liveAppUrl: string
  description: string
  currentStep: number
  screenshotPreview: string | null
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
  const [submission, setSubmission] = useState(initialSubmission)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentStep, setCurrentStep] = useState(0)

  const [title, setTitle] = useState(submission?.title || "")
  const [githubUrl, setGithubUrl] = useState(submission?.github_url || "")
  const [liveAppUrl, setLiveAppUrl] = useState(submission?.live_app_url || "")
  const [description, setDescription] = useState(submission?.description || "")
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null)
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(
    submission?.screenshot_url || null
  )
  const [isUploadingScreenshot, setIsUploadingScreenshot] = useState(false)

  const canSubmit = status === "active"
  const draftStorageKey = `oatmeal:submission-draft:${hackathonSlug}`

  useEffect(() => {
    return () => {
      if (screenshotPreview?.startsWith("blob:")) {
        URL.revokeObjectURL(screenshotPreview)
      }
    }
  }, [screenshotPreview])

  useEffect(() => {
    if (!isDialogOpen || typeof window === "undefined") {
      return
    }

    const draft: SubmissionDraft = {
      title,
      githubUrl,
      liveAppUrl,
      description,
      currentStep,
      screenshotPreview: screenshotPreview?.startsWith("blob:") ? null : screenshotPreview,
    }

    window.localStorage.setItem(draftStorageKey, JSON.stringify(draft))
  }, [
    currentStep,
    description,
    draftStorageKey,
    githubUrl,
    isDialogOpen,
    liveAppUrl,
    screenshotPreview,
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

  function resetForm() {
    setTitle(submission?.title || "")
    setGithubUrl(submission?.github_url || "")
    setLiveAppUrl(submission?.live_app_url || "")
    setDescription(submission?.description || "")
    setScreenshotFile(null)
    if (screenshotPreview?.startsWith("blob:")) {
      URL.revokeObjectURL(screenshotPreview)
    }
    setScreenshotPreview(submission?.screenshot_url || null)
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
      return {
        title: parsed.title ?? "",
        githubUrl: parsed.githubUrl ?? "",
        liveAppUrl: parsed.liveAppUrl ?? "",
        description: parsed.description ?? "",
        currentStep: Math.min(
          Math.max(parsed.currentStep ?? 0, 0),
          submissionSteps.length - 1
        ),
        screenshotPreview: parsed.screenshotPreview ?? null,
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
    setDescription(draft.description)
    setCurrentStep(draft.currentStep)
    setScreenshotPreview(draft.screenshotPreview)
  }

  function clearDraft() {
    if (typeof window === "undefined") {
      return
    }

    window.localStorage.removeItem(draftStorageKey)
  }

  function handleScreenshotSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const allowedTypes = ["image/png", "image/jpeg", "image/webp"]
    if (!allowedTypes.includes(file.type)) {
      setError("Please select a PNG, JPEG, or WebP image")
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      setError("Screenshot must be smaller than 10MB")
      return
    }

    setError(null)
    if (screenshotPreview?.startsWith("blob:")) {
      URL.revokeObjectURL(screenshotPreview)
    }
    setScreenshotFile(file)
    setScreenshotPreview(URL.createObjectURL(file))
  }

  function handleRemoveScreenshot() {
    if (screenshotPreview?.startsWith("blob:")) {
      URL.revokeObjectURL(screenshotPreview)
    }
    setScreenshotFile(null)
    setScreenshotPreview(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  async function uploadScreenshot(): Promise<string | null> {
    if (!screenshotFile) return screenshotPreview

    setIsUploadingScreenshot(true)
    try {
      const formData = new FormData()
      formData.append("file", screenshotFile)

      const response = await fetch(
        `/api/public/hackathons/${hackathonSlug}/submissions/screenshot`,
        { method: "POST", body: formData }
      )

      if (!response.ok) {
        const data = await response.json()
        setError(data.error || "Failed to upload screenshot")
        return null
      }

      const data = await response.json()
      setScreenshotPreview(data.screenshotUrl)
      setScreenshotFile(null)
      return data.screenshotUrl
    } catch {
      setError("Failed to upload screenshot")
      return null
    } finally {
      setIsUploadingScreenshot(false)
    }
  }

  async function deleteScreenshot(): Promise<boolean> {
    const hadOriginalScreenshot = !!submission?.screenshot_url
    const userRemovedScreenshot = screenshotPreview === null
    if (!hadOriginalScreenshot || !userRemovedScreenshot) return true

    try {
      const response = await fetch(
        `/api/public/hackathons/${hackathonSlug}/submissions/screenshot`,
        { method: "DELETE" }
      )

      if (!response.ok) {
        const data = await response.json()
        setError(data.error || "Failed to remove screenshot")
        return false
      }

      return true
    } catch {
      setError("Failed to remove screenshot")
      return false
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
      const method = submission ? "PATCH" : "POST"
      const response = await fetch(`/api/public/hackathons/${hackathonSlug}/submissions`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          githubUrl: normalizedGithubUrl,
          liveAppUrl: normalizedLiveAppUrl,
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

      let finalScreenshotUrl = submission?.screenshot_url || null

      if (screenshotFile) {
        const uploadedScreenshotUrl = await uploadScreenshot()
        if (!uploadedScreenshotUrl) {
          setError(
            (prev) =>
              `Your submission was saved, but the screenshot failed to upload. ${prev || "Please try again."}`
          )
          return
        }
        finalScreenshotUrl = uploadedScreenshotUrl
      } else if (submission?.screenshot_url && !screenshotPreview) {
        const deleteSuccess = await deleteScreenshot()
        if (!deleteSuccess) {
          setError(
            (prev) =>
              `Your submission was saved, but the screenshot failed to remove. ${prev || "Please try again."}`
          )
          return
        }
        finalScreenshotUrl = null
      }

      setSubmission({
        ...submission,
        id: data.submissionId,
        title: title.trim(),
        description: description.trim(),
        github_url: normalizedGithubUrl,
        live_app_url: normalizedLiveAppUrl,
        screenshot_url: finalScreenshotUrl,
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
                  : step.key === "liveAppUrl"
                    ? liveAppUrl.trim().length > 0
                    : step.key === "description"
                      ? description.trim().length > 0
                      : screenshotPreview !== null,
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

              {currentStep === 3 && (
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

              {currentStep === 4 && (
                <Field>
                  <FieldLabel>Screenshots</FieldLabel>
                  <FieldDescription className="mb-2">
                    Add one screenshot of your project in action. No external art, logos, or promotional graphics.
                  </FieldDescription>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={handleScreenshotSelect}
                  />
                  {screenshotPreview ? (
                    <div className="space-y-3">
                      <div className="overflow-hidden rounded-lg border bg-muted">
                        <div className="h-40 w-full bg-muted">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={screenshotPreview}
                            alt="Screenshot preview"
                            className="h-full w-full object-cover"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isSubmitting || isUploadingScreenshot}
                        >
                          <Upload className="size-4" />
                          Replace
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={handleRemoveScreenshot}
                          disabled={isSubmitting || isUploadingScreenshot}
                        >
                          <X className="size-4" />
                          Remove
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isSubmitting}
                      className="flex h-40 w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed bg-muted/50 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <ImageIcon className="size-6" />
                      <span className="text-xs font-medium">Upload screenshot</span>
                      <span className="text-xs text-muted-foreground">PNG, JPEG, or WebP (max 10MB)</span>
                    </button>
                  )}
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
