import { z } from "zod"
import { defineWebMcpTool } from "@/lib/webmcp/tool"
import type { WebMcpTool } from "@/lib/webmcp/types"
import type { HackathonStatus, TeamStatus } from "@/lib/db/hackathon-types"
import { stageKeyForStatus } from "@/lib/utils/lifecycle-stages"
import { isHttpsUrlWithoutCredentials, normalizeUrl } from "@/lib/utils/url"
import { WebMcpRequestError } from "@/lib/webmcp/fetch"

export function getProjectDraftNextStep(input: {
  signedIn: boolean
  registered: boolean
  role: string | null
  status: HackathonStatus
  teamStatus: TeamStatus | null
  canOpenProjectReview: boolean
  submissionsOpen?: boolean
}): string {
  if (input.canOpenProjectReview) {
    return "Review every project field, then click Submit Project or Save Changes."
  }
  if (!input.signedIn) {
    return "Sign in and register. Your draft is saved in this browser."
  }
  if (!input.registered || input.role !== "participant") {
    return "Register to attend. Your draft is saved in this browser."
  }
  if (input.teamStatus === "pending_approval") {
    return "Your draft is saved. You can submit after your team is approved and the event starts."
  }
  if (input.teamStatus === "disbanded") {
    return "Your draft is saved. Ask the organizer for help with your team before submitting."
  }
  if (input.status !== "active") {
    return "Your draft is saved. You can submit when the event starts."
  }
  if (input.submissionsOpen === false) {
    return "Your draft is saved. The project deadline has passed."
  }
  return "Your draft is saved. Finish your team setup before submitting."
}

export function getProjectCapabilities({
  status,
  role,
  isOrganizer,
  isAttendee,
  teamStatus,
  submissionsOpen = true,
}: {
  status: HackathonStatus
  role: string | null
  isOrganizer: boolean
  isAttendee: boolean
  teamStatus: TeamStatus | null
  submissionsOpen?: boolean
}) {
  const isPendingTeam = teamStatus === "pending_approval"
  const isDisbandedTeam = teamStatus === "disbanded"
  return {
    canOpenProjectReview:
      isAttendee && status === "active" && submissionsOpen && !isPendingTeam && !isDisbandedTeam,
    canPrepareProject:
      !isOrganizer &&
      (!role || role === "participant") &&
      !isDisbandedTeam &&
      ["published", "registration_open", "active"].includes(status),
  }
}

export type PreparedProjectDraft = {
  title: string
  githubUrl: string
  liveAppUrl: string
  demoVideoUrl: string
  description: string
}

export function parsePreparedProjectDraft(
  raw: string | null,
): PreparedProjectDraft | null {
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

export function normalizePreparedProjectDraft(
  draft: PreparedProjectDraft,
): PreparedProjectDraft {
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

export type EventGuideContext = {
  name: string
  slug: string
  description: string | null
  rules?: string | null
  status: HackathonStatus
  startsAt: string | null
  endsAt: string | null
  locationType: string | null
  locationName: string | null
  locationUrl: string | null
  organizerName: string
  schedule: { title: string; startsAt: string; endsAt: string | null; location: string | null }[]
  announcements: { title: string; body: string; priority: string }[]
  challenges: { title: string; description: string | null; resourceCount: number }[]
  resultsPublished: boolean
}

export type EventViewerContext = {
  signedIn: boolean
  registered: boolean
  role: string | null
  participantCount: number
  nextStep: string
  sponsor: {
    organizationName: string
    tier: string
  } | null
  team: {
    name: string
    status: TeamStatus
    isCaptain: boolean
    memberNames: string[]
    memberCount: number
    pendingInviteCount: number
    maxTeamSize: number
  } | null
  project: {
    title: string
    status: string
    hasGithubUrl: boolean
    hasLiveAppUrl: boolean
    hasDemoVideoUrl: boolean
  } | null
}

type EventAttendeeToolActions = {
  guide: EventGuideContext
  viewer: EventViewerContext
  canOpenRegistration: boolean
  canInviteTeamMembers: boolean
  canPrepareProject: boolean
  openRegistration: () => boolean
  prepareTeamInvite: (email: string) => boolean
  getProjectDraft: () => PreparedProjectDraft | null
  prepareProject: (draft: PreparedProjectDraft) => { openedReview: boolean; nextStep: string }
}

function snippet(value: string | null, maxLength: number): string | null {
  if (!value || value.length <= maxLength) return value
  return `${value.slice(0, maxLength - 1)}…`
}

export function summarizeEventViewer(viewer: EventViewerContext) {
  return {
    signedIn: viewer.signedIn,
    registered: viewer.registered,
    role: viewer.role,
    participantCount: viewer.participantCount,
    nextStep: snippet(viewer.nextStep, 160),
    sponsor: viewer.sponsor ? {
      organizationName: snippet(viewer.sponsor.organizationName, 100),
      tier: snippet(viewer.sponsor.tier, 60),
    } : null,
    team: viewer.team ? {
      name: snippet(viewer.team.name, 100),
      status: viewer.team.status,
      isCaptain: viewer.team.isCaptain,
      memberNames: viewer.team.memberNames.slice(0, 8).map((name) => snippet(name, 80)),
      memberCount: viewer.team.memberCount,
      pendingInviteCount: viewer.team.pendingInviteCount,
      maxTeamSize: viewer.team.maxTeamSize,
    } : null,
    project: viewer.project ? {
      title: snippet(viewer.project.title, 100),
      status: viewer.project.status,
      hasGithubUrl: viewer.project.hasGithubUrl,
      hasLiveAppUrl: viewer.project.hasLiveAppUrl,
      hasDemoVideoUrl: viewer.project.hasDemoVideoUrl,
    } : null,
  }
}

export function summarizeProjectDraft(draft: PreparedProjectDraft | null) {
  if (!draft) return null
  return {
    title: snippet(draft.title, 100),
    githubUrl: snippet(draft.githubUrl, 180),
    liveAppUrl: snippet(draft.liveAppUrl, 180),
    demoVideoUrl: snippet(draft.demoVideoUrl, 180),
    description: snippet(draft.description, 280),
  }
}

const eventGuideSectionSchema = z.enum([
  "overview",
  "rules",
  "schedule",
  "announcements",
  "challenges",
])

export function summarizeEventGuide(
  guide: EventGuideContext,
  section: z.infer<typeof eventGuideSectionSchema>,
  offset: number,
) {
  if (section === "overview") {
    return {
      section,
      name: snippet(guide.name, 120),
      slug: snippet(guide.slug, 120),
      description: snippet(guide.description, 220),
      status: stageKeyForStatus(guide.status),
      registrationStatus: ["published", "registration_open", "active"].includes(
        guide.status,
      )
        ? "open"
        : "closed",
      startsAt: guide.startsAt,
      endsAt: guide.endsAt,
      locationType: guide.locationType,
      locationName: snippet(guide.locationName, 100),
      locationUrl: snippet(guide.locationUrl, 160),
      organizerName: snippet(guide.organizerName, 100),
      resultsPublished: guide.resultsPublished,
      totals: {
        schedule: guide.schedule.length,
        announcements: guide.announcements.length,
        challenges: guide.challenges.length,
      },
    }
  }

  if (section === "rules") {
    return {
      section,
      rules: snippet(guide.rules ?? null, 900),
      available: Boolean(guide.rules?.trim()),
    }
  }

  if (section === "schedule") {
    const items = guide.schedule.slice(offset, offset + 3).map((item) => ({
      title: snippet(item.title, 80),
      startsAt: item.startsAt,
      endsAt: item.endsAt,
      location: snippet(item.location, 80),
    }))
    return {
      section,
      offset,
      total: guide.schedule.length,
      nextOffset: offset + items.length < guide.schedule.length ? offset + items.length : null,
      items,
    }
  }

  if (section === "announcements") {
    const items = guide.announcements.slice(offset, offset + 3).map((item) => ({
      title: snippet(item.title, 80),
      body: snippet(item.body, 140),
      priority: item.priority,
    }))
    return {
      section,
      offset,
      total: guide.announcements.length,
      nextOffset:
        offset + items.length < guide.announcements.length ? offset + items.length : null,
      items,
    }
  }

  const items = guide.challenges.slice(offset, offset + 4).map((challenge) => ({
    title: snippet(challenge.title, 80),
    description: snippet(challenge.description, 120),
    resourceCount: challenge.resourceCount,
  }))
  return {
    section,
    offset,
    total: guide.challenges.length,
    nextOffset: offset + items.length < guide.challenges.length ? offset + items.length : null,
    items,
  }
}

export function createEventAttendeeTools(
  actions: EventAttendeeToolActions,
): WebMcpTool[] {
  const tools: WebMcpTool[] = [
    defineWebMcpTool({
      name: "get_event_guide",
      title: "Read event guide",
      description:
        "Read one bounded section of the public event guide. Start with overview, then page through schedule, announcements, or released challenges.",
      schema: z.object({
        section: eventGuideSectionSchema.default("overview"),
        offset: z.number().int().nonnegative().max(100).default(0),
      }).strict(),
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: ({ section, offset }) => summarizeEventGuide(actions.guide, section, offset),
    }),
    defineWebMcpTool({
      name: "get_my_event_status",
      title: "Read my event status",
      description:
        "Read whether this viewer is signed in, registered, on a team, and ready to prepare a project.",
      schema: z.object({}).strict(),
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: () => summarizeEventViewer(actions.viewer),
    }),
  ]

  if (actions.canPrepareProject) {
    tools.push(
      defineWebMcpTool({
        name: "get_project_draft",
        title: "Read project draft",
        description:
          "Read the project draft saved in this browser. This does not submit or save a project to the event.",
        schema: z.object({}).strict(),
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: () => ({ draft: summarizeProjectDraft(actions.getProjectDraft()) }),
      }),
      defineWebMcpTool({
        name: "prepare_project",
        title: "Prepare project",
        description:
          "Fill a local project draft and open its review when allowed. A person must click Submit Project or Save Changes.",
        schema: z.object({
          title: z.string().trim().min(1).max(100),
          githubUrl: z.string().trim().min(1).max(2_048),
          liveAppUrl: z.string().trim().max(2_048).default(""),
          demoVideoUrl: z.string().trim().max(2_048).default(""),
          description: z.string().trim().min(1).max(280),
        }).strict(),
        execute: (draft) => {
          const outcome = actions.prepareProject(draft)
          return {
            data: {
              prepared: true,
              openedReview: outcome.openedReview,
              nextStep: outcome.nextStep,
            },
            requiresHumanAction: true,
          }
        },
      }),
    )
  }

  if (actions.canOpenRegistration) {
    tools.push(defineWebMcpTool({
      name: "open_registration",
      title: "Open registration",
      description:
        "Show and focus the normal registration action. A person must accept any terms, share location if needed, and click Register.",
      schema: z.object({}).strict(),
      annotations: { readOnlyHint: true },
      execute: () => ({
        data: {
          opened: actions.openRegistration(),
          nextStep: "Review the page and click Register to Attend.",
        },
        requiresHumanAction: true,
      }),
    }))
  }

  if (actions.viewer.team) {
    tools.push(defineWebMcpTool({
      name: "get_my_team",
      title: "Read my team",
      description:
        "Read the viewer's team name, status, members, and open spots without exposing internal IDs.",
      schema: z.object({}).strict(),
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: () => summarizeEventViewer(actions.viewer).team,
    }))
  }

  if (actions.viewer.sponsor) {
    tools.push(defineWebMcpTool({
      name: "get_my_sponsorship",
      title: "Read my sponsorship",
      description:
        "Read the active organization's sponsor relationship shown on this event page.",
      schema: z.object({}).strict(),
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: () => ({
        event: actions.guide.name,
        organization: actions.viewer.sponsor?.organizationName,
        tier: actions.viewer.sponsor?.tier,
        nextStep: actions.viewer.nextStep,
      }),
    }))
  }

  if (actions.canInviteTeamMembers) {
    tools.push(defineWebMcpTool({
      name: "prepare_team_invite",
      title: "Prepare team invite",
      description:
        "Fill and open the normal team invite review. A person must click Send Invitation.",
      schema: z.object({ email: z.email().max(254) }).strict(),
      execute: ({ email }) => ({
        data: {
          prepared: actions.prepareTeamInvite(email),
          nextStep: "Check the email, then click Send Invitation.",
        },
        requiresHumanAction: true,
      }),
    }))
  }

  return tools
}
