import { describe, expect, it, mock } from "bun:test"
import {
  createOrganizerPortfolioTools,
  type OrganizerPortfolioEvent,
} from "@/lib/webmcp/organizer-tools"

const signal = new AbortController().signal

const events: OrganizerPortfolioEvent[] = [{
  id: "11111111-1111-1111-1111-111111111111",
  slug: "agent-jam",
  name: "Agent Jam",
  description: "Build useful agents.",
  status: "active",
  startsAt: "2026-08-27T13:00:00.000Z",
  endsAt: "2026-08-28T21:00:00.000Z",
  participantCount: 24,
  teamCount: 6,
  projectCount: 4,
  judgingComplete: 5,
  judgingTotal: 12,
}]

describe("organizer portfolio WebMCP tools", () => {
  it("lists organized events with safe progress and opaque references", async () => {
    const tools = createOrganizerPortfolioTools({
      getEvents: () => events,
      onNavigate: () => undefined,
    })
    const list = tools.find((tool) => tool.name === "list_my_organized_events")!
    const result = await list.execute({ offset: 0 }, { signal })

    expect(result).toMatchObject({
      ok: true,
      data: {
        totalCount: 1,
        items: [{
          eventRef: "event-1",
          name: "Agent Jam",
          status: "active",
          counts: {
            attendees: 24,
            teams: 6,
            projects: 4,
            judgingComplete: 5,
            judgingTotal: 12,
          },
        }],
      },
    })
    expect(JSON.stringify(result)).not.toContain(events[0]!.id)
  })

  it("opens each organizer destination and rejects stale references", async () => {
    let currentEvents = [...events]
    const onNavigate = mock(() => undefined)
    const tools = createOrganizerPortfolioTools({
      getEvents: () => currentEvents,
      onNavigate,
    })
    const list = tools.find((tool) => tool.name === "list_my_organized_events")!
    const open = tools.find((tool) => tool.name === "open_organized_event")!

    await list.execute({ offset: 0 }, { signal })
    await open.execute({ eventRef: "event-1", destination: "results" }, { signal })
    expect(onNavigate).toHaveBeenCalledWith(
      "/e/agent-jam/manage?tab=judging&jtab=results",
    )

    currentEvents = []
    expect(await open.execute(
      { eventRef: "event-1", destination: "overview" },
      { signal },
    )).toMatchObject({ ok: false, error: { code: "item_changed" } })
  })

  it("opens the create flow and leaves submission to a person", async () => {
    const onNavigate = mock(() => undefined)
    const tools = createOrganizerPortfolioTools({
      getEvents: () => [],
      onNavigate,
    })
    const open = tools.find((tool) => tool.name === "open_create_event")!

    expect(await open.execute({}, { signal })).toMatchObject({
      ok: true,
      requiresHumanAction: true,
      data: { opened: true, url: "/create" },
    })
    expect(onNavigate).toHaveBeenCalledWith("/create")
  })
})
