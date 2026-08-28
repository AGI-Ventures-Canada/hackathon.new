import { z } from "zod"
import type { HackathonStatus, Prize } from "@/lib/db/hackathon-types"
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
  clearMutationReceipt,
  createMutationFingerprint,
  readMutationReceipt,
  saveCommittedMutationReceipt,
  savePendingMutationReceipt,
} from "@/lib/webmcp/mutation-receipts"
import {
  createWebMcpMutationHeaders,
  isWebMcpPreCompletionStatus,
  WEBMCP_PRE_COMPLETION_STATUSES,
} from "@/lib/webmcp/mutation-context"
import { defineWebMcpTool } from "@/lib/webmcp/tool"
import type { WebMcpTool } from "@/lib/webmcp/types"
import {
  ORGANIZER_SECTION_CONFIG,
  ORGANIZER_SECTIONS,
  type OrganizerSection,
} from "@/lib/webmcp/organizer-parity"
import { stageKeyForStatus } from "@/lib/utils/lifecycle-stages"

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
    status: HackathonStatus
    storedStatus: HackathonStatus
    phase: string | null
    eventVersion: string
    startsAt: string | null
    endsAt: string | null
    registrationClosesAt: string | null
    registrationOpensAt: string | null
    rules: string | null
    bannerUrl: string | null
    allowLateRegistration: boolean
    maxParticipants: number | null
    locationType: string | null
    locationName: string | null
    locationUrl: string | null
    minTeamSize: number
    maxTeamSize: number
    allowSolo: boolean
    requireTeamApproval: boolean
    anonymousJudging: boolean
    judgingMode: "points" | "subjective" | "rubric"
    locationLatitude: number | null
    locationLongitude: number | null
    requireLocationVerification: boolean
    communityUrl: string | null
    communityLabel: string | null
    requireTermsAcceptance: boolean
    termsContent: string | null
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
  projects: {
    title: string
    description: string | null
    submitterName: string
  }[]
  sponsors: {
    name: string
    tier: string | null
  }[]
  perks: {
    name: string
    type: string
    released: boolean
  }[]
  announcements: {
    title: string
    audience: string
    priority: string
    publishedAt: string | null
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
  onNavigate: (
    href: string,
    section: z.output<typeof sectionInput>["section"],
  ) => Promise<boolean>
  onOpenTransition: (status: string) => void
  onPrepareSponsor?: (name: string) => Promise<boolean>
  onEventVersionUpdated?: (eventVersion: string) => void
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
    section: z.enum(ORGANIZER_SECTIONS),
  })
  .strict()

const sponsorPreparationInput = z.object({
  name: z.string().trim().min(1).max(200),
}).strict()

const paginationInput = z.object({
  offset: z.number().int().min(0).max(10_000).default(0),
  limit: z.number().int().min(1).max(50).default(2),
}).strict()

const organizerDataInput = paginationInput.extend({
  section: z.enum(ORGANIZER_SECTIONS),
}).strict()

const optionalUrl = z.string().trim().max(2_000).nullable().optional()
const updateSettingsInput = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(5_000).nullable().optional(),
  rules: z.string().trim().max(50_000).nullable().optional(),
  bannerUrl: optionalUrl,
  allowLateRegistration: z.boolean().optional(),
  anonymousJudging: z.boolean().optional(),
  judgingMode: z.enum(["points", "subjective", "rubric"]).optional(),
  locationType: z.enum(["in_person", "virtual", "hybrid"]).nullable().optional(),
  locationName: z.string().trim().max(300).nullable().optional(),
  locationUrl: optionalUrl,
  locationLatitude: z.number().min(-90).max(90).nullable().optional(),
  locationLongitude: z.number().min(-180).max(180).nullable().optional(),
  requireLocationVerification: z.boolean().optional(),
  maxParticipants: z.number().int().min(1).max(1_000_000).nullable().optional(),
  minTeamSize: z.number().int().min(1).max(100).optional(),
  maxTeamSize: z.number().int().min(1).max(100).optional(),
  allowSolo: z.boolean().optional(),
  requireTeamApproval: z.boolean().optional(),
  communityUrl: optionalUrl,
  communityLabel: z.string().trim().max(100).nullable().optional(),
  requireTermsAcceptance: z.boolean().optional(),
  termsContent: z.string().trim().max(50_000).nullable().optional(),
}).strict().superRefine((input, ctx) => {
  if (Object.keys(input).length === 0) {
    ctx.addIssue({ code: "custom", message: "Add at least one setting to update" })
  }
  if (input.minTeamSize !== undefined && input.maxTeamSize !== undefined && input.minTeamSize > input.maxTeamSize) {
    ctx.addIssue({ code: "custom", message: "The minimum team size can't be larger than the maximum" })
  }
  if (input.requireTermsAcceptance === true && !input.termsContent) {
    ctx.addIssue({ code: "custom", message: "Include termsContent when turning terms acceptance on" })
  }
})

const untrustedReadAnnotations = {
  readOnlyHint: true,
  untrustedContentHint: true,
} as const

const MAX_ACTION_ITEMS = 1

const draftOnlyToolNames = new Set([
  "set_hackathon_timeline",
  "add_challenge",
  "add_prize",
  "open_go_live_review",
])

const preCompletionToolNames = new Set([
  "update_hackathon_details",
  "update_hackathon_settings",
  "set_hackathon_timeline",
  "add_schedule_item",
  "add_challenge",
  "add_prize",
  "open_go_live_review",
])

function toolIsAvailableForStatus(
  toolName: string,
  status: HackathonStatus,
): boolean {
  if (draftOnlyToolNames.has(toolName)) return status === "draft"
  if (preCompletionToolNames.has(toolName)) {
    return WEBMCP_PRE_COMPLETION_STATUSES.some((allowed) => allowed === status)
  }
  if (toolName === "draft_announcement") return status !== "archived"
  if (toolName === "open_publish_review") {
    return status === "judging" || status === "completed"
  }
  return true
}

function clip(value: string | null, maxLength: number): string | null {
  if (value === null || value.length <= maxLength) return value
  return `${value.slice(0, maxLength - 1)}…`
}

function pageItems<T>(items: T[], input: z.output<typeof paginationInput>) {
  const page = items.slice(input.offset, input.offset + input.limit)
  return {
    totalCount: items.length,
    offset: input.offset,
    limit: input.limit,
    items: page,
    hasMore: input.offset + page.length < items.length,
    truncated: input.offset + page.length < items.length,
    nextOffset: input.offset + page.length < items.length
      ? input.offset + page.length
      : null,
  }
}

const organizerSectionEndpoint: Partial<Record<OrganizerSection, string>> = {
  teams: "teams",
  projects: "submissions",
  people: "people",
  judges: "judging/judges",
  rounds: "rounds",
  prizes: "prizes",
  assignments: "judging/progress",
  results: "results",
  mentors: "mentor-requests",
  social: "social-submissions",
  rooms: "rooms",
  exports: "exports",
  schedule: "schedule",
  challenges: "challenges",
  announcements: "announcements",
  sponsors: "sponsors",
}

const hiddenWebMcpKeys = new Set([
  "token",
  "invite_token",
  "access_token",
  "refresh_token",
  "secret",
  "password",
  "code",
  "redemptioncode",
  "redemption_code",
  "redemptionurl",
  "redemption_url",
  "instructions",
  "paymentdetail",
  "payment_detail",
  "paymentmethod",
  "payment_method",
  "shippingaddress",
  "shipping_address",
  "trackingnumber",
  "tracking_number",
  "recipientemail",
  "recipient_email",
  "recipientname",
  "recipient_name",
])

function sanitizeOrganizerData(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[nested data hidden]"
  if (typeof value === "string") return clip(value, 2_000)
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitizeOrganizerData(item, depth + 1))
  if (!value || typeof value !== "object") return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => {
        const normalized = key.replace(/[_-]/g, "").toLowerCase()
        return !hiddenWebMcpKeys.has(key.toLowerCase())
          && normalized !== "id"
          && !normalized.endsWith("id")
          && !normalized.endsWith("ids")
      })
      .slice(0, 100)
      .map(([key, entry]) => [key, sanitizeOrganizerData(entry, depth + 1)]),
  )
}

function manageHref(slug: string, params: string): string {
  return `/e/${slug}/manage?${params}`
}

function createMutationId(_kind: ManageWebMcpOptimisticChange["kind"]): string {
  return crypto.randomUUID()
}

function organizerSectionData(
  context: ManageHackathonWebMcpContext,
  section: z.output<typeof sectionInput>["section"],
): Record<string, unknown> {
  if (section === "action_items") {
    return {
      remainingCount: context.actionItems.length,
      nextTask: context.actionItems[0]
        ? {
            label: clip(context.actionItems[0].label, 80),
            hint: clip(context.actionItems[0].hint, 80),
            severity: context.actionItems[0].severity,
          }
        : null,
    }
  }
  if (section === "schedule") return { itemCount: context.scheduleItems.length }
  if (section === "challenges") return { challengeCount: context.challenges.length }
  if (section === "perks") {
    return {
      perkCount: context.perks.length,
      releasedCount: context.perks.filter((perk) => perk.released).length,
    }
  }
  if (section === "sponsors") return { sponsorCount: context.sponsors.length }
  if (section === "teams") {
    return {
      teamCount: context.stats.teamCount,
      pendingApprovalCount: context.stats.pendingTeamApprovalCount,
      rules: {
        minimumSize: context.hackathon.minTeamSize,
        maximumSize: context.hackathon.maxTeamSize,
        soloAllowed: context.hackathon.allowSolo,
        approvalRequired: context.hackathon.requireTeamApproval,
      },
    }
  }
  if (section === "projects") return { projectCount: context.stats.projectCount }
  if (section === "people") {
    return {
      attendeeCount: context.stats.attendeeCount,
      judgeCount: context.stats.judgeCount,
    }
  }
  if (["judging", "judging_setup", "judges", "rounds", "prizes", "assignments", "results"].includes(section)) {
    return {
      judgeCount: context.stats.judgeCount,
      prizeCount: context.prizes.length,
      assignmentCount: context.stats.judgingAssignments,
      completedAssignmentCount: context.stats.completedJudgingAssignments,
    }
  }
  if (["communications", "announcements"].includes(section)) {
    return {
      announcementCount: context.announcements.length,
      publishedCount: context.announcements.filter((announcement) =>
        announcement.publishedAt !== null
      ).length,
    }
  }
  return {
    eventStatus: stageKeyForStatus(context.hackathon.storedStatus),
  }
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
  const fingerprint = createMutationFingerprint({
    method: options.method,
    url: options.url,
    body: options.body,
  })
  const receipt = readMutationReceipt(fingerprint)
  if (receipt?.state === "committed") return receipt.result as T

  const mutationId = receipt?.mutationId ?? options.optimistic.mutationId
  const optimistic = { ...options.optimistic, mutationId } as ManageWebMcpOptimisticChange
  if (!receipt) savePendingMutationReceipt(fingerprint, mutationId)
  dependencies.onOptimistic(optimistic)
  try {
    const result = await fetchWebMcpJson<T>(dependencies.fetcher, options.url, {
      method: options.method,
      headers: {
        "Content-Type": "application/json",
        ...createWebMcpMutationHeaders({
          status: options.context.hackathon.status,
          eventVersion: options.context.hackathon.eventVersion,
        }, mutationId),
      },
      body: JSON.stringify(options.body),
      signal: options.signal,
    })
    if (
      typeof result === "object" &&
      result !== null &&
      "updatedAt" in result &&
      dateTime.safeParse(result.updatedAt).success
    ) {
      dependencies.onEventVersionUpdated?.(result.updatedAt as string)
    }
    saveCommittedMutationReceipt(fingerprint, mutationId, result)
    const committed = {
      ...options.toCommitted(result),
      mutationId,
    } as ManageWebMcpCommittedChange
    dependencies.onCommitted(optimistic, committed)
    return result
  } catch (error) {
    if (error instanceof WebMcpRequestError && !error.retryable) {
      clearMutationReceipt(fingerprint)
    }
    dependencies.onReverted(
      optimistic,
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
            status: stageKeyForStatus(hackathon.storedStatus),
            registrationStatus: ["published", "registration_open", "active"].includes(
              hackathon.status,
            )
              ? "open"
              : "closed",
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
      name: "get_organizer_page_support",
      title: "Get organizer page support",
      description:
        "Explain what one organizer page is for and which WebMCP tools and CLI commands cover it. This doesn't change the event.",
      schema: sectionInput,
      annotations: untrustedReadAnnotations,
      execute: ({ section }) => {
        const context = dependencies.getContext()
        const config = ORGANIZER_SECTION_CONFIG[section]
        const webMcpTools = config.webMcpTools.filter((toolName) =>
          toolIsAvailableForStatus(toolName, context.hackathon.status)
        )
        return {
          section,
          title: config.title,
          summary: config.summary,
          eventStatus: stageKeyForStatus(context.hackathon.storedStatus),
          webMcpTools,
          unavailableWebMcpTools: config.webMcpTools.filter(
            (toolName) => !webMcpTools.includes(toolName),
          ),
          cliCommands: config.cliCommands,
          cliCoverage: config.cliCommands.length > 0 ? "available" : "needs_review",
          pageData: organizerSectionData(context, section),
          inspectUrl: manageHref(context.hackathon.slug, config.params),
        }
      },
    }),
    defineWebMcpTool({
      name: "get_hackathon_settings",
      title: "Get all hackathon settings",
      description:
        "Read every event, registration, team, location, judging, community, and terms setting available to organizers. This doesn't change the event.",
      schema: emptyInput,
      annotations: untrustedReadAnnotations,
      execute: () => {
        const { hackathon } = dependencies.getContext()
        return {
          event: {
            name: clip(hackathon.name, 200),
            description: clip(hackathon.description, 300),
            rules: clip(hackathon.rules, 300),
            bannerUrl: clip(hackathon.bannerUrl, 300),
            locale: hackathon.locale,
            storedStatus: hackathon.storedStatus,
            effectiveStatus: hackathon.status,
            phase: hackathon.phase,
          },
          dates: {
            startsAt: hackathon.startsAt,
            endsAt: hackathon.endsAt,
            registrationOpensAt: hackathon.registrationOpensAt,
            registrationClosesAt: hackathon.registrationClosesAt,
            allowLateRegistration: hackathon.allowLateRegistration,
          },
          registration: { maxParticipants: hackathon.maxParticipants },
          teams: {
            minTeamSize: hackathon.minTeamSize,
            maxTeamSize: hackathon.maxTeamSize,
            allowSolo: hackathon.allowSolo,
            requireTeamApproval: hackathon.requireTeamApproval,
          },
          location: {
            type: hackathon.locationType,
            name: clip(hackathon.locationName, 300),
            url: clip(hackathon.locationUrl, 300),
            latitude: hackathon.locationLatitude,
            longitude: hackathon.locationLongitude,
            requireCheckIn: hackathon.requireLocationVerification,
          },
          judging: {
            anonymous: hackathon.anonymousJudging,
            mode: hackathon.judgingMode,
          },
          community: {
            url: clip(hackathon.communityUrl, 300),
            label: clip(hackathon.communityLabel, 100),
          },
          terms: {
            acceptanceRequired: hackathon.requireTermsAcceptance,
            content: clip(hackathon.termsContent, 300),
          },
          inspectUrl: manageHref(hackathon.slug, "tab=edit"),
        }
      },
    }),
    defineWebMcpTool({
      name: "inspect_organizer_section",
      title: "Inspect organizer section data",
      description:
        "Read current operational data for an organizer section, including teams, people, projects, judging, results, messages, rooms, and post-event work. Invite tokens, secrets, passwords, and perk codes stay hidden.",
      schema: organizerDataInput,
      annotations: untrustedReadAnnotations,
      execute: async ({ section, offset, limit }, { signal }) => {
        const context = dependencies.getContext()
        const endpoint = organizerSectionEndpoint[section]
        if (!endpoint) {
          return {
            section,
            pageData: organizerSectionData(context, section),
            inspectUrl: manageHref(context.hackathon.slug, ORGANIZER_SECTION_CONFIG[section].params),
          }
        }
        const raw = await fetchWebMcpJson<unknown>(
          dependencies.fetcher,
          `/api/dashboard/hackathons/${context.hackathon.id}/${endpoint}`,
          { signal },
        )
        const sanitized = sanitizeOrganizerData(raw)
        if (Array.isArray(sanitized)) {
          return {
            section,
            ...pageItems(sanitized, { offset, limit }),
            inspectUrl: manageHref(context.hackathon.slug, ORGANIZER_SECTION_CONFIG[section].params),
          }
        }
        if (sanitized && typeof sanitized === "object") {
          const entries = Object.entries(sanitized as Record<string, unknown>)
          const collection = entries.find(([, value]) => Array.isArray(value))
          if (collection) {
            const [collectionName, items] = collection as [string, unknown[]]
            return {
              section,
              collection: collectionName,
              summary: Object.fromEntries(entries.filter(([key]) => key !== collectionName)),
              ...pageItems(items, { offset, limit }),
              inspectUrl: manageHref(context.hackathon.slug, ORGANIZER_SECTION_CONFIG[section].params),
            }
          }
        }
        return {
          section,
          sectionData: sanitized,
          inspectUrl: manageHref(context.hackathon.slug, ORGANIZER_SECTION_CONFIG[section].params),
        }
      },
    }),
    defineWebMcpTool({
      name: "list_hackathon_schedule",
      title: "List hackathon schedule",
      description:
        "Read a page of event schedule items in time order. This doesn't change the schedule.",
      schema: paginationInput,
      annotations: untrustedReadAnnotations,
      execute: (input) => {
        const context = dependencies.getContext()
        const items = context.scheduleItems.map((item) => ({
            title: clip(item.title, 100),
            description: clip(item.description, 160),
            startsAt: item.startsAt,
            endsAt: item.endsAt,
            location: clip(item.location, 100),
          }))
        return {
          ...pageItems(items, input),
          inspectUrl: manageHref(context.hackathon.slug, "tab=overview"),
        }
      },
    }),
    defineWebMcpTool({
      name: "list_hackathon_challenges",
      title: "List hackathon challenges",
      description:
        "Read a page of event challenges. This doesn't release or change them.",
      schema: paginationInput,
      annotations: untrustedReadAnnotations,
      execute: (input) => {
        const context = dependencies.getContext()
        const items = context.challenges
          .map((challenge) => ({
            title: clip(challenge.title, 100),
            description: clip(challenge.description, 180),
            resourceCount: challenge.resourceCount,
          }))
        return {
          ...pageItems(items, input),
          inspectUrl: manageHref(context.hackathon.slug, "tab=challenges"),
        }
      },
    }),
    defineWebMcpTool({
      name: "list_hackathon_prizes",
      title: "List hackathon prizes",
      description:
        "Read a page of prizes and their judging progress. This doesn't change judging.",
      schema: paginationInput,
      annotations: untrustedReadAnnotations,
      execute: (input) => {
        const context = dependencies.getContext()
        const items = context.prizes.map((prize) => ({
          name: clip(prize.name, 100),
          description: clip(prize.description, 160),
          value: clip(prize.value, 80),
          judgingStyle: prize.judgingStyle,
          judgeCount: prize.judgeCount,
          totalAssignments: prize.totalAssignments,
          completedAssignments: prize.completedAssignments,
        }))
        return {
          ...pageItems(items, input),
          inspectUrl: manageHref(
            context.hackathon.slug,
            "tab=judging&jtab=prizes",
          ),
        }
      },
    }),
    defineWebMcpTool({
      name: "list_hackathon_projects",
      title: "List hackathon projects",
      description: "Read a page of submitted projects. This doesn't change projects or judging.",
      schema: paginationInput,
      annotations: untrustedReadAnnotations,
      execute: (input) => {
        const context = dependencies.getContext()
        const items = context.projects.map((project) => ({
          title: clip(project.title, 100),
          description: clip(project.description, 180),
          submittedBy: clip(project.submitterName, 80),
        }))
        return {
          ...pageItems(items, input),
          inspectUrl: manageHref(context.hackathon.slug, "tab=teams"),
        }
      },
    }),
    defineWebMcpTool({
      name: "list_hackathon_sponsors",
      title: "List hackathon sponsors",
      description: "Read a page of sponsors shown on the event page. This doesn't change sponsor details.",
      schema: paginationInput,
      annotations: untrustedReadAnnotations,
      execute: (input) => {
        const context = dependencies.getContext()
        const items = context.sponsors.map((sponsor) => ({
          name: clip(sponsor.name, 100),
          tier: clip(sponsor.tier, 60),
        }))
        return {
          ...pageItems(items, input),
          inspectUrl: manageHref(context.hackathon.slug, "tab=edit"),
        }
      },
    }),
    defineWebMcpTool({
      name: "list_hackathon_perks",
      title: "List hackathon perks",
      description: "Read a page of perks and release state. Codes and private instructions stay hidden.",
      schema: paginationInput,
      annotations: untrustedReadAnnotations,
      execute: (input) => {
        const context = dependencies.getContext()
        const items = context.perks.map((perk) => ({
          name: clip(perk.name, 100),
          type: perk.type,
          released: perk.released,
        }))
        return {
          ...pageItems(items, input),
          inspectUrl: manageHref(context.hackathon.slug, "tab=perks"),
        }
      },
    }),
    defineWebMcpTool({
      name: "list_hackathon_announcements",
      title: "List announcements",
      description: "Read a page of announcement summaries. This doesn't publish or send a message.",
      schema: paginationInput,
      annotations: untrustedReadAnnotations,
      execute: (input) => {
        const context = dependencies.getContext()
        const items = context.announcements
          .map((announcement) => ({
            title: clip(announcement.title, 100),
            audience: announcement.audience,
            priority: announcement.priority,
            state: announcement.publishedAt ? "published" : "draft",
          }))
        return {
          ...pageItems(items, input),
          inspectUrl: manageHref(context.hackathon.slug, "tab=event"),
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
      execute: async ({ section }) => {
        const slug = dependencies.getContext().hackathon.slug
        const url = manageHref(slug, ORGANIZER_SECTION_CONFIG[section].params)
        const opened = await dependencies.onNavigate(url, section)
        return {
          opened: opened ? section : null,
          requested: section,
          status: opened ? "opened" : "navigation_pending",
          url,
        }
      },
    }),
  ]
}

function createOrganizerWriteTools(
  dependencies: ManageHackathonToolDependencies,
): WebMcpTool[] {
  return [
    defineWebMcpTool({
      name: "update_hackathon_settings",
      title: "Update hackathon settings",
      description:
        "Update event page, registration, team, location, judging, community, or terms settings before completion. This can't change the event stage, send messages, or publish results.",
      schema: updateSettingsInput,
      annotations: { untrustedContentHint: true },
      execute: async (input, { signal }) => {
        const context = getPreCompletionContext(dependencies)
        const currentMin = input.minTeamSize ?? context.hackathon.minTeamSize
        const currentMax = input.maxTeamSize ?? context.hackathon.maxTeamSize
        if (currentMin > currentMax) {
          throw new WebMcpRequestError({
            code: "invalid_team_size",
            message: "The minimum team size can't be larger than the maximum.",
            retryable: false,
          })
        }
        if (
          input.requireTermsAcceptance === true &&
          !input.termsContent &&
          !context.hackathon.termsContent
        ) {
          throw new WebMcpRequestError({
            code: "terms_content_required",
            message: "Add the terms before requiring people to accept them.",
            retryable: false,
          })
        }
        const inspectUrl = manageHref(context.hackathon.slug, "tab=edit")
        const mutationId = createMutationId("settings")
        const optimistic: ManageWebMcpOptimisticChange = {
          mutationId,
          kind: "settings",
          href: inspectUrl,
          summary: "Updating the event settings",
          patch: input,
        }
        const updated = await sendMutation<Record<string, unknown>>(dependencies, {
          context,
          url: `/api/dashboard/hackathons/${context.hackathon.id}/settings`,
          method: "PATCH",
          body: {
            ...input,
            ...(context.hackathon.locale ? { locale: context.hackathon.locale } : {}),
          },
          signal,
          optimistic,
          toCommitted: (result) => ({
            mutationId,
            kind: "settings",
            patch: result,
          }),
        })
        return {
          updated: sanitizeOrganizerData(updated),
          inspectUrl,
        }
      },
    }),
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
          updatedAt: string
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
          updatedAt: string
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
    execute: async () => {
      const slug = dependencies.getContext().hackathon.slug
      const url = manageHref(slug, "tab=judging&jtab=results")
      const opened = await dependencies.onNavigate(url, "results")
      return {
        data: { status: opened ? "review_opened" : "navigation_pending", url },
        requiresHumanAction: true,
      }
    },
  })
}

function createSponsorPreparationTool(
  dependencies: ManageHackathonToolDependencies,
): WebMcpTool {
  return defineWebMcpTool({
    name: "prepare_sponsor",
    title: "Prepare a sponsor",
    description: "Open the sponsor editor and fill in a sponsor name. A person must review and add it.",
    schema: sponsorPreparationInput,
    annotations: { untrustedContentHint: true },
    execute: async ({ name }) => {
      const context = dependencies.getContext()
      const inspectUrl = manageHref(context.hackathon.slug, "tab=edit")
      const opened = dependencies.onPrepareSponsor
        ? await dependencies.onPrepareSponsor(name)
        : await dependencies.onNavigate(inspectUrl, "sponsors")
      return {
        data: {
          prepared: opened,
          status: opened ? "review_opened" : "navigation_pending",
          inspectUrl,
        },
        requiresHumanAction: true,
      }
    },
  })
}

export function createManageHackathonTools(
  dependencies: ManageHackathonToolDependencies,
  registrationStatus = dependencies.getContext().hackathon.status,
): WebMcpTool[] {
  let sourceEventVersion = dependencies.getContext().hackathon.eventVersion
  let currentEventVersion = sourceEventVersion
  const supersededEventVersions = new Set<string>()
  const adoptEventVersion = (eventVersion: string) => {
    if (
      eventVersion === currentEventVersion ||
      supersededEventVersions.has(eventVersion)
    ) return
    supersededEventVersions.add(currentEventVersion)
    currentEventVersion = eventVersion
  }
  const currentDependencies: ManageHackathonToolDependencies = {
    ...dependencies,
    getContext: () => {
      const context = dependencies.getContext()
      if (context.hackathon.eventVersion !== sourceEventVersion) {
        sourceEventVersion = context.hackathon.eventVersion
        adoptEventVersion(sourceEventVersion)
      }
      return {
        ...context,
        hackathon: {
          ...context.hackathon,
          eventVersion: currentEventVersion,
        },
      }
    },
    onEventVersionUpdated: (eventVersion) => {
      adoptEventVersion(eventVersion)
      dependencies.onEventVersionUpdated?.(currentEventVersion)
    },
  }
  const tools = createReadTools(currentDependencies)
  if (
    WEBMCP_PRE_COMPLETION_STATUSES.some(
      (allowed) => allowed === registrationStatus,
    )
  ) {
    tools.push(
      ...createOrganizerWriteTools(currentDependencies).filter(
        (tool) =>
          registrationStatus === "draft" || !draftOnlyToolNames.has(tool.name),
      ),
    )
  }
  if (registrationStatus !== "archived") {
    tools.push(createSponsorPreparationTool(currentDependencies))
    tools.push(createAnnouncementTool(currentDependencies))
  }
  if (
    registrationStatus === "judging" ||
    registrationStatus === "completed"
  ) {
    tools.push(createPublishReviewTool(currentDependencies))
  }
  return tools
}
