const BLOCKED_HOST_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /^127\./,
  /^0\.0\.0\.0$/,
  /^::1$/,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^fc[0-9a-f]{2}:/i,
  /^fd[0-9a-f]{2}:/i,
  /^fe80:/i,
  /^::ffff:/i,
]

// Known gap: validation runs against the hostname string before DNS
// resolution, so a public-looking hostname whose A record is later flipped
// to a private address can slip through (DNS rebinding). Fully closing this
// requires a custom resolver that fetches the IP and re-checks it against
// BLOCKED_HOST_PATTERNS. Acceptable for organizer-triggered exports of
// participant-controlled URLs in 2026; revisit if scope widens.
export function isAllowedDownloadUrl(rawUrl: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return false
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false
  const host = parsed.hostname.replace(/^\[|\]$/g, "")
  return !BLOCKED_HOST_PATTERNS.some((re) => re.test(host))
}
