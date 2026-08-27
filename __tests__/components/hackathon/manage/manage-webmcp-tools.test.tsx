import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import type { ManageHackathonWebMcpContext } from "@/lib/webmcp/manage-hackathon-tools"
import type { WebMcpTool } from "@/lib/webmcp/types"

const beginManageWebMcpChange = mock(() => {})
const commitManageWebMcpChange = mock(() => {})
const rollbackManageWebMcpChange = mock(() => {})
const triggerTransition = mock(() => {})

const actionItemsState = {
  triggerTransition,
  hackathonStatus: "draft" as const,
  activeItems: [
    {
      label: "Add judges",
      hint: "Pick who will review projects.",
      severity: "warning" as const,
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
    registrationClosesAt: null,
    locationType: "hybrid",
    locationName: "Main Hall",
    locationUrl: null,
    minTeamSize: 1,
    maxTeamSize: 5,
    allowSolo: true,
    requireTeamApproval: false,
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
    registerTool: mock(async (tool) => {
      tools.set(tool.name, tool)
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
        nextTask: {
          label: "Add judges",
          hint: "Pick who will review projects.",
        },
        remainingTaskCount: 1,
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
})
