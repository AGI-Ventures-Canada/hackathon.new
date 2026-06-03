import { describe, expect, it, mock, beforeEach } from "bun:test"

const mockGetPlatformStats = mock(() =>
  Promise.resolve({ tenants: 5, hackathons: 10, participants: 50, submissions: 20 })
)
const mockListAllHackathons = mock(() =>
  Promise.resolve({ hackathons: [], total: 0 })
)
const mockGetHackathonById = mock(() => Promise.resolve(null))
const mockUpdateHackathonAsAdmin = mock(() => Promise.resolve({ id: "h-1" }))
const mockDeleteHackathon = mock(() => Promise.resolve())
const mockLogAudit = mock(() => Promise.resolve(null))
const mockListScenarios = mock(() => [
  { name: "pre-registration", description: "Test scenario" },
])
const mockRunScenario = mock(() =>
  Promise.resolve({ hackathonId: "h-1", slug: "test-pre-registration", tenantId: "t-1" })
)
const mockGenerateRoleTokens = mock(() => Promise.resolve([]))
const mockGetActiveScenarios = mock(() => Promise.resolve([]))

const mockRpc = mock(() => Promise.resolve({ data: 42, error: null }))
let mockFromResult: { data: unknown; error: null } = { data: null, error: null }
const mockSingle = mock(() => Promise.resolve(mockFromResult))
const mockEq = mock(() => ({ single: mockSingle }))
const mockSelect = mock(() => ({ eq: mockEq }))
const mockFrom = mock(() => ({ select: mockSelect }))

mock.module("@/lib/db/client", () => ({
  supabase: () => ({ rpc: mockRpc, from: mockFrom }),
}))

mock.module("@/lib/services/admin", () => ({
  getPlatformStats: mockGetPlatformStats,
  listAllHackathons: mockListAllHackathons,
  getHackathonById: mockGetHackathonById,
  updateHackathonAsAdmin: mockUpdateHackathonAsAdmin,
  deleteHackathon: mockDeleteHackathon,
}))

mock.module("@/lib/services/admin-scenarios", () => ({
  listScenarios: mockListScenarios,
  runScenario: mockRunScenario,
  generateRoleTokens: mockGenerateRoleTokens,
  getActiveScenarios: mockGetActiveScenarios,
}))

mock.module("@/lib/dev/test-personas", () => ({
  TEST_PERSONAS: [
    { key: "organizer", name: "Organizer", env: "SCENARIO_DEV_USER_ID", fallback: null },
    { key: "user1", name: "Test User 1", env: "TEST_USER_1_ID", fallback: null },
  ],
  getPersonaUserId: (key: string) => {
    if (key === "organizer") return process.env.SCENARIO_DEV_USER_ID ?? null
    if (key === "user1") return process.env.TEST_USER_1_ID ?? null
    return null
  },
  findPersonaByUserId: () => undefined,
  getSeedUserIds: () => [],
}))

mock.module("@clerk/nextjs/server", () => ({
  clerkClient: () =>
    Promise.resolve({
      signInTokens: {
        createSignInToken: mock(() => Promise.resolve({ token: "tok_test" })),
      },
    }),
}))

mock.module("@/lib/services/audit", () => ({
  logAudit: mockLogAudit,
  listAllAuditLogs: mock(() => Promise.resolve({ logs: [], total: 0 })),
}))

const mockResolvePrincipal = mock(() =>
  Promise.resolve({ kind: "anon" })
)

mock.module("@/lib/auth/principal", () => {
  class AuthError extends Error {
    statusCode: number
    constructor(message: string, statusCode = 401) {
      super(message)
      this.statusCode = statusCode
      this.name = "AuthError"
    }
  }

  return {
    resolvePrincipal: mockResolvePrincipal,
    requireAdmin: (principal: { kind: string; scopes?: string[] }) => {
      if (principal.kind === "admin") return
      if (
        principal.kind === "api_key" &&
        Array.isArray(principal.scopes) &&
        ["admin:read", "admin:write", "admin:scenarios"].some((s) => principal.scopes!.includes(s))
      ) {
        return
      }
      throw new AuthError("Forbidden", 403)
    },
    requireAdminScopes: (principal: { kind: string; scopes?: string[] }, scopes: string[]) => {
      if (principal.kind === "admin") return
      for (const scope of scopes) {
        if (!principal.scopes?.includes(scope)) {
          throw new AuthError(`Missing required scope: ${scope}`, 403)
        }
      }
    },
    isAdminEnabled: () => true,
    requirePrincipal: (principal: { kind: string }, _kinds: string[]) => {
      if (!principal || principal.kind === "anon") {
        throw new AuthError("Unauthorized", 401)
      }
      return principal
    },
    AuthError,
  }
})

mock.module("@/lib/services/rate-limit", () => ({
  checkRateLimit: () => ({
    allowed: true,
    remaining: 100,
    resetAt: Date.now() + 60000,
  }),
  getRateLimitHeaders: () => ({}),
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
const { adminRoutes } = await import("@/lib/api/routes/admin")
const { handleRouteError } = await import("@/lib/api/routes/errors")

const app = new Elysia({ prefix: "/api" })
  .onError(({ error, set, path }) => handleRouteError(error, set, path))
  .use(adminRoutes)

const adminPrincipal = {
  kind: "admin" as const,
  userId: "admin-1",
  tenantId: "tenant-1",
  orgId: null,
  scopes: ["admin:read", "admin:write", "admin:scenarios"],
}

const readOnlyApiKeyPrincipal = {
  kind: "api_key" as const,
  tenantId: "t-1",
  keyId: "key-readonly",
  scopes: ["admin:read"],
}

const userPrincipal = {
  kind: "user" as const,
  tenantId: "t-1",
  userId: "user-1",
  orgId: "org-1",
  orgRole: "org:admin",
  scopes: ["hackathons:read"],
}

describe("Admin API Routes", () => {
  beforeEach(() => {
    mockResolvePrincipal.mockReset()
    mockGetPlatformStats.mockReset()
    mockListAllHackathons.mockReset()
    mockGetHackathonById.mockReset()
    mockUpdateHackathonAsAdmin.mockReset()
    mockDeleteHackathon.mockReset()
    mockLogAudit.mockReset()
    mockListScenarios.mockReset()
    mockRunScenario.mockReset()
    mockGenerateRoleTokens.mockReset()
    mockGetActiveScenarios.mockReset()
    mockRpc.mockReset()
    mockFrom.mockReset()
    mockRpc.mockResolvedValue({ data: 42, error: null })
    mockFrom.mockReturnValue({ select: mockSelect })
    mockSelect.mockReturnValue({ eq: mockEq })
    mockEq.mockReturnValue({ single: mockSingle })
    mockFromResult = { data: null, error: null }
    mockGenerateRoleTokens.mockResolvedValue([])
    mockGetActiveScenarios.mockResolvedValue([])

    mockGetPlatformStats.mockResolvedValue({
      tenants: 5,
      hackathons: 10,
      participants: 50,
      submissions: 20,
    })
    mockListAllHackathons.mockResolvedValue({ hackathons: [], total: 0 })
    mockListScenarios.mockReturnValue([{ name: "pre-registration", description: "Test scenario" }])
    mockRunScenario.mockResolvedValue({ hackathonId: "h-1", slug: "test-pre-registration", tenantId: "t-1" })
  })

  describe("Auth enforcement", () => {
    it("rejects unauthenticated requests with 403", async () => {
      mockResolvePrincipal.mockResolvedValue({ kind: "anon" })

      const res = await app.handle(
        new Request("http://localhost/api/admin/stats")
      )

      expect(res.status).toBe(403)
    })

    it("rejects non-admin users with 403", async () => {
      mockResolvePrincipal.mockResolvedValue(userPrincipal)

      const res = await app.handle(
        new Request("http://localhost/api/admin/stats")
      )

      expect(res.status).toBe(403)
    })

    it("rejects unauthenticated requests to hackathons", async () => {
      mockResolvePrincipal.mockResolvedValue({ kind: "anon" })

      const res = await app.handle(
        new Request("http://localhost/api/admin/hackathons")
      )

      expect(res.status).toBe(403)
    })

    it("rejects unauthenticated requests to scenarios", async () => {
      mockResolvePrincipal.mockResolvedValue({ kind: "anon" })

      const res = await app.handle(
        new Request("http://localhost/api/admin/scenarios")
      )

      expect(res.status).toBe(403)
    })
  })

  describe("GET /admin/stats", () => {
    it("returns platform stats for admin", async () => {
      mockResolvePrincipal.mockResolvedValue(adminPrincipal)

      const res = await app.handle(
        new Request("http://localhost/api/admin/stats")
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.tenants).toBe(5)
      expect(data.hackathons).toBe(10)
      expect(data.participants).toBe(50)
      expect(data.submissions).toBe(20)
    })
  })

  describe("GET /admin/hackathons", () => {
    it("returns hackathon list for admin", async () => {
      mockResolvePrincipal.mockResolvedValue(adminPrincipal)
      mockListAllHackathons.mockResolvedValue({
        hackathons: [{ id: "h-1", name: "Test Hack" }],
        total: 1,
      })

      const res = await app.handle(
        new Request("http://localhost/api/admin/hackathons")
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.hackathons).toHaveLength(1)
      expect(data.total).toBe(1)
    })

    it("passes query params to service", async () => {
      mockResolvePrincipal.mockResolvedValue(adminPrincipal)
      mockListAllHackathons.mockResolvedValue({ hackathons: [], total: 0 })

      await app.handle(
        new Request(
          "http://localhost/api/admin/hackathons?limit=10&offset=5&status=active&search=test"
        )
      )

      expect(mockListAllHackathons).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 10,
          offset: 5,
          status: "active",
          search: "test",
        })
      )
    })
  })

  describe("GET /admin/hackathons/:id", () => {
    it("returns hackathon detail for admin", async () => {
      mockResolvePrincipal.mockResolvedValue(adminPrincipal)
      mockGetHackathonById.mockResolvedValue({
        id: "h-1",
        name: "Test Hack",
        tenant_id: "t-1",
      })

      const res = await app.handle(
        new Request("http://localhost/api/admin/hackathons/h-1")
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.id).toBe("h-1")
    })

    it("returns 404 for missing hackathon", async () => {
      mockResolvePrincipal.mockResolvedValue(adminPrincipal)
      mockGetHackathonById.mockResolvedValue(null)

      const res = await app.handle(
        new Request("http://localhost/api/admin/hackathons/missing")
      )

      expect(res.status).toBe(404)
    })
  })

  describe("PATCH /admin/hackathons/:id", () => {
    it("updates hackathon and logs audit", async () => {
      mockResolvePrincipal.mockResolvedValue(adminPrincipal)
      mockGetHackathonById.mockResolvedValue({
        id: "h-1",
        name: "Old Name",
        tenant_id: "t-1",
      })
      mockUpdateHackathonAsAdmin.mockResolvedValue({
        id: "h-1",
        name: "New Name",
      })

      const res = await app.handle(
        new Request("http://localhost/api/admin/hackathons/h-1", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "New Name" }),
        })
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.name).toBe("New Name")
      expect(mockLogAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "admin.hackathon.updated",
          resourceId: "h-1",
          targetTenantId: "t-1",
        })
      )
    })

    it("rejects invalid status values", async () => {
      mockResolvePrincipal.mockResolvedValue(adminPrincipal)
      mockGetHackathonById.mockResolvedValue({
        id: "h-1",
        tenant_id: "t-1",
      })

      const res = await app.handle(
        new Request("http://localhost/api/admin/hackathons/h-1", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "invalid_status" }),
        })
      )

      expect(res.status).toBeGreaterThanOrEqual(400)
      expect(mockUpdateHackathonAsAdmin).not.toHaveBeenCalled()
    })
  })

  describe("DELETE /admin/hackathons/:id", () => {
    it("deletes hackathon and logs audit when confirm_name matches", async () => {
      mockResolvePrincipal.mockResolvedValue(adminPrincipal)
      mockGetHackathonById.mockResolvedValue({
        id: "h-1",
        name: "Doomed",
        slug: "doomed",
        tenant_id: "t-1",
      })

      const res = await app.handle(
        new Request("http://localhost/api/admin/hackathons/h-1", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirm_name: "Doomed" }),
        })
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.success).toBe(true)
      expect(mockDeleteHackathon).toHaveBeenCalledWith("h-1")
      expect(mockLogAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "admin.hackathon.deleted",
          targetTenantId: "t-1",
        })
      )
    })

    it("rejects delete when confirm_name does not match", async () => {
      mockResolvePrincipal.mockResolvedValue(adminPrincipal)
      mockGetHackathonById.mockResolvedValue({
        id: "h-1",
        name: "Doomed",
        slug: "doomed",
        tenant_id: "t-1",
      })

      const res = await app.handle(
        new Request("http://localhost/api/admin/hackathons/h-1", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirm_name: "Wrong Name" }),
        })
      )

      expect(res.status).toBe(400)
      expect(mockDeleteHackathon).not.toHaveBeenCalled()
    })

    it("returns 404 for missing hackathon", async () => {
      mockResolvePrincipal.mockResolvedValue(adminPrincipal)
      mockGetHackathonById.mockResolvedValue(null)

      const res = await app.handle(
        new Request("http://localhost/api/admin/hackathons/missing", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirm_name: "anything" }),
        })
      )

      expect(res.status).toBe(404)
    })
  })

  describe("GET /admin/scenarios", () => {
    it("returns scenario list for admin", async () => {
      mockResolvePrincipal.mockResolvedValue(adminPrincipal)

      const res = await app.handle(
        new Request("http://localhost/api/admin/scenarios")
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.scenarios).toHaveLength(1)
    })
  })

  describe("POST /admin/scenario-run/:name", () => {
    it("runs scenario, returns roles, and logs audit", async () => {
      mockResolvePrincipal.mockResolvedValue(adminPrincipal)
      mockRunScenario.mockResolvedValue({
        hackathonId: "h-new",
        slug: "test-pre-registration",
        tenantId: "t-new",
      })
      mockGenerateRoleTokens.mockResolvedValue([
        { personaKey: "organizer", name: "Organizer", role: "organizer", loginUrl: "/dev-switch?token=tok", directUrl: "/hackathons/h-new" },
      ])

      const res = await app.handle(
        new Request("http://localhost/api/admin/scenario-run/pre-registration", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        })
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.hackathonId).toBe("h-new")
      expect(data.slug).toBe("test-pre-registration")
      expect(data.roles).toHaveLength(1)
      expect(mockLogAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "admin.scenario.created",
          metadata: { scenario: "pre-registration" },
        })
      )
    })

    it("returns 400 when runScenario throws", async () => {
      mockResolvePrincipal.mockResolvedValue(adminPrincipal)
      mockRunScenario.mockRejectedValue(new Error("Unknown scenario: bad-name"))

      const res = await app.handle(
        new Request("http://localhost/api/admin/scenario-run/bad-name", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        })
      )

      expect(res.status).toBe(400)
      expect(mockLogAudit).not.toHaveBeenCalled()
    })
  })

  describe("GET /admin/scenario-active", () => {
    it("returns active scenarios for admin", async () => {
      mockResolvePrincipal.mockResolvedValue(adminPrincipal)
      mockGetActiveScenarios.mockResolvedValue([
        { scenarioName: "pre-registration", hackathonId: "h-1", slug: "test-pre-registration-abc", createdAt: "2026-01-01" },
      ])

      const res = await app.handle(
        new Request("http://localhost/api/admin/scenario-active")
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.active).toHaveLength(1)
      expect(data.active[0].scenarioName).toBe("pre-registration")
    })

    it("returns empty list when no scenarios have been run", async () => {
      mockResolvePrincipal.mockResolvedValue(adminPrincipal)

      const res = await app.handle(
        new Request("http://localhost/api/admin/scenario-active")
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.active).toHaveLength(0)
    })
  })

  describe("GET /admin/scenario-personas", () => {
    it("returns persona list with configured flag", async () => {
      mockResolvePrincipal.mockResolvedValue(adminPrincipal)

      const res = await app.handle(
        new Request("http://localhost/api/admin/scenario-personas")
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(Array.isArray(data.personas)).toBe(true)
      expect(data.personas[0]).toMatchObject({ key: expect.any(String), name: expect.any(String), configured: expect.any(Boolean) })
    })
  })

  describe("POST /admin/scenario-tokens", () => {
    it("returns role cards for a valid hackathon", async () => {
      mockResolvePrincipal.mockResolvedValue(adminPrincipal)
      mockFromResult = { data: { slug: "test-pre-registration-abc" }, error: null }
      mockGenerateRoleTokens.mockResolvedValue([
        { personaKey: "organizer", name: "Organizer", role: "organizer", loginUrl: "/dev-switch?token=tok", directUrl: "/hackathons/h-1" },
      ])

      const res = await app.handle(
        new Request("http://localhost/api/admin/scenario-tokens", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hackathon_id: "11111111-1111-1111-1111-111111111111" }),
        })
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.roles).toHaveLength(1)
      expect(mockGenerateRoleTokens).toHaveBeenCalledWith("11111111-1111-1111-1111-111111111111", "test-pre-registration-abc")
    })

    it("returns 404 when hackathon does not exist", async () => {
      mockResolvePrincipal.mockResolvedValue(adminPrincipal)
      mockFromResult = { data: null, error: null }

      const res = await app.handle(
        new Request("http://localhost/api/admin/scenario-tokens", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hackathon_id: "99999999-9999-9999-9999-999999999999" }),
        })
      )

      expect(res.status).toBe(404)
    })

    it("rejects read-only API key", async () => {
      mockResolvePrincipal.mockResolvedValue(readOnlyApiKeyPrincipal)

      const res = await app.handle(
        new Request("http://localhost/api/admin/scenario-tokens", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hackathon_id: "11111111-1111-1111-1111-111111111111" }),
        })
      )

      expect(res.status).toBe(403)
    })
  })

  describe("POST /admin/scenario-switch", () => {
    it("returns login URL for known persona when env var is set", async () => {
      mockResolvePrincipal.mockResolvedValue(adminPrincipal)
      process.env.SCENARIO_DEV_USER_ID = "user_organizer_test"

      const res = await app.handle(
        new Request("http://localhost/api/admin/scenario-switch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ persona: "organizer", redirect: "/hackathons/h-1" }),
        })
      )
      const data = await res.json()

      delete process.env.SCENARIO_DEV_USER_ID
      expect(res.status).toBe(200)
      expect(data.loginUrl).toContain("/dev-switch?token=tok_test")
      expect(data.loginUrl).toContain(encodeURIComponent("/hackathons/h-1"))
    })

    it("returns 400 for unknown persona", async () => {
      mockResolvePrincipal.mockResolvedValue(adminPrincipal)

      const res = await app.handle(
        new Request("http://localhost/api/admin/scenario-switch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ persona: "unknown-persona" }),
        })
      )

      expect(res.status).toBe(422)
    })

    it("uses safe redirect fallback for external URLs", async () => {
      mockResolvePrincipal.mockResolvedValue(adminPrincipal)
      process.env.SCENARIO_DEV_USER_ID = "user_organizer_test"

      const res = await app.handle(
        new Request("http://localhost/api/admin/scenario-switch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ persona: "organizer", redirect: "https://evil.com" }),
        })
      )
      const data = await res.json()

      delete process.env.SCENARIO_DEV_USER_ID
      expect(res.status).toBe(200)
      expect(data.loginUrl).toContain(encodeURIComponent("/home"))
      expect(data.loginUrl).not.toContain("evil.com")
    })

    it("rejects read-only API key", async () => {
      mockResolvePrincipal.mockResolvedValue(readOnlyApiKeyPrincipal)

      const res = await app.handle(
        new Request("http://localhost/api/admin/scenario-switch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ persona: "organizer" }),
        })
      )

      expect(res.status).toBe(403)
    })

    it("falls back to SCENARIO_ORG_ID when org_id is omitted", async () => {
      mockResolvePrincipal.mockResolvedValue(adminPrincipal)
      process.env.SCENARIO_DEV_USER_ID = "user_organizer_test"
      process.env.SCENARIO_ORG_ID = "org_default_scenario"

      const res = await app.handle(
        new Request("http://localhost/api/admin/scenario-switch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ persona: "organizer", redirect: "/home" }),
        })
      )
      const data = await res.json()

      delete process.env.SCENARIO_DEV_USER_ID
      delete process.env.SCENARIO_ORG_ID
      expect(res.status).toBe(200)
      expect(data.loginUrl).toContain("&org=org_default_scenario")
    })

    it("does not use SCENARIO_ORG_ID for attendee personas by default", async () => {
      mockResolvePrincipal.mockResolvedValue(adminPrincipal)
      process.env.TEST_USER_1_ID = "user_attendee_test"
      process.env.SCENARIO_ORG_ID = "org_default_scenario"

      const res = await app.handle(
        new Request("http://localhost/api/admin/scenario-switch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ persona: "user1", redirect: "/e/demo" }),
        })
      )
      const data = await res.json()

      delete process.env.TEST_USER_1_ID
      delete process.env.SCENARIO_ORG_ID
      expect(res.status).toBe(200)
      expect(data.loginUrl).not.toContain("&org=")
    })

    it("skips org activation when org_id is explicitly null", async () => {
      mockResolvePrincipal.mockResolvedValue(adminPrincipal)
      process.env.SCENARIO_DEV_USER_ID = "user_organizer_test"
      process.env.SCENARIO_ORG_ID = "org_default_scenario"

      const res = await app.handle(
        new Request("http://localhost/api/admin/scenario-switch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ persona: "organizer", redirect: "/home", org_id: null }),
        })
      )
      const data = await res.json()

      delete process.env.SCENARIO_DEV_USER_ID
      delete process.env.SCENARIO_ORG_ID
      expect(res.status).toBe(200)
      expect(data.loginUrl).not.toContain("&org=")
    })

    it("uses explicit org_id over SCENARIO_ORG_ID fallback", async () => {
      mockResolvePrincipal.mockResolvedValue(adminPrincipal)
      process.env.SCENARIO_DEV_USER_ID = "user_organizer_test"
      process.env.SCENARIO_ORG_ID = "org_default_scenario"

      const res = await app.handle(
        new Request("http://localhost/api/admin/scenario-switch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            persona: "organizer",
            redirect: "/home",
            org_id: "org_specific",
          }),
        })
      )
      const data = await res.json()

      delete process.env.SCENARIO_DEV_USER_ID
      delete process.env.SCENARIO_ORG_ID
      expect(res.status).toBe(200)
      expect(data.loginUrl).toContain("&org=org_specific")
      expect(data.loginUrl).not.toContain("org_default_scenario")
    })
  })

  describe("Per-endpoint scope enforcement", () => {
    it("allows read-only API key to access GET /admin/stats", async () => {
      mockResolvePrincipal.mockResolvedValue(readOnlyApiKeyPrincipal)

      const res = await app.handle(
        new Request("http://localhost/api/admin/stats")
      )

      expect(res.status).toBe(200)
    })

    it("allows read-only API key to access GET /admin/hackathons", async () => {
      mockResolvePrincipal.mockResolvedValue(readOnlyApiKeyPrincipal)

      const res = await app.handle(
        new Request("http://localhost/api/admin/hackathons")
      )

      expect(res.status).toBe(200)
    })

    it("rejects read-only API key on PATCH /admin/hackathons/:id", async () => {
      mockResolvePrincipal.mockResolvedValue(readOnlyApiKeyPrincipal)
      mockGetHackathonById.mockResolvedValue({
        id: "h-1",
        name: "Test",
        tenant_id: "t-1",
      })

      const res = await app.handle(
        new Request("http://localhost/api/admin/hackathons/h-1", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "New Name" }),
        })
      )

      expect(res.status).toBe(403)
      expect(mockUpdateHackathonAsAdmin).not.toHaveBeenCalled()
    })

    it("rejects read-only API key on DELETE /admin/hackathons/:id", async () => {
      mockResolvePrincipal.mockResolvedValue(readOnlyApiKeyPrincipal)
      mockGetHackathonById.mockResolvedValue({
        id: "h-1",
        name: "Doomed",
        tenant_id: "t-1",
      })

      const res = await app.handle(
        new Request("http://localhost/api/admin/hackathons/h-1", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirm_name: "Doomed" }),
        })
      )

      expect(res.status).toBe(403)
      expect(mockDeleteHackathon).not.toHaveBeenCalled()
    })

    it("rejects read-only API key on POST /admin/scenario-run/:name", async () => {
      mockResolvePrincipal.mockResolvedValue(readOnlyApiKeyPrincipal)

      const res = await app.handle(
        new Request("http://localhost/api/admin/scenario-run/pre-registration", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        })
      )

      expect(res.status).toBe(403)
      expect(mockRunScenario).not.toHaveBeenCalled()
    })
  })

  describe("POST /admin/maintenance/cleanup-rate-limits", () => {
    it("returns deleted count for admin", async () => {
      mockResolvePrincipal.mockResolvedValue(adminPrincipal)
      mockRpc.mockResolvedValue({ data: 37, error: null })

      const res = await app.handle(
        new Request("http://localhost/api/admin/maintenance/cleanup-rate-limits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        })
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.deleted).toBe(37)
    })

    it("passes limit param to RPC", async () => {
      mockResolvePrincipal.mockResolvedValue(adminPrincipal)

      await app.handle(
        new Request("http://localhost/api/admin/maintenance/cleanup-rate-limits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ limit: 500 }),
        })
      )

      expect(mockRpc).toHaveBeenCalledWith("cleanup_expired_rate_limits", { p_limit: 500 })
    })

    it("uses default limit of 1000 when not specified", async () => {
      mockResolvePrincipal.mockResolvedValue(adminPrincipal)

      await app.handle(
        new Request("http://localhost/api/admin/maintenance/cleanup-rate-limits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        })
      )

      expect(mockRpc).toHaveBeenCalledWith("cleanup_expired_rate_limits", { p_limit: 1000 })
    })

    it("rejects read-only API key (requires admin:write)", async () => {
      mockResolvePrincipal.mockResolvedValue(readOnlyApiKeyPrincipal)

      const res = await app.handle(
        new Request("http://localhost/api/admin/maintenance/cleanup-rate-limits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        })
      )

      expect(res.status).toBe(403)
      expect(mockRpc).not.toHaveBeenCalled()
    })

    it("returns 500 on RPC error", async () => {
      mockResolvePrincipal.mockResolvedValue(adminPrincipal)
      mockRpc.mockResolvedValue({ data: null, error: { message: "connection failed" } })

      const res = await app.handle(
        new Request("http://localhost/api/admin/maintenance/cleanup-rate-limits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        })
      )

      expect(res.status).toBe(500)
    })
  })

  describe("Critical audit logging", () => {
    it("logs audit with critical flag on PATCH", async () => {
      mockResolvePrincipal.mockResolvedValue(adminPrincipal)
      mockGetHackathonById.mockResolvedValue({
        id: "h-1",
        name: "Test",
        tenant_id: "t-1",
      })
      mockUpdateHackathonAsAdmin.mockResolvedValue({ id: "h-1", name: "Updated" })

      await app.handle(
        new Request("http://localhost/api/admin/hackathons/h-1", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Updated" }),
        })
      )

      expect(mockLogAudit).toHaveBeenCalledWith(
        expect.objectContaining({ critical: true })
      )
    })

    it("deletes before logging audit (delete-then-audit order)", async () => {
      const callOrder: string[] = []
      mockResolvePrincipal.mockResolvedValue(adminPrincipal)
      mockGetHackathonById.mockResolvedValue({
        id: "h-1",
        name: "Doomed",
        slug: "doomed",
        tenant_id: "t-1",
      })
      mockLogAudit.mockImplementation(() => {
        callOrder.push("audit")
        return Promise.resolve(null)
      })
      mockDeleteHackathon.mockImplementation(() => {
        callOrder.push("delete")
        return Promise.resolve()
      })

      await app.handle(
        new Request("http://localhost/api/admin/hackathons/h-1", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirm_name: "Doomed" }),
        })
      )

      expect(callOrder).toEqual(["delete", "audit"])
    })

    it("returns 500 when audit fails after successful delete", async () => {
      mockResolvePrincipal.mockResolvedValue(adminPrincipal)
      mockGetHackathonById.mockResolvedValue({
        id: "h-1",
        name: "Doomed",
        slug: "doomed",
        tenant_id: "t-1",
      })
      mockLogAudit.mockRejectedValue(new Error("Critical audit log failed: DB error"))

      const res = await app.handle(
        new Request("http://localhost/api/admin/hackathons/h-1", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirm_name: "Doomed" }),
        })
      )

      expect(res.status).toBe(500)
      expect(mockDeleteHackathon).toHaveBeenCalledWith("h-1")
    })
  })
})
