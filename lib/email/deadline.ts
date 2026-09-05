export function formatEmailDeadline(value: string, timeZone = "UTC"): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime()))
    return "Check the event page for the latest time"
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(date)
  } catch {
    timeZone = "UTC"
  }
  return date.toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  })
}
