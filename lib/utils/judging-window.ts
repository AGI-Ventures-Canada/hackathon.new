export type JudgingWindowEvent = {
  judging_opens_at?: string | null
  judging_closes_at?: string | null
  judging_timezone?: string | null
}

export type JudgingWindowRound = {
  opens_at?: string | null
  closes_at?: string | null
}

export type JudgingWindow = {
  opensAt: string | null
  closesAt: string | null
  state: "unscheduled" | "upcoming" | "open" | "closed" | "invalid"
  inherited: boolean
}

export function resolveJudgingWindow(
  event: JudgingWindowEvent,
  round?: JudgingWindowRound | null,
  now: Date = new Date(),
): JudgingWindow {
  const overridden = !!(round?.opens_at || round?.closes_at)
  const opensAt = (overridden ? round?.opens_at : event.judging_opens_at) ?? null
  const closesAt = (overridden ? round?.closes_at : event.judging_closes_at) ?? null
  const base = { opensAt, closesAt, inherited: !overridden }
  if (!opensAt && !closesAt) return { ...base, state: "unscheduled" }
  const opens = opensAt ? Date.parse(opensAt) : NaN
  const closes = closesAt ? Date.parse(closesAt) : NaN
  if (!Number.isFinite(opens) || !Number.isFinite(closes) || closes <= opens) {
    return { ...base, state: "invalid" }
  }
  return {
    ...base,
    state: now.getTime() < opens ? "upcoming" : now.getTime() >= closes ? "closed" : "open",
  }
}

export function canWriteJudgingWindow(
  event: JudgingWindowEvent,
  round?: JudgingWindowRound | null,
  now?: Date,
): boolean {
  return ["unscheduled", "open"].includes(resolveJudgingWindow(event, round, now).state)
}

export function isValidJudgingTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format()
    return true
  } catch {
    return false
  }
}

export function validateJudgingSchedule(input: {
  opensAt: string | null
  closesAt: string | null
  timezone?: string
}): string | null {
  if (input.timezone && !isValidJudgingTimeZone(input.timezone)) return "Choose a valid time zone."
  const window = resolveJudgingWindow({ judging_opens_at: input.opensAt, judging_closes_at: input.closesAt })
  return window.state === "invalid" ? "Choose an opening time and a later deadline." : null
}

export function getJudgeNotificationDisposition(event: JudgingWindowEvent & {
  status: string
  is_test_event?: boolean
  results_published_at?: string | null
  starts_at?: string | null
  ends_at?: string | null
}): "send" | "queue" | "reject" {
  if (["completed", "archived"].includes(event.status) || event.results_published_at) return "reject"
  if (event.is_test_event || event.status === "draft") return "queue"
  const window = resolveJudgingWindow(event)
  if (window.state === "closed" || window.state === "invalid") return "reject"
  return "send"
}
