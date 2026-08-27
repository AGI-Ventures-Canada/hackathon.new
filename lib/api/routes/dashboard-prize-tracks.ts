import { Elysia, t } from "elysia"
import { resolvePrincipal, requirePrincipal } from "@/lib/auth/principal"
import { logAudit } from "@/lib/services/audit"

export const dashboardPrizeTracksRoutes = new Elysia()
  .derive(async ({ request }) => {
    const principal = await resolvePrincipal(request)
    return { principal }
  })
  .get("/hackathons/:id/prize-tracks", async ({ principal, params }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:read"])

    const { checkHackathonOrganizer } = await import("@/lib/services/public-hackathons")
    const result = await checkHackathonOrganizer(params.id, principal.tenantId)

    if (result.status === "not_found") {
      return new Response(JSON.stringify({ error: "Hackathon not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })
    }
    if (result.status === "not_authorized") {
      return new Response(JSON.stringify({ error: "Not authorized" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      })
    }

    const { getTrackProgress } = await import("@/lib/services/prize-tracks")
    const tracks = await getTrackProgress(params.id)

    return { tracks }
  }, {
    detail: {
      summary: "List prize tracks with progress",
      description: "Lists all prize tracks for a hackathon with scoring progress. Requires hackathons:read scope.",
    },
  })
  .get("/hackathons/:id/prize-tracks/:trackId", async ({ principal, params }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:read"])

    const { checkHackathonOrganizer } = await import("@/lib/services/public-hackathons")
    const result = await checkHackathonOrganizer(params.id, principal.tenantId)

    if (result.status === "not_found") {
      return new Response(JSON.stringify({ error: "Hackathon not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })
    }
    if (result.status === "not_authorized") {
      return new Response(JSON.stringify({ error: "Not authorized" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      })
    }

    const { getPrizeTrackWithDetails } = await import("@/lib/services/prize-tracks")
    const track = await getPrizeTrackWithDetails(params.trackId, params.id)

    if (!track) {
      return new Response(JSON.stringify({ error: "Prize track not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })
    }

    return {
      id: track.id,
      name: track.name,
      description: track.description,
      intent: track.intent,
      displayOrder: track.display_order,
      rounds: track.rounds.map((r) => ({
        id: r.id,
        name: r.name,
        style: r.style,
        status: r.status,
        advancement: r.advancement,
        advancementConfig: r.advancement_config,
        displayOrder: r.display_order,
        buckets: r.buckets.map((b) => ({
          id: b.id,
          level: b.level,
          label: b.label,
          description: b.description,
        })),
      })),
    }
  }, {
    detail: {
      summary: "Get prize track details",
      description: "Returns full prize track details including rounds and bucket definitions. Requires hackathons:read scope.",
    },
  })
  .post(
    "/hackathons/:id/prize-tracks",
    async ({ principal, params, body }) => {
      requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])

      const { checkHackathonOrganizer } = await import("@/lib/services/public-hackathons")
      const result = await checkHackathonOrganizer(params.id, principal.tenantId)

      if (result.status === "not_found") {
        return new Response(JSON.stringify({ error: "Hackathon not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        })
      }
      if (result.status === "not_authorized") {
        return new Response(JSON.stringify({ error: "Not authorized" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        })
      }

      const { createPrizeTrack } = await import("@/lib/services/prize-tracks")
      const track = await createPrizeTrack(params.id, {
        name: body.name,
        description: body.description,
        intent: body.intent as "overall_winner" | "sponsor_prize" | "crowd_favorite" | "quick_comparison" | "custom" | undefined,
        style: body.style as "bucket_sort" | "gate_check" | "head_to_head" | "top_n" | "compliance" | "crowd" | "points" | "subjective" | undefined,
        displayOrder: body.displayOrder,
        sponsorId: body.sponsorId,
      })

      if (!track) {
        return new Response(JSON.stringify({ error: "Failed to create prize track" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        })
      }

      await logAudit({
        principal,
        action: "prize_track.created",
        resourceType: "prize_track",
        resourceId: track.id,
        metadata: { hackathonId: params.id, intent: body.intent },
      })

      return {
        id: track.id,
        name: track.name,
        intent: track.intent,
      }
    },
    {
      detail: {
        summary: "Create prize track",
        description: "Creates a new prize track with a default round and bucket definitions. Requires hackathons:write scope.",
      },
      body: t.Object({
        name: t.String({ minLength: 1 }),
        description: t.Optional(t.Union([t.String(), t.Null()])),
        intent: t.Optional(t.Union([
          t.Literal("overall_winner"),
          t.Literal("sponsor_prize"),
          t.Literal("crowd_favorite"),
          t.Literal("quick_comparison"),
          t.Literal("custom"),
        ])),
        style: t.Optional(t.Union([
          t.Literal("bucket_sort"),
          t.Literal("gate_check"),
          t.Literal("head_to_head"),
          t.Literal("top_n"),
          t.Literal("compliance"),
          t.Literal("crowd"),
        ])),
        displayOrder: t.Optional(t.Number()),
        sponsorId: t.Optional(t.Union([t.String({ format: "uuid" }), t.Null()], { description: "ID of the hackathon_sponsors record to link this track to" })),
      }),
    }
  )
  .patch(
    "/hackathons/:id/prize-tracks/:trackId",
    async ({ principal, params, body }) => {
      requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])

      const { checkHackathonOrganizer } = await import("@/lib/services/public-hackathons")
      const result = await checkHackathonOrganizer(params.id, principal.tenantId)

      if (result.status === "not_found") {
        return new Response(JSON.stringify({ error: "Hackathon not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        })
      }
      if (result.status === "not_authorized") {
        return new Response(JSON.stringify({ error: "Not authorized" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        })
      }

      const { updatePrizeTrack } = await import("@/lib/services/prize-tracks")
      const track = await updatePrizeTrack(params.trackId, params.id, {
        name: body.name,
        description: body.description,
        intent: body.intent as "overall_winner" | "sponsor_prize" | "crowd_favorite" | "quick_comparison" | "custom" | undefined,
        displayOrder: body.displayOrder,
      })

      if (!track) {
        return new Response(JSON.stringify({ error: "Prize track not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        })
      }

      return { id: track.id, updatedAt: track.updated_at }
    },
    {
      detail: {
        summary: "Update prize track",
        description: "Updates a prize track. Requires hackathons:write scope.",
      },
      body: t.Object({
        name: t.Optional(t.String()),
        description: t.Optional(t.Union([t.String(), t.Null()])),
        intent: t.Optional(t.Union([
          t.Literal("overall_winner"),
          t.Literal("sponsor_prize"),
          t.Literal("crowd_favorite"),
          t.Literal("quick_comparison"),
          t.Literal("custom"),
        ])),
        displayOrder: t.Optional(t.Number()),
      }),
    }
  )
  .delete("/hackathons/:id/prize-tracks/:trackId", async ({ principal, params }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])

    const { checkHackathonOrganizer } = await import("@/lib/services/public-hackathons")
    const result = await checkHackathonOrganizer(params.id, principal.tenantId)

    if (result.status === "not_found") {
      return new Response(JSON.stringify({ error: "Hackathon not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })
    }
    if (result.status === "not_authorized") {
      return new Response(JSON.stringify({ error: "Not authorized" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      })
    }

    const { deletePrizeTrack } = await import("@/lib/services/prize-tracks")
    const success = await deletePrizeTrack(params.trackId, params.id)

    if (!success) {
      return new Response(JSON.stringify({ error: "Prize track not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })
    }

    await logAudit({
      principal,
      action: "prize_track.deleted",
      resourceType: "prize_track",
      resourceId: params.trackId,
    })

    return { success: true }
  }, {
    detail: {
      summary: "Delete prize track",
      description: "Deletes a prize track and all associated rounds, buckets, and responses. Requires hackathons:write scope.",
    },
  })
  .put(
    "/hackathons/:id/prize-tracks/:trackId/rounds/:roundId/buckets",
    async ({ principal, params, body }) => {
      requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])

      const { checkHackathonOrganizer } = await import("@/lib/services/public-hackathons")
      const result = await checkHackathonOrganizer(params.id, principal.tenantId)

      if (result.status === "not_found") {
        return new Response(JSON.stringify({ error: "Hackathon not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        })
      }
      if (result.status === "not_authorized") {
        return new Response(JSON.stringify({ error: "Not authorized" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        })
      }

      if (body.buckets.length < 2) {
        return new Response(JSON.stringify({ error: "At least 2 buckets are required" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })
      }

      const { replaceRoundBucketDefinitions } = await import("@/lib/services/prize-tracks")
      const buckets = await replaceRoundBucketDefinitions(
        params.roundId,
        body.buckets,
        params.id,
        params.trackId,
      )

      return { buckets: buckets.map((b) => ({ id: b.id, level: b.level, label: b.label, description: b.description })) }
    },
    {
      detail: {
        summary: "Replace bucket definitions",
        description: "Replaces all bucket definitions for a round. At least 2 buckets required. Requires hackathons:write scope.",
      },
      body: t.Object({
        buckets: t.Array(t.Object({
          level: t.Number(),
          label: t.String({ minLength: 1 }),
          description: t.Optional(t.Union([t.String(), t.Null()])),
        })),
      }),
    }
  )
  .patch(
    "/hackathons/:id/prize-tracks/:trackId/rounds/:roundId",
    async ({ principal, params, body }) => {
      requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])

      const { checkHackathonOrganizer } = await import("@/lib/services/public-hackathons")
      const result = await checkHackathonOrganizer(params.id, principal.tenantId)

      if (result.status === "not_found") {
        return new Response(JSON.stringify({ error: "Hackathon not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        })
      }
      if (result.status === "not_authorized") {
        return new Response(JSON.stringify({ error: "Not authorized" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        })
      }

      const { updateRound } = await import("@/lib/services/prize-tracks")
      const round = await updateRound(params.roundId, {
        name: body.name,
        style: body.style as "bucket_sort" | "gate_check" | "head_to_head" | "top_n" | "compliance" | "crowd" | "points" | "subjective" | undefined,
        status: body.status as "planned" | "active" | "complete" | "advanced" | undefined,
        advancement: body.advancement as "top_n" | "threshold" | "manual" | undefined,
      }, params.id, params.trackId)

      if (!round) {
        return new Response(JSON.stringify({ error: "Round not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        })
      }

      return { id: round.id, status: round.status, style: round.style }
    },
    {
      detail: {
        summary: "Update round",
        description: "Updates a judging round's style, status, or advancement rule. Requires hackathons:write scope.",
      },
      body: t.Object({
        name: t.Optional(t.String()),
        style: t.Optional(t.Union([
          t.Literal("bucket_sort"),
          t.Literal("gate_check"),
          t.Literal("head_to_head"),
          t.Literal("top_n"),
          t.Literal("compliance"),
          t.Literal("crowd"),
          t.Literal("points"),
          t.Literal("subjective"),
        ])),
        status: t.Optional(t.Union([
          t.Literal("planned"),
          t.Literal("active"),
          t.Literal("complete"),
          t.Literal("advanced"),
        ])),
        advancement: t.Optional(t.Union([
          t.Literal("top_n"),
          t.Literal("threshold"),
          t.Literal("manual"),
        ])),
      }),
    }
  )
  .post(
    "/hackathons/:id/prize-tracks/:trackId/rounds",
    async ({ principal, params, body }) => {
      requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])

      const { checkHackathonOrganizer } = await import("@/lib/services/public-hackathons")
      const result = await checkHackathonOrganizer(params.id, principal.tenantId)

      if (result.status === "not_found") {
        return new Response(JSON.stringify({ error: "Hackathon not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        })
      }
      if (result.status === "not_authorized") {
        return new Response(JSON.stringify({ error: "Not authorized" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        })
      }

      const { createRound, listRounds, createDefaultBuckets } = await import("@/lib/services/prize-tracks")
      const existingRounds = await listRounds(params.trackId)
      const nextOrder = existingRounds.length

      const round = await createRound(params.id, params.trackId, {
        name: body.name,
        style: body.style,
        status: "planned",
        displayOrder: nextOrder,
      })

      if (!round) {
        return new Response(JSON.stringify({ error: "Failed to create round" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        })
      }

      if (body.style === "bucket_sort") {
        await createDefaultBuckets(round.id)
      }

      await logAudit({
        principal,
        action: "round.created",
        resourceType: "judging_round",
        resourceId: round.id,
        metadata: { hackathonId: params.id, trackId: params.trackId, style: body.style },
      })

      return {
        id: round.id,
        name: round.name,
        style: round.style,
        status: round.status,
        displayOrder: round.display_order,
      }
    },
    {
      detail: {
        summary: "Create round",
        description: "Creates a new judging round within a prize track. Automatically sets display order. Creates default buckets for bucket_sort style. Requires hackathons:write scope.",
      },
      body: t.Object({
        name: t.String({ minLength: 1 }),
        style: t.Union([
          t.Literal("bucket_sort"),
          t.Literal("gate_check"),
          t.Literal("head_to_head"),
          t.Literal("top_n"),
          t.Literal("compliance"),
          t.Literal("crowd"),
          t.Literal("points"),
          t.Literal("subjective"),
        ]),
      }),
    }
  )
  .post(
    "/hackathons/:id/prize-tracks/:trackId/rounds/:roundId/activate",
    async ({ principal, params }) => {
      requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])

      const { checkHackathonOrganizer } = await import("@/lib/services/public-hackathons")
      const result = await checkHackathonOrganizer(params.id, principal.tenantId)

      if (result.status === "not_found") {
        return new Response(JSON.stringify({ error: "Hackathon not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        })
      }
      if (result.status === "not_authorized") {
        return new Response(JSON.stringify({ error: "Not authorized" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        })
      }

      const { activateRound } = await import("@/lib/services/prize-tracks")
      const success = await activateRound(params.roundId, params.trackId, params.id)

      if (!success) {
        return new Response(JSON.stringify({ error: "Failed to activate round" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        })
      }

      return { success: true }
    },
    {
      detail: {
        summary: "Activate a round",
        description: "Activates a round for judging. Deactivates any other active round in the same track. Requires hackathons:write scope.",
      },
    }
  )
  .post(
    "/hackathons/:id/prize-tracks/:trackId/rounds/:roundId/calculate-results",
    async ({ principal, params }) => {
      requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])

      const { checkHackathonOrganizer } = await import("@/lib/services/public-hackathons")
      const result = await checkHackathonOrganizer(params.id, principal.tenantId)

      if (result.status === "not_found") {
        return new Response(JSON.stringify({ error: "Hackathon not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        })
      }
      if (result.status === "not_authorized") {
        return new Response(JSON.stringify({ error: "Not authorized" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        })
      }

      const { getRound, calculateBucketSortResults, calculateGateCheckResults } = await import("@/lib/services/prize-tracks")
      const round = await getRound(params.roundId)

      if (!round || round.hackathon_id !== params.id || round.prize_track_id !== params.trackId) {
        return new Response(JSON.stringify({ error: "Round not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        })
      }

      let calcResult: { success: boolean; count: number }

      if (round.style === "bucket_sort") {
        calcResult = await calculateBucketSortResults(params.id, params.roundId, params.trackId)
      } else if (round.style === "gate_check") {
        calcResult = await calculateGateCheckResults(params.id, params.roundId, params.trackId)
      } else {
        return new Response(JSON.stringify({ error: `Result calculation not supported for style: ${round.style}` }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })
      }

      if (!calcResult.success) {
        return new Response(JSON.stringify({ error: "Failed to calculate results" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        })
      }

      await logAudit({
        principal,
        action: "prize_track.results_calculated",
        resourceType: "prize_track",
        resourceId: params.trackId,
        metadata: { roundId: params.roundId, resultsCount: calcResult.count },
      })

      return { success: true, resultsCount: calcResult.count }
    },
    {
      detail: {
        summary: "Calculate round results",
        description: "Calculates and stores results for a round based on its judging style. Requires hackathons:write scope.",
      },
    }
  )
