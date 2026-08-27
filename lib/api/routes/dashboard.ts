import { Elysia, t } from "elysia"
import { normalizeOptionalUrl, normalizeUrl } from "@/lib/utils/url"
import { isValidSlugFormat } from "@/lib/utils/slug"
import {
  resolvePrincipal,
  requirePrincipal,
} from "@/lib/auth/principal"
import { createApiKey, listApiKeys, revokeApiKey, getApiKeyById } from "@/lib/services/api-keys"
import { listJobs, getJobById } from "@/lib/services/jobs"
import { logAudit } from "@/lib/services/audit"
import { checkRateLimit, RateLimitError } from "@/lib/services/rate-limit"
import { dashboardJudgingRoutes } from "./dashboard-judging"
import { dashboardResultsRoutes } from "./dashboard-results"
import { dashboardJudgeDisplayRoutes } from "./dashboard-judge-display"
import { dashboardPostEventRoutes } from "./dashboard-post-event"
import { dashboardSponsorFulfillmentRoutes } from "./dashboard-sponsor-fulfillments"
import { dashboardPrizeTracksRoutes } from "./dashboard-prize-tracks"
import { getEffectiveStatus } from "@/lib/utils/timeline"
import { getNotificationDisposition, getNotificationLifecycleError } from "@/lib/utils/notification-lifecycle"
import { getQueueReason } from "@/lib/utils/notification-delivery"
import { getRequestIdempotencyFingerprint } from "@/lib/utils/request-idempotency"
import { normalizeLocale } from "@/lib/utils/language"
import type { UserPrincipal } from "@/lib/auth/types"
import { getDelegableApiKeyScopes, matchesExpectedOrganization } from "@/lib/auth/types"
import type { WebhookEvent, SponsorTier } from "@/lib/db/hackathon-types"
import { isAllowedHttpsUrl } from "@/lib/utils/safe-fetch-url"
import {
  validateWebMcpSettingsMutationContext,
  WEBMCP_PRE_COMPLETION_STATUSES,
} from "@/lib/webmcp/mutation-context"
import {
  EventMutationLeaseError,
  withEventMutationLease,
} from "@/lib/services/event-mutation-lease"

function organizationAdminError(principal: UserPrincipal): Response | null {
  if (principal.orgRole === "org:admin") {
    return null
  }

  return new Response(JSON.stringify({ error: "Only org admins can manage people." }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  })
}

function settingsMutationLeaseFailure(
  error: unknown,
  set: { status?: number | string },
) {
  if (!(error instanceof EventMutationLeaseError)) throw error
  set.status = error.code === "event_busy" ? 409 : 503
  return { error: error.message, code: error.code }
}

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
  .get(
    "/organization-members",
    async ({ principal }) => {
      requirePrincipal(principal, ["user"], ["org:read"])

      if (!principal.orgId) {
        return new Response(JSON.stringify({ error: "Switch to an organization to see people." }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })
      }

      const { listOrganizationPeople } = await import("@/lib/services/organization-members")

      return listOrganizationPeople(principal.orgId)
    },
    {
      detail: {
        summary: "List organization people",
        description: "Lists people and pending invites for the active Clerk organization. Clerk-only.",
      },
    }
  )
  .post(
    "/organization-members/invitations",
    async ({ principal, body }) => {
      requirePrincipal(principal, ["user"], ["org:write"])
      if (!principal.orgId) {
        return new Response(JSON.stringify({ error: "Switch to an organization to invite people." }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })
      }
      const adminError = organizationAdminError(principal)
      if (adminError) return adminError

      const rateLimitResult = await checkRateLimit(`org_invitation:${principal.orgId}`, {
        maxRequests: 20,
        windowMs: 60_000,
      })
      if (!rateLimitResult.allowed) {
        throw new RateLimitError(rateLimitResult.resetAt, rateLimitResult.remaining)
      }

      const {
        getClerkErrorMessage,
        inviteOrganizationMember,
        isOrganizationMemberRole,
        normalizeOrganizationInviteEmail,
      } = await import("@/lib/services/organization-members")

      const email = normalizeOrganizationInviteEmail(body.email)
      if (!email) {
        return new Response(JSON.stringify({ error: "Enter a valid email address." }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })
      }

      const role = body.role ?? "org:member"
      if (!isOrganizationMemberRole(role)) {
        return new Response(JSON.stringify({ error: "Pick a valid role." }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })
      }

      try {
        const invitation = await inviteOrganizationMember({
          organizationId: principal.orgId,
          inviterUserId: principal.userId,
          email,
          role,
        })

        await logAudit({
          principal,
          action: "org_member.invited",
          resourceType: "organization_invitation",
          resourceId: invitation.id,
          metadata: { email, role },
        })

        return { invitation }
      } catch (error) {
        return new Response(JSON.stringify({ error: getClerkErrorMessage(error, "Could not send invite.") }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })
      }
    },
    {
      detail: {
        summary: "Invite organization member",
        description: "Sends an invite to join the active Clerk organization. Requires org:write scope. Clerk-only.",
      },
      body: t.Object({
        email: t.String({ minLength: 3 }),
        role: t.Optional(t.Union([t.Literal("org:member"), t.Literal("org:admin")])),
      }),
    }
  )
  .delete(
    "/organization-members/invitations/:invitationId",
    async ({ principal, params }) => {
      requirePrincipal(principal, ["user"], ["org:write"])
      if (!principal.orgId) {
        return new Response(JSON.stringify({ error: "Switch to an organization to cancel invites." }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })
      }
      const adminError = organizationAdminError(principal)
      if (adminError) return adminError

      const { getClerkErrorMessage, revokeOrganizationMemberInvitation } = await import(
        "@/lib/services/organization-members"
      )

      try {
        const invitation = await revokeOrganizationMemberInvitation({
          organizationId: principal.orgId,
          invitationId: params.invitationId,
          requestingUserId: principal.userId,
        })

        await logAudit({
          principal,
          action: "org_invitation.cancelled",
          resourceType: "organization_invitation",
          resourceId: params.invitationId,
          metadata: { email: invitation.email },
        })

        return { success: true }
      } catch (error) {
        return new Response(JSON.stringify({ error: getClerkErrorMessage(error, "Could not cancel invite.") }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })
      }
    },
    {
      detail: {
        summary: "Cancel organization invite",
        description: "Cancels a pending invite for the active Clerk organization. Requires org:write scope. Clerk-only.",
      },
    }
  )
  .delete(
    "/organization-members/:userId",
    async ({ principal, params }) => {
      requirePrincipal(principal, ["user"], ["org:write"])
      if (!principal.orgId) {
        return new Response(JSON.stringify({ error: "Switch to an organization to remove people." }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })
      }
      const adminError = organizationAdminError(principal)
      if (adminError) return adminError

      if (params.userId === principal.userId) {
        return new Response(JSON.stringify({ error: "You can't remove yourself." }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })
      }

      const { getClerkErrorMessage, removeOrganizationMember } = await import(
        "@/lib/services/organization-members"
      )

      try {
        await removeOrganizationMember({
          organizationId: principal.orgId,
          userId: params.userId,
        })

        await logAudit({
          principal,
          action: "org_member.removed",
          resourceType: "organization_member",
          resourceId: params.userId,
        })

        return { success: true }
      } catch (error) {
        return new Response(JSON.stringify({ error: getClerkErrorMessage(error, "Could not remove this person.") }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })
      }
    },
    {
      detail: {
        summary: "Remove organization member",
        description: "Removes a person from the active Clerk organization. Requires org:write scope. Clerk-only.",
      },
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

      const sanitizedScopes = getDelegableApiKeyScopes(body.scopes, principal.scopes)
      if (!sanitizedScopes) {
        return new Response(
          JSON.stringify({ error: "API keys can't have permissions you don't have." }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        )
      }

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
    requirePrincipal(principal, ["user", "api_key"], ["jobs:read"])

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
    requirePrincipal(principal, ["user", "api_key"], ["jobs:read"])

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

      if (!isAllowedHttpsUrl(webhookUrl)) {
        return new Response(JSON.stringify({ error: "Webhook URL must be a public https address" }), {
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
        runTime: s.run_time,
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
        runTime: body.runTime,
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
        jobType: t.String({ minLength: 1 }),
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
      runTime: schedule.run_time,
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
    requirePrincipal(principal, ["user"], ["org:read"])

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
    requirePrincipal(principal, ["user"], ["org:write"])

    const { buildAuthUrl } = await import("@/lib/integrations/oauth")
    const { createOAuthState } = await import("@/lib/integrations/oauth")
    const state = createOAuthState(principal.tenantId, principal.userId)

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
  .get("/integrations/:provider/callback", async ({ principal, params, query }) => {
    requirePrincipal(principal, ["user"], ["org:write"])
    const provider = params.provider as "gmail" | "google_calendar" | "notion"
    if (!["gmail", "google_calendar", "notion"].includes(provider)) {
      return new Response("Unsupported integration", { status: 400 })
    }

    const { verifyOAuthState, exchangeCodeForTokens, saveIntegration, getProviderConfig } = await import("@/lib/integrations/oauth")
    const state = verifyOAuthState(query.state)
    if (!state || state.tenantId !== principal.tenantId || state.userId !== principal.userId) {
      return new Response("Invalid or expired authorization request", { status: 400 })
    }

    const tokens = await exchangeCodeForTokens(provider, query.code)
    const config = getProviderConfig(provider)
    if (!tokens || !config) {
      return new Response("The integration could not be connected", { status: 400 })
    }

    const integration = await saveIntegration({
      tenantId: principal.tenantId,
      provider,
      accountEmail: tokens.email,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      scopes: config.scopes,
    })
    if (!integration) return new Response("The integration could not be saved", { status: 500 })

    await logAudit({
      principal,
      action: "integration.connected",
      resourceType: "integration",
      resourceId: integration.id,
      metadata: { provider },
    })

    return Response.redirect(new URL("/settings/integrations", process.env.NEXT_PUBLIC_APP_URL), 303)
  }, {
    query: t.Object({
      code: t.String({ minLength: 1, maxLength: 4096 }),
      state: t.String({ minLength: 1, maxLength: 4096 }),
    }),
    detail: {
      summary: "Complete OAuth integration",
      description: "Validates the signed authorization state and saves the provider connection.",
    },
  })
  .delete("/integrations/:provider", async ({ principal, params }) => {
    requirePrincipal(principal, ["user"], ["org:write"])

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
    requirePrincipal(principal, ["user"], ["org:read"])

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
      requirePrincipal(principal, ["user"], ["org:write"])

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
        provider: t.Literal("luma"),
        apiKey: t.String({ minLength: 1, maxLength: 4096 }),
        label: t.Optional(t.String({ maxLength: 200 })),
        accountIdentifier: t.Optional(t.String({ maxLength: 500 })),
      }),
    }
  )
  .patch(
    "/credentials/:provider",
    async ({ principal, params, body }) => {
      requirePrincipal(principal, ["user"], ["org:write"])

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
        apiKey: t.Optional(t.String({ minLength: 1, maxLength: 4096 })),
        label: t.Optional(t.String({ maxLength: 200 })),
        accountIdentifier: t.Optional(t.String({ maxLength: 500 })),
        isActive: t.Optional(t.Boolean()),
      }),
    }
  )
  .delete("/credentials/:provider", async ({ principal, params }) => {
    requirePrincipal(principal, ["user"], ["org:write"])

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

      if (!matchesExpectedOrganization(principal, body.expectedOrganizationId)) {
        return new Response(JSON.stringify({
          error: "Your active organization changed. Review it and try again.",
          code: "organization_context_changed",
          retryable: true,
        }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        })
      }

      const { isOrgTenant, organizationRequiredResponse } = await import("@/lib/services/tenants")
      if (!(await isOrgTenant(principal.tenantId))) {
        return organizationRequiredResponse()
      }

      const name = body.name.trim()
      if (!name) {
        return new Response(JSON.stringify({ error: "Give your event a name." }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })
      }

      const { createHackathonAggregateWithResult, finalizeHackathonCreation } = await import(
        "@/lib/services/luma-import-create"
      )
      const result = await createHackathonAggregateWithResult(principal.tenantId, {
        draftId: body.draftId,
        name,
        description: body.description ?? null,
        startsAt: body.startsAt ?? null,
        endsAt: body.endsAt ?? null,
        registrationOpensAt: body.registrationOpensAt ?? null,
        registrationClosesAt: body.registrationClosesAt ?? null,
        locationType: body.locationType ?? null,
        locationName: body.locationName ?? null,
        locationUrl: body.locationUrl ?? null,
        imageUrl: body.imageUrl ?? null,
        sponsors: body.sponsors ?? [],
        rules: body.rules ?? null,
        prizes: body.prizes ?? [],
        challenges: body.challenges ?? [],
        agendaItems: body.agendaItems ?? [],
      })

      if (result.status === "in_progress") {
        return new Response(JSON.stringify({
          error: "Event creation is already in progress. Try again shortly.",
          code: "creation_in_progress",
          retryable: true,
        }), {
          status: 409,
          headers: { "Content-Type": "application/json", "Retry-After": "2" },
        })
      }

      if (result.status === "invalid") {
        return new Response(JSON.stringify({
          error: result.error.message,
          code: result.error.code,
          retryable: false,
          ...(result.error.code === "draft_conflict" && result.hackathon
            ? {
                existingEvent: {
                  id: result.hackathon.id,
                  name: result.hackathon.name,
                  slug: result.hackathon.slug,
                },
              }
            : {}),
        }), {
          status: 422,
          headers: { "Content-Type": "application/json" },
        })
      }

      if (result.status === "failed") {
        return new Response(JSON.stringify({
          error: "Failed to create hackathon",
          code: "creation_failed",
          retryable: true,
        }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        })
      }

      if (result.status !== "created" && result.status !== "replayed") {
        return new Response(JSON.stringify({
          error: "Failed to create hackathon",
          code: "creation_failed",
          retryable: true,
        }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        })
      }
      const hackathon = result.hackathon

      const finalizationInput = {
        tenantId: principal.tenantId,
        principal,
        hackathon,
        auditMetadata: { name: hackathon.name },
        webhookData: {
          hackathonId: hackathon.id,
          name: hackathon.name,
          slug: hackathon.slug,
        },
      }
      const { startHackathonCreationFinalizationWorkflow } = await import(
        "@/lib/workflows/creation-finalization"
      )
      let finalizationRunId = await startHackathonCreationFinalizationWorkflow(
        finalizationInput,
      )
      const finalization = await finalizeHackathonCreation(finalizationInput)
      if (
        !finalizationRunId &&
        (finalization.status === "failed" || finalization.status === "in_progress")
      ) {
        finalizationRunId = await startHackathonCreationFinalizationWorkflow(
          finalizationInput,
        )
      }
      if (finalization.status === "invalid") {
        return new Response(JSON.stringify({
          error: finalization.error.message,
          code: finalization.error.code,
          retryable: false,
          existingEvent: {
            id: hackathon.id,
            name: hackathon.name,
            slug: hackathon.slug,
          },
        }), {
          status: 422,
          headers: { "Content-Type": "application/json" },
        })
      }
      if (!finalizationRunId && finalization.status !== "complete") {
        return new Response(JSON.stringify({
          error: "Your event was created, but setup could not be scheduled. Keep this page open and try again.",
          code: "finalization_unscheduled",
          retryable: true,
          committed: true,
          existingEvent: {
            id: hackathon.id,
            name: hackathon.name,
            slug: hackathon.slug,
          },
        }), {
          status: 503,
          headers: { "Content-Type": "application/json", "Retry-After": "2" },
        })
      }
      return {
        id: hackathon.id,
        name: hackathon.name,
        slug: hackathon.slug,
        replayed: result.status === "replayed",
        ...(finalization.status === "complete"
          ? {}
          : {
              finalization: {
                status: finalization.status,
                retryable: true,
                retryScheduled: Boolean(finalizationRunId),
                message: "The event was created. We're finishing setup now.",
              },
            }),
      }
    },
    {
      detail: {
        summary: "Create hackathon",
        description: "Creates one private hackathon draft with optional dates, location, image, sponsors, rules, prizes, challenges, and schedule. If any section fails, the new draft is removed. Requires hackathons:write scope.",
      },
      body: t.Object({
        draftId: t.Optional(t.String({ format: "uuid" })),
        expectedOrganizationId: t.Optional(t.String({ minLength: 1, maxLength: 200 })),
        name: t.String({ minLength: 1, maxLength: 120, description: "Event name" }),
        description: t.Optional(t.Union([t.String({ maxLength: 5000 }), t.Null()])),
        startsAt: t.Optional(t.Union([t.String({ format: "date-time" }), t.Null()])),
        endsAt: t.Optional(t.Union([t.String({ format: "date-time" }), t.Null()])),
        registrationOpensAt: t.Optional(t.Union([t.String({ format: "date-time" }), t.Null()])),
        registrationClosesAt: t.Optional(t.Union([t.String({ format: "date-time" }), t.Null()])),
        locationType: t.Optional(t.Union([
          t.Literal("in_person"),
          t.Literal("virtual"),
          t.Literal("hybrid"),
          t.Null(),
        ])),
        locationName: t.Optional(t.Union([t.String({ maxLength: 240 }), t.Null()])),
        locationUrl: t.Optional(t.Union([t.String({ maxLength: 2048 }), t.Null()])),
        imageUrl: t.Optional(t.Union([t.String({ maxLength: 2048 }), t.Null()])),
        sponsors: t.Optional(t.Array(t.Object({
          name: t.String({ minLength: 1, maxLength: 120 }),
          tier: t.Union([t.String({ maxLength: 80 }), t.Null()]),
        }), { maxItems: 50 })),
        rules: t.Optional(t.Union([t.String({ maxLength: 10000 }), t.Null()])),
        prizes: t.Optional(t.Array(t.Object({
          name: t.String({ minLength: 1, maxLength: 120 }),
          description: t.Union([t.String({ maxLength: 1000 }), t.Null()]),
          value: t.Union([t.String({ maxLength: 120 }), t.Null()]),
        }), { maxItems: 50 })),
        challenges: t.Optional(t.Array(t.Object({
          title: t.String({ minLength: 1, maxLength: 200 }),
          description: t.Union([t.String({ maxLength: 2000 }), t.Null()]),
          resources: t.Array(t.Object({
            label: t.String({ maxLength: 120 }),
            url: t.String({ minLength: 1, maxLength: 2048 }),
          }), { maxItems: 20 }),
        }), { maxItems: 50 })),
        agendaItems: t.Optional(t.Array(t.Object({
          title: t.String({ minLength: 1, maxLength: 200 }),
          description: t.Union([t.String({ maxLength: 1000 }), t.Null()]),
          startsAt: t.Union([t.String({ format: "date-time" }), t.Null()]),
          endsAt: t.Union([t.String({ format: "date-time" }), t.Null()]),
          location: t.Union([t.String({ maxLength: 200 }), t.Null()]),
          speakers: t.Array(t.String({ minLength: 1, maxLength: 120 }), { maxItems: 20 }),
        }), { maxItems: 50 })),
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
      allowLateRegistration: hackathon.allow_late_registration,
      maxParticipants: hackathon.max_participants,
      minTeamSize: hackathon.min_team_size,
      maxTeamSize: hackathon.max_team_size,
      allowSolo: hackathon.allow_solo,
      requireTeamApproval: hackathon.require_team_approval,
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
    async ({ principal, params, body, request, set }) => {
      requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])

      const hasStatusField = body.status !== undefined
      const hasOtherFields = Object.entries(body).some(
        ([field, value]) => field !== "status" && value !== undefined,
      )
      if (hasStatusField && hasOtherFields) {
        set.status = 400
        return {
          error: "Change the event stage separately from other settings.",
          code: "status_must_be_separate",
        }
      }

      const runSettingsMutation = async () => {
        let hasDateUpdate = false

        const { checkHackathonOrganizer } =
          await import("@/lib/services/public-hackathons")
        const check = await checkHackathonOrganizer(
          params.id,
          principal.tenantId,
        )
        if (check.status === "not_found") {
          return new Response(
            JSON.stringify({ error: "Hackathon not found" }),
            {
              status: 404,
              headers: { "Content-Type": "application/json" },
            },
          )
        }
        if (check.status === "not_authorized") {
          return new Response(JSON.stringify({ error: "Not authorized" }), {
            status: 403,
            headers: { "Content-Type": "application/json" },
          })
        }
        const currentHackathon = check.hackathon
        const previousStatus = currentHackathon.status
        const sameDate = (next: string | null, current: string | null) => {
          if (next === null || current === null) return next === current
          return new Date(next).getTime() === new Date(current).getTime()
        }
        hasDateUpdate =
          (body.startsAt !== undefined && !sameDate(body.startsAt, currentHackathon.starts_at)) ||
          (body.endsAt !== undefined && !sameDate(body.endsAt, currentHackathon.ends_at))

        const webMcpError = validateWebMcpSettingsMutationContext(
          request,
          {
            status: getEffectiveStatus(currentHackathon),
            eventVersion: currentHackathon.updated_at,
          },
          body as Record<string, unknown>,
        )
        if (webMcpError) {
          set.status = webMcpError.status
          return { error: webMcpError.error, code: webMcpError.code }
        }

        const isTransition =
          body.status !== undefined && body.status !== previousStatus
        if (hasDateUpdate && !isTransition) {
          const { validateTimelineDates } = await import("@/lib/utils/timeline")
          const dateError = validateTimelineDates({
            startsAt:
              body.startsAt !== undefined
                ? body.startsAt
                : currentHackathon.starts_at,
            endsAt:
              body.endsAt !== undefined
                ? body.endsAt
                : currentHackathon.ends_at,
          })
          if (dateError) {
            return new Response(JSON.stringify({ error: dateError }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            })
          }
        }

        if (body.requireTermsAcceptance === true) {
          const candidateContent =
            body.termsContent !== undefined
              ? body.termsContent
              : currentHackathon?.terms_content
          if (!candidateContent || candidateContent.trim().length === 0) {
            return new Response(
              JSON.stringify({
                error: "Add your terms before turning this on.",
                code: "terms_content_required",
              }),
              { status: 400, headers: { "Content-Type": "application/json" } },
            )
          }
        }

        if (body.status === "judging" && previousStatus === "active") {
          const { getJudgingSetupStatus } =
            await import("@/lib/services/judging")
          const setup = await getJudgingSetupStatus(params.id)
          if (!setup.isReady) {
            return new Response(
              JSON.stringify({
                error: `Finish scoring setup before judging starts. ${setup.issues.join(" ")}`,
                code: "judging_setup_incomplete",
                issues: setup.issues,
              }),
              { status: 409, headers: { "Content-Type": "application/json" } },
            )
          }
        }

        const hasStatusTransition =
          body.status !== undefined && body.status !== previousStatus

        const primaryLocale = currentHackathon.default_locale ?? "en"
        const normalizedLocale = body.locale
          ? normalizeLocale(body.locale)
          : null
        const translationLocale =
          normalizedLocale && normalizedLocale !== primaryLocale
            ? normalizedLocale
            : null
        const settingsMutationGuard = !hasStatusField
          ? {
              expectedVersion: currentHackathon.updated_at,
              allowedStatuses: hasDateUpdate
                ? (["draft"] as const)
                : WEBMCP_PRE_COMPLETION_STATUSES,
            }
          : undefined

        let hackathon: import("@/lib/db/hackathon-types").Hackathon | null
        if (hasStatusField) {
          hackathon = currentHackathon!
        } else if (translationLocale) {
          const { updateHackathonTranslation, updateHackathonSettings } =
            await import("@/lib/services/public-hackathons")

          const nonTranslatable = {
            bannerUrl: body.bannerUrl,
            startsAt: body.startsAt,
            endsAt: body.endsAt,
            allowLateRegistration: body.allowLateRegistration,
            anonymousJudging: body.anonymousJudging,
            judgingMode: body.judgingMode as
              "points" | "subjective" | "rubric" | undefined,
            locationType: body.locationType as
              "in_person" | "virtual" | "hybrid" | null | undefined,
            locationUrl: normalizeOptionalUrl(body.locationUrl),
            locationLatitude: body.locationLatitude,
            locationLongitude: body.locationLongitude,
            requireLocationVerification: body.requireLocationVerification,
            maxParticipants: body.maxParticipants,
            minTeamSize: body.minTeamSize,
            maxTeamSize: body.maxTeamSize,
            allowSolo: body.allowSolo,
            requireTeamApproval: body.requireTeamApproval,
            communityUrl: normalizeOptionalUrl(body.communityUrl),
            requireTermsAcceptance: body.requireTermsAcceptance,
            termsContent: body.termsContent,
          }

          const translatable: Parameters<typeof updateHackathonTranslation>[3] =
            {}
          if (body.name !== undefined) translatable.name = body.name
          if (body.description !== undefined)
            translatable.description = body.description
          if (body.rules !== undefined) translatable.rules = body.rules
          if (body.locationName !== undefined)
            translatable.location_name = body.locationName
          if (body.communityLabel !== undefined)
            translatable.community_label = body.communityLabel

          const hasTranslationUpdate = Object.keys(translatable).length > 0
          if (hasTranslationUpdate) {
            const translationResult = await updateHackathonTranslation(
              params.id,
              principal.tenantId,
              translationLocale,
              translatable,
            )
            if (!translationResult) {
              return new Response(
                JSON.stringify({ error: "Failed to update translation" }),
                {
                  status: 500,
                  headers: { "Content-Type": "application/json" },
                },
              )
            }
          }

          const hasSettingsUpdate = Object.values(nonTranslatable).some(
            (value) => value !== undefined,
          )
          hackathon = currentHackathon
          if (hasSettingsUpdate || hasTranslationUpdate) {
            const settingsResult = await updateHackathonSettings(
              params.id,
              principal.tenantId,
              nonTranslatable,
              settingsMutationGuard,
            )
            if (!settingsResult) {
              return new Response(
                JSON.stringify({
                  error: "The event changed. Refresh the page and try again.",
                  code: "event_changed",
                }),
                {
                  status: 409,
                  headers: { "Content-Type": "application/json" },
                },
              )
            }
            hackathon = settingsResult
          }
        } else {
          const { updateHackathonSettings } =
            await import("@/lib/services/public-hackathons")
          hackathon = await updateHackathonSettings(
            params.id,
            principal.tenantId,
            {
              bannerUrl: body.bannerUrl,
              name: body.name,
              description: body.description,
              rules: body.rules,
              startsAt: body.startsAt,
              endsAt: body.endsAt,
              allowLateRegistration: body.allowLateRegistration,
              anonymousJudging: body.anonymousJudging,
              judgingMode: body.judgingMode as
                "points" | "subjective" | "rubric" | undefined,
              locationType: body.locationType as
                "in_person" | "virtual" | "hybrid" | null | undefined,
              locationName: body.locationName,
              locationUrl: normalizeOptionalUrl(body.locationUrl),
              locationLatitude: body.locationLatitude,
              locationLongitude: body.locationLongitude,
              requireLocationVerification: body.requireLocationVerification,
              maxParticipants: body.maxParticipants,
              minTeamSize: body.minTeamSize,
              maxTeamSize: body.maxTeamSize,
              allowSolo: body.allowSolo,
              requireTeamApproval: body.requireTeamApproval,
              communityUrl: normalizeOptionalUrl(body.communityUrl),
              communityLabel: body.communityLabel,
              requireTermsAcceptance: body.requireTermsAcceptance,
              termsContent: body.termsContent,
            },
            settingsMutationGuard,
          )
        }

        if (!hackathon) {
          return new Response(
            JSON.stringify({
              error: "The event changed. Refresh the page and try again.",
              code: "event_changed",
            }),
            {
              status: 409,
              headers: { "Content-Type": "application/json" },
            },
          )
        }

        if (hasDateUpdate && !hasStatusTransition) {
          const { reschedulePreEventReminders } =
            await import("@/lib/services/pre-event-reminders")
          reschedulePreEventReminders(params.id).catch(console.error)
        }

        let notificationDispatch: "queued" | undefined
        if (hasStatusTransition) {
          const { executeTransition } = await import("@/lib/services/lifecycle")
          const triggeredBy =
            principal.kind === "user" ? principal.userId : principal.keyId
          const opensRegistration =
            previousStatus === "draft" && body.status !== "draft"
          const registrationOpensAt = opensRegistration
            ? (currentHackathon.registration_opens_at ?? new Date().toISOString())
            : undefined
          const transitionStartsAt = body.startsAt ?? currentHackathon.starts_at
          const defaultRegistrationClosesAt = opensRegistration && transitionStartsAt
            ? (() => {
                const startsAt = new Date(transitionStartsAt).getTime()
                const opensAt = new Date(registrationOpensAt!).getTime()
                const dayBefore = startsAt - 86_400_000
                return new Date(
                  dayBefore > opensAt ? dayBefore : Math.max(startsAt, opensAt),
                ).toISOString()
              })()
            : undefined
          const registrationClosesAt = opensRegistration
            ? currentHackathon.registration_closes_at ?? defaultRegistrationClosesAt
            : undefined
          const transitionResult = await executeTransition({
            hackathonId: params.id,
            tenantId: principal.tenantId,
            fromStatus:
              previousStatus as import("@/lib/db/hackathon-types").HackathonStatus,
            toStatus:
              body.status as import("@/lib/db/hackathon-types").HackathonStatus,
            trigger: "manual",
            triggeredBy,
            registrationOpensAt,
            registrationClosesAt,
          })

          if (!transitionResult.success) {
            const status =
              transitionResult.code === "event_busy" ||
              transitionResult.code === "event_changed"
                ? 409
                : transitionResult.code === "lease_unavailable" ||
                    transitionResult.code === "transition_unavailable"
                  ? 503
                  : 400
            return new Response(
              JSON.stringify({
                error: transitionResult.error,
                ...(transitionResult.code
                  ? { code: transitionResult.code }
                  : {}),
              }),
              { status, headers: { "Content-Type": "application/json" } },
            )
          }

          const transitionedHackathon = transitionResult.hackathon ?? hackathon
          hackathon = transitionedHackathon

          if (previousStatus === "draft" && body.status !== "draft") {
            notificationDispatch = "queued"
            const { resolveAdderName } =
              await import("@/lib/auth/resolve-adder-name")
            const inviterName = await resolveAdderName(principal)
            const { sendPendingJudgeInvitationEmails } =
              await import("@/lib/services/judge-invitations")
            sendPendingJudgeInvitationEmails(
              transitionedHackathon.id,
              transitionedHackathon.name,
              inviterName,
              {
                hackathonSlug: transitionedHackathon.slug,
                hackathonStartsAt: transitionedHackathon.starts_at,
                hackathonEndsAt: transitionedHackathon.ends_at,
              },
            )
              .then(({ sent, total, failedEmails }) => {
                if (total === 0) return
                if (failedEmails.length > 0) {
                  console.error(
                    `Judge invitation emails: ${sent}/${total} sent for hackathon ${transitionedHackathon.id}; ${failedEmails.length} will be retried.`,
                  )
                }
              })
              .catch((err) => {
                console.error(
                  `Failed to send pending judge invitation emails for hackathon ${transitionedHackathon.id}:`,
                  err,
                )
              })
            const { start } = await import("workflow/api")
            const { sendJudgeNotificationsWorkflow } =
              await import("@/lib/workflows/judge-notifications")
            const { sendPendingTeamInvitationEmails } =
              await import("@/lib/services/team-invitations")
            sendPendingTeamInvitationEmails(transitionedHackathon.id)
              .then(({ sent, total, failedEmails }) => {
                if (total === 0) return
                if (failedEmails.length > 0) {
                  console.error(
                    `Team invitation emails: ${sent}/${total} sent for hackathon ${transitionedHackathon.id}; ${failedEmails.length} will be retried.`,
                  )
                }
              })
              .catch((err) => {
                console.error(
                  `Failed to send pending team invitation emails for hackathon ${transitionedHackathon.id}:`,
                  err,
                )
              })
            start(sendJudgeNotificationsWorkflow, [
              {
                hackathonId: transitionedHackathon.id,
                hackathonName: transitionedHackathon.name,
                hackathonSlug: transitionedHackathon.slug,
              },
            ]).catch(async (err) => {
              console.error(
                "Failed to start judge notifications workflow, falling back to direct send:",
                err,
              )
              const { fetchPendingNotifications, sendJudgeNotification } =
                await import("@/lib/workflows/judge-notifications/steps")
              const notifications = await fetchPendingNotifications(
                transitionedHackathon.id,
              ).catch((fetchErr) => {
                console.error(
                  `Judge notification fallback: failed to fetch pending notifications for hackathon ${transitionedHackathon.id}:`,
                  fetchErr,
                )
                return [] as Awaited<
                  ReturnType<typeof fetchPendingNotifications>
                >
              })
              const failedIds: string[] = []
              for (const n of notifications) {
                try {
                  await sendJudgeNotification({
                    notification: n,
                    hackathonName: transitionedHackathon.name,
                    hackathonSlug: transitionedHackathon.slug,
                  })
                } catch {
                  failedIds.push(n.id)
                }
              }
              if (failedIds.length > 0) {
                console.error(
                  `Judge notification fallback: ${failedIds.length} notification(s) failed to send and remain stuck (ids: ${failedIds.join(", ")}). These will not be automatically retried.`,
                )
              }
            })
          }
        }

        await logAudit({
          principal,
          action: hasStatusTransition
            ? "hackathon.status_transition"
            : "hackathon.updated",
          resourceType: "hackathon",
          resourceId: params.id,
          metadata: hasStatusTransition
            ? { fromStatus: previousStatus, toStatus: body.status }
            : undefined,
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
          ? (
              await import("@/lib/services/public-hackathons")
            ).getHackathonByIdForOrganizer(params.id, principal.tenantId)
          : hackathon

        const h = hasStatusTransition ? await updatedHackathon : hackathon
        if (!h) {
          return new Response(
            JSON.stringify({ error: "Hackathon not found" }),
            {
              status: 404,
              headers: { "Content-Type": "application/json" },
            },
          )
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
          allowLateRegistration: h.allow_late_registration,
          maxParticipants: h.max_participants,
          minTeamSize: h.min_team_size,
          maxTeamSize: h.max_team_size,
          allowSolo: h.allow_solo,
          requireTeamApproval: h.require_team_approval,
          anonymousJudging: h.anonymous_judging,
          judgingMode: h.judging_mode,
          requireTermsAcceptance: h.require_terms_acceptance ?? false,
          termsContent: h.terms_content ?? null,
          resultsPublishedAt: h.results_published_at,
          createdAt: h.created_at,
          updatedAt: h.updated_at,
          notificationDispatch,
        }
      }

      if (hasStatusField) return runSettingsMutation()

      try {
        return await withEventMutationLease(params.id, runSettingsMutation, principal.tenantId)
      } catch (error) {
        return settingsMutationLeaseFailure(error, set)
      }
    },
    {
      detail: {
        summary: "Update hackathon settings",
        description: "Updates hackathon configuration. Starting judging requires complete scoring rules. Requires hackathons:write scope.",
      },
      body: t.Object({
        bannerUrl: t.Optional(t.Union([t.String(), t.Null()])),
        name: t.Optional(t.String()),
        description: t.Optional(t.Union([t.String(), t.Null()])),
        rules: t.Optional(t.Union([t.String(), t.Null()])),
        startsAt: t.Optional(t.Union([t.String(), t.Null()])),
        endsAt: t.Optional(t.Union([t.String(), t.Null()])),
        allowLateRegistration: t.Optional(t.Boolean()),
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
        locationType: t.Optional(t.Union([t.Literal("in_person"), t.Literal("virtual"), t.Literal("hybrid"), t.Null()])),
        locationName: t.Optional(t.Union([t.String(), t.Null()])),
        locationUrl: t.Optional(t.Union([t.String(), t.Null()])),
        locationLatitude: t.Optional(t.Union([t.Number(), t.Null()])),
        locationLongitude: t.Optional(t.Union([t.Number(), t.Null()])),
        requireLocationVerification: t.Optional(t.Boolean()),
        maxParticipants: t.Optional(t.Union([t.Number(), t.Null()])),
        minTeamSize: t.Optional(t.Number()),
        maxTeamSize: t.Optional(t.Number()),
        allowSolo: t.Optional(t.Boolean()),
        requireTeamApproval: t.Optional(t.Boolean()),
        communityUrl: t.Optional(t.Union([t.String(), t.Null()])),
        communityLabel: t.Optional(t.Union([t.String(), t.Null()])),
        requireTermsAcceptance: t.Optional(t.Boolean({ description: "When true, attendees and judges must accept the hackathon terms before registering or accepting an invite." })),
        termsContent: t.Optional(t.Union([t.String({ maxLength: 50000 }), t.Null()], { description: "Markdown body of the terms shown to attendees and judges. Pass null to clear." })),
        locale: t.Optional(t.String({ minLength: 1 })),
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
      const { upsertTenantSponsor } = await import("@/lib/services/tenant-sponsors")
      const tenantSponsor = await upsertTenantSponsor(principal.tenantId, {
        name: body.name,
        websiteUrl,
      })
      tenantSponsorId = tenantSponsor?.id ?? null
      if (!tenantSponsorId) {
        console.warn(`upsertTenantSponsor returned null for tenant ${principal.tenantId}, sponsor "${body.name}" will be added without a library link`)
      }

      const sponsor = await addSponsor({
        hackathonId: params.id,
        name: body.name,
        logoUrl,
        websiteUrl,
        tier: body.tier as SponsorTier | undefined,
        customTierLabel: body.customTierLabel,
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

      const { listHackathonSponsors } = await import("@/lib/services/sponsors")
      const sponsor = (await listHackathonSponsors(params.id)).find((item) => item.id === params.sponsorId)
      if (!sponsor) {
        return new Response(JSON.stringify({ error: "Sponsor not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        })
      }
      const actorId = principal.kind === "user" ? principal.userId : principal.keyId
      const uploadLimit = await checkRateLimit(
        `sponsor_logo:${params.id}:${actorId}`,
        { maxRequests: 10, windowMs: 60 * 60_000 },
        { failureMode: "closed" },
      )
      if (!uploadLimit.allowed) throw new RateLimitError(uploadLimit.resetAt, uploadLimit.remaining)
      const contentLength = Number(request.headers.get("content-length") ?? 0)
      if (contentLength > 7 * 1024 * 1024) {
        return new Response(JSON.stringify({ error: "Request too large" }), {
          status: 413,
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

      const { updateSponsor } = await import("@/lib/services/sponsors")
      const updateField = variant === "dark" ? { logoUrlDark: uploadResult.url } : { logoUrl: uploadResult.url }
      const savedSponsor = await updateSponsor(params.sponsorId, updateField, params.id)
      if (!savedSponsor) {
        const { deleteSponsorLogo } = await import("@/lib/services/storage")
        await deleteSponsorLogo(params.id, params.sponsorId, variant)
        return new Response(JSON.stringify({ error: "Failed to save sponsor logo" }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        })
      }

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
  .get("/org-profile", async ({ principal, query }) => {
    requirePrincipal(principal, ["user", "api_key"], ["org:read"])

    if (!matchesExpectedOrganization(principal, query.expectedOrganizationId)) {
      return new Response(JSON.stringify({
        error: "Your active organization changed. Review it and try again.",
        code: "organization_context_changed",
        retryable: true,
      }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      })
    }

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
    query: t.Object({
      expectedOrganizationId: t.Optional(t.String({ minLength: 1, maxLength: 200 })),
    }),
  })
  .patch(
    "/org-profile",
    async ({ principal, body }) => {
      requirePrincipal(principal, ["user", "api_key"], ["org:write"])

      if (!matchesExpectedOrganization(principal, body.expectedOrganizationId)) {
        return new Response(JSON.stringify({
          error: "Your active organization changed. Review it and try again.",
          code: "organization_context_changed",
          retryable: true,
        }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        })
      }

      const { updateTenantProfile, isSlugAvailable } = await import("@/lib/services/tenant-profiles")

      if (body.slug !== undefined) {
        if (!body.slug || !isValidSlugFormat(body.slug)) {
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
        expectedOrganizationId: t.Optional(t.String({ minLength: 1, maxLength: 200 })),
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

      const { createTeamInvitation, getTeamWithHackathon, cancelTeamInvitation } = await import(
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
      const disposition = teamInfo
        ? getNotificationDisposition({
            status: teamInfo.hackathon.status as import("@/lib/db/hackathon-types").HackathonStatus,
            starts_at: teamInfo.hackathon.starts_at,
            ends_at: teamInfo.hackathon.ends_at,
          })
        : "reject"

      if (teamInfo && disposition === "reject") {
        await cancelTeamInvitation(result.invitation.id, principal.userId!).catch((error) =>
          console.error(`Failed to cancel ended-event team invitation ${result.invitation.id}:`, error)
        )
        return new Response(JSON.stringify({ error: "This event has ended.", code: "hackathon_ended" }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        })
      }

      const willSendImmediately = !!teamInfo && disposition === "send"
      let delivery: "queued" | "sent" | "failed" = !teamInfo
        ? "failed"
        : willSendImmediately
          ? "sent"
          : "queued"

      if (willSendImmediately) {
        const inviterName = body.inviterName || "Your team captain"
        const { resolveAdderEmail } = await import("@/lib/auth/resolve-adder-name")
        const inviterEmail = await resolveAdderEmail(principal)
        const emailInput = {
          to: body.email,
          teamName: teamInfo.name,
          hackathonName: teamInfo.hackathon.name,
          inviterName,
          inviterEmail,
          inviteToken: result.invitation.token,
          expiresAt: result.invitation.expires_at,
          hackathonSlug: teamInfo.hackathon.slug,
          hackathonStartsAt: teamInfo.hackathon.starts_at,
          hackathonEndsAt: teamInfo.hackathon.ends_at,
          teamMembers: teamInfo.memberNames,
          deliveryId: result.invitation.id,
        }
        const { markTeamInvitationEmailed } = await import("@/lib/services/team-invitations")
        const { sendTeamInvitationEmail } = await import("@/lib/email/team-invitations")
        const sendResult = await sendTeamInvitationEmail(emailInput).catch((error) => {
          console.error(`Failed to send team invitation ${result.invitation.id}:`, error)
          return { success: false }
        })

        if (!sendResult.success) {
          delivery = "failed"
        } else {
          try {
            await markTeamInvitationEmailed(result.invitation.id)
          } catch (error) {
            console.error(`Failed to save team invitation ${result.invitation.id} delivery:`, error)
            delivery = "failed"
          }
          if (delivery === "sent") {
            const { scheduleReminders } = await import("@/lib/services/smart-reminders")
            await scheduleReminders(
              "team_invitation",
              result.invitation.id,
              body.hackathonId,
              "invitation_reminder",
              new Date(result.invitation.created_at),
              new Date(result.invitation.expires_at),
              {
                email: body.email,
                teamName: teamInfo.name,
                hackathonName: teamInfo.hackathon.name,
                inviterName,
                inviterEmail,
                inviteToken: result.invitation.token,
                expiresAt: result.invitation.expires_at,
              }
            ).catch((error) => {
              console.error(`Failed to schedule team invitation ${result.invitation.id} reminder:`, error)
            })
          }
        }
      }

      await logAudit({
        principal,
        action: delivery === "sent"
          ? "team_invitation.sent"
          : delivery === "queued"
            ? "team_invitation.queued"
            : "team_invitation.delivery_failed",
        resourceType: "team_invitation",
        resourceId: result.invitation.id,
        metadata: {
          teamId: params.teamId,
          email: body.email,
          queued: delivery === "queued",
          delivery,
          queueReason: getQueueReason(delivery),
        },
      })

      return {
        id: result.invitation.id,
        email: result.invitation.email,
        expiresAt: result.invitation.expires_at,
        queued: delivery === "queued",
        delivery,
        queueReason: getQueueReason(delivery),
      }
    },
    {
      detail: {
        summary: "Send team invitation",
        description:
          "Creates a team invitation. It sends now or queues until the event goes live. Rate limited. Clerk-only.",
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
          remindedAt: i.reminded_at ?? null,
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

    const { cancelRemindersForEntity } = await import("@/lib/services/smart-reminders")
    cancelRemindersForEntity("team_invitation", params.invitationId).catch((err) =>
      console.error(`Failed to cancel reminders for team_invitation ${params.invitationId}:`, err)
    )

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
  .post("/teams/:teamId/invitations/:invitationId/remind", async ({ principal, params, request }) => {
    requirePrincipal(principal, ["user"], ["hackathons:write"])

    const { isValidUuid } = await import("@/lib/utils/uuid")
    if (!isValidUuid(params.teamId) || !isValidUuid(params.invitationId)) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })
    }

    const { remindTeamInvitation, getTeamWithHackathon } = await import(
      "@/lib/services/team-invitations"
    )

    const teamInfo = await getTeamWithHackathon(params.teamId)
    if (!teamInfo) {
      return new Response(JSON.stringify({ error: "Team not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })
    }

    const lifecycleError = getNotificationLifecycleError(getNotificationDisposition({
      status: teamInfo.hackathon.status as import("@/lib/db/hackathon-types").HackathonStatus,
      starts_at: teamInfo.hackathon.starts_at,
      ends_at: teamInfo.hackathon.ends_at,
    }))
    if (lifecycleError) {
      return new Response(
        JSON.stringify({ error: lifecycleError.error, code: lifecycleError.code }),
        { status: lifecycleError.status, headers: { "Content-Type": "application/json" } }
      )
    }

    const requestKey = await getRequestIdempotencyFingerprint(request, "manual")
    if (!requestKey.ok) {
      return new Response(JSON.stringify({ error: requestKey.error, code: requestKey.code }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    const rateLimitResult = await checkRateLimit(`team_invitation_remind:${params.teamId}`, {
      maxRequests: 5,
      windowMs: 60_000,
    })
    if (!rateLimitResult.allowed) {
      throw new RateLimitError(rateLimitResult.resetAt, rateLimitResult.remaining)
    }

    const { resolveAdder } = await import("@/lib/auth/resolve-adder-name")
    const { name: inviterName, email: inviterEmail } = await resolveAdder(principal)

    const result = await remindTeamInvitation(params.invitationId, principal.userId!, params.teamId)

    if (!result.success) {
      return new Response(JSON.stringify({ error: result.error, code: result.code }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    const { sendTeamInvitationReminderEmail } = await import(
      "@/lib/email/team-invitations"
    )
    const delivery = await sendTeamInvitationReminderEmail({
      to: result.invitation.email,
      teamName: teamInfo.name,
      hackathonName: teamInfo.hackathon.name,
      inviterName,
      inviterEmail,
      inviteToken: result.invitation.token,
      expiresAt: result.invitation.expires_at,
      deliveryId: `${params.invitationId}/manual/${requestKey.fingerprint}`,
    }).catch((error) => {
      console.error(`Failed to send team invitation reminder ${params.invitationId}:`, error)
      return { success: false }
    })

    if (!delivery.success) {
      const remindedAt = result.invitation.reminded_at
      if (remindedAt) {
        const { releaseTeamInvitationReminderClaim } = await import("@/lib/services/team-invitations")
        await releaseTeamInvitationReminderClaim(params.invitationId, remindedAt).catch((error) =>
          console.error(`Failed to release reminder claim for team_invitation ${params.invitationId}:`, error)
        )
      }
      return new Response(
        JSON.stringify({ error: "The reminder email could not be sent.", code: "email_delivery_failed" }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      )
    }

    const { cancelUpcomingReminder } = await import("@/lib/services/smart-reminders")
    try {
      await cancelUpcomingReminder("team_invitation", params.invitationId)
    } catch (error) {
      console.error(`Failed to cancel the next team invitation reminder ${params.invitationId}:`, error)
      return new Response(
        JSON.stringify({ error: "The email was sent, but the next reminder could not be updated.", code: "reminder_state_failed" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      )
    }

    await logAudit({
      principal,
      action: "team_invitation.reminded",
      resourceType: "team_invitation",
      resourceId: params.invitationId,
    })

    return { success: true }
  }, {
    detail: {
      summary: "Send team invitation reminder",
      description: "Sends the one allowed manual reminder for a pending team invitation. Reuse an optional Idempotency-Key header when retrying the same request. Clerk-only.",
    },
  })
  .use(dashboardJudgingRoutes)
  .use(dashboardResultsRoutes)
  .use(dashboardJudgeDisplayRoutes)
  .use(dashboardPostEventRoutes)
  .use(dashboardSponsorFulfillmentRoutes)
  .use(dashboardPrizeTracksRoutes)
