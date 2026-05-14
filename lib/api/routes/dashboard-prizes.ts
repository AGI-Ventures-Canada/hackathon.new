import { Elysia, t } from "elysia"
import { resolvePrincipal, requirePrincipal } from "@/lib/auth/principal"
import { logAudit } from "@/lib/services/audit"

export const dashboardPrizesRoutes = new Elysia()
  .derive(async ({ request }) => {
    const principal = await resolvePrincipal(request)
    return { principal }
  })
  .get("/hackathons/:id/prizes", async ({ principal, params }) => {
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

    const { listPrizes } = await import("@/lib/services/prizes")
    const { listPrizeAssignments } = await import("@/lib/services/prizes")
    const [prizes, assignments] = await Promise.all([
      listPrizes(params.id),
      listPrizeAssignments(params.id),
    ])

    return {
      prizes: prizes.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        value: p.value,
        type: p.type,
        rank: p.rank,
        kind: p.kind,
        monetaryValue: p.monetary_value,
        currency: p.currency,
        distributionMethod: p.distribution_method,
        displayValue: p.display_value,
        criteriaId: p.criteria_id,
        displayOrder: p.display_order,
        createdAt: p.created_at,
      })),
      assignments: assignments.map((a) => ({
        id: a.id,
        prizeId: a.prize_id,
        prizeName: a.prizeName,
        submissionId: a.submission_id,
        submissionTitle: a.submissionTitle,
        teamName: a.teamName,
        assignedAt: a.assigned_at,
      })),
    }
  }, {
    detail: {
      summary: "List prizes and assignments",
      description: "Lists all prizes and prize-submission assignments for a hackathon. Requires hackathons:read scope.",
    },
  })
  .post(
    "/hackathons/:id/prizes",
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

      const { createPrize } = await import("@/lib/services/prizes")
      const prize = await createPrize(params.id, {
        name: body.name,
        description: body.description,
        value: body.value,
        type: body.type,
        rank: body.rank,
        kind: body.kind,
        monetaryValue: body.monetaryValue,
        currency: body.currency,
        distributionMethod: body.distributionMethod,
        displayValue: body.displayValue,
        criteriaId: body.criteriaId,
        displayOrder: body.displayOrder,
        allowedTeamModes: body.allowedTeamModes,
      })

      if (!prize) {
        return new Response(JSON.stringify({ error: "Failed to create prize" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        })
      }

      await logAudit({
        principal,
        action: "prize.created",
        resourceType: "prize",
        resourceId: prize.id,
        metadata: { hackathonId: params.id },
      })

      return { id: prize.id, name: prize.name }
    },
    {
      detail: {
        summary: "Create prize",
        description: "Creates a new prize for a hackathon. Requires hackathons:write scope.",
      },
      body: t.Object({
        name: t.String({ minLength: 1 }),
        description: t.Optional(t.Union([t.String(), t.Null()])),
        value: t.Optional(t.Union([t.String(), t.Null()])),
        type: t.Optional(t.Union([t.Literal("score"), t.Literal("favorite"), t.Literal("crowd"), t.Literal("criteria")])),
        rank: t.Optional(t.Union([t.Number(), t.Null()])),
        kind: t.Optional(t.String()),
        monetaryValue: t.Optional(t.Union([t.Number(), t.Null()])),
        currency: t.Optional(t.Union([t.String(), t.Null()])),
        distributionMethod: t.Optional(t.Union([t.String(), t.Null()])),
        displayValue: t.Optional(t.Union([t.String(), t.Null()])),
        criteriaId: t.Optional(t.Union([t.String(), t.Null()])),
        displayOrder: t.Optional(t.Number()),
        allowedTeamModes: t.Optional(t.Union([t.Array(t.Union([t.Literal("in_person"), t.Literal("virtual")])), t.Null()])),
      }),
    }
  )
  .patch(
    "/hackathons/:id/prizes/:prizeId",
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

      const { updatePrize } = await import("@/lib/services/prizes")
      const prize = await updatePrize(params.prizeId, params.id, {
        name: body.name,
        description: body.description,
        value: body.value,
        type: body.type,
        rank: body.rank,
        kind: body.kind,
        monetaryValue: body.monetaryValue,
        currency: body.currency,
        distributionMethod: body.distributionMethod,
        displayValue: body.displayValue,
        criteriaId: body.criteriaId,
        displayOrder: body.displayOrder,
        allowedTeamModes: body.allowedTeamModes,
      })

      if (!prize) {
        return new Response(JSON.stringify({ error: "Prize not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        })
      }

      return { id: prize.id, updatedAt: prize.updated_at }
    },
    {
      detail: {
        summary: "Update prize",
        description: "Updates a prize. Requires hackathons:write scope.",
      },
      body: t.Object({
        name: t.Optional(t.String()),
        description: t.Optional(t.Union([t.String(), t.Null()])),
        value: t.Optional(t.Union([t.String(), t.Null()])),
        type: t.Optional(t.Union([t.Literal("score"), t.Literal("favorite"), t.Literal("crowd"), t.Literal("criteria")])),
        rank: t.Optional(t.Union([t.Number(), t.Null()])),
        kind: t.Optional(t.String()),
        monetaryValue: t.Optional(t.Union([t.Number(), t.Null()])),
        currency: t.Optional(t.Union([t.String(), t.Null()])),
        distributionMethod: t.Optional(t.Union([t.String(), t.Null()])),
        displayValue: t.Optional(t.Union([t.String(), t.Null()])),
        criteriaId: t.Optional(t.Union([t.String(), t.Null()])),
        displayOrder: t.Optional(t.Number()),
        allowedTeamModes: t.Optional(t.Union([t.Array(t.Union([t.Literal("in_person"), t.Literal("virtual")])), t.Null()])),
      }),
    }
  )
  .post(
    "/hackathons/:id/prizes/reorder",
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

      const { reorderPrizes } = await import("@/lib/services/prizes")
      const success = await reorderPrizes(params.id, body.orderedIds)

      if (!success) {
        return new Response(JSON.stringify({ error: "Failed to reorder" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        })
      }

      return { success: true }
    },
    {
      detail: {
        summary: "Reorder prizes",
        description: "Reorders prizes by setting display_order. Requires hackathons:write scope.",
      },
      body: t.Object({
        orderedIds: t.Array(t.String()),
      }),
    }
  )
  .delete("/hackathons/:id/prizes/:prizeId", async ({ principal, params }) => {
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

    const { deletePrize } = await import("@/lib/services/prizes")
    const success = await deletePrize(params.prizeId, params.id)

    if (!success) {
      return new Response(JSON.stringify({ error: "Prize not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })
    }

    await logAudit({
      principal,
      action: "prize.deleted",
      resourceType: "prize",
      resourceId: params.prizeId,
    })

    return { success: true }
  }, {
    detail: {
      summary: "Delete prize",
      description: "Deletes a prize. Requires hackathons:write scope.",
    },
  })
  .post("/hackathons/:id/prizes/:prizeId/assign", async ({ principal, params, body }) => {
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

    const { assignPrize, prizeBelongsToHackathon } = await import("@/lib/services/prizes")
    if (!(await prizeBelongsToHackathon(params.id, params.prizeId))) {
      return new Response(JSON.stringify({ error: "Prize not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })
    }
    const assignment = await assignPrize(params.prizeId, (body as { submissionId: string }).submissionId)

    if (!assignment) {
      return new Response(JSON.stringify({ error: "Failed to assign prize" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    await logAudit({
      principal,
      action: "prize.assigned",
      resourceType: "prize_assignment",
      resourceId: assignment.id,
      metadata: { prizeId: params.prizeId, submissionId: (body as { submissionId: string }).submissionId },
    })

    return { id: assignment.id }
  }, {
    detail: {
      summary: "Assign prize to submission",
      description: "Assigns a prize to a submission. Requires hackathons:write scope.",
    },
  })
  .delete("/hackathons/:id/prizes/:prizeId/assign/:submissionId", async ({ principal, params }) => {
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

    const { removePrizeAssignment, prizeBelongsToHackathon } = await import("@/lib/services/prizes")
    if (!(await prizeBelongsToHackathon(params.id, params.prizeId))) {
      return new Response(JSON.stringify({ error: "Prize not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })
    }
    const success = await removePrizeAssignment(params.prizeId, params.submissionId)

    if (!success) {
      return new Response(JSON.stringify({ error: "Assignment not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })
    }

    return { success: true }
  }, {
    detail: {
      summary: "Unassign prize from submission",
      description: "Removes a prize assignment from a submission. Requires hackathons:write scope.",
    },
  })
