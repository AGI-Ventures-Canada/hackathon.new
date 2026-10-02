import { z } from "zod"
import type { HackathonStatus, Submission, TeamStatus } from "@/lib/db/hackathon-types"
import type {
  OrganizerTask,
  OrganizerTaskPage,
  OrganizerTaskState,
} from "@/lib/utils/organizer-action-board"
import {
  normalizePreparedProjectDraft,
  summarizeChallengeResourcePage,
  summarizeEventGuide,
  summarizeEventViewer,
  summarizeProjectDraft,
  type EventGuideContext,
  type EventViewerContext,
  type PreparedProjectDraft,
} from "@/lib/webmcp/event-attendee-tools"
import {
  fetchWebMcpJson,
  WebMcpRequestError,
  type WebMcpFetcher,
} from "@/lib/webmcp/fetch"
import {
  ORGANIZER_SECTION_CONFIG,
  ORGANIZER_SECTIONS,
} from "@/lib/webmcp/organizer-parity"
import {
  defineWebMcpTool,
  MAX_WEBMCP_OUTPUT_CHARACTERS,
} from "@/lib/webmcp/tool"
import type { WebMcpTool } from "@/lib/webmcp/types"

type WorkspaceEvent = {
  id: string
  slug: string
  name: string
  description: string | null
  status: HackathonStatus
  startsAt: string | null
  endsAt: string | null
  role?: string
}

type EventListResponse = {
  hackathons: WorkspaceEvent[]
}

export type GlobalAttendeeEventContext = {
  guide: EventGuideContext
  viewer: EventViewerContext
  projectReview: {
    submission: Submission | null
    submissionDeadline: string | null
    teamSizeWarning: string | null
    teamStatus: TeamStatus | null
  }
}

type PrepareGlobalProjectResult = {
  openedReview: boolean
  nextStep: string
}

type GlobalWebMcpDependencies = {
  fetcher: WebMcpFetcher
  onNavigate: (href: string) => void
  getProjectDraft: (slug: string) => PreparedProjectDraft | null
  prepareProject: (
    event: WorkspaceEvent,
    context: GlobalAttendeeEventContext,
    draft: PreparedProjectDraft,
  ) => Promise<PrepareGlobalProjectResult>
}

const emptyInput = z.object({}).strict()
const pageInput = z.object({
  offset: z.number().int().min(0).max(10_000).default(0),
}).strict()
const eventRefInput = z.object({
  eventRef: z.string().min(1).max(30),
}).strict()
const organizerTaskState = z.enum(["all", "pending", "completed", "dismissed"])
const organizerTaskRef = z.string().min(1).max(160).regex(/^[A-Za-z0-9_-]+$/)
const customOrganizerTaskRef = z.string()
  .min(8)
  .max(160)
  .regex(/^custom-[A-Za-z0-9_-]+$/)
const expectedTaskUpdate = z.iso.datetime({ offset: true }).max(64).optional()
const organizerTaskPageInput = eventRefInput.extend({
  offset: z.number().int().min(0).max(10_000).default(0),
  limit: z.number().int().min(1).max(50).default(2),
  state: organizerTaskState.default("all"),
}).strict()
const addOrganizerTaskInput = eventRefInput.extend({
  label: z.string().trim().min(1).max(200),
  severity: z.enum(["urgent", "warning", "scheduled", "info"]).default("info"),
  taskRef: customOrganizerTaskRef,
}).strict()
const changeOrganizerTaskInput = eventRefInput.extend({
  taskRef: organizerTaskRef,
  expectedUpdatedAt: expectedTaskUpdate,
}).strict()
const removeOrganizerTaskInput = eventRefInput.extend({
  taskRef: customOrganizerTaskRef,
  expectedUpdatedAt: expectedTaskUpdate,
}).strict()
const attendeeGuideInput = eventRefInput.extend({
  section: z.enum([
    "overview",
    "rules",
    "schedule",
    "announcements",
    "challenges",
    "results",
  ]).default("overview"),
  offset: z.number().int().min(0).max(100).default(0),
}).strict()
const attendeeChallengeResourcesInput = eventRefInput.extend({
  challengeRef: z.string().min(1).max(40),
  offset: z.number().int().min(0).max(500).default(0),
  limit: z.number().int().min(1).max(4).default(4),
}).strict()
const projectInput = eventRefInput.extend({
  title: z.string().trim().min(1).max(100),
  githubUrl: z.string().trim().min(1).max(2_048),
  liveAppUrl: z.string().trim().max(2_048).default(""),
  demoVideoUrl: z.string().trim().max(2_048).default(""),
  description: z.string().trim().min(1).max(280),
}).strict()
const organizedEventInput = eventRefInput.extend({
  destination: z.enum(ORGANIZER_SECTIONS).default("action_items"),
}).strict()
const untrustedWriteAnnotations = {
  readOnlyHint: false,
  untrustedContentHint: true,
} as const

function clip(value: string | null, max: number): string | null {
  if (value === null || value.length <= max) return value
  return `${value.slice(0, max - 1)}…`
}

function compactOrganizerTask(task: OrganizerTask): OrganizerTask {
  return {
    ...task,
    label: clip(task.label, 120) ?? task.label,
    hint: clip(task.hint, 140),
    tooltip: clip(task.tooltip, 160),
    ctaLabel: clip(task.ctaLabel, 60),
  }
}

function compactOrganizerTaskPage(page: OrganizerTaskPage): OrganizerTaskPage {
  const sourceItems = page.items.map(compactOrganizerTask)
  let items: OrganizerTask[] = []

  for (const task of sourceItems) {
    const nextItems = [...items, task]
    const hasMore = nextItems.length < sourceItems.length || page.hasMore
    const candidate = {
      ...page,
      event: {
        name: clip(page.event.name, 100) ?? page.event.name,
        slug: clip(page.event.slug, 80) ?? page.event.slug,
      },
      items: nextItems,
      hasMore,
      nextOffset: hasMore ? page.offset + nextItems.length : null,
    }
    if (
      JSON.stringify({ ok: true, data: candidate }).length >
      MAX_WEBMCP_OUTPUT_CHARACTERS - 40
    ) {
      break
    }
    items = nextItems
  }

  if (items.length === 0 && sourceItems.length > 0) {
    const task = sourceItems[0]
    items = [{
      ...task,
      hint: clip(task.hint, 80),
      tooltip: null,
    }]
  }

  const hasMore = items.length < sourceItems.length || page.hasMore
  return {
    ...page,
    event: {
      name: clip(page.event.name, 100) ?? page.event.name,
      slug: clip(page.event.slug, 80) ?? page.event.slug,
    },
    items,
    hasMore,
    nextOffset: hasMore ? page.offset + items.length : null,
  }
}

function organizerTaskPageUrl(
  eventId: string,
  input: { offset: number; limit: number; state: OrganizerTaskState | "all" },
): string {
  const query = new URLSearchParams({
    offset: String(input.offset),
    limit: String(input.limit),
    state: input.state,
  })
  return `/api/dashboard/hackathons/${eventId}/action-items?${query}`
}

function organizerTaskUrl(eventId: string, taskRef?: string): string {
  const base = `/api/dashboard/hackathons/${eventId}/action-items`
  return taskRef ? `${base}/${encodeURIComponent(taskRef)}` : base
}

function missingEvent(): never {
  throw new WebMcpRequestError({
    code: "item_changed",
    message: "That event is no longer in this workspace. List events and try again.",
    retryable: true,
  })
}

export function createGlobalWebMcpTools(
  dependencies: GlobalWebMcpDependencies,
): WebMcpTool[] {
  const organizedRefById = new Map<string, string>()
  const attendeeRefById = new Map<string, string>()
  let organizedByRef = new Map<string, WorkspaceEvent>()
  let attendeeByRef = new Map<string, WorkspaceEvent>()

  function assignRefs(
    events: WorkspaceEvent[],
    refById: Map<string, string>,
    prefix: string,
  ) {
    const byRef = new Map<string, WorkspaceEvent>()
    for (const event of events) {
      let ref = refById.get(event.id)
      if (!ref) {
        ref = `${prefix}-${refById.size + 1}`
        refById.set(event.id, ref)
      }
      byRef.set(ref, event)
    }
    return byRef
  }

  async function loadOrganized(signal: AbortSignal) {
    const response = await fetchWebMcpJson<EventListResponse>(
      dependencies.fetcher,
      "/api/dashboard/hackathons",
      { method: "GET", signal },
    )
    organizedByRef = assignRefs(response.hackathons, organizedRefById, "organized")
    return response.hackathons
  }

  async function loadAttendee(signal: AbortSignal) {
    const response = await fetchWebMcpJson<EventListResponse>(
      dependencies.fetcher,
      "/api/dashboard/hackathons/participating",
      { method: "GET", signal },
    )
    const events = response.hackathons.filter((event) => event.role === "participant")
    attendeeByRef = assignRefs(events, attendeeRefById, "attendee")
    return events
  }

  function resolveOrganized(ref: string) {
    return organizedByRef.get(ref) ?? missingEvent()
  }

  function resolveAttendee(ref: string) {
    return attendeeByRef.get(ref) ?? missingEvent()
  }

  async function loadAttendeeContext(event: WorkspaceEvent, signal: AbortSignal) {
    return fetchWebMcpJson<GlobalAttendeeEventContext>(
      dependencies.fetcher,
      `/api/dashboard/webmcp/attendee-events/${encodeURIComponent(event.slug)}`,
      { method: "GET", signal },
    )
  }

  return [
    defineWebMcpTool({
      name: "open_create_event",
      title: "Create an event",
      description: "Open the optional event builder. Use execute_event_action to create an event directly.",
      schema: emptyInput,
      annotations: { readOnlyHint: true },
      execute: () => {
        dependencies.onNavigate("/create")
        return {
          data: { opened: true, url: "/create" },
          requiresHumanAction: false,
        }
      },
    }),
    defineWebMcpTool({
      name: "list_my_organized_events",
      title: "List my organized events",
      description: "List organized events from anywhere in the signed-in app. Internal event IDs stay hidden.",
      schema: pageInput,
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: async ({ offset }, { signal }) => {
        const events = await loadOrganized(signal)
        const items = events.slice(offset, offset + 5).map((event) => ({
          eventRef: organizedRefById.get(event.id),
          name: clip(event.name, 100),
          summary: clip(event.description, 160),
          status: event.status,
          startsAt: event.startsAt,
          endsAt: event.endsAt,
        }))
        return {
          totalCount: events.length,
          items,
          nextOffset: offset + items.length < events.length ? offset + items.length : null,
        }
      },
    }),
    defineWebMcpTool({
      name: "open_organized_event",
      title: "Open organized event",
      description: "Open any organizer section for one listed event. This doesn't change event data.",
      schema: organizedEventInput,
      annotations: { readOnlyHint: true },
      execute: ({ eventRef, destination }) => {
        const event = resolveOrganized(eventRef)
        const url = `/e/${event.slug}/manage?${ORGANIZER_SECTION_CONFIG[destination].params}`
        dependencies.onNavigate(url)
        return { opened: true, destination, url }
      },
    }),
    defineWebMcpTool({
      name: "get_organized_event_tasks",
      title: "List event tasks",
      description:
        "List one page of shared organizer tasks for a listed event. Use nextOffset to keep reading.",
      schema: organizerTaskPageInput,
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: async ({ eventRef, offset, limit, state }, { signal }) => {
        const event = resolveOrganized(eventRef)
        const page = await fetchWebMcpJson<OrganizerTaskPage>(
          dependencies.fetcher,
          organizerTaskPageUrl(event.id, { offset, limit, state }),
          { method: "GET", signal },
        )
        return compactOrganizerTaskPage(page)
      },
    }),
    defineWebMcpTool({
      name: "add_organized_event_task",
      title: "Add event task",
      description:
        "Add a shared custom task. Reuse the same custom taskRef when retrying so only one task is made.",
      schema: addOrganizerTaskInput,
      annotations: untrustedWriteAnnotations,
      execute: async ({ eventRef, label, severity, taskRef }, { signal }) => {
        const event = resolveOrganized(eventRef)
        const result = await fetchWebMcpJson<{ task: OrganizerTask }>(
          dependencies.fetcher,
          organizerTaskUrl(event.id),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ label, severity, taskRef }),
            signal,
          },
        )
        return { task: compactOrganizerTask(result.task) }
      },
    }),
    ...([
      ["complete_organized_event_task", "Complete event task", "completed"],
      ["reopen_organized_event_task", "Reopen event task", "pending"],
      ["dismiss_organized_event_task", "Dismiss event task", "dismissed"],
    ] as const).map(([name, title, state]) =>
      defineWebMcpTool({
        name,
        title,
        description: `${title}. The task rules are checked before anything changes.`,
        schema: changeOrganizerTaskInput,
        annotations: untrustedWriteAnnotations,
        execute: async ({ eventRef, taskRef, expectedUpdatedAt }, { signal }) => {
          const event = resolveOrganized(eventRef)
          const result = await fetchWebMcpJson<{ task: OrganizerTask }>(
            dependencies.fetcher,
            organizerTaskUrl(event.id, taskRef),
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ state, expectedUpdatedAt }),
              signal,
            },
          )
          return { task: compactOrganizerTask(result.task) }
        },
      }),
    ),
    defineWebMcpTool({
      name: "remove_organized_event_task",
      title: "Remove custom event task",
      description:
        "Remove one custom task. Event-made tasks cannot be removed.",
      schema: removeOrganizerTaskInput,
      annotations: untrustedWriteAnnotations,
      execute: async ({ eventRef, taskRef, expectedUpdatedAt }, { signal }) => {
        const event = resolveOrganized(eventRef)
        const query = expectedUpdatedAt
          ? `?${new URLSearchParams({ expectedUpdatedAt })}`
          : ""
        await fetchWebMcpJson<{ success: true }>(
          dependencies.fetcher,
          `${organizerTaskUrl(event.id, taskRef)}${query}`,
          { method: "DELETE", signal },
        )
        return {
          removed: true,
          taskRef,
          destination: "action_items",
          inspectUrl: `/e/${event.slug}/manage?tab=action-items`,
        }
      },
    }),
    defineWebMcpTool({
      name: "list_my_attendee_events",
      title: "List my attendee events",
      description: "List events where the signed-in person is an attendee. Internal event IDs stay hidden.",
      schema: pageInput,
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: async ({ offset }, { signal }) => {
        const events = await loadAttendee(signal)
        const items = events.slice(offset, offset + 5).map((event) => ({
          eventRef: attendeeRefById.get(event.id),
          name: clip(event.name, 100),
          summary: clip(event.description, 160),
          status: event.status,
          startsAt: event.startsAt,
          endsAt: event.endsAt,
        }))
        return {
          totalCount: events.length,
          items,
          nextOffset: offset + items.length < events.length ? offset + items.length : null,
        }
      },
    }),
    defineWebMcpTool({
      name: "get_attendee_event_guide",
      title: "Read attendee event guide",
      description: "Read rules, schedule, announcements, released challenges, published results, or event details for one listed attendee event.",
      schema: attendeeGuideInput,
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: async ({ eventRef, section, offset }, { signal }) => {
        const event = resolveAttendee(eventRef)
        const context = await loadAttendeeContext(event, signal)
        return summarizeEventGuide(context.guide, section, offset)
      },
    }),
    defineWebMcpTool({
      name: "get_attendee_event_status",
      title: "Read attendee status",
      description: "Read the signed-in attendee's current team, project, and next step for one listed event.",
      schema: eventRefInput,
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: async ({ eventRef }, { signal }) => {
        const event = resolveAttendee(eventRef)
        const context = await loadAttendeeContext(event, signal)
        return summarizeEventViewer(context.viewer)
      },
    }),
    defineWebMcpTool({
      name: "get_attendee_challenge_links",
      title: "Read attendee challenge links",
      description:
        "Read safe resource links for one released challenge. First get its challengeRef from the attendee event guide.",
      schema: attendeeChallengeResourcesInput,
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: async ({ eventRef, challengeRef, offset, limit }, { signal }) => {
        const event = resolveAttendee(eventRef)
        const context = await loadAttendeeContext(event, signal)
        return summarizeChallengeResourcePage(
          context.guide,
          challengeRef,
          offset,
          limit,
        )
      },
    }),
    defineWebMcpTool({
      name: "get_attendee_project_draft",
      title: "Read attendee project draft",
      description: "Read the browser-saved project draft for one listed attendee event. This doesn't submit it.",
      schema: eventRefInput,
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: ({ eventRef }) => {
        const event = resolveAttendee(eventRef)
        return { draft: summarizeProjectDraft(dependencies.getProjectDraft(event.slug)) }
      },
    }),
    defineWebMcpTool({
      name: "prepare_attendee_project",
      title: "Prepare attendee project",
      description: "Prepare a project and optionally open its preview. Use execute_event_action to submit or save directly.",
      schema: projectInput,
      annotations: { untrustedContentHint: true },
      execute: async ({ eventRef, ...input }, { signal }) => {
        const event = resolveAttendee(eventRef)
        const context = await loadAttendeeContext(event, signal)
        const result = await dependencies.prepareProject(
          event,
          context,
          normalizePreparedProjectDraft(input),
        )
        return {
          data: {
            prepared: true,
            openedReview: result.openedReview,
            nextStep: result.nextStep,
          },
          requiresHumanAction: false,
        }
      },
    }),
    defineWebMcpTool({
      name: "open_attendee_event",
      title: "Open attendee event",
      description: "Open the public page for one listed attendee event. This doesn't change event data.",
      schema: eventRefInput,
      annotations: { readOnlyHint: true },
      execute: ({ eventRef }) => {
        const event = resolveAttendee(eventRef)
        const url = `/e/${event.slug}`
        dependencies.onNavigate(url)
        return { opened: true, url }
      },
    }),
  ]
}
