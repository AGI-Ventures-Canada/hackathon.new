"use step"

import type { JudgePendingNotification } from "@/lib/db/hackathon-types"
import type { SupabaseClient } from "@supabase/supabase-js"

export async function fetchPendingNotifications(
  hackathonId: string
): Promise<JudgePendingNotification[]> {
  const { supabase: getSupabase } = await import("@/lib/db/client")
  const client = getSupabase() as unknown as SupabaseClient

  const { data, error } = await client
    .from("judge_pending_notifications")
    .select("id, hackathon_id, participant_id, email, added_by_name, sent_at, created_at")
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
}

export async function sendJudgeNotification(input: SendNotificationInput): Promise<void> {
  const { sendJudgeAddedNotification } = await import("@/lib/email/judge-invitations")
  const { supabase: getSupabase } = await import("@/lib/db/client")

  const result = await sendJudgeAddedNotification({
    to: input.notification.email,
    deliveryId: input.notification.id,
    hackathonName: input.hackathonName,
    hackathonSlug: input.hackathonSlug,
    addedByName: input.notification.added_by_name,
  })

  if (!result.success) {
    throw new Error(`Failed to send judge notification ${input.notification.id}`)
  }

  const client = getSupabase() as unknown as SupabaseClient
  const { error } = await client
    .from("judge_pending_notifications")
    .update({ sent_at: new Date().toISOString() })
    .eq("id", input.notification.id)

  if (error) {
    throw new Error(`Failed to mark notification ${input.notification.id} as sent: ${error.message}`)
  }
}
