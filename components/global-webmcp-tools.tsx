"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useUser } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import { SubmissionButton } from "@/components/hackathon/submission-button"
import { useWebMcpTools } from "@/hooks/use-webmcp-tools"
import {
  getProjectCapabilities,
  getProjectDraftNextStep,
  parsePreparedProjectDraft,
  type PreparedProjectDraft,
} from "@/lib/webmcp/event-attendee-tools"
import { WebMcpRequestError } from "@/lib/webmcp/fetch"
import {
  createGlobalWebMcpTools,
  type GlobalAttendeeEventContext,
} from "@/lib/webmcp/global-tools"
import {
  readProjectDraft,
  writeProjectDraft,
} from "@/lib/webmcp/project-draft-storage"
import { dispatchPrepareProjectAction } from "@/lib/webmcp/client-events"

type ActiveProjectReview = {
  requestId: number
  slug: string
  context: GlobalAttendeeEventContext
  draft: PreparedProjectDraft
}

type PendingProjectReview = {
  requestId: number
  resolve: (value: { openedReview: boolean; nextStep: string }) => void
  reject: (reason: WebMcpRequestError) => void
}

export function GlobalWebMcpTools() {
  const router = useRouter()
  const { isLoaded, isSignedIn, user } = useUser()
  const userId = user?.id ?? null
  const nextRequestId = useRef(1)
  const pendingReview = useRef<PendingProjectReview | null>(null)
  const [activeReview, setActiveReview] = useState<ActiveProjectReview | null>(null)

  const getProjectDraft = useCallback((slug: string) => {
    if (typeof window === "undefined") return null
    return parsePreparedProjectDraft(
      readProjectDraft(window.localStorage, slug, userId),
    )
  }, [userId])

  const prepareProject = useCallback((
    event: { slug: string },
    context: GlobalAttendeeEventContext,
    draft: PreparedProjectDraft,
  ) => {
    if (typeof window === "undefined") {
      throw new WebMcpRequestError({
        code: "storage_unavailable",
        message: "Turn on browser storage, then try again.",
        retryable: false,
      })
    }
    if (pendingReview.current) {
      throw new WebMcpRequestError({
        code: "event_busy",
        message: "Finish the open project review before preparing another one.",
        retryable: true,
      })
    }

    const deadline = context.projectReview.submissionDeadline
    const submissionsOpen = Boolean(
      deadline && new Date(deadline).getTime() > Date.now(),
    )
    const capabilities = getProjectCapabilities({
      status: context.guide.status,
      role: context.viewer.role,
      isOrganizer: false,
      isAttendee: true,
      teamStatus: context.projectReview.teamStatus,
      submissionsOpen,
    })
    const nextStep = getProjectDraftNextStep({
      signedIn: true,
      registered: true,
      role: context.viewer.role,
      status: context.guide.status,
      teamStatus: context.projectReview.teamStatus,
      canOpenProjectReview: capabilities.canOpenProjectReview,
      submissionsOpen,
    })
    if (!capabilities.canOpenProjectReview) {
      const serialized = JSON.stringify({
        ...draft,
        currentStep: 0,
        screenshots: [],
      })
      try {
        writeProjectDraft(window.localStorage, event.slug, userId, serialized)
        if (readProjectDraft(window.localStorage, event.slug, userId) !== serialized) {
          throw new Error("storage verification failed")
        }
      } catch {
        throw new WebMcpRequestError({
          code: "storage_unavailable",
          message: "Turn on browser storage, then try again.",
          retryable: false,
        })
      }
      return Promise.resolve({ openedReview: false, nextStep })
    }

    const requestId = nextRequestId.current
    nextRequestId.current += 1
    return new Promise<{ openedReview: boolean; nextStep: string }>((resolve, reject) => {
      pendingReview.current = { requestId, resolve, reject }
      setActiveReview({ requestId, slug: event.slug, context, draft })
    })
  }, [userId])

  useEffect(() => {
    if (!activeReview) return
    const frame = requestAnimationFrame(() => {
      const pending = pendingReview.current
      if (!pending || pending.requestId !== activeReview.requestId) return
      const outcome = dispatchPrepareProjectAction(
        activeReview.slug,
        activeReview.draft,
        `global:${activeReview.requestId}`,
      )
      pendingReview.current = null
      if (!outcome.ok) {
        pending.reject(new WebMcpRequestError(outcome.error))
        return
      }
      pending.resolve({
        openedReview: true,
        nextStep: "Your project is ready. Your agent can submit or save it directly.",
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [activeReview])

  useEffect(() => () => {
    const pending = pendingReview.current
    pendingReview.current = null
    pending?.reject(new WebMcpRequestError({
      code: "cancelled",
      message: "The project review was closed.",
      retryable: true,
    }))
  }, [])

  const tools = useMemo(
    () => isLoaded && isSignedIn && userId
      ? createGlobalWebMcpTools({
          fetcher: fetch,
          onNavigate: (href) => router.push(href),
          getProjectDraft,
          prepareProject,
        })
      : [],
    [getProjectDraft, isLoaded, isSignedIn, prepareProject, router, userId],
  )
  useWebMcpTools(tools)

  if (!activeReview) return null
  return (
    <SubmissionButton
      key={`${activeReview.slug}:${activeReview.requestId}`}
      hackathonSlug={activeReview.slug}
      status={activeReview.context.guide.status}
      isRegistered
      submission={activeReview.context.projectReview.submission}
      teamSizeWarning={activeReview.context.projectReview.teamSizeWarning}
      pendingTeamApproval={activeReview.context.projectReview.teamStatus === "pending_approval"}
      teamStatus={activeReview.context.projectReview.teamStatus}
      submissionDeadline={activeReview.context.projectReview.submissionDeadline}
      hideTrigger
      prepareTarget={`global:${activeReview.requestId}`}
    />
  )
}
