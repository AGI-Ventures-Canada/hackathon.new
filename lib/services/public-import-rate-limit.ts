import { createHash } from "node:crypto"
import { isIP } from "node:net"
import {
  checkRateLimit,
  type RateLimitResult,
} from "@/lib/services/rate-limit"

const PUBLIC_IMPORT_RATE_LIMIT = {
  maxRequests: 10,
  windowMs: 60_000,
} as const

const PUBLIC_CLI_AUTH_RATE_LIMIT = {
  maxRequests: 30,
  windowMs: 60_000,
} as const

const PUBLIC_POLL_RATE_LIMIT = {
  maxRequests: 120,
  windowMs: 60_000,
} as const

type HeaderReader = {
  get(name: string): string | null
}

export function getPublicRateLimitKey(
  headers: HeaderReader,
  namespace: "public_import" | "public_cli_auth" | "public_poll"
): string | null {
  if (process.env.VERCEL !== "1") return null

  const forwardedFor = headers.get("x-vercel-forwarded-for")?.trim() ?? ""
  const clientIp = !forwardedFor.includes(",") && isIP(forwardedFor) !== 0
    ? forwardedFor
    : "unknown"
  const digest = createHash("sha256").update(clientIp).digest("hex")
  return `${namespace}:${digest}`
}

export function getPublicImportRateLimitKey(headers: HeaderReader): string | null {
  return getPublicRateLimitKey(headers, "public_import")
}

export async function consumePublicCliAuthRateLimit(
  headers: HeaderReader
): Promise<RateLimitResult | null> {
  const key = getPublicRateLimitKey(headers, "public_cli_auth")
  if (!key) return null
  return checkRateLimit(key, PUBLIC_CLI_AUTH_RATE_LIMIT, { failureMode: "closed" })
}

export async function consumePublicImportRateLimit(
  headers: HeaderReader
): Promise<RateLimitResult | null> {
  const key = getPublicImportRateLimitKey(headers)
  if (!key) return null
  return checkRateLimit(key, PUBLIC_IMPORT_RATE_LIMIT, { failureMode: "closed" })
}

export async function consumePublicPollRateLimit(
  headers: HeaderReader,
): Promise<RateLimitResult | null> {
  const key = getPublicRateLimitKey(headers, "public_poll")
  if (!key) return null
  return checkRateLimit(key, PUBLIC_POLL_RATE_LIMIT, { failureMode: "closed" })
}
