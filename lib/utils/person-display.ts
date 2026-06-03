const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const CLERK_USER_ID_PATTERN = /^user_[A-Za-z0-9]+$/

export function isLikelyEmail(value: string | null | undefined): boolean {
  return EMAIL_PATTERN.test(value?.trim() ?? "")
}

export function isClerkUserId(value: string | null | undefined): boolean {
  return CLERK_USER_ID_PATTERN.test(value?.trim() ?? "")
}

export function nameFromEmail(email: string, fallback = "Unknown"): string {
  const localPart = email.trim().split("@")[0]?.split("+")[0] ?? ""
  const words = localPart
    .replace(/[._-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (words.length === 0) return fallback

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
  if (trimmedName && !isClerkUserId(trimmedName) && !isLikelyEmail(trimmedName)) {
    return trimmedName
  }

  const trimmedEmail = email?.trim()
  if (trimmedEmail && isLikelyEmail(trimmedEmail)) return trimmedEmail
  if (trimmedName && isLikelyEmail(trimmedName)) return trimmedName

  return fallback
}
