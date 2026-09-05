import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import type { ManageHackathonWebMcpContext } from "@/lib/webmcp/manage-hackathon-tools"
import type { WebMcpTool } from "@/lib/webmcp/types"
import {
  PREPARE_SPONSOR_EVENT,
  type PrepareSponsorEvent,
} from "@/lib/webmcp/client-events"

const beginManageWebMcpChange = mock(() => {})
const commitManageWebMcpChange = mock(() => {})
const rollbackManageWebMcpChange = mock(() => {})
const triggerTransition = mock(() => {})
const handleActionClick = mock(() => {})
const openRegisteredAction = mock(() => true)

const actionItemsState = {
  triggerTransition,
  handleActionClick,
  openRegisteredAction,
  hackathonStatus: "draft" as const,
  activeItems: [
    {
      id: "finish-scoring-setup",
      label: "Add judges",
      hint: "Pick who will review projects.",
      severity: "warning" as const,
      tab: "judging",
      action: "open-judge-dialog",
    },
  ],
  manageWebMcpView: {
    details: { name: "Visible event", description: "Visible details" },
    timeline: {
      startsAt: "2026-09-10T16:00:00.000Z",
      endsAt: "2026-09-11T23:00:00.000Z",
    },
    scheduleItems: [
      {
        id: "schedule-1",
        hackathon_id: "11111111-1111-1111-1111-111111111111",
        title: "Visible opening",
        description: null,
        starts_at: "2026-09-10T16:00:00.000Z",
        ends_at: null,
        location: "Main Hall",
        sort_order: 0,
        trigger_type: null,
        linked_to: null,
        created_at: "2026-08-25T15:00:00.000Z",
        updated_at: "2026-08-25T15:00:00.000Z",
      },
    ],
    challenges: [
      {
        id: "challenge-1",
        hackathonId: "11111111-1111-1111-1111-111111111111",
        title: "Visible challenge",
        description: null,
        resources: [{ title: "Guide", url: "https://example.com" }],
        sortOrder: 0,
        createdAt: "2026-08-25T15:00:00.000Z",
        updatedAt: "2026-08-25T15:00:00.000Z",
      },
    ],
    prizes: [
      {
        id: "prize-1",
        hackathon_id: "11111111-1111-1111-1111-111111111111",
        name: "Visible prize",
        description: null,
        value: "$500",
        judging_style: "judges_pick" as const,
      },
    ],
    announcements: [],
  },
  beginManageWebMcpChange,
  commitManageWebMcpChange,
  rollbackManageWebMcpChange,
}

mock.module("@/components/hackathon/manage/action-items-context", () => ({
  useActionItems: () => actionItemsState,
}))

const { ManageHackathonWebMcpTools } = await import(
  "@/components/hackathon/manage/manage-webmcp-tools"
)

const context: ManageHackathonWebMcpContext = {
  hackathon: {
    id: "11111111-1111-1111-1111-111111111111",
    slug: "build-day",
    name: "Server event",
    description: "Server details",
    locale: "en",
    status: "draft",
    storedStatus: "draft",
    phase: null,
    eventVersion: "2026-08-25T15:00:00.000Z",
    startsAt: null,
    endsAt: null,
    registrationOpensAt: null,
    registrationClosesAt: null,
    rules: null,
    bannerUrl: null,
    allowLateRegistration: false,
    maxParticipants: null,
    locationType: "hybrid",
    locationName: "Main Hall",
    locationUrl: null,
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
    attendeeCount: 10,
    teamCount: 2,
    pendingTeamApprovalCount: 0,
    projectCount: 1,
    judgeCount: 2,
    prizeCount: 0,
    judgingAssignments: 2,
    completedJudgingAssignments: 0,
  },
  actionItems: [],
  scheduleItems: [],
  challenges: [],
  prizes: [
    {
      id: "prize-server-1",
      name: "Server prize",
      description: null,
      value: null,
      judgingStyle: "judges_pick",
      judgeCount: 3,
      totalAssignments: 6,
      completedAssignments: 1,
    },
  ],
  projects: [],
  sponsors: [],
  perks: [],
  announcements: [],
}

const originalFetch = globalThis.fetch
let tools = new Map<string, WebMcpTool>()
let registrationSignals = new Map<string, AbortSignal | undefined>()

function getTool(name: string) {
  const tool = tools.get(name)
  if (!tool) throw new Error(`Missing tool ${name}`)
  return tool
}

async function execute(name: string, input: Record<string, unknown> = {}) {
  let result: unknown
  await act(async () => {
    result = await getTool(name).execute(input, {
      signal: new AbortController().signal,
    })
  })
  return result
}

beforeEach(() => {
  tools = new Map()
  registrationSignals = new Map()
  beginManageWebMcpChange.mockClear()
  commitManageWebMcpChange.mockClear()
  rollbackManageWebMcpChange.mockClear()
  triggerTransition.mockClear()
  const navigation = globalThis as typeof globalThis & {
    __nextNavState: {
      router: {
        push: ReturnType<typeof mock>
        refresh: ReturnType<typeof mock>
      }
    }
  }
  navigation.__nextNavState.router.push.mockClear()
  navigation.__nextNavState.router.refresh.mockClear()
  document.modelContext = {
    registerTool: mock(async (tool, options) => {
      tools.set(tool.name, tool)
      registrationSignals.set(tool.name, options?.signal)
    }),
  }
  globalThis.fetch = mock(async () =>
    Response.json({
      name: "Agent event",
      slug: "build-day",
      description: "Visible details",
      status: "draft",
    }),
  ) as unknown as typeof fetch
})

afterEach(() => {
  cleanup()
  delete document.modelContext
  globalThis.fetch = originalFetch
})

describe("ManageHackathonWebMcpTools", () => {
  it("keeps native tool registrations alive when action items change", async () => {
    const view = render(<ManageHackathonWebMcpTools context={context} />)
    await waitFor(() => expect(tools.has("add_sponsor")).toBe(true))
    const original = getTool("add_sponsor")
    const signal = registrationSignals.get("add_sponsor")
    const initialItems = actionItemsState.activeItems
    actionItemsState.activeItems = [{ ...initialItems[0], id: "new-task" }]
    view.rerender(<ManageHackathonWebMcpTools context={{ ...context }} />)
    expect(getTool("add_sponsor")).toBe(original)
    expect(signal?.aborted).toBe(false)
    expect(await execute("open_organizer_task", { taskRef: "new-task" })).toMatchObject({ ok: true, data: { status: "opened" } })
    actionItemsState.activeItems = initialItems
    view.unmount()
    expect(signal?.aborted).toBe(true)
  })

  it("registers tools against visible optimistic state and converges after a save", async () => {
    render(<ManageHackathonWebMcpTools context={context} />)
    await waitFor(() => expect(tools.has("update_hackathon_details")).toBe(true))

    const overview = await execute("get_hackathon_overview")
    expect(overview).toMatchObject({
      ok: true,
      data: {
        event: {
          name: "Visible event",
          summary: "Visible details",
        },
        counts: { prizes: 1 },
        remainingTaskCount: 1,
        taskListTool: "list_organizer_tasks",
      },
    })

    const result = await execute("update_hackathon_details", {
      name: "Agent event",
    })

    expect(result).toMatchObject({ ok: true })
    expect(beginManageWebMcpChange).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "details",
        patch: expect.objectContaining({ name: "Agent event" }),
      }),
    )
    expect(commitManageWebMcpChange).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "details" }),
    )
    expect(await screen.findByText("The change was saved")).toBeDefined()
    const navigation = globalThis as typeof globalThis & {
      __nextNavState: {
        router: {
          push: ReturnType<typeof mock>
          refresh: ReturnType<typeof mock>
        }
      }
    }
    expect(navigation.__nextNavState.router.push).toHaveBeenCalledWith(
      "/e/build-day/manage?tab=edit",
    )
    expect(navigation.__nextNavState.router.refresh).toHaveBeenCalledTimes(1)
  })

  it("refreshes the shared task board after a WebMCP task change", async () => {
    globalThis.fetch = mock(async (input, init) => {
      expect(String(input)).toBe(
        "/api/dashboard/hackathons/11111111-1111-1111-1111-111111111111/action-items",
      )
      expect(init?.method).toBe("POST")
      const body = JSON.parse(String(init?.body))
      return Response.json({
        task: {
          taskRef: body.taskRef,
          label: body.label,
          hint: null,
          tooltip: null,
          severity: body.severity,
          state: "pending",
          completionPolicy: "manual",
          custom: true,
          destination: "action_items",
          inspectUrl: "/e/build-day/manage?tab=action-items",
          ctaLabel: "Open tasks",
          blocksProgress: false,
          updatedAt: "2026-08-30T18:00:00.000Z",
        },
      })
    }) as unknown as typeof fetch
    render(<ManageHackathonWebMcpTools context={context} />)
    await waitFor(() => expect(tools.has("add_organizer_task")).toBe(true))

    const result = await execute("add_organizer_task", {
      label: "Order lunch",
      severity: "info",
      taskRef: "custom-order-lunch",
    })

    expect(result).toMatchObject({
      ok: true,
      data: { task: { taskRef: "custom-order-lunch" } },
    })
    const navigation = globalThis as typeof globalThis & {
      __nextNavState: { router: { refresh: ReturnType<typeof mock> } }
    }
    expect(navigation.__nextNavState.router.refresh).toHaveBeenCalledTimes(1)
  })

  it("opens the matching task dialog from WebMCP", async () => {
    render(<ManageHackathonWebMcpTools context={context} />)
    await waitFor(() => expect(tools.has("open_organizer_task")).toBe(true))

    const result = await execute("open_organizer_task", {
      taskRef: "finish-scoring-setup",
    })

    expect(result).toMatchObject({
      ok: true,
      data: { status: "opened", requiresHumanAction: false },
    })
    expect(handleActionClick).toHaveBeenCalledWith(
      expect.objectContaining({ id: "finish-scoring-setup" }),
    )
  })

  it("opens a judging review from WebMCP", async () => {
    render(<ManageHackathonWebMcpTools context={context} />)
    await waitFor(() => expect(tools.has("open_judging_review")).toBe(true))

    const result = await execute("open_judging_review", { review: "rounds" })

    expect(result).toMatchObject({
      ok: true,
      data: { review: "rounds", status: "opened", requiresHumanAction: false },
    })
    expect(openRegisteredAction).toHaveBeenCalledWith("activate-first-round")
  })

  it("rolls back failed changes and routes human-only review actions", async () => {
    globalThis.fetch = mock(async () => {
      throw new Error("offline")
    }) as unknown as typeof fetch
    render(<ManageHackathonWebMcpTools context={context} />)
    await waitFor(() => expect(tools.has("add_schedule_item")).toBe(true))

    const failed = await execute("add_schedule_item", {
      title: "Lunch",
      startsAt: "2026-09-10T19:00:00.000Z",
    })

    expect(failed).toMatchObject({ ok: false })
    expect(rollbackManageWebMcpChange).toHaveBeenCalledTimes(1)
    expect(await screen.findByText("That change wasn't saved")).toBeDefined()

    await execute("open_go_live_review")
    expect(triggerTransition).toHaveBeenCalledWith("published")

    await execute("open_hackathon_section", { section: "results" })
    const navigation = globalThis as typeof globalThis & {
      __nextNavState: { router: { push: ReturnType<typeof mock> } }
    }
    expect(navigation.__nextNavState.router.push).toHaveBeenCalledWith(
      "/e/build-day/manage?tab=judging&jtab=results",
    )
  })

  it("opens sponsor review and fills the requested name without saving", async () => {
    const acknowledge = (rawEvent: Event) => {
      const event = rawEvent as PrepareSponsorEvent
      expect(event.detail.name).toBe("Acme")
      event.detail.acknowledge({ ok: true })
    }
    window.addEventListener(PREPARE_SPONSOR_EVENT, acknowledge)
    try {
      render(
        <>
          <ManageHackathonWebMcpTools context={context} />
          <div data-webmcp-section="sponsors" />
        </>,
      )
      await waitFor(() => expect(tools.has("prepare_sponsor")).toBe(true))
      const result = await execute("prepare_sponsor", { name: "Acme" })
      expect(result).toMatchObject({
        ok: true,
        requiresHumanAction: false,
        data: { prepared: true, status: "review_opened" },
      })
      expect(globalThis.fetch).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener(PREPARE_SPONSOR_EVENT, acknowledge)
    }
  })

  it("covers every setting and safely inspects organizer data", async () => {
    globalThis.fetch = mock(async (input, init) => {
      const url = String(input)
      if (url.endsWith("/teams")) {
        return Response.json({
          teams: [{ id: "team-1", name: "Builders", invite_token: "secret", note: "ready" }],
        })
      }
      expect(init?.method).toBe("PATCH")
      return Response.json({
        name: "Visible event",
        slug: "build-day",
        description: "Visible details",
        status: "draft",
        storedStatus: "draft",
        minTeamSize: 2,
        maxTeamSize: 6,
        allowSolo: false,
        requireTeamApproval: true,
        updatedAt: "2026-08-25T15:01:00.000Z",
      })
    }) as unknown as typeof fetch

    render(<ManageHackathonWebMcpTools context={context} />)
    await waitFor(() => expect(tools.has("get_hackathon_settings")).toBe(true))

    const settings = await execute("get_hackathon_settings")
    expect(settings).toMatchObject({
      ok: true,
      data: {
        teams: { minTeamSize: 1, maxTeamSize: 5, allowSolo: true },
        location: { type: "hybrid", requireCheckIn: false },
        judging: { anonymous: false, mode: "points" },
        terms: { acceptanceRequired: false },
      },
    })

    const update = await execute("update_hackathon_settings", {
      minTeamSize: 2,
      maxTeamSize: 6,
      allowSolo: false,
      requireTeamApproval: true,
    })
    expect(update).toMatchObject({ ok: true })
    expect(beginManageWebMcpChange).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "settings" }),
    )

    const teams = await execute("inspect_organizer_section", {
      section: "teams",
      offset: 0,
      limit: 20,
    })
    expect(teams).toMatchObject({
      ok: true,
      data: {
        section: "teams",
        collection: "teams",
        items: [{ name: "Builders", note: "ready" }],
        totalCount: 1,
        hasMore: false,
      },
    })
    expect(JSON.stringify(teams)).not.toContain("team-1")
    expect(JSON.stringify(teams)).not.toContain("invite_token")
    expect(JSON.stringify(teams)).not.toContain("secret")
  })
})
