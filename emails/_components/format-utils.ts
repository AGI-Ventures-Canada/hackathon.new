export function formatPrizeValue(value: string): string {
  const stripped = value.replace(/^\$/, "")
  const num = Number(stripped.replace(/,/g, ""))
  if (!Number.isNaN(num) && Number.isFinite(num)) {
    return `$${num.toLocaleString("en-US")}`
  }
  return stripped.startsWith("$") ? stripped : `$${stripped}`
}

export const SUMMARY_LIMIT = 160

export function truncate(text: string, limit: number = SUMMARY_LIMIT): string {
  const trimmed = text.trim()
  if (trimmed.length <= limit) return trimmed
  return `${trimmed.slice(0, limit - 1).trimEnd()}…`
}
