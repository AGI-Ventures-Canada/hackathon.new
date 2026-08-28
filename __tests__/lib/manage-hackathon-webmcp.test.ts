import { beforeEach, describe, expect, it, mock } from "bun:test"
import {
  createManageHackathonTools,
  type ManageHackathonWebMcpContext,
} from "@/lib/webmcp/manage-hackathon-tools"
import type { WebMcpToolResult } from "@/lib/webmcp/types"
import type {
  ManageWebMcpCommittedChange,
  ManageWebMcpOptimisticChange,
} from "@/lib/webmcp/manage-optimistic-state"

const createdAt = "2026-08-25T15:00:00.000Z"

const baseContext: ManageHackathonWebMcpContext = {
  hackathon: {
    id: "11111111-1111-1111-1111-111111111111",
    slug: "build-day",
    name: "Build Day",
    description: "Make something useful.",
    locale: "fr",
    status: "draft",
    storedStatus: "draft",
    phase: null,
    eventVersion: "2026-08-25T15:00:00.000Z",
    startsAt: "2026-09-10T16:00:00.000Z",
    endsAt: "2026-09-11T23:00:00.000Z",
    registrationOpensAt: "2026-08-25T15:00:00.000Z",
    registrationClosesAt: "2026-09-10T16:00:00.000Z",
    rules: "Be kind.",
    bannerUrl: null,
    allowLateRegistration: false,
    maxParticipants: 500,
    locationType: "hybrid",
    locationName: "Main Hall",
    locationUrl: "https://example.com/room",
    minTeamSize: 1,
    maxTeamSize: 5,
    allowSolo: true,
    requireTeamApproval: false,
    anonymousJudging: false,
    judgingMode: "points",
    locationLatitude: null,
    locationLongitude: null,
    requireLocationVerification: false,
    communityUrl: null,
    communityLabel: null,
    requireTermsAcceptance: false,
    termsContent: null,
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
      id: "prize-1",
      name: "Best Demo",
      description: null,
      value: "$500",
      judgingStyle: "judges_pick",
      judgeCount: 3,
      totalAssignments: 12,
      completedAssignments: 5,
    },
  ],
  projects: [
    {
      title: "Safe streets",
      description: "Help people get home.",
      submitterName: "City Team",
    },
  ],
  sponsors: [{ name: "Acme", tier: "Gold" }],
  perks: [{ name: "Cloud credits", type: "code", released: false }],
  announcements: [
    {
      title: "Doors open",
      audience: "everyone",
      priority: "normal",
      publishedAt: null,
    },
  ],
}

const signal = new AbortController().signal
let context = structuredClone(baseContext)
let fetcher = mock(
  async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json({}),
)
let onOptimistic = mock((_change: ManageWebMcpOptimisticChange) => {})
let onCommitted = mock(
  (
    _optimistic: ManageWebMcpOptimisticChange,
    _committed: ManageWebMcpCommittedChange,
  ) => {},
)
let onReverted = mock(
  (_optimistic: ManageWebMcpOptimisticChange, _message: string) => {},
)
let onNavigate = mock(async (_href: string, _section: string) => true)
let onOpenTransition = mock((_status: string) => {})
let onEventVersionUpdated = mock((eventVersion: string) => {
  context.hackathon.eventVersion = eventVersion
})

function createTools() {
  return createManageHackathonTools({
    getContext: () => context,
    fetcher,
    onOptimistic,
    onCommitted,
    onReverted,
    onNavigate,
    onOpenTransition,
    onEventVersionUpdated,
  })
}

function getTool(tools: ReturnType<typeof createTools>, name: string) {
  const tool = tools.find((candidate) => candidate.name === name)
  if (!tool) throw new Error(`Missing tool: ${name}`)
  return tool
}

async function execute<T>(
  tools: ReturnType<typeof createTools>,
  name: string,
  input: Record<string, unknown> = {},
): Promise<WebMcpToolResult<T>> {
  return getTool(tools, name).execute(input, { signal }) as Promise<
    WebMcpToolResult<T>
  >
}

function dataOf<T>(result: WebMcpToolResult<T>): T {
  if (!result.ok) throw new Error(result.error.message)
  return result.data
}

beforeEach(() => {
  sessionStorage.clear()
  context = structuredClone(baseContext)
  fetcher = mock(
    async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json({}),
  )
  onOptimistic = mock((_change: ManageWebMcpOptimisticChange) => {})
  onCommitted = mock(
    (
      _optimistic: ManageWebMcpOptimisticChange,
      _committed: ManageWebMcpCommittedChange,
    ) => {},
  )
  onReverted = mock(
    (_optimistic: ManageWebMcpOptimisticChange, _message: string) => {},
  )
  onNavigate = mock(async (_href: string, _section: string) => true)
  onOpenTransition = mock((_status: string) => {})
  onEventVersionUpdated = mock((eventVersion: string) => {
    context.hackathon.eventVersion = eventVersion
  })
})

describe("createManageHackathonTools", () => {
  it("offers reads, draft-safe writes, a draft announcement, and go-live review", () => {
    expect(createTools().map((tool) => tool.name)).toEqual([
      "get_hackathon_overview",
      "get_organizer_page_support",
      "get_hackathon_settings",
      "inspect_organizer_section",
      "list_hackathon_schedule",
      "list_hackathon_challenges",
      "list_hackathon_prizes",
      "list_hackathon_projects",
      "list_hackathon_sponsors",
      "list_hackathon_perks",
      "list_hackathon_announcements",
      "open_hackathon_section",
      "update_hackathon_settings",
      "update_hackathon_details",
      "set_hackathon_timeline",
      "add_schedule_item",
      "add_challenge",
      "add_prize",
      "open_go_live_review",
      "prepare_sponsor",
      "draft_announcement",
    ])
  })

  it("uses lifecycle-specific tool sets", () => {
    context.hackathon.status = "published"
    expect(createTools().map((tool) => tool.name)).toEqual([
      "get_hackathon_overview",
      "get_organizer_page_support",
      "get_hackathon_settings",
      "inspect_organizer_section",
      "list_hackathon_schedule",
      "list_hackathon_challenges",
      "list_hackathon_prizes",
      "list_hackathon_projects",
      "list_hackathon_sponsors",
      "list_hackathon_perks",
      "list_hackathon_announcements",
      "open_hackathon_section",
      "update_hackathon_settings",
      "update_hackathon_details",
      "add_schedule_item",
      "prepare_sponsor",
      "draft_announcement",
    ])

    context.hackathon.status = "judging"
    expect(createTools().map((tool) => tool.name)).toContain(
      "open_publish_review",
    )

    context.hackathon.status = "archived"
    expect(createTools().map((tool) => tool.name)).toEqual([
      "get_hackathon_overview",
      "get_organizer_page_support",
      "get_hackathon_settings",
      "inspect_organizer_section",
      "list_hackathon_schedule",
      "list_hackathon_challenges",
      "list_hackathon_prizes",
      "list_hackathon_projects",
      "list_hackathon_sponsors",
      "list_hackathon_perks",
      "list_hackathon_announcements",
      "open_hackathon_section",
    ])
  })

  it("reads fresh context without rebuilding the registered tools", async () => {
    const tools = createTools()
    context.stats.attendeeCount = 30
    context.actionItems = []

    const overview = dataOf<{
      counts: { attendees: number }
      remainingTaskCount: number
    }>(await execute(tools, "get_hackathon_overview"))

    expect(overview.counts.attendees).toBe(30)
    expect(overview.remainingTaskCount).toBe(0)
  })

  it("bounds untrusted list output", async () => {
    context.scheduleItems = Array.from({ length: 25 }, (_, index) => ({
      title: `Item ${index}`,
      description: "x".repeat(500),
      startsAt: "2026-09-10T16:00:00.000Z",
      endsAt: null,
      location: null,
    }))

    const result = dataOf<{
      totalCount: number
      items: { description: string }[]
      truncated: boolean
    }>(await execute(createTools(), "list_hackathon_schedule"))

    expect(result.totalCount).toBe(25)
    expect(result.items).toHaveLength(2)
    expect(result.items[0].description.length).toBe(160)
    expect(result.truncated).toBe(true)
    expect(
      JSON.stringify({ ok: true, data: result }).length,
    ).toBeLessThanOrEqual(1_500)
  })

  it("keeps every organizer read result inside the shared output budget", async () => {
    context.hackathon.name = "n".repeat(1_000)
    context.hackathon.description = "d".repeat(5_000)
    context.hackathon.locationName = "l".repeat(1_000)
    context.actionItems = Array.from({ length: 20 }, () => ({
      label: "a".repeat(1_000),
      hint: "h".repeat(1_000),
      severity: "warning",
    }))
    context.challenges = Array.from({ length: 20 }, () => ({
      title: "c".repeat(1_000),
      description: "d".repeat(5_000),
      resourceCount: 20,
    }))
    context.prizes = Array.from({ length: 20 }, (_, index) => ({
      id: `prize-${index + 1}`,
      name: "p".repeat(1_000),
      description: "d".repeat(5_000),
      value: "v".repeat(1_000),
      judgingStyle: "judges_pick",
      judgeCount: 20,
      totalAssignments: 100,
      completedAssignments: 50,
    }))
    context.projects = Array.from({ length: 20 }, () => ({
      title: "p".repeat(1_000),
      description: "d".repeat(5_000),
      submitterName: "s".repeat(1_000),
    }))
    context.sponsors = Array.from({ length: 20 }, () => ({
      name: "s".repeat(1_000),
      tier: "t".repeat(1_000),
    }))
    context.perks = Array.from({ length: 20 }, () => ({
      name: "p".repeat(1_000),
      type: "code",
      released: false,
    }))
    context.announcements = Array.from({ length: 20 }, () => ({
      title: "a".repeat(1_000),
      audience: "everyone",
      priority: "normal",
      publishedAt: null,
    }))

    const tools = createTools()
    for (const name of [
      "get_hackathon_overview",
      "list_hackathon_schedule",
      "list_hackathon_challenges",
      "list_hackathon_prizes",
      "list_hackathon_projects",
      "list_hackathon_sponsors",
      "list_hackathon_perks",
      "list_hackathon_announcements",
    ]) {
      const result = await execute(tools, name)
      expect(result.ok).toBe(true)
      expect(JSON.stringify(result).length).toBeLessThanOrEqual(1_500)
    }
  })

  it("uses aggregate data for perk and fulfillment sections", async () => {
    const tools = createTools()

    const perks = dataOf<{ pageData: { perkCount: number; releasedCount: number } }>(
      await execute(tools, "inspect_organizer_section", {
        section: "perks",
        offset: 0,
        limit: 20,
      }),
    )
    const fulfillment = dataOf<{ pageData: { eventStatus: string } }>(
      await execute(tools, "inspect_organizer_section", {
        section: "fulfillment",
        offset: 0,
        limit: 20,
      }),
    )

    expect(perks.pageData).toEqual({ perkCount: 1, releasedCount: 0 })
    expect(fulfillment.pageData.eventStatus).toBe("draft")
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("opens organizer sections without changing data", async () => {
    const result = dataOf<{ opened: string; url: string }>(
      await execute(createTools(), "open_hackathon_section", {
        section: "results",
      }),
    )
    expect(onNavigate).toHaveBeenCalledWith(
      "/e/build-day/manage?tab=judging&jtab=results",
      "results",
    )
    expect(result.opened).toBe("results")
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("describes WebMCP and CLI support for every organizer page", async () => {
    const result = dataOf<{
      section: string
      webMcpTools: string[]
      cliCommands: string[]
      inspectUrl: string
    }>(await execute(createTools(), "get_organizer_page_support", {
      section: "rooms",
    }))

    expect(result).toEqual({
      section: "rooms",
      title: "Rooms",
      summary: "Review room assignments and automatic room setup.",
      eventStatus: "draft",
      webMcpTools: ["inspect_organizer_section", "open_hackathon_section"],
      unavailableWebMcpTools: [],
      cliCommands: [
        "rooms auto-assign-get",
        "rooms auto-assign-set",
        "rooms auto-assign-sync",
      ],
      cliCoverage: "available",
      pageData: { eventStatus: "draft" },
      inspectUrl: "/e/build-day/manage?tab=miscs&mtab=rooms",
    })
  })

  it("reports lifecycle-limited page tools as unavailable", async () => {
    context.hackathon.status = "archived"
    context.hackathon.storedStatus = "archived"
    const result = dataOf<{
      webMcpTools: string[]
      unavailableWebMcpTools: string[]
    }>(await execute(createTools(), "get_organizer_page_support", {
      section: "prizes",
    }))

    expect(result.webMcpTools).toEqual([
      "list_hackathon_prizes",
      "inspect_organizer_section",
      "open_hackathon_section",
    ])
    expect(result.unavailableWebMcpTools).toEqual(["add_prize"])
  })

  it("returns a structured input error", async () => {
    const result = await execute(createTools(), "open_hackathon_section", {
      section: "billing",
    })
    expect(result).toEqual({
      ok: false,
      error: {
        code: "invalid_input",
        message: expect.any(String),
        retryable: false,
      },
    })
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it("updates draft details with lifecycle headers and visible optimistic state", async () => {
    const order: string[] = []
    onOptimistic = mock(() => order.push("optimistic"))
    onCommitted = mock(() => order.push("committed"))
    fetcher = mock(async () => {
      order.push("fetch")
      return Response.json({
        name: "Journée Build",
        slug: "build-day",
        description: "Créez quelque chose.",
        status: "draft",
      })
    })

    const result = await execute<{
      updated: { name: string }
      inspectUrl: string
    }>(createTools(), "update_hackathon_details", {
      name: "Journée Build",
      description: "Créez quelque chose.",
    })

    expect(result.ok).toBe(true)
    expect(order).toEqual(["optimistic", "fetch", "committed"])
    const [url, init] = fetcher.mock.calls[0]
    expect(url).toBe(
      "/api/dashboard/hackathons/11111111-1111-1111-1111-111111111111/settings",
    )
    expect(init?.headers).toMatchObject({
      "x-webmcp-request": "1",
      "x-webmcp-expected-status": "draft",
      "x-webmcp-event-version": "2026-08-25T15:00:00.000Z",
      "x-webmcp-idempotency-key": expect.stringMatching(/^[0-9a-f-]{36}$/),
    })
    expect(JSON.parse(String(init?.body))).toEqual({
      name: "Journée Build",
      description: "Créez quelque chose.",
      locale: "fr",
    })
  })

  it("sends the page's effective status for server lifecycle guards", async () => {
    context.hackathon.status = "active"
    context.hackathon.storedStatus = "published"
    fetcher = mock(async () =>
      Response.json({
        name: "Active Build Day",
        slug: "build-day",
        description: "Make something useful.",
        status: "published",
      }),
    )

    const result = await execute(createTools(), "update_hackathon_details", {
      name: "Active Build Day",
    })

    expect(result.ok).toBe(true)
    expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({
      "x-webmcp-expected-status": "active",
    })
  })

  it("sends every mutation kind to its visible review surface", async () => {
    fetcher = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<
        string,
        unknown
      >
      if (url.endsWith("/settings") && body.startsAt) {
        return Response.json({
          name: "Build Day",
          startsAt: body.startsAt,
          endsAt: body.endsAt,
        })
      }
      if (url.endsWith("/settings")) {
        return Response.json({
          name: body.name ?? "Build Day",
          slug: "build-day",
          description: body.description ?? "Make something useful.",
          status: "draft",
        })
      }
      if (url.endsWith("/schedule")) {
        return Response.json({
          id: "schedule-saved",
          hackathon_id: baseContext.hackathon.id,
          title: body.title,
          description: null,
          starts_at: body.startsAt,
          ends_at: null,
          location: null,
          sort_order: 1,
          trigger_type: null,
          linked_to: null,
          created_at: createdAt,
          updated_at: createdAt,
        })
      }
      if (url.endsWith("/challenges")) {
        return Response.json({
          challenge: {
            id: "challenge-saved",
            hackathonId: baseContext.hackathon.id,
            title: body.title,
            description: null,
            resources: [],
            sortOrder: 1,
            createdAt,
            updatedAt: createdAt,
          },
        })
      }
      if (url.endsWith("/prizes")) {
        return Response.json({
          prize: {
            id: "prize-saved",
            hackathon_id: baseContext.hackathon.id,
            name: body.name,
            description: null,
            value: null,
            type: "favorite",
            rank: null,
            kind: "prize",
            monetary_value: null,
            currency: null,
            distribution_method: null,
            display_value: null,
            criteria_id: null,
            prize_track_id: null,
            judging_style: "judges_pick",
            round_id: null,
            assignment_mode: "organizer_assigned",
            max_picks: 3,
            is_screening: false,
            allowed_team_modes: null,
            display_order: 1,
            created_at: createdAt,
            updated_at: createdAt,
          },
        })
      }
      return Response.json({
        id: "announcement-saved",
        hackathon_id: baseContext.hackathon.id,
        title: body.title,
        body: body.body,
        priority: "normal",
        audience: "everyone",
        published_at: null,
        created_at: createdAt,
        updated_at: createdAt,
      })
    })
    const tools = createTools()

    await execute(tools, "update_hackathon_details", { name: "Agent event" })
    await execute(tools, "set_hackathon_timeline", {
      startsAt: "2026-09-12T16:00:00.000Z",
      endsAt: "2026-09-13T16:00:00.000Z",
    })
    await execute(tools, "add_schedule_item", {
      title: "Lunch",
      startsAt: "2026-09-12T18:00:00.000Z",
    })
    await execute(tools, "add_challenge", { title: "City helper" })
    await execute(tools, "add_prize", { name: "Best demo" })
    await execute(tools, "draft_announcement", {
      title: "Doors open",
      body: "Meet in the main hall.",
    })

    expect(
      onOptimistic.mock.calls.map(([change]) => [change.kind, change.href]),
    ).toEqual([
      ["details", "/e/build-day/manage?tab=edit"],
      ["timeline", "/e/build-day/manage?tab=overview"],
      ["schedule", "/e/build-day/manage?tab=overview"],
      ["challenge", "/e/build-day/manage?tab=challenges"],
      ["prize", "/e/build-day/manage?tab=judging&jtab=prizes"],
      ["announcement", "/e/build-day/manage?tab=event"],
    ])
    expect(
      onCommitted.mock.calls.map(([, change]) => change.kind),
    ).toEqual([
      "details",
      "timeline",
      "schedule",
      "challenge",
      "prize",
      "announcement",
    ])
  })

  it("rejects non-RFC3339 timelines before fetching", async () => {
    const result = await execute(createTools(), "set_hackathon_timeline", {
      startsAt: "September 10, 2026",
      endsAt: "September 11, 2026",
    })
    expect(result).toMatchObject({
      ok: false,
      error: { code: "invalid_input", retryable: false },
    })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("maps the settings API timeline response without raw timestamps", async () => {
    fetcher = mock(async () =>
      Response.json({
        name: "Build Day",
        startsAt: "2026-09-12T16:00:00.000Z",
        endsAt: "2026-09-13T16:00:00.000Z",
      }),
    )

    const result = dataOf<{
      updated: { startsAt: string; endsAt: string }
    }>(
      await execute(createTools(), "set_hackathon_timeline", {
        startsAt: "2026-09-12T16:00:00.000Z",
        endsAt: "2026-09-13T16:00:00.000Z",
      }),
    )

    expect(result.updated).toMatchObject({
      startsAt: "2026-09-12T16:00:00.000Z",
      endsAt: "2026-09-13T16:00:00.000Z",
    })
    expect(result.updated).not.toHaveProperty("starts_at")
  })

  it("adopts the server version before a consecutive settings write", async () => {
    const nextVersion = "2026-08-25T15:01:00.000Z"
    const newestVersion = "2026-08-25T15:02:00.000Z"
    let requestCount = 0
    fetcher = mock(async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>
      requestCount += 1
      if (body.name) {
        return Response.json({
          name: body.name,
          slug: "build-day",
          description: "Make something useful.",
          status: "draft",
          updatedAt: requestCount === 1
            ? nextVersion
            : "2026-08-25T15:03:00.000Z",
        })
      }
      return Response.json({
        name: "Agent event",
        startsAt: body.startsAt,
        endsAt: body.endsAt,
        updatedAt: newestVersion,
      })
    })
    const tools = createManageHackathonTools({
      getContext: () => context,
      fetcher,
      onOptimistic,
      onCommitted,
      onReverted,
      onNavigate,
      onOpenTransition,
    })

    await execute(tools, "update_hackathon_details", { name: "Agent event" })
    await execute(tools, "set_hackathon_timeline", {
      startsAt: "2026-09-12T16:00:00.000Z",
      endsAt: "2026-09-13T16:00:00.000Z",
    })
    context.hackathon.eventVersion = nextVersion
    await execute(tools, "update_hackathon_details", { name: "Still current" })

    const firstHeaders = fetcher.mock.calls[0][1]?.headers as Record<string, string>
    const secondHeaders = fetcher.mock.calls[1][1]?.headers as Record<string, string>
    const thirdHeaders = fetcher.mock.calls[2][1]?.headers as Record<string, string>
    expect(firstHeaders["x-webmcp-event-version"]).toBe(baseContext.hackathon.eventVersion)
    expect(secondHeaders["x-webmcp-event-version"]).toBe(nextVersion)
    expect(thirdHeaders["x-webmcp-event-version"]).toBe(newestVersion)
    expect(context.hackathon.eventVersion).toBe(nextVersion)
  })

  it("rejects a schedule item ending before it starts", async () => {
    const result = await execute(createTools(), "add_schedule_item", {
      title: "Backwards",
      startsAt: "2026-09-10T20:00:00.000Z",
      endsAt: "2026-09-10T19:00:00.000Z",
    })
    expect(result).toMatchObject({
      ok: false,
      error: { code: "invalid_input" },
    })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("returns the committed schedule item when native execution retries", async () => {
    fetcher = mock(async (_input, init) => {
      const headers = init?.headers as Record<string, string>
      return Response.json({
        id: headers["x-webmcp-idempotency-key"],
        hackathon_id: context.hackathon.id,
        title: "Lunch",
        description: null,
        starts_at: "2026-09-10T19:00:00.000Z",
        ends_at: null,
        location: null,
        sort_order: 0,
        trigger_type: null,
        linked_to: null,
        created_at: "2026-08-26T00:00:00.000Z",
        updated_at: "2026-08-26T00:00:00.000Z",
      })
    })
    const tools = createTools()
    const input = { title: "Lunch", startsAt: "2026-09-10T19:00:00.000Z" }

    const first = await execute(tools, "add_schedule_item", input)
    const retry = await execute(tools, "add_schedule_item", input)

    expect(first).toEqual(retry)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it("commits a retried mutation with its original mutation id", async () => {
    let attempt = 0
    fetcher = mock(async (_input, init) => {
      attempt += 1
      if (attempt === 1) throw new TypeError("connection lost")
      const headers = init?.headers as Record<string, string>
      return Response.json({
        id: headers["x-webmcp-idempotency-key"],
        hackathon_id: context.hackathon.id,
        title: "Lunch",
        description: null,
        starts_at: "2026-09-10T19:00:00.000Z",
        ends_at: null,
        location: null,
        sort_order: 0,
        trigger_type: null,
        linked_to: null,
        created_at: "2026-08-26T00:00:00.000Z",
        updated_at: "2026-08-26T00:00:00.000Z",
      })
    })
    const tools = createTools()
    const input = { title: "Lunch", startsAt: "2026-09-10T19:00:00.000Z" }

    expect(await execute(tools, "add_schedule_item", input)).toMatchObject({ ok: false })
    expect(await execute(tools, "add_schedule_item", input)).toMatchObject({ ok: true })

    const [optimistic, committed] = onCommitted.mock.calls[0]
    expect(committed.mutationId).toBe(optimistic.mutationId)
    expect(onOptimistic.mock.calls[0][0].mutationId).toBe(
      onOptimistic.mock.calls[1][0].mutationId,
    )
  })

  it("adds an ordinary schedule item and passes the abort signal", async () => {
    fetcher = mock(async () =>
      Response.json({
        title: "Lunch",
        description: null,
        starts_at: "2026-09-10T19:00:00.000Z",
        ends_at: "2026-09-10T20:00:00.000Z",
        location: "Cafe",
      }),
    )

    const result = dataOf<{ scheduleItem: { title: string } }>(
      await execute(createTools(), "add_schedule_item", {
        title: "Lunch",
        startsAt: "2026-09-10T19:00:00.000Z",
        endsAt: "2026-09-10T20:00:00.000Z",
      }),
    )
    expect(result.scheduleItem.title).toBe("Lunch")
    expect(fetcher.mock.calls[0][1]?.signal).toBe(signal)
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).not.toHaveProperty(
      "triggerType",
    )
  })

  it("blocks a stale draft tool before the request", async () => {
    const tools = createTools()
    context.hackathon.status = "published"
    const result = await execute(tools, "add_challenge", { title: "Blocked" })
    expect(result).toMatchObject({
      ok: false,
      error: { code: "event_changed", retryable: true },
    })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("blocks a stale pre-completion tool before the request", async () => {
    context.hackathon.status = "published"
    const tools = createTools()
    context.hackathon.status = "completed"

    const result = await execute(tools, "update_hackathon_details", {
      name: "Too late",
    })

    expect(result).toEqual({
      ok: false,
      error: {
        code: "event_changed",
        message: "The event changed. Refresh the page before trying again.",
        retryable: true,
      },
    })
    expect(fetcher).not.toHaveBeenCalled()
    expect(onOptimistic).not.toHaveBeenCalled()
  })

  it("returns server lifecycle conflicts and rolls back the notice", async () => {
    fetcher = mock(async () =>
      Response.json(
        { error: "The event changed.", code: "event_changed" },
        { status: 409 },
      ),
    )
    const result = await execute(createTools(), "add_challenge", {
      title: "Blocked",
    })
    expect(result).toEqual({
      ok: false,
      error: {
        code: "event_changed",
        message: "The event changed.",
        retryable: true,
      },
    })
    expect(onReverted).toHaveBeenCalledTimes(1)
    expect(onCommitted).not.toHaveBeenCalled()
  })

  it("uses a safe rollback message when a network failure has no tool error", async () => {
    fetcher = mock(async () => {
      throw new TypeError("socket details must stay private")
    })

    const result = await execute(createTools(), "add_schedule_item", {
      title: "Lunch",
      startsAt: "2026-09-10T19:00:00.000Z",
    })

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "unexpected_error",
        message: "Something went wrong. Please try again.",
        retryable: true,
      },
    })
    expect(onReverted).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "schedule" }),
      "We couldn't save that change. Review the page and try again.",
    )
    expect(onCommitted).not.toHaveBeenCalled()
  })

  it("opens go-live review without sending a request", async () => {
    const result = await execute(createTools(), "open_go_live_review")
    expect(result).toMatchObject({
      ok: true,
      requiresHumanAction: true,
      data: { status: "review_opened" },
    })
    expect(onOpenTransition).toHaveBeenCalledWith("published")
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("saves announcement drafts without publishing them", async () => {
    fetcher = mock(async () =>
      Response.json({
        title: "Doors open",
        body: "Come to the main hall.",
        priority: "normal",
        audience: "everyone",
        published_at: null,
      }),
    )
    const result = await execute(createTools(), "draft_announcement", {
      title: "Doors open",
      body: "Come to the main hall.",
    })
    expect(result).toMatchObject({
      ok: true,
      requiresHumanAction: true,
      data: { announcement: { published: false } },
    })
    expect(fetcher.mock.calls[0][0]).toBe(
      "/api/dashboard/hackathons/11111111-1111-1111-1111-111111111111/announcements",
    )
  })

  it("blocks a captured announcement tool after the event is archived", async () => {
    context.hackathon.status = "published"
    const tools = createTools()
    context.hackathon.status = "archived"

    const result = await execute(tools, "draft_announcement", {
      title: "Too late",
      body: "This must stay unsent.",
    })

    expect(result).toEqual({
      ok: false,
      error: {
        code: "event_changed",
        message: "Archived events can't add announcement drafts.",
        retryable: false,
      },
    })
    expect(fetcher).not.toHaveBeenCalled()
    expect(onOptimistic).not.toHaveBeenCalled()
  })

  it("opens publish review without making a request", async () => {
    context.hackathon.status = "judging"

    const result = await execute(createTools(), "open_publish_review")

    expect(result).toEqual({
      ok: true,
      data: {
        status: "review_opened",
        url: "/e/build-day/manage?tab=judging&jtab=results",
      },
      requiresHumanAction: true,
    })
    expect(onNavigate).toHaveBeenCalledWith(
      "/e/build-day/manage?tab=judging&jtab=results",
      "results",
    )
    expect(fetcher).not.toHaveBeenCalled()
  })
})
