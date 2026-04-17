export function formatPrizeValue(value: string): string {
  const stripped = value.replace(/^\$/, "")
  const num = Number(stripped.replace(/,/g, ""))
  if (!Number.isNaN(num) && Number.isFinite(num)) {
    return `$${num.toLocaleString("en-US")}`
  }
  return stripped.startsWith("$") ? stripped : `$${stripped}`
}
