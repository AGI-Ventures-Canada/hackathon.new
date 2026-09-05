import { z } from "zod"
import { defineWebMcpTool } from "@/lib/webmcp/tool"
import { fetchWebMcpJson, type WebMcpFetcher } from "@/lib/webmcp/fetch"
import type { JudgingSetup } from "@/lib/judging/setup"
import { judgingHref } from "@/lib/judging/setup"
import type { JudgingDistributionPreview } from "@/lib/judging/distribution-planner"
import type { JudgeAssignmentOptions, ManualJudgingAssignment } from "@/lib/services/judging-distribution"

const category = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  weight: z.number().min(0).max(100),
  minScore: z.number().min(0),
  maxScore: z.number().min(1),
})
const settings = z.object({
  opensAt: z.string().datetime().nullable().optional(),
  closesAt: z.string().datetime().nullable().optional(),
  timezone: z.string().max(100).optional(),
  instructions: z.string().max(5000).optional(),
  browseEnabled: z.boolean().optional(),
  targetReviewsPerProject: z.number().int().min(1).max(20).optional(),
  remindersEnabled: z.boolean().optional(),
})
const page = {
  offset: z.number().int().nonnegative().default(0),
  limit: z.number().int().min(1).max(3).default(3),
}
function pageOf<T>(items: T[], offset: number, limit: number) {
  return {
    items: items.slice(offset, offset + limit),
    nextOffset: offset + limit < items.length ? offset + limit : null,
    total: items.length,
  }
}

export function createJudgingSetupTools({
  hackathonId,
  slug,
  fetcher,
  navigate,
  refresh,
}: {
  hackathonId: string
  slug: string
  fetcher: WebMcpFetcher
  navigate: (href: string) => void
  refresh: () => void
}) {
  const base = `/api/dashboard/hackathons/${hackathonId}`
  async function request<T>(path: string, method: string, body: unknown, signal: AbortSignal) {
    const result = await fetchWebMcpJson<T>(fetcher, `${base}${path}`, {
      method,
      signal,
      headers: { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    if (method !== "GET" && !path.endsWith("/preview")) refresh()
    return result
  }
  return [
    defineWebMcpTool({
      name: "inspect_judging",
      title: "Inspect judging",
      description:
        "Read judging settings, readiness, scorecards, invitations, or progress for this event. Page through lists with nextOffset.",
      schema: z.object({
        section: z
          .enum([
            "overview",
            "settings",
            "issues",
            "prizes",
            "scorecard",
            "rounds",
            "rooms",
            "judges",
            "invitations",
          ])
          .default("overview"),
        ...page,
      }),
      annotations: { readOnlyHint: true },
      execute: async ({ section, offset, limit }, { signal }) => {
        const { setup } = await request<{ setup: JudgingSetup }>(
          "/judging/setup",
          "GET",
          undefined,
          signal,
        )
        const common = { version: setup.version }
        if (section === "overview")
          return {
            ...common,
            ready: setup.readiness.isReady,
            issues: setup.readiness.issues.length,
            accepted: setup.judges.length,
            invited: setup.invitations.length,
            assigned: setup.progress.totalAssignments,
            finished: setup.progress.completedAssignments,
            opensAt: setup.settings.opensAt,
            closesAt: setup.settings.closesAt,
            settings: judgingHref(slug, "settings"),
          }
        if (section === "settings")
          return {
            ...common,
            ...setup.settings,
            instructions: setup.settings.instructions.slice(0, 600),
          }
        if (section === "issues")
          return {
            ...common,
            ...pageOf(
              setup.readiness.issues.map((issue) => ({
                ...issue,
                message: issue.message.slice(0, 220),
              })),
              offset,
              limit,
            ),
          }
        if (section === "rounds")
          return {
            ...common,
            ...pageOf(
              setup.rounds.map((round) => ({
                id: round.id,
                name: round.name.slice(0, 150),
                status: round.status,
                opensAt: round.opensAt ?? setup.settings.opensAt,
                closesAt: round.closesAt ?? setup.settings.closesAt,
                advancement: round.advancement,
                advancementConfig: round.advancementConfig,
              })),
              offset,
              limit,
            ),
          }
        if (section === "prizes")
          return {
            ...common,
            ...pageOf(
              setup.prizes.map((prize) => ({
                id: prize.id,
                name: prize.name.slice(0, 150),
                method: prize.judging_style,
                reward: prize.value?.slice(0, 100),
                roundId: prize.round_id,
              })),
              offset,
              limit,
            ),
          }
        if (section === "judges")
          return {
            ...common,
            ...pageOf(
              setup.judges.map((judge) => ({
                judgeId: judge.participantId,
                name: judge.displayName.slice(0, 80),
                email: judge.email,
                assigned: judge.assignmentCount,
                finished: judge.completedCount,
              })),
              offset,
              limit,
            ),
          }
        if (section === "rooms")
          return {
            ...common,
            ...pageOf(setup.rooms.map((room) => ({ id: room.id, name: room.name.slice(0, 150) })), offset, limit),
          }
        if (section === "invitations")
          return {
            ...common,
            ...pageOf(
              setup.invitations.map((invite) => ({
                email: invite.email,
                status: invite.status,
                delivery: invite.delivery,
                providerAcceptedAt: invite.emailedAt,
                nextAttemptAt: invite.nextAttemptAt,
                remindAvailableAt: invite.nextReminderAt,
                canRemind: invite.canRemind,
                canRetry: invite.canRetry,
              })),
              offset,
              limit,
            ),
          }
        return {
          ...common,
          ...pageOf(
            [
              ...setup.coreCriteria.map((criterion) => ({ ...criterion, prizeId: null })),
              ...setup.prizeCriteria.flatMap((entry) =>
                entry.criteria.map((criterion) => ({ ...criterion, prizeId: entry.prizeId })),
              ),
            ].map((criterion) => ({
              ...criterion,
              name: criterion.name.slice(0, 100),
              description: criterion.description?.slice(0, 100),
            })),
            offset,
            limit,
          ),
        }
      },
    }),
    defineWebMcpTool({
      name: "configure_judging",
      title: "Configure judging",
      description:
        "Save judging dates and preferences or explicitly apply the four-question starter scorecard. Inspect judging first; reuse requestKey to retry. Existing events are never reset.",
      schema: z.object({
        expectedVersion: z.string().datetime(),
        requestKey: z.string().min(1).max(200),
        settings: settings.optional(),
        applyStarter: z.boolean().optional(),
        starterPrizeName: z.string().min(1).max(200).optional(),
      }),
      annotations: { readOnlyHint: false },
      execute: async (input, { signal }) => {
        const { setup } = await request<{ setup: JudgingSetup }>(
          "/judging/setup",
          "PATCH",
          input,
          signal,
        )
        return {
          status: "saved",
          version: setup.version,
          ready: setup.readiness.isReady,
          issues: setup.readiness.issues.length,
        }
      },
    }),
    defineWebMcpTool({
      name: "save_judging_prize",
      title: "Save a judging prize",
      description:
        "Create a prize or edit its name and reward. Optional questions and groups set its judging method. Rules lock after reviews start; use a new round for scoring changes.",
      schema: z.object({
        prizeId: z.string().uuid().optional(),
        name: z.string().min(1).max(200),
        description: z.string().max(5000).optional(),
        value: z.string().max(500).optional(),
        judgingStyle: z
          .enum(["weighted_score", "gate_check", "bucket_sort", "judges_pick", "crowd_vote"])
          .optional(),
        roundId: z.string().uuid().nullable().optional(),
        criteria: z
          .array(category.partial({ weight: true, minScore: true, maxScore: true }))
          .max(30)
          .optional(),
        buckets: z
          .array(
            z.object({
              id: z.string().uuid().optional(),
              level: z.number().int().min(1),
              label: z.string().min(1).max(100),
              description: z.string().max(2000).nullable().optional(),
            }),
          )
          .max(20)
          .optional(),
        maxPicks: z.number().int().positive().optional(),
      }),
      annotations: { readOnlyHint: false },
      execute: async ({ prizeId, ...input }, { signal }) => {
        const result = await request<{ prize: { id: string; name: string } }>(
          `/prizes${prizeId ? `/${prizeId}` : ""}`,
          prizeId ? "PATCH" : "POST",
          {
            ...input,
            ...(!prizeId && !input.judgingStyle ? { judgingStyle: "weighted_score" } : {}),
          },
          signal,
        )
        return { status: "saved", prizeId: result.prize.id, name: result.prize.name.slice(0, 200) }
      },
    }),
    defineWebMcpTool({
      name: "save_judging_category",
      title: "Save a scorecard category",
      description:
        "Create or edit a shared scorecard question. Preserve its id when editing. Its weight applies alongside each prize's extra questions and must total 100% to open judging.",
      schema: category,
      annotations: { readOnlyHint: false },
      execute: async ({ id, ...input }, { signal }) => {
        await request(`/core-criteria${id ? `/${id}` : ""}`, id ? "PATCH" : "POST", input, signal)
        return { status: "saved" }
      },
    }),
    defineWebMcpTool({
      name: "save_judging_round",
      title: "Save a judging round",
      description:
        "Create or edit an optional round. Choose who moves on; advancing actual projects remains a separate explicit action. Null dates inherit the event judging window.",
      schema: z.object({
        roundId: z.string().uuid().optional(),
        name: z.string().min(1).max(200).optional(),
        opensAt: z.string().datetime().nullable().optional(),
        closesAt: z.string().datetime().nullable().optional(),
        advancement: z.enum(["manual", "top_n", "threshold"]).optional(),
        advancementConfig: z
          .object({
            topN: z.number().int().positive().optional(),
            threshold: z.number().optional(),
          })
          .optional(),
      }),
      annotations: { readOnlyHint: false },
      execute: async ({ roundId, ...input }, { signal }) => {
        const result = await request<{ round: { id: string; name: string } }>(
          `/rounds${roundId ? `/${roundId}` : ""}`,
          roundId ? "PATCH" : "POST",
          input,
          signal,
        )
        return { status: "saved", roundId: result.round.id, name: result.round.name.slice(0, 200) }
      },
    }),
    defineWebMcpTool({
      name: "invite_judging_panel",
      title: "Invite judges",
      description:
        "Preview or send invitations to up to three people per call. Registered eligible people can be added directly. Draft-event emails are queued. Reuse requestKey for retries; retry only failed recipients.",
      schema: z.object({
        emails: z.array(z.string().max(254)).min(1).max(3),
        preview: z.boolean().default(true),
        retryFailed: z.boolean().optional(),
        requestKey: z.string().uuid().optional(),
        message: z.string().max(1000).optional(),
        prizeIds: z.array(z.string().uuid()).max(20).optional(),
        roomIds: z.array(z.string().uuid()).max(20).optional(),
      }),
      annotations: { readOnlyHint: false },
      execute: (input, { signal }) => request("/judging/judges/batch", "POST", input, signal),
    }),
    defineWebMcpTool({
      name: "remind_judging_panel",
      title: "Remind judges",
      description:
        "Preview or remind up to three judges. Checks pending invitations, unfinished reviews, reminder preferences, and cooldowns. Reuse requestKey to retry; each result says whether the reminder was sent, queued, or blocked.",
      schema: z.object({
        emails: z.array(z.string().max(254)).min(1).max(3),
        preview: z.boolean().default(true),
        requestKey: z.string().uuid().optional(),
      }),
      annotations: { readOnlyHint: false },
      execute: (input, { signal }) => request("/judging/judges/remind", "POST", input, signal),
    }),
    defineWebMcpTool({
      name: "inspect_judge_scope",
      title: "Inspect a judge's prizes and rooms",
      description: "Read this judge's scope and its version before editing. Page through prize and room options by name.",
      schema: z.object({ judgeId: z.string().uuid(), section: z.enum(["overview", "prizes", "rooms"]).default("overview"), ...page }),
      annotations: { readOnlyHint: true },
      execute: async ({ judgeId, section, offset, limit }, { signal }) => {
        const { options } = await request<{ options: JudgeAssignmentOptions }>(`/judging/judges/${judgeId}/scope`, "GET", undefined, signal)
        return { version: options.version, locked: options.locked, prizeScope: options.prizeScope,
          ...(section === "overview" ? { selectedPrizes: options.prizeIds.length, selectedRooms: options.roomIds.length } : pageOf((section === "prizes" ? options.prizes : options.rooms).map((item) => ({ id: item.id, name: item.name.slice(0, 100), selected: (section === "prizes" ? options.prizeIds : options.roomIds).includes(item.id) })), offset, limit)) }
      },
    }),
    defineWebMcpTool({
      name: "save_judge_scope",
      title: "Set a judge's prizes and rooms",
      description: "Save the complete selected prize and room lists with the inspected version. Empty rooms means all rooms. Submitted work locks scope changes.",
      schema: z.object({ judgeId: z.string().uuid(), expectedVersion: z.string().min(1), prizeScope: z.enum(["all", "selected"]), prizeIds: z.array(z.string().uuid()).max(100), roomIds: z.array(z.string().uuid()).max(100) }),
      annotations: { readOnlyHint: false },
      execute: async ({ judgeId, ...input }, { signal }) => {
        await request(`/judging/judges/${judgeId}/scope`, "PATCH", input, signal)
        return { status: "saved" }
      },
    }),
    defineWebMcpTool({
      name: "inspect_judge_projects",
      title: "Inspect a judge's project assignments",
      description: "List projects and whether this judge can review them. Omit prizeId for shared scoring; supply it for a requirements or group prize.",
      schema: z.object({ judgeId: z.string().uuid(), prizeId: z.string().uuid().optional(), ...page }),
      annotations: { readOnlyHint: true },
      execute: async ({ judgeId, prizeId, offset, limit }, { signal }) => {
        const { submissions } = await request<{ submissions: ManualJudgingAssignment[] }>(`/judging/judges/${judgeId}/submissions${prizeId ? `?prizeId=${prizeId}` : ""}`, "GET", undefined, signal)
        return pageOf(submissions.map((item) => ({ projectId: item.submissionId, title: item.projectTitle.slice(0, 100), assigned: item.isAssigned, finished: item.isComplete, canAssign: item.canAssign, reason: item.blockedReason?.slice(0, 120) })), offset, limit)
      },
    }),
    defineWebMcpTool({
      name: "assign_judge_project",
      title: "Adjust one judge's project assignment",
      description: "Explicitly add or remove one assignment. Existing submitted reviews cannot be removed. Inspect project eligibility first; repeated additions are safe.",
      schema: z.object({ judgeId: z.string().uuid(), projectId: z.string().uuid(), prizeId: z.string().uuid().optional(), assigned: z.boolean() }),
      annotations: { readOnlyHint: false },
      execute: async ({ judgeId, projectId, prizeId, assigned }, { signal }) => {
        const result = await request<{ alreadyAssigned?: boolean }>(`/judging/judges/${judgeId}/submissions/${projectId}${prizeId ? `?prizeId=${prizeId}` : ""}`, assigned ? "POST" : "DELETE", undefined, signal)
        return { status: assigned ? "assigned" : "removed", alreadyAssigned: result.alreadyAssigned ?? false }
      },
    }),
    defineWebMcpTool({
      name: "preview_judging_work",
      title: "Preview judging assignments",
      description:
        "Preview balanced assignments without saving. Reports coverage, workloads, version and issues. Applying only adds missing work. Page through project coverage or judges.",
      schema: z.object({
        judgesPerProject: z.number().int().min(1).max(20).default(3),
        section: z.enum(["overview", "coverage", "workload"]).default("overview"),
        ...page,
      }),
      annotations: { readOnlyHint: true },
      execute: async ({ judgesPerProject, section, offset, limit }, { signal }) => {
        const { preview } = await request<{ preview: JudgingDistributionPreview }>(
          "/judging/distribution/preview",
          "POST",
          { targetReviewsPerProject: judgesPerProject },
          signal,
        )
        return {
          version: preview.version,
          target: preview.targetReviewsPerProject,
          ...(section === "overview"
            ? {
                newAssignments: preview.assignments.length,
                uncovered: preview.coverage.filter((row) => row.assigned + row.planned === 0)
                  .length,
                warnings: preview.warnings.slice(0, 2).map((message) => message.slice(0, 240)),
              }
            : section === "coverage"
              ? pageOf(
                  preview.coverage.map((row) => ({
                    ...row,
                    projectTitle: row.projectTitle.slice(0, 80),
                    prizeName: row.prizeName.slice(0, 80),
                  })),
                  offset,
                  limit,
                )
              : pageOf(preview.workload, offset, limit)),
        }
      },
    }),
    defineWebMcpTool({
      name: "apply_judging_work",
      title: "Assign judging projects",
      description:
        "Apply the current distribution preview. Existing assignments and reviews stay in place. Reuse requestKey to retry this exact preview.",
      schema: z.object({
        judgesPerProject: z.number().int().min(1).max(20),
        expectedVersion: z.string().min(1),
        requestKey: z.string().min(8).max(100),
      }),
      annotations: { readOnlyHint: false },
      execute: async ({ judgesPerProject, ...input }, { signal }) => {
        const result = await request<{ createdAssignments: number; createdCoverage: number }>(
          "/judging/distribution/apply",
          "POST",
          { ...input, targetReviewsPerProject: judgesPerProject },
          signal,
        )
        return {
          status: "saved",
          createdAssignments: result.createdAssignments,
          createdCoverage: result.createdCoverage,
        }
      },
    }),
    defineWebMcpTool({
      name: "open_judging_settings",
      title: "Open judging settings",
      description: "Open judging overview, settings, judges, or results for this event.",
      schema: z.object({
        destination: z.enum(["overview", "settings", "judges", "results"]).default("settings"),
      }),
      annotations: { readOnlyHint: true },
      execute: ({ destination }) => {
        const href = judgingHref(slug, destination)
        navigate(href)
        return { status: "opened", href }
      },
    }),
  ]
}
