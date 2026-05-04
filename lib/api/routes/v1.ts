import { Elysia, t } from "elysia"
import { resolvePrincipal, requirePrincipal } from "@/lib/auth/principal"
import { createJob, getJobById, cancelJob, startJobWorkflow } from "@/lib/services/jobs"
import { logAudit } from "@/lib/services/audit"
import { checkRateLimit, defaultRateLimits, RateLimitError } from "@/lib/services/rate-limit"
import { trackEvent, isCliRequest, getCliVersion } from "@/lib/analytics/posthog"
import type { Json } from "@/lib/db/types"
import { normalizeUrl } from "@/lib/utils/url"

export const v1Routes = new Elysia({ prefix: "/v1", tags: ["v1"] })
  .derive(async ({ request }) => {
    const principal = await resolvePrincipal(request)
    const source = isCliRequest(request) ? "cli" as const : "api" as const
    const cliVersion = getCliVersion(request)

    if (principal.kind === "api_key") {
      const url = new URL(request.url)
      trackEvent(principal.keyId, "api.request", {
        source,
        method: request.method,
        path: url.pathname,
        ...(cliVersion && { cliVersion }),
      })
    }

    return { principal, source }
  })
  .get("/whoami", async ({ principal }) => {
    requirePrincipal(principal, ["api_key"])

    const rateLimit = await checkRateLimit(`api_key:${principal.keyId}:default`)
    if (!rateLimit.allowed) {
      throw new RateLimitError(rateLimit.resetAt, rateLimit.remaining)
    }

    const [{ getTenantById }, { getApiKeyById }] = await Promise.all([
      import("@/lib/services/tenants"),
      import("@/lib/services/api-keys"),
    ])
    const [tenant, apiKey] = await Promise.all([
      getTenantById(principal.tenantId),
      getApiKeyById(principal.keyId, principal.tenantId),
    ])

    return {
      tenantId: principal.tenantId,
      tenantName: tenant?.name ?? null,
      tenantSlug: tenant?.slug ?? null,
      tenantType: tenant ? (tenant.clerk_org_id ? "organization" : "personal") : null,
      keyId: principal.keyId,
      keyName: apiKey?.name ?? null,
      scopes: principal.scopes,
    }
  }, {
    detail: {
      summary: "Get current API key info",
      description: "Returns information about the authenticated API key including tenant, key ID, and scopes.",
      externalDocs: {
        description: "Code samples",
        url: "#whoami-samples",
      },
    },
  })
  .post(
    "/jobs",
    async ({ principal, body, request }) => {
      requirePrincipal(principal, ["api_key"], ["hackathons:write"])

      const rateLimit = await checkRateLimit(
        `api_key:${principal.keyId}:jobs:create`,
        defaultRateLimits["api_key:default"]
      )
      if (!rateLimit.allowed) {
        throw new RateLimitError(rateLimit.resetAt, rateLimit.remaining)
      }

      const idempotencyKey = request.headers.get("idempotency-key") ?? body.idempotencyKey

      const job = await createJob({
        tenantId: principal.tenantId,
        type: body.type,
        input: body.input as Json | undefined,
        createdByKeyId: principal.keyId,
        idempotencyKey: idempotencyKey ?? undefined,
      })

      if (!job) {
        throw new Error("Failed to create job")
      }

      await startJobWorkflow(job)

      await logAudit({
        principal,
        action: "job.created",
        resourceType: "job",
        resourceId: job.id,
        metadata: { type: body.type },
      })

      return {
        id: job.id,
        type: job.type,
        status: job.status_cache,
        createdAt: job.created_at,
      }
    },
    {
      body: t.Object({
        type: t.String({ minLength: 1, description: "Job type identifier" }),
        input: t.Optional(t.Any({ description: "Job input payload (JSON)" })),
        idempotencyKey: t.Optional(t.String({ description: "Unique key for idempotent requests" })),
      }),
      detail: {
        summary: "Create a new job",
        description: "Creates a new job and starts its workflow execution. Supports idempotency via header or body.",
      },
    }
  )
  .get("/jobs/:id", async ({ principal, params }) => {
    requirePrincipal(principal, ["api_key"], ["hackathons:read"])

    const rateLimit = await checkRateLimit(`api_key:${principal.keyId}:default`)
    if (!rateLimit.allowed) {
      throw new RateLimitError(rateLimit.resetAt, rateLimit.remaining)
    }

    const job = await getJobById(params.id, principal.tenantId)
    if (!job) {
      return new Response(JSON.stringify({ error: "Job not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })
    }

    return {
      id: job.id,
      type: job.type,
      status: job.status_cache,
      createdAt: job.created_at,
      updatedAt: job.updated_at,
      completedAt: job.completed_at,
    }
  }, {
    detail: {
      summary: "Get job status",
      description: "Returns the current status and metadata of a job.",
    },
  })
  .get("/jobs/:id/result", async ({ principal, params }) => {
    requirePrincipal(principal, ["api_key"], ["hackathons:read"])

    const rateLimit = await checkRateLimit(`api_key:${principal.keyId}:default`)
    if (!rateLimit.allowed) {
      throw new RateLimitError(rateLimit.resetAt, rateLimit.remaining)
    }

    const job = await getJobById(params.id, principal.tenantId)
    if (!job) {
      return new Response(JSON.stringify({ error: "Job not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })
    }

    if (job.status_cache === "queued" || job.status_cache === "running") {
      return new Response(
        JSON.stringify({
          error: "Job not completed",
          status: job.status_cache,
        }),
        {
          status: 202,
          headers: { "Content-Type": "application/json" },
        }
      )
    }

    return {
      id: job.id,
      status: job.status_cache,
      result: job.result,
      error: job.error,
      completedAt: job.completed_at,
    }
  }, {
    detail: {
      summary: "Get job result",
      description: "Returns the result of a completed job. Returns 202 if job is still running.",
    },
  })
  .post("/jobs/:id/cancel", async ({ principal, params }) => {
    requirePrincipal(principal, ["api_key"], ["hackathons:write"])

    const rateLimit = await checkRateLimit(`api_key:${principal.keyId}:default`)
    if (!rateLimit.allowed) {
      throw new RateLimitError(rateLimit.resetAt, rateLimit.remaining)
    }

    const success = await cancelJob(params.id, principal.tenantId)
    if (!success) {
      return new Response(
        JSON.stringify({ error: "Cannot cancel job (not found or already completed)" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      )
    }

    await logAudit({
      principal,
      action: "job.canceled",
      resourceType: "job",
      resourceId: params.id,
    })

    return { success: true }
  }, {
    detail: {
      summary: "Cancel a job",
      description: "Cancels a queued or running job. Cannot cancel completed jobs.",
    },
  })
  .get("/webhooks", async ({ principal }) => {
    requirePrincipal(principal, ["api_key"], ["webhooks:read"])

    const rateLimit = await checkRateLimit(`api_key:${principal.keyId}:default`)
    if (!rateLimit.allowed) {
      throw new RateLimitError(rateLimit.resetAt, rateLimit.remaining)
    }

    const { listWebhooks } = await import("@/lib/services/webhooks")
    const webhooks = await listWebhooks(principal.tenantId)

    return {
      webhooks: webhooks.map((w) => ({
        id: w.id,
        url: w.url,
        events: w.events,
        isActive: w.is_active,
        failureCount: w.failure_count,
        lastTriggeredAt: w.last_triggered_at,
        createdAt: w.created_at,
      })),
    }
  }, {
    detail: {
      summary: "List webhooks",
      description: "Returns all webhooks for the authenticated tenant.",
    },
  })
  .post(
    "/webhooks",
    async ({ principal, body }) => {
      requirePrincipal(principal, ["api_key"], ["webhooks:write"])

      const rateLimit = await checkRateLimit(`api_key:${principal.keyId}:default`)
      if (!rateLimit.allowed) {
        throw new RateLimitError(rateLimit.resetAt, rateLimit.remaining)
      }

      const webhookUrl = normalizeUrl(body.url)

      try {
        const parsedUrl = new URL(webhookUrl)
        if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
          return new Response(JSON.stringify({ error: "Webhook URL must use http or https" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          })
        }
      } catch {
        return new Response(JSON.stringify({ error: "Invalid webhook URL" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })
      }

      const { createWebhook } = await import("@/lib/services/webhooks")
      const result = await createWebhook({
        tenantId: principal.tenantId,
        url: webhookUrl,
        events: body.events as import("@/lib/db/hackathon-types").WebhookEvent[],
      })

      if (!result) {
        throw new Error("Failed to create webhook")
      }

      await logAudit({
        principal,
        action: "webhook.created",
        resourceType: "webhook",
        resourceId: result.webhook.id,
      })

      return {
        id: result.webhook.id,
        url: result.webhook.url,
        events: result.webhook.events,
        secret: result.secret,
        createdAt: result.webhook.created_at,
      }
    },
    {
      body: t.Object({
        url: t.String({ description: "Webhook endpoint URL" }),
        events: t.Array(t.String(), { description: "Events to subscribe to" }),
      }),
      detail: {
        summary: "Create webhook",
        description: "Creates a new webhook. Returns the webhook secret ONCE.",
      },
    }
  )
  .delete("/webhooks/:id", async ({ principal, params }) => {
    requirePrincipal(principal, ["api_key"], ["webhooks:write"])

    const rateLimit = await checkRateLimit(`api_key:${principal.keyId}:default`)
    if (!rateLimit.allowed) {
      throw new RateLimitError(rateLimit.resetAt, rateLimit.remaining)
    }

    const { deleteWebhook } = await import("@/lib/services/webhooks")
    const success = await deleteWebhook(params.id, principal.tenantId)

    if (!success) {
      return new Response(JSON.stringify({ error: "Webhook not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })
    }

    await logAudit({
      principal,
      action: "webhook.deleted",
      resourceType: "webhook",
      resourceId: params.id,
    })

    return { success: true }
  }, {
    detail: {
      summary: "Delete webhook",
      description: "Deletes a webhook.",
    },
  })
  .get(
    "/hackathons/:id/activity",
    async ({ principal, params, query }) => {
      requirePrincipal(principal, ["api_key"], ["hackathons:read"])

      const rateLimit = await checkRateLimit(`api_key:${principal.keyId}:default`)
      if (!rateLimit.allowed) {
        throw new RateLimitError(rateLimit.resetAt, rateLimit.remaining)
      }

      const { listHackathonAuditLogs } = await import("@/lib/services/audit")
      const result = await listHackathonAuditLogs(
        principal.tenantId,
        params.id,
        {
          limit: query.limit,
          offset: query.offset,
          action: query.action || undefined,
          resourceType: query.resource_type || undefined,
          since: query.since || undefined,
          until: query.until || undefined,
          sort: query.sort === "asc" ? "asc" : undefined,
        }
      )

      return {
        logs: result.logs.map((log) => ({
          id: log.id,
          action: log.action,
          resourceType: log.resource_type,
          resourceId: log.resource_id,
          actorType: log.actor_type,
          metadata: log.metadata,
          createdAt: log.created_at,
        })),
        total: result.total,
      }
    },
    {
      query: t.Object({
        limit: t.Optional(t.Numeric({ description: "Page size (1-100, default 50)" })),
        offset: t.Optional(t.Numeric({ description: "Pagination offset (default 0)" })),
        action: t.Optional(t.String({ description: "Filter by action (substring match, e.g. 'hackathon.created')" })),
        resource_type: t.Optional(t.String({ description: "Filter by resource type (exact match, e.g. 'hackathon')" })),
        since: t.Optional(t.String({ description: "Only logs after this ISO 8601 timestamp" })),
        until: t.Optional(t.String({ description: "Only logs before this ISO 8601 timestamp" })),
        sort: t.Optional(t.String({ description: "Sort order: 'asc' or 'desc' (default 'desc')" })),
      }),
      detail: {
        summary: "List hackathon activity",
        description: "Returns audit logs for a specific hackathon. Supports filtering by action, resource type, and date range. Requires hackathons:read scope.",
      },
    }
  )
