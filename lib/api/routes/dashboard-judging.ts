import { Elysia, t } from "elysia"
import { resolvePrincipal, requirePrincipal } from "@/lib/auth/principal"
import { logAudit } from "@/lib/services/audit"
import { resolveAdderName } from "@/lib/auth/resolve-adder-name"
import { checkRateLimit, RateLimitError } from "@/lib/services/rate-limit"

type CachedAuthResult = { status: "ok" } | { status: "not_found" } | { status: "not_authorized" }
// Local-dev-only optimisation: avoids repeated checkHackathonOrganizer calls
// during rapid judge search typing. On Vercel (short-lived lambdas) the cache
// won't persist across invocations, so this is effectively a no-op in prod.
const SEARCH_AUTH_MAX = 500
const searchAuthCache = new Map<string, { result: CachedAuthResult; expires: number }>()
const SEARCH_AUTH_TTL = 30_000

export const dashboardJudgingRoutes = new Elysia()
  .derive(async ({ request }) => {
    const principal = await resolvePrincipal(request)
    return { principal }
  })

  // ============================================================
  // Prizes (the primary judging unit)
  // ============================================================

  .get("/hackathons/:id/prizes", async ({ principal, params }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:read"])

    const { checkHackathonOrganizer } = await import("@/lib/services/public-hackathons")
    const result = await checkHackathonOrganizer(params.id, principal.tenantId)

    if (result.status === "not_found") {
      return new Response(JSON.stringify({ error: "Hackathon not found" }), { status: 404, headers: { "Content-Type": "application/json" } })
    }
    if (result.status === "not_authorized") {
      return new Response(JSON.stringify({ error: "Not authorized" }), { status: 403, headers: { "Content-Type": "application/json" } })
    }

    const { listPrizes } = await import("@/lib/services/judging")
    const prizes = await listPrizes(params.id)

    return { prizes }
  }, {
    detail: { summary: "List prizes", description: "Lists all prizes with judging details, progress, and assigned judges." },
  })

  .post(
    "/hackathons/:id/prizes",
    async ({ principal, params, body }) => {
      requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])

      const { checkHackathonOrganizer } = await import("@/lib/services/public-hackathons")
      const result = await checkHackathonOrganizer(params.id, principal.tenantId)

      if (result.status === "not_found") {
        return new Response(JSON.stringify({ error: "Hackathon not found" }), { status: 404, headers: { "Content-Type": "application/json" } })
      }
      if (result.status === "not_authorized") {
        return new Response(JSON.stringify({ error: "Not authorized" }), { status: 403, headers: { "Content-Type": "application/json" } })
      }

      if (body.judgingStyle === "gate_check") {
        const nonEmpty = (body.criteria ?? []).filter((c) => c.name.trim().length > 0)
        if (nonEmpty.length === 0) {
          return new Response(
            JSON.stringify({
              error: "At least one criterion is required for pass-or-fail prizes",
            }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          )
        }
      }

      // weighted_score sum mismatches are surfaced as warnings client-side, not blocking errors.

      const { createPrize } = await import("@/lib/services/judging")
      const createResult = await createPrize(params.id, {
        name: body.name,
        description: body.description,
        value: body.value,
        judgingStyle: body.judgingStyle as
          | "bucket_sort"
          | "gate_check"
          | "crowd_vote"
          | "judges_pick"
          | "weighted_score"
          | undefined,
        roundId: body.roundId,
        assignmentMode: body.assignmentMode as "organizer_assigned" | "self_select" | undefined,
        maxPicks: body.maxPicks,
        displayOrder: body.displayOrder,
        criteria: body.criteria,
        buckets: body.buckets,
        type: body.type as "score" | "favorite" | "crowd" | "criteria" | undefined,
        rank: body.rank,
        kind: body.kind,
        monetaryValue: body.monetaryValue,
        currency: body.currency,
        criteriaId: body.criteriaId,
        distributionMethod: body.distributionMethod,
        displayValue: body.displayValue,
      })

      if (!createResult.success) {
        return new Response(JSON.stringify({ error: createResult.error }), {
          status: createResult.code === "validation" ? 400 : 500,
          headers: { "Content-Type": "application/json" },
        })
      }

      const prize = createResult.prize


      logAudit({
        principal,
        action: "prize.created",
        resourceType: "prize",
        resourceId: prize.id,
        metadata: { name: prize.name, judgingStyle: prize.judging_style },
      })

      return { prize }
    },
    {
      body: t.Object({
        name: t.String({ description: "Prize name" }),
        description: t.Optional(t.Union([t.String(), t.Null()], { description: "Prize description" })),
        value: t.Optional(t.Union([t.String(), t.Null()], { description: "Prize value (e.g. '$5000')" })),
        judgingStyle: t.Optional(t.String({ description: "bucket_sort | gate_check | crowd_vote | judges_pick" })),
        roundId: t.Optional(t.Nullable(t.String({ description: "Round ID this prize belongs to" }))),
        assignmentMode: t.Optional(t.String({ description: "organizer_assigned | self_select" })),
        maxPicks: t.Optional(
          t.Integer({
            minimum: 1,
            maximum: 100,
            description: "Max picks per judge (for judges_pick)",
          })
        ),
        displayOrder: t.Optional(t.Number({ description: "Display order" })),
        criteria: t.Optional(
          t.Array(
            t.Object({
              name: t.String(),
              description: t.Optional(t.Nullable(t.String())),
              weight: t.Optional(t.Number({ minimum: 0, maximum: 100 })),
              minScore: t.Optional(t.Number({ minimum: 0 })),
              maxScore: t.Optional(t.Number({ minimum: 1 })),
            }),
            { description: "Pass/fail criteria. Required when judgingStyle is 'gate_check'." }
          )
        ),
        buckets: t.Optional(
          t.Array(
            t.Object({
              level: t.Number(),
              label: t.String(),
              description: t.Optional(t.Nullable(t.String())),
            }),
            { description: "Sort groups for 'bucket_sort'. Defaults are used when omitted." }
          )
        ),
        type: t.Optional(t.Union([t.Literal("score"), t.Literal("favorite"), t.Literal("crowd"), t.Literal("criteria")])),
        rank: t.Optional(t.Union([t.Number(), t.Null()])),
        kind: t.Optional(t.String()),
        monetaryValue: t.Optional(t.Union([t.Number(), t.Null()])),
        currency: t.Optional(t.Union([t.String(), t.Null()])),
        criteriaId: t.Optional(t.Union([t.String(), t.Null()])),
        distributionMethod: t.Optional(t.Union([t.String(), t.Null()])),
        displayValue: t.Optional(t.Union([t.String(), t.Null()])),
      }),
      detail: {
        summary: "Create prize",
        description:
          "Creates a new prize. Accepts judgingStyle with criteria/buckets for judging tab, or legacy type/rank/kind fields from edit drawer.",
      },
    }
  )

  .patch(
    "/hackathons/:id/prizes/:prizeId",
    async ({ principal, params, body }) => {
      requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])

      const { checkHackathonOrganizer } = await import("@/lib/services/public-hackathons")
      const result = await checkHackathonOrganizer(params.id, principal.tenantId)

      if (result.status === "not_found") {
        return new Response(JSON.stringify({ error: "Hackathon not found" }), { status: 404, headers: { "Content-Type": "application/json" } })
      }
      if (result.status === "not_authorized") {
        return new Response(JSON.stringify({ error: "Not authorized" }), { status: 403, headers: { "Content-Type": "application/json" } })
      }

      const effectiveStyle = (body.judgingStyle ?? undefined) as
        | import("@/lib/db/hackathon-types").PrizeJudgingStyle
        | undefined

      if (body.criteria !== undefined) {
        const nonEmpty = body.criteria.filter((c) => c.name.trim().length > 0)
        if (effectiveStyle !== "weighted_score" && nonEmpty.length === 0) {
          return new Response(
            JSON.stringify({
              error: "At least one criterion is required for pass-or-fail prizes",
            }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          )
        }
      }

      if (body.buckets !== undefined) {
        const nonEmpty = body.buckets.filter((b) => b.label.trim().length > 0)
        if (nonEmpty.length < 2) {
          return new Response(
            JSON.stringify({ error: "Sort groups need at least two named labels" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          )
        }
      }

      const { updatePrize, replacePrizeCriteria, replaceBucketDefinitions } = await import(
        "@/lib/services/judging"
      )
      const prize = await updatePrize(params.prizeId, params.id, {
        name: body.name,
        description: body.description,
        value: body.value,
        judgingStyle: effectiveStyle,
        roundId: body.roundId,
        assignmentMode: body.assignmentMode as import("@/lib/db/hackathon-types").PrizeAssignmentMode | undefined,
        maxPicks: body.maxPicks,
        displayOrder: body.displayOrder,
        type: body.type as "score" | "favorite" | "crowd" | "criteria" | undefined,
        rank: body.rank,
        kind: body.kind ?? undefined,
        monetaryValue: body.monetaryValue,
        currency: body.currency,
        criteriaId: body.criteriaId,
        distributionMethod: body.distributionMethod,
        displayValue: body.displayValue,
      })

      if (!prize) {
        return new Response(JSON.stringify({ error: "Prize not found" }), { status: 404, headers: { "Content-Type": "application/json" } })
      }

      if (body.criteria !== undefined) {
        if (
          effectiveStyle === "weighted_score" &&
          body.criteria.some((c) => c.name.trim().length > 0 && (c.weight ?? 0) <= 0)
        ) {
          return new Response(
            JSON.stringify({ error: "Each weighted criterion needs a weight greater than zero" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          )
        }
        const updatedCriteria = await replacePrizeCriteria(
          params.id,
          params.prizeId,
          body.criteria,
          { style: effectiveStyle ?? null }
        )
        if (updatedCriteria === null) {
          return new Response(
            JSON.stringify({ error: "Failed to save criteria" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          )
        }
      }

      if (body.buckets !== undefined) {
        const updatedBuckets = await replaceBucketDefinitions(
          params.prizeId,
          body.buckets.map((b, i) => ({
            level: b.level ?? i + 1,
            label: b.label.trim(),
            description: b.description?.trim() || null,
          }))
        )
        if (updatedBuckets.length === 0) {
          return new Response(
            JSON.stringify({ error: "Failed to save sort groups" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          )
        }
      }

      return { prize }
    },
    {
      body: t.Object({
        name: t.Optional(t.String()),
        description: t.Optional(t.Nullable(t.String())),
        value: t.Optional(t.Nullable(t.String())),
        judgingStyle: t.Optional(t.String()),
        roundId: t.Optional(t.Nullable(t.String())),
        assignmentMode: t.Optional(t.String()),
        maxPicks: t.Optional(t.Integer({ minimum: 1, maximum: 100 })),
        displayOrder: t.Optional(t.Number()),
        criteria: t.Optional(
          t.Array(
            t.Object({
              name: t.String(),
              description: t.Optional(t.Nullable(t.String())),
              weight: t.Optional(t.Number({ minimum: 0, maximum: 100 })),
              minScore: t.Optional(t.Number({ minimum: 0 })),
              maxScore: t.Optional(t.Number({ minimum: 1 })),
            }),
            { description: "Replace all pass/fail criteria for this prize." }
          )
        ),
        buckets: t.Optional(
          t.Array(
            t.Object({
              level: t.Number(),
              label: t.String(),
              description: t.Optional(t.Nullable(t.String())),
            }),
            { description: "Replace all sort groups for this prize." }
          )
        ),
        type: t.Optional(t.Union([t.Literal("score"), t.Literal("favorite"), t.Literal("crowd"), t.Literal("criteria")])),
        rank: t.Optional(t.Union([t.Number(), t.Null()])),
        kind: t.Optional(t.Nullable(t.String())),
        monetaryValue: t.Optional(t.Union([t.Number(), t.Null()])),
        currency: t.Optional(t.Nullable(t.String())),
        criteriaId: t.Optional(t.Nullable(t.String())),
        distributionMethod: t.Optional(t.Nullable(t.String())),
        displayValue: t.Optional(t.Nullable(t.String())),
      }),
      detail: {
        summary: "Update prize",
        description:
          "Updates a prize's properties. When 'criteria' is provided, replaces all criteria for the prize (must be non-empty if sent). When 'buckets' is provided, replaces all sort groups (minimum 2 named labels).",
      },
    }
  )

  .delete("/hackathons/:id/prizes/:prizeId", async ({ principal, params }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])

    const { checkHackathonOrganizer } = await import("@/lib/services/public-hackathons")
    const result = await checkHackathonOrganizer(params.id, principal.tenantId)

    if (result.status === "not_found") {
      return new Response(JSON.stringify({ error: "Hackathon not found" }), { status: 404, headers: { "Content-Type": "application/json" } })
    }
    if (result.status === "not_authorized") {
      return new Response(JSON.stringify({ error: "Not authorized" }), { status: 403, headers: { "Content-Type": "application/json" } })
    }

    const { deletePrize } = await import("@/lib/services/judging")
    const deleted = await deletePrize(params.prizeId, params.id)

    if (!deleted) {
      return new Response(JSON.stringify({ error: "Failed to delete prize" }), { status: 500, headers: { "Content-Type": "application/json" } })
    }

    logAudit({
      principal,
      action: "prize.deleted",
      resourceType: "prize",
      resourceId: params.prizeId,
    })

    return { success: true }
  }, {
    detail: { summary: "Delete prize", description: "Deletes a prize and all its assignments, responses, and results." },
  })

  .get("/hackathons/:id/prizes/:prizeId", async ({ principal, params }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:read"])

    const { checkHackathonOrganizer } = await import("@/lib/services/public-hackathons")
    const result = await checkHackathonOrganizer(params.id, principal.tenantId)

    if (result.status === "not_found") {
      return new Response(JSON.stringify({ error: "Hackathon not found" }), { status: 404, headers: { "Content-Type": "application/json" } })
    }
    if (result.status === "not_authorized") {
      return new Response(JSON.stringify({ error: "Not authorized" }), { status: 403, headers: { "Content-Type": "application/json" } })
    }

    const { getPrizeDetails } = await import("@/lib/services/judging")
    const prize = await getPrizeDetails(params.prizeId)

    if (!prize) {
      return new Response(JSON.stringify({ error: "Prize not found" }), { status: 404, headers: { "Content-Type": "application/json" } })
    }

    return { prize }
  }, {
    detail: { summary: "Get prize details", description: "Returns full prize details including buckets, judges, and progress." },
  })

  .post(
    "/hackathons/:id/prizes/:prizeId/assign-judge",
    async ({ principal, params, body }) => {
      requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])

      const { checkHackathonOrganizer } = await import("@/lib/services/public-hackathons")
      const result = await checkHackathonOrganizer(params.id, principal.tenantId)

      if (result.status === "not_found") {
        return new Response(JSON.stringify({ error: "Hackathon not found" }), { status: 404, headers: { "Content-Type": "application/json" } })
      }
      if (result.status === "not_authorized") {
        return new Response(JSON.stringify({ error: "Not authorized" }), { status: 403, headers: { "Content-Type": "application/json" } })
      }

      const { assignJudgeToPrize } = await import("@/lib/services/judging")
      const assigned = await assignJudgeToPrize(params.id, body.judgeParticipantId, params.prizeId)

      if (!assigned.success) {
        return new Response(JSON.stringify({ error: assigned.error ?? "Failed to assign judge" }), { status: 400, headers: { "Content-Type": "application/json" } })
      }


      return assigned
    },
    {
      body: t.Object({
        judgeParticipantId: t.String({ description: "Judge participant ID" }),
      }),
      detail: { summary: "Assign judge to prize", description: "Assigns a judge to evaluate all submissions for a prize." },
    }
  )

  .delete(
    "/hackathons/:id/prizes/:prizeId/judges/:judgeParticipantId",
    async ({ principal, params }) => {
      requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])

      const { checkHackathonOrganizer } = await import("@/lib/services/public-hackathons")
      const result = await checkHackathonOrganizer(params.id, principal.tenantId)

      if (result.status === "not_found") {
        return new Response(JSON.stringify({ error: "Hackathon not found" }), { status: 404, headers: { "Content-Type": "application/json" } })
      }
      if (result.status === "not_authorized") {
        return new Response(JSON.stringify({ error: "Not authorized" }), { status: 403, headers: { "Content-Type": "application/json" } })
      }

      const { removeJudgeFromPrize } = await import("@/lib/services/judging")
      const removed = await removeJudgeFromPrize(params.id, params.judgeParticipantId, params.prizeId)

      return removed
    },
    {
      detail: { summary: "Remove judge from prize", description: "Removes a judge from a specific prize." },
    }
  )

  .post(
    "/hackathons/:id/prizes/:prizeId/auto-assign",
    async ({ principal, params, body }) => {
      requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])

      const { checkHackathonOrganizer } = await import("@/lib/services/public-hackathons")
      const result = await checkHackathonOrganizer(params.id, principal.tenantId)

      if (result.status === "not_found") {
        return new Response(JSON.stringify({ error: "Hackathon not found" }), { status: 404, headers: { "Content-Type": "application/json" } })
      }
      if (result.status === "not_authorized") {
        return new Response(JSON.stringify({ error: "Not authorized" }), { status: 403, headers: { "Content-Type": "application/json" } })
      }

      const { autoAssignJudges } = await import("@/lib/services/judging")
      const assigned = await autoAssignJudges(params.id, params.prizeId, body.submissionsPerJudge, {
        roomId: body.roomId ?? null,
      })

      return assigned
    },
    {
      body: t.Object({
        submissionsPerJudge: t.Number({ description: "Number of submissions each judge should evaluate" }),
        roomId: t.Optional(t.String({ description: "Limit assignments to projects from this room only" })),
      }),
      detail: { summary: "Auto-assign judges", description: "Automatically distributes submissions across judges for a prize. When roomId is provided, only projects from that room are considered." },
    }
  )

  .post("/hackathons/:id/prizes/:prizeId/calculate-results", async ({ principal, params }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])

    const { checkHackathonOrganizer } = await import("@/lib/services/public-hackathons")
    const result = await checkHackathonOrganizer(params.id, principal.tenantId)

    if (result.status === "not_found") {
      return new Response(JSON.stringify({ error: "Hackathon not found" }), { status: 404, headers: { "Content-Type": "application/json" } })
    }
    if (result.status === "not_authorized") {
      return new Response(JSON.stringify({ error: "Not authorized" }), { status: 403, headers: { "Content-Type": "application/json" } })
    }

    const { calculatePrizeResults } = await import("@/lib/services/judging")
    const calcResult = await calculatePrizeResults(params.id, params.prizeId)

    return calcResult
  }, {
    detail: { summary: "Calculate prize results", description: "Calculates and stores ranked results for a prize based on its judging style." },
  })

  .put(
    "/hackathons/:id/prizes/:prizeId/buckets",
    async ({ principal, params, body }) => {
      requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])

      const { checkHackathonOrganizer } = await import("@/lib/services/public-hackathons")
      const result = await checkHackathonOrganizer(params.id, principal.tenantId)

      if (result.status === "not_found") {
        return new Response(JSON.stringify({ error: "Hackathon not found" }), { status: 404, headers: { "Content-Type": "application/json" } })
      }
      if (result.status === "not_authorized") {
        return new Response(JSON.stringify({ error: "Not authorized" }), { status: 403, headers: { "Content-Type": "application/json" } })
      }

      const { replaceBucketDefinitions } = await import("@/lib/services/judging")
      const buckets = await replaceBucketDefinitions(params.prizeId, body.buckets)

      return { buckets }
    },
    {
      body: t.Object({
        buckets: t.Array(t.Object({
          level: t.Number(),
          label: t.String(),
          description: t.Optional(t.Nullable(t.String())),
        })),
      }),
      detail: { summary: "Replace bucket definitions", description: "Replaces all bucket definitions for a bucket_sort prize." },
    }
  )

  // ============================================================
  // Rounds (hackathon-level)
  // ============================================================

  .get("/hackathons/:id/rounds", async ({ principal, params }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:read"])

    const { checkHackathonOrganizer } = await import("@/lib/services/public-hackathons")
    const result = await checkHackathonOrganizer(params.id, principal.tenantId)

    if (result.status === "not_found") {
      return new Response(JSON.stringify({ error: "Hackathon not found" }), { status: 404, headers: { "Content-Type": "application/json" } })
    }
    if (result.status === "not_authorized") {
      return new Response(JSON.stringify({ error: "Not authorized" }), { status: 403, headers: { "Content-Type": "application/json" } })
    }

    const { listRounds } = await import("@/lib/services/judging")
    const rounds = await listRounds(params.id)

    return { rounds }
  }, {
    detail: { summary: "List rounds", description: "Lists all judging rounds for a hackathon." },
  })

  .post(
    "/hackathons/:id/rounds",
    async ({ principal, params, body }) => {
      requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])

      const { checkHackathonOrganizer } = await import("@/lib/services/public-hackathons")
      const result = await checkHackathonOrganizer(params.id, principal.tenantId)

      if (result.status === "not_found") {
        return new Response(JSON.stringify({ error: "Hackathon not found" }), { status: 404, headers: { "Content-Type": "application/json" } })
      }
      if (result.status === "not_authorized") {
        return new Response(JSON.stringify({ error: "Not authorized" }), { status: 403, headers: { "Content-Type": "application/json" } })
      }

      const { createRound } = await import("@/lib/services/judging")
      const round = await createRound(params.id, {
        name: body.name,
        advancement: body.advancement,
        advancementConfig: body.advancementConfig,
      })

      if (!round) {
        return new Response(JSON.stringify({ error: "Failed to create round" }), { status: 500, headers: { "Content-Type": "application/json" } })
      }

      return { round }
    },
    {
      body: t.Object({
        name: t.String({ description: "Round name (e.g. 'Semifinals', 'Finals')" }),
        advancement: t.Optional(
          t.Union([t.Literal("manual"), t.Literal("top_n"), t.Literal("threshold")], {
            description: "How submissions move from this round to the next",
          })
        ),
        advancementConfig: t.Optional(
          t.Object(
            {
              topN: t.Optional(t.Number({ description: "Number of submissions to advance (for top_n)" })),
              threshold: t.Optional(t.Number({ description: "Minimum score to advance (for threshold)" })),
            },
            { description: "Configuration for the advancement rule" }
          )
        ),
      }),
      detail: {
        summary: "Create round",
        description:
          "Creates a new judging round. Pass `advancement: 'top_n'` with `advancementConfig.topN` to auto-narrow by score.",
      },
    }
  )

  .post(
    "/hackathons/:id/rounds/preset",
    async ({ principal, params, body }) => {
      requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])

      const { checkHackathonOrganizer } = await import("@/lib/services/public-hackathons")
      const result = await checkHackathonOrganizer(params.id, principal.tenantId)

      if (result.status === "not_found") {
        return new Response(JSON.stringify({ error: "Hackathon not found" }), { status: 404, headers: { "Content-Type": "application/json" } })
      }
      if (result.status === "not_authorized") {
        return new Response(JSON.stringify({ error: "Not authorized" }), { status: 403, headers: { "Content-Type": "application/json" } })
      }

      const { createRoundsPreset } = await import("@/lib/services/judging")
      const preset = await createRoundsPreset(params.id, {
        preset: body.preset,
        advanceTopN: body.advanceTopN,
        threshold: body.threshold,
        round1Name: body.round1Name,
        round2Name: body.round2Name,
        seedScreeningPrize: body.seedScreeningPrize,
        prizeName: body.prizeName,
        maxPicks: body.maxPicks,
      })

      if (!preset.success) {
        return new Response(JSON.stringify({ error: preset.error }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })
      }

      return preset
    },
    {
      body: t.Object({
        preset: t.Union(
          [
            t.Literal("single"),
            t.Literal("shortlist"),
            t.Literal("threshold"),
            t.Literal("finalists_pick"),
          ],
          { description: "Which starter template to use" }
        ),
        advanceTopN: t.Optional(
          t.Number({ description: "Required for 'shortlist'. How many submissions move on from round 1" })
        ),
        threshold: t.Optional(
          t.Number({ description: "Required for 'threshold'. Submissions scoring this or higher move on" })
        ),
        round1Name: t.Optional(t.String({ description: "Name of the first round. Defaults per preset." })),
        round2Name: t.Optional(t.String({ description: "Name of the second round. Ignored for 'single' and 'finalists_pick'." })),
        seedScreeningPrize: t.Optional(
          t.Boolean({
            description:
              "When true (default), seeds a hidden helper prize so judges have something to score in round 1. Ignored for 'single' and 'finalists_pick'.",
          })
        ),
        prizeName: t.Optional(
          t.String({ description: "Used by 'finalists_pick'. Name of the judges_pick prize. Defaults to 'Grand Prize'." })
        ),
        maxPicks: t.Optional(
          t.Integer({ minimum: 1, maximum: 50, description: "Used by 'finalists_pick'. How many projects each judge picks (1-50). Defaults to 1." })
        ),
      }),
      detail: {
        summary: "Create a judging rounds preset",
        description:
          "Creates a starter template of rounds in one call. 'single' creates one round. 'shortlist' creates two rounds where the top N by score advance. 'threshold' creates two rounds where everyone scoring above a bar advances. 'finalists_pick' creates one manual round with a judges_pick prize for vibes-based selection. All rounds are fully editable after creation.",
      },
    }
  )

  .post(
    "/hackathons/:id/rounds/finalists-preset",
    async ({ principal, params, body }) => {
      requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])

      const { checkHackathonOrganizer } = await import("@/lib/services/public-hackathons")
      const result = await checkHackathonOrganizer(params.id, principal.tenantId)

      if (result.status === "not_found") {
        return new Response(JSON.stringify({ error: "Hackathon not found" }), { status: 404, headers: { "Content-Type": "application/json" } })
      }
      if (result.status === "not_authorized") {
        return new Response(JSON.stringify({ error: "Not authorized" }), { status: 403, headers: { "Content-Type": "application/json" } })
      }

      const { createFinalistsPreset } = await import("@/lib/services/judging")
      const preset = await createFinalistsPreset(params.id, {
        advanceTopN: body.advanceTopN,
        round1Name: body.round1Name,
        round2Name: body.round2Name,
        seedScreeningPrize: body.seedScreeningPrize,
      })

      if (!preset.success) {
        return new Response(JSON.stringify({ error: preset.error }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })
      }

      return preset
    },
    {
      body: t.Object({
        advanceTopN: t.Number({ description: "How many finalists advance from round 1 to round 2" }),
        round1Name: t.Optional(t.String({ description: "Defaults to 'Semifinals'" })),
        round2Name: t.Optional(t.String({ description: "Defaults to 'Finals'" })),
        seedScreeningPrize: t.Optional(
          t.Boolean({
            description:
              "When true (default), seeds a hidden bucket_sort prize in round 1 used to drive the top-N advancement",
          })
        ),
      }),
      detail: {
        summary: "Create finalists-judging preset (legacy alias for /rounds/preset with preset='shortlist')",
        description:
          "Creates two rounds (Semifinals → Finals) and a hidden screening prize in one call. Round 1 uses top_n advancement with the given count; round 2 uses manual. Prefer /rounds/preset for new integrations.",
      },
    }
  )

  .patch(
    "/hackathons/:id/rounds/:roundId",
    async ({ principal, params, body }) => {
      requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])

      const { checkHackathonOrganizer } = await import("@/lib/services/public-hackathons")
      const result = await checkHackathonOrganizer(params.id, principal.tenantId)

      if (result.status === "not_found") {
        return new Response(JSON.stringify({ error: "Hackathon not found" }), { status: 404, headers: { "Content-Type": "application/json" } })
      }
      if (result.status === "not_authorized") {
        return new Response(JSON.stringify({ error: "Not authorized" }), { status: 403, headers: { "Content-Type": "application/json" } })
      }

      const { updateRound } = await import("@/lib/services/judging")
      const updated = await updateRound(params.roundId, body)

      return { success: updated }
    },
    {
      body: t.Object({
        name: t.Optional(t.String()),
        status: t.Optional(t.String()),
        advancement: t.Optional(
          t.Union([t.Literal("manual"), t.Literal("top_n"), t.Literal("threshold")])
        ),
        advancementConfig: t.Optional(
          t.Object({
            topN: t.Optional(t.Number()),
            threshold: t.Optional(t.Number()),
          })
        ),
      }),
      detail: {
        summary: "Update round",
        description: "Updates a round's name, status, advancement rule, or advancement config.",
      },
    }
  )

  .delete("/hackathons/:id/rounds/:roundId", async ({ principal, params }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])

    const { checkHackathonOrganizer } = await import("@/lib/services/public-hackathons")
    const result = await checkHackathonOrganizer(params.id, principal.tenantId)

    if (result.status === "not_found") {
      return new Response(JSON.stringify({ error: "Hackathon not found" }), { status: 404, headers: { "Content-Type": "application/json" } })
    }
    if (result.status === "not_authorized") {
      return new Response(JSON.stringify({ error: "Not authorized" }), { status: 403, headers: { "Content-Type": "application/json" } })
    }

    const { deleteRound } = await import("@/lib/services/judging")
    const outcome = await deleteRound(params.roundId, params.id)

    if (!outcome.success) {
      const status = outcome.code === "not_found" ? 404 : outcome.code === "round_active" ? 409 : 500
      return new Response(JSON.stringify({ error: outcome.error }), {
        status,
        headers: { "Content-Type": "application/json" },
      })
    }

    return { success: true }
  }, {
    detail: {
      summary: "Delete round",
      description:
        "Deletes a round. Prizes in the round are un-linked (round_id set to NULL); the hidden screening prize is deleted. Active rounds cannot be deleted — complete them first.",
    },
  })

  .post("/hackathons/:id/rounds/:roundId/activate", async ({ principal, params }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])

    const { checkHackathonOrganizer } = await import("@/lib/services/public-hackathons")
    const result = await checkHackathonOrganizer(params.id, principal.tenantId)

    if (result.status === "not_found") {
      return new Response(JSON.stringify({ error: "Hackathon not found" }), { status: 404, headers: { "Content-Type": "application/json" } })
    }
    if (result.status === "not_authorized") {
      return new Response(JSON.stringify({ error: "Not authorized" }), { status: 403, headers: { "Content-Type": "application/json" } })
    }

    const { activateRound } = await import("@/lib/services/judging")
    const activated = await activateRound(params.roundId, params.id)

    return { success: activated }
  }, {
    detail: { summary: "Activate round", description: "Activates a round, deactivating any other active round." },
  })

  .post("/hackathons/:id/rounds/:roundId/complete", async ({ principal, params }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])

    const { checkHackathonOrganizer } = await import("@/lib/services/public-hackathons")
    const result = await checkHackathonOrganizer(params.id, principal.tenantId)

    if (result.status === "not_found") {
      return new Response(JSON.stringify({ error: "Hackathon not found" }), { status: 404, headers: { "Content-Type": "application/json" } })
    }
    if (result.status === "not_authorized") {
      return new Response(JSON.stringify({ error: "Not authorized" }), { status: 403, headers: { "Content-Type": "application/json" } })
    }

    const { completeRound } = await import("@/lib/services/judging")
    const completed = await completeRound(params.roundId)

    return { success: completed }
  }, {
    detail: { summary: "Complete round", description: "Marks a round as complete." },
  })

  .post(
    "/hackathons/:id/rounds/:roundId/advance",
    async ({ principal, params, body }) => {
      requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])

      const { checkHackathonOrganizer } = await import("@/lib/services/public-hackathons")
      const result = await checkHackathonOrganizer(params.id, principal.tenantId)

      if (result.status === "not_found") {
        return new Response(JSON.stringify({ error: "Hackathon not found" }), { status: 404, headers: { "Content-Type": "application/json" } })
      }
      if (result.status === "not_authorized") {
        return new Response(JSON.stringify({ error: "Not authorized" }), { status: 403, headers: { "Content-Type": "application/json" } })
      }

      if (body.auto) {
        const { autoAdvanceFinalists } = await import("@/lib/services/judging")
        const outcome = await autoAdvanceFinalists(params.id, params.roundId, body.toRoundId)
        if (!outcome.success) {
          const status = outcome.code === "no_scores" ? 409 : 400
          return new Response(JSON.stringify({ error: outcome.error, code: outcome.code }), {
            status,
            headers: { "Content-Type": "application/json" },
          })
        }
        return {
          advancedCount: outcome.advancedCount,
          submissionIds: outcome.submissionIds,
        }
      }

      if (!body.submissionIds || body.submissionIds.length === 0) {
        return new Response(
          JSON.stringify({ error: "submissionIds is required when auto is not set" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        )
      }

      const { advanceSubmissions } = await import("@/lib/services/judging")
      const advanced = await advanceSubmissions(params.roundId, body.toRoundId, body.submissionIds)

      return advanced
    },
    {
      body: t.Object({
        toRoundId: t.String({ description: "Target round ID" }),
        submissionIds: t.Optional(t.Array(t.String(), { description: "Submission IDs to advance (required when auto is not true)" })),
        auto: t.Optional(
          t.Boolean({
            description:
              "When true, pulls the top-N submissions from the source round's screening prize using the round's advancement rule. Requires the round to have advancement='top_n' and a screening prize.",
          })
        ),
      }),
      detail: {
        summary: "Advance submissions",
        description:
          "Advances submissions from this round to the next. Pass `auto: true` to use the screening prize's scores and the round's top-N rule; otherwise pass explicit submissionIds.",
      },
    }
  )

  // ============================================================
  // Judges
  // ============================================================

  .get("/hackathons/:id/judging/user-search", async ({ principal, params, query }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:read"])

    const cacheKey = `${params.id}:${principal.tenantId}`
    let authResult = searchAuthCache.get(cacheKey)
    if (!authResult || Date.now() >= authResult.expires) {
      searchAuthCache.delete(cacheKey)
      if (searchAuthCache.size >= SEARCH_AUTH_MAX) {
        const oldest = searchAuthCache.keys().next().value!
        searchAuthCache.delete(oldest)
      }
      const { checkHackathonOrganizer } = await import("@/lib/services/public-hackathons")
      const result = await checkHackathonOrganizer(params.id, principal.tenantId)
      searchAuthCache.set(cacheKey, { result: { status: result.status }, expires: Date.now() + SEARCH_AUTH_TTL })
      authResult = searchAuthCache.get(cacheKey)!
    }

    if (authResult.result.status === "not_found") {
      return new Response(JSON.stringify({ error: "Hackathon not found" }), { status: 404, headers: { "Content-Type": "application/json" } })
    }
    if (authResult.result.status === "not_authorized") {
      return new Response(JSON.stringify({ error: "Not authorized" }), { status: 403, headers: { "Content-Type": "application/json" } })
    }

    const q = (query as Record<string, string>).q
    if (!q || q.length < 2) return { users: [] }

    const { clerkClient } = await import("@clerk/nextjs/server")
    const clerk = await clerkClient()
    const searchResults = await clerk.users.getUserList({
      query: q,
      limit: 10,
    })

    return {
      users: searchResults.data.map((u) => ({
        id: u.id,
        firstName: u.firstName ?? null,
        lastName: u.lastName ?? null,
        displayName: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.username || u.id,
        email: u.primaryEmailAddress?.emailAddress ?? null,
        imageUrl: u.imageUrl ?? null,
      })),
    }
  }, {
    detail: { summary: "Search users", description: "Searches Clerk users for judge addition." },
  })

  .get("/hackathons/:id/judging/judges", async ({ principal, params }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:read"])

    const { checkHackathonOrganizer } = await import("@/lib/services/public-hackathons")
    const result = await checkHackathonOrganizer(params.id, principal.tenantId)

    if (result.status === "not_found") {
      return new Response(JSON.stringify({ error: "Hackathon not found" }), { status: 404, headers: { "Content-Type": "application/json" } })
    }
    if (result.status === "not_authorized") {
      return new Response(JSON.stringify({ error: "Not authorized" }), { status: 403, headers: { "Content-Type": "application/json" } })
    }

    const { listJudges } = await import("@/lib/services/judging")
    const judges = await listJudges(params.id)

    return { judges }
  }, {
    detail: { summary: "List judges", description: "Lists all judges with assignment progress." },
  })

  .post(
    "/hackathons/:id/judging/judges",
    async ({ principal, params, body }) => {
      requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])

      const { checkHackathonOrganizer } = await import("@/lib/services/public-hackathons")
      const result = await checkHackathonOrganizer(params.id, principal.tenantId)

      if (result.status === "not_found") {
        return new Response(JSON.stringify({ error: "Hackathon not found" }), { status: 404, headers: { "Content-Type": "application/json" } })
      }
      if (result.status === "not_authorized") {
        return new Response(JSON.stringify({ error: "Not authorized" }), { status: 403, headers: { "Content-Type": "application/json" } })
      }

      const typedBody = body as { clerkUserId?: string; email?: string }

      const { clerkClient } = await import("@clerk/nextjs/server")
      const client = await clerkClient()

      if (typedBody.clerkUserId) {
        const hackathon = result.hackathon

        let judgeEmail: string | undefined
        let judgeName: string | undefined
        let judgeImageUrl: string | undefined
        try {
          const judgeUser = await client.users.getUser(typedBody.clerkUserId)
          judgeEmail = judgeUser.primaryEmailAddress?.emailAddress
          judgeName = [judgeUser.firstName, judgeUser.lastName].filter(Boolean).join(" ") || judgeEmail || "Judge"
          judgeImageUrl = judgeUser.imageUrl
        } catch {
          return new Response(JSON.stringify({ error: "Failed to look up judge info", code: "lookup_failed" }), { status: 500, headers: { "Content-Type": "application/json" } })
        }

        if (judgeEmail) {
          const { hasPendingJudgeEntry } = await import("@/lib/services/judge-invitations")
          let isPending: boolean
          try {
            isPending = await hasPendingJudgeEntry(params.id, judgeEmail)
          } catch {
            return new Response(JSON.stringify({ error: "Failed to check invitation status", code: "lookup_failed" }), { status: 500, headers: { "Content-Type": "application/json" } })
          }
          if (isPending) {
            return new Response(JSON.stringify({ error: "This judge already has a pending invitation or notification", code: "already_pending" }), { status: 400, headers: { "Content-Type": "application/json" } })
          }
        }

        const { addJudge } = await import("@/lib/services/judging")
        const addResult = await addJudge(params.id, typedBody.clerkUserId)

        if (!addResult.success) {
          return new Response(JSON.stringify({ error: addResult.error, code: addResult.code }), { status: 400, headers: { "Content-Type": "application/json" } })
        }

        try {
          const { createJudgeDisplayProfile } = await import("@/lib/services/judge-display")
          await createJudgeDisplayProfile(params.id, {
            name: judgeName!,
            headshotUrl: judgeImageUrl,
            clerkUserId: typedBody.clerkUserId,
            participantId: addResult.participant.id,
          })
        } catch (err) {
          console.error("Failed to create judge display profile:", err)
        }

        if (judgeEmail) {
          try {
            if (hackathon.status !== "draft") {
              const addedByName = await resolveAdderName(principal, client)
              const { sendJudgeAddedNotification } = await import("@/lib/email/judge-invitations")
              sendJudgeAddedNotification({
                to: judgeEmail,
                hackathonName: hackathon.name,
                hackathonSlug: hackathon.slug,
                addedByName,
                hackathonStartsAt: hackathon.starts_at,
                hackathonEndsAt: hackathon.ends_at,
              }).catch(console.error)
            } else {
              const addedByName = await resolveAdderName(principal, client)
              const { createJudgePendingNotification } = await import("@/lib/services/judge-invitations")
              await createJudgePendingNotification(hackathon.id, addResult.participant.id, judgeEmail, addedByName)
            }
          } catch (err) {
            console.error(`Failed to handle judge notification:`, err)
          }
        }

        logAudit({
          principal,
          action: "judge.added",
          resourceType: "hackathon",
          resourceId: params.id,
          metadata: { judgeClerkUserId: typedBody.clerkUserId },
        })

        return { participant: addResult.participant }
      }

      if (typedBody.email) {
        const hackathon = result.hackathon

        const existingUsers = await client.users.getUserList({ emailAddress: [typedBody.email] })
        if (existingUsers.data.length > 0) {
          const existingUser = existingUsers.data[0]

          const { hasPendingJudgeEntry } = await import("@/lib/services/judge-invitations")
          let isPending: boolean
          try {
            isPending = await hasPendingJudgeEntry(params.id, typedBody.email)
          } catch {
            return new Response(JSON.stringify({ error: "Failed to check invitation status", code: "lookup_failed" }), { status: 500, headers: { "Content-Type": "application/json" } })
          }
          if (isPending) {
            return new Response(JSON.stringify({ error: "This email already has a pending invitation or notification", code: "already_pending" }), { status: 400, headers: { "Content-Type": "application/json" } })
          }

          const { addJudge } = await import("@/lib/services/judging")
          const addResult = await addJudge(params.id, existingUser.id)

          if (!addResult.success) {
            return new Response(JSON.stringify({ error: addResult.error, code: addResult.code }), { status: 400, headers: { "Content-Type": "application/json" } })
          }

          try {
            const { createJudgeDisplayProfile } = await import("@/lib/services/judge-display")
            const displayName = [existingUser.firstName, existingUser.lastName].filter(Boolean).join(" ") || typedBody.email
            await createJudgeDisplayProfile(params.id, {
              name: displayName,
              headshotUrl: existingUser.imageUrl,
              clerkUserId: existingUser.id,
              participantId: addResult.participant.id,
            })
          } catch (err) {
            console.error("Failed to create judge display profile:", err)
          }

          if (hackathon.status !== "draft") {
            const addedByName = await resolveAdderName(principal, client)
            const { sendJudgeAddedNotification } = await import("@/lib/email/judge-invitations")
            sendJudgeAddedNotification({
              to: typedBody.email,
              hackathonName: hackathon.name,
              hackathonSlug: hackathon.slug,
              addedByName,
              hackathonStartsAt: hackathon.starts_at,
              hackathonEndsAt: hackathon.ends_at,
            }).catch(console.error)
          } else {
            const addedByName = await resolveAdderName(principal, client)
            const { createJudgePendingNotification } = await import("@/lib/services/judge-invitations")
            await createJudgePendingNotification(hackathon.id, addResult.participant.id, typedBody.email, addedByName)
          }

          logAudit({
            principal,
            action: "judge.added",
            resourceType: "hackathon",
            resourceId: params.id,
            metadata: { judgeClerkUserId: existingUser.id, email: typedBody.email },
          })

          return { participant: addResult.participant }
        }

        const { createJudgeInvitation, hasPendingJudgeEntry } = await import("@/lib/services/judge-invitations")

        let isPending: boolean
        try {
          isPending = await hasPendingJudgeEntry(params.id, typedBody.email)
        } catch {
          return new Response(JSON.stringify({ error: "Failed to check invitation status", code: "lookup_failed" }), { status: 500, headers: { "Content-Type": "application/json" } })
        }
        if (isPending) {
          return new Response(JSON.stringify({ error: "This email already has a pending invitation", code: "already_pending" }), { status: 400, headers: { "Content-Type": "application/json" } })
        }

        const inviterName = await resolveAdderName(principal, client)
        const invitedByClerkUserId = principal.kind === "user" ? principal.userId : "api"
        const invitationResult = await createJudgeInvitation({
          hackathonId: params.id,
          email: typedBody.email,
          invitedByClerkUserId,
        })

        if (!invitationResult.success) {
          return new Response(JSON.stringify({ error: invitationResult.error, code: invitationResult.code }), { status: 400, headers: { "Content-Type": "application/json" } })
        }

        if (hackathon.status !== "draft") {
          const { sendJudgeInvitationEmail } = await import("@/lib/email/judge-invitations")
          sendJudgeInvitationEmail({
            to: typedBody.email,
            hackathonName: hackathon.name,
            inviterName,
            inviteToken: invitationResult.invitation.token,
            expiresAt: invitationResult.invitation.expires_at,
            hackathonSlug: hackathon.slug,
            hackathonStartsAt: hackathon.starts_at,
            hackathonEndsAt: hackathon.ends_at,
          }).catch(console.error)

          const { scheduleReminders } = await import("@/lib/services/smart-reminders")
          scheduleReminders(
            "judge_invitation",
            invitationResult.invitation.id,
            params.id,
            "invitation_reminder",
            new Date(invitationResult.invitation.created_at),
            new Date(invitationResult.invitation.expires_at),
            {
              email: typedBody.email,
              hackathonName: hackathon.name,
              inviterName,
              inviteToken: invitationResult.invitation.token,
              expiresAt: invitationResult.invitation.expires_at,
            }
          ).catch((err) => console.error(`Failed to schedule reminders for judge_invitation ${invitationResult.invitation.id} (hackathon=${params.id}):`, err))
        }

        logAudit({
          principal,
          action: "judge.invited",
          resourceType: "hackathon",
          resourceId: params.id,
          metadata: { email: typedBody.email },
        })

        return {
          invitation: {
            id: invitationResult.invitation.id,
            email: typedBody.email,
            token: invitationResult.invitation.token,
          },
        }
      }

      return new Response(JSON.stringify({ error: "Must provide clerkUserId or email" }), { status: 400, headers: { "Content-Type": "application/json" } })
    },
    {
      body: t.Object({
        clerkUserId: t.Optional(t.String()),
        email: t.Optional(t.String({ format: "email" })),
      }),
      detail: { summary: "Add judge", description: "Adds a judge by Clerk user ID or invites by email." },
    }
  )

  .delete("/hackathons/:id/judging/judges/:participantId", async ({ principal, params }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])

    const { checkHackathonOrganizer } = await import("@/lib/services/public-hackathons")
    const result = await checkHackathonOrganizer(params.id, principal.tenantId)

    if (result.status === "not_found") {
      return new Response(JSON.stringify({ error: "Hackathon not found" }), { status: 404, headers: { "Content-Type": "application/json" } })
    }
    if (result.status === "not_authorized") {
      return new Response(JSON.stringify({ error: "Not authorized" }), { status: 403, headers: { "Content-Type": "application/json" } })
    }

    const { removeJudge } = await import("@/lib/services/judging")
    const removeResult = await removeJudge(params.id, params.participantId)

    if (!removeResult.success) {
      return new Response(JSON.stringify({ error: "Failed to remove judge" }), { status: 500, headers: { "Content-Type": "application/json" } })
    }

    logAudit({
      principal,
      action: "judge.removed",
      resourceType: "hackathon",
      resourceId: params.id,
      metadata: { judgeParticipantId: params.participantId },
    })

    return { success: true, resultsStale: removeResult.resultsStale }
  }, {
    detail: { summary: "Remove judge", description: "Removes a judge and all their assignments." },
  })

  .get("/hackathons/:id/judging/invitations", async ({ principal, params }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:read"])

    const { checkHackathonOrganizer } = await import("@/lib/services/public-hackathons")
    const result = await checkHackathonOrganizer(params.id, principal.tenantId)

    if (result.status === "not_found") {
      return new Response(JSON.stringify({ error: "Hackathon not found" }), { status: 404, headers: { "Content-Type": "application/json" } })
    }
    if (result.status === "not_authorized") {
      return new Response(JSON.stringify({ error: "Not authorized" }), { status: 403, headers: { "Content-Type": "application/json" } })
    }

    const { listJudgeInvitations } = await import("@/lib/services/judge-invitations")
    const invitations = await listJudgeInvitations(params.id)

    return { invitations }
  }, {
    detail: { summary: "List invitations", description: "Lists pending judge invitations." },
  })

  .delete("/hackathons/:id/judging/invitations/:invitationId", async ({ principal, params }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])

    const { checkHackathonOrganizer } = await import("@/lib/services/public-hackathons")
    const result = await checkHackathonOrganizer(params.id, principal.tenantId)

    if (result.status === "not_found") {
      return new Response(JSON.stringify({ error: "Hackathon not found" }), { status: 404, headers: { "Content-Type": "application/json" } })
    }
    if (result.status === "not_authorized") {
      return new Response(JSON.stringify({ error: "Not authorized" }), { status: 403, headers: { "Content-Type": "application/json" } })
    }

    const { cancelJudgeInvitation } = await import("@/lib/services/judge-invitations")
    const result2 = await cancelJudgeInvitation(params.invitationId, params.id)

    if (result2.success) {
      const { cancelRemindersForEntity } = await import("@/lib/services/smart-reminders")
      cancelRemindersForEntity("judge_invitation", params.invitationId).catch((err) =>
        console.error(`Failed to cancel reminders for judge_invitation ${params.invitationId} (hackathon=${params.id}):`, err)
      )
    }

    return { success: result2.success }
  }, {
    detail: { summary: "Cancel invitation", description: "Cancels a pending judge invitation." },
  })

  .post("/hackathons/:id/judging/invitations/:invitationId/remind", async ({ principal, params }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])

    const { isValidUuid } = await import("@/lib/utils/uuid")
    if (!isValidUuid(params.invitationId)) {
      return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { "Content-Type": "application/json" } })
    }

    const { checkHackathonOrganizer } = await import("@/lib/services/public-hackathons")
    const result = await checkHackathonOrganizer(params.id, principal.tenantId)

    if (result.status === "not_found") {
      return new Response(JSON.stringify({ error: "Hackathon not found" }), { status: 404, headers: { "Content-Type": "application/json" } })
    }
    if (result.status === "not_authorized") {
      return new Response(JSON.stringify({ error: "Not authorized" }), { status: 403, headers: { "Content-Type": "application/json" } })
    }

    const hackathon = result.hackathon

    if (hackathon.status === "draft") {
      return new Response(
        JSON.stringify({ error: "Reminders can't be sent while the hackathon is in draft.", code: "hackathon_draft" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    const rateLimitResult = await checkRateLimit(`judge_invitation_remind:${params.id}:${params.invitationId}`, {
      maxRequests: 5,
      windowMs: 60_000,
    })
    if (!rateLimitResult.allowed) {
      throw new RateLimitError(rateLimitResult.resetAt, rateLimitResult.remaining)
    }

    const { remindJudgeInvitation } = await import("@/lib/services/judge-invitations")
    const remindResult = await remindJudgeInvitation(params.invitationId, params.id)

    if (!remindResult.success) {
      return new Response(JSON.stringify({ error: remindResult.error, code: remindResult.code }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    const { clerkClient } = await import("@clerk/nextjs/server")
    const client = await clerkClient()
    const inviterName = await resolveAdderName(principal, client)

    const { sendJudgeInvitationReminderEmail } = await import("@/lib/email/judge-invitations")
    sendJudgeInvitationReminderEmail({
      to: remindResult.invitation.email,
      hackathonName: hackathon.name,
      inviterName,
      inviteToken: remindResult.invitation.token,
      expiresAt: remindResult.invitation.expires_at,
    }).catch(console.error)

    const { cancelUpcomingReminder } = await import("@/lib/services/smart-reminders")
    cancelUpcomingReminder("judge_invitation", params.invitationId).catch(console.error)

    await logAudit({
      principal,
      action: "judge_invitation.reminded",
      resourceType: "hackathon",
      resourceId: params.id,
      metadata: { invitationId: params.invitationId },
    })

    return { success: true }
  }, {
    detail: { summary: "Send invitation reminder", description: "Sends a reminder email for a pending judge invitation." },
  })

  .get("/hackathons/:id/judging/progress", async ({ principal, params }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:read"])

    const { checkHackathonOrganizer } = await import("@/lib/services/public-hackathons")
    const result = await checkHackathonOrganizer(params.id, principal.tenantId)

    if (result.status === "not_found") {
      return new Response(JSON.stringify({ error: "Hackathon not found" }), { status: 404, headers: { "Content-Type": "application/json" } })
    }
    if (result.status === "not_authorized") {
      return new Response(JSON.stringify({ error: "Not authorized" }), { status: 403, headers: { "Content-Type": "application/json" } })
    }

    const { getJudgingProgress } = await import("@/lib/services/judging")
    const progress = await getJudgingProgress(params.id)

    return progress
  }, {
    detail: { summary: "Get judging progress", description: "Returns overall judging completion and per-judge breakdown." },
  })

  .get("/hackathons/:id/core-criteria", async ({ principal, params }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:read"])

    const { checkHackathonOrganizer } = await import("@/lib/services/public-hackathons")
    const result = await checkHackathonOrganizer(params.id, principal.tenantId)
    if (result.status === "not_found") {
      return new Response(JSON.stringify({ error: "Hackathon not found" }), { status: 404, headers: { "Content-Type": "application/json" } })
    }
    if (result.status === "not_authorized") {
      return new Response(JSON.stringify({ error: "Not authorized" }), { status: 403, headers: { "Content-Type": "application/json" } })
    }

    const { listCoreCriteria } = await import("@/lib/services/judging")
    const criteria = await listCoreCriteria(params.id)
    return { criteria }
  }, {
    detail: { summary: "List core criteria", description: "Returns hackathon-wide criteria used by all weighted_score prizes." },
  })

  .post(
    "/hackathons/:id/core-criteria/seed-defaults",
    async ({ principal, params }) => {
      requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])

      const { checkHackathonOrganizer } = await import("@/lib/services/public-hackathons")
      const result = await checkHackathonOrganizer(params.id, principal.tenantId)
      if (result.status === "not_found") {
        return new Response(JSON.stringify({ error: "Hackathon not found" }), { status: 404, headers: { "Content-Type": "application/json" } })
      }
      if (result.status === "not_authorized") {
        return new Response(JSON.stringify({ error: "Not authorized" }), { status: 403, headers: { "Content-Type": "application/json" } })
      }

      const { seedDefaultCoreCriteria } = await import("@/lib/services/judging")
      const seeded = await seedDefaultCoreCriteria(params.id)
      if (!seeded.success) {
        return new Response(
          JSON.stringify({ error: seeded.error }),
          { status: 409, headers: { "Content-Type": "application/json" } }
        )
      }
      return { criteria: seeded.criteria }
    },
    {
      detail: { summary: "Seed default core criteria", description: "Inserts four starter score categories (25% each). Fails if any core criteria already exist." },
    }
  )

  .post(
    "/hackathons/:id/core-criteria",
    async ({ principal, params, body }) => {
      requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])

      const { checkHackathonOrganizer } = await import("@/lib/services/public-hackathons")
      const result = await checkHackathonOrganizer(params.id, principal.tenantId)
      if (result.status === "not_found") {
        return new Response(JSON.stringify({ error: "Hackathon not found" }), { status: 404, headers: { "Content-Type": "application/json" } })
      }
      if (result.status === "not_authorized") {
        return new Response(JSON.stringify({ error: "Not authorized" }), { status: 403, headers: { "Content-Type": "application/json" } })
      }

      const { createCoreCriterion } = await import("@/lib/services/judging")
      const created = await createCoreCriterion(params.id, {
        name: body.name,
        description: body.description ?? null,
        weight: body.weight,
        minScore: body.minScore,
        maxScore: body.maxScore,
      })
      if (!created.success) {
        return new Response(
          JSON.stringify({ error: created.error, offendingPrizes: created.offendingPrizes }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        )
      }
      return { criterion: created.criterion }
    },
    {
      body: t.Object({
        name: t.String(),
        description: t.Optional(t.Nullable(t.String())),
        weight: t.Number({ minimum: 0, maximum: 100 }),
        minScore: t.Optional(t.Number({ minimum: 0 })),
        maxScore: t.Optional(t.Number({ minimum: 1 })),
      }),
      detail: { summary: "Create core criterion", description: "Adds a hackathon-wide criterion. Sum imbalances against weighted_score prizes are reported as warnings, not errors." },
    }
  )

  .patch(
    "/hackathons/:id/core-criteria/:criteriaId",
    async ({ principal, params, body }) => {
      requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])

      const { checkHackathonOrganizer } = await import("@/lib/services/public-hackathons")
      const result = await checkHackathonOrganizer(params.id, principal.tenantId)
      if (result.status === "not_found") {
        return new Response(JSON.stringify({ error: "Hackathon not found" }), { status: 404, headers: { "Content-Type": "application/json" } })
      }
      if (result.status === "not_authorized") {
        return new Response(JSON.stringify({ error: "Not authorized" }), { status: 403, headers: { "Content-Type": "application/json" } })
      }

      const { updateCoreCriterion } = await import("@/lib/services/judging")
      const updated = await updateCoreCriterion(params.id, params.criteriaId, {
        name: body.name,
        description: body.description,
        weight: body.weight,
        minScore: body.minScore,
        maxScore: body.maxScore,
      })
      if (!updated.success) {
        return new Response(
          JSON.stringify({ error: updated.error, offendingPrizes: updated.offendingPrizes }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        )
      }
      return { criterion: updated.criterion }
    },
    {
      body: t.Object({
        name: t.Optional(t.String()),
        description: t.Optional(t.Nullable(t.String())),
        weight: t.Optional(t.Number({ minimum: 0, maximum: 100 })),
        minScore: t.Optional(t.Number({ minimum: 0 })),
        maxScore: t.Optional(t.Number({ minimum: 1 })),
      }),
      detail: { summary: "Update core criterion", description: "Updates a core criterion. Sum imbalances against weighted_score prizes are reported as warnings, not errors." },
    }
  )

  .delete("/hackathons/:id/core-criteria/:criteriaId", async ({ principal, params }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])

    const { checkHackathonOrganizer } = await import("@/lib/services/public-hackathons")
    const result = await checkHackathonOrganizer(params.id, principal.tenantId)
    if (result.status === "not_found") {
      return new Response(JSON.stringify({ error: "Hackathon not found" }), { status: 404, headers: { "Content-Type": "application/json" } })
    }
    if (result.status === "not_authorized") {
      return new Response(JSON.stringify({ error: "Not authorized" }), { status: 403, headers: { "Content-Type": "application/json" } })
    }

    const { deleteCoreCriterion } = await import("@/lib/services/judging")
    const deleted = await deleteCoreCriterion(params.id, params.criteriaId)
    if (!deleted.success) {
      return new Response(
        JSON.stringify({ error: deleted.error, offendingPrizes: deleted.offendingPrizes }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }
    return { success: true }
  }, {
    detail: { summary: "Delete core criterion", description: "Removes a core criterion. Sum imbalances against weighted_score prizes are reported as warnings, not errors." },
  })

  .post("/hackathons/:id/judging/assign-weighted-score-judge", async ({ principal, params, body }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])

    const { checkHackathonOrganizer } = await import("@/lib/services/public-hackathons")
    const result = await checkHackathonOrganizer(params.id, principal.tenantId)
    if (result.status === "not_found") {
      return new Response(JSON.stringify({ error: "Hackathon not found" }), { status: 404, headers: { "Content-Type": "application/json" } })
    }
    if (result.status === "not_authorized") {
      return new Response(JSON.stringify({ error: "Not authorized" }), { status: 403, headers: { "Content-Type": "application/json" } })
    }

    const { assignWeightedScoreJudge } = await import("@/lib/services/judging")
    const out = await assignWeightedScoreJudge(params.id, body.judgeParticipantId, {
      roomId: body.roomId ?? null,
    })
    if (!out.success) {
      return new Response(JSON.stringify({ error: out.error ?? "Failed" }), { status: 400, headers: { "Content-Type": "application/json" } })
    }
    return out
  }, {
    body: t.Object({
      judgeParticipantId: t.String(),
      roomId: t.Optional(t.String({ description: "Limit assignments to projects from this room only" })),
    }),
    detail: { summary: "Assign judge to unified scorecard", description: "Creates one unified weighted_score assignment per submission for this judge. When roomId is provided, only projects from that room are assigned." },
  })
