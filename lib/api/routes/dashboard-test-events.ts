import { Elysia, t } from "elysia"
import { resolvePrincipal, requirePrincipal } from "@/lib/auth/principal"
import { matchesExpectedOrganization } from "@/lib/auth/types"
import { logAudit } from "@/lib/services/audit"
import {
  EventMutationLeaseError,
  withEventMutationLease,
} from "@/lib/services/event-mutation-lease"
import { checkRateLimit, RateLimitError } from "@/lib/services/rate-limit"
import {
  convertTestEventToDraft,
  createTestEventSandbox,
  TestEventSandboxError,
} from "@/lib/services/test-event-sandbox"
import { isOrgTenant, organizationRequiredResponse } from "@/lib/services/tenants"

function sandboxError(error: unknown, set: { status?: number | string }) {
  if (error instanceof EventMutationLeaseError) {
    set.status = error.code === "event_busy" ? 409 : 503
    return {
      error: error.code === "event_busy"
        ? "This test event is already being made. Try again in a moment."
        : "Test event setup is not available right now. Try again.",
      code: error.code === "event_busy" ? "creation_in_progress" : error.code,
      retryable: true,
      committed: false,
    }
  }
  if (!(error instanceof TestEventSandboxError)) throw error
  set.status = error.code === "not_found"
    ? 404
    : error.code === "creation_conflict" || error.code === "not_test_event" || error.code === "creation_in_progress"
      ? 409
      : error.code === "invalid_creation_id" || error.code === "sandbox_limit_reached"
        ? 400
        : 500
  return {
    error: error.message,
    code: error.code,
    retryable: error.code === "creation_failed" || error.code === "conversion_failed" || error.code === "creation_in_progress",
    committed: false,
  }
}

async function authorizeOrganizer(
  hackathonId: string,
  tenantId: string,
  set: { status?: number | string },
) {
  const { checkHackathonOrganizer } = await import("@/lib/services/public-hackathons")
  const result = await checkHackathonOrganizer(hackathonId, tenantId)
  if (result.status === "ok") return true
  set.status = result.status === "not_found" ? 404 : 403
  return false
}

export const dashboardTestEventRoutes = new Elysia()
  .derive(async ({ request }) => ({ principal: await resolvePrincipal(request) }))
  .post(
    "/hackathons/test-event",
    async ({ principal, body, set }) => {
      requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])

      if (principal.kind === "user" && principal.orgRole !== "org:admin") {
        set.status = 403
        return {
          error: "Only organization admins can make test events.",
          code: "organization_admin_required",
          retryable: false,
          committed: false,
        }
      }
      if (
        principal.kind !== "api_key" &&
        (!body.expectedOrganizationId || !matchesExpectedOrganization(principal, body.expectedOrganizationId))
      ) {
        set.status = 409
        return {
          error: "Your active organization changed. Review it and try again.",
          code: "organization_context_changed",
          retryable: true,
          committed: false,
        }
      }
      if (!(await isOrgTenant(principal.tenantId))) {
        return organizationRequiredResponse()
      }

      const actorId = principal.kind === "user" ? principal.userId : principal.keyId
      const limit = await checkRateLimit(`test_event_create:${principal.kind}:${actorId}`, {
        maxRequests: 10,
        windowMs: 60 * 60 * 1000,
      }, { failureMode: "closed" })
      if (!limit.allowed) throw new RateLimitError(limit.resetAt, limit.remaining)

      try {
        const result = await withEventMutationLease(
          `test-event-tenant-${principal.tenantId}`,
          () => createTestEventSandbox(
            principal.tenantId,
            body.stage,
            body.creationId,
            body.timeZone,
          ),
        )
        if (!result.replayed) {
          await logAudit({
            principal,
            action: "hackathon.test_event_created",
            resourceType: "hackathon",
            resourceId: result.id,
            metadata: { stage: result.stage, counts: result.counts },
          })
        }
        return {
          ...result,
          committed: true,
          delivery: "suppressed" as const,
          message: result.replayed
            ? "Your test event is ready."
            : "Your test event is ready. Emails are off while it uses test data.",
        }
      } catch (error) {
        return sandboxError(error, set)
      }
    },
    {
      detail: {
        summary: "Create a test event with test data",
        description: "Makes one private test event in the active organization. It includes fake people and projects. Emails stay off. Requires hackathons:write scope.",
      },
      body: t.Object({
        creationId: t.String({ format: "uuid" }),
        stage: t.Union([
          t.Literal("registration"),
          t.Literal("hacking"),
          t.Literal("judging"),
          t.Literal("results"),
        ]),
        timeZone: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
        expectedOrganizationId: t.Optional(t.String({ minLength: 1, maxLength: 200 })),
      }),
    },
  )
  .post(
    "/hackathons/:id/convert-test-event",
    async ({ principal, params, body, set }) => {
      requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])
      if (principal.kind === "user" && principal.orgRole !== "org:admin") {
        set.status = 403
        return { error: "Only organization admins can make this a real event.", code: "organization_admin_required" }
      }
      if (
        principal.kind !== "api_key" &&
        (!body.expectedOrganizationId || !matchesExpectedOrganization(principal, body.expectedOrganizationId))
      ) {
        set.status = 409
        return { error: "Your active organization changed. Review it and try again.", code: "organization_context_changed" }
      }
      if (!(await authorizeOrganizer(params.id, principal.tenantId, set))) {
        return { error: set.status === 404 ? "Event not found." : "You can't change this event." }
      }

      let result: Awaited<ReturnType<typeof convertTestEventToDraft>>
      try {
        result = await withEventMutationLease(
          params.id,
          () => convertTestEventToDraft(principal.tenantId, params.id),
          principal.tenantId,
        )
      } catch (error) {
        return sandboxError(error, set)
      }

      let auditRecorded = true
      try {
        await logAudit({
          principal,
          action: "hackathon.test_event_converted",
          resourceType: "hackathon",
          resourceId: result.id,
          metadata: {
            removed: "everyone, all teams, projects, judges, invites, assignments, scores, and generated task history",
            retained: "event setup and custom organizer tasks",
          },
          critical: true,
        })
      } catch (error) {
        auditRecorded = false
        console.error(
          `Test event ${result.id} was converted, but its audit record failed:`,
          error,
        )
      }

      return {
        ...result,
        committed: true,
        auditRecorded,
        message: auditRecorded
          ? "Your setup is now a private draft. Add real people before you go live."
          : "Your setup is now a private draft. Add real people before you go live. The activity record needs a retry.",
      }
    },
    {
      detail: {
        summary: "Make a test event real",
        description: "Keeps event setup and custom tasks. Removes everyone, all teams, projects, judges, invites, scores, and generated task history. Returns the event to a private draft. Requires hackathons:write scope.",
      },
      body: t.Object({
        expectedOrganizationId: t.Optional(t.String({ minLength: 1, maxLength: 200 })),
      }),
    },
  )
