"use step"

import type {
  HackathonStatus,
  JudgePendingNotification,
} from "@/lib/db/hackathon-types"
import { getJudgeNotificationDisposition as getNotificationDisposition } from "@/lib/utils/judging-window"
import type { SupabaseClient } from "@supabase/supabase-js"

const JUDGE_NOTIFICATION_CLAIM_MS = 5 * 60 * 1000

type ClaimedJudgeNotification = JudgePendingNotification & {
  requested_prize_ids?: string[]
  requested_room_ids?: string[]
  scope_applied_at?: string | null
  hackathons: {
    name: string
    slug: string
    status: HackathonStatus
    starts_at: string | null
    ends_at: string | null
    judging_opens_at?: string | null
    judging_closes_at?: string | null
    judging_timezone?: string | null
    results_published_at?: string | null
    is_test_event: boolean
  }
  participant: { role: string }
}

export async function fetchPendingNotifications(
  hackathonId: string
): Promise<JudgePendingNotification[]> {
  const { supabase: getSupabase } = await import("@/lib/db/client")
  const client = getSupabase() as unknown as SupabaseClient

  const { data, error } = await client
    .from("judge_pending_notifications")
    .select("id, hackathon_id, participant_id, email, added_by_name, sent_at, fail_count, last_error, next_attempt_at, created_at, updated_at")
    .eq("hackathon_id", hackathonId)
    .is("sent_at", null)

  if (error) {
    throw new Error(`Failed to fetch pending notifications: ${error.message}`)
  }

  return (data as JudgePendingNotification[]) ?? []
}

export type SendNotificationInput = {
  notification: JudgePendingNotification
  hackathonName: string
  hackathonSlug: string
  hackathonStartsAt?: string | null
  hackathonEndsAt?: string | null
  hackathonTimezone?: string | null
}

export async function sendJudgeNotification(
  input: SendNotificationInput,
): Promise<{ sent: boolean }> {
  const { sendJudgeAddedNotification } = await import("@/lib/email/judge-invitations")
  const { supabase: getSupabase } = await import("@/lib/db/client")
  const client = getSupabase() as unknown as SupabaseClient
  const claimedAt = new Date()
  const claimedAtIso = claimedAt.toISOString()
  const claimUntil = new Date(
    claimedAt.getTime() + JUDGE_NOTIFICATION_CLAIM_MS,
  ).toISOString()

  const claimResult = await client
    .from("judge_pending_notifications")
    .update({ next_attempt_at: claimUntil, updated_at: claimedAtIso })
    .eq("id", input.notification.id)
    .eq("hackathon_id", input.notification.hackathon_id)
    .eq("participant_id", input.notification.participant_id)
    .is("sent_at", null)
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${claimedAtIso}`)
    .select("id, hackathon_id, participant_id, email, added_by_name, sent_at, fail_count, last_error, next_attempt_at, created_at, updated_at, requested_prize_ids, requested_room_ids, scope_applied_at, hackathons!inner(name, slug, status, starts_at, ends_at, judging_opens_at, judging_closes_at, judging_timezone, results_published_at, is_test_event), participant:hackathon_participants!inner(role)")
    .maybeSingle()

  if (claimResult.error) {
    throw new Error(
      `Failed to claim notification ${input.notification.id}: ${claimResult.error.message}`,
    )
  }

  const current = claimResult.data as unknown as ClaimedJudgeNotification | null
  if (!current) return { sent: false }

  if (
    current.participant.role !== "judge" ||
    getNotificationDisposition(current.hackathons) !== "send"
  ) {
    const releaseResult = await client
      .from("judge_pending_notifications")
      .update({ next_attempt_at: null, updated_at: new Date().toISOString() })
      .eq("id", current.id)
      .eq("next_attempt_at", claimUntil)
      .is("sent_at", null)
    if (releaseResult.error) {
      throw new Error(
        `Failed to release notification ${current.id}: ${releaseResult.error.message}`,
      )
    }
    return { sent: false }
  }

  if (!current.scope_applied_at && (current.requested_prize_ids?.length || current.requested_room_ids?.length)) {
    const { applyJudgeInvitationScope } = await import("@/lib/services/judge-invitation-scope")
    await applyJudgeInvitationScope(current.hackathon_id, current.participant_id, { prizeIds: current.requested_prize_ids, roomIds: current.requested_room_ids })
    const saved = await client.from("judge_pending_notifications").update({ scope_applied_at: new Date().toISOString() }).eq("id", current.id)
    if (saved.error) throw new Error("Could not finish setting up the judge.")
  }
  const result = await sendJudgeAddedNotification({
    to: current.email,
    deliveryId: current.participant_id,
    hackathonName: current.hackathons.name,
    hackathonSlug: current.hackathons.slug,
    addedByName: current.added_by_name,
    hackathonStartsAt: current.hackathons.judging_opens_at ?? current.hackathons.starts_at,
    hackathonEndsAt: current.hackathons.judging_closes_at ?? current.hackathons.ends_at,
    hackathonTimezone: current.hackathons.judging_timezone ?? input.hackathonTimezone,
  })

  if (!result.success) {
    throw new Error(`Failed to send judge notification ${current.id}`)
  }

  const sentAt = new Date().toISOString()
  const sentResult = await client
    .from("judge_pending_notifications")
    .update({
      sent_at: sentAt,
      last_error: null,
      next_attempt_at: null,
      updated_at: sentAt,
    })
    .eq("id", current.id)
    .eq("next_attempt_at", claimUntil)
    .is("sent_at", null)
    .select("id")
    .maybeSingle()

  if (sentResult.error) {
    throw new Error(
      `Failed to mark notification ${current.id} as sent: ${sentResult.error.message}`,
    )
  }

  return { sent: true }
}
