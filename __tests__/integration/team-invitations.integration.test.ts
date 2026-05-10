import { describe, expect, it, mock, beforeEach } from "bun:test"

const mockAuth = mock(() => Promise.resolve({ userId: null }))
const mockClerkClient = mock(() =>
  Promise.resolve({
    organizations: {
      getOrganization: mock(() => Promise.resolve({ name: "Test Org" })),
    },
    users: {
      getUser: mock(() =>
        Promise.resolve({
          primaryEmailAddress: { emailAddress: "user@example.com" },
        })
      ),
    },
  })
)

mock.module("@clerk/nextjs/server", () => ({
  auth: mockAuth,
  clerkClient: mockClerkClient,
}))

const mockGetInvitationByToken = mock(() => Promise.resolve(null))
const mockAcceptTeamInvitation = mock(() =>
  Promise.resolve({ success: true, teamId: "team_1", hackathonId: "h1" })
)
const mockDeclineTeamInvitation = mock(() => Promise.resolve({ success: true }))
const mockCreateTeamInvitation = mock(() =>
  Promise.resolve({
    success: true,
    invitation: {
      id: "inv_1",
      email: "test@example.com",
      token: "abc123",
      expires_at: new Date().toISOString(),
    },
  })
)
const mockListTeamInvitations = mock(() => Promise.resolve({ success: true, invitations: [] }))
const mockCancelTeamInvitation = mock(() => Promise.resolve({ success: true }))
const mockGetTeamWithHackathon = mock(() =>
  Promise.resolve({
    name: "Test Team",
    hackathon: { name: "Test Hackathon", slug: "test-hackathon", status: "active", starts_at: "2025-06-01T00:00:00Z", ends_at: "2025-06-02T00:00:00Z" },
    memberNames: [],
  })
)
const mockMarkTeamInvitationEmailed = mock(() => Promise.resolve())
const mockSendPendingTeamInvitationEmails = mock(() => Promise.resolve({ sent: 0, total: 0, failedEmails: [] }))
const mockRemindTeamInvitation = mock(() =>
  Promise.resolve({
    success: true,
    invitation: {
      id: "inv_1",
      email: "invitee@example.com",
      token: "abc123",
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    },
  })
)

mock.module("@/lib/services/team-invitations", () => ({
  getInvitationByToken: mockGetInvitationByToken,
  acceptTeamInvitation: mockAcceptTeamInvitation,
  declineTeamInvitation: mockDeclineTeamInvitation,
  createTeamInvitation: mockCreateTeamInvitation,
  listTeamInvitations: mockListTeamInvitations,
  cancelTeamInvitation: mockCancelTeamInvitation,
  getTeamWithHackathon: mockGetTeamWithHackathon,
  remindTeamInvitation: mockRemindTeamInvitation,
  markTeamInvitationEmailed: mockMarkTeamInvitationEmailed,
  sendPendingTeamInvitationEmails: mockSendPendingTeamInvitationEmails,
}))

const mockCurrentTermsHash = mock(() => Promise.resolve(null as string | null))
const mockRecordTermsAcceptance = mock(() => Promise.resolve())

mock.module("@/lib/services/hackathon-terms", () => ({
  currentTermsHash: mockCurrentTermsHash,
  recordTermsAcceptance: mockRecordTermsAcceptance,
}))

const mockGetPublicHackathonById = mock(() => Promise.resolve({ slug: "test-hackathon" }))

mock.module("@/lib/services/public-hackathons", () => ({
  getPublicHackathon: mock(() => Promise.resolve(null)),
  getPublicHackathonById: mockGetPublicHackathonById,
  listPublicHackathons: mock(() => Promise.resolve({ hackathons: [], total: 0 })),
  getHackathonByIdForOrganizer: mock(() => Promise.resolve(null)),
  checkHackathonOrganizer: mock(() => Promise.resolve({ status: "not_found" })),
  getHackathonByIdWithFullData: mock(() => Promise.resolve(null)),
  getHackathonByIdWithAccess: mock(() => Promise.resolve(null)),
  updateHackathonSettings: mock(() => Promise.resolve(null)),
}))

const mockSendTeamInvitationEmail = mock(() => Promise.resolve({ success: true }))
const mockSendTeamInvitationReminderEmail = mock(() => Promise.resolve({ success: true }))

mock.module("@/lib/email/team-invitations", () => ({
  sendTeamInvitationEmail: mockSendTeamInvitationEmail,
  sendTeamInvitationReminderEmail: mockSendTeamInvitationReminderEmail,
}))

const mockResolveAdderName = mock(() => Promise.resolve("Test User"))
const mockResolveAdderEmail = mock(() => Promise.resolve("test-user@example.com"))

mock.module("@/lib/auth/resolve-adder-name", () => ({
  resolveAdderName: mockResolveAdderName,
  resolveAdderEmail: mockResolveAdderEmail,
}))

const mockWorkflowStart = mock(() => Promise.resolve({ runId: "run_1" }))
mock.module("workflow/api", () => ({ start: mockWorkflowStart }))
mock.module("@/lib/workflows/team-invitations", () => ({
  sendTeamInvitationWorkflow: mock(() => Promise.resolve()),
}))

const mockLogAudit = mock(() => Promise.resolve())

mock.module("@/lib/services/audit", () => ({
  logAudit: mockLogAudit,
  listAllAuditLogs: mock(() => Promise.resolve({ logs: [], total: 0 })),
}))

const mockCheckRateLimit = mock(() => ({ allowed: true, remaining: 9, resetAt: Date.now() + 60000 }))

mock.module("@/lib/services/rate-limit", () => ({
  checkRateLimit: mockCheckRateLimit,
  getRateLimitHeaders: () => ({}),
  defaultRateLimits: { "api_key:default": { maxRequests: 100, windowMs: 60000 } },
  RateLimitError: class RateLimitError extends Error {
    remaining: number
    resetAt: number
    constructor(resetAt: number, remaining: number) {
      super("Rate limit exceeded")
      this.remaining = remaining
      this.resetAt = resetAt
    }
  },
}))

mock.module("@/lib/services/hackathons", () => ({
  registerForHackathon: mock(() => Promise.resolve({ success: true })),
  getParticipantCount: mock(() => Promise.resolve(0)),
  isUserRegistered: mock(() => Promise.resolve(false)),
}))

mock.module("@/lib/services/tenant-profiles", () => ({
  getPublicTenantWithEvents: mock(() => Promise.resolve(null)),
}))

mock.module("@/lib/integrations/oauth", () => ({
  exchangeCodeForTokens: mock(() => Promise.resolve(null)),
  saveIntegration: mock(() => Promise.resolve()),
  getProviderConfig: mock(() => null),
}))

const mockResolvePrincipal = mock(() =>
  Promise.resolve({
    kind: "user" as const,
    tenantId: "tenant_1",
    userId: "user_captain",
    orgId: "org_1",
    orgRole: "admin",
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
    requirePrincipal: (principal: unknown, _kinds: string[]) => {
      if (!principal || (principal as { kind: string }).kind === "anonymous") {
        throw new AuthError("Unauthorized", 401)
      }
    },
    isAdminEnabled: () => true,
    requireAdmin: (principal: { kind: string }) => {
      if (principal.kind !== "admin") throw new AuthError("Forbidden", 403)
    },
    requireAdminScopes: () => {},
    AuthError,
  }
})

const { Elysia } = await import("elysia")
const { publicRoutes } = await import("@/lib/api/routes/public")
const { dashboardRoutes } = await import("@/lib/api/routes/dashboard")
const { handleRouteError } = await import("@/lib/api/routes/errors")

const publicApp = new Elysia({ prefix: "/api" }).use(publicRoutes)
const dashboardApp = new Elysia({ prefix: "/api" })
  .onError(({ error, set, path }) => handleRouteError(error, set, path))
  .use(dashboardRoutes)

const mockInvitation = {
  id: "inv_1",
  status: "pending",
  team: { name: "Test Team" },
  hackathon: {
    id: "h1",
    name: "Test Hackathon",
    slug: "test-hackathon",
    status: "active",
    require_terms_acceptance: false,
    terms_content: null,
  },
  email: "invitee@example.com",
  expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
}

describe("Team Invitations API Routes", () => {
  beforeEach(() => {
    mockAuth.mockReset()
    mockAuth.mockResolvedValue({ userId: null })
    mockGetInvitationByToken.mockReset()
    mockAcceptTeamInvitation.mockReset()
    mockDeclineTeamInvitation.mockReset()
    mockCreateTeamInvitation.mockReset()
    mockListTeamInvitations.mockReset()
    mockCancelTeamInvitation.mockReset()
    mockGetTeamWithHackathon.mockReset()
    mockRemindTeamInvitation.mockReset()
    mockGetPublicHackathonById.mockReset()
    mockSendTeamInvitationEmail.mockReset()
    mockSendTeamInvitationReminderEmail.mockReset()
    mockResolveAdderName.mockReset()
    mockLogAudit.mockReset()
    mockCheckRateLimit.mockReset()
    mockCurrentTermsHash.mockReset()
    mockRecordTermsAcceptance.mockReset()
    mockCurrentTermsHash.mockResolvedValue(null)
    mockGetTeamWithHackathon.mockResolvedValue({
      name: "Test Team",
      hackathon: { name: "Test Hackathon", slug: "test-hackathon" },
    })
    mockRemindTeamInvitation.mockResolvedValue({
      success: true,
      invitation: {
        id: "inv_1",
        email: "invitee@example.com",
        token: "abc123",
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
    })
    mockResolveAdderName.mockResolvedValue("Test User")
    mockSendTeamInvitationReminderEmail.mockResolvedValue({ success: true })
    mockCheckRateLimit.mockReturnValue({ allowed: true, remaining: 9, resetAt: Date.now() + 60000 })
  })

  describe("GET /api/public/invitations/:token", () => {
    it("returns 404 when invitation not found", async () => {
      mockGetInvitationByToken.mockResolvedValue(null)

      const res = await publicApp.handle(
        new Request("http://localhost/api/public/invitations/invalid_token")
      )
      const data = await res.json()

      expect(res.status).toBe(404)
      expect(data.code).toBe("not_found")
    })

    it("returns invitation details when found", async () => {
      mockGetInvitationByToken.mockResolvedValue(mockInvitation)

      const res = await publicApp.handle(
        new Request("http://localhost/api/public/invitations/valid_token")
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.teamName).toBe("Test Team")
      expect(data.hackathonName).toBe("Test Hackathon")
      expect(data.status).toBe("pending")
    })

    it("marks invitation as expired if past expiry", async () => {
      const expiredInvitation = {
        ...mockInvitation,
        expires_at: new Date(Date.now() - 1000).toISOString(),
      }
      mockGetInvitationByToken.mockResolvedValue(expiredInvitation)

      const res = await publicApp.handle(
        new Request("http://localhost/api/public/invitations/expired_token")
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.status).toBe("expired")
    })

    it("returns already accepted status", async () => {
      const acceptedInvitation = { ...mockInvitation, status: "accepted" }
      mockGetInvitationByToken.mockResolvedValue(acceptedInvitation)

      const res = await publicApp.handle(
        new Request("http://localhost/api/public/invitations/accepted_token")
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.status).toBe("accepted")
    })
  })

  describe("POST /api/public/invitations/:token/accept", () => {
    it("returns 401 when not authenticated", async () => {
      mockAuth.mockResolvedValue({ userId: null })

      const res = await publicApp.handle(
        new Request("http://localhost/api/public/invitations/token123/accept", {
          method: "POST",
        })
      )
      const data = await res.json()

      expect(res.status).toBe(401)
      expect(data.code).toBe("not_authenticated")
    })

    it("accepts invitation successfully", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockAcceptTeamInvitation.mockResolvedValue({
        success: true,
        teamId: "team_1",
        hackathonId: "h1",
      })
      mockGetPublicHackathonById.mockResolvedValue({ slug: "test-hackathon" })

      const res = await publicApp.handle(
        new Request("http://localhost/api/public/invitations/valid_token/accept", {
          method: "POST",
        })
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.teamId).toBe("team_1")
      expect(data.hackathonSlug).toBe("test-hackathon")
    })

    it("returns error when accept fails", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockAcceptTeamInvitation.mockResolvedValue({
        success: false,
        error: "Invitation expired",
        code: "expired",
      })

      const res = await publicApp.handle(
        new Request("http://localhost/api/public/invitations/expired_token/accept", {
          method: "POST",
        })
      )
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.code).toBe("expired")
    })

    it("returns 404 when invitation not found", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockAcceptTeamInvitation.mockResolvedValue({
        success: false,
        error: "Not found",
        code: "not_found",
      })

      const res = await publicApp.handle(
        new Request("http://localhost/api/public/invitations/nonexistent/accept", {
          method: "POST",
        })
      )
      const data = await res.json()

      expect(res.status).toBe(404)
      expect(data.code).toBe("not_found")
    })

    it("returns 400 with at_capacity when event is full", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockAcceptTeamInvitation.mockResolvedValue({
        success: false,
        error: "Event is at full capacity",
        code: "at_capacity",
      })

      const res = await publicApp.handle(
        new Request("http://localhost/api/public/invitations/valid_token/accept", {
          method: "POST",
        })
      )
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.code).toBe("at_capacity")
      expect(data.error).toBe("Event is at full capacity")
    })

    it("calls acceptTeamInvitation with correct params", async () => {
      mockAuth.mockResolvedValue({ userId: "user_456" })
      mockAcceptTeamInvitation.mockResolvedValue({
        success: true,
        teamId: "team_1",
        hackathonId: "h1",
      })
      mockGetPublicHackathonById.mockResolvedValue({ slug: "test-hackathon" })

      await publicApp.handle(
        new Request("http://localhost/api/public/invitations/my_token/accept", {
          method: "POST",
        })
      )

      expect(mockAcceptTeamInvitation).toHaveBeenCalledWith("my_token", "user_456", "user@example.com")
    })

    it("returns 400 with terms_required when terms enabled and no hash provided", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetInvitationByToken.mockResolvedValue(mockInvitation)
      mockCurrentTermsHash.mockResolvedValue("expected-hash")

      const res = await publicApp.handle(
        new Request("http://localhost/api/public/invitations/valid_token/accept", {
          method: "POST",
        })
      )
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.code).toBe("terms_required")
      expect(mockAcceptTeamInvitation).not.toHaveBeenCalled()
    })

    it("returns 400 when terms hash does not match", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetInvitationByToken.mockResolvedValue(mockInvitation)
      mockCurrentTermsHash.mockResolvedValue("expected-hash")

      const res = await publicApp.handle(
        new Request("http://localhost/api/public/invitations/valid_token/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ terms_hash: "stale-hash" }),
        })
      )
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.code).toBe("terms_required")
      expect(mockAcceptTeamInvitation).not.toHaveBeenCalled()
    })

    it("accepts and records acceptance when terms hash matches", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetInvitationByToken.mockResolvedValue(mockInvitation)
      mockCurrentTermsHash.mockResolvedValue("expected-hash")
      mockAcceptTeamInvitation.mockResolvedValue({
        success: true,
        teamId: "team_1",
        hackathonId: "h1",
      })
      mockGetPublicHackathonById.mockResolvedValue({ slug: "test-hackathon" })

      const res = await publicApp.handle(
        new Request("http://localhost/api/public/invitations/valid_token/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ terms_hash: "expected-hash" }),
        })
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.success).toBe(true)
      expect(mockRecordTermsAcceptance).toHaveBeenCalledTimes(1)
    })

    it("does not record acceptance when invitation accept fails", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetInvitationByToken.mockResolvedValue(mockInvitation)
      mockCurrentTermsHash.mockResolvedValue("expected-hash")
      mockAcceptTeamInvitation.mockResolvedValue({
        success: false,
        error: "Invitation expired",
        code: "expired",
      })

      const res = await publicApp.handle(
        new Request("http://localhost/api/public/invitations/valid_token/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ terms_hash: "expected-hash" }),
        })
      )

      expect(res.status).toBe(400)
      expect(mockRecordTermsAcceptance).not.toHaveBeenCalled()
    })
  })

  describe("POST /api/public/invitations/:token/decline", () => {
    it("returns 401 when not authenticated", async () => {
      mockAuth.mockResolvedValue({ userId: null })

      const res = await publicApp.handle(
        new Request("http://localhost/api/public/invitations/token123/decline", {
          method: "POST",
        })
      )
      const data = await res.json()

      expect(res.status).toBe(401)
      expect(data.code).toBe("not_authenticated")
    })

    it("declines invitation successfully", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockDeclineTeamInvitation.mockResolvedValue({ success: true })

      const res = await publicApp.handle(
        new Request("http://localhost/api/public/invitations/valid_token/decline", {
          method: "POST",
        })
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.success).toBe(true)
    })

    it("returns error when email mismatch", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockDeclineTeamInvitation.mockResolvedValue({
        success: false,
        error: "Email mismatch",
        code: "email_mismatch",
      })

      const res = await publicApp.handle(
        new Request("http://localhost/api/public/invitations/token/decline", {
          method: "POST",
        })
      )
      const data = await res.json()

      expect(res.status).toBe(403)
      expect(data.code).toBe("email_mismatch")
    })

    it("returns 404 when invitation not found", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockDeclineTeamInvitation.mockResolvedValue({
        success: false,
        error: "Not found",
        code: "not_found",
      })

      const res = await publicApp.handle(
        new Request("http://localhost/api/public/invitations/nonexistent/decline", {
          method: "POST",
        })
      )
      const data = await res.json()

      expect(res.status).toBe(404)
      expect(data.code).toBe("not_found")
    })

    it("passes user email to declineTeamInvitation", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockDeclineTeamInvitation.mockResolvedValue({ success: true })

      await publicApp.handle(
        new Request("http://localhost/api/public/invitations/token/decline", {
          method: "POST",
        })
      )

      expect(mockDeclineTeamInvitation).toHaveBeenCalledWith("token", "user@example.com")
    })
  })
})

describe("Dashboard Team Invitations Routes", () => {
  beforeEach(async () => {
    mockAuth.mockReset()
    mockCreateTeamInvitation.mockReset()
    mockListTeamInvitations.mockReset()
    mockCancelTeamInvitation.mockReset()
    mockGetTeamWithHackathon.mockReset()
    mockSendTeamInvitationEmail.mockReset()
    mockSendTeamInvitationEmail.mockResolvedValue({ success: true })
    mockWorkflowStart.mockReset()
    mockWorkflowStart.mockResolvedValue({ runId: "run_1" })
    mockLogAudit.mockReset()
    mockCheckRateLimit.mockReset()
    mockCheckRateLimit.mockReturnValue({ allowed: true, remaining: 9, resetAt: Date.now() + 60000 })

    mockGetTeamWithHackathon.mockResolvedValue({
      name: "Test Team",
      hackathon: { name: "Test Hackathon", slug: "test-hackathon", starts_at: "2025-06-01T00:00:00Z", ends_at: "2025-06-02T00:00:00Z" },
      memberNames: [],
    })

    mockResolvePrincipal.mockResolvedValue({
      kind: "user",
      tenantId: "tenant_1",
      userId: "user_captain",
      orgId: "org_1",
      orgRole: "admin",
      scopes: ["hackathons:read", "hackathons:write"],
    })
  })

  describe("POST /api/dashboard/teams/:teamId/invitations", () => {
    it("creates invitation and sends email", async () => {
      mockCreateTeamInvitation.mockResolvedValue({
        success: true,
        invitation: {
          id: "inv_1",
          email: "test@example.com",
          token: "token123",
          expires_at: new Date().toISOString(),
        },
      })

      const res = await dashboardApp.handle(
        new Request("http://localhost/api/dashboard/teams/team_1/invitations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            hackathonId: "h1",
            email: "test@example.com",
            inviterName: "John Doe",
          }),
        })
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.id).toBe("inv_1")
      expect(data.email).toBe("test@example.com")
      expect(data.emailSent).toBeUndefined()
      expect(mockWorkflowStart).toHaveBeenCalled()
      expect(mockLogAudit).toHaveBeenCalled()
    })

    it("returns error when creation fails", async () => {
      mockCreateTeamInvitation.mockResolvedValue({
        success: false,
        error: "Team not found",
        code: "team_not_found",
      })

      const res = await dashboardApp.handle(
        new Request("http://localhost/api/dashboard/teams/team_1/invitations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            hackathonId: "h1",
            email: "test@example.com",
          }),
        })
      )
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.code).toBe("team_not_found")
    })

    it("uses default inviter name when not provided", async () => {
      mockCreateTeamInvitation.mockResolvedValue({
        success: true,
        invitation: {
          id: "inv_1",
          email: "test@example.com",
          token: "token123",
          expires_at: new Date().toISOString(),
        },
      })

      await dashboardApp.handle(
        new Request("http://localhost/api/dashboard/teams/team_1/invitations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            hackathonId: "h1",
            email: "test@example.com",
          }),
        })
      )

      expect(mockWorkflowStart).toHaveBeenCalledWith(
        expect.anything(),
        expect.arrayContaining([expect.objectContaining({ inviterName: "Your team captain" })])
      )
    })
  })

  describe("GET /api/dashboard/teams/:teamId/invitations", () => {
    it("returns list of invitations", async () => {
      mockListTeamInvitations.mockResolvedValue({
        success: true,
        invitations: [
          {
            id: "inv_1",
            email: "test1@example.com",
            status: "pending",
            expires_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
          },
          {
            id: "inv_2",
            email: "test2@example.com",
            status: "accepted",
            expires_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
          },
        ],
      })

      const res = await dashboardApp.handle(
        new Request("http://localhost/api/dashboard/teams/team_1/invitations")
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.invitations).toHaveLength(2)
      expect(data.invitations[0].email).toBe("test1@example.com")
    })

    it("filters by status when provided", async () => {
      mockListTeamInvitations.mockResolvedValue({ success: true, invitations: [] })

      await dashboardApp.handle(
        new Request("http://localhost/api/dashboard/teams/team_1/invitations?status=pending")
      )

      expect(mockListTeamInvitations).toHaveBeenCalledWith("team_1", "user_captain", { status: "pending" })
    })
  })

  describe("DELETE /api/dashboard/teams/:teamId/invitations/:invitationId", () => {
    it("cancels invitation successfully", async () => {
      mockCancelTeamInvitation.mockResolvedValue({ success: true })

      const res = await dashboardApp.handle(
        new Request("http://localhost/api/dashboard/teams/team_1/invitations/inv_1", {
          method: "DELETE",
        })
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.success).toBe(true)
      expect(mockLogAudit).toHaveBeenCalled()
    })

    it("returns error when cancel fails", async () => {
      mockCancelTeamInvitation.mockResolvedValue({
        success: false,
        error: "Only team captain can cancel",
      })

      const res = await dashboardApp.handle(
        new Request("http://localhost/api/dashboard/teams/team_1/invitations/inv_1", {
          method: "DELETE",
        })
      )
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.error).toBe("Only team captain can cancel")
    })
  })

  describe("POST /api/dashboard/teams/:teamId/invitations/:invitationId/remind", () => {
    const TEAM_ID = "11111111-1111-1111-1111-111111111111"
    const INVITATION_ID = "22222222-2222-2222-2222-222222222222"
    const remindUrl = `http://localhost/api/dashboard/teams/${TEAM_ID}/invitations/${INVITATION_ID}/remind`

    it("returns 404 for invalid UUID params", async () => {
      const res = await dashboardApp.handle(
        new Request("http://localhost/api/dashboard/teams/bad-id/invitations/also-bad/remind", {
          method: "POST",
        })
      )

      expect(res.status).toBe(404)
    })

    it("returns 404 when team not found", async () => {
      mockGetTeamWithHackathon.mockResolvedValue(null)

      const res = await dashboardApp.handle(new Request(remindUrl, { method: "POST" }))
      const data = await res.json()

      expect(res.status).toBe(404)
      expect(data.error).toBe("Team not found")
    })

    it("returns 429 when rate limited", async () => {
      mockCheckRateLimit.mockReturnValue({ allowed: false, remaining: 0, resetAt: Date.now() + 60000 })

      const res = await dashboardApp.handle(new Request(remindUrl, { method: "POST" }))

      expect(res.status).toBe(429)
    })

    it("returns 400 when remind service fails", async () => {
      mockRemindTeamInvitation.mockResolvedValue({
        success: false,
        error: "Reminder already sent",
        code: "already_reminded",
      })

      const res = await dashboardApp.handle(new Request(remindUrl, { method: "POST" }))
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.error).toBe("Reminder already sent")
      expect(data.code).toBe("already_reminded")
    })

    it("sends reminder email and logs audit on success", async () => {
      mockRemindTeamInvitation.mockResolvedValue({
        success: true,
        invitation: {
          id: INVITATION_ID,
          email: "invitee@example.com",
          token: "abc123",
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        },
      })

      const res = await dashboardApp.handle(new Request(remindUrl, { method: "POST" }))
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.success).toBe(true)
      expect(mockRemindTeamInvitation).toHaveBeenCalledWith(INVITATION_ID, "user_captain", TEAM_ID)
      expect(mockSendTeamInvitationReminderEmail).toHaveBeenCalled()
      expect(mockLogAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "team_invitation.reminded",
          resourceType: "team_invitation",
          resourceId: INVITATION_ID,
        })
      )
    })

    it("checks team existence before rate limiting", async () => {
      mockGetTeamWithHackathon.mockResolvedValue(null)

      await dashboardApp.handle(new Request(remindUrl, { method: "POST" }))

      expect(mockGetTeamWithHackathon).toHaveBeenCalled()
      expect(mockCheckRateLimit).not.toHaveBeenCalled()
    })
  })
})
