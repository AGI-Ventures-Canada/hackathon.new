import { Elysia, t } from "elysia"
import { resolvePrincipal, requirePrincipal } from "@/lib/auth/principal"
import { logAudit } from "@/lib/services/audit"
import { resolveAdderName } from "@/lib/auth/resolve-adder-name"

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

      const { createPrize } = await import("@/lib/services/judging")
      const createResult = await createPrize(params.id, {
        name: body.name,
        description: body.description,
        value: body.value,
        judgingStyle: body.judgingStyle as "bucket_sort" | "gate_check" | "crowd_vote" | "judges_pick",
        roundId: body.roundId,
        assignmentMode: body.assignmentMode as "organizer_assigned" | "self_select" | undefined,
        maxPicks: body.maxPicks,
        displayOrder: body.displayOrder,
      })

      if (!createResult.success) {
        return new Response(JSON.stringify({ error: createResult.error }), { status: 500, headers: { "Content-Type": "application/json" } })
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
        description: t.Optional(t.String({ description: "Prize description" })),
        value: t.Optional(t.String({ description: "Prize value (e.g. '$5000')" })),
        judgingStyle: t.String({ description: "bucket_sort | gate_check | crowd_vote | judges_pick" }),
        roundId: t.Optional(t.String({ description: "Round ID this prize belongs to" })),
        assignmentMode: t.Optional(t.String({ description: "organizer_assigned | self_select" })),
        maxPicks: t.Optional(t.Number({ description: "Max picks per judge (for judges_pick)" })),
        displayOrder: t.Optional(t.Number({ description: "Display order" })),
      }),
      detail: { summary: "Create prize", description: "Creates a new prize with judging style. Auto-creates bucket definitions for bucket_sort." },
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

      const { updatePrize } = await import("@/lib/services/judging")
      const prize = await updatePrize(params.prizeId, params.id, {
        name: body.name,
        description: body.description,
        value: body.value,
        judgingStyle: body.judgingStyle as import("@/lib/db/hackathon-types").PrizeJudgingStyle | undefined,
        roundId: body.roundId,
        assignmentMode: body.assignmentMode as import("@/lib/db/hackathon-types").PrizeAssignmentMode | undefined,
        maxPicks: body.maxPicks,
        displayOrder: body.displayOrder,
      })

      if (!prize) {
        return new Response(JSON.stringify({ error: "Prize not found" }), { status: 404, headers: { "Content-Type": "application/json" } })
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
        maxPicks: t.Optional(t.Number()),
        displayOrder: t.Optional(t.Number()),
      }),
      detail: { summary: "Update prize", description: "Updates a prize's properties." },
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
      const assigned = await autoAssignJudges(params.id, params.prizeId, body.submissionsPerJudge)

      return assigned
    },
    {
      body: t.Object({
        submissionsPerJudge: t.Number({ description: "Number of submissions each judge should evaluate" }),
      }),
      detail: { summary: "Auto-assign judges", description: "Automatically distributes submissions across judges for a prize." },
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
      const round = await createRound(params.id, body.name)

      if (!round) {
        return new Response(JSON.stringify({ error: "Failed to create round" }), { status: 500, headers: { "Content-Type": "application/json" } })
      }

      return { round }
    },
    {
      body: t.Object({
        name: t.String({ description: "Round name (e.g. 'Preliminary', 'Finals')" }),
      }),
      detail: { summary: "Create round", description: "Creates a new judging round." },
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
      }),
      detail: { summary: "Update round", description: "Updates a round's name or status." },
    }
  )

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

      const { advanceSubmissions } = await import("@/lib/services/judging")
      const advanced = await advanceSubmissions(params.roundId, body.toRoundId, body.submissionIds)

      return advanced
    },
    {
      body: t.Object({
        toRoundId: t.String({ description: "Target round ID" }),
        submissionIds: t.Array(t.String(), { description: "Submission IDs to advance" }),
      }),
      detail: { summary: "Advance submissions", description: "Advances selected submissions to the next round." },
    }
  )

  // ============================================================
  // Judges
  // ============================================================

  .get("/hackathons/:id/judging/user-search", async ({ principal, params, query }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:read"])

    const { checkHackathonOrganizer } = await import("@/lib/services/public-hackathons")
    const result = await checkHackathonOrganizer(params.id, principal.tenantId)

    if (result.status === "not_found") {
      return new Response(JSON.stringify({ error: "Hackathon not found" }), { status: 404, headers: { "Content-Type": "application/json" } })
    }
    if (result.status === "not_authorized") {
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
        try {
          const judgeUser = await client.users.getUser(typedBody.clerkUserId)
          judgeEmail = judgeUser.primaryEmailAddress?.emailAddress
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

          if (hackathon.status !== "draft") {
            const addedByName = await resolveAdderName(principal, client)
            const { sendJudgeAddedNotification } = await import("@/lib/email/judge-invitations")
            sendJudgeAddedNotification({
              to: typedBody.email,
              hackathonName: hackathon.name,
              hackathonSlug: hackathon.slug,
              addedByName,
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
          }).catch(console.error)
        } else {
          const { createJudgePendingNotification } = await import("@/lib/services/judge-invitations")
          await createJudgePendingNotification(hackathon.id, invitationResult.invitation.id, typedBody.email, inviterName)
        }

        logAudit({
          principal,
          action: "judge.invited",
          resourceType: "hackathon",
          resourceId: params.id,
          metadata: { email: typedBody.email },
        })

        return { invitation: { id: invitationResult.invitation.id, email: typedBody.email } }
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

    return { success: result2.success }
  }, {
    detail: { summary: "Cancel invitation", description: "Cancels a pending judge invitation." },
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
