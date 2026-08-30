import { Elysia, t } from "elysia"
import { resolvePrincipal, requirePrincipal } from "@/lib/auth/principal"
import { logAudit } from "@/lib/services/audit"
import {
  createOrganizerCustomActionItem,
  deleteOrganizerCustomActionItem,
  getOrganizerTaskBoard,
  importLegacyOrganizerActionState,
  OrganizerActionItemError,
  setOrganizerActionItemState,
} from "@/lib/services/organizer-action-items"
import type { ActionSeverity } from "@/lib/utils/organizer-actions"

function actionError(error: unknown, set: { status?: number | string }) {
  if (!(error instanceof OrganizerActionItemError)) throw error
  if (
    error.code === "action_not_found" ||
    error.code === "custom_action_not_found"
  ) {
    set.status = 404
  } else if (error.code === "stale_action") {
    set.status = 409
  } else if (error.code === "custom_action_limit_reached") {
    set.status = 409
  } else if (error.code === "task_board_unavailable") {
    set.status = 503
  } else {
    set.status = 400
  }
  return { error: error.message, code: error.code }
}

async function authorizeOrganizer(
  hackathonId: string,
  tenantId: string,
  set: { status?: number | string },
) {
  const { checkHackathonOrganizer } = await import(
    "@/lib/services/public-hackathons"
  )
  const result = await checkHackathonOrganizer(hackathonId, tenantId)
  if (result.status === "ok") return true
  set.status = result.status === "not_found" ? 404 : 403
  return false
}

function actorId(principal: { kind: string; userId?: string; keyId?: string }) {
  return principal.kind === "user" ? principal.userId ?? null : principal.keyId ?? null
}

export const dashboardOrganizerActionRoutes = new Elysia()
  .derive(async ({ request }) => ({ principal: await resolvePrincipal(request) }))
  .get(
    "/hackathons/:id/action-items",
    async ({ principal, params, query, set }) => {
      requirePrincipal(principal, ["user", "api_key"], ["hackathons:read"])
      if (!(await authorizeOrganizer(params.id, principal.tenantId, set))) {
        return { error: set.status === 404 ? "Not found" : "Not authorized" }
      }
      try {
        return await getOrganizerTaskBoard(params.id, {
          offset: query.offset,
          limit: query.limit,
          state: query.state,
        })
      } catch (error) {
        return actionError(error, set)
      }
    },
    {
      detail: {
        summary: "List organizer tasks",
        description:
          "Lists the shared organizer task board with stable task references and pagination. Requires hackathons:read scope.",
      },
      query: t.Object({
        offset: t.Optional(t.Numeric({ minimum: 0 })),
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: 50 })),
        state: t.Optional(
          t.Union([
            t.Literal("all"),
            t.Literal("pending"),
            t.Literal("completed"),
            t.Literal("dismissed"),
          ]),
        ),
      }),
    },
  )
  .post(
    "/hackathons/:id/action-items",
    async ({ principal, params, body, set }) => {
      requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])
      if (!(await authorizeOrganizer(params.id, principal.tenantId, set))) {
        return { error: set.status === 404 ? "Not found" : "Not authorized" }
      }
      try {
        const task = await createOrganizerCustomActionItem(
          params.id,
          body.label,
          (body.severity ?? "info") as ActionSeverity,
          actorId(principal),
          body.taskRef,
        )
        await logAudit({
          principal,
          action: "organizer_task.created",
          resourceType: "organizer_task",
          resourceId: task.taskRef,
          metadata: { hackathonId: params.id, severity: task.severity },
        })
        return { task }
      } catch (error) {
        return actionError(error, set)
      }
    },
    {
      detail: {
        summary: "Add organizer task",
        description:
          "Adds one shared custom task. Supplying the same taskRef makes retries safe. Requires hackathons:write scope.",
      },
      body: t.Object({
        label: t.String({ minLength: 1, maxLength: 200 }),
        severity: t.Optional(
          t.Union([
            t.Literal("urgent"),
            t.Literal("warning"),
            t.Literal("scheduled"),
            t.Literal("info"),
          ], { default: "info" }),
        ),
        taskRef: t.Optional(
          t.String({ minLength: 8, maxLength: 160, pattern: "^custom-[A-Za-z0-9_-]+$" }),
        ),
      }),
    },
  )
  .post(
    "/hackathons/:id/action-items/import",
    async ({ principal, params, body, set }) => {
      requirePrincipal(principal, ["user"], ["hackathons:write"])
      if (!(await authorizeOrganizer(params.id, principal.tenantId, set))) {
        return { error: set.status === 404 ? "Not found" : "Not authorized" }
      }
      const imported = await importLegacyOrganizerActionState(
        params.id,
        body,
        actorId(principal),
      )
      await logAudit({
        principal,
        action: "organizer_task.updated",
        resourceType: "organizer_task_board",
        resourceId: params.id,
        metadata: { source: "legacy_browser_state", ...imported },
      })
      return { success: true, imported }
    },
    {
      detail: {
        summary: "Import saved browser tasks",
        description:
          "Moves the organizer's older browser-only task state into the shared board. Clerk-only.",
      },
      body: t.Object({
        completedIds: t.Array(t.String({ minLength: 1, maxLength: 160 }), { maxItems: 200 }),
        dismissedIds: t.Array(t.String({ minLength: 1, maxLength: 160 }), { maxItems: 200 }),
        customItems: t.Array(
          t.Object({
            id: t.String({ minLength: 8, maxLength: 160 }),
            label: t.String({ minLength: 1, maxLength: 200 }),
            severity: t.Union([
              t.Literal("urgent"),
              t.Literal("warning"),
              t.Literal("scheduled"),
              t.Literal("info"),
            ]),
          }),
          { maxItems: 100 },
        ),
        completedSnapshots: t.Record(t.String({ minLength: 1, maxLength: 160 }), t.Unknown()),
      }),
    },
  )
  .patch(
    "/hackathons/:id/action-items/:actionId",
    async ({ principal, params, body, set }) => {
      requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])
      if (!(await authorizeOrganizer(params.id, principal.tenantId, set))) {
        return { error: set.status === 404 ? "Not found" : "Not authorized" }
      }
      try {
        const task = await setOrganizerActionItemState(
          params.id,
          params.actionId,
          body.state,
          actorId(principal),
          body.expectedUpdatedAt,
        )
        await logAudit({
          principal,
          action: "organizer_task.updated",
          resourceType: "organizer_task",
          resourceId: task.taskRef,
          metadata: { hackathonId: params.id, state: body.state },
        })
        return { task }
      } catch (error) {
        return actionError(error, set)
      }
    },
    {
      detail: {
        summary: "Update organizer task",
        description:
          "Completes, reopens, or dismisses a task when its completion policy allows it. Requires hackathons:write scope.",
      },
      body: t.Object({
        state: t.Union([
          t.Literal("pending"),
          t.Literal("completed"),
          t.Literal("dismissed"),
        ]),
        expectedUpdatedAt: t.Optional(t.String({ format: "date-time" })),
      }),
    },
  )
  .delete(
    "/hackathons/:id/action-items/:actionId",
    async ({ principal, params, query, set }) => {
      requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])
      if (!(await authorizeOrganizer(params.id, principal.tenantId, set))) {
        return { error: set.status === 404 ? "Not found" : "Not authorized" }
      }
      try {
        await deleteOrganizerCustomActionItem(
          params.id,
          params.actionId,
          query.expectedUpdatedAt,
        )
        await logAudit({
          principal,
          action: "organizer_task.deleted",
          resourceType: "organizer_task",
          resourceId: params.actionId,
          metadata: { hackathonId: params.id },
        })
        return { success: true }
      } catch (error) {
        return actionError(error, set)
      }
    },
    {
      detail: {
        summary: "Remove custom organizer task",
        description:
          "Removes one shared custom task. Generated event tasks cannot be removed. Requires hackathons:write scope.",
      },
      query: t.Object({
        expectedUpdatedAt: t.Optional(t.String({ format: "date-time" })),
      }),
    },
  )
