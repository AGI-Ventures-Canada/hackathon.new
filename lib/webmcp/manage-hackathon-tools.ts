import { z } from "zod"
import type { WebMcpTool } from "@/hooks/use-webmcp-tools"
import { assertOkJson } from "@/lib/utils/fetch"

export type ManageHackathonWebMcpContext = {
  hackathon: {
    id: string
    slug: string
    name: string
    description: string | null
    locale: string | null
    status: string
    phase: string | null
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
    name: string
    description: string | null
    value: string | null
    judgingStyle: string | null
    judgeCount: number
    totalAssignments: number
    completedAssignments: number
  }[]
}

type WebMcpFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>

type ManageHackathonToolDependencies = {
  context: ManageHackathonWebMcpContext
  fetcher: WebMcpFetch
  onChanged: (href: string) => void
  onNavigate: (href: string) => void
}

const emptyInputSchema = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const

const dateTimeSchema = z
  .string()
  .max(64)
  .refine((value) => !Number.isNaN(Date.parse(value)), "Use an ISO date and time")

const updateDetailsInput = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(10_000).nullable().optional(),
  })
  .strict()
  .refine(
    (input) => input.name !== undefined || input.description !== undefined,
    "Add a name or description to update",
  )

const timelineInput = z
  .object({
    startsAt: dateTimeSchema,
    endsAt: dateTimeSchema,
  })
  .strict()
  .refine(
    (input) => Date.parse(input.endsAt) > Date.parse(input.startsAt),
    "The end must be after the start",
  )

const scheduleItemInput = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(5_000).optional(),
    startsAt: dateTimeSchema,
    endsAt: dateTimeSchema.optional(),
    location: z.string().trim().max(500).optional(),
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
    description: z.string().trim().max(10_000).optional(),
  })
  .strict()

const prizeInput = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(5_000).optional(),
    value: z.string().trim().max(200).optional(),
    judgingStyle: z
      .enum(["judges_pick", "bucket_sort", "crowd_vote"])
      .optional(),
    maxPicks: z.number().int().min(1).max(100).optional(),
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
      "post_event",
      "communications",
    ]),
  })
  .strict()

const sectionParams: Record<z.infer<typeof sectionInput>["section"], string> = {
  action_items: "tab=action-items",
  overview: "tab=overview",
  challenges: "tab=challenges",
  schedule: "tab=overview",
  event_page: "tab=edit",
  teams: "tab=teams",
  people: "tab=people",
  judging: "tab=judging",
  post_event: "tab=post-event",
  communications: "tab=event",
}

function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input)
  if (result.success) return result.data
  throw new Error(result.error.issues[0]?.message ?? "Invalid tool input")
}

async function sendJson<T>(
  fetcher: WebMcpFetch,
  url: string,
  method: "POST" | "PATCH",
  body: Record<string, unknown>,
  signal: AbortSignal,
): Promise<T> {
  return fetcher(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  }).then(assertOkJson<T>)
}

function manageHref(slug: string, params: string): string {
  return `/e/${slug}/manage?${params}`
}

function createReadTools(
  context: ManageHackathonWebMcpContext,
  onNavigate: (href: string) => void,
): WebMcpTool[] {
  const { hackathon } = context
  const untrustedReadAnnotations = {
    readOnlyHint: true,
    untrustedContentHint: true,
  }

  return [
    {
      name: "get_hackathon_overview",
      title: "Get hackathon overview",
      description:
        "Read the current hackathon's setup, progress, team rules, and remaining organizer tasks. This does not change the hackathon.",
      inputSchema: emptyInputSchema,
      annotations: untrustedReadAnnotations,
      execute: async () => ({
        hackathon: {
          slug: hackathon.slug,
          name: hackathon.name,
          description: hackathon.description,
          locale: hackathon.locale,
          status: hackathon.status,
          phase: hackathon.phase,
          startsAt: hackathon.startsAt,
          endsAt: hackathon.endsAt,
          registrationClosesAt: hackathon.registrationClosesAt,
          locationType: hackathon.locationType,
          locationName: hackathon.locationName,
          locationUrl: hackathon.locationUrl,
          minTeamSize: hackathon.minTeamSize,
          maxTeamSize: hackathon.maxTeamSize,
          allowSolo: hackathon.allowSolo,
          requireTeamApproval: hackathon.requireTeamApproval,
        },
        stats: context.stats,
        remainingActionItems: context.actionItems,
        manageUrl: manageHref(hackathon.slug, "tab=overview"),
        eventUrl: `/e/${hackathon.slug}`,
      }),
    },
    {
      name: "list_hackathon_schedule",
      title: "List hackathon schedule",
      description:
        "Read the current hackathon's schedule in time order. This does not change the schedule.",
      inputSchema: emptyInputSchema,
      annotations: untrustedReadAnnotations,
      execute: async () => ({
        count: context.scheduleItems.length,
        scheduleItems: context.scheduleItems,
        inspectUrl: manageHref(hackathon.slug, "tab=overview"),
      }),
    },
    {
      name: "list_hackathon_challenges",
      title: "List hackathon challenges",
      description:
        "Read the current hackathon's challenges. This does not release or change them.",
      inputSchema: emptyInputSchema,
      annotations: untrustedReadAnnotations,
      execute: async () => ({
        count: context.challenges.length,
        challenges: context.challenges,
        inspectUrl: manageHref(hackathon.slug, "tab=challenges"),
      }),
    },
    {
      name: "list_hackathon_prizes",
      title: "List hackathon prizes",
      description:
        "Read the current hackathon's prizes and judging progress. This does not change judging.",
      inputSchema: emptyInputSchema,
      annotations: untrustedReadAnnotations,
      execute: async () => ({
        count: context.prizes.length,
        prizes: context.prizes,
        inspectUrl: manageHref(hackathon.slug, "tab=judging&jtab=prizes"),
      }),
    },
    {
      name: "open_hackathon_section",
      title: "Open hackathon section",
      description:
        "Open a section of the current hackathon manager so the organizer can inspect it. This does not change saved data.",
      inputSchema: {
        type: "object",
        properties: {
          section: {
            type: "string",
            enum: Object.keys(sectionParams),
            description: "The organizer section to open.",
          },
        },
        required: ["section"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: async (rawInput) => {
        const { section } = parseInput(sectionInput, rawInput)
        const url = manageHref(hackathon.slug, sectionParams[section])
        onNavigate(url)
        return { opened: section, url }
      },
    },
  ]
}

function createDraftWriteTools({
  context,
  fetcher,
  onChanged,
}: ManageHackathonToolDependencies): WebMcpTool[] {
  const { hackathon } = context
  const settingsUrl = `/api/dashboard/hackathons/${hackathon.id}/settings`

  return [
    {
      name: "update_hackathon_details",
      title: "Update hackathon details",
      description:
        "Update the current draft hackathon's name or description. This does not publish it. Existing integrations may receive the same update notice sent by the editor.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", minLength: 1, maxLength: 200 },
          description: {
            anyOf: [{ type: "string", maxLength: 10_000 }, { type: "null" }],
          },
        },
        anyOf: [{ required: ["name"] }, { required: ["description"] }],
        additionalProperties: false,
      },
      annotations: { untrustedContentHint: true },
      execute: async (rawInput, { signal }) => {
        const input = parseInput(updateDetailsInput, rawInput)
        const updated = await sendJson<{
          id: string
          name: string
          slug: string
          description: string | null
          status: string
        }>(
          fetcher,
          settingsUrl,
          "PATCH",
          {
            ...input,
            ...(hackathon.locale ? { locale: hackathon.locale } : {}),
          },
          signal,
        )
        const inspectUrl = manageHref(hackathon.slug, "tab=edit")
        onChanged(inspectUrl)
        return {
          updated: {
            name: updated.name,
            slug: updated.slug,
            description: updated.description,
            status: updated.status,
          },
          inspectUrl,
        }
      },
    },
    {
      name: "set_hackathon_timeline",
      title: "Set hackathon timeline",
      description:
        "Set the current draft hackathon's start and end. Changing the start also moves registration close to that time and reschedules existing reminders. This does not publish the hackathon.",
      inputSchema: {
        type: "object",
        properties: {
          startsAt: { type: "string", format: "date-time", maxLength: 64 },
          endsAt: { type: "string", format: "date-time", maxLength: 64 },
        },
        required: ["startsAt", "endsAt"],
        additionalProperties: false,
      },
      annotations: { untrustedContentHint: true },
      execute: async (rawInput, { signal }) => {
        const input = parseInput(timelineInput, rawInput)
        const updated = await sendJson<{
          id: string
          name: string
          startsAt: string | null
          endsAt: string | null
          registrationClosesAt: string | null
        }>(fetcher, settingsUrl, "PATCH", input, signal)
        const inspectUrl = manageHref(hackathon.slug, "tab=overview")
        onChanged(inspectUrl)
        return {
          updated: {
            name: updated.name,
            startsAt: updated.startsAt,
            endsAt: updated.endsAt,
            registrationClosesAt: updated.registrationClosesAt,
          },
          inspectUrl,
        }
      },
    },
    {
      name: "add_schedule_item",
      title: "Add schedule item",
      description:
        "Add one ordinary item to the current draft hackathon's schedule. This does not create a deadline, release a challenge, or publish the hackathon.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", minLength: 1, maxLength: 200 },
          description: { type: "string", maxLength: 5_000 },
          startsAt: { type: "string", format: "date-time", maxLength: 64 },
          endsAt: { type: "string", format: "date-time", maxLength: 64 },
          location: { type: "string", maxLength: 500 },
        },
        required: ["title", "startsAt"],
        additionalProperties: false,
      },
      annotations: { untrustedContentHint: true },
      execute: async (rawInput, { signal }) => {
        const input = parseInput(scheduleItemInput, rawInput)
        const scheduleItem = await sendJson<{
          id: string
          title: string
          description: string | null
          starts_at: string
          ends_at: string | null
          location: string | null
        }>(
          fetcher,
          `/api/dashboard/hackathons/${hackathon.id}/schedule`,
          "POST",
          input,
          signal,
        )
        const inspectUrl = manageHref(hackathon.slug, "tab=overview")
        onChanged(inspectUrl)
        return {
          scheduleItem: {
            title: scheduleItem.title,
            description: scheduleItem.description,
            startsAt: scheduleItem.starts_at,
            endsAt: scheduleItem.ends_at,
            location: scheduleItem.location,
          },
          inspectUrl,
        }
      },
    },
    {
      name: "add_challenge",
      title: "Add challenge",
      description:
        "Add one challenge to the current draft hackathon. This does not release the challenge or publish the hackathon.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", minLength: 1, maxLength: 200 },
          description: { type: "string", maxLength: 10_000 },
        },
        required: ["title"],
        additionalProperties: false,
      },
      annotations: { untrustedContentHint: true },
      execute: async (rawInput, { signal }) => {
        const input = parseInput(challengeInput, rawInput)
        const result = await sendJson<{
          challenge: {
            id: string
            title: string
            description: string | null
          }
        }>(
          fetcher,
          `/api/dashboard/hackathons/${hackathon.id}/challenges`,
          "POST",
          input,
          signal,
        )
        const inspectUrl = manageHref(hackathon.slug, "tab=challenges")
        onChanged(inspectUrl)
        return {
          challenge: {
            title: result.challenge.title,
            description: result.challenge.description,
          },
          inspectUrl,
        }
      },
    },
    {
      name: "add_prize",
      title: "Add prize",
      description:
        "Add one prize to the current draft hackathon. Judging defaults to judges picking projects. This does not assign judges, pick a winner, or publish the hackathon.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", minLength: 1, maxLength: 200 },
          description: { type: "string", maxLength: 5_000 },
          value: { type: "string", maxLength: 200 },
          judgingStyle: {
            type: "string",
            enum: ["judges_pick", "bucket_sort", "crowd_vote"],
          },
          maxPicks: { type: "integer", minimum: 1, maximum: 100 },
        },
        required: ["name"],
        additionalProperties: false,
      },
      annotations: { untrustedContentHint: true },
      execute: async (rawInput, { signal }) => {
        const input = parseInput(prizeInput, rawInput)
        const result = await sendJson<{
          prize: {
            id: string
            name: string
            description: string | null
            value: string | null
            judging_style: string | null
          }
        }>(
          fetcher,
          `/api/dashboard/hackathons/${hackathon.id}/prizes`,
          "POST",
          { ...input, judgingStyle: input.judgingStyle ?? "judges_pick" },
          signal,
        )
        const inspectUrl = manageHref(
          hackathon.slug,
          "tab=judging&jtab=prizes",
        )
        onChanged(inspectUrl)
        return {
          prize: {
            name: result.prize.name,
            description: result.prize.description,
            value: result.prize.value,
            judgingStyle: result.prize.judging_style,
          },
          inspectUrl,
        }
      },
    },
  ]
}

export function createManageHackathonTools(
  dependencies: ManageHackathonToolDependencies,
): WebMcpTool[] {
  const readTools = createReadTools(
    dependencies.context,
    dependencies.onNavigate,
  )
  if (dependencies.context.hackathon.status !== "draft") return readTools
  return [...readTools, ...createDraftWriteTools(dependencies)]
}
