import { lookup as lookupDns } from "node:dns/promises"
import type { LookupAddress } from "node:dns"
import { isIP } from "node:net"
import type { Dispatcher } from "undici"

const BLOCKED_HOST_PATTERNS: RegExp[] = [
  /(^|\.)localhost\.?$/i,
  /(^|\.)local\.?$/i,
  /(^|\.)internal\.?$/i,
  /^host\.docker\.internal\.?$/i,
  /^kubernetes\.default\.svc\.?$/i,
]

const BLOCKED_IPV4_RANGES = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.31.196.0", 24],
  ["192.52.193.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["192.175.48.0", 24],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const

const BLOCKED_IPV6_RANGES = [
  ["::", 96],
  ["::ffff:0:0", 96],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["2620:4f:8000::", 48],
  ["3fff::", 20],
  ["5f00::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
] as const

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
const DEFAULT_TIMEOUT_MS = 10_000
const MAX_TIMEOUT_MS = 15_000
const MAX_REDIRECTS = 5

type DnsLookup = (
  hostname: string,
  options: { all: true; verbatim: true }
) => Promise<LookupAddress[]>

type FetchAllowedUrlOptions = {
  maxRedirects?: number
  requireHttps?: boolean
  timeoutMs?: number
  lookup?: DnsLookup
}

type ResolvedAddress = {
  address: string
  family: 4 | 6
}

function parseIpv4(address: string): Uint8Array | null {
  const parts = address.split(".")
  if (parts.length !== 4) return null

  const bytes = new Uint8Array(4)
  for (const [index, part] of parts.entries()) {
    if (!/^\d{1,3}$/.test(part)) return null
    const octet = Number(part)
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null
    bytes[index] = octet
  }
  return bytes
}

function parseIpv6(address: string): Uint8Array | null {
  let normalized = address.toLowerCase()
  const zoneIndex = normalized.indexOf("%")
  if (zoneIndex !== -1) normalized = normalized.slice(0, zoneIndex)

  const ipv4Tail = normalized.match(/(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/)?.[1]
  if (ipv4Tail) {
    const ipv4 = parseIpv4(ipv4Tail)
    if (ipv4 === null) return null
    const high = (ipv4[0] * 256 + ipv4[1]).toString(16)
    const low = (ipv4[2] * 256 + ipv4[3]).toString(16)
    normalized = `${normalized.slice(0, -ipv4Tail.length)}${high}:${low}`
  }

  if ((normalized.match(/::/g) ?? []).length > 1) return null
  const hasCompression = normalized.includes("::")
  const [leftRaw, rightRaw = ""] = normalized.split("::")
  const left = leftRaw ? leftRaw.split(":") : []
  const right = rightRaw ? rightRaw.split(":") : []
  const missing = 8 - left.length - right.length

  if ((!hasCompression && missing !== 0) || (hasCompression && missing < 1)) {
    return null
  }

  const groups = hasCompression
    ? [...left, ...Array.from({ length: missing }, () => "0"), ...right]
    : left
  if (groups.length !== 8) return null

  const bytes = new Uint8Array(16)
  for (const [index, group] of groups.entries()) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null
    const value = Number.parseInt(group, 16)
    bytes[index * 2] = value >> 8
    bytes[index * 2 + 1] = value & 0xff
  }
  return bytes
}

function isInCidr(value: Uint8Array, base: Uint8Array, prefixLength: number): boolean {
  if (value.length !== base.length) return false
  const wholeBytes = Math.floor(prefixLength / 8)
  for (let index = 0; index < wholeBytes; index += 1) {
    if (value[index] !== base[index]) return false
  }

  const remainingBits = prefixLength % 8
  if (remainingBits === 0) return true
  const mask = (0xff << (8 - remainingBits)) & 0xff
  return (value[wholeBytes] & mask) === (base[wholeBytes] & mask)
}

function isPublicIpAddress(address: string): boolean {
  const normalized = address.replace(/^\[|\]$/g, "")
  const family = isIP(normalized)

  if (family === 4) {
    const value = parseIpv4(normalized)
    if (value === null) return false
    return !BLOCKED_IPV4_RANGES.some(([base, prefix]) => {
      const baseValue = parseIpv4(base)
      return baseValue !== null && isInCidr(value, baseValue, prefix)
    })
  }

  if (family === 6) {
    const value = parseIpv6(normalized)
    if (value === null) return false
    return !BLOCKED_IPV6_RANGES.some(([base, prefix]) => {
      const baseValue = parseIpv6(base)
      return baseValue !== null && isInCidr(value, baseValue, prefix)
    })
  }

  return false
}

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "")
  return BLOCKED_HOST_PATTERNS.some((pattern) => pattern.test(host))
}

export function isAllowedDownloadUrl(rawUrl: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return false
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false
  if (parsed.username || parsed.password) return false

  const hostname = parsed.hostname.replace(/^\[|\]$/g, "")
  if (isBlockedHostname(hostname)) return false

  const family = isIP(hostname)
  return family === 0 || isPublicIpAddress(hostname)
}

export function isAllowedHttpsUrl(rawUrl: string): boolean {
  return isAllowedDownloadUrl(rawUrl) && new URL(rawUrl).protocol === "https:"
}

export function redactUrlForLogs(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "[redacted URL]"
    }
    return `${parsed.origin}/[redacted]`
  } catch {
    return "[invalid URL]"
  }
}

export function redactFetchErrorForLogs(
  error: unknown,
  sensitiveUrls: string[] = []
): { name: string; message: string } {
  const name = error instanceof Error ? error.name : "Error"
  let message = error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : "The remote request failed"

  for (const url of sensitiveUrls) {
    message = message.replaceAll(url, redactUrlForLogs(url))
  }
  message = message.replace(/https?:\/\/[^\s<>"']+/gi, (url) => redactUrlForLogs(url))
  message = message.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, 1_000)

  return { name, message: message || "The remote request failed" }
}

async function resolvePublicAddress(
  hostname: string,
  lookup: DnsLookup
): Promise<ResolvedAddress | null> {
  const host = hostname.replace(/^\[|\]$/g, "")
  const directFamily = isIP(host)
  if (directFamily !== 0) {
    if (!isPublicIpAddress(host)) return null
    return { address: host, family: directFamily as 4 | 6 }
  }

  let addresses: LookupAddress[]
  try {
    addresses = await lookup(host, { all: true, verbatim: true })
  } catch {
    return null
  }

  if (addresses.length === 0) return null
  const normalized: ResolvedAddress[] = []
  for (const result of addresses) {
    const actualFamily = isIP(result.address)
    if (
      (actualFamily !== 4 && actualFamily !== 6) ||
      actualFamily !== result.family ||
      !isPublicIpAddress(result.address)
    ) {
      return null
    }
    normalized.push({ address: result.address, family: actualFamily })
  }

  return normalized.find((result) => result.family === 4) ?? normalized[0] ?? null
}

function comparableIpAddress(address: string): { family: 4 | 6; value: Uint8Array } | null {
  const normalized = address.replace(/^\[|\]$/g, "")
  const family = isIP(normalized)
  if (family === 4) {
    const value = parseIpv4(normalized)
    return value === null ? null : { family, value }
  }
  if (family === 6) {
    const value = parseIpv6(normalized)
    if (value === null) return null
    const isIpv4Mapped = value.slice(0, 10).every((byte) => byte === 0) &&
      value[10] === 0xff && value[11] === 0xff
    if (isIpv4Mapped) {
      return { family: 4, value: value.slice(12) }
    }
    return { family, value }
  }
  return null
}

function isSameIpAddress(left: string, right: string): boolean {
  const parsedLeft = comparableIpAddress(left)
  const parsedRight = comparableIpAddress(right)
  return parsedLeft !== null && parsedRight !== null &&
    parsedLeft.family === parsedRight.family &&
    parsedLeft.value.length === parsedRight.value.length &&
    parsedLeft.value.every((byte, index) => byte === parsedRight.value[index])
}

async function createPinnedDispatcher(
  hostname: string,
  resolved: ResolvedAddress
): Promise<Dispatcher> {
  const { Agent, buildConnector } = await import("undici/index.js")
  const connector = buildConnector({})
  const tlsServername = isIP(hostname) === 0 ? hostname : undefined

  return new Agent({
    connect(options, callback) {
      connector({
        ...options,
        host: resolved.address,
        hostname: resolved.address,
        servername: tlsServername,
      }, (error, socket) => {
        if (error) {
          callback(error, null)
          return
        }
        if (!socket?.remoteAddress ||
          !isPublicIpAddress(socket.remoteAddress) ||
          !isSameIpAddress(socket.remoteAddress, resolved.address)) {
          socket?.destroy()
          callback(new Error("Blocked remote address"), null)
          return
        }
        callback(null, socket)
      })
    },
  })
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(maximum, Math.max(minimum, Math.floor(value as number)))
}

function stripSensitiveRedirectHeaders(headers: Headers): Headers {
  const safeHeaders = new Headers(headers)
  safeHeaders.delete("authorization")
  safeHeaders.delete("cookie")
  safeHeaders.delete("proxy-authorization")
  return safeHeaders
}

export async function fetchAllowedUrl(
  rawUrl: string,
  init: RequestInit = {},
  options: FetchAllowedUrlOptions = {}
): Promise<Response | null> {
  const method = (init.method ?? "GET").toUpperCase()
  if ((method !== "GET" && method !== "HEAD") || init.body !== undefined) return null

  const maxRedirects = boundedInteger(options.maxRedirects, 3, 0, MAX_REDIRECTS)
  const timeoutMs = boundedInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS, 100, MAX_TIMEOUT_MS)
  const requireHttps = options.requireHttps ?? true
  const timeoutSignal = AbortSignal.timeout(timeoutMs)
  const signal = init.signal
    ? AbortSignal.any([init.signal, timeoutSignal])
    : timeoutSignal
  const lookup = options.lookup ?? lookupDns as DnsLookup
  let currentUrl = rawUrl
  let currentHeaders = stripSensitiveRedirectHeaders(new Headers(init.headers))

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    if (!isAllowedDownloadUrl(currentUrl)) return null

    const parsed = new URL(currentUrl)
    if (requireHttps && parsed.protocol !== "https:") return null
    parsed.hash = ""

    const resolved = await resolvePublicAddress(parsed.hostname, lookup)
    if (!resolved) return null

    const dispatcher = await createPinnedDispatcher(
      parsed.hostname.replace(/^\[|\]$/g, ""),
      resolved
    )

    let response: Response
    try {
      response = await fetch(parsed.toString(), {
        ...init,
        headers: currentHeaders,
        credentials: "omit",
        redirect: "manual",
        signal,
        dispatcher,
      } as RequestInit & { dispatcher: Dispatcher })
    } catch (error) {
      const destroy = error instanceof Error
        ? dispatcher.destroy(error)
        : dispatcher.destroy()
      await destroy.catch(() => {})
      throw error
    }
    void dispatcher.close().catch(() => {})

    if (!REDIRECT_STATUSES.has(response.status)) return response

    const location = response.headers.get("location")
    await response.body?.cancel()
    if (!location || redirectCount === maxRedirects) return null

    let nextUrl: URL
    try {
      nextUrl = new URL(location, parsed)
    } catch {
      return null
    }

    if (nextUrl.origin !== parsed.origin) {
      currentHeaders = stripSensitiveRedirectHeaders(currentHeaders)
    }
    currentUrl = nextUrl.toString()
  }

  return null
}

export async function fetchAllowedWebhookUrl(
  rawUrl: string,
  init: RequestInit,
  options: Pick<FetchAllowedUrlOptions, "lookup" | "timeoutMs"> = {}
): Promise<Response | null> {
  if ((init.method ?? "POST").toUpperCase() !== "POST" || init.body === undefined) {
    return null
  }
  if (!isAllowedHttpsUrl(rawUrl)) return null

  const parsed = new URL(rawUrl)
  parsed.hash = ""
  const lookup = options.lookup ?? lookupDns as DnsLookup
  const resolved = await resolvePublicAddress(parsed.hostname, lookup)
  if (!resolved) return null

  const dispatcher = await createPinnedDispatcher(
    parsed.hostname.replace(/^\[|\]$/g, ""),
    resolved
  )
  const timeoutMs = boundedInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS, 100, MAX_TIMEOUT_MS)
  const timeoutSignal = AbortSignal.timeout(timeoutMs)
  const signal = init.signal
    ? AbortSignal.any([init.signal, timeoutSignal])
    : timeoutSignal

  let response: Response
  try {
    response = await fetch(parsed.toString(), {
      ...init,
      headers: stripSensitiveRedirectHeaders(new Headers(init.headers)),
      credentials: "omit",
      redirect: "manual",
      signal,
      dispatcher,
    } as RequestInit & { dispatcher: Dispatcher })
  } catch (error) {
    const destroy = error instanceof Error
      ? dispatcher.destroy(error)
      : dispatcher.destroy()
    await destroy.catch(() => {})
    throw error
  }
  void dispatcher.close().catch(() => {})

  if (REDIRECT_STATUSES.has(response.status)) {
    await response.body?.cancel()
    return null
  }
  return response
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
