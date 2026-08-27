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

type HeaderReader = {
  get(name: string): string | null
}

export function getPublicImportRateLimitKey(headers: HeaderReader): string | null {
  if (process.env.VERCEL !== "1") return null

  const forwardedFor = headers.get("x-vercel-forwarded-for")?.trim() ?? ""
  const clientIp = !forwardedFor.includes(",") && isIP(forwardedFor) !== 0
    ? forwardedFor
    : "unknown"
  const digest = createHash("sha256").update(clientIp).digest("hex")
  return `public_import:${digest}`
}

export async function consumePublicImportRateLimit(
  headers: HeaderReader
): Promise<RateLimitResult | null> {
  const key = getPublicImportRateLimitKey(headers)
  if (!key) return null
  return checkRateLimit(key, PUBLIC_IMPORT_RATE_LIMIT, { failureMode: "closed" })
}
