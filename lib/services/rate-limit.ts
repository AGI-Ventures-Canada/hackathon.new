import { supabase } from "@/lib/db/client"

export type RateLimitConfig = {
  maxRequests: number
  windowMs: number
}

export const defaultRateLimits: Record<string, RateLimitConfig> = {
  "api_key:default": { maxRequests: 100, windowMs: 60_000 },
  "user:default": { maxRequests: 200, windowMs: 60_000 },
}

export type RateLimitResult = {
  allowed: boolean
  remaining: number
  resetAt: number
}

export async function checkRateLimit(
  key: string,
  config: RateLimitConfig = defaultRateLimits["api_key:default"],
  options: { failureMode?: "open" | "closed" } = {},
): Promise<RateLimitResult> {
  const db = supabase()
  const { data, error } = await db.rpc("check_rate_limit", {
    p_key: key,
    p_max_requests: config.maxRequests,
    p_window_ms: config.windowMs,
  })

  if (error || !data || typeof data !== "object") {
    return {
      allowed: options.failureMode !== "closed",
      remaining: options.failureMode === "closed" ? 0 : config.maxRequests - 1,
      resetAt: Date.now() + config.windowMs,
    }
  }

  const result = data as Record<string, unknown>
  if (
    typeof result.allowed !== "boolean" ||
    typeof result.remaining !== "number" ||
    typeof result.reset_at !== "number"
  ) {
    return {
      allowed: options.failureMode !== "closed",
      remaining: options.failureMode === "closed" ? 0 : config.maxRequests - 1,
      resetAt: Date.now() + config.windowMs,
    }
  }

  return {
    allowed: result.allowed,
    remaining: result.remaining,
    resetAt: result.reset_at,
  }
}

export function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Remaining": result.remaining.toString(),
    "X-RateLimit-Reset": Math.ceil(result.resetAt / 1000).toString(),
  }
}

export class RateLimitError extends Error {
  constructor(
    public resetAt: number,
    public remaining: number
  ) {
    super("Rate limit exceeded")
    this.name = "RateLimitError"
  }
}
