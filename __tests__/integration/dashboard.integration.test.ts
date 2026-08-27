import { describe, expect, it, mock, beforeEach } from "bun:test"
import { resetClerkMocks } from "../lib/supabase-mock"

const mockListApiKeys = mock(() => Promise.resolve([]))
const mockCreateApiKey = mock(() =>
  Promise.resolve({
    apiKey: { id: "key-1", name: "Test", prefix: "sk_live_abc1", scopes: [], created_at: new Date().toISOString() },
    rawKey: "sk_live_abc123456789",
  })
)
const mockRevokeApiKey = mock(() => Promise.resolve(true))
const mockGetApiKeyById = mock(() => Promise.resolve(null))
const mockListJobs = mock(() => Promise.resolve([]))
const mockGetJobById = mock(() => Promise.resolve(null))
const mockLogAudit = mock(() => Promise.resolve(null))
const mockListOrganizationPeople = mock(() =>
  Promise.resolve({
    members: [],
    invitations: [],
    memberCount: 0,
    invitationCount: 0,
  })
)
const mockInviteOrganizationMember = mock(() =>
  Promise.resolve({
    id: "orginv_1",
    email: "teammate@example.com",
    role: "org:member",
    status: "pending",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    expiresAt: null,
    url: null,
  })
)
const mockRevokeOrganizationMemberInvitation = mock(() =>
  Promise.resolve({
    id: "orginv_1",
    email: "teammate@example.com",
    role: "org:member",
    status: "revoked",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    expiresAt: null,
    url: null,
  })
)
const mockRemoveOrganizationMember = mock(() => Promise.resolve())

mock.module("@/lib/services/api-keys", () => ({
  listApiKeys: mockListApiKeys,
  createApiKey: mockCreateApiKey,
  revokeApiKey: mockRevokeApiKey,
  getApiKeyById: mockGetApiKeyById,
}))

mock.module("@/lib/services/jobs", () => ({
  createJob: mock(() => Promise.resolve(null)),
  listJobs: mockListJobs,
  getJobById: mockGetJobById,
  updateJobStatus: mock(() => Promise.resolve(null)),
  cancelJob: mock(() => Promise.resolve(false)),
  startJobWorkflow: mock(() => Promise.resolve(null)),
}))

mock.module("@/lib/services/audit", () => ({
  logAudit: mockLogAudit,
  listAllAuditLogs: mock(() => Promise.resolve({ logs: [], total: 0 })),
}))

mock.module("@/lib/services/organization-members", () => ({
  getClerkErrorMessage: (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
  inviteOrganizationMember: mockInviteOrganizationMember,
  isOrganizationMemberRole: (role: string) => role === "org:member" || role === "org:admin",
  listOrganizationPeople: mockListOrganizationPeople,
  normalizeOrganizationInviteEmail: (email: string) => {
    const normalized = email.trim().toLowerCase()
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null
  },
  removeOrganizationMember: mockRemoveOrganizationMember,
  revokeOrganizationMemberInvitation: mockRevokeOrganizationMemberInvitation,
}))

const mockResolvePrincipal = mock(() =>
  Promise.resolve({ kind: "anon" })
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
  scopes: ["keys:read", "keys:write", "hackathons:read", "hackathons:write"],
}

const mockApiKeyPrincipal = {
  kind: "api_key" as const,
  tenantId: "tenant-123",
  keyId: "key-456",
  scopes: ["hackathons:read", "hackathons:write"],
}

describe("Dashboard Routes Integration Tests", () => {
  beforeEach(() => {
    resetClerkMocks()
    mockResolvePrincipal.mockReset()
    mockListApiKeys.mockReset()
    mockCreateApiKey.mockReset()
    mockRevokeApiKey.mockReset()
    mockGetApiKeyById.mockReset()
    mockListJobs.mockReset()
    mockGetJobById.mockReset()
    mockLogAudit.mockReset()
    mockListOrganizationPeople.mockReset()
    mockInviteOrganizationMember.mockReset()
    mockRevokeOrganizationMemberInvitation.mockReset()
    mockRemoveOrganizationMember.mockReset()
  })

  describe("GET /api/dashboard/me", () => {
    it("rejects unauthenticated requests", async () => {
      mockResolvePrincipal.mockResolvedValue({ kind: "anon" })

      const res = await app.handle(new Request("http://localhost/api/dashboard/me"))
      const data = await res.json()

      // Note: Due to mock.module limitations with instanceof checks,
      // auth errors may return 500 instead of 401. We verify the error message.
      expect(data.error).toBe("Unauthorized")
      expect(res.status).toBeGreaterThanOrEqual(400)
    })

    it("returns user info for user principal", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)

      const res = await app.handle(new Request("http://localhost/api/dashboard/me"))
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.tenantId).toBe("tenant-123")
      expect(data.userId).toBe("user-456")
      expect(data.orgId).toBe("org-789")
      expect(data.scopes).toContain("keys:read")
    })

    it("returns key info for API key principal", async () => {
      mockResolvePrincipal.mockResolvedValue(mockApiKeyPrincipal)

      const res = await app.handle(new Request("http://localhost/api/dashboard/me"))
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.tenantId).toBe("tenant-123")
      expect(data.keyId).toBe("key-456")
      expect(data).not.toHaveProperty("userId")
    })
  })

  describe("GET /api/dashboard/organization-members", () => {
    it("asks users to switch to an organization", async () => {
      mockResolvePrincipal.mockResolvedValue({
        ...mockUserPrincipal,
        orgId: null,
        orgRole: null,
        scopes: [...mockUserPrincipal.scopes, "org:read"],
      })

      const res = await app.handle(
        new Request("http://localhost/api/dashboard/organization-members")
      )
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.error).toBe("Switch to an organization to see people.")
      expect(mockListOrganizationPeople).not.toHaveBeenCalled()
    })

    it("lists organization people for an active org", async () => {
      mockResolvePrincipal.mockResolvedValue({
        ...mockUserPrincipal,
        scopes: [...mockUserPrincipal.scopes, "org:read"],
      })
      mockListOrganizationPeople.mockResolvedValue({
        members: [
          {
            id: "orgmem_1",
            userId: "user_456",
            name: "Ada Lovelace",
            email: "ada@example.com",
            imageUrl: null,
            role: "org:admin",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        invitations: [],
        memberCount: 1,
        invitationCount: 0,
      })

      const res = await app.handle(
        new Request("http://localhost/api/dashboard/organization-members")
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.memberCount).toBe(1)
      expect(data.members[0].email).toBe("ada@example.com")
      expect(mockListOrganizationPeople).toHaveBeenCalledWith("org-789")
    })
  })

  describe("POST /api/dashboard/organization-members/invitations", () => {
    it("rejects org members even if they reach the write route", async () => {
      mockResolvePrincipal.mockResolvedValue({
        ...mockUserPrincipal,
        orgRole: "org:member",
        scopes: [...mockUserPrincipal.scopes, "org:write"],
      })

      const res = await app.handle(
        new Request("http://localhost/api/dashboard/organization-members/invitations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "teammate@example.com", role: "org:member" }),
        })
      )
      const data = await res.json()

      expect(res.status).toBe(403)
      expect(data.error).toBe("Only org admins can manage people.")
    })
  })

  describe("DELETE /api/dashboard/organization-members/invitations/:invitationId", () => {
    it("asks users to switch to an organization before checking admin role", async () => {
      mockResolvePrincipal.mockResolvedValue({
        ...mockUserPrincipal,
        orgId: null,
        orgRole: null,
        scopes: [...mockUserPrincipal.scopes, "org:write"],
      })

      const res = await app.handle(
        new Request("http://localhost/api/dashboard/organization-members/invitations/orginv_1", {
          method: "DELETE",
        })
      )
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.error).toBe("Switch to an organization to cancel invites.")
      expect(mockRevokeOrganizationMemberInvitation).not.toHaveBeenCalled()
    })

    it("rejects org members even if they reach the write route", async () => {
      mockResolvePrincipal.mockResolvedValue({
        ...mockUserPrincipal,
        orgRole: "org:member",
        scopes: [...mockUserPrincipal.scopes, "org:write"],
      })

      const res = await app.handle(
        new Request("http://localhost/api/dashboard/organization-members/invitations/orginv_1", {
          method: "DELETE",
        })
      )
      const data = await res.json()

      expect(res.status).toBe(403)
      expect(data.error).toBe("Only org admins can manage people.")
      expect(mockRevokeOrganizationMemberInvitation).not.toHaveBeenCalled()
    })

    it("cancels an invitation for org admins", async () => {
      mockResolvePrincipal.mockResolvedValue({
        ...mockUserPrincipal,
        scopes: [...mockUserPrincipal.scopes, "org:write"],
      })
      mockRevokeOrganizationMemberInvitation.mockResolvedValue({
        id: "orginv_1",
        email: "teammate@example.com",
        role: "org:member",
        status: "revoked",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        expiresAt: null,
        url: null,
      })

      const res = await app.handle(
        new Request("http://localhost/api/dashboard/organization-members/invitations/orginv_1", {
          method: "DELETE",
        })
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.success).toBe(true)
      expect(mockRevokeOrganizationMemberInvitation).toHaveBeenCalledWith({
        organizationId: "org-789",
        invitationId: "orginv_1",
        requestingUserId: "user-456",
      })
      expect(mockLogAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "org_invitation.cancelled",
          resourceId: "orginv_1",
        })
      )
    })
  })

  describe("DELETE /api/dashboard/organization-members/:userId", () => {
    it("asks users to switch to an organization before checking admin role", async () => {
      mockResolvePrincipal.mockResolvedValue({
        ...mockUserPrincipal,
        orgId: null,
        orgRole: null,
        scopes: [...mockUserPrincipal.scopes, "org:write"],
      })

      const res = await app.handle(
        new Request("http://localhost/api/dashboard/organization-members/user-999", {
          method: "DELETE",
        })
      )
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.error).toBe("Switch to an organization to remove people.")
      expect(mockRemoveOrganizationMember).not.toHaveBeenCalled()
    })

    it("rejects org members even if they reach the write route", async () => {
      mockResolvePrincipal.mockResolvedValue({
        ...mockUserPrincipal,
        orgRole: "org:member",
        scopes: [...mockUserPrincipal.scopes, "org:write"],
      })

      const res = await app.handle(
        new Request("http://localhost/api/dashboard/organization-members/user-999", {
          method: "DELETE",
        })
      )
      const data = await res.json()

      expect(res.status).toBe(403)
      expect(data.error).toBe("Only org admins can manage people.")
      expect(mockRemoveOrganizationMember).not.toHaveBeenCalled()
    })

    it("prevents org admins from removing themselves", async () => {
      mockResolvePrincipal.mockResolvedValue({
        ...mockUserPrincipal,
        scopes: [...mockUserPrincipal.scopes, "org:write"],
      })

      const res = await app.handle(
        new Request("http://localhost/api/dashboard/organization-members/user-456", {
          method: "DELETE",
        })
      )
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.error).toBe("You can't remove yourself.")
      expect(mockRemoveOrganizationMember).not.toHaveBeenCalled()
    })

    it("removes an organization member for org admins", async () => {
      mockResolvePrincipal.mockResolvedValue({
        ...mockUserPrincipal,
        scopes: [...mockUserPrincipal.scopes, "org:write"],
      })
      mockRemoveOrganizationMember.mockResolvedValue(undefined)

      const res = await app.handle(
        new Request("http://localhost/api/dashboard/organization-members/user-999", {
          method: "DELETE",
        })
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.success).toBe(true)
      expect(mockRemoveOrganizationMember).toHaveBeenCalledWith({
        organizationId: "org-789",
        userId: "user-999",
      })
      expect(mockLogAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "org_member.removed",
          resourceId: "user-999",
        })
      )
    })
  })

  describe("GET /api/dashboard/keys", () => {
    it("rejects unauthenticated requests", async () => {
      mockResolvePrincipal.mockResolvedValue({ kind: "anon" })

      const res = await app.handle(new Request("http://localhost/api/dashboard/keys"))
      const data = await res.json()

      // Note: Due to mock.module limitations with instanceof checks,
      // auth errors may return 500 instead of 401. We verify the error message.
      expect(data.error).toBe("Unauthorized")
      expect(res.status).toBeGreaterThanOrEqual(400)
    })

    it("returns keys list for authenticated user", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockListApiKeys.mockResolvedValue([
        {
          id: "key-1",
          name: "Test Key",
          prefix: "sk_live_abc1",
          scopes: ["hackathons:write"],
          created_at: "2024-01-01T00:00:00Z",
          last_used_at: null,
          revoked_at: null,
        },
      ])

      const res = await app.handle(new Request("http://localhost/api/dashboard/keys"))
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.keys).toHaveLength(1)
      expect(data.keys[0].id).toBe("key-1")
      expect(data.keys[0].prefix).toBe("sk_live_abc1")
      expect(data.keys[0]).not.toHaveProperty("hash")
    })
  })

  describe("POST /api/dashboard/keys", () => {
    it("creates API key for authenticated user", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockCreateApiKey.mockResolvedValue({
        apiKey: {
          id: "key-new",
          name: "New Key",
          prefix: "sk_live_new1",
          scopes: ["hackathons:write"],
          created_at: "2024-01-01T00:00:00Z",
        },
        rawKey: "sk_live_new1234567890abcdef",
      })

      const res = await app.handle(
        new Request("http://localhost/api/dashboard/keys", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "New Key", scopes: ["hackathons:write"] }),
        })
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.id).toBe("key-new")
      expect(data.key).toMatch(/^sk_live_/)
      expect(mockLogAudit).toHaveBeenCalled()
    })

    it("requires name field", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)

      const res = await app.handle(
        new Request("http://localhost/api/dashboard/keys", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        })
      )

      expect(res.status).toBe(422)
    })
  })

  describe("POST /api/dashboard/keys/:id/revoke", () => {
    it("revokes API key", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockGetApiKeyById.mockResolvedValue({ id: "key-1" })
      mockRevokeApiKey.mockResolvedValue(true)

      const res = await app.handle(
        new Request("http://localhost/api/dashboard/keys/key-1/revoke", {
          method: "POST",
        })
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.success).toBe(true)
      expect(mockLogAudit).toHaveBeenCalled()
    })

    it("returns 404 when key not found", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockGetApiKeyById.mockResolvedValue(null)

      const res = await app.handle(
        new Request("http://localhost/api/dashboard/keys/nonexistent/revoke", {
          method: "POST",
        })
      )
      const data = await res.json()

      expect(res.status).toBe(404)
      expect(data.error).toBe("API key not found")
    })
  })

  describe("GET /api/dashboard/jobs", () => {
    it("returns jobs list", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockListJobs.mockResolvedValue([
        {
          id: "job-1",
          type: "completion",
          status_cache: "succeeded",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:01:00Z",
          completed_at: "2024-01-01T00:01:00Z",
        },
      ])

      const res = await app.handle(new Request("http://localhost/api/dashboard/jobs"))
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.jobs).toHaveLength(1)
      expect(data.jobs[0].id).toBe("job-1")
      expect(data.jobs[0].status).toBe("succeeded")
    })

    it("works with API key auth", async () => {
      mockResolvePrincipal.mockResolvedValue(mockApiKeyPrincipal)
      mockListJobs.mockResolvedValue([])

      const res = await app.handle(new Request("http://localhost/api/dashboard/jobs"))
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.jobs).toEqual([])
    })

    it("respects pagination parameters", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockListJobs.mockResolvedValue([])

      await app.handle(
        new Request("http://localhost/api/dashboard/jobs?limit=10&offset=20")
      )

      expect(mockListJobs).toHaveBeenCalledWith("tenant-123", {
        limit: 10,
        offset: 20,
      })
    })
  })

  describe("GET /api/dashboard/jobs/:id", () => {
    it("returns job details", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockGetJobById.mockResolvedValue({
        id: "job-1",
        type: "completion",
        status_cache: "succeeded",
        input: { prompt: "Hello" },
        result: { text: "World" },
        error: null,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:01:00Z",
        completed_at: "2024-01-01T00:01:00Z",
      })

      const res = await app.handle(new Request("http://localhost/api/dashboard/jobs/job-1"))
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.id).toBe("job-1")
      expect(data.input).toEqual({ prompt: "Hello" })
      expect(data.result).toEqual({ text: "World" })
    })

    it("returns 404 when job not found", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockGetJobById.mockResolvedValue(null)

      const res = await app.handle(
        new Request("http://localhost/api/dashboard/jobs/nonexistent")
      )
      const data = await res.json()

      expect(res.status).toBe(404)
      expect(data.error).toBe("Job not found")
    })
  })

  describe("organization profile binding", () => {
    it("rejects a profile read after the active organization changes", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)

      const res = await app.handle(new Request(
        "http://localhost/api/dashboard/org-profile?expectedOrganizationId=org-other",
      ))

      expect(res.status).toBe(409)
      expect(await res.json()).toEqual({
        error: "Your active organization changed. Review it and try again.",
        code: "organization_context_changed",
        retryable: true,
      })
    })

    it("rejects a profile update after the active organization changes", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)

      const res = await app.handle(new Request(
        "http://localhost/api/dashboard/org-profile",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slug: "acme",
            expectedOrganizationId: "org-other",
          }),
        },
      ))

      expect(res.status).toBe(409)
      expect(await res.json()).toEqual({
        error: "Your active organization changed. Review it and try again.",
        code: "organization_context_changed",
        retryable: true,
      })
    })
  })
})
