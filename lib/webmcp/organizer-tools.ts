import { z } from "zod"
import type { HackathonStatus } from "@/lib/db/hackathon-types"
import { WebMcpRequestError } from "@/lib/webmcp/fetch"
import { defineWebMcpTool } from "@/lib/webmcp/tool"
import type { WebMcpTool } from "@/lib/webmcp/types"

const pageInput = z.object({
  offset: z.number().int().min(0).max(100).default(0),
}).strict()

const openEventInput = z.object({
  eventRef: z.string().min(1).max(30),
  destination: z.enum([
    "action_items",
    "overview",
    "teams",
    "people",
    "judging",
    "results",
    "communications",
    "post_event",
    "event_page",
  ]).default("action_items"),
}).strict()

const emptyInput = z.object({}).strict()

const destinationParams: Record<
  z.output<typeof openEventInput>["destination"],
  string
> = {
  action_items: "tab=action-items",
  overview: "tab=overview",
  teams: "tab=teams",
  people: "tab=people",
  judging: "tab=judging",
  results: "tab=judging&jtab=results",
  communications: "tab=event",
  post_event: "tab=post-event",
  event_page: "tab=edit",
}

export type OrganizerPortfolioEvent = {
  id: string
  slug: string
  name: string
  description: string | null
  status: HackathonStatus
  startsAt: string | null
  endsAt: string | null
  participantCount: number
  teamCount: number
  projectCount: number
  judgingComplete: number
  judgingTotal: number
}

function clip(value: string | null, max: number): string | null {
  if (value === null) return null
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`
}

export function createOrganizerPortfolioTools({
  getEvents,
  onNavigate,
}: {
  getEvents: () => OrganizerPortfolioEvent[]
  onNavigate: (url: string) => void
}): WebMcpTool[] {
  const refById = new Map<string, string>()
  let nextRef = 1

  function currentEvents() {
    const events = getEvents()
    const eventByRef = new Map<string, OrganizerPortfolioEvent>()
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
        message: "That event is no longer in this organizer workspace. Refresh and try again.",
        retryable: true,
      })
    }
    return event
  }

  return [
    defineWebMcpTool({
      name: "list_my_organized_events",
      title: "List my organized events",
      description: "Read events and safe progress totals from this organizer workspace. This doesn't change any event.",
      schema: pageInput,
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: ({ offset }) => {
        const events = currentEvents().events
        const items = events.slice(offset, offset + 5).map((event) => ({
          eventRef: refById.get(event.id),
          name: clip(event.name, 100),
          summary: clip(event.description, 160),
          status: event.status,
          startsAt: event.startsAt,
          endsAt: event.endsAt,
          counts: {
            attendees: event.participantCount,
            teams: event.teamCount,
            projects: event.projectCount,
            judgingComplete: event.judgingComplete,
            judgingTotal: event.judgingTotal,
          },
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
      name: "open_organized_event",
      title: "Open organized event",
      description: "Open one organizer page for an event from this workspace. This doesn't change event data.",
      schema: openEventInput,
      annotations: { readOnlyHint: true },
      execute: ({ eventRef, destination }) => {
        const event = resolveEvent(eventRef)
        const url = `/e/${event.slug}/manage?${destinationParams[destination]}`
        onNavigate(url)
        return { opened: true, destination, url }
      },
    }),
    defineWebMcpTool({
      name: "open_create_event",
      title: "Create an event",
      description: "Open the event builder. The create page provides WebMCP draft tools and requires a person to submit.",
      schema: emptyInput,
      annotations: { readOnlyHint: true },
      execute: () => {
        const url = "/create"
        onNavigate(url)
        return {
          data: { opened: true, url },
          requiresHumanAction: true,
        }
      },
    }),
  ]
}
