import type { SupabaseClient } from "@supabase/supabase-js"
import { supabase as getSupabase } from "@/lib/db/client"
import { getJudgeNotificationDisposition, type JudgingWindowEvent } from "@/lib/utils/judging-window"
import { applyJudgeInvitationScope, validateJudgeInvitationScope, type JudgeInvitationScope } from "@/lib/services/judge-invitation-scope"
import { withDeliveryLease } from "@/lib/services/delivery-lease"
import { createJudgeInvitation, createJudgePendingNotification, hasPendingJudgeEntry, markJudgeInvitationEmailed, remindJudgeInvitation, releaseJudgeInvitationReminderClaim, recordJudgeInvitationDeliveryFailure, sendPendingJudgeInvitationEmails } from "@/lib/services/judge-invitations"

export type JudgeBatchResult = { email: string; outcome: "ready" | "added" | "invited" | "already_judge" | "already_invited" | "invalid" | "cooldown" | "blocked" | "failed" | "reminded"; delivery?: "sent" | "queued" | "failed"; message: string }
type Event = JudgingWindowEvent & { id: string; name: string; slug: string; status: string; is_test_event: boolean; starts_at: string | null; ends_at: string | null }
export function normalizeJudgeBatchEmails(emails: string[]): string[] {
  return [...new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean))]
}

export async function processJudgeInvitationBatch(input: { event: Event; emails: string[]; actorId: string; inviterName: string; preview: boolean; action?: "invite" | "remind"; retryFailed?: boolean } & JudgeInvitationScope): Promise<{ results: JudgeBatchResult[]; preview: boolean }> {
  await validateJudgeInvitationScope(input.event.id, input)
  const emails = normalizeJudgeBatchEmails(input.emails)
  if (emails.length > 20) throw new Error("Invite up to 20 judges at a time.")
  const { clerkClient } = await import("@clerk/nextjs/server")
  const clerk = await clerkClient()
  const client = getSupabase() as unknown as SupabaseClient
  const disposition = getJudgeNotificationDisposition(input.event)
  const results: JudgeBatchResult[] = []
  for (const email of emails) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      results.push({ email, outcome: "invalid", message: "Enter a valid email address." })
      continue
    }
    if (disposition === "reject" || (input.action === "remind" && disposition === "queue")) {
      results.push({ email, outcome: "blocked", message: disposition === "queue" ? "Go live before sending reminders." : "Judging has closed. Extend the deadline before inviting judges." })
      continue
    }
    try {
      const execute = async (): Promise<JudgeBatchResult> => {
        if (input.action === "remind") {
          const { data: invitation, error } = await client.from("judge_invitations").select("id,reminded_at,expires_at,reminders_stopped_at").eq("hackathon_id", input.event.id).eq("email", email).eq("status", "pending").maybeSingle()
          if (error) throw new Error("Could not check this invitation.")
          if (!invitation) {
            const users = await clerk.users.getUserList({ emailAddress: [email], limit: 1 })
            const user = users.data[0]
            if (!user) return { email, outcome: "blocked", message: "There isn't an open invitation for this email." }
            const { queueJudgeWorkReminder } = await import("@/lib/services/judging-notifications")
            return { email, ...await queueJudgeWorkReminder(input.event.id, user.id, input.preview) }
          }
          if (Date.parse(invitation.expires_at) <= Date.now() || invitation.reminders_stopped_at) return { email, outcome: "blocked", message: "This invitation is closed or reminders are turned off." }
          if (invitation.reminded_at && Date.now() - Date.parse(invitation.reminded_at) < 24 * 3_600_000) return { email, outcome: "cooldown", message: "Wait a day before reminding this judge again." }
          if (input.preview) return { email, outcome: "ready", message: "Send an invitation reminder." }
          const claim = await remindJudgeInvitation(invitation.id, input.event.id)
          if (!claim.success) return { email, outcome: claim.code === "reminder_cooldown" ? "cooldown" : "blocked", message: claim.error }
          const { sendJudgeInvitationReminderEmail } = await import("@/lib/email/judge-invitations")
          const sent = await sendJudgeInvitationReminderEmail({ to: email, hackathonName: input.event.name, inviterName: input.inviterName, inviteToken: claim.invitation.token, expiresAt: claim.invitation.expires_at, hackathonSlug: input.event.slug, hackathonStartsAt: input.event.judging_opens_at ?? input.event.starts_at, hackathonEndsAt: input.event.judging_closes_at ?? input.event.ends_at, hackathonTimezone: input.event.judging_timezone, deliveryId: `${claim.invitation.id}/manual/${claim.invitation.reminded_at}` }).catch(() => ({ success: false }))
          if (!sent.success) {
            if (claim.invitation.reminded_at) await releaseJudgeInvitationReminderClaim(claim.invitation.id, claim.invitation.reminded_at)
            return { email, outcome: "failed", delivery: "failed", message: "The reminder couldn't be sent. Try again." }
          }
          const { cancelUpcomingReminder } = await import("@/lib/services/smart-reminders")
          await cancelUpcomingReminder("judge_invitation", invitation.id, 24 * 3_600_000)
          return { email, outcome: "reminded", delivery: "sent", message: "Reminder sent." }
        }
        const users = await clerk.users.getUserList({ emailAddress: [email], limit: 1 })
        const user = users.data[0]
        const participantResult = user ? await client.from("hackathon_participants").select("id,role,judging_scope_ready").eq("hackathon_id", input.event.id).eq("clerk_user_id", user.id).maybeSingle() : { data: null, error: null }
        if (participantResult.error) throw new Error("Could not check this judge.")
        if (participantResult.data?.role === "judge") {
          if (input.retryFailed && participantResult.data.judging_scope_ready === false) {
            if (input.preview) return { email, outcome: "ready", message: "Finish setting up this judge's prizes and rooms." }
            const savedScope = await client.from("judge_pending_notifications").select("requested_prize_ids,requested_room_ids").eq("hackathon_id", input.event.id).eq("participant_id", participantResult.data.id).maybeSingle()
            if (savedScope.error) throw new Error("Could not find this judge's saved scope.")
            const scope = savedScope.data ? { prizeIds: savedScope.data.requested_prize_ids, roomIds: savedScope.data.requested_room_ids } : input
            await createJudgePendingNotification(input.event.id, participantResult.data.id, email, input.inviterName, undefined, scope)
            await applyJudgeInvitationScope(input.event.id, participantResult.data.id, scope)
            return { email, outcome: "added", delivery: "queued", message: "Judge setup finished. Their email is queued." }
          }
          return { email, outcome: "already_judge", message: "This person is already a judge." }
        }
        if (input.retryFailed) {
          const previous = await client.from("judge_invitations").select("id,emailed_at,delivery_fail_count,delivery_last_error").eq("hackathon_id", input.event.id).eq("email", email).in("status", ["pending", "expired"]).is("emailed_at", null).maybeSingle()
          if (previous.error) throw new Error("Could not check this invitation's delivery.")
          if (previous.data && (previous.data.delivery_fail_count > 0 || previous.data.delivery_last_error)) {
            if (input.preview) return { email, outcome: "ready", message: "Retry this saved invitation." }
            const reset = await client.from("judge_invitations").update({ delivery_fail_count: 0, delivery_next_attempt_at: null }).eq("id", previous.data.id).is("emailed_at", null)
            if (reset.error) throw new Error("Could not queue the invitation retry.")
            const delivery = await sendPendingJudgeInvitationEmails(input.event.id, input.event.name, input.inviterName, { onlyEmail: email }, 1)
            return { email, outcome: "invited", delivery: delivery.sent ? "sent" : delivery.failedEmails.length ? "failed" : "queued", message: delivery.sent ? "Invitation sent." : delivery.failedEmails.length ? "The invitation couldn't be sent. Try again." : "Invitation queued." }
          }
        }
        if (await hasPendingJudgeEntry(input.event.id, email)) return { email, outcome: "already_invited", message: "An invitation is already waiting for this person." }
        if (user) {
          const { checkRoleConflict } = await import("@/lib/services/role-conflict")
          const role = await checkRoleConflict(input.event.id, user.id, "judge")
          if (role.conflict) return { email, outcome: "blocked", message: role.error }
        }
        if (input.preview) return { email, outcome: "ready", message: participantResult.data ? "Add this person as a judge." : disposition === "queue" ? "Save an invitation to send when the event goes live." : user ? "Invite this account to judge this event." : "Invite a new person. They can create an account when they accept." }
        if (participantResult.data && user) {
          const { addJudge } = await import("@/lib/services/judging")
          const added = await addJudge(input.event.id, user.id, { requireExistingParticipant: true, scopePending: !!(input.prizeIds?.length || input.roomIds?.length) })
          if (!added.success) return { email, outcome: "blocked", message: added.error }
          await createJudgePendingNotification(input.event.id, added.participant.id, email, input.inviterName, undefined, input)
          await applyJudgeInvitationScope(input.event.id, added.participant.id, input).catch(() => {})
          return { email, outcome: "added", delivery: "queued", message: disposition === "queue" ? "Judge added. We'll notify them when the event goes live." : "Judge added. Their email is queued." }
        }
        const created = await createJudgeInvitation({ hackathonId: input.event.id, email, invitedByClerkUserId: input.actorId, message: input.message, prizeIds: input.prizeIds, roomIds: input.roomIds })
        if (!created.success) return { email, outcome: "blocked", message: created.error }
        if (disposition === "queue") return { email, outcome: "invited", delivery: "queued", message: "Invitation saved. We'll send it when the event goes live." }
        const { sendJudgeInvitationEmail } = await import("@/lib/email/judge-invitations")
        const sent = await sendJudgeInvitationEmail({ to: email, hackathonName: input.event.name, inviterName: input.inviterName, inviteToken: created.invitation.token, expiresAt: created.invitation.expires_at, hackathonSlug: input.event.slug, hackathonStartsAt: input.event.judging_opens_at ?? input.event.starts_at, hackathonEndsAt: input.event.judging_closes_at ?? input.event.ends_at, hackathonTimezone: input.event.judging_timezone, deliveryId: created.invitation.id, personalMessage: input.message }).catch(() => ({ success: false }))
        if (!sent.success) {
          await recordJudgeInvitationDeliveryFailure(created.invitation.id)
          return { email, outcome: "invited", delivery: "failed", message: "Invitation saved. Delivery failed; we'll retry it." }
        }
        await markJudgeInvitationEmailed(created.invitation.id)
        const { scheduleReminders } = await import("@/lib/services/smart-reminders")
        await scheduleReminders("judge_invitation", created.invitation.id, input.event.id, "invitation_reminder", new Date(created.invitation.created_at), new Date(created.invitation.expires_at), { email, hackathonName: input.event.name, inviterName: input.inviterName, inviteToken: created.invitation.token, expiresAt: created.invitation.expires_at, hackathonSlug: input.event.slug, hackathonTimezone: input.event.judging_timezone })
        return { email, outcome: "invited", delivery: "sent", message: "Invitation sent." }
      }
      if (input.preview) results.push(await execute())
      else {
        const { sha256Fingerprint } = await import("@/lib/utils/hash")
        const outcome = await withDeliveryLease(`judge-batch:${input.event.id}:${await sha256Fingerprint(email)}`, execute)
        results.push(outcome.acquired ? outcome.value : { email, outcome: "blocked", message: "This invitation is being updated. Try again in a moment." })
      }
    } catch {
      results.push({ email, outcome: "failed", message: "We couldn't finish this invitation. Check its status before trying again." })
    }
  }
  return { results, preview: input.preview }
}
