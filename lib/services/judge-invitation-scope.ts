import type { SupabaseClient } from "@supabase/supabase-js"
import { supabase as getSupabase } from "@/lib/db/client"
import { isValidUuid } from "@/lib/utils/uuid"

export type JudgeInvitationScope = { message?: string; prizeIds?: string[]; roomIds?: string[] }

export async function validateJudgeInvitationScope(hackathonId: string, scope: JudgeInvitationScope): Promise<void> {
  const client = getSupabase() as unknown as SupabaseClient
  for (const [table, ids] of [["prizes", scope.prizeIds], ["rooms", scope.roomIds]] as const) {
    if (!ids?.length) continue
    if (ids.length > 20 || ids.some((id) => !isValidUuid(id))) throw new Error("Choose valid prizes and rooms.")
    const { data, error } = await client.from(table).select("id").eq("hackathon_id", hackathonId).in("id", ids)
    if (error || new Set(data?.map((row) => row.id)).size !== new Set(ids).size) throw new Error("A chosen prize or room isn't in this event.")
  }
  if ((scope.message?.length ?? 0) > 1000) throw new Error("Keep your message under 1,000 characters.")
}

export async function applyJudgeInvitationScope(hackathonId: string, participantId: string, scope: JudgeInvitationScope): Promise<void> {
  await validateJudgeInvitationScope(hackathonId, scope)
  const client = getSupabase() as unknown as SupabaseClient
  if (scope.prizeIds?.length) {
    for (const prizeId of scope.prizeIds) {
      const { error } = await client.rpc("set_judge_prize_scope_membership", { p_hackathon_id: hackathonId, p_prize_id: prizeId, p_judge_id: participantId })
      if (error) throw new Error("Could not save the judge's prizes.")
    }
  }
  if (scope.roomIds?.length) {
    const { addJudgeToRoom } = await import("@/lib/services/rooms")
    for (const roomId of scope.roomIds) {
      const added = await addJudgeToRoom(roomId, hackathonId, participantId)
      if (!added.ok) throw new Error("Could not save the judge's rooms.")
    }
  }
  const ready = await client.from("hackathon_participants").update({ judging_scope_ready: true }).eq("id", participantId).eq("hackathon_id", hackathonId).eq("role", "judge")
  if (ready.error) throw new Error("Could not finish setting up this judge.")
}

export async function reconcileAcceptedJudgeInvitationScopes(limit = 20): Promise<{ failed: number }> {
  const client = getSupabase() as unknown as SupabaseClient
  const { data, error } = await client.from("judge_invitations").select("id,hackathon_id,accepted_by_clerk_user_id,requested_prize_ids,requested_room_ids,delivery_fail_count,hackathons!inner(status)").eq("status", "accepted").is("scope_applied_at", null).lt("delivery_fail_count", 5).or(`delivery_next_attempt_at.is.null,delivery_next_attempt_at.lte.${new Date().toISOString()}`).not("hackathons.status", "in", "(completed,archived)").order("updated_at").limit(limit)
  if (error) throw new Error("Could not load accepted judging invitations.")
  let failed = 0
  for (const invitation of data ?? []) {
    try {
    const participant = await client.from("hackathon_participants").select("id").eq("hackathon_id", invitation.hackathon_id).eq("clerk_user_id", invitation.accepted_by_clerk_user_id).eq("role", "judge").maybeSingle()
    if (participant.error) throw new Error("Could not find the accepted judge.")
    if (!participant.data) continue
    await applyJudgeInvitationScope(invitation.hackathon_id, participant.data.id, { prizeIds: invitation.requested_prize_ids, roomIds: invitation.requested_room_ids })
    const saved = await client.from("judge_invitations").update({ scope_applied_at: new Date().toISOString() }).eq("id", invitation.id)
    if (saved.error) throw new Error("Could not save the accepted judge's scope.")
    } catch {
      failed++
      const attempt = (invitation.delivery_fail_count ?? 0) + 1
      const saved = await client.from("judge_invitations").update({ delivery_fail_count: attempt, delivery_last_error: "Could not save this judge's prizes or rooms. Check the judging settings.", delivery_next_attempt_at: new Date(Date.now() + Math.min(60, 5 * 2 ** (attempt - 1)) * 60_000).toISOString() }).eq("id", invitation.id)
      if (saved.error) throw new Error("Could not record judge scope recovery.")
    }
  }
  return { failed }
}
