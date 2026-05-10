import { describe, expect, it, mock, beforeEach } from "bun:test"
import { resetClerkMocks } from "../lib/supabase-mock"

const mockListPresenterViews = mock(() => Promise.resolve([] as unknown[]))
const mockGetPresenterView = mock(() => Promise.resolve(null as unknown))
const mockCreatePresenterView = mock(() => Promise.resolve(null as unknown))
const mockUpdatePresenterView = mock(() => Promise.resolve(null as unknown))
const mockDeletePresenterView = mock(() => Promise.resolve(false))
const mockValidateConfig = mock((c: unknown) => c)
const mockValidateName = mock((n: string) => n.trim())

mock.module("@/lib/services/presenter-views", () => ({
  listPresenterViews: mockListPresenterViews,
  getPresenterView: mockGetPresenterView,
  createPresenterView: mockCreatePresenterView,
  updatePresenterView: mockUpdatePresenterView,
  deletePresenterView: mockDeletePresenterView,
  validatePresenterViewConfig: mockValidateConfig,
  validatePresenterViewName: mockValidateName,
}))

const mockCheckHackathonOrganizer = mock(() =>
  Promise.resolve({
    status: "ok" as const,
    hackathon: { id: "11111111-1111-1111-1111-111111111111", tenant_id: "tenant-123", slug: "test" },
  })
)

mock.module("@/lib/services/public-hackathons", () => ({
  checkHackathonOrganizer: mockCheckHackathonOrganizer,
  getPublicHackathon: mock(() => Promise.resolve(null)),
}))

const mockLogAudit = mock(() => Promise.resolve(null))
mock.module("@/lib/services/audit", () => ({
  logAudit: mockLogAudit,
  listAllAuditLogs: mock(() => Promise.resolve({ logs: [], total: 0 })),
}))

const mockResolvePrincipal = mock(() => Promise.resolve({ kind: "anon" }))

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
    requirePrincipal: (principal: unknown) => {
      if (!principal || (principal as { kind: string }).kind === "anon") {
        throw new AuthError("Unauthorized", 401)
      }
      return principal
    },
    isAdminEnabled: () => true,
    requireAdmin: (principal: { kind: string }) => {
      if (principal.kind !== "admin") throw new AuthError("Forbidden", 403)
    },
    requireAdminScopes: () => {},
    AuthError,
  }
})

mock.module("@/lib/services/rate-limit", () => ({
  checkRateLimit: () => ({ allowed: true, remaining: 100, resetAt: Date.now() + 60000 }),
  getRateLimitHeaders: () => ({}),
  defaultRateLimits: { "api_key:default": { maxRequests: 100, windowMs: 60000 } },
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
const { dashboardEventRoutes } = await import("@/lib/api/routes/dashboard-event")
const { handleRouteError } = await import("@/lib/api/routes/errors")

const app = new Elysia({ prefix: "/api" })
  .onError(({ error, set, path }) => handleRouteError(error, set, path))
  .use(dashboardEventRoutes)

const HACKATHON_ID = "11111111-1111-1111-1111-111111111111"
const VIEW_ID = "22222222-2222-2222-2222-222222222222"
const ROUND_ID = "33333333-3333-3333-3333-333333333333"

const userPrincipal = {
  kind: "user" as const,
  tenantId: "tenant-123",
  userId: "user-456",
  orgId: "org-789",
  orgRole: "org:admin",
  scopes: ["hackathons:read", "hackathons:write"],
}

const apiKeyPrincipal = {
  kind: "api_key" as const,
  tenantId: "tenant-123",
  keyId: "key-1",
  scopes: ["hackathons:read", "hackathons:write"],
}

describe("presenter-views routes", () => {
  beforeEach(() => {
    resetClerkMocks()
    mockResolvePrincipal.mockReset()
    mockListPresenterViews.mockReset()
    mockGetPresenterView.mockReset()
    mockCreatePresenterView.mockReset()
    mockUpdatePresenterView.mockReset()
    mockDeletePresenterView.mockReset()
    mockValidateConfig.mockReset()
    mockValidateName.mockReset()
    mockCheckHackathonOrganizer.mockReset()
    mockLogAudit.mockReset()
    mockLogAudit.mockResolvedValue(null)
    mockCheckHackathonOrganizer.mockResolvedValue({
      status: "ok" as const,
      hackathon: { id: HACKATHON_ID, tenant_id: "tenant-123", slug: "test" },
    })
    mockValidateName.mockImplementation((n: string) => n.trim() || null)
    mockValidateConfig.mockImplementation((c: unknown) => c)
  })

  describe("GET /api/dashboard/hackathons/:id/presenter-views", () => {
    it("rejects unauthenticated", async () => {
      mockResolvePrincipal.mockResolvedValue({ kind: "anon" })
      const res = await app.handle(
        new Request(`http://localhost/api/dashboard/hackathons/${HACKATHON_ID}/presenter-views`)
      )
      expect(res.status).toBeGreaterThanOrEqual(400)
    })

    it("returns saved views for an authorized organizer", async () => {
      mockResolvePrincipal.mockResolvedValue(userPrincipal)
      mockListPresenterViews.mockResolvedValue([
        { id: VIEW_ID, hackathon_id: HACKATHON_ID, name: "Demo Day", config: { kind: "round_finalists", roundId: ROUND_ID } },
      ])
      const res = await app.handle(
        new Request(`http://localhost/api/dashboard/hackathons/${HACKATHON_ID}/presenter-views`)
      )
      const data = await res.json()
      expect(res.status).toBe(200)
      expect(data.views).toHaveLength(1)
      expect(data.views[0].name).toBe("Demo Day")
    })
  })

  describe("POST /api/dashboard/hackathons/:id/presenter-views", () => {
    it("returns 400 when name validation fails", async () => {
      mockResolvePrincipal.mockResolvedValue(userPrincipal)
      mockValidateName.mockReturnValueOnce(null)
      const res = await app.handle(
        new Request(`http://localhost/api/dashboard/hackathons/${HACKATHON_ID}/presenter-views`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: " ",
            config: { kind: "round_finalists", roundId: ROUND_ID },
          }),
        })
      )
      const data = await res.json()
      expect(res.status).toBe(400)
      expect(data.error).toBe("Name is required")
      expect(mockCreatePresenterView).not.toHaveBeenCalled()
    })

    it("returns 400 when config validation fails", async () => {
      mockResolvePrincipal.mockResolvedValue(userPrincipal)
      mockValidateConfig.mockReturnValueOnce(null)
      const res = await app.handle(
        new Request(`http://localhost/api/dashboard/hackathons/${HACKATHON_ID}/presenter-views`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Demo Day",
            config: { kind: "manual", submissionIds: [] },
          }),
        })
      )
      const data = await res.json()
      expect(res.status).toBe(400)
      expect(data.error).toContain("Pick")
      expect(mockCreatePresenterView).not.toHaveBeenCalled()
    })

    it("returns a friendly 400 when service rejects round_finalists with mismatched round", async () => {
      mockResolvePrincipal.mockResolvedValue(userPrincipal)
      mockCreatePresenterView.mockResolvedValue(null)
      const res = await app.handle(
        new Request(`http://localhost/api/dashboard/hackathons/${HACKATHON_ID}/presenter-views`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Demo Day",
            config: { kind: "round_finalists", roundId: ROUND_ID },
          }),
        })
      )
      const data = await res.json()
      expect(res.status).toBe(400)
      expect(data.error).toContain("isn't part of this hackathon")
    })

    it("creates a view for a Clerk user principal", async () => {
      mockResolvePrincipal.mockResolvedValue(userPrincipal)
      mockCreatePresenterView.mockResolvedValue({
        id: VIEW_ID,
        hackathon_id: HACKATHON_ID,
        name: "Demo Day",
        config: { kind: "round_finalists", roundId: ROUND_ID },
      })
      const res = await app.handle(
        new Request(`http://localhost/api/dashboard/hackathons/${HACKATHON_ID}/presenter-views`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Demo Day",
            config: { kind: "round_finalists", roundId: ROUND_ID },
          }),
        })
      )
      const data = await res.json()
      expect(res.status).toBe(200)
      expect(data.id).toBe(VIEW_ID)
      const call = mockCreatePresenterView.mock.calls[0][0] as { createdByClerkUserId: string }
      expect(call.createdByClerkUserId).toBe("user-456")
    })

    it("creates a view for an API key principal and tags the creator", async () => {
      mockResolvePrincipal.mockResolvedValue(apiKeyPrincipal)
      mockCreatePresenterView.mockResolvedValue({
        id: VIEW_ID,
        hackathon_id: HACKATHON_ID,
        name: "Demo Day",
        config: { kind: "manual", submissionIds: ["sub"] },
      })
      const res = await app.handle(
        new Request(`http://localhost/api/dashboard/hackathons/${HACKATHON_ID}/presenter-views`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Demo Day",
            config: { kind: "manual", submissionIds: ["sub"] },
          }),
        })
      )
      expect(res.status).toBe(200)
      const call = mockCreatePresenterView.mock.calls[0][0] as { createdByClerkUserId: string }
      expect(call.createdByClerkUserId).toBe("api_key:key-1")
    })
  })

  describe("PATCH /api/dashboard/hackathons/:id/presenter-views/:viewId", () => {
    it("returns 404 for non-uuid viewId", async () => {
      mockResolvePrincipal.mockResolvedValue(userPrincipal)
      const res = await app.handle(
        new Request(`http://localhost/api/dashboard/hackathons/${HACKATHON_ID}/presenter-views/not-a-uuid`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Renamed" }),
        })
      )
      expect(res.status).toBe(404)
      expect(mockUpdatePresenterView).not.toHaveBeenCalled()
    })

    it("returns 404 when view exists but belongs to a different hackathon", async () => {
      mockResolvePrincipal.mockResolvedValue(userPrincipal)
      mockGetPresenterView.mockResolvedValue({
        id: VIEW_ID,
        hackathon_id: "99999999-9999-9999-9999-999999999999",
      })
      const res = await app.handle(
        new Request(`http://localhost/api/dashboard/hackathons/${HACKATHON_ID}/presenter-views/${VIEW_ID}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Renamed" }),
        })
      )
      expect(res.status).toBe(404)
      expect(mockUpdatePresenterView).not.toHaveBeenCalled()
    })
  })

  describe("DELETE /api/dashboard/hackathons/:id/presenter-views/:viewId", () => {
    it("returns 404 for non-uuid", async () => {
      mockResolvePrincipal.mockResolvedValue(userPrincipal)
      const res = await app.handle(
        new Request(`http://localhost/api/dashboard/hackathons/${HACKATHON_ID}/presenter-views/not-a-uuid`, {
          method: "DELETE",
        })
      )
      expect(res.status).toBe(404)
      expect(mockDeletePresenterView).not.toHaveBeenCalled()
    })

    it("returns 404 when view belongs to another hackathon", async () => {
      mockResolvePrincipal.mockResolvedValue(userPrincipal)
      mockGetPresenterView.mockResolvedValue({
        id: VIEW_ID,
        hackathon_id: "99999999-9999-9999-9999-999999999999",
      })
      const res = await app.handle(
        new Request(`http://localhost/api/dashboard/hackathons/${HACKATHON_ID}/presenter-views/${VIEW_ID}`, {
          method: "DELETE",
        })
      )
      expect(res.status).toBe(404)
      expect(mockDeletePresenterView).not.toHaveBeenCalled()
    })

    it("deletes when ownership matches", async () => {
      mockResolvePrincipal.mockResolvedValue(userPrincipal)
      mockGetPresenterView.mockResolvedValue({ id: VIEW_ID, hackathon_id: HACKATHON_ID })
      mockDeletePresenterView.mockResolvedValue(true)
      const res = await app.handle(
        new Request(`http://localhost/api/dashboard/hackathons/${HACKATHON_ID}/presenter-views/${VIEW_ID}`, {
          method: "DELETE",
        })
      )
      const data = await res.json()
      expect(res.status).toBe(200)
      expect(data.success).toBe(true)
      expect(mockDeletePresenterView).toHaveBeenCalledTimes(1)
    })
  })
})
