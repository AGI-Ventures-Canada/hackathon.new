import { describe, expect, it, mock } from "bun:test"
import {
  createEventAttendeeTools,
  getProjectCapabilities,
  getProjectDraftNextStep,
  type EventGuideContext,
  type EventViewerContext,
} from "@/lib/webmcp/event-attendee-tools"
import { MAX_WEBMCP_OUTPUT_CHARACTERS } from "@/lib/webmcp/tool"
import type { WebMcpTool } from "@/lib/webmcp/types"

const guide: EventGuideContext = {
  name: "Agent Jam",
  slug: "agent-jam",
  description: "Build useful agents.",
  status: "active",
  startsAt: "2026-08-25T12:00:00.000Z",
  endsAt: "2026-08-26T12:00:00.000Z",
  locationType: "virtual",
  locationName: null,
  locationUrl: "https://example.com",
  organizerName: "AGI Ventures",
  schedule: [],
  announcements: [],
  challenges: [{
    title: "Web tools",
    description: "Build one.",
    resourceCount: 1,
    resources: [{ label: "Starter docs", url: "https://docs.example.com/start" }],
  }],
  resultsPublished: false,
  results: [],
}

const viewer: EventViewerContext = {
  signedIn: true,
  registered: true,
  role: "participant",
  participantCount: 12,
  nextStep: "Build your project.",
  sponsor: null,
  team: {
    name: "Oats",
    status: "forming",
    isCaptain: true,
    memberNames: ["Jordan"],
    memberCount: 1,
    pendingInviteCount: 0,
    maxTeamSize: 5,
  },
  project: null,
}

const signal = new AbortController().signal

describe("event attendee WebMCP tools", () => {
  it("describes the next project step for signed-in attendees", () => {
    expect(getProjectDraftNextStep({
      signedIn: true,
      registered: true,
      role: "participant",
      status: "published",
      teamStatus: "forming",
      canOpenProjectReview: false,
    })).toBe("Your draft is saved. You can submit when the event starts.")
    expect(getProjectDraftNextStep({
      signedIn: true,
      registered: true,
      role: "participant",
      status: "active",
      teamStatus: "active",
      canOpenProjectReview: true,
    })).toContain("submit or save it directly")
  })

  it("keeps local project preparation available before sign-in", () => {
    expect(getProjectCapabilities({
      status: "published",
      role: null,
      isOrganizer: false,
      isAttendee: false,
      teamStatus: null,
    })).toEqual({
      canOpenProjectReview: false,
      canPrepareProject: true,
    })
  })

  it("keeps project review closed after the project deadline", () => {
    expect(getProjectCapabilities({
      status: "active",
      role: "participant",
      isOrganizer: false,
      isAttendee: true,
      teamStatus: "active",
      submissionsOpen: false,
    })).toEqual({
      canOpenProjectReview: false,
      canPrepareProject: true,
    })
    expect(getProjectDraftNextStep({
      signedIn: true,
      registered: true,
      role: "participant",
      status: "active",
      teamStatus: "active",
      canOpenProjectReview: false,
      submissionsOpen: false,
    })).toContain("deadline has passed")
  })

  it("removes project preparation and review for a disbanded team", () => {
    expect(getProjectCapabilities({
      status: "active",
      role: "participant",
      isOrganizer: false,
      isAttendee: true,
      teamStatus: "disbanded",
    })).toEqual({
      canOpenProjectReview: false,
      canPrepareProject: false,
    })

    expect(getProjectCapabilities({
      status: "active",
      role: "participant",
      isOrganizer: false,
      isAttendee: true,
      teamStatus: "pending_approval",
    })).toEqual({
      canOpenProjectReview: false,
      canPrepareProject: true,
    })
  })

  it("registers only useful role-aware tools", () => {
    const tools = createEventAttendeeTools({
      guide,
      viewer,
      canOpenRegistration: false,
      canInviteTeamMembers: true,
      canPrepareProject: true,
      openRegistration: () => true,
      prepareTeamInvite: () => true,
      getProjectDraft: () => null,
      prepareProject: () => ({ openedReview: true, nextStep: "Review" }),
    })
    expect(tools.map((tool) => tool.name)).toEqual([
      "get_event_guide",
      "get_challenge_resources",
      "get_my_event_status",
      "get_project_draft",
      "prepare_project",
      "get_my_team",
      "prepare_team_invite",
    ])
  })

  it("prepares an invite and project while keeping the final action human", async () => {
    const prepareTeamInvite = mock((_email: string) => true)
    const prepareProject = mock(() => ({ openedReview: true, nextStep: "Review" }))
    const tools = createEventAttendeeTools({
      guide,
      viewer,
      canOpenRegistration: true,
      canInviteTeamMembers: true,
      canPrepareProject: true,
      openRegistration: () => true,
      prepareTeamInvite,
      getProjectDraft: () => null,
      prepareProject,
    })

    const invite = tools.find((tool) => tool.name === "prepare_team_invite")!
    const inviteResult = await invite.execute({ email: "friend@example.com" }, { signal }) as {
      ok: boolean
      requiresHumanAction: boolean
    }
    expect(inviteResult.requiresHumanAction).toBe(false)
    expect(prepareTeamInvite).toHaveBeenCalledWith("friend@example.com")

    const project = tools.find((tool) => tool.name === "prepare_project")!
    const projectResult = await project.execute({
      title: "Oat Agent",
      githubUrl: "github.com/agi/oat-agent",
      description: "Helps people run a hackathon.",
    }, { signal }) as { ok: boolean; requiresHumanAction: boolean }
    expect(projectResult.ok).toBe(true)
    expect(projectResult.requiresHumanAction).toBe(false)
    expect(prepareProject).toHaveBeenCalledTimes(1)
  })

  it("rejects invalid email before opening the invite review", async () => {
    const prepareTeamInvite = mock(() => true)
    const tools = createEventAttendeeTools({
      guide,
      viewer,
      canOpenRegistration: false,
      canInviteTeamMembers: true,
      canPrepareProject: true,
      openRegistration: () => true,
      prepareTeamInvite,
      getProjectDraft: () => null,
      prepareProject: () => ({ openedReview: false, nextStep: "Register" }),
    })
    const invite = tools.find((tool) => tool.name === "prepare_team_invite")!
    const result = await invite.execute({ email: "not-an-email" }, { signal }) as {
      ok: boolean
      error: { code: string }
    }
    expect(result.error.code).toBe("invalid_input")
    expect(prepareTeamInvite).not.toHaveBeenCalled()
  })

  it("omits project preparation when the current role or lifecycle cannot use it", () => {
    const tools = createEventAttendeeTools({
      guide: { ...guide, status: "completed" },
      viewer: { ...viewer, role: "judge", team: null },
      canOpenRegistration: false,
      canInviteTeamMembers: false,
      canPrepareProject: false,
      openRegistration: () => false,
      prepareTeamInvite: () => false,
      getProjectDraft: () => null,
      prepareProject: () => ({ openedReview: false, nextStep: "Event ended" }),
    })

    expect(tools.map((tool) => tool.name)).toEqual([
      "get_event_guide",
      "get_challenge_resources",
      "get_my_event_status",
    ])
  })

  it("returns every safe challenge resource through bounded pages", async () => {
    const tools = createEventAttendeeTools({
      guide: {
        ...guide,
        challenges: [{
          title: "Web tools",
          description: "Build one.",
          resourceCount: 4,
          resources: [
            { label: "Unsafe", url: "javascript:alert(1)" },
            {
              label: "Too long",
              url: `https://example.com/${"x".repeat(240)}`,
            },
            { label: "L".repeat(100), url: "docs.example.com/start" },
            { label: "Second safe link", url: "https://example.org/second" },
          ],
        }],
      },
      viewer,
      canOpenRegistration: false,
      canInviteTeamMembers: false,
      canPrepareProject: false,
      openRegistration: () => false,
      prepareTeamInvite: () => false,
      getProjectDraft: () => null,
      prepareProject: () => ({ openedReview: false, nextStep: "Event ended" }),
    })

    const result = await executeByName(tools, "get_event_guide", {
      section: "challenges",
      offset: 0,
    })

    expect(result).toMatchObject({
      ok: true,
      data: {
        section: "challenges",
        total: 1,
        items: [{
          resourceCount: 4,
          availableResourceCount: 2,
          resources: [{
            label: `${"L".repeat(59)}…`,
            url: "https://docs.example.com/start",
          }],
        }],
      },
    })
    expect(JSON.stringify(result)).not.toContain("javascript:")
    expect(JSON.stringify(result)).not.toContain("Second safe link")

    const challengeRef = (result as {
      data: { items: Array<{ challengeRef: string }> }
    }).data.items[0].challengeRef
    const firstPage = await executeByName(tools, "get_challenge_resources", {
      challengeRef,
      offset: 0,
      limit: 1,
    })
    const secondPage = await executeByName(tools, "get_challenge_resources", {
      challengeRef,
      offset: 1,
      limit: 1,
    })

    expect(firstPage).toMatchObject({
      ok: true,
      data: {
        total: 2,
        nextOffset: 1,
        items: [{ url: "https://docs.example.com/start" }],
      },
    })
    expect(secondPage).toMatchObject({
      ok: true,
      data: {
        nextOffset: null,
        items: [{
          label: "Second safe link",
          url: "https://example.org/second",
        }],
      },
    })
    expect(JSON.stringify([firstPage, secondPage])).not.toContain("javascript:")
  })

  it("returns published results without internal IDs", async () => {
    const tools = createEventAttendeeTools({
      guide: {
        ...guide,
        status: "completed",
        resultsPublished: true,
        results: [{
          rank: 1,
          projectTitle: "Oat Agent",
          teamName: "Oats",
          weightedScore: 94.5,
          prizes: [{ name: "Best overall", value: "$1,000" }],
        }],
      },
      viewer,
      canOpenRegistration: false,
      canInviteTeamMembers: false,
      canPrepareProject: false,
      openRegistration: () => false,
      prepareTeamInvite: () => false,
      getProjectDraft: () => null,
      prepareProject: () => ({ openedReview: false, nextStep: "Event ended" }),
    })

    const result = await executeByName(tools, "get_event_guide", {
      section: "results",
      offset: 0,
    })

    expect(result).toMatchObject({
      ok: true,
      data: {
        published: true,
        total: 1,
        items: [{ rank: 1, projectTitle: "Oat Agent", teamName: "Oats" }],
      },
    })
    expect(JSON.stringify(result)).not.toContain("submissionId")
  })

  it("rejects a challenge reference after the challenge changes", async () => {
    const tools = createEventAttendeeTools({
      guide,
      viewer,
      canOpenRegistration: false,
      canInviteTeamMembers: false,
      canPrepareProject: false,
      openRegistration: () => false,
      prepareTeamInvite: () => false,
      getProjectDraft: () => null,
      prepareProject: () => ({ openedReview: false, nextStep: "Event ended" }),
    })

    const result = await executeByName(tools, "get_challenge_resources", {
      challengeRef: "challenge-stale",
      offset: 0,
      limit: 4,
    })
    expect(result).toMatchObject({
      ok: false,
      error: { code: "stale_challenge_ref", retryable: true },
    })
  })

  it("pages long public content within the output budget", async () => {
    const maxGuide: EventGuideContext = {
      ...guide,
      name: "n".repeat(120),
      slug: "s".repeat(120),
      description: "d".repeat(5_000),
      locationName: "l".repeat(240),
      locationUrl: `https://example.com/${"u".repeat(1_900)}`,
      organizerName: "o".repeat(120),
      schedule: Array.from({ length: 30 }, () => ({
        title: "t".repeat(200),
        startsAt: "2026-08-25T12:00:00.000Z",
        endsAt: "2026-08-25T13:00:00.000Z",
        location: "l".repeat(200),
      })),
      announcements: Array.from({ length: 30 }, () => ({
        title: "t".repeat(200),
        body: "b".repeat(2_000),
        priority: "urgent",
      })),
      challenges: Array.from({ length: 30 }, () => ({
        title: "t".repeat(200),
        description: "d".repeat(2_000),
        resourceCount: 20,
        resources: Array.from({ length: 20 }, (_, index) => ({
          label: `${index}-${"r".repeat(100)}`,
          url: `https://docs-${index}.example.com/${"u".repeat(190)}`,
        })),
      })),
    }
    const tools = createEventAttendeeTools({
      guide: maxGuide,
      viewer,
      canOpenRegistration: false,
      canInviteTeamMembers: false,
      canPrepareProject: true,
      openRegistration: () => false,
      prepareTeamInvite: () => false,
      getProjectDraft: () => null,
      prepareProject: () => ({ openedReview: false, nextStep: "Register" }),
    })
    const read = tools.find((tool) => tool.name === "get_event_guide")!

    for (const section of ["overview", "schedule", "announcements", "challenges"]) {
      const result = await read.execute({ section }, { signal }) as { ok: boolean }
      expect(result.ok).toBe(true)
      expect(JSON.stringify(result).length).toBeLessThanOrEqual(MAX_WEBMCP_OUTPUT_CHARACTERS)
    }
  })

  it("summarizes viewer, team, and project state without internal references", async () => {
    const longViewer: EventViewerContext = {
      ...viewer,
      nextStep: "N".repeat(300),
      team: {
        ...viewer.team!,
        name: "T".repeat(160),
        memberNames: Array.from({ length: 12 }, (_, index) =>
          `${index}-${"M".repeat(100)}`),
      },
      project: {
        title: "P".repeat(150),
        status: "draft",
        hasGithubUrl: true,
        hasLiveAppUrl: false,
        hasDemoVideoUrl: true,
      },
    }
    const tools = createEventAttendeeTools({
      guide,
      viewer: longViewer,
      canOpenRegistration: false,
      canInviteTeamMembers: false,
      canPrepareProject: false,
      openRegistration: () => false,
      prepareTeamInvite: () => false,
      getProjectDraft: () => null,
      prepareProject: () => ({ openedReview: false, nextStep: "Register" }),
    })

    const status = await executeByName(tools, "get_my_event_status")
    expect(status).toMatchObject({
      ok: true,
      data: {
        signedIn: true,
        registered: true,
        role: "participant",
        participantCount: 12,
        nextStep: `${"N".repeat(159)}…`,
        team: {
          name: `${"T".repeat(99)}…`,
          memberCount: 1,
          pendingInviteCount: 0,
          maxTeamSize: 5,
        },
        project: {
          title: `${"P".repeat(99)}…`,
          status: "draft",
          hasGithubUrl: true,
          hasLiveAppUrl: false,
          hasDemoVideoUrl: true,
        },
      },
    })
    const statusData = (status as { data: EventViewerContext }).data
    expect(statusData.team?.memberNames).toHaveLength(8)
    expect(JSON.stringify(status)).not.toContain("aaaaaaaa-aaaa")

    expect(await executeByName(tools, "get_my_team")).toMatchObject({
      ok: true,
      data: { name: `${"T".repeat(99)}…`, status: "forming" },
    })
  })

  it("discovers sponsorship from the same relationship shown on the page", async () => {
    const sponsorViewer: EventViewerContext = {
      ...viewer,
      registered: false,
      role: "sponsor",
      team: null,
      sponsor: { organizationName: "Breakfast Labs", tier: "gold" },
      nextStep: "Open Sponsoring to manage this event relationship.",
    }
    const tools = createEventAttendeeTools({
      guide,
      viewer: sponsorViewer,
      canOpenRegistration: false,
      canInviteTeamMembers: false,
      canPrepareProject: false,
      openRegistration: () => false,
      prepareTeamInvite: () => false,
      getProjectDraft: () => null,
      prepareProject: () => ({ openedReview: false, nextStep: "" }),
    })

    expect(await executeByName(tools, "get_my_sponsorship")).toMatchObject({
      ok: true,
      data: {
        organization: "Breakfast Labs",
        tier: "gold",
      },
    })
  })

  it("reads a bounded local draft and reports an unavailable registration control honestly", async () => {
    const projectDraft = {
      title: "T".repeat(140),
      githubUrl: `https://github.com/${"g".repeat(300)}`,
      liveAppUrl: `https://example.com/${"l".repeat(300)}`,
      demoVideoUrl: `https://video.example.com/${"v".repeat(300)}`,
      description: "D".repeat(500),
    }
    const tools = createEventAttendeeTools({
      guide,
      viewer,
      canOpenRegistration: true,
      canInviteTeamMembers: false,
      canPrepareProject: true,
      openRegistration: () => false,
      prepareTeamInvite: () => false,
      getProjectDraft: () => projectDraft,
      prepareProject: () => ({ openedReview: false, nextStep: "Register first" }),
    })

    const draftResult = await executeByName(tools, "get_project_draft")
    expect(draftResult).toMatchObject({
      ok: true,
      data: {
        draft: {
          title: `${"T".repeat(99)}…`,
          githubUrl: `https://github.com/${"g".repeat(160)}…`,
          description: `${"D".repeat(279)}…`,
        },
      },
    })
    expect(JSON.stringify(draftResult).length).toBeLessThanOrEqual(
      MAX_WEBMCP_OUTPUT_CHARACTERS,
    )

    expect(await executeByName(tools, "open_registration")).toEqual({
      ok: true,
      data: {
        opened: false,
        nextStep: "Your agent can register you directly with the required event inputs.",
      },
      requiresHumanAction: false,
    })
  })

  it("covers organizer, judge, pending, and closed project capabilities", () => {
    const base = {
      status: "active" as const,
      role: "participant" as string | null,
      isOrganizer: false,
      isAttendee: true,
      teamStatus: "forming" as const,
    }
    expect(getProjectCapabilities(base)).toEqual({
      canOpenProjectReview: true,
      canPrepareProject: true,
    })
    expect(getProjectCapabilities({ ...base, isOrganizer: true })).toEqual({
      canOpenProjectReview: true,
      canPrepareProject: false,
    })
    expect(getProjectCapabilities({ ...base, role: "judge" })).toEqual({
      canOpenProjectReview: true,
      canPrepareProject: false,
    })
    expect(getProjectCapabilities({ ...base, status: "completed" })).toEqual({
      canOpenProjectReview: false,
      canPrepareProject: false,
    })
    expect(getProjectCapabilities({ ...base, teamStatus: "pending_approval" })).toEqual({
      canOpenProjectReview: false,
      canPrepareProject: true,
    })
  })
})

function executeByName(
  tools: WebMcpTool[],
  name: string,
  input: Record<string, unknown> = {},
) {
  const tool = tools.find((candidate) => candidate.name === name)
  if (!tool) throw new Error(`Missing tool ${name}`)
  return tool.execute(input, { signal })
}
