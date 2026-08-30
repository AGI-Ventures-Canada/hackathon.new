"use step"

import type {
  HackathonStatus,
  JudgePendingNotification,
} from "@/lib/db/hackathon-types"
import { getNotificationDisposition } from "@/lib/utils/notification-lifecycle"
import type { SupabaseClient } from "@supabase/supabase-js"

const JUDGE_NOTIFICATION_CLAIM_MS = 5 * 60 * 1000

type ClaimedJudgeNotification = JudgePendingNotification & {
  hackathons: {
    name: string
    slug: string
    status: HackathonStatus
    starts_at: string | null
    ends_at: string | null
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
    .select("id, hackathon_id, participant_id, email, added_by_name, sent_at, fail_count, last_error, next_attempt_at, created_at, updated_at, hackathons!inner(name, slug, status, starts_at, ends_at, is_test_event), participant:hackathon_participants!inner(role)")
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

  const result = await sendJudgeAddedNotification({
    to: current.email,
    deliveryId: current.participant_id,
    hackathonName: current.hackathons.name,
    hackathonSlug: current.hackathons.slug,
    addedByName: current.added_by_name,
    hackathonStartsAt: current.hackathons.starts_at,
    hackathonEndsAt: current.hackathons.ends_at,
    hackathonTimezone: input.hackathonTimezone,
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
