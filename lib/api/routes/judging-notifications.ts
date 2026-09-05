import { Elysia, t } from "elysia"
import type { SupabaseClient } from "@supabase/supabase-js"
import { resolvePrincipal, requirePrincipal, AuthError } from "@/lib/auth/principal"
import type { Principal } from "@/lib/auth/types"
import { supabase as getSupabase } from "@/lib/db/client"
import { isValidUuid } from "@/lib/utils/uuid"
import { checkHackathonOrganizer } from "@/lib/services/public-hackathons"
import { getJudgingInbox, updateJudgingNotificationPreferences, markJudgingNotificationRead } from "@/lib/services/judging-notifications"
import { checkRateLimit } from "@/lib/services/rate-limit"
import { logAudit } from "@/lib/services/audit"
import { createHash } from "node:crypto"
import { withDeliveryLease } from "@/lib/services/delivery-lease"
import type { JudgeInvitationScope } from "@/lib/services/judge-invitation-scope"
import { logJudgingDatabaseError } from "@/lib/services/judging-diagnostics"

async function requireInboxAccess(principal: Principal, hackathonId: string): Promise<string> {
  requirePrincipal(principal, ["user"])
  if (!isValidUuid(hackathonId)) throw new AuthError("Not found", 404)
  const organizer = await checkHackathonOrganizer(hackathonId, principal.tenantId)
  if (organizer.status === "ok") return principal.userId
  const { data, error } = await (getSupabase() as unknown as SupabaseClient).from("hackathon_participants").select("id").eq("hackathon_id", hackathonId).eq("clerk_user_id", principal.userId).in("role", ["judge", "organizer"]).maybeSingle()
  if (error || !data) throw new AuthError("Not found", 404)
  return principal.userId
}

const batchBody = t.Object({ emails: t.Array(t.String({ maxLength: 254 }), { minItems: 1, maxItems: 20 }), preview: t.Optional(t.Boolean()), retryFailed: t.Optional(t.Boolean()), requestKey: t.Optional(t.String({ format: "uuid" })), message: t.Optional(t.String({ maxLength: 1000 })), prizeIds: t.Optional(t.Array(t.String({ format: "uuid" }), { maxItems: 20 })), roomIds: t.Optional(t.Array(t.String({ format: "uuid" }), { maxItems: 20 })) })

async function runBatch(principal: Principal, hackathonId: string, body: { emails: string[]; preview?: boolean; requestKey?: string; retryFailed?: boolean } & JudgeInvitationScope, action: "invite" | "remind") {
  requirePrincipal(principal, ["user", "api_key"], ["hackathons:write"])
  if (!isValidUuid(hackathonId)) throw new AuthError("Not found", 404)
  const access = await checkHackathonOrganizer(hackathonId, principal.tenantId)
  if (access.status !== "ok") throw new AuthError("Not found", 404)
  const { processJudgeInvitationBatch } = await import("@/lib/services/judging-invite-batch")
  const actorId = principal.kind === "api_key" ? "api" : principal.userId
  const batchActor = principal.kind === "api_key" ? principal.keyId : principal.userId
  const payloadHash = createHash("sha256").update(JSON.stringify({ action, retryFailed: body.retryFailed, emails: body.emails, message: body.message, prizeIds: body.prizeIds, roomIds: body.roomIds })).digest("hex")
  if (!body.preview && !body.requestKey) throw new AuthError("Include a request key before sending invitations.", 400)
  if (!body.preview) {
    const limited = await checkRateLimit(`judge-batch:${hackathonId}:${batchActor}`, { maxRequests: 10, windowMs: 3_600_000 }, { failureMode: "closed" })
    if (!limited.allowed) throw new AuthError("Too many invitation batches. Try again later.", 429)
  }
  let inviterName = "The event organizer"
  if (principal.kind !== "api_key") {
    const { clerkClient } = await import("@clerk/nextjs/server")
    const user = await (await clerkClient()).users.getUser(principal.userId)
    inviterName = [user.firstName, user.lastName].filter(Boolean).join(" ") || inviterName
  }
  const run = async () => {
    const client = getSupabase() as unknown as SupabaseClient
    if (!body.preview) {
      const previous = await client.from("judging_invitation_batches").select("payload_hash,response").eq("hackathon_id", hackathonId).eq("actor_id", batchActor).eq("request_key", body.requestKey).maybeSingle()
      if (previous.error) {
        logJudgingDatabaseError("invitation_batch_read", previous.error)
        throw new Error("Could not check the invitation batch.")
      }
      if (previous.data && previous.data.payload_hash !== payloadHash) throw new AuthError("Use a new request key when changing the batch.", 409)
      if (previous.data?.response) return previous.data.response
      const saved = await client.from("judging_invitation_batches").upsert({ hackathon_id: hackathonId, actor_id: batchActor, request_key: body.requestKey, payload_hash: payloadHash }, { onConflict: "hackathon_id,actor_id,request_key", ignoreDuplicates: true })
      if (saved.error) {
        logJudgingDatabaseError("invitation_batch_claim", saved.error)
        throw new Error("Could not save the invitation batch.")
      }
    }
    const result = await processJudgeInvitationBatch({ event: access.hackathon, emails: body.emails, actorId, inviterName, preview: body.preview === true, retryFailed: body.retryFailed, action, message: body.message, prizeIds: body.prizeIds, roomIds: body.roomIds })
    if (!body.preview) {
      const saved = await client.from("judging_invitation_batches").update({ response: result }).eq("hackathon_id", hackathonId).eq("actor_id", batchActor).eq("request_key", body.requestKey)
      if (saved.error) {
        logJudgingDatabaseError("invitation_batch_results", saved.error)
        throw new Error("Could not save the invitation batch results.")
      }
      await logAudit({ principal, action: action === "invite" ? "judge.invited" : "judge_invitation.reminded", resourceType: "hackathon", resourceId: hackathonId, metadata: { batch: true, outcomes: result.results.map(({ outcome, delivery }) => ({ outcome, delivery })) } })
    }
    return result
  }
  if (body.preview) return run()
  const result = await withDeliveryLease(`judge-invite-batch:${hackathonId}:${batchActor}:${body.requestKey}`, run)
  if (!result.acquired) throw new AuthError("This batch is being sent. Try again in a moment.", 409)
  return result.value
}

export const judgingNotificationRoutes = new Elysia()
  .derive(async ({ request }) => ({ principal: await resolvePrincipal(request) }))
  .get("/hackathons/:id/judging/notifications", async ({ principal, params }) => getJudgingInbox(params.id, await requireInboxAccess(principal, params.id)))
  .patch("/hackathons/:id/judging/notification-preferences", async ({ principal, params, body }) => updateJudgingNotificationPreferences(params.id, await requireInboxAccess(principal, params.id), body), {
    body: t.Object({ email_enabled: t.Optional(t.Boolean()), in_app_enabled: t.Optional(t.Boolean()), daily_digest: t.Optional(t.Boolean()), timezone: t.Optional(t.Union([t.String({ maxLength: 100 }), t.Null()])), quiet_start: t.Optional(t.Integer({ minimum: 0, maximum: 23 })), quiet_end: t.Optional(t.Integer({ minimum: 0, maximum: 23 })) }),
  })
  .post("/hackathons/:id/judging/notifications/:notificationId/read", async ({ principal, params }) => {
    const userId = await requireInboxAccess(principal, params.id)
    if (!isValidUuid(params.notificationId)) throw new AuthError("Not found", 404)
    await markJudgingNotificationRead(params.id, userId, params.notificationId)
    return { success: true }
  })
  .post("/hackathons/:id/judging/judges/batch", async ({ principal, params, body }) => runBatch(principal, params.id, body, "invite"), { body: batchBody })
  .post("/hackathons/:id/judging/judges/remind", async ({ principal, params, body }) => runBatch(principal, params.id, body, "remind"), { body: batchBody })

export const judgeInvitationPublicRoutes = new Elysia()
  .post("/judge-invitations/:token/unsubscribe", async ({ params }) => {
    if (!/^[A-Za-z0-9_-]{32,120}$/.test(params.token)) return { success: true }
    const { error } = await (getSupabase() as unknown as SupabaseClient).from("judge_invitations").update({ reminders_stopped_at: new Date().toISOString() }).eq("token", params.token).eq("status", "pending")
    if (error) throw new Error("Could not stop these reminders. Please try again.")
    return { success: true }
  })
