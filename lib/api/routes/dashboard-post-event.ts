import { Elysia, t } from "elysia"
import { resolvePrincipal, requirePrincipal } from "@/lib/auth/principal"
import { logAudit } from "@/lib/services/audit"
import { safeDecrypt } from "@/lib/services/encryption"
import { isSafeExternalUrl, normalizeUrl } from "@/lib/utils/url"

export const dashboardPostEventRoutes = new Elysia()
  .derive(async ({ request }) => {
    const principal = await resolvePrincipal(request)
    return { principal }
  })
  .get("/hackathons/:id/fulfillments", async ({ principal, params }) => {
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

    const { listFulfillments, getFulfillmentSummary } = await import("@/lib/services/prize-fulfillment")
    const [fulfillments, summary] = await Promise.all([
      listFulfillments(params.id),
      getFulfillmentSummary(params.id),
    ])

    return {
      fulfillments: fulfillments.map((f) => ({
        id: f.id,
        prizeAssignmentId: f.prize_assignment_id,
        prizeName: f.prizeName,
        prizeValue: f.prizeValue,
        prizeKind: f.prizeKind,
        submissionTitle: f.submissionTitle,
        teamName: f.teamName,
        status: f.status,
        recipientEmail: f.recipient_email,
        recipientName: f.recipient_name,
        shippingAddress: f.shipping_address,
        trackingNumber: f.tracking_number,
        paymentMethod: f.payment_method,
        paymentDetail: f.payment_detail ? safeDecrypt(f.payment_detail) : null,
        notes: f.notes,
        contactedAt: f.contacted_at,
        shippedAt: f.shipped_at,
        claimedAt: f.claimed_at,
        createdAt: f.created_at,
      })),
      summary,
    }
  }, {
    detail: {
      summary: "List prize fulfillments",
      description: "Lists all prize fulfillments with status summary. Requires hackathons:read scope.",
    },
  })
  .post("/hackathons/:id/fulfillments/initialize", async ({ principal, params }) => {
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

    const { initializeFulfillments } = await import("@/lib/services/prize-fulfillment")
    const count = await initializeFulfillments(params.id)

    await logAudit({
      principal,
      action: "fulfillment.initialized",
      resourceType: "hackathon",
      resourceId: params.id,
      metadata: { count },
    })

    return { success: true, count }
  }, {
    detail: {
      summary: "Initialize prize fulfillments",
      description: "Creates fulfillment tracking rows for all prize assignments. Idempotent. Requires hackathons:write scope.",
    },
  })
  .patch(
    "/hackathons/:id/fulfillments/:fulfillmentId",
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

      const { updateFulfillmentStatus } = await import("@/lib/services/prize-fulfillment")
      const fulfillment = await updateFulfillmentStatus(
        params.fulfillmentId,
        params.id,
        body.status,
        {
          notes: body.notes,
          trackingNumber: body.trackingNumber,
          shippingAddress: body.shippingAddress,
          recipientEmail: body.recipientEmail,
          recipientName: body.recipientName,
        }
      )

      if (!fulfillment) {
        return new Response(JSON.stringify({ error: "Invalid status transition or fulfillment not found" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })
      }

      await logAudit({
        principal,
        action: "fulfillment.updated",
        resourceType: "prize_fulfillment",
        resourceId: params.fulfillmentId,
        metadata: { status: body.status, hackathonId: params.id },
      })

      return { id: fulfillment.id, status: fulfillment.status }
    },
    {
      detail: {
        summary: "Update fulfillment status",
        description: "Advances a prize fulfillment to the next status. Requires hackathons:write scope.",
      },
      body: t.Object({
        status: t.Union([
          t.Literal("contacted"),
          t.Literal("shipped"),
          t.Literal("claimed"),
        ]),
        notes: t.Optional(t.String()),
        trackingNumber: t.Optional(t.String()),
        shippingAddress: t.Optional(t.String()),
        recipientEmail: t.Optional(t.String()),
        recipientName: t.Optional(t.String()),
      }),
    }
  )
  .post(
    "/hackathons/:id/feedback-survey",
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

      const surveyUrl = normalizeUrl(body.surveyUrl)
      if (!isSafeExternalUrl(surveyUrl)) {
        return new Response(JSON.stringify({ error: "Use a public HTTPS survey link" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })
      }

      const { sendFeedbackSurveyEmails } = await import("@/lib/email/feedback-survey")
      const { sent, failed } = await sendFeedbackSurveyEmails(params.id, surveyUrl)

      if (sent === 0 && failed === 0) {
        return new Response(JSON.stringify({ error: "Survey already sent or no participants found" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })
      }

      await logAudit({
        principal,
        action: "feedback_survey.sent",
        resourceType: "hackathon",
        resourceId: params.id,
        metadata: { sent, failed, surveyUrl },
      })

      return { success: true, sent, failed }
    },
    {
      detail: {
        summary: "Send feedback survey",
        description: "Sends a feedback survey email to all participants. Requires hackathons:write scope.",
      },
      body: t.Object({
        surveyUrl: t.String({ minLength: 1, maxLength: 2_048 }),
      }),
    }
  )
  .get("/hackathons/:id/reminders", async ({ principal, params }) => {
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

    const { listReminders } = await import("@/lib/services/post-event-reminders")
    const reminders = await listReminders(params.id)

    return {
      reminders: reminders.map((r) => ({
        id: r.id,
        type: r.type,
        scheduledFor: r.scheduled_for,
        sentAt: r.sent_at,
        cancelledAt: r.cancelled_at,
        recipientFilter: r.recipient_filter,
        createdAt: r.created_at,
      })),
    }
  }, {
    detail: {
      summary: "List post-event reminders",
      description: "Lists all scheduled reminders for a hackathon. Requires hackathons:read scope.",
    },
  })
  .delete("/hackathons/:id/reminders/:reminderId", async ({ principal, params }) => {
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

    const { cancelReminder } = await import("@/lib/services/post-event-reminders")
    const success = await cancelReminder(params.reminderId, params.id)

    if (!success) {
      return new Response(JSON.stringify({ error: "Reminder not found or already sent/cancelled" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    await logAudit({
      principal,
      action: "reminder.cancelled",
      resourceType: "post_event_reminder",
      resourceId: params.reminderId,
      metadata: { hackathonId: params.id },
    })

    return { success: true }
  }, {
    detail: {
      summary: "Cancel a reminder",
      description: "Cancels a pending post-event reminder. Requires hackathons:write scope.",
    },
  })
  .post("/hackathons/:id/reminders/:reminderId/send", async ({ principal, params }) => {
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

    const { getReminderById, processReminder } = await import("@/lib/services/post-event-reminders")
    const reminder = await getReminderById(params.reminderId, params.id)

    if (!reminder || reminder.sent_at || reminder.cancelled_at) {
      return new Response(JSON.stringify({ error: "Reminder not found or already sent/cancelled" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    const sent = await processReminder(reminder)

    await logAudit({
      principal,
      action: "reminder.sent",
      resourceType: "post_event_reminder",
      resourceId: params.reminderId,
      metadata: { hackathonId: params.id, sent },
    })

    return { success: true, sent }
  }, {
    detail: {
      summary: "Send a reminder now",
      description: "Immediately sends a pending reminder. Requires hackathons:write scope.",
    },
  })
