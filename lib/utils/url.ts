const MAX_SAFE_REDIRECT_URL_LENGTH = 8_192

export function safeRedirectUrl(
  url: string | string[] | undefined,
  fallback = "/home",
): string {
  const candidate = Array.isArray(url) ? url[0] : url
  if (!candidate || candidate.length > MAX_SAFE_REDIRECT_URL_LENGTH) return fallback
  if (!candidate.startsWith("/") || candidate.startsWith("//")) return fallback
  if (candidate.includes("\\") || /[\u0000-\u001f\u007f]/.test(candidate)) return fallback

  try {
    const base = new URL("https://redirect.invalid")
    const parsed = new URL(candidate, base)
    if (parsed.origin !== base.origin) return fallback
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return fallback
  }
}

export const urlInputProps = {
  type: "text",
  inputMode: "url",
  autoCapitalize: "none",
  spellCheck: false,
} as const

export function normalizeUrl(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return trimmed
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

export function normalizeUrlFieldValue(input: string): string {
  return normalizeUrl(input)
}

export function normalizeOptionalUrl(
  input: string | null | undefined
): string | null | undefined {
  if (input === undefined || input === null) {
    return input
  }

  const normalized = normalizeUrlFieldValue(input)
  return normalized || null
}

export function isHttpsUrlWithoutCredentials(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl)
    return url.protocol === "https:" && !url.username && !url.password
  } catch {
    return false
  }
}

export function normalizeImportUrl(input: string): string | null {
  const normalized = normalizeUrl(input)
  if (normalized.length > 2_048 || !isSafeExternalUrl(normalized)) return null
  return normalized
}

export function redactImportSourceUrl(input: string): string | null {
  const normalized = normalizeUrl(input)
  if (normalized.length > 2_048) return null
  try {
    const url = new URL(normalized)
    url.username = ""
    url.password = ""
    url.search = ""
    url.hash = ""
    if (!isSafeExternalUrl(url.toString())) return null
    const redacted = decodeURI(url.toString())
    if (/[\u0000-\u001f\u007f]/.test(redacted)) return null
    return redacted.length <= 2_048 ? redacted : null
  } catch {
    return null
  }
}

export function isSafeExternalUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`)

    if (url.protocol !== "https:") return false
    if (url.username || url.password) return false

    // URL constructor wraps IPv6 in brackets: new URL("https://[::1]/").hostname === "[::1]"
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "")

    if (hostname === "localhost" || hostname === "0.0.0.0") return false

    if (hostname.includes(":")) {
      // IPv6 loopback
      if (hostname === "::1") return false
      // IPv6 link-local: fe80::/10 (fe80 – febf)
      if (/^fe[89ab][0-9a-f]/i.test(hostname)) return false
      // IPv6 unique-local: fc00::/7 (fc__ and fd__)
      if (/^f[cd][0-9a-f]{2}/i.test(hostname)) return false
    }

    const octets = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
    if (octets) {
      const [a, b] = [Number(octets[1]), Number(octets[2])]
      if (a === 127) return false
      if (a === 10) return false
      if (a === 172 && b >= 16 && b <= 31) return false
      if (a === 192 && b === 168) return false
      if (a === 169 && b === 254) return false
      if (a === 100 && b >= 64 && b <= 127) return false
    }

    return true
  } catch {
    return false
  }
}
