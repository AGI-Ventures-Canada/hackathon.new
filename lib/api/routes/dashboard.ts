import { Elysia, t } from "elysia"
import { normalizeOptionalUrl, normalizeUrl } from "@/lib/utils/url"
import { resolvePrincipal, requirePrincipal } from "@/lib/auth/principal"
import { createApiKey, listApiKeys, revokeApiKey, getApiKeyById } from "@/lib/services/api-keys"
import { listJobs, getJobById } from "@/lib/services/jobs"
import { logAudit } from "@/lib/services/audit"
import { checkRateLimit, RateLimitError } from "@/lib/services/rate-limit"
import { dashboardJudgingRoutes } from "./dashboard-judging"
import { dashboardResultsRoutes } from "./dashboard-results"
import { dashboardJudgeDisplayRoutes } from "./dashboard-judge-display"
import { dashboardPostEventRoutes } from "./dashboard-post-event"
import { dashboardSponsorFulfillmentRoutes } from "./dashboard-sponsor-fulfillments"
import { getEffectiveStatus } from "@/lib/utils/timeline"
import type { Scope } from "@/lib/auth/types"
import { ALL_SCOPES } from "@/lib/auth/types"
import type { WebhookEvent, SponsorTier } from "@/lib/db/hackathon-types"

export const dashboardRoutes = new Elysia({ prefix: "/dashboard" })
  .derive(async ({ request }) => {
    const principal = await resolvePrincipal(request)

    if (principal.kind === "api_key") {
      const result = await checkRateLimit(`api_key:${principal.keyId}:dashboard`)
      if (!result.allowed) {
        throw new RateLimitError(result.resetAt, result.remaining)
      }
    }

    return { principal }
  })
  .get("/me", async ({ principal }) => {
    requirePrincipal(principal, ["user", "api_key"])

    if (principal.kind === "api_key") {
      return {
        tenantId: principal.tenantId,
        keyId: principal.keyId,
        scopes: principal.scopes,
      }
    }

    return {
      tenantId: principal.tenantId,
      userId: principal.userId,
      orgId: principal.orgId,
      orgRole: principal.orgRole,
      scopes: principal.scopes,
    }
  }, {
    detail: {
      summary: "Get current principal",
      description: "Returns info about the authenticated principal (user or API key).",
    },
  })
  .get(
    "/organizations/slug-available",
    async ({ principal, query }) => {
      requirePrincipal(principal, ["user"])

      const { isSlugAvailable } = await import("@/lib/services/tenant-profiles")
      const available = await isSlugAvailable(query.slug)

      return { available }
    },
    {
      detail: {
        summary: "Check slug availability",
        description: "Returns whether a slug is available for a new organization. Clerk-only.",
      },
      query: t.Object({
        slug: t.String({ minLength: 1 }),
      }),
    }
  )
  .get(
    "/organizations/search",
    async ({ principal, query }) => {
      requirePrincipal(principal, ["user"])

      const excludeIds = query.exclude?.split(",").filter(Boolean) ?? []

      const { searchTenants } = await import("@/lib/services/tenants")
      const { searchTenantSponsors } = await import("@/lib/services/tenant-sponsors")

      const [platformResults, savedSponsors] = await Promise.all([
        searchTenants(query.q, { excludeIds, limit: 10 }),
        searchTenantSponsors(principal.tenantId, query.q, { limit: 5 }),
      ])

      const platformOrgs = platformResults.map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        logoUrl: t.logo_url,
        logoUrlDark: t.logo_url_dark,
        websiteUrl: t.website_url,
        isSaved: false,
      }))

      const platformNames = new Set(platformOrgs.map((o) => o.name.toLowerCase()))

      const savedOrgs = savedSponsors
        .filter((s) => !platformNames.has(s.name.toLowerCase()))
        .map((s) => ({
          id: s.id,
          name: s.name,
          slug: null,
          logoUrl: s.logo_url,
          logoUrlDark: s.logo_url_dark,
          websiteUrl: s.website_url,
          isSaved: true,
        }))

      return {
        organizations: [...savedOrgs, ...platformOrgs],
      }
    },
    {
      detail: {
        summary: "Search organizations",
        description: "Searches tenants by name. Clerk-only.",
      },
      query: t.Object({
        q: t.String({ minLength: 2 }),
        exclude: t.Optional(t.String()),
      }),
    }
  )
  .get("/keys", async ({ principal }) => {
    requirePrincipal(principal, ["user"], ["keys:read"])

    const keys = await listApiKeys(principal.tenantId)
    return {
      keys: keys.map((k) => ({
        id: k.id,
        name: k.name,
        prefix: k.prefix,
        scopes: k.scopes,
        createdAt: k.created_at,
        lastUsedAt: k.last_used_at,
        revokedAt: k.revoked_at,
      })),
    }
  }, {
    detail: {
      summary: "List API keys",
      description: "Lists API keys for the tenant. Requires keys:read scope. Clerk-only.",
    },
  })
  .post(
    "/keys",
    async ({ principal, body }) => {
      requirePrincipal(principal, ["user"], ["keys:write"])

      const sanitizedScopes = body.scopes
        ? (body.scopes.filter((s) => ALL_SCOPES.includes(s as Scope)) as Scope[])
        : undefined

      const result = await createApiKey({
        tenantId: principal.tenantId,
        name: body.name,
        scopes: sanitizedScopes,
      })

      if (!result) {
        throw new Error("Failed to create API key")
      }

      await logAudit({
        principal,
        action: "api_key.created",
        resourceType: "api_key",
        resourceId: result.apiKey.id,
        metadata: { name: body.name },
      })

      return {
        id: result.apiKey.id,
        name: result.apiKey.name,
        prefix: result.apiKey.prefix,
        scopes: result.apiKey.scopes,
        createdAt: result.apiKey.created_at,
        key: result.rawKey,
      }
    },
    {
      detail: {
        summary: "Create API key",
        description: "Creates a new API key and returns the raw key once. Requires keys:write scope. Clerk-only.",
      },
      body: t.Object({
        name: t.String({ minLength: 1 }),
        scopes: t.Optional(t.Array(t.String())),
      }),
    }
  )
  .post("/keys/:id/revoke", async ({ principal, params }) => {
    requirePrincipal(principal, ["user"], ["keys:write"])

    const key = await getApiKeyById(params.id, principal.tenantId)
    if (!key) {
      return new Response(JSON.stringify({ error: "API key not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })
    }

    const success = await revokeApiKey(params.id, principal.tenantId)
    if (!success) {
      throw new Error("Failed to revoke API key")
    }

    await logAudit({
      principal,
      action: "api_key.revoked",
      resourceType: "api_key",
      resourceId: params.id,
    })

    return { success: true }
  }, {
    detail: {
      summary: "Revoke API key",
      description: "Revokes an API key. Requires keys:write scope. Clerk-only.",
    },
  })
  .get("/jobs", async ({ principal, query }) => {
    requirePrincipal(principal, ["user", "api_key"])

    const jobs = await listJobs(principal.tenantId, {
      limit: query.limit ? parseInt(query.limit) : undefined,
      offset: query.offset ? parseInt(query.offset) : undefined,
    })

    return {
      jobs: jobs.map((j) => ({
        id: j.id,
        type: j.type,
        status: j.status_cache,
        createdAt: j.created_at,
        updatedAt: j.updated_at,
        completedAt: j.completed_at,
      })),
    }
  }, {
    detail: {
      summary: "List jobs",
      description: "Lists jobs for the tenant. Supports limit and offset pagination.",
    },
  })
  .get("/jobs/:id", async ({ principal, params }) => {
    requirePrincipal(principal, ["user", "api_key"])

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
      input: job.input,
      result: job.result,
      error: job.error,
      createdAt: job.created_at,
      updatedAt: job.updated_at,
      completedAt: job.completed_at,
    }
  }, {
    detail: {
      summary: "Get job",
      description: "Returns full job details including input, result, and error.",
    },
  })
  .get("/webhooks", async ({ principal }) => {
    requirePrincipal(principal, ["user", "api_key"], ["webhooks:read"])

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
      description: "Lists webhooks for the tenant. Requires webhooks:read scope.",
    },
  })
  .post(
    "/webhooks",
    async ({ principal, body }) => {
      requirePrincipal(principal, ["user", "api_key"], ["webhooks:write"])

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
        events: body.events as WebhookEvent[],
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
      }
    },
    {
      detail: {
        summary: "Create webhook",
        description: "Creates a webhook and returns the signing secret once. Requires webhooks:write scope.",
      },
      body: t.Object({
        url: t.String(),
        events: t.Array(t.String()),
      }),
    }
  )
  .delete("/webhooks/:id", async ({ principal, params }) => {
    requirePrincipal(principal, ["user", "api_key"], ["webhooks:write"])

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
      description: "Deletes a webhook. Requires webhooks:write scope.",
    },
  })
  .get("/schedules", async ({ principal, query }) => {
    requirePrincipal(principal, ["user", "api_key"], ["schedules:read"])

    const { listSchedules } = await import("@/lib/services/schedules")
    const schedules = await listSchedules(principal.tenantId, {
      limit: query.limit ? parseInt(query.limit) : undefined,
      activeOnly: query.activeOnly === "true",
    })

    return {
      schedules: schedules.map((s) => ({
        id: s.id,
        name: s.name,
        frequency: s.frequency,
        cronExpression: s.cron_expression,
        timezone: s.timezone,
        jobType: s.job_type,
        isActive: s.is_active,
        nextRunAt: s.next_run_at,
        lastRunAt: s.last_run_at,
        runCount: s.run_count,
        createdAt: s.created_at,
      })),
    }
  }, {
    detail: {
      summary: "List schedules",
      description: "Lists schedules for the tenant. Requires schedules:read scope.",
    },
  })
  .post(
    "/schedules",
    async ({ principal, body }) => {
      requirePrincipal(principal, ["user", "api_key"], ["schedules:write"])

      const { createSchedule } = await import("@/lib/services/schedules")
      const schedule = await createSchedule({
        tenantId: principal.tenantId,
        name: body.name,
        frequency: body.frequency,
        cronExpression: body.cronExpression,
        timezone: body.timezone,
        jobType: body.jobType,
        input: body.input,
      })

      if (!schedule) {
        throw new Error("Failed to create schedule")
      }

      await logAudit({
        principal,
        action: "schedule.created",
        resourceType: "schedule",
        resourceId: schedule.id,
        metadata: { name: body.name },
      })

      return {
        id: schedule.id,
        name: schedule.name,
        nextRunAt: schedule.next_run_at,
      }
    },
    {
      detail: {
        summary: "Create schedule",
        description: "Creates a new schedule. Requires schedules:write scope.",
      },
      body: t.Object({
        name: t.String({ minLength: 1 }),
        frequency: t.Union([
          t.Literal("once"),
          t.Literal("hourly"),
          t.Literal("daily"),
          t.Literal("weekly"),
          t.Literal("monthly"),
          t.Literal("cron"),
        ]),
        cronExpression: t.Optional(t.String()),
        timezone: t.Optional(t.String()),
        runTime: t.Optional(t.String()),
        jobType: t.Optional(t.String()),
        input: t.Optional(t.Record(t.String(), t.Unknown())),
      }),
    }
  )
  .get("/schedules/:id", async ({ principal, params }) => {
    requirePrincipal(principal, ["user", "api_key"], ["schedules:read"])

    const { getScheduleById } = await import("@/lib/services/schedules")
    const schedule = await getScheduleById(params.id, principal.tenantId)

    if (!schedule) {
      return new Response(JSON.stringify({ error: "Schedule not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })
    }

    return {
      id: schedule.id,
      name: schedule.name,
      frequency: schedule.frequency,
      cronExpression: schedule.cron_expression,
      timezone: schedule.timezone,
      jobType: schedule.job_type,
      input: schedule.input,
      isActive: schedule.is_active,
      nextRunAt: schedule.next_run_at,
      lastRunAt: schedule.last_run_at,
      runCount: schedule.run_count,
      createdAt: schedule.created_at,
      updatedAt: schedule.updated_at,
    }
  }, {
    detail: {
      summary: "Get schedule",
      description: "Returns full schedule details. Requires schedules:read scope.",
    },
  })
  .patch(
    "/schedules/:id",
    async ({ principal, params, body }) => {
      requirePrincipal(principal, ["user", "api_key"], ["schedules:write"])

      const { updateSchedule } = await import("@/lib/services/schedules")
      const schedule = await updateSchedule(params.id, principal.tenantId, {
        name: body.name,
        frequency: body.frequency,
        cronExpression: body.cronExpression,
        timezone: body.timezone,
        runTime: body.runTime,
        input: body.input,
        isActive: body.isActive,
      })

      if (!schedule) {
        return new Response(JSON.stringify({ error: "Schedule not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        })
      }

      await logAudit({
        principal,
        action: "schedule.updated",
        resourceType: "schedule",
        resourceId: params.id,
      })

      return { id: schedule.id, nextRunAt: schedule.next_run_at, updatedAt: schedule.updated_at }
    },
    {
      detail: {
        summary: "Update schedule",
        description: "Updates schedule settings. Requires schedules:write scope.",
      },
      body: t.Object({
        name: t.Optional(t.String()),
        frequency: t.Optional(
          t.Union([
            t.Literal("once"),
            t.Literal("hourly"),
            t.Literal("daily"),
            t.Literal("weekly"),
            t.Literal("monthly"),
            t.Literal("cron"),
          ])
        ),
        cronExpression: t.Optional(t.String()),
        timezone: t.Optional(t.String()),
        runTime: t.Optional(t.String()),
        input: t.Optional(t.Record(t.String(), t.Unknown())),
        isActive: t.Optional(t.Boolean()),
      }),
    }
  )
  .delete("/schedules/:id", async ({ principal, params }) => {
    requirePrincipal(principal, ["user", "api_key"], ["schedules:write"])

    const { deleteSchedule } = await import("@/lib/services/schedules")
    const success = await deleteSchedule(params.id, principal.tenantId)

    if (!success) {
      return new Response(JSON.stringify({ error: "Schedule not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })
    }

    await logAudit({
      principal,
      action: "schedule.deleted",
      resourceType: "schedule",
      resourceId: params.id,
    })

    return { success: true }
  }, {
    detail: {
      summary: "Delete schedule",
      description: "Deletes a schedule. Requires schedules:write scope.",
    },
  })
  .get("/integrations", async ({ principal }) => {
    requirePrincipal(principal, ["user"])

    const { listIntegrations } = await import("@/lib/integrations/oauth")
    const integrations = await listIntegrations(principal.tenantId)

    return {
      integrations: integrations.map((i) => ({
        id: i.id,
        provider: i.provider,
        accountEmail: i.account_email,
        isActive: i.is_active,
        scopes: i.scopes,
        tokenExpiresAt: i.token_expires_at,
        createdAt: i.created_at,
      })),
    }
  }, {
    detail: {
      summary: "List integrations",
      description: "Lists OAuth integrations for the tenant. Clerk-only.",
    },
  })
  .get("/integrations/:provider/auth-url", async ({ principal, params }) => {
    requirePrincipal(principal, ["user"])

    const { buildAuthUrl } = await import("@/lib/integrations/oauth")
    const state = Buffer.from(
      JSON.stringify({ tenantId: principal.tenantId, userId: principal.userId })
    ).toString("base64url")

    const authUrl = buildAuthUrl(params.provider as "gmail" | "google_calendar" | "notion" | "luma", state)

    if (!authUrl) {
      return new Response(JSON.stringify({ error: "Provider not configured" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    return { authUrl }
  }, {
    detail: {
      summary: "Get OAuth auth URL",
      description: "Returns the OAuth authorization URL for a provider. Clerk-only.",
    },
  })
  .delete("/integrations/:provider", async ({ principal, params }) => {
    requirePrincipal(principal, ["user"])

    const { deleteIntegration } = await import("@/lib/integrations/oauth")
    const success = await deleteIntegration(
      principal.tenantId,
      params.provider as "gmail" | "google_calendar" | "notion" | "luma"
    )

    if (!success) {
      return new Response(JSON.stringify({ error: "Integration not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })
    }

    await logAudit({
      principal,
      action: "integration.deleted",
      resourceType: "integration",
      resourceId: params.provider,
    })

    return { success: true }
  }, {
    detail: {
      summary: "Delete integration",
      description: "Removes an OAuth integration. Clerk-only.",
    },
  })
  .get("/credentials", async ({ principal }) => {
    requirePrincipal(principal, ["user"])

    const { listCredentials } = await import("@/lib/services/org-credentials")
    const credentials = await listCredentials(principal.tenantId)

    return {
      credentials: credentials.map((c) => ({
        id: c.id,
        provider: c.provider,
        label: c.label,
        accountIdentifier: c.account_identifier,
        isActive: c.is_active,
        lastUsedAt: c.last_used_at,
        createdAt: c.created_at,
      })),
    }
  }, {
    detail: {
      summary: "List credentials",
      description: "Lists stored API credentials for the tenant. Clerk-only.",
    },
  })
  .post(
    "/credentials",
    async ({ principal, body }) => {
      requirePrincipal(principal, ["user"])

      const { saveCredential } = await import("@/lib/services/org-credentials")
      const credential = await saveCredential({
        tenantId: principal.tenantId,
        provider: body.provider as "luma",
        apiKey: body.apiKey,
        label: body.label,
        accountIdentifier: body.accountIdentifier,
      })

      if (!credential) {
        return new Response(JSON.stringify({ error: "Failed to save credential" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        })
      }

      await logAudit({
        principal,
        action: "credential.saved",
        resourceType: "credential",
        resourceId: credential.id,
        metadata: { provider: body.provider },
      })

      return {
        id: credential.id,
        provider: credential.provider,
        label: credential.label,
        createdAt: credential.created_at,
      }
    },
    {
      detail: {
        summary: "Save credential",
        description: "Saves an API credential (e.g. Luma API key). Clerk-only.",
      },
      body: t.Object({
        provider: t.String(),
        apiKey: t.String({ minLength: 1 }),
        label: t.Optional(t.String()),
        accountIdentifier: t.Optional(t.String()),
      }),
    }
  )
  .patch(
    "/credentials/:provider",
    async ({ principal, params, body }) => {
      requirePrincipal(principal, ["user"])

      const { updateCredential } = await import("@/lib/services/org-credentials")
      const credential = await updateCredential(
        principal.tenantId,
        params.provider as "luma",
        {
          apiKey: body.apiKey,
          label: body.label,
          accountIdentifier: body.accountIdentifier,
          isActive: body.isActive,
        }
      )

      if (!credential) {
        return new Response(JSON.stringify({ error: "Credential not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        })
      }

      await logAudit({
        principal,
        action: "credential.updated",
        resourceType: "credential",
        resourceId: credential.id,
        metadata: { provider: params.provider },
      })

      return {
        id: credential.id,
        provider: credential.provider,
        updatedAt: credential.updated_at,
      }
    },
    {
      detail: {
        summary: "Update credential",
        description: "Updates a stored credential. Clerk-only.",
      },
      body: t.Object({
        apiKey: t.Optional(t.String({ minLength: 1 })),
        label: t.Optional(t.String()),
        accountIdentifier: t.Optional(t.String()),
        isActive: t.Optional(t.Boolean()),
      }),
    }
  )
  .delete("/credentials/:provider", async ({ principal, params }) => {
    requirePrincipal(principal, ["user"])

    const { deleteCredential } = await import("@/lib/services/org-credentials")
    const success = await deleteCredential(principal.tenantId, params.provider as "luma")

    if (!success) {
      return new Response(JSON.stringify({ error: "Credential not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })
    }

    await logAudit({
      principal,
      action: "credential.deleted",
      resourceType: "credential",
      metadata: { provider: params.provider },
    })

    return { success: true }
  }, {
    detail: {
      summary: "Delete credential",
      description: "Deletes a stored credential. Clerk-only.",
    },
  })
  .get("/hackathons", async ({ principal, query }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:read"])

    const q = (query as Record<string, string | undefined>).q
    const { listOrganizedHackathons } = await import("@/lib/services/hackathons")
    const hackathons = await listOrganizedHackathons(principal.tenantId, q ? { search: q } : undefined)

    const { sortByStatusPriority } = await import("@/lib/utils/sort-hackathons")
    const sorted = sortByStatusPriority(hackathons)

    return {
      hackathons: sorted.map((h) => ({
        id: h.id,
        name: h.name,
        slug: h.slug,
        description: h.description,
        status: getEffectiveStatus(h),
        startsAt: h.starts_at,
        endsAt: h.ends_at,
        registrationOpensAt: h.registration_opens_at,
        registrationClosesAt: h.registration_closes_at,
        createdAt: h.created_at,
      })),
    }
  }, {
    detail: {
      summary: "List organized hackathons",
      description: "Lists hackathons organized by the tenant. Requires hackathons:read scope.",
    },
  })
  .get("/hackathons/participating", async ({ principal, query }) => {
    requirePrincipal(principal, ["user"])

    const q = (query as Record<string, string | undefined>).q
    const { listParticipatingHackathons } = await import("@/lib/services/hackathons")
    const hackathons = await listParticipatingHackathons(principal.userId!, q ? { search: q } : undefined)

    const { sortByStatusPriority } = await import("@/lib/utils/sort-hackathons")
    const sorted = sortByStatusPriority(hackathons)

    return {
      hackathons: sorted.map((h) => ({
        id: h.id,
        name: h.name,
        slug: h.slug,
        description: h.description,
        status: getEffectiveStatus(h),
        startsAt: h.starts_at,
        endsAt: h.ends_at,
        registrationOpensAt: h.registration_opens_at,
        registrationClosesAt: h.registration_closes_at,
        role: h.role,
      })),
    }
  }, {
    detail: {
      summary: "List participating hackathons",
      description: "Lists hackathons the user is participating in. Clerk-only.",
    },
  })
  .get("/hackathons/sponsored", async ({ principal, query }) => {
    requirePrincipal(principal, ["user"])

    const q = (query as Record<string, string | undefined>).q
    const { listSponsoredHackathons } = await import("@/lib/services/hackathons")
    const hackathons = await listSponsoredHackathons(principal.tenantId, q ? { search: q } : undefined)

    const { sortByStatusPriority } = await import("@/lib/utils/sort-hackathons")
    const sorted = sortByStatusPriority(hackathons)

    return {
      hackathons: sorted.map((h) => ({
        id: h.id,
        name: h.name,
        slug: h.slug,
        description: h.description,
        status: getEffectiveStatus(h),
        startsAt: h.starts_at,
        endsAt: h.ends_at,
        registrationOpensAt: h.registration_opens_at,
        registrationClosesAt: h.registration_closes_at,
      })),
    }
  }, {
    detail: {
      summary: "List sponsored hackathons",
      description: "Lists hackathons sponsored by the tenant. Clerk-only.",
    },
  })
  .get("/hackathons/judging", async ({ principal, query }) => {
    requirePrincipal(principal, ["user"])

    const q = (query as Record<string, string | undefined>).q
    const { listJudgingHackathons } = await import("@/lib/services/hackathons")
    const hackathons = await listJudgingHackathons(principal.userId!, q ? { search: q } : undefined)

    const { sortByStatusPriority } = await import("@/lib/utils/sort-hackathons")
    const sorted = sortByStatusPriority(hackathons)

    return {
      hackathons: sorted.map((h) => ({
        id: h.id,
        name: h.name,
        slug: h.slug,
        description: h.description,
        status: getEffectiveStatus(h),
        startsAt: h.starts_at,
        endsAt: h.ends_at,
        registrationOpensAt: h.registration_opens_at,
        registrationClosesAt: h.registration_closes_at,
      })),
    }
  }, {
    detail: {
      summary: "List judging hackathons",
      description: "Lists hackathons where the user is a judge. Clerk-only.",
    },
  })
  .post(
    "/hackathons",
    async ({ principal, body }) => {
      requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])

      const { createHackathon } = await import("@/lib/services/hackathons")
      const hackathon = await createHackathon(principal.tenantId, {
        name: body.name,
        description: body.description,
      })

      if (!hackathon) {
        return new Response(JSON.stringify({ error: "Failed to create hackathon" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        })
      }

      await logAudit({
        principal,
        action: "hackathon.created",
        resourceType: "hackathon",
        resourceId: hackathon.id,
        metadata: { name: hackathon.name },
      })

      const { triggerWebhooks } = await import("@/lib/services/webhooks")
      triggerWebhooks(principal.tenantId, "hackathon.created", {
        event: "hackathon.created",
        timestamp: new Date().toISOString(),
        data: { hackathonId: hackathon.id, name: hackathon.name, slug: hackathon.slug },
      }).catch(console.error)

      return {
        id: hackathon.id,
        name: hackathon.name,
        slug: hackathon.slug,
      }
    },
    {
      detail: {
        summary: "Create hackathon",
        description: "Creates a new hackathon. Requires hackathons:write scope.",
      },
      body: t.Object({
        name: t.String({ minLength: 1 }),
        description: t.Optional(t.Union([t.String(), t.Null()])),
      }),
    }
  )
  .get("/hackathons/:id", async ({ principal, params }) => {
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
      return new Response(JSON.stringify({ error: "Not authorized to manage this hackathon. You may need to switch to the correct organization." }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      })
    }
    const hackathon = result.hackathon

    return {
      id: hackathon.id,
      name: hackathon.name,
      slug: hackathon.slug,
      description: hackathon.description,
      rules: hackathon.rules,
      bannerUrl: hackathon.banner_url,
      status: getEffectiveStatus(hackathon),
      startsAt: hackathon.starts_at,
      endsAt: hackathon.ends_at,
      registrationOpensAt: hackathon.registration_opens_at,
      registrationClosesAt: hackathon.registration_closes_at,
      maxParticipants: hackathon.max_participants,
      minTeamSize: hackathon.min_team_size,
      maxTeamSize: hackathon.max_team_size,
      allowSolo: hackathon.allow_solo,
      anonymousJudging: hackathon.anonymous_judging,
      judgingMode: hackathon.judging_mode,
      resultsPublishedAt: hackathon.results_published_at,
      createdAt: hackathon.created_at,
      updatedAt: hackathon.updated_at,
    }
  }, {
    detail: {
      summary: "Get hackathon",
      description: "Returns full hackathon details for organizers. Requires hackathons:read scope.",
    },
  })
  .get("/hackathons/:id/action-items-poll", async ({ principal, params, set }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:read"])

    const { checkHackathonOrganizer } = await import("@/lib/services/public-hackathons")
    const result = await checkHackathonOrganizer(params.id, principal.tenantId)
    if (result.status !== "ok") {
      set.status = result.status === "not_found" ? 404 : 403
      return { error: result.status === "not_found" ? "Not found" : "Not authorized" }
    }

    const { buildOrganizerPollPayload } = await import("@/lib/services/organizer-polling")
    const payload = await buildOrganizerPollPayload(params.id)
    if (!payload) { set.status = 500; return { error: "Failed to build poll payload" } }
    set.headers["Cache-Control"] = "private, max-age=2, stale-while-revalidate=5"
    return payload
  }, {
    detail: {
      summary: "Poll action items data",
      description: "Returns lightweight hackathon stats for computing organizer action items. Used for client-side polling.",
    },
  })
  .delete("/hackathons/:id", async ({ principal, params }) => {
    requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])

    const { checkHackathonOrganizer, deleteHackathon } = await import("@/lib/services/public-hackathons")
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

    const success = await deleteHackathon(params.id, principal.tenantId)
    if (!success) {
      return new Response(JSON.stringify({ error: "Failed to delete hackathon" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    }

    return { success: true }
  }, {
    detail: {
      summary: "Delete hackathon",
      description: "Permanently deletes a hackathon and all associated data. Requires hackathons:write scope.",
    },
  })
  .patch(
    "/hackathons/:id/settings",
    async ({ principal, params, body }) => {
      requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])

      const hasDateUpdate = body.startsAt !== undefined || body.endsAt !== undefined
      const isStatusChange = body.status !== undefined

      let previousStatus: string | undefined
      let currentHackathon: import("@/lib/db/hackathon-types").Hackathon | undefined
      if (hasDateUpdate || isStatusChange) {
        const { checkHackathonOrganizer } = await import("@/lib/services/public-hackathons")
        const check = await checkHackathonOrganizer(params.id, principal.tenantId)
        if (check.status === "not_found") {
          return new Response(JSON.stringify({ error: "Hackathon not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          })
        }
        if (check.status === "not_authorized") {
          return new Response(JSON.stringify({ error: "Not authorized" }), {
            status: 403,
            headers: { "Content-Type": "application/json" },
          })
        }
        currentHackathon = check.hackathon
        previousStatus = currentHackathon.status

        const isTransition = body.status !== undefined && body.status !== previousStatus
        if (hasDateUpdate && !isTransition) {
          const { validateTimelineDates } = await import("@/lib/utils/timeline")
          const dateError = validateTimelineDates({
            startsAt: body.startsAt !== undefined ? body.startsAt : currentHackathon.starts_at,
            endsAt: body.endsAt !== undefined ? body.endsAt : currentHackathon.ends_at,
          })
          if (dateError) {
            return new Response(JSON.stringify({ error: dateError }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            })
          }
        }
      }

      const hasStatusTransition = previousStatus && body.status && body.status !== previousStatus
      const hasOtherFields = body.bannerUrl !== undefined || body.name !== undefined ||
        body.description !== undefined || body.rules !== undefined ||
        body.startsAt !== undefined || body.endsAt !== undefined ||
        body.anonymousJudging !== undefined || body.judgingMode !== undefined ||
        body.locationType !== undefined || body.locationName !== undefined ||
        body.locationUrl !== undefined || body.locationLatitude !== undefined ||
        body.locationLongitude !== undefined || body.requireLocationVerification !== undefined ||
        body.maxParticipants !== undefined || body.minTeamSize !== undefined ||
        body.maxTeamSize !== undefined || body.allowSolo !== undefined

      let hackathon: import("@/lib/db/hackathon-types").Hackathon | null
      if (hasStatusTransition && !hasOtherFields) {
        hackathon = currentHackathon!
      } else {
        const { updateHackathonSettings } = await import("@/lib/services/public-hackathons")
        hackathon = await updateHackathonSettings(params.id, principal.tenantId, {
          bannerUrl: body.bannerUrl,
          name: body.name,
          description: body.description,
          rules: body.rules,
          startsAt: body.startsAt,
          endsAt: body.endsAt,
          status: hasStatusTransition ? undefined : body.status as "draft" | "published" | "registration_open" | "active" | "judging" | "completed" | "archived" | undefined,
          anonymousJudging: body.anonymousJudging,
          judgingMode: body.judgingMode as "points" | "subjective" | "rubric" | undefined,
          locationType: body.locationType as "in_person" | "virtual" | null | undefined,
          locationName: body.locationName,
          locationUrl: normalizeOptionalUrl(body.locationUrl),
          locationLatitude: body.locationLatitude,
          locationLongitude: body.locationLongitude,
          requireLocationVerification: body.requireLocationVerification,
          maxParticipants: body.maxParticipants,
          minTeamSize: body.minTeamSize,
          maxTeamSize: body.maxTeamSize,
          allowSolo: body.allowSolo,
        })
      }

      if (!hackathon) {
        return new Response(JSON.stringify({ error: "Hackathon not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        })
      }

      if (body.startsAt !== undefined && body.startsAt !== null) {
        const { updateHackathonSettings: updateRegOnDate } = await import("@/lib/services/public-hackathons")
        await updateRegOnDate(params.id, principal.tenantId, {
          registrationClosesAt: body.startsAt,
        })
      }

      if (hasStatusTransition) {
        const { executeTransition } = await import("@/lib/services/lifecycle")
        const triggeredBy = principal.kind === "user" ? principal.userId : principal.keyId
        const transitionResult = await executeTransition({
          hackathonId: params.id,
          tenantId: principal.tenantId,
          fromStatus: previousStatus as import("@/lib/db/hackathon-types").HackathonStatus,
          toStatus: body.status as import("@/lib/db/hackathon-types").HackathonStatus,
          trigger: "manual",
          triggeredBy,
        })

        if (!transitionResult.success) {
          return new Response(
            JSON.stringify({ error: transitionResult.error }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          )
        }

        if (previousStatus === "draft" && body.status !== "draft") {
          const { updateHackathonSettings: updateReg } = await import("@/lib/services/public-hackathons")
          await updateReg(params.id, principal.tenantId, {
            registrationOpensAt: new Date().toISOString(),
            registrationClosesAt: body.startsAt ?? hackathon.starts_at ?? new Date().toISOString(),
          })
          const { resolveAdderName } = await import("@/lib/auth/resolve-adder-name")
          const inviterName = await resolveAdderName(principal)
          const { sendPendingJudgeInvitationEmails } = await import("@/lib/services/judge-invitations")
          sendPendingJudgeInvitationEmails(hackathon.id, hackathon.name, inviterName)
            .then(({ sent, total, failedEmails }) => {
              if (total === 0) return
              if (failedEmails.length > 0) {
                console.error(
                  `Judge invitation emails: ${sent}/${total} sent for hackathon ${hackathon.id}. Failed: ${failedEmails.join(", ")}. These invitations remain with emailed_at IS NULL and will not be automatically retried.`
                )
              }
            })
            .catch((err) => {
              console.error(`Failed to send pending judge invitation emails for hackathon ${hackathon.id}:`, err)
            })
          const { start } = await import("workflow/api")
          const { sendJudgeNotificationsWorkflow } = await import(
            "@/lib/workflows/judge-notifications"
          )
          start(sendJudgeNotificationsWorkflow, [
            {
              hackathonId: hackathon.id,
              hackathonName: hackathon.name,
              hackathonSlug: hackathon.slug,
            },
          ]).catch(async (err) => {
            console.error("Failed to start judge notifications workflow, falling back to direct send:", err)
            const { fetchPendingNotifications, sendJudgeNotification } = await import(
              "@/lib/workflows/judge-notifications/steps"
            )
            const notifications = await fetchPendingNotifications(hackathon.id).catch((fetchErr) => {
              console.error(`Judge notification fallback: failed to fetch pending notifications for hackathon ${hackathon.id}:`, fetchErr)
              return [] as Awaited<ReturnType<typeof fetchPendingNotifications>>
            })
            const failedIds: string[] = []
            for (const n of notifications) {
              try {
                await sendJudgeNotification({
                  notification: n,
                  hackathonName: hackathon.name,
                  hackathonSlug: hackathon.slug,
                })
              } catch {
                failedIds.push(n.id)
              }
            }
            if (failedIds.length > 0) {
              console.error(
                `Judge notification fallback: ${failedIds.length} notification(s) failed to send and remain stuck (ids: ${failedIds.join(", ")}). These will not be automatically retried.`
              )
            }
          })
        }
      }

      await logAudit({
        principal,
        action: hasStatusTransition ? "hackathon.status_transition" : "hackathon.updated",
        resourceType: "hackathon",
        resourceId: params.id,
        metadata: hasStatusTransition ? { fromStatus: previousStatus, toStatus: body.status } : undefined,
      })

      if (!hasStatusTransition) {
        const { triggerWebhooks } = await import("@/lib/services/webhooks")
        triggerWebhooks(principal.tenantId, "hackathon.updated", {
          event: "hackathon.updated",
          timestamp: new Date().toISOString(),
          data: { hackathonId: hackathon.id },
        }).catch(console.error)
      }

      const updatedHackathon = hasStatusTransition
        ? (await import("@/lib/services/public-hackathons")).getHackathonByIdForOrganizer(params.id, principal.tenantId)
        : hackathon

      const h = hasStatusTransition ? await updatedHackathon : hackathon
      if (!h) {
        return new Response(JSON.stringify({ error: "Hackathon not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        })
      }

      return {
        id: h.id,
        name: h.name,
        slug: h.slug,
        description: h.description,
        rules: h.rules,
        bannerUrl: h.banner_url,
        status: getEffectiveStatus(h),
        startsAt: h.starts_at,
        endsAt: h.ends_at,
        registrationOpensAt: h.registration_opens_at,
        registrationClosesAt: h.registration_closes_at,
        maxParticipants: h.max_participants,
        minTeamSize: h.min_team_size,
        maxTeamSize: h.max_team_size,
        allowSolo: h.allow_solo,
        anonymousJudging: h.anonymous_judging,
        judgingMode: h.judging_mode,
        resultsPublishedAt: h.results_published_at,
        createdAt: h.created_at,
        updatedAt: h.updated_at,
      }
    },
    {
      detail: {
        summary: "Update hackathon settings",
        description: "Updates hackathon configuration. Requires hackathons:write scope.",
      },
      body: t.Object({
        bannerUrl: t.Optional(t.Union([t.String(), t.Null()])),
        name: t.Optional(t.String()),
        description: t.Optional(t.Union([t.String(), t.Null()])),
        rules: t.Optional(t.Union([t.String(), t.Null()])),
        startsAt: t.Optional(t.Union([t.String(), t.Null()])),
        endsAt: t.Optional(t.Union([t.String(), t.Null()])),
        status: t.Optional(t.Union([
          t.Literal("draft"),
          t.Literal("published"),
          t.Literal("registration_open"),
          t.Literal("active"),
          t.Literal("judging"),
          t.Literal("completed"),
          t.Literal("archived"),
        ])),
        anonymousJudging: t.Optional(t.Boolean()),
        judgingMode: t.Optional(t.Union([t.Literal("points"), t.Literal("subjective"), t.Literal("rubric")])),
        locationType: t.Optional(t.Union([t.Literal("in_person"), t.Literal("virtual"), t.Null()])),
        locationName: t.Optional(t.Union([t.String(), t.Null()])),
        locationUrl: t.Optional(t.Union([t.String(), t.Null()])),
        locationLatitude: t.Optional(t.Union([t.Number(), t.Null()])),
        locationLongitude: t.Optional(t.Union([t.Number(), t.Null()])),
        requireLocationVerification: t.Optional(t.Boolean()),
        maxParticipants: t.Optional(t.Union([t.Number(), t.Null()])),
        minTeamSize: t.Optional(t.Number()),
        maxTeamSize: t.Optional(t.Number()),
        allowSolo: t.Optional(t.Boolean()),
      }),
    }
  )
  .post(
    "/hackathons/:id/banner",
    async ({ principal, params, request }) => {
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
        return new Response(JSON.stringify({ error: "Not authorized to manage this hackathon. You may need to switch to the correct organization." }), {
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

      if (file.size > 50 * 1024 * 1024) {
        return new Response(JSON.stringify({ error: "File too large (max 50MB)" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })
      }

      const { uploadBanner } = await import("@/lib/services/storage")
      const buffer = Buffer.from(await file.arrayBuffer())
      const uploadResult = await uploadBanner(params.id, buffer)

      if (!uploadResult) {
        return new Response(JSON.stringify({ error: "Failed to upload banner" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        })
      }

      const { updateHackathonSettings } = await import("@/lib/services/public-hackathons")
      await updateHackathonSettings(params.id, principal.tenantId, {
        bannerUrl: uploadResult.url,
      })

      await logAudit({
        principal,
        action: "hackathon.banner_uploaded",
        resourceType: "hackathon",
        resourceId: params.id,
      })

      return { url: uploadResult.url }
    },
    {
      detail: {
        summary: "Upload hackathon banner",
        description: "Uploads a banner image. Accepts PNG, JPEG, or WebP (max 50MB). Requires hackathons:write scope.",
      },
    }
  )
  .delete("/hackathons/:id/banner", async ({ principal, params }) => {
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
      return new Response(JSON.stringify({ error: "Not authorized to manage this hackathon. You may need to switch to the correct organization." }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      })
    }

    const { deleteBanner } = await import("@/lib/services/storage")
    await deleteBanner(params.id)

    const { updateHackathonSettings } = await import("@/lib/services/public-hackathons")
    await updateHackathonSettings(params.id, principal.tenantId, {
      bannerUrl: null,
    })

    await logAudit({
      principal,
      action: "hackathon.banner_deleted",
      resourceType: "hackathon",
      resourceId: params.id,
    })

    return { success: true }
  }, {
    detail: {
      summary: "Delete hackathon banner",
      description: "Removes the hackathon banner image. Requires hackathons:write scope.",
    },
  })
  .get("/hackathons/:id/sponsors", async ({ principal, params }) => {
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
      return new Response(JSON.stringify({ error: "Not authorized to manage this hackathon. You may need to switch to the correct organization." }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      })
    }

    const { listHackathonSponsorsWithTenants } = await import("@/lib/services/sponsors")
    const sponsors = await listHackathonSponsorsWithTenants(params.id)

    return {
      sponsors: sponsors.map((s) => ({
        id: s.id,
        name: s.name,
        logoUrl: s.logo_url,
        websiteUrl: s.website_url,
        tier: s.tier,
        useOrgAssets: s.use_org_assets,
        displayOrder: s.display_order,
        sponsorTenantId: s.sponsor_tenant_id,
        tenant: s.tenant
          ? {
              slug: s.tenant.slug,
              name: s.tenant.name,
              logoUrl: s.tenant.logo_url,
              logoUrlDark: s.tenant.logo_url_dark,
              websiteUrl: s.tenant.website_url,
              description: s.tenant.description,
            }
          : null,
        createdAt: s.created_at,
      })),
    }
  }, {
    detail: {
      summary: "List sponsors",
      description: "Lists sponsors for a hackathon. Requires hackathons:read scope.",
    },
  })
  .post(
    "/hackathons/:id/sponsors",
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
        return new Response(JSON.stringify({ error: "Not authorized to manage this hackathon. You may need to switch to the correct organization." }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        })
      }

      const { addSponsor } = await import("@/lib/services/sponsors")

      const logoUrl = normalizeOptionalUrl(body.logoUrl)
      const websiteUrl = body.websiteUrl ? normalizeUrl(body.websiteUrl) : body.websiteUrl

      let tenantSponsorId: string | null = null
      if (!body.sponsorTenantId) {
        const { upsertTenantSponsor } = await import("@/lib/services/tenant-sponsors")
        const tenantSponsor = await upsertTenantSponsor(principal.tenantId, {
          name: body.name,
          websiteUrl,
        })
        tenantSponsorId = tenantSponsor?.id ?? null
        if (!tenantSponsorId) {
          console.warn(`upsertTenantSponsor returned null for tenant ${principal.tenantId}, sponsor "${body.name}" will be added without a library link`)
        }
      }

      const sponsor = await addSponsor({
        hackathonId: params.id,
        name: body.name,
        logoUrl,
        websiteUrl,
        tier: body.tier as SponsorTier | undefined,
        customTierLabel: body.customTierLabel,
        sponsorTenantId: body.sponsorTenantId,
        tenantSponsorId,
        useOrgAssets: body.useOrgAssets,
        displayOrder: body.displayOrder,
      })

      if (!sponsor) {
        return new Response(JSON.stringify({ error: "Failed to add sponsor" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        })
      }

      await logAudit({
        principal,
        action: "sponsor.added",
        resourceType: "hackathon_sponsor",
        resourceId: sponsor.id,
        metadata: { hackathonId: params.id, name: body.name },
      })

      return {
        id: sponsor.id,
        name: sponsor.name,
        tier: sponsor.tier,
        createdAt: sponsor.created_at,
      }
    },
    {
      detail: {
        summary: "Add sponsor",
        description: "Adds a sponsor to a hackathon. Requires hackathons:write scope.",
      },
      body: t.Object({
        name: t.String({ minLength: 1 }),
        logoUrl: t.Optional(t.Union([t.String(), t.Null()])),
        websiteUrl: t.Optional(t.Union([t.String(), t.Null()])),
        tier: t.Optional(t.String()),
        customTierLabel: t.Optional(t.Union([t.String(), t.Null()])),
        sponsorTenantId: t.Optional(t.Union([t.String(), t.Null()])),
        useOrgAssets: t.Optional(t.Boolean()),
        displayOrder: t.Optional(t.Number()),
      }),
    }
  )
  .patch(
    "/hackathons/:id/sponsors/:sponsorId",
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
        return new Response(JSON.stringify({ error: "Not authorized to manage this hackathon. You may need to switch to the correct organization." }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        })
      }

      const { updateSponsor } = await import("@/lib/services/sponsors")
      const sponsorLogoUrl = normalizeOptionalUrl(body.logoUrl)
      const sponsorWebsiteUrl = body.websiteUrl ? normalizeUrl(body.websiteUrl) : body.websiteUrl
      const sponsor = await updateSponsor(params.sponsorId, {
        name: body.name,
        logoUrl: sponsorLogoUrl,
        websiteUrl: sponsorWebsiteUrl,
        tier: body.tier as SponsorTier | undefined,
        customTierLabel: body.customTierLabel,
        sponsorTenantId: body.sponsorTenantId,
        useOrgAssets: body.useOrgAssets,
        displayOrder: body.displayOrder,
      }, params.id)

      if (!sponsor) {
        return new Response(JSON.stringify({ error: "Sponsor not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        })
      }

      await logAudit({
        principal,
        action: "sponsor.updated",
        resourceType: "hackathon_sponsor",
        resourceId: params.sponsorId,
      })

      return {
        id: sponsor.id,
        updatedAt: sponsor.created_at,
      }
    },
    {
      detail: {
        summary: "Update sponsor",
        description: "Updates sponsor details. Requires hackathons:write scope.",
      },
      body: t.Object({
        name: t.Optional(t.String()),
        logoUrl: t.Optional(t.Union([t.String(), t.Null()])),
        websiteUrl: t.Optional(t.Union([t.String(), t.Null()])),
        tier: t.Optional(t.String()),
        customTierLabel: t.Optional(t.Union([t.String(), t.Null()])),
        sponsorTenantId: t.Optional(t.Union([t.String(), t.Null()])),
        useOrgAssets: t.Optional(t.Boolean()),
        displayOrder: t.Optional(t.Number()),
      }),
    }
  )
  .delete("/hackathons/:id/sponsors/:sponsorId", async ({ principal, params }) => {
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
      return new Response(JSON.stringify({ error: "Not authorized to manage this hackathon. You may need to switch to the correct organization." }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      })
    }

    const { removeSponsor } = await import("@/lib/services/sponsors")
    const success = await removeSponsor(params.sponsorId, params.id)

    if (!success) {
      return new Response(JSON.stringify({ error: "Sponsor not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })
    }

    await logAudit({
      principal,
      action: "sponsor.removed",
      resourceType: "hackathon_sponsor",
      resourceId: params.sponsorId,
    })

    return { success: true }
  }, {
    detail: {
      summary: "Remove sponsor",
      description: "Removes a sponsor from a hackathon. Requires hackathons:write scope.",
    },
  })
  .patch(
    "/hackathons/:id/sponsors/reorder",
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
        return new Response(JSON.stringify({ error: "Not authorized to manage this hackathon. You may need to switch to the correct organization." }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        })
      }

      const { reorderSponsors } = await import("@/lib/services/sponsors")
      const success = await reorderSponsors(params.id, body.sponsorIds)

      if (!success) {
        return new Response(JSON.stringify({ error: "Failed to reorder sponsors" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        })
      }

      return { success: true }
    },
    {
      detail: {
        summary: "Reorder sponsors",
        description: "Updates sponsor display order. Requires hackathons:write scope.",
      },
      body: t.Object({
        sponsorIds: t.Array(t.String()),
      }),
    }
  )
  .post(
    "/hackathons/:id/sponsors/:sponsorId/logo",
    async ({ principal, params, request }) => {
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
        return new Response(JSON.stringify({ error: "Not authorized to manage this hackathon. You may need to switch to the correct organization." }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        })
      }

      const formData = await request.formData()
      const file = formData.get("file") as File | null
      const variant = (formData.get("variant") as string) || "light"

      if (!file) {
        return new Response(JSON.stringify({ error: "No file provided" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })
      }

      const MAX_LOGO_SIZE = 5 * 1024 * 1024
      if (file.size > MAX_LOGO_SIZE) {
        return new Response(JSON.stringify({ error: "File too large. Maximum size is 5MB" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })
      }

      if (variant !== "light" && variant !== "dark") {
        return new Response(JSON.stringify({ error: "Invalid variant. Must be 'light' or 'dark'" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })
      }

      const allowedTypes = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"]
      if (!allowedTypes.includes(file.type)) {
        return new Response(JSON.stringify({ error: "Invalid file type. Allowed: PNG, JPEG, WebP, SVG" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })
      }

      const { uploadSponsorLogo } = await import("@/lib/services/storage")
      const buffer = Buffer.from(await file.arrayBuffer())
      const uploadResult = await uploadSponsorLogo(params.id, params.sponsorId, buffer, file.type, variant)

      if (!uploadResult) {
        return new Response(JSON.stringify({ error: "Failed to upload sponsor logo" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        })
      }

      const { updateSponsor, listHackathonSponsors } = await import("@/lib/services/sponsors")
      const updateField = variant === "dark" ? { logoUrlDark: uploadResult.url } : { logoUrl: uploadResult.url }
      await updateSponsor(params.sponsorId, updateField, params.id)

      const sponsors = await listHackathonSponsors(params.id)
      const updatedSponsor = sponsors.find((s) => s.id === params.sponsorId)
      if (updatedSponsor?.tenant_sponsor_id) {
        const { updateTenantSponsorLogos } = await import("@/lib/services/tenant-sponsors")
        const logoUpdates = variant === "dark"
          ? { logoUrlDark: uploadResult.url }
          : { logoUrl: uploadResult.url }
        await updateTenantSponsorLogos(updatedSponsor.tenant_sponsor_id, principal.tenantId, logoUpdates)
      }

      await logAudit({
        principal,
        action: "sponsor.logo_uploaded",
        resourceType: "hackathon_sponsor",
        resourceId: params.sponsorId,
      })

      return { url: uploadResult.url }
    },
    {
      detail: {
        summary: "Upload sponsor logo",
        description: "Uploads a logo for a sponsor. Requires hackathons:write scope.",
      },
    }
  )
  .delete(
    "/hackathons/:id/sponsors/:sponsorId/logo",
    async ({ principal, params, query }) => {
      requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])

      const variant = (query.variant as string) || "light"

      if (variant !== "light" && variant !== "dark") {
        return new Response(JSON.stringify({ error: "Invalid variant. Must be 'light' or 'dark'" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })
      }

      const { checkHackathonOrganizer } = await import("@/lib/services/public-hackathons")
      const result = await checkHackathonOrganizer(params.id, principal.tenantId)

      if (result.status === "not_found") {
        return new Response(JSON.stringify({ error: "Hackathon not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        })
      }
      if (result.status === "not_authorized") {
        return new Response(JSON.stringify({ error: "Not authorized to manage this hackathon. You may need to switch to the correct organization." }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        })
      }

      const { deleteSponsorLogo } = await import("@/lib/services/storage")
      await deleteSponsorLogo(params.id, params.sponsorId, variant)

      const { updateSponsor } = await import("@/lib/services/sponsors")
      const logoUpdate = variant === "dark" ? { logoUrlDark: null } : { logoUrl: null }
      await updateSponsor(params.sponsorId, logoUpdate, params.id)

      await logAudit({
        principal,
        action: "sponsor.logo_deleted",
        resourceType: "hackathon_sponsor",
        resourceId: params.sponsorId,
      })

      return { success: true }
    },
    {
      detail: {
        summary: "Delete sponsor logo",
        description: "Deletes a sponsor's logo. Use ?variant=dark to delete the dark logo. Requires hackathons:write scope.",
      },
      query: t.Object({
        variant: t.Optional(t.String()),
      }),
    }
  )
  .get("/org-profile", async ({ principal }) => {
    requirePrincipal(principal, ["user", "api_key"], ["org:read"])

    const { getPublicTenantById } = await import("@/lib/services/tenant-profiles")
    const tenant = await getPublicTenantById(principal.tenantId)

    if (!tenant) {
      return new Response(JSON.stringify({ error: "Tenant not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })
    }

    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      logoUrl: tenant.logo_url,
      description: tenant.description,
      websiteUrl: tenant.website_url,
    }
  }, {
    detail: {
      summary: "Get organization profile",
      description: "Returns the tenant's profile. Requires org:read scope.",
    },
  })
  .patch(
    "/org-profile",
    async ({ principal, body }) => {
      requirePrincipal(principal, ["user", "api_key"], ["org:write"])

      const { updateTenantProfile, isSlugAvailable } = await import("@/lib/services/tenant-profiles")

      if (body.slug !== undefined) {
        if (!body.slug || !/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(body.slug) || body.slug.length < 3) {
          return new Response(JSON.stringify({ error: "Slug must be at least 3 characters and contain only lowercase letters, numbers, and hyphens" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          })
        }
        const available = await isSlugAvailable(body.slug, principal.tenantId)
        if (!available) {
          return new Response(JSON.stringify({ error: "Slug already taken" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          })
        }
      }

      const tenant = await updateTenantProfile(principal.tenantId, {
        slug: body.slug,
        logoUrl: body.logoUrl,
        logoUrlDark: body.logoUrlDark,
        description: body.description,
        websiteUrl: body.websiteUrl ? normalizeUrl(body.websiteUrl) : body.websiteUrl,
        name: body.name,
      })

      if (!tenant) {
        return new Response(JSON.stringify({ error: "Failed to update profile" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        })
      }

      await logAudit({
        principal,
        action: "org_profile.updated",
        resourceType: "tenant",
        resourceId: principal.tenantId,
      })

      return {
        id: tenant.id,
        slug: tenant.slug,
        updatedAt: tenant.updated_at,
      }
    },
    {
      detail: {
        summary: "Update organization profile",
        description: "Updates the tenant profile. Slug uniqueness is validated. Requires org:write scope.",
      },
      body: t.Object({
        name: t.Optional(t.String()),
        slug: t.Optional(t.String({ minLength: 3 })),
        logoUrl: t.Optional(t.Union([t.String(), t.Null()])),
        logoUrlDark: t.Optional(t.Union([t.String(), t.Null()])),
        description: t.Optional(t.Union([t.String(), t.Null()])),
        websiteUrl: t.Optional(t.Union([t.String(), t.Null()])),
      }),
    }
  )
  .post(
    "/upload-logo",
    async ({ principal, request }) => {
      requirePrincipal(principal, ["user", "api_key"], ["org:write"])

      const formData = await request.formData()
      const file = formData.get("file") as File | null
      const variant = formData.get("variant") as "light" | "dark" | null

      if (!file) {
        return new Response(JSON.stringify({ error: "No file provided" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })
      }

      if (!variant || (variant !== "light" && variant !== "dark")) {
        return new Response(JSON.stringify({ error: "Invalid variant" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })
      }

      const allowedTypes = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"]
      if (!allowedTypes.includes(file.type)) {
        return new Response(JSON.stringify({ error: "Invalid file type" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })
      }

      if (file.size > 30 * 1024 * 1024) {
        return new Response(JSON.stringify({ error: "File too large (max 30MB)" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })
      }

      const { uploadLogo } = await import("@/lib/services/storage")
      const buffer = Buffer.from(await file.arrayBuffer())
      const result = await uploadLogo(principal.tenantId, buffer, file.type, variant)

      if (!result) {
        return new Response(JSON.stringify({ error: "Failed to upload logo" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        })
      }

      const { updateTenantProfile } = await import("@/lib/services/tenant-profiles")
      const updates = variant === "light"
        ? { logoUrl: result.url }
        : { logoUrlDark: result.url }

      await updateTenantProfile(principal.tenantId, updates)

      await logAudit({
        principal,
        action: "logo.uploaded",
        resourceType: "tenant",
        resourceId: principal.tenantId,
        metadata: { variant },
      })

      return { url: result.url, variant }
    },
    {
      detail: {
        summary: "Upload organization logo",
        description: "Uploads a logo image with light or dark variant. Requires org:write scope.",
      },
    }
  )
  .delete(
    "/logo/:variant",
    async ({ principal, params }) => {
      requirePrincipal(principal, ["user", "api_key"], ["org:write"])

      const variant = params.variant as "light" | "dark"
      if (variant !== "light" && variant !== "dark") {
        return new Response(JSON.stringify({ error: "Invalid variant" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })
      }

      const { deleteLogo } = await import("@/lib/services/storage")
      await deleteLogo(principal.tenantId, variant)

      const { updateTenantProfile } = await import("@/lib/services/tenant-profiles")
      const updates = variant === "light"
        ? { logoUrl: null }
        : { logoUrlDark: null }

      await updateTenantProfile(principal.tenantId, updates)

      await logAudit({
        principal,
        action: "logo.deleted",
        resourceType: "tenant",
        resourceId: principal.tenantId,
        metadata: { variant },
      })

      return { success: true }
    },
    {
      detail: {
        summary: "Delete organization logo",
        description: "Deletes a logo variant (light or dark). Requires org:write scope.",
      },
    }
  )
  .post(
    "/teams/:teamId/invitations",
    async ({ principal, params, body }) => {
      requirePrincipal(principal, ["user"])

      const rateLimitResult = await checkRateLimit(`team_invitation:${params.teamId}`, {
        maxRequests: 10,
        windowMs: 60_000,
      })
      if (!rateLimitResult.allowed) {
        throw new RateLimitError(rateLimitResult.resetAt, rateLimitResult.remaining)
      }

      const { createTeamInvitation, getTeamWithHackathon } = await import(
        "@/lib/services/team-invitations"
      )

      const result = await createTeamInvitation({
        teamId: params.teamId,
        hackathonId: body.hackathonId,
        email: body.email,
        invitedByClerkUserId: principal.userId!,
      })

      if (!result.success) {
        return new Response(JSON.stringify({ error: result.error, code: result.code }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })
      }

      const teamInfo = await getTeamWithHackathon(params.teamId)

      if (teamInfo) {
        const emailInput = {
          to: body.email,
          teamName: teamInfo.name,
          hackathonName: teamInfo.hackathon.name,
          inviterName: body.inviterName || "A team captain",
          inviteToken: result.invitation.token,
          expiresAt: result.invitation.expires_at,
        }
        const { start } = await import("workflow/api")
        const { sendTeamInvitationWorkflow } = await import("@/lib/workflows/team-invitations")
        start(sendTeamInvitationWorkflow, [emailInput]).catch(async (err) => {
          console.error("Failed to start team invitation workflow, falling back to direct send:", err)
          const { sendTeamInvitationEmail } = await import("@/lib/email/team-invitations")
          sendTeamInvitationEmail(emailInput).catch(console.error)
        })
      }

      await logAudit({
        principal,
        action: "team_invitation.sent",
        resourceType: "team_invitation",
        resourceId: result.invitation.id,
        metadata: { teamId: params.teamId, email: body.email },
      })

      return {
        id: result.invitation.id,
        email: result.invitation.email,
        expiresAt: result.invitation.expires_at,
      }
    },
    {
      detail: {
        summary: "Send team invitation",
        description: "Sends an email invitation to join a team. Rate limited. Clerk-only.",
      },
      body: t.Object({
        hackathonId: t.String(),
        email: t.String({ format: "email" }),
        inviterName: t.Optional(t.String()),
      }),
    }
  )
  .get(
    "/teams/:teamId/invitations",
    async ({ principal, params, query }) => {
      requirePrincipal(principal, ["user"])

      const { listTeamInvitations } = await import("@/lib/services/team-invitations")
      const result = await listTeamInvitations(
        params.teamId,
        principal.userId!,
        query.status ? { status: query.status } : undefined
      )

      if (!result.success) {
        const status = result.code === "team_not_found" ? 404 : 403
        return new Response(JSON.stringify({ error: result.error }), {
          status,
          headers: { "Content-Type": "application/json" },
        })
      }

      return {
        invitations: result.invitations.map((i) => ({
          id: i.id,
          email: i.email,
          status: i.status,
          expiresAt: i.expires_at,
          createdAt: i.created_at,
        })),
      }
    },
    {
      detail: {
        summary: "List team invitations",
        description: "Lists invitations for a team. Clerk-only.",
      },
      query: t.Object({
        status: t.Optional(
          t.Union([
            t.Literal("pending"),
            t.Literal("accepted"),
            t.Literal("declined"),
            t.Literal("expired"),
            t.Literal("cancelled"),
          ])
        ),
      }),
    }
  )
  .delete("/teams/:teamId/invitations/:invitationId", async ({ principal, params }) => {
    requirePrincipal(principal, ["user"])

    const { cancelTeamInvitation } = await import("@/lib/services/team-invitations")
    const result = await cancelTeamInvitation(params.invitationId, principal.userId!)

    if (!result.success) {
      return new Response(JSON.stringify({ error: result.error }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    await logAudit({
      principal,
      action: "team_invitation.cancelled",
      resourceType: "team_invitation",
      resourceId: params.invitationId,
    })

    return { success: true }
  }, {
    detail: {
      summary: "Cancel team invitation",
      description: "Cancels a pending team invitation. Clerk-only.",
    },
  })
  .use(dashboardJudgingRoutes)
  .use(dashboardResultsRoutes)
  .use(dashboardJudgeDisplayRoutes)
  .use(dashboardPostEventRoutes)
  .use(dashboardSponsorFulfillmentRoutes)
