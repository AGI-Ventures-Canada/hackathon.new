export const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/

export function sanitizeIsoTimestamp(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  if (!ISO_TIMESTAMP_PATTERN.test(trimmed)) return null
  if (Number.isNaN(Date.parse(trimmed))) return null
  return trimmed
}
