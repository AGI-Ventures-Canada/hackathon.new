import { z } from "zod"
import type { HackathonStatus, PrizeFulfillmentStatus, SponsorTier } from "@/lib/db/hackathon-types"
import { WebMcpRequestError } from "@/lib/webmcp/fetch"
import { defineWebMcpTool } from "@/lib/webmcp/tool"
import type { WebMcpTool } from "@/lib/webmcp/types"

const emptyInput = z.object({}).strict()
const pageInput = z.object({
  offset: z.number().int().min(0).max(100).default(0),
}).strict()
const openEventInput = z.object({
  eventRef: z.string().min(1).max(30),
  destination: z.enum(["event", "prizes"]).default("event"),
}).strict()
const prepareFulfillmentInput = z.object({
  fulfillmentRef: z.string().min(1).max(30),
  trackingNumber: z.string().trim().max(100).optional(),
}).strict()

export type SponsorPortfolioEvent = {
  id: string
  slug: string
  name: string
  status: HackathonStatus
  endsAt: string | null
  tier: SponsorTier
  customTierLabel: string | null
}

export type SponsorWebMcpFulfillment = {
  id: string
  prizeName: string
  prizeValue: string | null
  submissionTitle: string
  teamName: string | null
  status: PrizeFulfillmentStatus
}

function clip(value: string | null, max: number): string | null {
  if (value === null) return null
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`
}

export function createSponsorPortfolioTools({
  getEvents,
  onNavigate,
}: {
  getEvents: () => SponsorPortfolioEvent[]
  onNavigate: (url: string) => void
}): WebMcpTool[] {
  const refById = new Map<string, string>()
  let nextRef = 1

  function currentEvents() {
    const events = getEvents()
    const eventByRef = new Map<string, SponsorPortfolioEvent>()
    for (const event of events) {
      let ref = refById.get(event.id)
      if (!ref) {
        ref = `event-${nextRef}`
        nextRef += 1
        refById.set(event.id, ref)
      }
      eventByRef.set(ref, event)
    }
    return { events, eventByRef }
  }

  function resolveEvent(ref: string) {
    const event = currentEvents().eventByRef.get(ref)
    if (!event) {
      throw new WebMcpRequestError({
        code: "item_changed",
        message: "That event is no longer in this sponsor workspace. Refresh and try again.",
        retryable: true,
      })
    }
    return event
  }

  return [
    defineWebMcpTool({
      name: "list_my_sponsorships",
      title: "List my sponsorships",
      description: "Read sponsored events shown in this workspace. This doesn't change any event or prize.",
      schema: pageInput,
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: ({ offset }) => {
        const events = currentEvents().events
        const items = events.slice(offset, offset + 4).map((event) => ({
          eventRef: refById.get(event.id),
          name: clip(event.name, 100),
          status: event.status,
          endsAt: event.endsAt,
          tier: event.tier === "custom" && event.customTierLabel
            ? clip(event.customTierLabel, 60)
            : event.tier,
        }))
        return {
          totalCount: events.length,
          items,
          nextOffset: offset + items.length < events.length
            ? offset + items.length
            : null,
        }
      },
    }),
    defineWebMcpTool({
      name: "open_sponsor_event",
      title: "Open sponsored event",
      description: "Open a sponsored event or its prize page. This doesn't update prize delivery.",
      schema: openEventInput,
      annotations: { readOnlyHint: true },
      execute: ({ eventRef, destination }) => {
        const event = resolveEvent(eventRef)
        const url = destination === "prizes"
          ? `/home/sponsoring/${event.id}/fulfillments`
          : `/e/${event.slug}`
        onNavigate(url)
        return { opened: true, destination, url }
      },
    }),
  ]
}

export function createSponsorFulfillmentTools({
  getFulfillments,
  onPrepare,
}: {
  getFulfillments: () => SponsorWebMcpFulfillment[]
  onPrepare: (fulfillmentId: string, trackingNumber: string) => void
}): WebMcpTool[] {
  const refById = new Map<string, string>()
  let nextRef = 1

  function currentFulfillments() {
    const fulfillments = getFulfillments()
    const fulfillmentByRef = new Map<string, SponsorWebMcpFulfillment>()
    for (const fulfillment of fulfillments) {
      let ref = refById.get(fulfillment.id)
      if (!ref) {
        ref = `fulfillment-${nextRef}`
        nextRef += 1
        refById.set(fulfillment.id, ref)
      }
      fulfillmentByRef.set(ref, fulfillment)
    }
    return { fulfillments, fulfillmentByRef }
  }

  function resolveFulfillment(ref: string) {
    const fulfillment = currentFulfillments().fulfillmentByRef.get(ref)
    if (!fulfillment) {
      throw new WebMcpRequestError({
        code: "item_changed",
        message: "That prize is no longer on this page. Refresh and try again.",
        retryable: true,
      })
    }
    return fulfillment
  }

  return [
    defineWebMcpTool({
      name: "get_sponsor_fulfillments",
      title: "Read sponsor prizes",
      description: "Read safe prize delivery status from this page. Recipient, address, and payment details stay hidden.",
      schema: emptyInput,
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: () => {
        const fulfillments = currentFulfillments().fulfillments
        const items = fulfillments.slice(0, 5).map((fulfillment) => ({
          fulfillmentRef: refById.get(fulfillment.id),
          prize: clip(fulfillment.prizeName, 100),
          value: clip(fulfillment.prizeValue, 80),
          project: clip(fulfillment.submissionTitle, 100),
          team: clip(fulfillment.teamName, 80),
          status: fulfillment.status,
        }))
        return {
          totalCount: fulfillments.length,
          claimedCount: fulfillments.filter((item) =>
            item.status === "claimed" || item.status === "shipped"
          ).length,
          items,
          truncated: fulfillments.length > items.length,
        }
      },
    }),
    defineWebMcpTool({
      name: "prepare_fulfillment",
      title: "Prepare prize delivery",
      description: "Open an optional prize delivery preview and fill tracking. Use execute_event_action to record delivery directly.",
      schema: prepareFulfillmentInput,
      annotations: { untrustedContentHint: true },
      execute: ({ fulfillmentRef, trackingNumber = "" }) => {
        const fulfillment = resolveFulfillment(fulfillmentRef)
        if (fulfillment.status !== "claimed") {
          throw new WebMcpRequestError({
            code: "item_changed",
            message: "Only a claimed prize can be marked fulfilled.",
            retryable: true,
          })
        }
        onPrepare(fulfillment.id, trackingNumber)
        return {
          data: {
            reviewOpened: true,
            prize: clip(fulfillment.prizeName, 100),
          },
          requiresHumanAction: false,
        }
      },
    }),
  ]
}
