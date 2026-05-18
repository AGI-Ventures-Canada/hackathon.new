const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isLikelyEmail(value: string | null | undefined): boolean {
  return EMAIL_PATTERN.test(value?.trim() ?? "")
}

export function nameFromEmail(email: string): string {
  const localPart = email.trim().split("@")[0]?.split("+")[0] ?? ""
  const words = localPart
    .replace(/[._-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (words.length === 0) return "Judge"

  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

export function getDisplayName({
  name,
  email,
  fallback = "Unknown person",
}: {
  name?: string | null
  email?: string | null
  fallback?: string
}): string {
  const trimmedName = name?.trim()
  if (trimmedName) {
    return isLikelyEmail(trimmedName) ? nameFromEmail(trimmedName) : trimmedName
  }

  const trimmedEmail = email?.trim()
  if (trimmedEmail) return nameFromEmail(trimmedEmail)

  return fallback
}
