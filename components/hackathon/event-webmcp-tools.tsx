"use client"

import { useCallback, useMemo, useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { useEventLifecycleClock } from "@/hooks/use-event-lifecycle-clock"
import { useWebMcpTools } from "@/hooks/use-webmcp-tools"
import { isHttpsUrlWithoutCredentials, normalizeUrl } from "@/lib/utils/url"
import {
  dispatchPrepareProjectAction,
  dispatchPrepareTeamInviteAction,
} from "@/lib/webmcp/client-events"
import { canInviteTeamMembers as getCanInviteTeamMembers } from "@/lib/utils/team-invite"
import { canRegisterNow } from "@/lib/utils/registration"
import {
  createEventAttendeeTools,
  getProjectCapabilities,
  getProjectDraftNextStep,
  type EventGuideContext,
  type EventViewerContext,
  type PreparedProjectDraft,
} from "@/lib/webmcp/event-attendee-tools"
import { WebMcpRequestError } from "@/lib/webmcp/fetch"
import {
  readProjectDraft,
} from "@/lib/webmcp/project-draft-storage"

type EventWebMcpToolsProps = {
  guide: EventGuideContext
  viewer: EventViewerContext
  canRegisterViewer: boolean
  registrationOpensAt: string | null
  isFormingCaptain: boolean
  registrationClosesAt: string | null
  allowLateRegistration: boolean
  atCapacity: boolean
  isOrganizer: boolean
  viewerUserId: string | null
}

function parseProjectDraft(raw: string | null): PreparedProjectDraft | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<PreparedProjectDraft>
    if (
      typeof parsed.title !== "string" ||
      typeof parsed.githubUrl !== "string" ||
      typeof parsed.liveAppUrl !== "string" ||
      typeof parsed.demoVideoUrl !== "string" ||
      typeof parsed.description !== "string"
    ) {
      return null
    }
    return {
      title: parsed.title.slice(0, 100),
      githubUrl: parsed.githubUrl.slice(0, 2_048),
      liveAppUrl: parsed.liveAppUrl.slice(0, 2_048),
      demoVideoUrl: parsed.demoVideoUrl.slice(0, 2_048),
      description: parsed.description.slice(0, 280),
    }
  } catch {
    return null
  }
}

function normalizeProjectDraft(draft: PreparedProjectDraft): PreparedProjectDraft {
  try {
    const githubUrl = normalizeUrl(draft.githubUrl)
    const github = new URL(githubUrl)
    if (
      !isHttpsUrlWithoutCredentials(githubUrl) ||
      !["github.com", "www.github.com"].includes(github.hostname)
    ) {
      throw new WebMcpRequestError({
        code: "invalid_github_url",
        message: "Use a GitHub repository URL.",
        retryable: false,
      })
    }

    const normalizeOptional = (value: string) => {
      if (!value.trim()) return ""
      const normalized = normalizeUrl(value)
      if (!isHttpsUrlWithoutCredentials(normalized)) {
        throw new WebMcpRequestError({
          code: "invalid_url",
          message: "Project and video links must use HTTPS.",
          retryable: false,
        })
      }
      return normalized
    }

    return {
      title: draft.title.trim(),
      githubUrl,
      liveAppUrl: normalizeOptional(draft.liveAppUrl),
      demoVideoUrl: normalizeOptional(draft.demoVideoUrl),
      description: draft.description.trim(),
    }
  } catch (error) {
    if (error instanceof WebMcpRequestError) throw error
    throw new WebMcpRequestError({
      code: "invalid_url",
      message: "Check the project links and try again.",
      retryable: false,
    })
  }
}

export function EventWebMcpTools({
  guide,
  viewer,
  canRegisterViewer,
  registrationOpensAt,
  isFormingCaptain,
  registrationClosesAt,
  allowLateRegistration,
  atCapacity,
  isOrganizer,
  viewerUserId,
}: EventWebMcpToolsProps) {
  const [preparedProject, setPreparedProject] = useState<PreparedProjectDraft | null>(null)
  const { effectiveStatus, nowIso } = useEventLifecycleClock({
    status: guide.status,
    startsAt: guide.startsAt,
    endsAt: guide.endsAt,
  })
  const effectiveGuide = useMemo(
    () => ({ ...guide, status: effectiveStatus }),
    [effectiveStatus, guide],
  )
  const isAttendee = viewer.registered && viewer.role === "participant"
  const { canPrepareProject, canOpenProjectReview } = getProjectCapabilities({
    status: effectiveStatus,
    role: viewer.role,
    isOrganizer,
    isAttendee,
    teamStatus: viewer.team?.status ?? null,
  })

  const canInviteNow = getCanInviteTeamMembers({
    isFormingCaptain,
    hackathonStatus: effectiveStatus,
    startsAt: guide.startsAt,
    endsAt: guide.endsAt,
    registrationClosesAt,
    allowLateRegistration,
    nowIso,
  })
  const canOpenRegistrationNow = nowIso !== null && canRegisterViewer && canRegisterNow({
    status: effectiveStatus,
    startsAt: guide.startsAt,
    endsAt: guide.endsAt,
    opensAt: registrationOpensAt,
    closesAt: registrationClosesAt,
    allowLate: allowLateRegistration,
    atCapacity,
    now: new Date(nowIso).getTime(),
  })

  const openRegistration = useCallback(() => {
    const target = document.querySelector<HTMLElement>("[data-webmcp-registration]")
    if (!target) return false
    target.scrollIntoView({ behavior: "smooth", block: "center" })
    target.querySelector<HTMLElement>("button,a,input")?.focus()
    return true
  }, [])

  const prepareTeamInvite = useCallback((email: string) => {
    const outcome = dispatchPrepareTeamInviteAction(email)
    if (!outcome.ok) throw new WebMcpRequestError(outcome.error)
    return true
  }, [])

  const getProjectDraft = useCallback(() => {
    return parseProjectDraft(readProjectDraft(localStorage, guide.slug, viewerUserId))
  }, [guide.slug, viewerUserId])

  const prepareProject = useCallback((input: PreparedProjectDraft) => {
    const draft = normalizeProjectDraft(input)
    const outcome = dispatchPrepareProjectAction(draft)
    if (!outcome.ok) {
      throw new WebMcpRequestError(outcome.error)
    }
    setPreparedProject(draft)

    const nextStep = getProjectDraftNextStep({
      signedIn: viewer.signedIn,
      registered: viewer.registered,
      role: viewer.role,
      status: effectiveStatus,
      teamStatus: viewer.team?.status ?? null,
      canOpenProjectReview,
    })

    return {
      openedReview: canOpenProjectReview,
      nextStep,
    }
  }, [canOpenProjectReview, effectiveStatus, viewer])

  const preparedProjectNextStep = getProjectDraftNextStep({
    signedIn: viewer.signedIn,
    registered: viewer.registered,
    role: viewer.role,
    status: effectiveStatus,
    teamStatus: viewer.team?.status ?? null,
    canOpenProjectReview,
  })

  const tools = useMemo(() => createEventAttendeeTools({
    guide: effectiveGuide,
    viewer,
    canOpenRegistration: canOpenRegistrationNow,
    canInviteTeamMembers: canInviteNow,
    canPrepareProject,
    openRegistration,
    prepareTeamInvite,
    getProjectDraft,
    prepareProject,
  }), [
    canInviteNow,
    canOpenRegistrationNow,
    canPrepareProject,
    effectiveGuide,
    getProjectDraft,
    openRegistration,
    prepareProject,
    prepareTeamInvite,
    viewer,
  ])

  useWebMcpTools(tools)

  if (!preparedProject) return null
  return (
    <div className="mx-auto max-w-4xl px-4 pt-4" data-webmcp-prepared-project>
      <Alert>
        <AlertTitle>Project draft ready</AlertTitle>
        <AlertDescription>
          {preparedProjectNextStep}
        </AlertDescription>
      </Alert>
    </div>
  )
}
