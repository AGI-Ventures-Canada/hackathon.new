import { describe, expect, it, beforeEach } from "bun:test"
import {
  resetSupabaseMocks,
  setMockRpcImplementation,
  mockRpcCall,
  mockSuccess,
  mockError,
} from "../lib/supabase-mock"

const { checkRateLimit, getRateLimitHeaders, defaultRateLimits } = await import(
  "@/lib/services/rate-limit"
)

describe("Rate Limiting", () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  describe("checkRateLimit", () => {
    it("allows requests under the limit", async () => {
      mockRpcCall("check_rate_limit", mockSuccess({
        allowed: true,
        remaining: 9,
        reset_at: Date.now() + 60000,
      }))

      const result = await checkRateLimit("test-key", { maxRequests: 10, windowMs: 60000 })

      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(9)
    })

    it("blocks requests at the limit", async () => {
      const resetAt = Date.now() + 60000
      mockRpcCall("check_rate_limit", mockSuccess({
        allowed: false,
        remaining: 0,
        reset_at: resetAt,
      }))

      const result = await checkRateLimit("test-key", { maxRequests: 3, windowMs: 60000 })

      expect(result.allowed).toBe(false)
      expect(result.remaining).toBe(0)
      expect(result.resetAt).toBe(resetAt)
    })

    it("returns reset timestamp", async () => {
      const resetAt = Date.now() + 60000
      mockRpcCall("check_rate_limit", mockSuccess({
        allowed: true,
        remaining: 9,
        reset_at: resetAt,
      }))

      const result = await checkRateLimit("test-key", { maxRequests: 10, windowMs: 60000 })

      expect(result.resetAt).toBe(resetAt)
    })

    it("fails open on database error", async () => {
      mockRpcCall("check_rate_limit", mockError("connection failed"))

      const result = await checkRateLimit("test-key", { maxRequests: 10, windowMs: 60000 })

      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(9)
    })

    it("fails closed on database error when the caller protects public work", async () => {
      mockRpcCall("check_rate_limit", mockError("connection failed"))

      const result = await checkRateLimit(
        "public-work",
        { maxRequests: 10, windowMs: 60000 },
        { failureMode: "closed" },
      )

      expect(result.allowed).toBe(false)
      expect(result.remaining).toBe(0)
    })

    it("fails open on null data", async () => {
      setMockRpcImplementation(() => Promise.resolve({ data: null, error: null }))

      const result = await checkRateLimit("test-key", { maxRequests: 10, windowMs: 60000 })

      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(9)
    })

    it("fails open when allowed field is wrong type", async () => {
      setMockRpcImplementation(() =>
        Promise.resolve({ data: { allowed: "yes", remaining: 9, reset_at: Date.now() + 60000 }, error: null })
      )

      const result = await checkRateLimit("test-key", { maxRequests: 10, windowMs: 60000 })

      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(9)
    })

    it("fails closed on malformed data when requested", async () => {
      setMockRpcImplementation(() =>
        Promise.resolve({ data: { allowed: "yes" }, error: null })
      )

      const result = await checkRateLimit(
        "public-work",
        { maxRequests: 10, windowMs: 60000 },
        { failureMode: "closed" },
      )

      expect(result.allowed).toBe(false)
      expect(result.remaining).toBe(0)
    })

    it("fails open when remaining field is wrong type", async () => {
      setMockRpcImplementation(() =>
        Promise.resolve({ data: { allowed: true, remaining: "nine", reset_at: Date.now() + 60000 }, error: null })
      )

      const result = await checkRateLimit("test-key", { maxRequests: 10, windowMs: 60000 })

      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(9)
    })

    it("fails open when reset_at field is wrong type", async () => {
      setMockRpcImplementation(() =>
        Promise.resolve({ data: { allowed: true, remaining: 9, reset_at: null }, error: null })
      )

      const result = await checkRateLimit("test-key", { maxRequests: 10, windowMs: 60000 })

      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(9)
    })

    it("passes correct parameters to RPC", async () => {
      let capturedParams: Record<string, unknown> = {}
      setMockRpcImplementation((fn, params) => {
        capturedParams = params as Record<string, unknown>
        return Promise.resolve({
          data: { allowed: true, remaining: 99, reset_at: Date.now() + 60000 },
          error: null,
        })
      })

      await checkRateLimit("admin:user123", { maxRequests: 60, windowMs: 30000 })

      expect(capturedParams).toEqual({
        p_key: "admin:user123",
        p_max_requests: 60,
        p_window_ms: 30000,
      })
    })

    it("uses default config when none provided", async () => {
      let capturedParams: Record<string, unknown> = {}
      setMockRpcImplementation((fn, params) => {
        capturedParams = params as Record<string, unknown>
        return Promise.resolve({
          data: { allowed: true, remaining: 99, reset_at: Date.now() + 60000 },
          error: null,
        })
      })

      await checkRateLimit("some-key")

      expect(capturedParams).toEqual({
        p_key: "some-key",
        p_max_requests: 100,
        p_window_ms: 60000,
      })
    })
  })

  describe("getRateLimitHeaders", () => {
    it("returns proper headers", () => {
      const headers = getRateLimitHeaders({
        allowed: true,
        remaining: 5,
        resetAt: 1700000000000,
      })

      expect(headers["X-RateLimit-Remaining"]).toBe("5")
      expect(headers["X-RateLimit-Reset"]).toBe("1700000000")
    })
  })

  describe("defaultRateLimits", () => {
    it("has api_key:default config", () => {
      expect(defaultRateLimits["api_key:default"]).toBeDefined()
      expect(defaultRateLimits["api_key:default"].maxRequests).toBe(100)
    })

    it("has user:default config", () => {
      expect(defaultRateLimits["user:default"]).toBeDefined()
      expect(defaultRateLimits["user:default"].maxRequests).toBe(200)
    })
  })
})
