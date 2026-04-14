import { describe, expect, it, mock, beforeEach } from "bun:test"

const mockCheckHackathonOrganizer = mock(() =>
  Promise.resolve({ status: "ok" })
)

mock.module("@/lib/services/public-hackathons", () => ({
  checkHackathonOrganizer: mockCheckHackathonOrganizer,
}))

const mockGetUserList = mock(() =>
  Promise.resolve({
    data: [
      {
        id: "user_1",
        firstName: "Alice",
        lastName: "Smith",
        username: "asmith",
        imageUrl: "https://img.clerk.com/alice.jpg",
        primaryEmailAddress: { emailAddress: "alice@example.com" },
      },
    ],
  })
)

mock.module("@clerk/nextjs/server", () => ({
  auth: mock(() => Promise.resolve({ userId: "user_123", orgId: "org_123" })),
  clerkClient: mock(() =>
    Promise.resolve({ users: { getUserList: mockGetUserList } })
  ),
}))

const mockResolvePrincipal = mock(() =>
  Promise.resolve({
    kind: "user",
    tenantId: "org_123",
    userId: "user_123",
    scopes: ["hackathons:read", "hackathons:write"],
  })
)

mock.module("@/lib/auth/principal", () => {
  class AuthError extends Error {
    statusCode: number
    constructor(message: string, statusCode: number) {
      super(message)
      this.statusCode = statusCode
      this.name = "AuthError"
    }
  }

  return {
    resolvePrincipal: mockResolvePrincipal,
    requirePrincipal: (principal: unknown, types: string[], scopes?: string[]) => {
      if (!principal || (principal as { kind: string }).kind === "anon") {
        throw new AuthError("Unauthorized", 401)
      }
      if (scopes && scopes.length > 0) {
        const principalScopes = (principal as { scopes: string[] }).scopes || []
        for (const scope of scopes) {
          if (!principalScopes.includes(scope)) {
            throw new AuthError(`Missing required scope: ${scope}`, 403)
          }
        }
      }
      return principal
    },
    AuthError,
  }
})

mock.module("@/lib/services/audit", () => ({
  logAudit: mock(() => Promise.resolve(null)),
}))

mock.module("@/lib/auth/resolve-adder-name", () => ({
  resolveAdderName: mock(() => Promise.resolve("Test User")),
}))

mock.module("@/lib/services/rate-limit", () => ({
  checkRateLimit: () => ({ allowed: true, remaining: 100, resetAt: Date.now() + 60000 }),
  getRateLimitHeaders: () => ({}),
  defaultRateLimits: {},
  RateLimitError: class RateLimitError extends Error {
    resetAt: number
    remaining: number
    constructor(resetAt: number, remaining: number) {
      super("Rate limit exceeded")
      this.resetAt = resetAt
      this.remaining = remaining
    }
  },
}))

const { Elysia } = await import("elysia")
const { dashboardJudgingRoutes } = await import("@/lib/api/routes/dashboard-judging")
const { handleRouteError } = await import("@/lib/api/routes/errors")

const app = new Elysia({ prefix: "/api/dashboard" })
  .onError(({ error, set, path }) => handleRouteError(error, set, path))
  .use(dashboardJudgingRoutes)

const HACKATHON_ID = "11111111-1111-1111-1111-111111111111"

function searchUrl(q: string, hackathonId = HACKATHON_ID) {
  return `http://localhost/api/dashboard/hackathons/${hackathonId}/judging/user-search?q=${encodeURIComponent(q)}`
}

describe("user-search auth cache", () => {
  beforeEach(() => {
    mockCheckHackathonOrganizer.mockReset()
    mockCheckHackathonOrganizer.mockResolvedValue({ status: "ok" })
    mockGetUserList.mockReset()
    mockGetUserList.mockResolvedValue({ data: [] })
  })

  it("calls checkHackathonOrganizer on first request (cache miss)", async () => {
    const res = await app.handle(new Request(searchUrl("alice")))
    expect(res.status).toBe(200)
    expect(mockCheckHackathonOrganizer).toHaveBeenCalledTimes(1)
  })

  it("skips checkHackathonOrganizer on subsequent request (cache hit)", async () => {
    const res = await app.handle(new Request(searchUrl("bob")))
    expect(res.status).toBe(200)
    expect(mockCheckHackathonOrganizer).not.toHaveBeenCalled()
  })

  it("returns 404 when hackathon not found", async () => {
    const otherId = "22222222-2222-2222-2222-222222222222"
    mockCheckHackathonOrganizer.mockResolvedValue({ status: "not_found" })

    const res = await app.handle(new Request(searchUrl("alice", otherId)))
    const data = await res.json()

    expect(res.status).toBe(404)
    expect(data.error).toBe("Hackathon not found")
  })

  it("returns 403 when not authorized", async () => {
    const otherId = "33333333-3333-3333-3333-333333333333"
    mockCheckHackathonOrganizer.mockResolvedValue({ status: "not_authorized" })

    const res = await app.handle(new Request(searchUrl("alice", otherId)))
    const data = await res.json()

    expect(res.status).toBe(403)
    expect(data.error).toBe("Not authorized")
  })

  it("returns empty array when query is too short", async () => {
    const res = await app.handle(new Request(searchUrl("a")))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.users).toEqual([])
  })
})
