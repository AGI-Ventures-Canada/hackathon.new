export type ReminderCategory =
  | "judge_judging" | "organizer_judging" | "participant_event" | "organizer_event"
  | "team_invitation" | "judge_invitation" | "prize_claim" | "organizer_fulfillment" | "feedback"

export type ReminderEvent = {
  status: string
  starts_at?: string | null
  ends_at?: string | null
  is_test_event?: boolean
  results_published_at?: string | null
  judging_opens_at?: string | null
  judging_closes_at?: string | null
}

const DAY = 86_400_000
const timestamp = (value?: string | null) => value ? Date.parse(value) : NaN

export function reminderCutoff(
  event: ReminderEvent,
  category: ReminderCategory,
  round?: { opens_at?: string | null; closes_at?: string | null } | null,
): number {
  if (event.is_test_event || ["draft", "archived"].includes(event.status)) return NaN
  if (["prize_claim", "organizer_fulfillment", "feedback"].includes(category)) {
    const publication = timestamp(event.results_published_at)
    return event.status === "completed" && Number.isFinite(publication) ? publication + 14 * DAY : NaN
  }
  if (event.status === "completed" || event.results_published_at) return NaN
  if (["judge_judging", "organizer_judging", "judge_invitation"].includes(category)) {
    const overridden = !!(round?.opens_at || round?.closes_at)
    const opens = timestamp(overridden ? round?.opens_at : event.judging_opens_at)
    const closes = timestamp(overridden ? round?.closes_at : event.judging_closes_at)
    if (overridden || event.judging_opens_at || event.judging_closes_at) {
      return Number.isFinite(opens) && closes > opens
        ? closes + (category === "organizer_judging" ? DAY : 0)
        : NaN
    }
  }
  const ends = timestamp(event.ends_at)
  if (event.ends_at) return ends
  const starts = timestamp(event.starts_at)
  return Number.isFinite(starts) ? starts + DAY : NaN
}

export function reminderIsCurrent(event: ReminderEvent, category: ReminderCategory, now = new Date(), round?: Parameters<typeof reminderCutoff>[2]): boolean {
  const cutoff = reminderCutoff(event, category, round)
  return Number.isFinite(cutoff) && now.getTime() < cutoff
}
