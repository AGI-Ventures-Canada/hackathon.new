import { beforeEach, describe, expect, it, mock } from "bun:test"
import { createGlobalWebMcpTools } from "@/lib/webmcp/global-tools"
import type { PreparedProjectDraft } from "@/lib/webmcp/event-attendee-tools"
import type { WebMcpFetcher } from "@/lib/webmcp/fetch"

const signal = new AbortController().signal
const organizedId = "11111111-1111-1111-1111-111111111111"
const attendeeId = "22222222-2222-2222-2222-222222222222"

const attendeeContext = {
  guide: {
    name: "Agent Jam",
    slug: "agent-jam",
    description: "Build something useful.",
    rules: "Be kind and ship working code.",
    status: "active" as const,
    startsAt: "2026-08-28T13:00:00.000Z",
    endsAt: "2026-08-29T21:00:00.000Z",
    locationType: "virtual",
    locationName: "Online",
    locationUrl: "https://example.com/room",
    organizerName: "AGIV",
    schedule: [],
    announcements: [],
    challenges: [{
      title: "Web tools",
      description: "Build one.",
      resourceCount: 2,
      resources: [
        { label: "Starter docs", url: "https://docs.example.com/start" },
        { label: "API guide", url: "https://docs.example.com/api" },
      ],
    }],
    resultsPublished: false,
  },
  viewer: {
    signedIn: true,
    registered: true,
    role: "participant",
    participantCount: 20,
    nextStep: "Review your project, then submit it.",
    sponsor: null,
    team: {
      name: "Builders",
      status: "forming" as const,
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
    teamStatus: "forming" as const,
  },
}

const organizerTask = {
  taskRef: "custom-run-of-show",
  label: "Review the run of show",
  hint: "Check every time and room.",
  tooltip: "Open the schedule and check the final plan.",
  severity: "warning" as const,
  state: "pending" as const,
  completionPolicy: "manual" as const,
  custom: true,
  destination: "schedule" as const,
  inspectUrl: "/e/organizer-jam/manage?tab=overview",
  ctaLabel: "Open schedule",
  blocksProgress: false,
  updatedAt: "2026-08-30T18:00:00.000Z",
}

let fetcher: WebMcpFetcher
let onNavigate: ReturnType<typeof mock>
let prepareProject: ReturnType<typeof mock>

beforeEach(() => {
  onNavigate = mock(() => undefined)
  prepareProject = mock(async () => ({
    openedReview: true,
    nextStep: "Review every field, then save.",
  }))
  fetcher = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith("/hackathons/participating")) {
      return Response.json({
        hackathons: [
          {
            id: attendeeId,
            slug: "agent-jam",
            name: "Agent Jam",
            description: "Build something useful.",
            status: "active",
            startsAt: attendeeContext.guide.startsAt,
            endsAt: attendeeContext.guide.endsAt,
            role: "participant",
          },
          {
            id: "33333333-3333-3333-3333-333333333333",
            slug: "judge-jam",
            name: "Judge Jam",
            description: null,
            status: "judging",
            startsAt: null,
            endsAt: null,
            role: "judge",
          },
        ],
      })
    }
    if (url.includes("/webmcp/attendee-events/")) {
      return Response.json(attendeeContext)
    }
    if (url.includes("/action-items")) {
      const method = init?.method ?? "GET"
      if (method === "DELETE") return Response.json({ success: true })
      if (method === "POST") {
        const body = JSON.parse(String(init?.body))
        return Response.json({
          task: { ...organizerTask, ...body },
        })
      }
      if (method === "PATCH") {
        const body = JSON.parse(String(init?.body))
        return Response.json({
          task: { ...organizerTask, state: body.state },
        })
      }
      const query = new URL(url, "https://hackathon.new").searchParams
      const offset = Number(query.get("offset"))
      const limit = Number(query.get("limit"))
      return Response.json({
        event: { name: "Organizer Jam", slug: "organizer-jam" },
        totalCount: 4,
        pendingCount: 2,
        completedCount: 1,
        dismissedCount: 1,
        offset,
        limit,
        hasMore: true,
        nextOffset: offset + 1,
        items: [organizerTask],
      })
    }
    return Response.json({
      hackathons: [{
        id: organizedId,
        slug: "organizer-jam",
        name: "Organizer Jam",
        description: "Run a great event.",
        status: "draft",
        startsAt: null,
        endsAt: null,
      }],
    })
  }) as WebMcpFetcher
})

function tools(draft: PreparedProjectDraft | null = null) {
  return createGlobalWebMcpTools({
    fetcher,
    onNavigate,
    getProjectDraft: () => draft,
    prepareProject,
  })
}

async function execute(
  allTools: ReturnType<typeof tools>,
  name: string,
  input: Record<string, unknown> = {},
) {
  const tool = allTools.find((candidate) => candidate.name === name)
  if (!tool) throw new Error(`Missing tool: ${name}`)
  return tool.execute(input, { signal })
}

describe("global WebMCP tools", () => {
  it("registers stable signed-in tools for organizer and attendee work", () => {
    const allTools = tools()
    expect(allTools.map((tool) => tool.name)).toEqual([
      "open_create_event",
      "list_my_organized_events",
      "open_organized_event",
      "get_organized_event_tasks",
      "add_organized_event_task",
      "complete_organized_event_task",
      "reopen_organized_event_task",
      "dismiss_organized_event_task",
      "remove_organized_event_task",
      "list_my_attendee_events",
      "get_attendee_event_guide",
      "get_attendee_event_status",
      "get_attendee_challenge_links",
      "get_attendee_project_draft",
      "prepare_attendee_project",
      "open_attendee_event",
    ])
    expect(
      allTools.find((tool) => tool.name === "get_organized_event_tasks")
        ?.annotations?.readOnlyHint,
    ).toBe(true)
    expect(
      allTools.find((tool) => tool.name === "remove_organized_event_task")
        ?.annotations?.readOnlyHint,
    ).toBe(false)
  })

  it("uses opaque references and ignores non-attendee roles", async () => {
    const allTools = tools()
    const organized = await execute(allTools, "list_my_organized_events", { offset: 0 })
    const attendee = await execute(allTools, "list_my_attendee_events", { offset: 0 })
    expect(organized).toMatchObject({
      ok: true,
      data: { items: [{ eventRef: "organized-1", name: "Organizer Jam" }] },
    })
    expect(attendee).toMatchObject({
      ok: true,
      data: { totalCount: 1, items: [{ eventRef: "attendee-1", name: "Agent Jam" }] },
    })
    expect(JSON.stringify([organized, attendee])).not.toContain(organizedId)
    expect(JSON.stringify([organized, attendee])).not.toContain(attendeeId)
  })

  it("opens global destinations and reads organizer tasks", async () => {
    const allTools = tools()
    const create = await execute(allTools, "open_create_event")
    await execute(allTools, "list_my_organized_events", { offset: 0 })
    const open = await execute(allTools, "open_organized_event", {
      eventRef: "organized-1",
      destination: "sponsors",
    })
    const tasks = await execute(allTools, "get_organized_event_tasks", {
      eventRef: "organized-1",
      offset: 3,
      limit: 1,
      state: "dismissed",
    })
    expect(create).toMatchObject({
      ok: true,
      requiresHumanAction: true,
      data: { url: "/create" },
    })
    expect(open).toMatchObject({
      ok: true,
      data: { url: "/e/organizer-jam/manage?tab=edit" },
    })
    expect(tasks).toMatchObject({
      ok: true,
      data: {
        event: { name: "Organizer Jam", slug: "organizer-jam" },
        offset: 3,
        limit: 1,
        hasMore: true,
        nextOffset: 4,
        items: [{
          taskRef: "custom-run-of-show",
          destination: "schedule",
          inspectUrl: "/e/organizer-jam/manage?tab=overview",
        }],
      },
    })
    expect(fetcher).toHaveBeenCalledWith(
      `/api/dashboard/hackathons/${organizedId}/action-items?offset=3&limit=1&state=dismissed`,
      expect.objectContaining({ method: "GET" }),
    )
    expect(JSON.stringify(tasks)).not.toContain(organizedId)
    expect(onNavigate).toHaveBeenCalledWith("/create")
    expect(onNavigate).toHaveBeenCalledWith("/e/organizer-jam/manage?tab=edit")
  })

  it("adds, finishes, reopens, dismisses, and removes organizer tasks", async () => {
    const allTools = tools()
    await execute(allTools, "list_my_organized_events", { offset: 0 })

    const added = await execute(allTools, "add_organized_event_task", {
      eventRef: "organized-1",
      label: "Review the run of show",
      severity: "warning",
      taskRef: "custom-run-of-show",
    })
    const completed = await execute(allTools, "complete_organized_event_task", {
      eventRef: "organized-1",
      taskRef: "custom-run-of-show",
      expectedUpdatedAt: organizerTask.updatedAt,
    })
    await execute(allTools, "reopen_organized_event_task", {
      eventRef: "organized-1",
      taskRef: "custom-run-of-show",
    })
    await execute(allTools, "dismiss_organized_event_task", {
      eventRef: "organized-1",
      taskRef: "verify-automated-times",
    })
    const removed = await execute(allTools, "remove_organized_event_task", {
      eventRef: "organized-1",
      taskRef: "custom-run-of-show",
      expectedUpdatedAt: organizerTask.updatedAt,
    })

    expect(added).toMatchObject({
      ok: true,
      data: { task: { taskRef: "custom-run-of-show" } },
    })
    expect(completed).toMatchObject({
      ok: true,
      data: { task: { state: "completed" } },
    })
    expect(removed).toMatchObject({
      ok: true,
      data: {
        removed: true,
        taskRef: "custom-run-of-show",
        destination: "action_items",
        inspectUrl: "/e/organizer-jam/manage?tab=action-items",
      },
    })

    const actionCalls = fetcher.mock.calls.filter(([input]) =>
      String(input).includes("/action-items")
    )
    expect(actionCalls.map(([, init]) => init?.method)).toEqual([
      "POST",
      "PATCH",
      "PATCH",
      "PATCH",
      "DELETE",
    ])
    expect(JSON.parse(String(actionCalls[0][1]?.body))).toEqual({
      label: "Review the run of show",
      severity: "warning",
      taskRef: "custom-run-of-show",
    })
    expect(JSON.parse(String(actionCalls[1][1]?.body))).toEqual({
      state: "completed",
      expectedUpdatedAt: organizerTask.updatedAt,
    })
    expect(String(actionCalls[4][0])).toContain(
      "custom-run-of-show?expectedUpdatedAt=2026-08-30T18%3A00%3A00.000Z",
    )
  })

  it("reads current attendee rules and status without navigating", async () => {
    const allTools = tools()
    await execute(allTools, "list_my_attendee_events", { offset: 0 })
    const guide = await execute(allTools, "get_attendee_event_guide", {
      eventRef: "attendee-1",
      section: "rules",
      offset: 0,
    })
    const status = await execute(allTools, "get_attendee_event_status", {
      eventRef: "attendee-1",
    })
    expect(guide).toMatchObject({
      ok: true,
      data: { rules: "Be kind and ship working code.", available: true },
    })
    expect(status).toMatchObject({
      ok: true,
      data: { team: { name: "Builders" }, nextStep: "Review your project, then submit it." },
    })
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it("pages safe resources using the challenge reference from the guide", async () => {
    const allTools = tools()
    await execute(allTools, "list_my_attendee_events", { offset: 0 })
    const guideResult = await execute(allTools, "get_attendee_event_guide", {
      eventRef: "attendee-1",
      section: "challenges",
      offset: 0,
    }) as { data: { items: Array<{ challengeRef: string }> } }
    const resources = await execute(allTools, "get_attendee_challenge_links", {
      eventRef: "attendee-1",
      challengeRef: guideResult.data.items[0].challengeRef,
      offset: 1,
      limit: 1,
    })

    expect(resources).toMatchObject({
      ok: true,
      data: {
        total: 2,
        offset: 1,
        nextOffset: null,
        items: [{ label: "API guide", url: "https://docs.example.com/api" }],
      },
    })
  })

  it("normalizes a project and opens human review", async () => {
    const allTools = tools()
    await execute(allTools, "list_my_attendee_events", { offset: 0 })
    const result = await execute(allTools, "prepare_attendee_project", {
      eventRef: "attendee-1",
      title: "  Helpful agent  ",
      githubUrl: "github.com/acme/helpful-agent",
      liveAppUrl: "helpful.example.com",
      demoVideoUrl: "",
      description: "  Helps people.  ",
    })
    expect(result).toMatchObject({
      ok: true,
      requiresHumanAction: true,
      data: { prepared: true, openedReview: true },
    })
    expect(prepareProject).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "agent-jam" }),
      attendeeContext,
      {
        title: "Helpful agent",
        githubUrl: "https://github.com/acme/helpful-agent",
        liveAppUrl: "https://helpful.example.com",
        demoVideoUrl: "",
        description: "Helps people.",
      },
    )
  })

  it("reads a bounded browser draft and opens the attendee event", async () => {
    const draft = {
      title: "Queue Coach",
      githubUrl: `https://github.com/example/${"q".repeat(300)}`,
      liveAppUrl: "https://queue.example",
      demoVideoUrl: "",
      description: "Helps teams.",
    }
    const allTools = tools(draft)
    await execute(allTools, "list_my_attendee_events", { offset: 0 })
    const read = await execute(allTools, "get_attendee_project_draft", {
      eventRef: "attendee-1",
    })
    const open = await execute(allTools, "open_attendee_event", {
      eventRef: "attendee-1",
    })
    expect(read).toMatchObject({
      ok: true,
      data: { draft: { title: "Queue Coach" } },
    })
    expect(JSON.stringify(read).length).toBeLessThan(1_500)
    expect(open).toMatchObject({ ok: true, data: { url: "/e/agent-jam" } })
    expect(onNavigate).toHaveBeenCalledWith("/e/agent-jam")
  })

  it("rejects unsafe project links before opening a review", async () => {
    const allTools = tools()
    await execute(allTools, "list_my_attendee_events", { offset: 0 })
    const wrongHost = await execute(allTools, "prepare_attendee_project", {
      eventRef: "attendee-1",
      title: "Unsafe",
      githubUrl: "https://example.com/not-github",
      liveAppUrl: "",
      demoVideoUrl: "",
      description: "Wrong repository host.",
    })
    const credentials = await execute(allTools, "prepare_attendee_project", {
      eventRef: "attendee-1",
      title: "Unsafe",
      githubUrl: "https://github.com/example/repo",
      liveAppUrl: "https://user:secret@example.com",
      demoVideoUrl: "",
      description: "Unsafe project URL.",
    })
    expect(wrongHost).toMatchObject({
      ok: false,
      error: { code: "invalid_github_url" },
    })
    expect(credentials).toMatchObject({
      ok: false,
      error: { code: "invalid_url" },
    })
    expect(prepareProject).not.toHaveBeenCalled()
  })

  it("fails closed for references that were not issued by a list tool", async () => {
    const result = await execute(tools(), "open_organized_event", {
      eventRef: "organized-1",
      destination: "overview",
    })
    expect(result).toMatchObject({ ok: false, error: { code: "item_changed" } })
    expect(onNavigate).not.toHaveBeenCalled()
  })
})
