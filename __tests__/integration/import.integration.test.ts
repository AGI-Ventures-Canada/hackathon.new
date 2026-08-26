import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { createHash } from "node:crypto"

const mockExtractLumaEventData = mock(() => Promise.resolve(null))

mock.module("@/lib/services/luma-import", () => ({
  extractLumaEventData: mockExtractLumaEventData,
  normalizeEventDate: (s: string | null) => {
    if (!s) return null
    const match = s.match(
      /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?/
    )
    return match ? `${match[1]}${match[2] ?? ""}` : s
  },
}))

const mockExtractEventPageData = mock(() => Promise.resolve(null))
mock.module("@/lib/services/event-page-import", () => ({
  extractEventPageData: mockExtractEventPageData,
}))

const mockCheckRateLimit = mock(() => Promise.resolve({
  allowed: true,
  remaining: 9,
  resetAt: Date.now() + 60_000,
}))

class MockRateLimitError extends Error {
  constructor(
    public resetAt: number,
    public remaining: number
  ) {
    super("Rate limit exceeded")
    this.name = "RateLimitError"
  }
}

mock.module("@/lib/services/rate-limit", () => ({
  checkRateLimit: mockCheckRateLimit,
  defaultRateLimits: {
    "api_key:default": { maxRequests: 100, windowMs: 60_000 },
    "user:default": { maxRequests: 200, windowMs: 60_000 },
  },
  RateLimitError: MockRateLimitError,
  getRateLimitHeaders: (result: { remaining: number; resetAt: number }) => ({
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
  }),
}))

const { api } = await import("@/lib/api")
const originalVercel = process.env.VERCEL

describe("POST /api/public/import/url", () => {
  beforeEach(() => {
    delete process.env.VERCEL
    mockExtractLumaEventData.mockClear()
    mockExtractEventPageData.mockClear()
    mockCheckRateLimit.mockReset()
    mockCheckRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 9,
      resetAt: Date.now() + 60_000,
    })
  })

  afterEach(() => {
    if (originalVercel === undefined) delete process.env.VERCEL
    else process.env.VERCEL = originalVercel
  })

  it("returns extracted event data for a Luma URL", async () => {
    mockExtractLumaEventData.mockResolvedValueOnce({
      name: "Test Hackathon",
      description: "A test event",
      startsAt: "2026-03-15T09:00:00.000-08:00",
      endsAt: "2026-03-16T17:00:00.000-08:00",
      locationType: "in_person",
      locationName: "San Francisco",
      locationUrl: null,
      imageUrl: "https://images.lumacdn.com/test.png",
      language: null,
      translationLinks: [],    })

    const res = await api.handle(
      new Request("http://localhost/api/public/import/url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://luma.com/sfagents" }),
      })
    )

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.name).toBe("Test Hackathon")
    expect(data.imageUrl).toBe("https://images.lumacdn.com/test.png")
  })

  it("returns extracted event data for a non-Luma URL", async () => {
    mockExtractEventPageData.mockResolvedValueOnce({
      name: "Devpost Hackathon",
      description: "A devpost event",
      startsAt: "2026-06-01T09:00:00",
      endsAt: "2026-06-01T17:00:00",
      locationType: "virtual",
      locationName: null,
      locationUrl: null,
      imageUrl: null,
      language: null,
      translationLinks: [],    })

    const res = await api.handle(
      new Request("http://localhost/api/public/import/url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://devpost.com/hackathon/test" }),
      })
    )

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.name).toBe("Devpost Hackathon")
  })

  it("returns 404 when event not found", async () => {
    mockExtractLumaEventData.mockResolvedValueOnce(null)

    const res = await api.handle(
      new Request("http://localhost/api/public/import/url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://luma.com/nonexistent" }),
      })
    )

    expect(res.status).toBe(404)
  })

  it("rate limits Vercel client IPs without trusting x-forwarded-for", async () => {
    process.env.VERCEL = "1"
    const resetAt = Date.now() + 60_000
    mockCheckRateLimit.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      resetAt,
    })

    const res = await api.handle(
      new Request("http://localhost/api/public/import/url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": "1.1.1.1",
          "x-vercel-forwarded-for": "8.8.8.8",
        },
        body: JSON.stringify({ url: "https://luma.com/rate-limited" }),
      })
    )

    const digest = createHash("sha256").update("8.8.8.8").digest("hex")
    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      `public_import:${digest}`,
      {
        maxRequests: 10,
        windowMs: 60_000,
      },
      { failureMode: "closed" },
    )
    expect(res.status).toBe(429)
    expect(mockExtractLumaEventData).not.toHaveBeenCalled()
  })

  it("returns 422 when url is missing", async () => {
    const res = await api.handle(
      new Request("http://localhost/api/public/import/url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
    )

    expect(res.status).toBe(422)
  })

  it("rejects loopback addresses", async () => {
    for (const url of [
      "https://127.0.0.1/secret",
      "https://localhost/secret",
      "https://[::1]/secret",
    ]) {
      const res = await api.handle(
        new Request("http://localhost/api/public/import/url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        })
      )
      expect(res.status).toBe(400)
    }
  })

  it("rejects IPv6 private and link-local addresses", async () => {
    for (const url of [
      "https://[fd00::1]/internal",
      "https://[fe80::1]/link-local",
      "https://[fc00::1]/unique-local",
    ]) {
      const res = await api.handle(
        new Request("http://localhost/api/public/import/url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        })
      )
      expect(res.status).toBe(400)
    }
  })

  it("rejects cloud metadata endpoint", async () => {
    const res = await api.handle(
      new Request("http://localhost/api/public/import/url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://169.254.169.254/latest/meta-data/" }),
      })
    )
    expect(res.status).toBe(400)
  })

  it("rejects private IP ranges", async () => {
    for (const url of [
      "https://10.0.0.1/internal",
      "https://192.168.1.1/admin",
      "https://172.16.0.1/secret",
    ]) {
      const res = await api.handle(
        new Request("http://localhost/api/public/import/url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        })
      )
      expect(res.status).toBe(400)
    }
  })

  it("rejects non-HTTPS URLs", async () => {
    const res = await api.handle(
      new Request("http://localhost/api/public/import/url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "http://luma.com/event" }),
      })
    )
    expect(res.status).toBe(400)
  })
})
