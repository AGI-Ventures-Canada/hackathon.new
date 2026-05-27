export function formatDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date
  return d.toISOString().split("T")[0]
}

export function formatDateTime(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date
  return d.toISOString().replace("T", " ").slice(0, 19)
}

export function formatDateRange(
  startsAt: string | null,
  endsAt: string | null
): string {
  if (!startsAt) return "Dates TBD"

  const start = new Date(startsAt)
  const opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  }

  if (!endsAt) return start.toLocaleDateString("en-US", opts)

  const end = new Date(endsAt)

  if (
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth()
  ) {
    if (start.getDate() === end.getDate()) {
      return start.toLocaleDateString("en-US", opts)
    }
    return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${end.getDate()}, ${end.getFullYear()}`
  }

  return `${start.toLocaleDateString("en-US", opts)} – ${end.toLocaleDateString("en-US", opts)}`
}

export function formatDateTimeDisplay(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date
  const dateOpts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  }
  const timeOpts: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
  }
  const dateStr = d.toLocaleDateString("en-US", dateOpts)
  const timeStr = d.toLocaleTimeString("en-US", timeOpts)
  return `${dateStr} at ${timeStr}`
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return ""
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function sortByStartDate<T extends { starts_at: string | null }>(
  items: T[],
  descending = false
): T[] {
  return [...items].sort((a, b) => {
    if (!a.starts_at && !b.starts_at) return 0
    if (!a.starts_at) return 1
    if (!b.starts_at) return -1
    const diff = new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
    return descending ? -diff : diff
  })
}
