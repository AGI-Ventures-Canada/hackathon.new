import { Elysia, t } from "elysia"
import { resolvePrincipal, requireAdmin, requireAdminScopes, AuthError } from "@/lib/auth/principal"
import { isValidUuid } from "@/lib/utils/uuid"
import { checkRateLimit, RateLimitError } from "@/lib/services/rate-limit"
import { logAudit, listAllAuditLogs } from "@/lib/services/audit"
import {
  getPlatformStats,
  listAllHackathons,
  getHackathonById,
  updateHackathonAsAdmin,
  deleteHackathon,
} from "@/lib/services/admin"
import { listScenarios, runScenario, generateRoleTokens, getActiveScenarios } from "@/lib/services/admin-scenarios"
import { getPersonaUserId, findPersonaByUserId, TEST_PERSONAS } from "@/lib/dev/test-personas"
import { safeRedirectUrl } from "@/lib/utils/url"
import { supabase } from "@/lib/db/client"
import { HackathonStatusEnum } from "@/lib/api/validators"

const LocationTypeEnum = t.Union([
  t.Literal("in_person"),
  t.Literal("virtual"),
])

export const adminRoutes = new Elysia({ prefix: "/admin" })
  .derive(async ({ request }) => {
    const principal = await resolvePrincipal(request)
    requireAdmin(principal)

    const rateLimitKey = principal.kind === "admin" ? `admin:${principal.userId}` : `admin-key:${principal.keyId}`
    const result = await checkRateLimit(rateLimitKey, { maxRequests: 60, windowMs: 60_000 })
    if (!result.allowed) {
      throw new RateLimitError(result.resetAt, result.remaining)
    }

    return { principal }
  })
  .get("/stats", async ({ principal }) => {
    requireAdminScopes(principal, ["admin:read"])
    const stats = await getPlatformStats()
    return stats
  }, {
    detail: {
      summary: "Get platform stats",
      description: "Returns aggregate counts of tenants, hackathons, participants, and submissions.",
    },
  })
  .get(
    "/hackathons",
    async ({ query, principal }) => {
      requireAdminScopes(principal, ["admin:read"])
      const result = await listAllHackathons({
        limit: query.limit,
        offset: query.offset,
        status: query.status || undefined,
        tenantId: query.tenant_id || undefined,
        search: query.search || undefined,
      })
      return result
    },
    {
      query: t.Object({
        limit: t.Optional(t.Numeric()),
        offset: t.Optional(t.Numeric()),
        status: t.Optional(t.String()),
        tenant_id: t.Optional(t.String()),
        search: t.Optional(t.String()),
      }),
      detail: {
        summary: "List all hackathons",
        description: "List hackathons across all tenants with pagination and filters.",
      },
    }
  )
  .get(
    "/hackathons/:id",
    async ({ params, principal }) => {
      requireAdminScopes(principal, ["admin:read"])
      const hackathon = await getHackathonById(params.id)
      if (!hackathon) {
        throw new AuthError("Hackathon not found", 404)
      }
      return hackathon
    },
    {
      detail: {
        summary: "Get hackathon detail",
        description: "Returns full hackathon details including tenant info.",
      },
    }
  )
  .patch(
    "/hackathons/:id",
    async ({ params, body, principal }) => {
      requireAdminScopes(principal, ["admin:write"])
      const existing = await getHackathonById(params.id)
      if (!existing) {
        throw new AuthError("Hackathon not found", 404)
      }

      const updated = await updateHackathonAsAdmin(params.id, body)

      await logAudit({
        principal,
        action: "admin.hackathon.updated",
        resourceType: "hackathon",
        resourceId: params.id,
        targetTenantId: existing.tenant_id,
        metadata: { fields: Object.keys(body) },
        critical: true,
      })

      return updated
    },
    {
      body: t.Object({
        name: t.Optional(t.String({ maxLength: 200 })),
        slug: t.Optional(t.String({ maxLength: 200 })),
        description: t.Optional(t.Nullable(t.String({ maxLength: 10000 }))),
        status: t.Optional(HackathonStatusEnum),
        starts_at: t.Optional(t.Nullable(t.String({ maxLength: 100 }))),
        ends_at: t.Optional(t.Nullable(t.String({ maxLength: 100 }))),
        registration_opens_at: t.Optional(t.Nullable(t.String({ maxLength: 100 }))),
        registration_closes_at: t.Optional(t.Nullable(t.String({ maxLength: 100 }))),
        min_team_size: t.Optional(t.Nullable(t.Number())),
        max_team_size: t.Optional(t.Nullable(t.Number())),
        max_participants: t.Optional(t.Nullable(t.Number())),
        allow_solo: t.Optional(t.Nullable(t.Boolean())),
        anonymous_judging: t.Optional(t.Boolean()),
        rules: t.Optional(t.Nullable(t.String({ maxLength: 50000 }))),
        location_type: t.Optional(t.Nullable(LocationTypeEnum)),
        location_name: t.Optional(t.Nullable(t.String({ maxLength: 500 }))),
        location_url: t.Optional(t.Nullable(t.String({ maxLength: 2000 }))),
        results_published_at: t.Optional(t.Nullable(t.String({ maxLength: 100 }))),
      }),
      detail: {
        summary: "Update hackathon",
        description: "Update any hackathon field as admin.",
      },
    }
  )
  .delete(
    "/hackathons/:id",
    async ({ params, body, principal }) => {
      requireAdminScopes(principal, ["admin:write"])
      const existing = await getHackathonById(params.id)
      if (!existing) {
        throw new AuthError("Hackathon not found", 404)
      }

      if (body?.confirm_name !== existing.name) {
        throw new AuthError("confirm_name must match the hackathon name", 400)
      }

      await deleteHackathon(params.id)

      await logAudit({
        principal,
        action: "admin.hackathon.deleted",
        resourceType: "hackathon",
        resourceId: params.id,
        targetTenantId: existing.tenant_id,
        metadata: { name: existing.name, slug: existing.slug },
        critical: true,
      })

      return { success: true }
    },
    {
      body: t.Object({
        confirm_name: t.String({ description: "Must match the hackathon name to confirm deletion" }),
      }),
      detail: {
        summary: "Delete hackathon",
        description: "Permanently delete a hackathon and all associated data. Requires confirm_name matching the hackathon name.",
      },
    }
  )
  .get(
    "/activity",
    async ({ query, principal }) => {
      requireAdminScopes(principal, ["admin:read"])

      if (query.hackathon_id && !isValidUuid(query.hackathon_id)) {
        throw new AuthError("Invalid hackathon_id format", 400)
      }
      if (query.tenant_id && !isValidUuid(query.tenant_id)) {
        throw new AuthError("Invalid tenant_id format", 400)
      }

      const result = await listAllAuditLogs({
        limit: query.limit,
        offset: query.offset,
        hackathonId: query.hackathon_id || undefined,
        tenantId: query.tenant_id || undefined,
        action: query.action || undefined,
        resourceType: query.resource_type || undefined,
        since: query.since || undefined,
        until: query.until || undefined,
        sort: query.sort === "asc" ? "asc" : undefined,
      })
      return result
    },
    {
      query: t.Object({
        limit: t.Optional(t.Numeric({ description: "Page size (1-100, default 50)" })),
        offset: t.Optional(t.Numeric({ description: "Pagination offset (default 0)" })),
        hackathon_id: t.Optional(t.String({ description: "Filter by hackathon UUID" })),
        tenant_id: t.Optional(t.String({ description: "Filter by tenant UUID" })),
        action: t.Optional(t.String({ description: "Filter by action (substring match)" })),
        resource_type: t.Optional(t.String({ description: "Filter by resource type (exact match)" })),
        since: t.Optional(t.String({ description: "Only logs after this ISO 8601 timestamp" })),
        until: t.Optional(t.String({ description: "Only logs before this ISO 8601 timestamp" })),
        sort: t.Optional(t.String({ description: "Sort order: 'asc' or 'desc' (default 'desc')" })),
      }),
      detail: {
        summary: "List activity logs",
        description: "List audit logs across all tenants with pagination, filtering, sorting, and date range.",
      },
    }
  )
  .get("/scenarios", ({ principal }) => {
    requireAdminScopes(principal, ["admin:scenarios"])
    return { scenarios: listScenarios() }
  }, {
    detail: {
      summary: "List test scenarios",
      description: "Returns available test scenarios with descriptions.",
    },
  })
  .get("/scenario-active", async ({ principal }) => {
    requireAdminScopes(principal, ["admin:scenarios"])
    const active = await getActiveScenarios()
    return { active }
  }, {
    detail: {
      summary: "Get active scenario runs",
      description: "Returns the most recent hackathon for each scenario type, visible to all admins.",
    },
  })
  .get("/scenario-personas", ({ principal }) => {
    requireAdminScopes(principal, ["admin:scenarios"])
    return {
      personas: TEST_PERSONAS.map((p) => ({
        key: p.key,
        name: p.name,
        configured: !!(process.env[p.env] ?? p.fallback),
      })),
    }
  }, {
    detail: {
      summary: "List test personas",
      description: "Returns persona keys, display names, and whether each is configured via env vars.",
    },
  })
  .get("/persona-roles", async ({ principal, query }) => {
    requireAdminScopes(principal, ["admin:scenarios"])
    const personaRoles: Record<string, string> = {}
    const db = supabase()

    if (query.hackathonId) {
      if (!isValidUuid(query.hackathonId)) {
        throw new AuthError("Invalid hackathon ID", 400)
      }
      const { data: participants } = await db
        .from("hackathon_participants")
        .select("clerk_user_id, role")
        .eq("hackathon_id", query.hackathonId)
      for (const p of participants ?? []) {
        const persona = findPersonaByUserId(p.clerk_user_id)
        if (persona) personaRoles[persona.key] = p.role
      }
    } else {
      const activeScenarios = await getActiveScenarios()
      if (activeScenarios.length > 0) {
        const { data: participants } = await db
          .from("hackathon_participants")
          .select("clerk_user_id, role")
          .in("hackathon_id", activeScenarios.map((s) => s.hackathonId))
        for (const p of participants ?? []) {
          const persona = findPersonaByUserId(p.clerk_user_id)
          if (persona && !personaRoles[persona.key]) {
            personaRoles[persona.key] = p.role
          }
        }
      }
    }

    return { roles: personaRoles }
  }, {
    query: t.Object({
      hackathonId: t.Optional(t.String()),
    }),
    detail: {
      summary: "Get persona roles",
      description: "Returns the current hackathon role for each configured test persona. Pass hackathonId to scope to a specific event.",
    },
  })
  .post(
    "/scenario-tokens",
    async ({ body, principal }) => {
      requireAdminScopes(principal, ["admin:scenarios"])
      if (process.env.VERCEL_ENV === "production") {
        throw new AuthError("Not available in production", 403)
      }
      if (!isValidUuid(body.hackathon_id)) {
        throw new AuthError("Invalid hackathon ID", 400)
      }
      const db = supabase()
      const { data: hackathon } = await db
        .from("hackathons")
        .select("slug")
        .eq("id", body.hackathon_id)
        .single()

      if (!hackathon) {
        throw new AuthError("Hackathon not found", 404)
      }

      const roles = await generateRoleTokens(body.hackathon_id, hackathon.slug)
      return { roles }
    },
    {
      body: t.Object({
        hackathon_id: t.String({ description: "Hackathon UUID to generate tokens for" }),
      }),
      detail: {
        summary: "Refresh role sign-in tokens",
        description: "Generate fresh one-click sign-in tokens for each test persona in a scenario hackathon.",
      },
    }
  )
  .post(
    "/scenario-switch",
    async ({ body, principal }) => {
      requireAdminScopes(principal, ["admin:scenarios"])
      if (process.env.VERCEL_ENV === "production") {
        throw new AuthError("Not available in production", 403)
      }

      const targetUserId = getPersonaUserId(body.persona)
      if (!targetUserId) {
        throw new AuthError(`Unknown persona or TEST_USER_${body.persona.toUpperCase()}_ID not set`, 400)
      }

      const { clerkClient } = await import("@clerk/nextjs/server")
      const clerk = await clerkClient()
      const token = await clerk.signInTokens.createSignInToken({
        userId: targetUserId,
        expiresInSeconds: 300,
      })

      const orgId = body.org_id ?? process.env.SCENARIO_ORG_ID ?? null
      const base = `/dev-switch?token=${token.token}&redirect=${encodeURIComponent(safeRedirectUrl(body.redirect))}`
      const loginUrl = orgId ? `${base}&org=${encodeURIComponent(orgId)}` : base

      return { loginUrl }
    },
    {
      body: t.Object({
        persona: t.Union([t.Literal("organizer"), t.Literal("user1"), t.Literal("user2"), t.Literal("user3"), t.Literal("user4"), t.Literal("user5")], { description: "Persona key" }),
        redirect: t.Optional(t.String({ description: "Path to redirect to after sign-in" })),
        org_id: t.Optional(t.String({ description: "Clerk org ID to activate after sign-in" })),
      }),
      detail: {
        summary: "Switch to test persona",
        description: "Generate a sign-in token for a test persona and return a login URL. Admin-only, dev/staging only.",
      },
    }
  )
  .post(
    "/scenario-run/:name",
    async ({ params, body, principal }) => {
      requireAdminScopes(principal, ["admin:scenarios"])

      let result: Awaited<ReturnType<typeof runScenario>>
      try {
        const orgId = principal.kind === "admin" ? principal.orgId : null
        result = await runScenario(params.name, body?.tenant_id || undefined, orgId, body?.options || undefined)
      } catch (err) {
        throw new AuthError(err instanceof Error ? err.message : "Failed to run scenario", 400)
      }

      await logAudit({
        principal,
        action: "admin.scenario.created",
        resourceType: "hackathon",
        resourceId: result.hackathonId,
        targetTenantId: result.tenantId,
        metadata: { scenario: params.name },
        critical: true,
      })

      const roles = await generateRoleTokens(result.hackathonId, result.slug)
      return { ...result, roles }
    },
    {
      body: t.Optional(
        t.Object({
          tenant_id: t.Optional(t.String()),
          options: t.Optional(t.Record(t.String(), t.Boolean())),
        })
      ),
      detail: {
        summary: "Run test scenario",
        description: "Run a test scenario to seed the database with sample data. Pass options to customize seeding (e.g., criteria, preJudge).",
      },
    }
  )
  .post(
    "/maintenance/cleanup-rate-limits",
    async ({ body, principal }) => {
      requireAdminScopes(principal, ["admin:write"])
      const db = supabase()
      const limit = body?.limit ?? 1000
      const { data, error } = await db.rpc("cleanup_expired_rate_limits", { p_limit: limit })
      if (error) {
        throw new Error(error.message)
      }
      return { deleted: data as number }
    },
    {
      body: t.Optional(
        t.Object({
          limit: t.Optional(t.Number({ description: "Max rows to delete (default 1000)" })),
        })
      ),
      detail: {
        summary: "Clean up expired rate limit rows",
        description: "Deletes expired rows from the rate_limits table. Safe to call at any time.",
      },
    }
  )
