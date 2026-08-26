const MAX_SAFE_REDIRECT_URL_LENGTH = 8_192
const MAX_IMPORT_URL_LENGTH = 2_048

const BLOCKED_EXTERNAL_HOST_PATTERNS = [
  /(^|\.)localhost\.?$/i,
  /(^|\.)local\.?$/i,
  /(^|\.)internal\.?$/i,
  /^host\.docker\.internal\.?$/i,
  /^kubernetes\.default\.svc\.?$/i,
]

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
  const url = parseSafeExternalUrl(input)
  if (url === null || url.href.length > MAX_IMPORT_URL_LENGTH) return null
  return url.href
}

export function redactImportSourceUrl(input: string): string | null {
  const normalized = normalizeExternalUrlInput(input)
  if (normalized === null || normalized.length > MAX_IMPORT_URL_LENGTH) return null
  try {
    const url = new URL(normalized)
    url.username = ""
    url.password = ""
    url.search = ""
    url.hash = ""
    if (!isSafeExternalUrl(url.toString())) return null
    const redacted = decodeURI(url.toString())
    if (/[\u0000-\u001f\u007f]/.test(redacted)) return null
    return redacted.length <= MAX_IMPORT_URL_LENGTH ? redacted : null
  } catch {
    return null
  }
}

function isPrivateIpv4Hostname(hostname: string): boolean {
  const octets = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (octets === null) return false

  const [a, b, c] = [Number(octets[1]), Number(octets[2]), Number(octets[3])]
  return a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
}

function isPrivateIpv6Hostname(hostname: string): boolean {
  return hostname === "::" ||
    hostname === "::1" ||
    hostname.startsWith("::ffff:") ||
    /^f[cd][0-9a-f]{2}/i.test(hostname) ||
    /^fe[89ab][0-9a-f]/i.test(hostname) ||
    /^ff[0-9a-f]{2}/i.test(hostname)
}

function normalizeExternalUrlInput(rawUrl: string): string | null {
  const trimmed = rawUrl.trim()
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
  if (hasScheme && !/^https?:\/\//i.test(trimmed)) return null
  if (trimmed.startsWith("//") || trimmed.includes("\\")) return null

  const normalized = normalizeUrl(trimmed)
  if (!normalized || /[\u0000-\u001f\u007f]/.test(normalized)) return null
  return normalized
}

function parseSafeExternalUrl(rawUrl: string): URL | null {
  const normalized = normalizeExternalUrlInput(rawUrl)
  if (normalized === null) return null

  try {
    const url = new URL(normalized)

    if (url.protocol !== "https:") return null
    if (url.username || url.password) return null

    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "")

    if (BLOCKED_EXTERNAL_HOST_PATTERNS.some((pattern) => pattern.test(hostname))) return null
    if (hostname.includes(":") && isPrivateIpv6Hostname(hostname)) return null
    if (isPrivateIpv4Hostname(hostname)) return null

    return url
  } catch {
    return null
  }
}

export function isSafeExternalUrl(rawUrl: string): boolean {
  return parseSafeExternalUrl(rawUrl) !== null
}
