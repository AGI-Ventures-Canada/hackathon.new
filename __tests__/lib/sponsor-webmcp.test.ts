import { describe, expect, it, mock } from "bun:test"
import {
  createSponsorFulfillmentTools,
  createSponsorPortfolioTools,
  type SponsorPortfolioEvent,
  type SponsorWebMcpFulfillment,
} from "@/lib/webmcp/sponsor-tools"

const signal = new AbortController().signal

const events: SponsorPortfolioEvent[] = [{
  id: "11111111-1111-1111-1111-111111111111",
  slug: "agent-jam",
  name: "Agent Jam",
  status: "completed",
  endsAt: "2026-08-26T21:00:00.000Z",
  tier: "custom",
  customTierLabel: "Title partner",
}]

const fulfillments: SponsorWebMcpFulfillment[] = [{
  id: "22222222-2222-2222-2222-222222222222",
  prizeName: "Best agent",
  prizeValue: "$500",
  submissionTitle: "Queue Coach",
  teamName: "Breakfast Club",
  status: "claimed",
}]

describe("sponsor WebMCP tools", () => {
  it("lists sponsorships with opaque references and opens known destinations", async () => {
    const onNavigate = mock(() => undefined)
    const tools = createSponsorPortfolioTools({
      getEvents: () => events,
      onNavigate,
    })
    const list = tools.find((tool) => tool.name === "list_my_sponsorships")!
    const open = tools.find((tool) => tool.name === "open_sponsor_event")!

    const listed = await list.execute({ offset: 0 }, { signal })
    expect(listed).toMatchObject({
      ok: true,
      data: {
        totalCount: 1,
        items: [{ eventRef: "event-1", name: "Agent Jam", tier: "Title partner" }],
      },
    })
    expect(JSON.stringify(listed)).not.toContain(events[0]!.id)

    await open.execute({ eventRef: "event-1", destination: "prizes" }, { signal })
    expect(onNavigate).toHaveBeenCalledWith(
      `/home/sponsoring/${events[0]!.id}/fulfillments`,
    )
  })

  it("keeps sponsorship references stable and rejects removed events", async () => {
    let currentEvents = [
      ...events,
      { ...events[0]!, id: "33333333-3333-3333-3333-333333333333", slug: "second", name: "Second" },
    ]
    const onNavigate = mock(() => undefined)
    const tools = createSponsorPortfolioTools({
      getEvents: () => currentEvents,
      onNavigate,
    })
    const list = tools.find((tool) => tool.name === "list_my_sponsorships")!
    const open = tools.find((tool) => tool.name === "open_sponsor_event")!

    await list.execute({ offset: 0 }, { signal })
    currentEvents = [...currentEvents].reverse()
    await open.execute({ eventRef: "event-1", destination: "event" }, { signal })
    expect(onNavigate).toHaveBeenCalledWith("/e/agent-jam")

    currentEvents = currentEvents.filter((event) => event.id !== events[0]!.id)
    expect(await open.execute(
      { eventRef: "event-1", destination: "event" },
      { signal },
    )).toMatchObject({ ok: false, error: { code: "item_changed" } })
  })

  it("keeps sensitive claim details out of sponsor tool results", async () => {
    const tools = createSponsorFulfillmentTools({
      getFulfillments: () => fulfillments,
      onPrepare: () => undefined,
    })
    const read = tools.find((tool) => tool.name === "get_sponsor_fulfillments")!
    const result = await read.execute({}, { signal })

    expect(result).toMatchObject({
      ok: true,
      data: {
        claimedCount: 1,
        items: [{
          fulfillmentRef: "fulfillment-1",
          prize: "Best agent",
          project: "Queue Coach",
          status: "claimed",
        }],
      },
    })
    expect(JSON.stringify(result)).not.toContain(fulfillments[0]!.id)
  })

  it("prepares only claimed prizes and leaves the final action to a person", async () => {
    const onPrepare = mock(() => undefined)
    const tools = createSponsorFulfillmentTools({
      getFulfillments: () => fulfillments,
      onPrepare,
    })
    const prepare = tools.find((tool) => tool.name === "prepare_fulfillment")!

    expect(await prepare.execute({
      fulfillmentRef: "fulfillment-1",
      trackingNumber: "TRACK-1",
    }, { signal })).toMatchObject({
      ok: true,
      requiresHumanAction: true,
      data: { reviewOpened: true },
    })
    expect(onPrepare).toHaveBeenCalledWith(fulfillments[0]!.id, "TRACK-1")

    const shippedTools = createSponsorFulfillmentTools({
      getFulfillments: () => [{ ...fulfillments[0]!, status: "shipped" }],
      onPrepare,
    })
    expect(await shippedTools.find((tool) => tool.name === "prepare_fulfillment")!.execute({
      fulfillmentRef: "fulfillment-1",
    }, { signal })).toMatchObject({ ok: false, error: { code: "item_changed" } })
  })
})
