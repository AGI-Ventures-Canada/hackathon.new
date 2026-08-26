import { z } from "zod"
import type { Prize } from "@/lib/db/hackathon-types"
import type { Announcement } from "@/lib/services/announcements"
import type { Challenge } from "@/lib/services/challenges"
import type { ScheduleItem } from "@/lib/services/schedule-items"
import {
  fetchWebMcpJson,
  WebMcpRequestError,
  type WebMcpFetcher,
} from "@/lib/webmcp/fetch"
import type {
  ManageWebMcpCommittedChange,
  ManageWebMcpOptimisticChange,
} from "@/lib/webmcp/manage-optimistic-state"
import {
  createWebMcpMutationHeaders,
  isWebMcpPreCompletionStatus,
  WEBMCP_PRE_COMPLETION_STATUSES,
} from "@/lib/webmcp/mutation-context"
import { defineWebMcpTool } from "@/lib/webmcp/tool"
import type { WebMcpTool } from "@/lib/webmcp/types"

export type {
  ManageWebMcpCommittedChange,
  ManageWebMcpOptimisticChange,
} from "@/lib/webmcp/manage-optimistic-state"

export type ManageHackathonWebMcpContext = {
  hackathon: {
    id: string
    slug: string
    name: string
    description: string | null
    locale: string | null
    status: string
    storedStatus: string
    phase: string | null
    eventVersion: string
    startsAt: string | null
    endsAt: string | null
    registrationClosesAt: string | null
    locationType: string | null
    locationName: string | null
    locationUrl: string | null
    minTeamSize: number
    maxTeamSize: number
    allowSolo: boolean
    requireTeamApproval: boolean
  }
  stats: {
    attendeeCount: number
    teamCount: number
    pendingTeamApprovalCount: number
    projectCount: number
    judgeCount: number
    prizeCount: number
    judgingAssignments: number
    completedJudgingAssignments: number
  }
  actionItems: {
    label: string
    hint: string | null
    severity: string
  }[]
  scheduleItems: {
    title: string
    description: string | null
    startsAt: string
    endsAt: string | null
    location: string | null
  }[]
  challenges: {
    title: string
    description: string | null
    resourceCount: number
  }[]
  prizes: {
    id: string
    name: string
    description: string | null
    value: string | null
    judgingStyle: string | null
    judgeCount: number
    totalAssignments: number
    completedAssignments: number
  }[]
}

type ManageHackathonToolDependencies = {
  getContext: () => ManageHackathonWebMcpContext
  fetcher: WebMcpFetcher
  onOptimistic: (change: ManageWebMcpOptimisticChange) => void
  onCommitted: (
    optimistic: ManageWebMcpOptimisticChange,
    committed: ManageWebMcpCommittedChange,
  ) => void
  onReverted: (
    optimistic: ManageWebMcpOptimisticChange,
    message: string,
  ) => void
  onNavigate: (href: string) => void
  onOpenTransition: (status: string) => void
}

const emptyInput = z.object({}).strict()
const dateTime = z.iso.datetime({ offset: true }).max(64)

const updateDetailsInput = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(5_000).nullable().optional(),
  })
  .strict()
  .refine(
    (input) => input.name !== undefined || input.description !== undefined,
    "Add a name or description to update",
  )

const timelineInput = z
  .object({
    startsAt: dateTime,
    endsAt: dateTime,
  })
  .strict()
  .refine(
    (input) => Date.parse(input.endsAt) > Date.parse(input.startsAt),
    "The end must be after the start",
  )

const scheduleItemInput = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2_000).optional(),
    startsAt: dateTime,
    endsAt: dateTime.optional(),
    location: z.string().trim().max(300).optional(),
  })
  .strict()
  .refine(
    (input) =>
      input.endsAt === undefined ||
      Date.parse(input.endsAt) > Date.parse(input.startsAt),
    "The end must be after the start",
  )

const challengeInput = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(5_000).optional(),
  })
  .strict()

const prizeInput = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2_000).optional(),
    value: z.string().trim().max(200).optional(),
    judgingStyle: z
      .enum(["judges_pick", "bucket_sort", "crowd_vote"])
      .optional(),
    maxPicks: z.number().int().min(1).max(100).optional(),
  })
  .strict()

const announcementInput = z
  .object({
    title: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(5_000),
    priority: z.enum(["normal", "urgent"]).optional(),
    audience: z
      .enum([
        "everyone",
        "organizers",
        "judges",
        "mentors",
        "attendees",
        "submitted",
        "not_submitted",
      ])
      .optional(),
  })
  .strict()

const sectionInput = z
  .object({
    section: z.enum([
      "action_items",
      "overview",
      "challenges",
      "schedule",
      "event_page",
      "teams",
      "people",
      "judging",
      "results",
      "post_event",
      "communications",
    ]),
  })
  .strict()

const sectionParams: Record<z.output<typeof sectionInput>["section"], string> = {
  action_items: "tab=action-items",
  overview: "tab=overview",
  challenges: "tab=challenges",
  schedule: "tab=overview",
  event_page: "tab=edit",
  teams: "tab=teams",
  people: "tab=people",
  judging: "tab=judging",
  results: "tab=judging&jtab=results",
  post_event: "tab=post-event",
  communications: "tab=event",
}

const untrustedReadAnnotations = {
  readOnlyHint: true,
  untrustedContentHint: true,
} as const

const MAX_ACTION_ITEMS = 1
const MAX_SCHEDULE_ITEMS = 2
const MAX_CHALLENGE_ITEMS = 3
const MAX_PRIZE_ITEMS = 2
let optimisticMutationSequence = 0

const draftOnlyToolNames = new Set([
  "set_hackathon_timeline",
  "add_challenge",
  "add_prize",
  "open_go_live_review",
])

function clip(value: string | null, maxLength: number): string | null {
  if (value === null || value.length <= maxLength) return value
  return `${value.slice(0, maxLength - 1)}…`
}

function manageHref(slug: string, params: string): string {
  return `/e/${slug}/manage?${params}`
}

function createMutationId(kind: ManageWebMcpOptimisticChange["kind"]): string {
  optimisticMutationSequence += 1
  return `webmcp-${kind}-${optimisticMutationSequence}`
}

function getDraftContext(
  dependencies: ManageHackathonToolDependencies,
): ManageHackathonWebMcpContext {
  const context = dependencies.getContext()
  if (context.hackathon.status !== "draft") {
    throw new WebMcpRequestError({
      code: "event_changed",
      message: "The event changed. Refresh the page before trying again.",
      retryable: true,
    })
  }
  return context
}

function getPreCompletionContext(
  dependencies: ManageHackathonToolDependencies,
): ManageHackathonWebMcpContext {
  const context = dependencies.getContext()
  if (!isWebMcpPreCompletionStatus(context.hackathon.status)) {
    throw new WebMcpRequestError({
      code: "event_changed",
      message: "The event changed. Refresh the page before trying again.",
      retryable: true,
    })
  }
  return context
}

async function sendMutation<T>(
  dependencies: ManageHackathonToolDependencies,
  options: {
    context: ManageHackathonWebMcpContext
    url: string
    method: "POST" | "PATCH"
    body: Record<string, unknown>
    signal: AbortSignal
    optimistic: ManageWebMcpOptimisticChange
    toCommitted: (result: T) => ManageWebMcpCommittedChange
  },
): Promise<T> {
  dependencies.onOptimistic(options.optimistic)
  try {
    const result = await fetchWebMcpJson<T>(dependencies.fetcher, options.url, {
      method: options.method,
      headers: {
        "Content-Type": "application/json",
        ...createWebMcpMutationHeaders({
          status: options.context.hackathon.status,
          eventVersion: options.context.hackathon.eventVersion,
        }),
      },
      body: JSON.stringify(options.body),
      signal: options.signal,
    })
    dependencies.onCommitted(options.optimistic, options.toCommitted(result))
    return result
  } catch (error) {
    dependencies.onReverted(
      options.optimistic,
      error instanceof WebMcpRequestError
        ? error.message
        : "We couldn't save that change. Review the page and try again.",
    )
    throw error
  }
}

function createReadTools(
  dependencies: ManageHackathonToolDependencies,
): WebMcpTool[] {
  return [
    defineWebMcpTool({
      name: "get_hackathon_overview",
      title: "Get hackathon overview",
      description:
        "Read the event setup, progress, team rules, and the organizer's next tasks. This doesn't change the event.",
      schema: emptyInput,
      annotations: untrustedReadAnnotations,
      execute: () => {
        const context = dependencies.getContext()
        const { hackathon } = context
        const actionItems = context.actionItems
          .slice(0, MAX_ACTION_ITEMS)
          .map((item) => ({
            label: clip(item.label, 80),
            hint: clip(item.hint, 80),
            severity: item.severity,
          }))
        return {
          event: {
            slug: clip(hackathon.slug, 80),
            name: clip(hackathon.name, 100),
            summary: clip(hackathon.description, 160),
            status: hackathon.status,
            phase: hackathon.phase,
            startsAt: hackathon.startsAt,
            endsAt: hackathon.endsAt,
            registrationClosesAt: hackathon.registrationClosesAt,
            location: {
              type: hackathon.locationType,
              name: clip(hackathon.locationName, 80),
            },
            teamRules: {
              minSize: hackathon.minTeamSize,
              maxSize: hackathon.maxTeamSize,
              solo: hackathon.allowSolo,
              approval: hackathon.requireTeamApproval,
            },
          },
          counts: {
            attendees: context.stats.attendeeCount,
            teams: context.stats.teamCount,
            pendingTeams: context.stats.pendingTeamApprovalCount,
            projects: context.stats.projectCount,
            judges: context.stats.judgeCount,
            prizes: context.stats.prizeCount,
            judgingAssignments: context.stats.judgingAssignments,
            completedAssignments: context.stats.completedJudgingAssignments,
          },
          nextTask: actionItems[0] ?? null,
          remainingTaskCount: context.actionItems.length,
          urls: {
            manage: clip(manageHref(hackathon.slug, "tab=overview"), 120),
            event: clip(`/e/${hackathon.slug}`, 100),
          },
        }
      },
    }),
    defineWebMcpTool({
      name: "list_hackathon_schedule",
      title: "List hackathon schedule",
      description:
        "Read the first two event schedule items in time order. This doesn't change the schedule.",
      schema: emptyInput,
      annotations: untrustedReadAnnotations,
      execute: () => {
        const context = dependencies.getContext()
        const items = context.scheduleItems
          .slice(0, MAX_SCHEDULE_ITEMS)
          .map((item) => ({
            title: clip(item.title, 100),
            description: clip(item.description, 160),
            startsAt: item.startsAt,
            endsAt: item.endsAt,
            location: clip(item.location, 100),
          }))
        return {
          totalCount: context.scheduleItems.length,
          items,
          truncated: context.scheduleItems.length > items.length,
          inspectUrl: manageHref(context.hackathon.slug, "tab=overview"),
        }
      },
    }),
    defineWebMcpTool({
      name: "list_hackathon_challenges",
      title: "List hackathon challenges",
      description:
        "Read the first three event challenges. This doesn't release or change them.",
      schema: emptyInput,
      annotations: untrustedReadAnnotations,
      execute: () => {
        const context = dependencies.getContext()
        const items = context.challenges
          .slice(0, MAX_CHALLENGE_ITEMS)
          .map((challenge) => ({
            title: clip(challenge.title, 100),
            description: clip(challenge.description, 180),
            resourceCount: challenge.resourceCount,
          }))
        return {
          totalCount: context.challenges.length,
          items,
          truncated: context.challenges.length > items.length,
          inspectUrl: manageHref(context.hackathon.slug, "tab=challenges"),
        }
      },
    }),
    defineWebMcpTool({
      name: "list_hackathon_prizes",
      title: "List hackathon prizes",
      description:
        "Read the first two prizes and their judging progress. This doesn't change judging.",
      schema: emptyInput,
      annotations: untrustedReadAnnotations,
      execute: () => {
        const context = dependencies.getContext()
        const items = context.prizes.slice(0, MAX_PRIZE_ITEMS).map((prize) => ({
          name: clip(prize.name, 100),
          description: clip(prize.description, 160),
          value: clip(prize.value, 80),
          judgingStyle: prize.judgingStyle,
          judgeCount: prize.judgeCount,
          totalAssignments: prize.totalAssignments,
          completedAssignments: prize.completedAssignments,
        }))
        return {
          totalCount: context.prizes.length,
          items,
          truncated: context.prizes.length > items.length,
          inspectUrl: manageHref(
            context.hackathon.slug,
            "tab=judging&jtab=prizes",
          ),
        }
      },
    }),
    defineWebMcpTool({
      name: "open_hackathon_section",
      title: "Open hackathon section",
      description:
        "Open one organizer section for review. This doesn't change saved event data.",
      schema: sectionInput,
      annotations: { readOnlyHint: true },
      execute: ({ section }) => {
        const slug = dependencies.getContext().hackathon.slug
        const url = manageHref(slug, sectionParams[section])
        dependencies.onNavigate(url)
        return { opened: section, url }
      },
    }),
  ]
}

function createOrganizerWriteTools(
  dependencies: ManageHackathonToolDependencies,
): WebMcpTool[] {
  return [
    defineWebMcpTool({
      name: "update_hackathon_details",
      title: "Update hackathon details",
      description:
        "Save a new name or description before the event is completed. This doesn't publish or change its status.",
      schema: updateDetailsInput,
      annotations: { untrustedContentHint: true },
      execute: async (input, { signal }) => {
        const context = getPreCompletionContext(dependencies)
        const inspectUrl = manageHref(context.hackathon.slug, "tab=edit")
        const mutationId = createMutationId("details")
        const optimistic: ManageWebMcpOptimisticChange = {
          mutationId,
          kind: "details",
          href: inspectUrl,
          summary: "Updating the event details",
          patch: input,
        }
        const updated = await sendMutation<{
          name: string
          slug: string
          description: string | null
          status: string
        }>(dependencies, {
          context,
          url: `/api/dashboard/hackathons/${context.hackathon.id}/settings`,
          method: "PATCH",
          body: {
            ...input,
            ...(context.hackathon.locale
              ? { locale: context.hackathon.locale }
              : {}),
          },
          signal,
          optimistic,
          toCommitted: (result) => ({
            mutationId,
            kind: "details",
            details: {
              name: result.name,
              description: result.description,
            },
          }),
        })
        return {
          updated: {
            name: clip(updated.name, 200),
            slug: updated.slug,
            description: clip(updated.description, 400),
            status: updated.status,
          },
          inspectUrl,
        }
      },
    }),
    defineWebMcpTool({
      name: "set_hackathon_timeline",
      title: "Set hackathon timeline",
      description:
        "Set the draft event's start and end. Draft reminders stay off until the event goes live.",
      schema: timelineInput,
      annotations: { untrustedContentHint: true },
      execute: async (input, { signal }) => {
        const context = getDraftContext(dependencies)
        const inspectUrl = manageHref(context.hackathon.slug, "tab=overview")
        const mutationId = createMutationId("timeline")
        const optimistic: ManageWebMcpOptimisticChange = {
          mutationId,
          kind: "timeline",
          href: inspectUrl,
          summary: "Updating the event dates",
          timeline: input,
        }
        const updated = await sendMutation<{
          name: string
          startsAt: string | null
          endsAt: string | null
        }>(dependencies, {
          context,
          url: `/api/dashboard/hackathons/${context.hackathon.id}/settings`,
          method: "PATCH",
          body: input,
          signal,
          optimistic,
          toCommitted: (result) => ({
            mutationId,
            kind: "timeline",
            timeline: {
              startsAt: result.startsAt,
              endsAt: result.endsAt,
            },
          }),
        })
        return {
          updated: {
            name: clip(updated.name, 200),
            startsAt: updated.startsAt,
            endsAt: updated.endsAt,
          },
          inspectUrl,
        }
      },
    }),
    defineWebMcpTool({
      name: "add_schedule_item",
      title: "Add schedule item",
      description:
        "Add one ordinary schedule item before completion. This can't create a deadline or publish the event.",
      schema: scheduleItemInput,
      annotations: { untrustedContentHint: true },
      execute: async (input, { signal }) => {
        const context = getPreCompletionContext(dependencies)
        const inspectUrl = manageHref(context.hackathon.slug, "tab=overview")
        const mutationId = createMutationId("schedule")
        const createdAt = new Date().toISOString()
        const optimistic: ManageWebMcpOptimisticChange = {
          mutationId,
          kind: "schedule",
          href: inspectUrl,
          summary: `Adding ${input.title} to the schedule`,
          item: {
            id: mutationId,
            hackathon_id: context.hackathon.id,
            title: input.title,
            description: input.description ?? null,
            starts_at: input.startsAt,
            ends_at: input.endsAt ?? null,
            location: input.location ?? null,
            sort_order: context.scheduleItems.length,
            trigger_type: null,
            linked_to: null,
            created_at: createdAt,
            updated_at: createdAt,
          },
        }
        const item = await sendMutation<ScheduleItem>(dependencies, {
          context,
          url: `/api/dashboard/hackathons/${context.hackathon.id}/schedule`,
          method: "POST",
          body: input,
          signal,
          optimistic,
          toCommitted: (result) => ({
            mutationId,
            kind: "schedule",
            item: result,
          }),
        })
        return {
          scheduleItem: {
            title: clip(item.title, 200),
            description: clip(item.description, 240),
            startsAt: item.starts_at,
            endsAt: item.ends_at,
            location: clip(item.location, 160),
          },
          inspectUrl,
        }
      },
    }),
    defineWebMcpTool({
      name: "add_challenge",
      title: "Add challenge",
      description:
        "Add one challenge to the draft event. This doesn't release it or notify attendees.",
      schema: challengeInput,
      annotations: { untrustedContentHint: true },
      execute: async (input, { signal }) => {
        const context = getDraftContext(dependencies)
        const inspectUrl = manageHref(context.hackathon.slug, "tab=challenges")
        const mutationId = createMutationId("challenge")
        const createdAt = new Date().toISOString()
        const optimistic: ManageWebMcpOptimisticChange = {
          mutationId,
          kind: "challenge",
          href: inspectUrl,
          summary: `Adding the ${input.title} challenge`,
          challenge: {
            id: mutationId,
            hackathonId: context.hackathon.id,
            title: input.title,
            description: input.description ?? null,
            resources: [],
            sortOrder: context.challenges.length,
            createdAt,
            updatedAt: createdAt,
          },
        }
        const result = await sendMutation<{
          challenge: Challenge
        }>(dependencies, {
          context,
          url: `/api/dashboard/hackathons/${context.hackathon.id}/challenges`,
          method: "POST",
          body: input,
          signal,
          optimistic,
          toCommitted: (response) => ({
            mutationId,
            kind: "challenge",
            challenge: response.challenge,
          }),
        })
        return {
          challenge: {
            title: clip(result.challenge.title, 200),
            description: clip(result.challenge.description, 240),
          },
          inspectUrl,
        }
      },
    }),
    defineWebMcpTool({
      name: "add_prize",
      title: "Add prize",
      description:
        "Add one prize to the draft event. This doesn't assign judges, pick winners, or publish results.",
      schema: prizeInput,
      annotations: { untrustedContentHint: true },
      execute: async (input, { signal }) => {
        const context = getDraftContext(dependencies)
        const inspectUrl = manageHref(
          context.hackathon.slug,
          "tab=judging&jtab=prizes",
        )
        const mutationId = createMutationId("prize")
        const createdAt = new Date().toISOString()
        const judgingStyle = input.judgingStyle ?? "judges_pick"
        const optimistic: ManageWebMcpOptimisticChange = {
          mutationId,
          kind: "prize",
          href: inspectUrl,
          summary: `Adding the ${input.name} prize`,
          prize: {
            id: mutationId,
            hackathon_id: context.hackathon.id,
            name: input.name,
            description: input.description ?? null,
            value: input.value ?? null,
            type: judgingStyle === "crowd_vote" ? "crowd" : "favorite",
            rank: null,
            kind: "prize",
            monetary_value: null,
            currency: null,
            distribution_method: null,
            display_value: null,
            criteria_id: null,
            prize_track_id: null,
            judging_style: judgingStyle,
            round_id: null,
            assignment_mode: "organizer_assigned",
            max_picks: input.maxPicks ?? 3,
            is_screening: false,
            allowed_team_modes: null,
            display_order: context.prizes.length,
            created_at: createdAt,
            updated_at: createdAt,
          },
        }
        const result = await sendMutation<{
          prize: Prize
        }>(dependencies, {
          context,
          url: `/api/dashboard/hackathons/${context.hackathon.id}/prizes`,
          method: "POST",
          body: {
            ...input,
            judgingStyle,
          },
          signal,
          optimistic,
          toCommitted: (response) => ({
            mutationId,
            kind: "prize",
            prize: response.prize,
          }),
        })
        return {
          prize: {
            name: clip(result.prize.name, 200),
            description: clip(result.prize.description, 240),
            value: clip(result.prize.value, 120),
            judgingStyle: result.prize.judging_style,
          },
          inspectUrl,
        }
      },
    }),
    defineWebMcpTool({
      name: "open_go_live_review",
      title: "Review going live",
      description:
        "Open the event's go-live review. The organizer must check it and click the final button.",
      schema: emptyInput,
      annotations: { readOnlyHint: true },
      execute: () => {
        const context = getDraftContext(dependencies)
        dependencies.onOpenTransition("published")
        return {
          data: {
            status: "review_opened",
            eventUrl: `/e/${context.hackathon.slug}`,
          },
          requiresHumanAction: true,
        }
      },
    }),
  ]
}

function createAnnouncementTool(
  dependencies: ManageHackathonToolDependencies,
): WebMcpTool {
  return defineWebMcpTool({
    name: "draft_announcement",
    title: "Draft announcement",
    description:
      "Save an announcement draft for organizer review. This doesn't publish or send it.",
    schema: announcementInput,
    annotations: { untrustedContentHint: true },
    execute: async (input, { signal }) => {
      const context = dependencies.getContext()
      if (context.hackathon.status === "archived") {
        throw new WebMcpRequestError({
          code: "event_changed",
          message: "Archived events can't add announcement drafts.",
          retryable: false,
        })
      }
      const inspectUrl = manageHref(context.hackathon.slug, "tab=event")
      const mutationId = createMutationId("announcement")
      const createdAt = new Date().toISOString()
      const optimistic: ManageWebMcpOptimisticChange = {
        mutationId,
        kind: "announcement",
        href: inspectUrl,
        summary: `Drafting the ${input.title} announcement`,
        announcement: {
          id: mutationId,
          hackathon_id: context.hackathon.id,
          title: input.title,
          body: input.body,
          priority: input.priority ?? "normal",
          audience: input.audience ?? "everyone",
          published_at: null,
          created_at: createdAt,
          updated_at: createdAt,
        },
      }
      const result = await sendMutation<Announcement>(dependencies, {
        context,
        url: `/api/dashboard/hackathons/${context.hackathon.id}/announcements`,
        method: "POST",
        body: input,
        signal,
        optimistic,
        toCommitted: (announcement) => ({
          mutationId,
          kind: "announcement",
          announcement,
        }),
      })
      return {
        data: {
          announcement: {
            title: clip(result.title, 200),
            body: clip(result.body, 400),
            priority: result.priority,
            audience: result.audience,
            published: result.published_at !== null,
          },
          inspectUrl,
        },
        requiresHumanAction: true,
      }
    },
  })
}

function createPublishReviewTool(
  dependencies: ManageHackathonToolDependencies,
): WebMcpTool {
  return defineWebMcpTool({
    name: "open_publish_review",
    title: "Review publishing results",
    description:
      "Open results for review. The organizer must check winners and click the final publish button.",
    schema: emptyInput,
    annotations: { readOnlyHint: true },
    execute: () => {
      const slug = dependencies.getContext().hackathon.slug
      const url = manageHref(slug, "tab=judging&jtab=results")
      dependencies.onNavigate(url)
      return {
        data: { status: "review_opened", url },
        requiresHumanAction: true,
      }
    },
  })
}

export function createManageHackathonTools(
  dependencies: ManageHackathonToolDependencies,
  registrationStatus = dependencies.getContext().hackathon.status,
): WebMcpTool[] {
  const tools = createReadTools(dependencies)
  if (
    WEBMCP_PRE_COMPLETION_STATUSES.some(
      (allowed) => allowed === registrationStatus,
    )
  ) {
    tools.push(
      ...createOrganizerWriteTools(dependencies).filter(
        (tool) =>
          registrationStatus === "draft" || !draftOnlyToolNames.has(tool.name),
      ),
    )
  }
  if (registrationStatus !== "archived") {
    tools.push(createAnnouncementTool(dependencies))
  }
  if (
    registrationStatus === "judging" ||
    registrationStatus === "completed"
  ) {
    tools.push(createPublishReviewTool(dependencies))
  }
  return tools
}
