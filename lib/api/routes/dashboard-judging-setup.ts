import { Elysia, t } from "elysia"
import { requirePrincipal, resolvePrincipal } from "@/lib/auth/principal"
import { checkHackathonOrganizer } from "@/lib/services/public-hackathons"
import {
  applyJudgingDistribution,
  getJudgingDistributionPreview,
} from "@/lib/services/judging-distribution"
import { checkRateLimit, RateLimitError } from "@/lib/services/rate-limit"
import { logAudit } from "@/lib/services/audit"
import type { Principal } from "@/lib/auth/types"

const optionalDate = t.Optional(t.Nullable(t.String({ format: "date-time" })))
const settingsSchema = t.Object(
  {
    opensAt: optionalDate,
    closesAt: optionalDate,
    timezone: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
    instructions: t.Optional(t.String({ maxLength: 5000 })),
    browseEnabled: t.Optional(t.Boolean()),
    targetReviewsPerProject: t.Optional(t.Integer({ minimum: 1, maximum: 20 })),
    remindersEnabled: t.Optional(t.Boolean()),
  },
  { additionalProperties: false },
)

async function authorize(principal: Principal, id: string, write: boolean) {
  requirePrincipal(principal, ["user", "api_key"], [write ? "hackathons:write" : "hackathons:read"])
  const auth = await checkHackathonOrganizer(id, principal.tenantId)
  if (auth.status !== "ok")
    return Response.json(
      { error: auth.status === "not_found" ? "Event not found." : "You can't manage this event." },
      { status: auth.status === "not_found" ? 404 : 403 },
    )
  if (write) {
    const limit = await checkRateLimit(`judging-setup:${principal.tenantId}:${id}`)
    if (!limit.allowed) throw new RateLimitError(limit.resetAt, limit.remaining)
  }
  return null
}

async function setupFailure(error: unknown) {
  const { JudgingSetupError } = await import("@/lib/services/judging-setup")
  if (error instanceof JudgingSetupError)
    return Response.json(
      { error: error.message, code: error.code },
      {
        status:
          error.code === "not_found"
            ? 404
            : error.code === "invalid_input"
              ? 400
              : error.code === "unavailable"
                ? 503
                : 409,
      },
    )
  throw error
}

export const dashboardJudgingSetupRoutes = new Elysia()
  .derive(async ({ request }) => ({ principal: await resolvePrincipal(request) }))
  .get(
    "/hackathons/:id/judging/setup",
    async ({ params, principal }) => {
      const denied = await authorize(principal, params.id, false)
      if (denied) return denied
      try {
        const { getJudgingSetup } = await import("@/lib/services/judging-setup")
        return { setup: await getJudgingSetup(params.id) }
      } catch (error) {
        return setupFailure(error)
      }
    },
    {
      detail: {
        summary: "Inspect judging setup",
        description:
          "Get prizes, effective scorecards, judging dates, judges, invitations, progress, and specific readiness issues.",
      },
    },
  )
  .patch(
    "/hackathons/:id/judging/setup",
    async ({ params, principal, body }) => {
      requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])
      const denied = await authorize(principal, params.id, true)
      if (denied) return denied
      try {
        const { configureJudgingSetup } = await import("@/lib/services/judging-setup")
        const setup = await configureJudgingSetup(params.id, body)
        await logAudit({
          principal,
          action: "hackathon.updated",
          resourceType: "hackathon",
          resourceId: params.id,
          metadata: { starter: body.applyStarter ?? false },
        })
        return { setup }
      } catch (error) {
        return setupFailure(error)
      }
    },
    {
      body: t.Object(
        {
          expectedVersion: t.String({
            format: "date-time",
            description: "The version returned by judging setup.",
          }),
          requestKey: t.String({
            minLength: 1,
            maxLength: 200,
            description: "Reuse this key when retrying the same change.",
          }),
          settings: t.Optional(settingsSchema),
          applyStarter: t.Optional(t.Boolean()),
          starterPrizeName: t.Optional(t.String({ minLength: 1, maxLength: 200 })),
        },
        { additionalProperties: false },
      ),
      detail: {
        summary: "Configure judging",
        description:
          "Save judging dates, instructions and preferences, or explicitly apply the starter scorecard. Preserves existing scoring and rejects stale changes.",
      },
    },
  )
  .post(
    "/hackathons/:id/judging/distribution/preview",
    async ({ params, principal, body }) => {
      const denied = await authorize(principal, params.id, false)
      if (denied) return denied
      return { preview: await getJudgingDistributionPreview(params.id, body) }
    },
    {
      body: t.Object({
        targetReviewsPerProject: t.Optional(t.Integer({ minimum: 1, maximum: 20 })),
      }),
      detail: {
        summary: "Preview judging assignments",
        description:
          "Preview balanced project assignments, each judge's workload, and remaining coverage gaps without saving.",
      },
    },
  )
  .post(
    "/hackathons/:id/judging/distribution/apply",
    async ({ params, principal, body }) => {
      requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])
      const denied = await authorize(principal, params.id, true)
      if (denied) return denied
      try {
        const result = await applyJudgingDistribution(params.id, body)
        await logAudit({
          principal,
          action: "judging.auto_assigned",
          resourceType: "hackathon",
          resourceId: params.id,
          metadata: {
            createdAssignments: result.createdAssignments,
            createdCoverage: result.createdCoverage,
          },
        })
        const { reconcileJudgingNotifications } =
          await import("@/lib/services/judging-notifications")
        await reconcileJudgingNotifications(params.id).catch(() => {
          console.error("Judging notification reconciliation failed; cron will retry.")
        })
        return result
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "judging_uncovered")
          return Response.json({ error: error.message, code: "judging_uncovered" }, { status: 409 })
        if (error instanceof Error && /changed|locked|request key/i.test(error.message))
          return Response.json(
            { error: "Judging changed. Preview the assignments again.", code: "judging_changed" },
            { status: 409 },
          )
        throw error
      }
    },
    {
      body: t.Object(
        {
          targetReviewsPerProject: t.Integer({ minimum: 1, maximum: 20 }),
          expectedVersion: t.String({ minLength: 1, maxLength: 200 }),
          requestKey: t.String({ minLength: 8, maxLength: 100 }),
        },
        { additionalProperties: false },
      ),
      detail: {
        summary: "Assign judging projects",
        description:
          "Apply a reviewed distribution without deleting existing reviews. A version check and durable request key prevent stale or duplicate assignments.",
      },
    },
  )
