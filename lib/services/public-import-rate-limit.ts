import {
  checkRateLimit,
  type RateLimitResult,
} from "@/lib/services/rate-limit"
import { createHash } from "node:crypto"
import { isIP } from "node:net"

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
  namespace: "public_import" | "public_cli_auth" | "public_poll" | "crowd_vote_read" | "prize_claim"
): string | null {
  if (process.env.VERCEL !== "1") return null

  const forwardedFor = headers.get("x-vercel-forwarded-for")
  const clientIp = forwardedFor?.split(",", 1)[0]?.trim()
  if (!clientIp || isIP(clientIp) === 0) return `${namespace}:unknown`

  const fingerprint = createHash("sha256").update(clientIp).digest("hex").slice(0, 24)
  return `${namespace}:client:${fingerprint}`
}

async function consumePublicRateLimit(
  headers: HeaderReader,
  namespace: "public_import" | "public_cli_auth" | "public_poll",
  config: { maxRequests: number; windowMs: number },
): Promise<RateLimitResult | null> {
  const key = getPublicRateLimitKey(headers, namespace)
  if (!key) return null

  const [clientLimit, globalLimit] = await Promise.all([
    checkRateLimit(key, config, { failureMode: "closed" }),
    checkRateLimit(
      `${namespace}:global`,
      { maxRequests: config.maxRequests * 100, windowMs: config.windowMs },
      { failureMode: "closed" },
    ),
  ])
  return !clientLimit.allowed || !globalLimit.allowed ? {
    allowed: false,
    remaining: Math.min(clientLimit.remaining, globalLimit.remaining),
    resetAt: Math.max(clientLimit.resetAt, globalLimit.resetAt),
  } : clientLimit
}

export function getPublicImportRateLimitKey(headers: HeaderReader): string | null {
  return getPublicRateLimitKey(headers, "public_import")
}

export async function consumePublicCliAuthRateLimit(
  headers: HeaderReader
): Promise<RateLimitResult | null> {
  return consumePublicRateLimit(headers, "public_cli_auth", PUBLIC_CLI_AUTH_RATE_LIMIT)
}

export async function consumePublicImportRateLimit(
  headers: HeaderReader
): Promise<RateLimitResult | null> {
  return consumePublicRateLimit(headers, "public_import", PUBLIC_IMPORT_RATE_LIMIT)
}

export async function consumePublicPollRateLimit(
  headers: HeaderReader,
): Promise<RateLimitResult | null> {
  return consumePublicRateLimit(headers, "public_poll", PUBLIC_POLL_RATE_LIMIT)
}
