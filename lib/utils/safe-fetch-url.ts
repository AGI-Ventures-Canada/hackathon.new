// The ::ffff: pattern relies on URL parser normalisation: the WHATWG parser
// rewrites both ::ffff:127.0.0.1 and 0:0:0:0:0:ffff:7f00:1 into the canonical
// ::ffff:7f00:1 form before this regex runs. Keep the URL-parse step intact
// when editing — bypassing it would let the hex-group form slip past.
const BLOCKED_HOST_PATTERNS: RegExp[] = [
  /(^|\.)localhost\.?$/i,
  /(^|\.)local\.?$/i,
  /(^|\.)internal\.?$/i,
  /^host\.docker\.internal\.?$/i,
  /^kubernetes\.default\.svc\.?$/i,
  /^127\./,
  /^0\./,
  /^::$/,
  /^::1$/,
  /^10\./,
  /^100\.(6[4-9]|[78]\d|9\d|1[01]\d|12[0-7])\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^fc[0-9a-f]{2}:/i,
  /^fd[0-9a-f]{2}:/i,
  /^fe80:/i,
  /^::ffff:/i,
]

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

export function isAllowedHttpsUrl(rawUrl: string): boolean {
  return isAllowedDownloadUrl(rawUrl) && new URL(rawUrl).protocol === "https:"
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

export async function fetchAllowedUrl(
  rawUrl: string,
  init: RequestInit = {},
  options: { maxRedirects?: number; requireHttps?: boolean } = {}
): Promise<Response | null> {
  let currentUrl = rawUrl
  const maxRedirects = options.maxRedirects ?? 3

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    if (
      !isAllowedDownloadUrl(currentUrl) ||
      (options.requireHttps && new URL(currentUrl).protocol !== "https:")
    ) return null

    const response = await fetch(currentUrl, { ...init, redirect: "manual" })
    if (!REDIRECT_STATUSES.has(response.status)) return response

    const location = response.headers.get("location")
    await response.body?.cancel()
    if (!location || redirectCount === maxRedirects) return null

    try {
      currentUrl = new URL(location, currentUrl).toString()
    } catch {
      return null
    }
  }

  return null
}

export async function readResponseBytes(
  response: Response,
  maxBytes: number
): Promise<Uint8Array | null> {
  const contentLength = Number(response.headers.get("content-length"))
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    await response.body?.cancel()
    return null
  }

  if (!response.body) return new Uint8Array()

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      totalBytes += value.byteLength
      if (totalBytes > maxBytes) {
        await reader.cancel()
        return null
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const bytes = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

export async function readResponseText(
  response: Response,
  maxBytes: number
): Promise<string | null> {
  const bytes = await readResponseBytes(response, maxBytes)
  return bytes ? new TextDecoder().decode(bytes) : null
}
