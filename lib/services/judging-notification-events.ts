import { isValidUuid } from "@/lib/utils/uuid"

export async function reconcileJudgingAfterMutation(hackathonId: string): Promise<void> {
  if (!isValidUuid(hackathonId)) return
  try {
    const { reconcileJudgingNotifications } = await import("@/lib/services/judging-notifications")
    await reconcileJudgingNotifications(hackathonId)
  } catch {
    console.error("Judging was saved; inbox updates will retry on the next notification run.")
  }
}

export async function reconcileJudgingAfterRoundMutation(roundId: string): Promise<void> {
  if (!isValidUuid(roundId)) return
  try {
    const { supabase } = await import("@/lib/db/client")
    const { data, error } = await supabase().from("judging_rounds").select("hackathon_id").eq("id", roundId).maybeSingle()
    if (error) throw error
    if (data?.hackathon_id) await reconcileJudgingAfterMutation(data.hackathon_id)
  } catch {
    console.error("Judging round was saved; inbox updates will retry on the next notification run.")
  }
}
