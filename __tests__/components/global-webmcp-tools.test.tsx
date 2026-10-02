import React, { useEffect } from "react"
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { act, cleanup, render, waitFor } from "@testing-library/react"
import type { WebMcpTool } from "@/lib/webmcp/types"
import {
  PREPARE_PROJECT_EVENT,
  type PrepareProjectEvent,
} from "@/lib/webmcp/client-events"
import { clerkState } from "../lib/clerk-mock"
import { projectDraftStorageKey } from "@/lib/webmcp/project-draft-storage"

let acknowledgeProject = true
let attendeeStatus = "active"

mock.module("@/components/hackathon/submission-button", () => ({
  SubmissionButton: ({
    hackathonSlug,
    prepareTarget,
  }: {
    hackathonSlug: string
    prepareTarget: string
  }) => {
    useEffect(() => {
      const acknowledge = (rawEvent: Event) => {
        const event = rawEvent as PrepareProjectEvent
        if (
          event.detail.slug === hackathonSlug
          && event.detail.target === prepareTarget
          && acknowledgeProject
        ) {
          const key = projectDraftStorageKey(hackathonSlug, "user-123")
          const existing = JSON.parse(window.localStorage.getItem(key) ?? "{}")
          window.localStorage.setItem(key, JSON.stringify({
            ...event.detail.draft,
            currentStep: existing.currentStep ?? 0,
            screenshots: existing.screenshots ?? [],
          }))
          event.detail.acknowledge({ ok: true })
        }
      }
      window.addEventListener(PREPARE_PROJECT_EVENT, acknowledge)
      return () => window.removeEventListener(PREPARE_PROJECT_EVENT, acknowledge)
    }, [hackathonSlug, prepareTarget])
    return <div data-testid="project-review">{hackathonSlug}</div>
  },
}))

const { GlobalWebMcpTools } = await import("@/components/global-webmcp-tools")

const tools = new Map<string, WebMcpTool>()
const signal = new AbortController().signal
const originalFetch = globalThis.fetch

beforeEach(() => {
  tools.clear()
  acknowledgeProject = true
  attendeeStatus = "active"
  window.localStorage.clear()
  clerkState.isLoaded = true
  clerkState.isSignedIn = true
  clerkState.userId = "user-123"
  clerkState.user = { id: "user-123" } as typeof clerkState.user
  document.modelContext = {
    registerTool: mock(async (tool, options) => {
      tools.set(tool.name, tool)
      options?.signal?.addEventListener("abort", () => tools.delete(tool.name), {
        once: true,
      })
    }),
  }
  globalThis.fetch = mock(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith("/hackathons/participating")) {
      return Response.json({
        hackathons: [{
          id: "event-1",
          slug: "agent-jam",
          name: "Agent Jam",
          description: null,
          status: attendeeStatus,
          startsAt: null,
          endsAt: null,
          role: "participant",
        }],
      })
    }
    if (url.includes("/webmcp/attendee-events/")) {
      return Response.json({
        guide: {
          name: "Agent Jam",
          slug: "agent-jam",
          description: null,
          rules: null,
          status: attendeeStatus,
          startsAt: null,
          endsAt: null,
          locationType: null,
          locationName: null,
          locationUrl: null,
          organizerName: "AGIV",
          schedule: [],
          announcements: [],
          challenges: [],
          resultsPublished: false,
        },
        viewer: {
          signedIn: true,
          registered: true,
          role: "participant",
          participantCount: 1,
          nextStep: "Review your project.",
          sponsor: null,
          team: {
            name: "Builders",
            status: "forming",
            isCaptain: true,
            memberNames: ["Avery"],
            memberCount: 1,
            pendingInviteCount: 0,
            maxTeamSize: 4,
          },
          project: null,
        },
        projectReview: {
          submission: null,
          submissionDeadline: "2099-08-29T20:00:00.000Z",
          teamSizeWarning: null,
          teamStatus: "forming",
        },
      })
    }
    return Response.json({ hackathons: [] })
  }) as typeof fetch
})

afterEach(() => {
  cleanup()
  delete document.modelContext
  globalThis.fetch = originalFetch
})

async function execute(name: string, input: Record<string, unknown> = {}) {
  const tool = tools.get(name)
  if (!tool) throw new Error(`Missing tool: ${name}`)
  return tool.execute(input, { signal })
}

describe("GlobalWebMcpTools", () => {
  it("registers only for a signed-in user", async () => {
    const { rerender } = render(<GlobalWebMcpTools />)
    await waitFor(() => expect(tools.has("open_create_event")).toBe(true))

    clerkState.isSignedIn = false
    rerender(<GlobalWebMcpTools />)
    await waitFor(() => expect(tools.size).toBe(0))
  })

  it("stores a normalized draft and opens its review on the current page", async () => {
    render(<GlobalWebMcpTools />)
    await waitFor(() => expect(tools.has("list_my_attendee_events")).toBe(true))
    await execute("list_my_attendee_events", { offset: 0 })

    let pending: ReturnType<typeof execute> | undefined
    act(() => {
      pending = execute("prepare_attendee_project", {
        eventRef: "attendee-1",
        title: "Queue Coach",
        githubUrl: "github.com/example/queue-coach",
        liveAppUrl: "queue-coach.example",
        demoVideoUrl: "",
        description: "Helps mentors reach teams faster.",
      })
    })
    const result = await pending

    expect(result).toMatchObject({
      ok: true,
      requiresHumanAction: false,
      data: { openedReview: true },
    })
    expect(JSON.parse(window.localStorage.getItem(
      projectDraftStorageKey("agent-jam", "user-123"),
    ) as string)).toMatchObject({
      title: "Queue Coach",
      githubUrl: "https://github.com/example/queue-coach",
      liveAppUrl: "https://queue-coach.example",
    })
  })

  it("saves a draft without opening review before the event starts", async () => {
    attendeeStatus = "published"
    render(<GlobalWebMcpTools />)
    await waitFor(() => expect(tools.has("list_my_attendee_events")).toBe(true))
    await execute("list_my_attendee_events", { offset: 0 })
    const result = await execute("prepare_attendee_project", {
      eventRef: "attendee-1",
      title: "Queue Coach",
      githubUrl: "github.com/example/queue-coach",
      liveAppUrl: "",
      demoVideoUrl: "",
      description: "Helps mentors.",
    })
    const draft = await execute("get_attendee_project_draft", {
      eventRef: "attendee-1",
    })
    expect(result).toMatchObject({
      ok: true,
      data: { openedReview: false, nextStep: expect.stringContaining("event starts") },
    })
    expect(draft).toMatchObject({
      ok: true,
      data: { draft: { title: "Queue Coach" } },
    })
  })

  it("reports unavailable browser storage without claiming preparation", async () => {
    attendeeStatus = "published"
    const originalStorage = window.localStorage
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
        clear: () => {},
        key: () => null,
        length: 0,
      } as Storage,
    })
    try {
      render(<GlobalWebMcpTools />)
      await waitFor(() => expect(tools.has("list_my_attendee_events")).toBe(true))
      await execute("list_my_attendee_events", { offset: 0 })
      const result = await execute("prepare_attendee_project", {
        eventRef: "attendee-1",
        title: "Queue Coach",
        githubUrl: "github.com/example/queue-coach",
        liveAppUrl: "",
        demoVideoUrl: "",
        description: "Helps mentors.",
      })
      expect(result).toMatchObject({
        ok: false,
        error: { code: "storage_unavailable" },
      })
    } finally {
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        value: originalStorage,
      })
    }
  })

  it("fails closed when the project review cannot acknowledge preparation", async () => {
    acknowledgeProject = false
    render(<GlobalWebMcpTools />)
    await waitFor(() => expect(tools.has("list_my_attendee_events")).toBe(true))
    await execute("list_my_attendee_events", { offset: 0 })
    let pending: ReturnType<typeof execute> | undefined
    act(() => {
      pending = execute("prepare_attendee_project", {
        eventRef: "attendee-1",
        title: "Queue Coach",
        githubUrl: "github.com/example/queue-coach",
        liveAppUrl: "",
        demoVideoUrl: "",
        description: "Helps mentors.",
      })
    })
    expect(await pending).toMatchObject({
      ok: false,
      error: { code: "preparation_unavailable" },
    })
  })

  it("blocks overlapping reviews and cancels pending work on unmount", async () => {
    const originalRequestAnimationFrame = window.requestAnimationFrame
    const originalCancelAnimationFrame = window.cancelAnimationFrame
    window.requestAnimationFrame = mock(() => 1)
    window.cancelAnimationFrame = mock(() => {})
    try {
      const view = render(<GlobalWebMcpTools />)
      await waitFor(() => expect(tools.has("list_my_attendee_events")).toBe(true))
      await execute("list_my_attendee_events", { offset: 0 })
      const input = {
        eventRef: "attendee-1",
        title: "Queue Coach",
        githubUrl: "github.com/example/queue-coach",
        liveAppUrl: "",
        demoVideoUrl: "",
        description: "Helps mentors.",
      }
      let first: ReturnType<typeof execute> | undefined
      await act(async () => {
        first = execute("prepare_attendee_project", input)
        await Promise.resolve()
        await Promise.resolve()
      })
      expect(await execute("prepare_attendee_project", input)).toMatchObject({
        ok: false,
        error: { code: "event_busy", retryable: true },
      })
      view.unmount()
      expect(await first).toMatchObject({
        ok: false,
        error: { code: "cancelled", retryable: true },
      })
    } finally {
      window.requestAnimationFrame = originalRequestAnimationFrame
      window.cancelAnimationFrame = originalCancelAnimationFrame
    }
  })
})
