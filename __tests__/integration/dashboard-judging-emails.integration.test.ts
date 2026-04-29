import { describe, expect, it, mock, beforeEach } from "bun:test"

const mockCheckHackathonOrganizer = mock(() =>
  Promise.resolve({
    status: "ok",
    hackathon: { id: "h1", name: "Test Hackathon", slug: "test-hackathon", status: "active" },
  })
)

mock.module("@/lib/services/public-hackathons", () => ({
  checkHackathonOrganizer: mockCheckHackathonOrganizer,
}))

const mockAddJudge = mock(() =>
  Promise.resolve({ success: true, participant: { id: "j1", clerkUserId: "judge_123" } })
)

mock.module("@/lib/services/judging", () => ({
  addJudge: mockAddJudge,
  listJudgingCriteria: mock(() => Promise.resolve([])),
  createJudgingCriteria: mock(() => Promise.resolve(null)),
  updateJudgingCriteria: mock(() => Promise.resolve(null)),
  deleteJudgingCriteria: mock(() => Promise.resolve(false)),
  listJudges: mock(() => Promise.resolve([])),
  removeJudge: mock(() => Promise.resolve({ success: false })),
  listJudgeAssignments: mock(() => Promise.resolve([])),
  assignJudgeToSubmission: mock(() => Promise.resolve({ success: false, error: "", code: "" })),
  removeJudgeAssignment: mock(() => Promise.resolve(false)),
  autoAssignJudges: mock(() => Promise.resolve({ assignedCount: 0 })),
  getJudgingProgress: mock(() => Promise.resolve({ totalAssignments: 0, completedAssignments: 0, judges: [] })),
  getJudgeAssignments: mock(() => Promise.resolve([])),
  getAssignmentDetail: mock(() => Promise.resolve(null)),
  submitScores: mock(() => Promise.resolve({ success: false, error: "", code: "" })),
  saveNotes: mock(() => Promise.resolve(false)),
  getJudgingSetupStatus: mock(() => Promise.resolve({ hasCriteria: false, allCriteriaHaveLevels: true, judgeCount: 0, hasSubmissions: false, hasUnassignedSubmissions: false, isReady: false })),
}))

const mockCreateJudgeInvitation = mock(() =>
  Promise.resolve({
    success: true,
    invitation: {
      id: "inv1",
      token: "invite-token-123",
      email: "newjudge@example.com",
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    },
  })
)

const mockHasPendingJudgeEntry = mock(() => Promise.resolve(false))

mock.module("@/lib/services/judge-invitations", () => ({
  createJudgeInvitation: mockCreateJudgeInvitation,
  listJudgeInvitations: mock(() => Promise.resolve([])),
  cancelJudgeInvitation: mock(() => Promise.resolve({ success: true })),
  hasPendingJudgeInvitation: mock(() => Promise.resolve(false)),
  hasPendingJudgeEntry: mockHasPendingJudgeEntry,
  createJudgePendingNotification: mock(() => Promise.resolve()),
}))

const mockSendJudgeAddedNotification = mock(() => Promise.resolve({ success: true }))
const mockSendJudgeInvitationEmail = mock(() => Promise.resolve({ success: true }))

mock.module("@/lib/email/judge-invitations", () => ({
  sendJudgeAddedNotification: mockSendJudgeAddedNotification,
  sendJudgeInvitationEmail: mockSendJudgeInvitationEmail,
}))

const mockLogAudit = mock(() => Promise.resolve(null))
mock.module("@/lib/services/audit", () => ({
  logAudit: mockLogAudit,
  listAllAuditLogs: mock(() => Promise.resolve({ logs: [], total: 0 })),
}))

const mockGetUser = mock(() =>
  Promise.resolve({
    id: "judge_123",
    primaryEmailAddress: { emailAddress: "judge@example.com" },
    firstName: "Jane",
    lastName: "Organizer",
  })
)
const mockGetUserList = mock(() => Promise.resolve({ data: [] }))
const mockClerkClientInstance = {
  users: {
    getUser: mockGetUser,
    getUserList: mockGetUserList,
  },
}

mock.module("@clerk/nextjs/server", () => ({
  auth: mock(() => Promise.resolve({ userId: null })),
  clerkClient: mock(() => Promise.resolve(mockClerkClientInstance)),
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
const { dashboardJudgingRoutes } = await import("@/lib/api/routes/dashboard-judging")
const { handleRouteError } = await import("@/lib/api/routes/errors")

const app = new Elysia({ prefix: "/api/dashboard" })
  .onError(({ error, set, path }) => handleRouteError(error, set, path))
  .use(dashboardJudgingRoutes)

const mockUserPrincipal = {
  kind: "user" as const,
  tenantId: "tenant-123",
  userId: "user-456",
  orgId: "org-789",
  orgRole: "org:admin",
  scopes: ["hackathons:read", "hackathons:write"],
}

function postAddJudge(body: Record<string, string>) {
  return app.handle(
    new Request("http://localhost/api/dashboard/hackathons/h1/judging/judges", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  )
}

describe("POST /hackathons/:id/judging/judges - email notifications", () => {
  beforeEach(() => {
    mockResolvePrincipal.mockClear()
    mockCheckHackathonOrganizer.mockClear()
    mockAddJudge.mockClear()
    mockCreateJudgeInvitation.mockClear()
    mockSendJudgeAddedNotification.mockClear()
    mockSendJudgeInvitationEmail.mockClear()
    mockGetUser.mockClear()
    mockGetUserList.mockClear()
    mockLogAudit.mockClear()
    mockHasPendingJudgeEntry.mockClear()

    mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
    mockHasPendingJudgeEntry.mockResolvedValue(false)
    mockAddJudge.mockResolvedValue({ success: true, participant: { id: "j1", clerkUserId: "judge_123" } })
    mockGetUserList.mockResolvedValue({ data: [] })
    mockGetUser.mockResolvedValue({
      id: "judge_123",
      primaryEmailAddress: { emailAddress: "judge@example.com" },
      firstName: "Jane",
      lastName: "Organizer",
    })
  })

  describe("adding judge by clerkUserId", () => {
    it("sends notification email when hackathon is not draft", async () => {
      mockCheckHackathonOrganizer.mockResolvedValue({
        status: "ok",
        hackathon: { id: "h1", name: "Active Hackathon", slug: "active-hack", status: "active" },
      })

      const res = await postAddJudge({ clerkUserId: "judge_123" })
      expect(res.status).toBe(200)

      await Promise.resolve()

      expect(mockSendJudgeAddedNotification).toHaveBeenCalledTimes(1)
      expect(mockSendJudgeAddedNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "judge@example.com",
          hackathonName: "Active Hackathon",
          hackathonSlug: "active-hack",
        })
      )
    })

    it("does not send notification email when hackathon is draft", async () => {
      mockCheckHackathonOrganizer.mockResolvedValue({
        status: "ok",
        hackathon: { id: "h1", name: "Draft Hackathon", slug: "draft-hack", status: "draft" },
      })

      const res = await postAddJudge({ clerkUserId: "judge_123" })
      expect(res.status).toBe(200)

      await Promise.resolve()

      expect(mockSendJudgeAddedNotification).not.toHaveBeenCalled()
    })
  })

  describe("adding judge by email (existing user)", () => {
    beforeEach(() => {
      mockGetUserList.mockImplementation(() =>
        Promise.resolve({ data: [{ id: "found_user_123" }] })
      )
    })

    it("sends notification email when hackathon is not draft", async () => {
      mockCheckHackathonOrganizer.mockResolvedValue({
        status: "ok",
        hackathon: { id: "h1", name: "Published Hackathon", slug: "pub-hack", status: "published" },
      })
      mockAddJudge.mockResolvedValue({ success: true, participant: { id: "j1", clerkUserId: "found_user_123" } })

      const res = await postAddJudge({ email: "existing@example.com" })
      expect(res.status).toBe(200)

      await Promise.resolve()

      expect(mockSendJudgeAddedNotification).toHaveBeenCalledTimes(1)
      expect(mockSendJudgeAddedNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "existing@example.com",
          hackathonName: "Published Hackathon",
        })
      )
    })

    it("does not send notification email when hackathon is draft", async () => {
      mockCheckHackathonOrganizer.mockResolvedValue({
        status: "ok",
        hackathon: { id: "h1", name: "Draft Hackathon", slug: "draft-hack", status: "draft" },
      })

      const res = await postAddJudge({ email: "existing@example.com" })
      expect(res.status).toBe(200)

      await Promise.resolve()

      expect(mockSendJudgeAddedNotification).not.toHaveBeenCalled()
    })
  })

  describe("inviting judge by email (new user)", () => {
    beforeEach(() => {
      mockGetUserList.mockResolvedValue({ data: [] })
      mockCreateJudgeInvitation.mockResolvedValue({
        success: true,
        invitation: {
          id: "inv1",
          token: "invite-token-123",
          email: "newjudge@example.com",
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        },
      })
    })

    it("sends invitation email when hackathon is not draft", async () => {
      mockCheckHackathonOrganizer.mockResolvedValue({
        status: "ok",
        hackathon: { id: "h1", name: "Active Hackathon", slug: "active-hack", status: "active" },
      })

      const res = await postAddJudge({ email: "newjudge@example.com" })
      const data = await res.json()

      expect(data.invitation).toBeDefined()
      expect(data.invitation.email).toBe("newjudge@example.com")
      expect(data.invitation.token).toBe("invite-token-123")
      expect(mockSendJudgeInvitationEmail).toHaveBeenCalledTimes(1)
      expect(mockSendJudgeInvitationEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "newjudge@example.com",
          hackathonName: "Active Hackathon",
          inviteToken: "invite-token-123",
        })
      )
    })

    it("does not send invitation email when hackathon is draft", async () => {
      mockCheckHackathonOrganizer.mockResolvedValue({
        status: "ok",
        hackathon: { id: "h1", name: "Draft Hackathon", slug: "draft-hack", status: "draft" },
      })

      const res = await postAddJudge({ email: "newjudge@example.com" })
      const data = await res.json()

      expect(data.invitation).toBeDefined()
      expect(data.invitation.email).toBe("newjudge@example.com")
      expect(data.invitation.token).toBe("invite-token-123")
      expect(mockSendJudgeInvitationEmail).not.toHaveBeenCalled()
    })
  })

  describe("already_invited guard", () => {
    it("returns 400 already_invited when clerkUserId path finds a pending invitation", async () => {
      mockHasPendingJudgeEntry.mockResolvedValue(true)

      const res = await postAddJudge({ clerkUserId: "judge_123" })
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.code).toBe("already_pending")
      expect(mockAddJudge).not.toHaveBeenCalled()
    })

    it("returns 400 already_invited when email path finds a pending invitation for existing user", async () => {
      mockGetUserList.mockResolvedValue({ data: [{ id: "found_user_123" }] })
      mockHasPendingJudgeEntry.mockResolvedValue(true)

      const res = await postAddJudge({ email: "existing@example.com" })
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.code).toBe("already_pending")
      expect(mockAddJudge).not.toHaveBeenCalled()
    })
  })
})
