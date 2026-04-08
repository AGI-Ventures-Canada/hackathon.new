import { describe, expect, it, mock, beforeEach } from "bun:test"

const mockCheckHackathonOrganizer = mock(() =>
  Promise.resolve({ status: "authorized", hackathon: { id: "h1" } })
)

mock.module("@/lib/services/public-hackathons", () => ({
  checkHackathonOrganizer: mockCheckHackathonOrganizer,
}))

const mockCreateJudgeDisplayProfile = mock(() =>
  Promise.resolve({
    status: "created",
    judge: {
      id: "j1",
      hackathon_id: "h1",
      name: "Jane Doe",
      title: null,
      organization: null,
      headshot_url: "https://img.clerk.com/avatar.jpg",
      clerk_user_id: "user_clerk_1",
      participant_id: null,
      display_order: 0,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
  })
)

mock.module("@/lib/services/judge-display", () => ({
  createJudgeDisplayProfile: mockCreateJudgeDisplayProfile,
  listJudgeDisplayProfiles: mock(() => Promise.resolve([])),
  updateJudgeDisplayProfile: mock(() => Promise.resolve(null)),
  deleteJudgeDisplayProfile: mock(() => Promise.resolve({ deleted: true })),
  reorderJudgeDisplayProfiles: mock(() => Promise.resolve(true)),
  countJudgeDisplayProfiles: mock(() => Promise.resolve(0)),
}))

mock.module("@/lib/services/audit", () => ({
  logAudit: mock(() => Promise.resolve(null)),
}))

mock.module("@/lib/services/storage", () => ({
  uploadJudgeHeadshot: mock(() => Promise.resolve(null)),
  deleteJudgeHeadshot: mock(() => Promise.resolve()),
}))

const mockGetUserList = mock(() =>
  Promise.resolve({
    data: [
      {
        id: "user_clerk_resolved",
        firstName: "Resolved",
        lastName: "User",
        imageUrl: "https://img.clerk.com/resolved.jpg",
        primaryEmailAddress: { emailAddress: "resolved@example.com" },
      },
    ],
  })
)

const mockClerkClient = mock(() =>
  Promise.resolve({
    users: { getUserList: mockGetUserList },
    organizations: {
      getOrganization: mock(() => Promise.resolve({ name: "Test Org" })),
    },
  })
)

const mockResolvePrincipal = mock(() =>
  Promise.resolve({
    kind: "user",
    tenantId: "org_123",
    userId: "user_123",
    scopes: ["hackathons:read", "hackathons:write"],
  })
)

mock.module("@clerk/nextjs/server", () => ({
  auth: mock(() => Promise.resolve({ userId: "user_123", orgId: "org_123" })),
  clerkClient: mockClerkClient,
}))

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
const { dashboardJudgeDisplayRoutes } = await import("@/lib/api/routes/dashboard-judge-display")
const { handleRouteError } = await import("@/lib/api/routes/errors")

const app = new Elysia({ prefix: "/api/dashboard" })
  .onError(({ error, set, path }) => handleRouteError(error, set, path))
  .use(dashboardJudgeDisplayRoutes)

describe("Dashboard Judge Display Routes", () => {
  beforeEach(() => {
    mockCreateJudgeDisplayProfile.mockReset()
    mockCreateJudgeDisplayProfile.mockResolvedValue({
      status: "created",
      judge: {
        id: "j1",
        hackathon_id: "h1",
        name: "Jane Doe",
        title: null,
        organization: null,
        headshot_url: null,
        clerk_user_id: null,
        participant_id: null,
        display_order: 0,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    })
    mockCheckHackathonOrganizer.mockReset()
    mockCheckHackathonOrganizer.mockResolvedValue({ status: "authorized", hackathon: { id: "h1" } })
    mockGetUserList.mockReset()
    mockGetUserList.mockResolvedValue({ data: [] })
  })

  describe("POST /hackathons/:id/judges/display", () => {
    it("creates judge with name only", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/dashboard/hackathons/h1/judges/display", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Jane Doe" }),
        })
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.id).toBe("j1")
      expect(mockCreateJudgeDisplayProfile).toHaveBeenCalledTimes(1)
    })

    it("resolves Clerk user when email provided without clerkUserId", async () => {
      mockGetUserList.mockResolvedValue({
        data: [
          {
            id: "user_clerk_resolved",
            firstName: "Resolved",
            lastName: "User",
            imageUrl: "https://img.clerk.com/resolved.jpg",
          },
        ],
      })

      mockCreateJudgeDisplayProfile.mockResolvedValue({
        status: "created",
        judge: {
          id: "j2",
          hackathon_id: "h1",
          name: "Resolved User",
          title: null,
          organization: null,
          headshot_url: "https://img.clerk.com/resolved.jpg",
          clerk_user_id: "user_clerk_resolved",
          participant_id: null,
          display_order: 0,
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        },
      })

      const res = await app.handle(
        new Request("http://localhost/api/dashboard/hackathons/h1/judges/display", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Unknown", email: "resolved@example.com" }),
        })
      )
      expect(res.status).toBe(200)
      expect(mockGetUserList).toHaveBeenCalledWith({ emailAddress: ["resolved@example.com"] })
      expect(mockCreateJudgeDisplayProfile).toHaveBeenCalledWith("h1", expect.objectContaining({
        clerkUserId: "user_clerk_resolved",
        name: "Resolved User",
        headshotUrl: "https://img.clerk.com/resolved.jpg",
      }))
    })

    it("returns 409 when clerk_user_id already has a display profile", async () => {
      mockCreateJudgeDisplayProfile.mockResolvedValue({ status: "duplicate" })

      const res = await app.handle(
        new Request("http://localhost/api/dashboard/hackathons/h1/judges/display", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Duplicate", clerkUserId: "user_existing" }),
        })
      )
      const data = await res.json()

      expect(res.status).toBe(409)
      expect(data.error).toBe("Judge already exists")
    })

    it("returns 500 when service returns error", async () => {
      mockCreateJudgeDisplayProfile.mockResolvedValue({ status: "error" })

      const res = await app.handle(
        new Request("http://localhost/api/dashboard/hackathons/h1/judges/display", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Failing" }),
        })
      )
      const data = await res.json()

      expect(res.status).toBe(500)
      expect(data.error).toBe("Failed to create judge profile")
    })

    it("skips Clerk lookup when clerkUserId already provided", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/dashboard/hackathons/h1/judges/display", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Jane", clerkUserId: "user_known", email: "jane@example.com" }),
        })
      )

      expect(res.status).toBe(200)
      expect(mockGetUserList).not.toHaveBeenCalled()
    })
  })
})
