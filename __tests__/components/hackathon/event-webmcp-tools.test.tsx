import { afterEach, beforeEach, describe, expect, it, mock, setSystemTime } from "bun:test"
import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import { EventWebMcpTools } from "@/components/hackathon/event-webmcp-tools"
import {
  PREPARE_PROJECT_EVENT,
  PREPARE_TEAM_INVITE_EVENT,
  type PrepareProjectEvent,
  type PrepareTeamInviteEvent,
} from "@/lib/webmcp/client-events"
import type {
  EventGuideContext,
  EventViewerContext,
} from "@/lib/webmcp/event-attendee-tools"
import type { WebMcpTool } from "@/lib/webmcp/types"

const guide: EventGuideContext = {
  name: "Agent Jam",
  slug: "agent-jam",
  description: "Build useful agents.",
  status: "active",
  startsAt: "2026-09-08T12:30:00.000Z",
  endsAt: "2026-09-09T21:00:00.000Z",
  locationType: "virtual",
  locationName: null,
  locationUrl: "https://example.com/live",
  organizerName: "Oatmeal",
  schedule: [],
  announcements: [],
  challenges: [],
  resultsPublished: false,
}

const viewer: EventViewerContext = {
  signedIn: true,
  registered: true,
  role: "participant",
  participantCount: 14,
  nextStep: "Prepare your project.",
  team: {
    name: "Breakfast Club",
    status: "active",
    isCaptain: true,
    memberNames: ["Alex"],
    memberCount: 1,
    pendingInviteCount: 0,
    maxTeamSize: 4,
  },
  project: null,
}

let registered = new Map<string, WebMcpTool>()

function tool(name: string): WebMcpTool {
  const value = registered.get(name)
  if (!value) throw new Error(`Missing tool ${name}`)
  return value
}

function renderTools(overrides: Partial<React.ComponentProps<typeof EventWebMcpTools>> = {}) {
  return render(
    <EventWebMcpTools
      guide={guide}
      viewer={viewer}
      canRegisterViewer
      registrationOpensAt={null}
      isFormingCaptain
      registrationClosesAt={null}
      allowLateRegistration
      atCapacity={false}
      isOrganizer={false}
      {...overrides}
    />,
  )
}

beforeEach(() => {
  registered = new Map()
  localStorage.clear()
  document.modelContext = {
    registerTool: mock(async (value, options) => {
      registered.set(value.name, value)
      options?.signal?.addEventListener("abort", () => {
        if (registered.get(value.name) === value) registered.delete(value.name)
      }, { once: true })
    }),
  }
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  setSystemTime()
  delete document.modelContext
  document.querySelectorAll("[data-webmcp-registration]").forEach((node) => node.remove())
})

describe("EventWebMcpTools", () => {
  it("opens and focuses the visible registration control", async () => {
    const target = document.createElement("div")
    target.dataset.webmcpRegistration = ""
    target.scrollIntoView = mock(() => undefined)
    const button = document.createElement("button")
    target.append(button)
    document.body.append(target)
    renderTools()
    await waitFor(() => expect(registered.has("open_registration")).toBe(true))

    const result = await tool("open_registration").execute(
      {},
      { signal: new AbortController().signal },
    )

    expect(result).toMatchObject({ ok: true, data: { opened: true } })
    expect(target.scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
    })
    expect(document.activeElement).toBe(button)
  })

  it("reports when the normal registration action is not mounted", async () => {
    renderTools()
    await waitFor(() => expect(registered.has("open_registration")).toBe(true))

    expect(await tool("open_registration").execute(
      {},
      { signal: new AbortController().signal },
    )).toMatchObject({ ok: true, data: { opened: false } })
  })

  it("updates guide status and project capabilities at start and end boundaries", async () => {
    setSystemTime(new Date("2026-09-08T12:29:59.000Z"))
    const transitioningGuide: EventGuideContext = {
      ...guide,
      status: "published",
      startsAt: "2026-09-08T12:30:00.000Z",
      endsAt: "2026-09-08T13:00:00.000Z",
    }
    const listener = (event: Event) => {
      const detail = (event as PrepareProjectEvent).detail
      detail.acknowledge({ ok: true })
    }
    window.addEventListener(PREPARE_PROJECT_EVENT, listener)

    try {
      renderTools({ guide: transitioningGuide })
      await waitFor(() => expect(registered.has("prepare_project")).toBe(true))

      const beforeStartGuide = tool("get_event_guide")
      expect(await beforeStartGuide.execute(
        { section: "overview", offset: 0 },
        { signal: new AbortController().signal },
      )).toMatchObject({ ok: true, data: { status: "published" } })
      expect(await tool("prepare_project").execute({
        title: "Before start",
        githubUrl: "https://github.com/oatmeal/before-start",
        liveAppUrl: "",
        demoVideoUrl: "",
        description: "Ready for review.",
      }, { signal: new AbortController().signal })).toMatchObject({
        ok: true,
        data: { openedReview: false },
      })

      setSystemTime(new Date("2026-09-08T12:30:00.000Z"))
      act(() => window.dispatchEvent(new Event("focus")))
      await waitFor(() => {
        expect(registered.get("get_event_guide")).not.toBe(beforeStartGuide)
      })

      expect(await tool("get_event_guide").execute(
        { section: "overview", offset: 0 },
        { signal: new AbortController().signal },
      )).toMatchObject({ ok: true, data: { status: "active" } })
      expect(await tool("prepare_project").execute({
        title: "After start",
        githubUrl: "https://github.com/oatmeal/after-start",
        liveAppUrl: "",
        demoVideoUrl: "",
        description: "Ready for review.",
      }, { signal: new AbortController().signal })).toMatchObject({
        ok: true,
        data: { openedReview: true },
      })

      const activeGuide = tool("get_event_guide")
      setSystemTime(new Date("2026-09-08T13:00:00.000Z"))
      act(() => window.dispatchEvent(new Event("focus")))
      await waitFor(() => {
        expect(registered.get("get_event_guide")).not.toBe(activeGuide)
        expect(registered.has("prepare_project")).toBe(false)
        expect(registered.has("get_project_draft")).toBe(false)
      })
      expect(await tool("get_event_guide").execute(
        { section: "overview", offset: 0 },
        { signal: new AbortController().signal },
      )).toMatchObject({ ok: true, data: { status: "completed" } })
    } finally {
      window.removeEventListener(PREPARE_PROJECT_EVENT, listener)
    }
  })

  it("prepares an invite through the existing human review event", async () => {
    let preparedEmail = ""
    const listener = (event: Event) => {
      const detail = (event as PrepareTeamInviteEvent).detail
      preparedEmail = detail.email
      detail.acknowledge({ ok: true })
    }
    window.addEventListener(PREPARE_TEAM_INVITE_EVENT, listener)
    try {
      renderTools()
      await waitFor(() => expect(registered.has("prepare_team_invite")).toBe(true))

      const result = await tool("prepare_team_invite").execute(
        { email: "friend@example.com" },
        { signal: new AbortController().signal },
      )
      expect(result).toMatchObject({
        ok: true,
        data: { prepared: true },
        requiresHumanAction: true,
      })
      expect(preparedEmail).toBe("friend@example.com")
    } finally {
      window.removeEventListener(PREPARE_TEAM_INVITE_EVENT, listener)
    }
  })

  it("reads only a valid bounded project draft from browser storage", async () => {
    localStorage.setItem("oatmeal:submission-draft:agent-jam", "not json")
    renderTools()
    await waitFor(() => expect(registered.has("get_project_draft")).toBe(true))
    expect(await tool("get_project_draft").execute(
      {},
      { signal: new AbortController().signal },
    )).toEqual({ ok: true, data: { draft: null } })

    localStorage.setItem("oatmeal:submission-draft:agent-jam", JSON.stringify({
      title: "T".repeat(150),
      githubUrl: `https://github.com/${"r".repeat(2_100)}`,
      liveAppUrl: "https://example.com",
      demoVideoUrl: "",
      description: "D".repeat(400),
    }))
    const result = await tool("get_project_draft").execute(
      {},
      { signal: new AbortController().signal },
    )
    expect(result).toMatchObject({
      ok: true,
      data: {
        draft: {
          title: "T".repeat(100),
          githubUrl: `https://github.com/${"r".repeat(160)}…`,
          liveAppUrl: "https://example.com",
          demoVideoUrl: "",
          description: "D".repeat(280),
        },
      },
    })

    localStorage.setItem("oatmeal:submission-draft:agent-jam", JSON.stringify({
      title: "Missing links",
    }))
    expect(await tool("get_project_draft").execute(
      {},
      { signal: new AbortController().signal },
    )).toEqual({ ok: true, data: { draft: null } })
  })

  it("normalizes project links and keeps submission behind one human click", async () => {
    let prepared: PrepareProjectEvent["detail"]["draft"] | null = null
    const listener = (event: Event) => {
      const detail = (event as PrepareProjectEvent).detail
      prepared = detail.draft
      detail.acknowledge({ ok: true })
    }
    window.addEventListener(PREPARE_PROJECT_EVENT, listener)
    try {
      renderTools()
      await waitFor(() => expect(registered.has("prepare_project")).toBe(true))

      await act(async () => {
        const result = await tool("prepare_project").execute({
          title: "  Helpful project  ",
          githubUrl: "github.com/oatmeal/app",
          liveAppUrl: "preview.example.com/app",
          demoVideoUrl: "https://video.example.com/demo",
          description: "  Ready for review.  ",
        }, { signal: new AbortController().signal })
        expect(result).toMatchObject({
          ok: true,
          data: { prepared: true, openedReview: true },
          requiresHumanAction: true,
        })
      })

      expect(prepared).toEqual({
        title: "Helpful project",
        githubUrl: "https://github.com/oatmeal/app",
        liveAppUrl: "https://preview.example.com/app",
        demoVideoUrl: "https://video.example.com/demo",
        description: "Ready for review.",
      })
      expect(screen.getByText("Project draft ready")).toBeDefined()
      expect(screen.getByText("Check each field. You choose when to submit it.")).toBeDefined()
    } finally {
      window.removeEventListener(PREPARE_PROJECT_EVENT, listener)
    }
  })

  it("does not ask a signed-in viewer to sign in again", async () => {
    const listener = (event: Event) => {
      const preparedEvent = event as PrepareProjectEvent
      preparedEvent.detail.acknowledge({ ok: true })
    }
    window.addEventListener(PREPARE_PROJECT_EVENT, listener)
    try {
      renderTools({
        viewer: {
          ...viewer,
          registered: false,
          role: null,
          team: null,
        },
        isFormingCaptain: false,
      })
      await waitFor(() => expect(registered.has("prepare_project")).toBe(true))

      await act(async () => {
        await tool("prepare_project").execute({
          title: "Early project",
          githubUrl: "https://github.com/oatmeal/early-project",
          liveAppUrl: "",
          demoVideoUrl: "",
          description: "Saved before registration.",
        })
      })

      expect(screen.getByText(
        "It’s saved in this browser. Register and finish your team setup when you’re ready.",
      )).toBeDefined()
      expect(screen.queryByText(
        "It’s saved in this browser. Sign in and register when you’re ready.",
      )).toBeNull()
    } finally {
      window.removeEventListener(PREPARE_PROJECT_EVENT, listener)
    }
  })

  it("rejects unsafe optional links and missing project listeners", async () => {
    renderTools({
      viewer: { ...viewer, signedIn: false, registered: false, team: null },
      isFormingCaptain: false,
    })
    await waitFor(() => expect(registered.has("prepare_project")).toBe(true))

    const unsafe = await tool("prepare_project").execute({
      title: "Project",
      githubUrl: "https://github.com/oatmeal/app",
      liveAppUrl: "http://example.com/app",
      demoVideoUrl: "",
      description: "Ready.",
    }, { signal: new AbortController().signal })
    expect(unsafe).toMatchObject({
      ok: false,
      error: { code: "invalid_url" },
    })

    const unavailable = await tool("prepare_project").execute({
      title: "Project",
      githubUrl: "https://github.com/oatmeal/app",
      liveAppUrl: "",
      demoVideoUrl: "",
      description: "Ready.",
    }, { signal: new AbortController().signal })
    expect(unavailable).toMatchObject({
      ok: false,
      error: { code: "preparation_unavailable" },
    })
    expect(screen.queryByText("Project draft ready")).toBeNull()
  })
})
