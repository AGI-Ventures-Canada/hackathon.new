import { Elysia, t } from "elysia"
import { resolvePrincipal, requirePrincipal } from "@/lib/auth/principal"
import { logAudit } from "@/lib/services/audit"

export const dashboardJudgeDisplayRoutes = new Elysia()
  .derive(async ({ request }) => {
    const principal = await resolvePrincipal(request)
    return { principal }
  })
  .get("/hackathons/:id/judges/display", async ({ principal, params }) => {
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

    const { listJudgeDisplayProfiles } = await import("@/lib/services/judge-display")
    const judges = await listJudgeDisplayProfiles(params.id)

    return {
      judges: judges.map((j) => ({
        id: j.id,
        name: j.name,
        title: j.title,
        organization: j.organization,
        headshotUrl: j.headshot_url,
        clerkUserId: j.clerk_user_id,
        participantId: j.participant_id,
        displayOrder: j.display_order,
        createdAt: j.created_at,
      })),
    }
  }, {
    detail: {
      summary: "List judge display profiles",
      description: "Lists all judge display profiles for a hackathon. Requires hackathons:read scope.",
    },
  })
  .post(
    "/hackathons/:id/judges/display",
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

      let resolvedClerkUserId = body.clerkUserId
      let resolvedName = body.name
      let resolvedHeadshotUrl = body.headshotUrl
      if (!resolvedClerkUserId && body.email) {
        const { clerkClient } = await import("@clerk/nextjs/server")
        const client = await clerkClient()
        const existingUsers = await client.users.getUserList({ emailAddress: [body.email] })
        if (existingUsers.data.length > 0) {
          const user = existingUsers.data[0]
          resolvedClerkUserId = user.id
          const clerkName = [user.firstName, user.lastName].filter(Boolean).join(" ")
          if (clerkName) resolvedName = clerkName
          if (!resolvedHeadshotUrl && user.imageUrl) resolvedHeadshotUrl = user.imageUrl
        }
      }

      const { createJudgeDisplayProfile } = await import("@/lib/services/judge-display")
      const createResult = await createJudgeDisplayProfile(params.id, {
        name: resolvedName,
        title: body.title,
        organization: body.organization,
        headshotUrl: resolvedHeadshotUrl,
        clerkUserId: resolvedClerkUserId,
        participantId: body.participantId,
        displayOrder: body.displayOrder,
      })

      if (createResult.status === "duplicate") {
        return new Response(JSON.stringify({ error: "Judge already exists" }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        })
      }

      if (createResult.status === "error") {
        return new Response(JSON.stringify({ error: "Failed to create judge profile" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        })
      }

      const judge = createResult.judge

      await logAudit({
        principal,
        action: "judge_display.created",
        resourceType: "judge_display",
        resourceId: judge.id,
        metadata: { hackathonId: params.id },
      })

      return {
        id: judge.id,
        name: judge.name,
        headshotUrl: judge.headshot_url,
        clerkUserId: judge.clerk_user_id,
        displayOrder: judge.display_order,
      }
    },
    {
      detail: {
        summary: "Create judge display profile",
        description: "Creates a new judge display profile. Requires hackathons:write scope.",
      },
      body: t.Object({
        name: t.String({ minLength: 1 }),
        title: t.Optional(t.Union([t.String(), t.Null()])),
        organization: t.Optional(t.Union([t.String(), t.Null()])),
        headshotUrl: t.Optional(t.Union([t.String(), t.Null()])),
        clerkUserId: t.Optional(t.Union([t.String(), t.Null()])),
        participantId: t.Optional(t.Union([t.String(), t.Null()])),
        displayOrder: t.Optional(t.Number()),
        email: t.Optional(t.String()),
      }),
    }
  )
  .patch(
    "/hackathons/:id/judges/display/:judgeId",
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

      const { updateJudgeDisplayProfile } = await import("@/lib/services/judge-display")
      const judge = await updateJudgeDisplayProfile(params.judgeId, params.id, {
        name: body.name,
        title: body.title,
        organization: body.organization,
        headshotUrl: body.headshotUrl,
        displayOrder: body.displayOrder,
      })

      if (!judge) {
        return new Response(JSON.stringify({ error: "Judge profile not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        })
      }

      return { id: judge.id, updatedAt: judge.updated_at }
    },
    {
      detail: {
        summary: "Update judge display profile",
        description: "Updates a judge display profile. Requires hackathons:write scope.",
      },
      body: t.Object({
        name: t.Optional(t.String()),
        title: t.Optional(t.Union([t.String(), t.Null()])),
        organization: t.Optional(t.Union([t.String(), t.Null()])),
        headshotUrl: t.Optional(t.Union([t.String(), t.Null()])),
        displayOrder: t.Optional(t.Number()),
      }),
    }
  )
  .delete("/hackathons/:id/judges/display/:judgeId", async ({ principal, params }) => {
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

    const { deleteJudgeDisplayProfile } = await import("@/lib/services/judge-display")
    const deleteResult = await deleteJudgeDisplayProfile(params.judgeId, params.id)

    if (!deleteResult.deleted) {
      return new Response(JSON.stringify({ error: "Judge profile not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })
    }

    if (deleteResult.cascadeError) {
      return new Response(JSON.stringify({ error: deleteResult.cascadeError }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    }

    await logAudit({
      principal,
      action: "judge_display.deleted",
      resourceType: "judge_display",
      resourceId: params.judgeId,
    })

    return { success: true }
  }, {
    detail: {
      summary: "Delete judge display profile",
      description: "Deletes a judge display profile. Requires hackathons:write scope.",
    },
  })
  .post(
    "/hackathons/:id/judges/display/reorder",
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

      const { reorderJudgeDisplayProfiles } = await import("@/lib/services/judge-display")
      const success = await reorderJudgeDisplayProfiles(params.id, body.orderedIds)

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
        summary: "Reorder judge display profiles",
        description: "Reorders judge display profiles. Requires hackathons:write scope.",
      },
      body: t.Object({
        orderedIds: t.Array(t.String()),
      }),
    }
  )
  .post("/hackathons/:id/judges/display/:judgeId/headshot", async ({ principal, params, request }) => {
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

    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return new Response(JSON.stringify({ error: "No file provided" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    const allowedTypes = ["image/png", "image/jpeg", "image/webp"]
    if (!allowedTypes.includes(file.type)) {
      return new Response(JSON.stringify({ error: "Invalid file type. Use PNG, JPEG, or WebP" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    if (file.size > 5 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: "File too large (max 5MB)" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    const { uploadJudgeHeadshot } = await import("@/lib/services/storage")
    const buffer = Buffer.from(await file.arrayBuffer())
    const uploadResult = await uploadJudgeHeadshot(params.id, params.judgeId, buffer)

    if (!uploadResult) {
      return new Response(JSON.stringify({ error: "Failed to upload headshot" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    }

    const { updateJudgeDisplayProfile } = await import("@/lib/services/judge-display")
    await updateJudgeDisplayProfile(params.judgeId, params.id, {
      headshotUrl: uploadResult.url,
    })

    return { success: true, headshotUrl: uploadResult.url }
  }, {
    detail: {
      summary: "Upload judge headshot",
      description: "Uploads a headshot image for a judge display profile. Accepts PNG, JPEG, or WebP (max 5MB).",
    },
  })
  .delete("/hackathons/:id/judges/display/:judgeId/headshot", async ({ principal, params }) => {
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

    const { deleteJudgeHeadshot } = await import("@/lib/services/storage")
    await deleteJudgeHeadshot(params.id, params.judgeId)

    const { updateJudgeDisplayProfile } = await import("@/lib/services/judge-display")
    await updateJudgeDisplayProfile(params.judgeId, params.id, {
      headshotUrl: null,
    })

    return { success: true }
  }, {
    detail: {
      summary: "Delete judge headshot",
      description: "Removes the headshot from a judge display profile.",
    },
  })
