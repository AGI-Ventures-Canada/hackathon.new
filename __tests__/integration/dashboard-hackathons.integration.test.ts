import { describe, expect, it, mock, beforeEach } from "bun:test"
import { resetClerkMocks } from "../lib/supabase-mock"

const mockCheckHackathonOrganizer = mock(() => Promise.resolve({ status: "ok" }))
const mockDeleteHackathon = mock(() => Promise.resolve(true))
const mockLogAudit = mock(() => Promise.resolve(null))
const mockTriggerWebhooks = mock(() => Promise.resolve())
const mockCreateHackathon = mock(() =>
  Promise.resolve({ id: "h-new", name: "New Hack", slug: "new-hack" })
)
const mockGetTenantById = mock(() =>
  Promise.resolve({ id: "tenant-123", clerk_org_id: "org-789", clerk_user_id: null })
)

mock.module("@/lib/services/public-hackathons", () => ({
  checkHackathonOrganizer: mockCheckHackathonOrganizer,
  deleteHackathon: mockDeleteHackathon,
}))

mock.module("@/lib/services/hackathons", () => ({
  createHackathon: mockCreateHackathon,
}))

mock.module("@/lib/services/tenants", () => ({
  getTenantById: mockGetTenantById,
  isOrgTenant: async (_tenantId: string) => {
    const tenant = await mockGetTenantById()
    return Boolean(tenant?.clerk_org_id)
  },
  organizationRequiredResponse: () =>
    new Response(
      JSON.stringify({
        error:
          "Switch to an organization to create a hackathon. Personal accounts can't host events.",
        code: "organization_required",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    ),
}))

mock.module("@/lib/services/audit", () => ({
  logAudit: mockLogAudit,
  listAllAuditLogs: mock(() => Promise.resolve({ logs: [], total: 0 })),
}))

mock.module("@/lib/services/webhooks", () => ({
  triggerWebhooks: mockTriggerWebhooks,
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
    requirePrincipal: (principal: unknown, ..._rest: unknown[]) => {
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
const { dashboardRoutes } = await import("@/lib/api/routes/dashboard")
const { handleRouteError } = await import("@/lib/api/routes/errors")

const app = new Elysia({ prefix: "/api" })
  .onError(({ error, set, path }) => handleRouteError(error, set, path))
  .use(dashboardRoutes)

const mockUserPrincipal = {
  kind: "user" as const,
  tenantId: "tenant-123",
  userId: "user-456",
  orgId: "org-789",
  orgRole: "org:admin",
  scopes: ["hackathons:read", "hackathons:write"],
}

describe("DELETE /api/dashboard/hackathons/:id", () => {
  beforeEach(() => {
    resetClerkMocks()
    mockResolvePrincipal.mockReset()
    mockCheckHackathonOrganizer.mockReset()
    mockDeleteHackathon.mockReset()
    mockLogAudit.mockReset()
    mockTriggerWebhooks.mockReset()
  })

  it("rejects unauthenticated requests", async () => {
    mockResolvePrincipal.mockResolvedValue({ kind: "anon" })

    const res = await app.handle(
      new Request("http://localhost/api/dashboard/hackathons/h1", { method: "DELETE" })
    )
    const data = await res.json()

    expect(data.error).toBe("Unauthorized")
    expect(res.status).toBeGreaterThanOrEqual(400)
  })

  it("returns 404 when hackathon not found", async () => {
    mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
    mockCheckHackathonOrganizer.mockResolvedValue({ status: "not_found" })

    const res = await app.handle(
      new Request("http://localhost/api/dashboard/hackathons/h1", { method: "DELETE" })
    )
    const data = await res.json()

    expect(res.status).toBe(404)
    expect(data.error).toBe("Hackathon not found")
  })

  it("returns 403 when tenant does not own hackathon", async () => {
    mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
    mockCheckHackathonOrganizer.mockResolvedValue({ status: "not_authorized" })

    const res = await app.handle(
      new Request("http://localhost/api/dashboard/hackathons/h1", { method: "DELETE" })
    )
    const data = await res.json()

    expect(res.status).toBe(403)
    expect(data.error).toBe("Not authorized")
  })

  it("returns 200 with success on successful delete", async () => {
    mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
    mockCheckHackathonOrganizer.mockResolvedValue({ status: "ok" })
    mockDeleteHackathon.mockResolvedValue(true)

    const res = await app.handle(
      new Request("http://localhost/api/dashboard/hackathons/h1", { method: "DELETE" })
    )
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
  })

  it("returns 500 when delete service call fails", async () => {
    mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
    mockCheckHackathonOrganizer.mockResolvedValue({ status: "ok" })
    mockDeleteHackathon.mockResolvedValue(false)

    const res = await app.handle(
      new Request("http://localhost/api/dashboard/hackathons/h1", { method: "DELETE" })
    )
    const data = await res.json()

    expect(res.status).toBe(500)
    expect(data.error).toBe("Failed to delete hackathon")
  })
})

describe("POST /api/dashboard/hackathons", () => {
  beforeEach(() => {
    resetClerkMocks()
    mockResolvePrincipal.mockReset()
    mockCreateHackathon.mockReset()
    mockGetTenantById.mockReset()
    mockLogAudit.mockReset()
    mockTriggerWebhooks.mockReset()
    mockLogAudit.mockResolvedValue(null)
    mockTriggerWebhooks.mockResolvedValue(undefined)
  })

  it("rejects personal-account principals with organization_required", async () => {
    mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
    mockGetTenantById.mockResolvedValue({
      id: "tenant-personal",
      clerk_org_id: null,
      clerk_user_id: "user-456",
    })

    const res = await app.handle(
      new Request("http://localhost/api/dashboard/hackathons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "My Hack" }),
      })
    )
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.code).toBe("organization_required")
    expect(mockCreateHackathon).not.toHaveBeenCalled()
  })

  it("creates hackathon for an org-backed tenant", async () => {
    mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
    mockGetTenantById.mockResolvedValue({
      id: "tenant-123",
      clerk_org_id: "org-789",
      clerk_user_id: null,
    })
    mockCreateHackathon.mockResolvedValue({
      id: "h-new",
      name: "Org Hack",
      slug: "org-hack",
    })

    const res = await app.handle(
      new Request("http://localhost/api/dashboard/hackathons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Org Hack" }),
      })
    )
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.id).toBe("h-new")
    expect(mockCreateHackathon).toHaveBeenCalledTimes(1)
  })
})
