import { beforeEach, describe, expect, it, mock } from "bun:test"
import {
  createManageHackathonTools,
  type ManageHackathonWebMcpContext,
} from "@/lib/webmcp/manage-hackathon-tools"

const context: ManageHackathonWebMcpContext = {
  hackathon: {
    id: "hackathon-1",
    slug: "build-day",
    name: "Build Day",
    description: "Make something useful.",
    locale: "fr",
    status: "draft",
    phase: null,
    startsAt: "2026-09-10T16:00:00.000Z",
    endsAt: "2026-09-11T23:00:00.000Z",
    registrationClosesAt: "2026-09-10T16:00:00.000Z",
    locationType: "hybrid",
    locationName: "Main Hall",
    locationUrl: "https://example.com/room",
    minTeamSize: 1,
    maxTeamSize: 5,
    allowSolo: true,
    requireTeamApproval: false,
  },
  stats: {
    attendeeCount: 24,
    teamCount: 6,
    pendingTeamApprovalCount: 1,
    projectCount: 4,
    judgeCount: 3,
    prizeCount: 1,
    judgingAssignments: 12,
    completedJudgingAssignments: 5,
  },
  actionItems: [
    {
      label: "Tell people about your event",
      hint: "Add a short description.",
      severity: "warning",
    },
  ],
  scheduleItems: [
    {
      title: "Opening",
      description: null,
      startsAt: "2026-09-10T16:00:00.000Z",
      endsAt: "2026-09-10T16:30:00.000Z",
      location: "Main Hall",
    },
  ],
  challenges: [
    {
      title: "Help your city",
      description: "Build for a local need.",
      resourceCount: 2,
    },
  ],
  prizes: [
    {
      name: "Best Demo",
      description: null,
      value: "$500",
      judgingStyle: "judges_pick",
      judgeCount: 3,
      totalAssignments: 12,
      completedAssignments: 5,
    },
  ],
}

const signal = new AbortController().signal
let fetcher = mock(
  async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json({}),
)
let onChanged = mock((_href: string) => {})
let onNavigate = mock((_href: string) => {})

function createTools(overrides?: Partial<ManageHackathonWebMcpContext>) {
  return createManageHackathonTools({
    context: { ...context, ...overrides },
    fetcher,
    onChanged,
    onNavigate,
  })
}

function getTool(
  tools: ReturnType<typeof createTools>,
  name: string,
) {
  const tool = tools.find((candidate) => candidate.name === name)
  if (!tool) throw new Error(`Missing tool: ${name}`)
  return tool
}

beforeEach(() => {
  fetcher = mock(
    async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json({}),
  )
  onChanged = mock((_href: string) => {})
  onNavigate = mock((_href: string) => {})
})

describe("createManageHackathonTools", () => {
  it("offers reads and draft-safe writes for a draft", () => {
    const tools = createTools()
    expect(tools.map((tool) => tool.name)).toEqual([
      "get_hackathon_overview",
      "list_hackathon_schedule",
      "list_hackathon_challenges",
      "list_hackathon_prizes",
      "open_hackathon_section",
      "update_hackathon_details",
      "set_hackathon_timeline",
      "add_schedule_item",
      "add_challenge",
      "add_prize",
    ])
    expect(getTool(tools, "get_hackathon_overview").annotations).toEqual({
      readOnlyHint: true,
      untrustedContentHint: true,
    })
    expect(getTool(tools, "add_challenge").annotations).toEqual({
      untrustedContentHint: true,
    })
  })

  it("removes every write tool after the draft goes live", () => {
    const tools = createTools({
      hackathon: { ...context.hackathon, status: "published" },
    })

    expect(tools.map((tool) => tool.name)).toEqual([
      "get_hackathon_overview",
      "list_hackathon_schedule",
      "list_hackathon_challenges",
      "list_hackathon_prizes",
      "open_hackathon_section",
    ])
  })

  it("returns the current overview and inspect links", async () => {
    const tools = createTools()
    const overview = await getTool(tools, "get_hackathon_overview").execute(
      {},
      { signal },
    )
    const schedule = await getTool(tools, "list_hackathon_schedule").execute(
      {},
      { signal },
    )
    const challenges = await getTool(
      tools,
      "list_hackathon_challenges",
    ).execute({}, { signal })
    const prizes = await getTool(tools, "list_hackathon_prizes").execute(
      {},
      { signal },
    )

    expect(overview).toMatchObject({
      hackathon: { name: "Build Day" },
      stats: { attendeeCount: 24 },
      remainingActionItems: [{ label: "Tell people about your event" }],
      eventUrl: "/e/build-day",
    })
    expect(overview).not.toHaveProperty("hackathon.id")
    expect(schedule).not.toHaveProperty("scheduleItems.0.id")
    expect(challenges).not.toHaveProperty("challenges.0.id")
    expect(prizes).not.toHaveProperty("prizes.0.id")
    expect(schedule).toMatchObject({ count: 1, inspectUrl: "/e/build-day/manage?tab=overview" })
    expect(challenges).toMatchObject({ count: 1, inspectUrl: "/e/build-day/manage?tab=challenges" })
    expect(prizes).toMatchObject({ count: 1, inspectUrl: "/e/build-day/manage?tab=judging&jtab=prizes" })
  })

  it("opens a requested organizer section", async () => {
    const result = await getTool(
      createTools(),
      "open_hackathon_section",
    ).execute({ section: "judging" }, { signal })

    expect(onNavigate).toHaveBeenCalledWith(
      "/e/build-day/manage?tab=judging",
    )
    expect(result).toEqual({
      opened: "judging",
      url: "/e/build-day/manage?tab=judging",
    })
  })

  it("rejects an unknown organizer section", async () => {
    await expect(
      getTool(createTools(), "open_hackathon_section").execute(
        { section: "billing" },
        { signal },
      ),
    ).rejects.toThrow()
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it("updates translated draft details through the existing settings API", async () => {
    fetcher = mock(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        Response.json({
        id: "hackathon-1",
        name: "Journée Build",
        slug: "build-day",
        description: "Créez quelque chose.",
        status: "draft",
        }),
    )

    const result = await getTool(
      createTools(),
      "update_hackathon_details",
    ).execute(
      { name: "Journée Build", description: "Créez quelque chose." },
      { signal },
    )

    expect(fetcher).toHaveBeenCalledTimes(1)
    const [url, init] = fetcher.mock.calls[0]
    expect(url).toBe("/api/dashboard/hackathons/hackathon-1/settings")
    expect(init?.method).toBe("PATCH")
    expect(init?.signal).toBe(signal)
    expect(JSON.parse(String(init?.body))).toEqual({
      name: "Journée Build",
      description: "Créez quelque chose.",
      locale: "fr",
    })
    expect(onChanged).toHaveBeenCalledWith(
      "/e/build-day/manage?tab=edit",
    )
    expect(result).toMatchObject({
      updated: { name: "Journée Build" },
      inspectUrl: "/e/build-day/manage?tab=edit",
    })
    expect(result).not.toHaveProperty("updated.id")
  })

  it("requires at least one detail to update", async () => {
    await expect(
      getTool(createTools(), "update_hackathon_details").execute(
        {},
        { signal },
      ),
    ).rejects.toThrow("Add a name or description")
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("sets a valid timeline and rejects an end before the start", async () => {
    fetcher = mock(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        Response.json({
        id: "hackathon-1",
        name: "Build Day",
        startsAt: "2026-10-01T16:00:00.000Z",
        endsAt: "2026-10-02T23:00:00.000Z",
        registrationClosesAt: "2026-10-01T16:00:00.000Z",
        }),
    )
    const tool = getTool(createTools(), "set_hackathon_timeline")

    await expect(
      tool.execute(
        {
          startsAt: "2026-10-02T16:00:00.000Z",
          endsAt: "2026-10-01T16:00:00.000Z",
        },
        { signal },
      ),
    ).rejects.toThrow("The end must be after the start")

    await tool.execute(
      {
        startsAt: "2026-10-01T16:00:00.000Z",
        endsAt: "2026-10-02T23:00:00.000Z",
      },
      { signal },
    )

    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(onChanged).toHaveBeenCalledWith(
      "/e/build-day/manage?tab=overview",
    )
  })

  it("adds an ordinary schedule item", async () => {
    fetcher = mock(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        Response.json({
        id: "schedule-2",
        title: "Lunch",
        description: null,
        starts_at: "2026-09-10T19:00:00.000Z",
        ends_at: "2026-09-10T20:00:00.000Z",
        location: "Cafe",
        }),
    )

    const result = await getTool(createTools(), "add_schedule_item").execute(
      {
        title: "Lunch",
        startsAt: "2026-09-10T19:00:00.000Z",
        endsAt: "2026-09-10T20:00:00.000Z",
        location: "Cafe",
      },
      { signal },
    )

    const [url, init] = fetcher.mock.calls[0]
    expect(url).toBe("/api/dashboard/hackathons/hackathon-1/schedule")
    expect(init?.method).toBe("POST")
    expect(JSON.parse(String(init?.body))).not.toHaveProperty("triggerType")
    expect(result).toMatchObject({ scheduleItem: { title: "Lunch" } })
  })

  it("rejects a schedule item whose end is before its start", async () => {
    await expect(
      getTool(createTools(), "add_schedule_item").execute(
        {
          title: "Backwards",
          startsAt: "2026-09-10T20:00:00.000Z",
          endsAt: "2026-09-10T19:00:00.000Z",
        },
        { signal },
      ),
    ).rejects.toThrow("The end must be after the start")
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("adds a challenge without releasing it", async () => {
    fetcher = mock(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        Response.json({
        challenge: {
          id: "challenge-2",
          title: "Make transit easier",
          description: null,
        },
        }),
    )

    const result = await getTool(createTools(), "add_challenge").execute(
      { title: "Make transit easier" },
      { signal },
    )

    const [url, init] = fetcher.mock.calls[0]
    expect(url).toBe("/api/dashboard/hackathons/hackathon-1/challenges")
    expect(init?.method).toBe("POST")
    expect(result).toMatchObject({
      challenge: { title: "Make transit easier" },
      inspectUrl: "/e/build-day/manage?tab=challenges",
    })
  })

  it("adds a judges-pick prize by default", async () => {
    fetcher = mock(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        Response.json({
        prize: {
          id: "prize-2",
          name: "People's Choice",
          description: null,
          value: null,
          judging_style: "judges_pick",
        },
        }),
    )

    await getTool(createTools(), "add_prize").execute(
      { name: "People's Choice" },
      { signal },
    )

    const [url, init] = fetcher.mock.calls[0]
    expect(url).toBe("/api/dashboard/hackathons/hackathon-1/prizes")
    expect(JSON.parse(String(init?.body))).toEqual({
      name: "People's Choice",
      judgingStyle: "judges_pick",
    })
    expect(onChanged).toHaveBeenCalledWith(
      "/e/build-day/manage?tab=judging&jtab=prizes",
    )
  })

  it("returns the API error and leaves the page in place", async () => {
    fetcher = mock(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        Response.json({ error: "Not authorized" }, { status: 403 }),
    )

    await expect(
      getTool(createTools(), "add_challenge").execute(
        { title: "Blocked" },
        { signal },
      ),
    ).rejects.toThrow("Not authorized")
    expect(onChanged).not.toHaveBeenCalled()
  })
})
