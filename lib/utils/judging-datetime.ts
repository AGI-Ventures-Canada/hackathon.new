export function judgingLocalTime(instant: string | null, timezone: string): string {
  if (!instant) return ""
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant))
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ""
  return `${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}`
}

export function judgingInstant(local: string, timezone: string): string | null {
  if (!local) return null
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) throw new Error("Choose a date and time.")
  const desired = Date.parse(`${local}:00Z`)
  let candidate = desired
  for (let attempt = 0; attempt < 4; attempt++) {
    const shown = judgingLocalTime(new Date(candidate).toISOString(), timezone)
    if (shown === local) return new Date(candidate).toISOString()
    candidate += desired - Date.parse(`${shown}:00Z`)
  }
  throw new Error("This time is skipped when the clocks change. Choose a later time.")
}

export function formatJudgingTime(instant: string | null, timezone: string) {
  return instant
    ? new Intl.DateTimeFormat("en", {
        timeZone: timezone,
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(instant))
    : "Not set"
}
