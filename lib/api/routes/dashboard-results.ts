import { Elysia } from "elysia"
import { resolvePrincipal, requirePrincipal } from "@/lib/auth/principal"
import { logAudit } from "@/lib/services/audit"

export const dashboardResultsRoutes = new Elysia()
  .derive(async ({ request }) => {
    const principal = await resolvePrincipal(request)
    return { principal }
  })
  .post("/hackathons/:id/results/calculate", async ({ principal, params }) => {
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

    const { calculateResults } = await import("@/lib/services/results")
    const calcResult = await calculateResults(params.id)

    if (!calcResult.success) {
      return new Response(JSON.stringify({ error: calcResult.error, code: calcResult.code }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    await logAudit({
      principal,
      action: "results.calculated",
      resourceType: "hackathon",
      resourceId: params.id,
      metadata: { resultsCount: calcResult.count },
    })

    return { success: true, count: calcResult.count }
  }, {
    detail: {
      summary: "Calculate results",
      description: "Calculates each prize ranking with its scoring style. Requires hackathons:write scope.",
    },
  })
  .get("/hackathons/:id/results", async ({ principal, params }) => {
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

    const { getResults } = await import("@/lib/services/results")
    const results = await getResults(params.id)

    return {
      results: results.map((r) => ({
        id: r.id,
        rank: r.rank,
        submissionId: r.submission_id,
        submissionTitle: r.submissionTitle,
        teamName: r.teamName,
        totalScore: r.total_score,
        weightedScore: r.weighted_score,
        judgeCount: r.judge_count,
        publishedAt: r.published_at,
        prizes: r.prizes,
      })),
      isPublished: result.hackathon.results_published_at !== null,
    }
  }, {
    detail: {
      summary: "Get results (organizer)",
      description: "Returns detailed results with scores for organizers. Requires hackathons:read scope.",
    },
  })
  .post("/hackathons/:id/results/publish", async ({ principal, params }) => {
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

    const { publishResults } = await import("@/lib/services/results")
    const pubResult = await publishResults(params.id, principal.tenantId)

    if (!pubResult.success) {
      return new Response(JSON.stringify({ error: pubResult.error }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    await logAudit({
      principal,
      action: "results.published",
      resourceType: "hackathon",
      resourceId: params.id,
    })

    const { triggerWebhooks } = await import("@/lib/services/webhooks")
    triggerWebhooks(principal.tenantId, "results.published", {
      event: "results.published",
      timestamp: new Date().toISOString(),
      data: { hackathonId: params.id },
    }).catch(console.error)

    return { success: true }
  }, {
    detail: {
      summary: "Publish results",
      description: "Makes results publicly visible and transitions hackathon to completed. Requires hackathons:write scope.",
    },
  })
  .post("/hackathons/:id/results/unpublish", async ({ principal, params }) => {
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

    const { unpublishResults } = await import("@/lib/services/results")
    const unpubResult = await unpublishResults(params.id, principal.tenantId)

    if (!unpubResult.success) {
      return new Response(JSON.stringify({ error: unpubResult.error }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    await logAudit({
      principal,
      action: "results.unpublished",
      resourceType: "hackathon",
      resourceId: params.id,
    })

    return { success: true }
  }, {
    detail: {
      summary: "Unpublish results",
      description: "Hides published results from public view. Requires hackathons:write scope.",
    },
  })
