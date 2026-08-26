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

mock.module("@/lib/services/judging", () => ({
  addJudge: mock(() => Promise.resolve({ success: false })),
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

const mockRemindJudgeInvitation = mock(() =>
  Promise.resolve({
    success: true,
    invitation: {
      id: "inv_1",
      email: "judge@example.com",
      token: "judge-token-123",
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      reminded_at: "2026-08-26T12:00:00.000Z",
      updated_at: "2026-08-26T12:00:00.000Z",
    },
  })
)
const mockReleaseJudgeInvitationReminderClaim = mock(() => Promise.resolve())

mock.module("@/lib/services/judge-invitations", () => ({
  createJudgeInvitation: mock(() => Promise.resolve({ success: false })),
  listJudgeInvitations: mock(() => Promise.resolve([])),
  cancelJudgeInvitation: mock(() => Promise.resolve({ success: true })),
  hasPendingJudgeInvitation: mock(() => Promise.resolve(false)),
  hasPendingJudgeEntry: mock(() => Promise.resolve(false)),
  createJudgePendingNotification: mock(() => Promise.resolve()),
  remindJudgeInvitation: mockRemindJudgeInvitation,
  releaseJudgeInvitationReminderClaim: mockReleaseJudgeInvitationReminderClaim,
}))

const mockSendJudgeInvitationReminderEmail = mock(() => Promise.resolve({ success: true }))

mock.module("@/lib/email/judge-invitations", () => ({
  sendJudgeAddedNotification: mock(() => Promise.resolve({ success: true })),
  sendJudgeInvitationEmail: mock(() => Promise.resolve({ success: true })),
  sendJudgeInvitationReminderEmail: mockSendJudgeInvitationReminderEmail,
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

mock.module("@clerk/nextjs/server", () => ({
  auth: mock(() => Promise.resolve({ userId: null })),
  clerkClient: mock(() =>
    Promise.resolve({
      users: {
        getUser: mock(() =>
          Promise.resolve({ firstName: "Test", lastName: "Organizer" })
        ),
      },
    })
  ),
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

mock.module("@/lib/auth/resolve-adder-name", () => ({
  resolveAdder: mock(() =>
    Promise.resolve({ name: "Test Organizer", email: "organizer@example.com" })
  ),
  resolveAdderName: mock(() => Promise.resolve("Test Organizer")),
  resolveAdderEmail: mock(() => Promise.resolve("organizer@example.com")),
}))

const { Elysia } = await import("elysia")
const { dashboardJudgingRoutes } = await import("@/lib/api/routes/dashboard-judging")
const { handleRouteError } = await import("@/lib/api/routes/errors")

const app = new Elysia({ prefix: "/api/dashboard" })
  .onError(({ error, set, path }) => handleRouteError(error, set, path))
  .use(dashboardJudgingRoutes)

const HACKATHON_ID = "11111111-1111-1111-1111-111111111111"
const INVITATION_ID = "22222222-2222-2222-2222-222222222222"

const mockUserPrincipal = {
  kind: "user" as const,
  tenantId: "tenant-123",
  userId: "user-456",
  orgId: "org-789",
  orgRole: "org:admin",
  scopes: ["hackathons:read", "hackathons:write"],
}

describe("POST /hackathons/:id/judging/invitations/:invitationId/remind", () => {
  const remindUrl = `http://localhost/api/dashboard/hackathons/${HACKATHON_ID}/judging/invitations/${INVITATION_ID}/remind`

  beforeEach(() => {
    mockResolvePrincipal.mockClear()
    mockCheckHackathonOrganizer.mockClear()
    mockRemindJudgeInvitation.mockClear()
    mockSendJudgeInvitationReminderEmail.mockClear()
    mockLogAudit.mockClear()
    mockCheckRateLimit.mockClear()
    mockReleaseJudgeInvitationReminderClaim.mockClear()

    mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
    mockCheckHackathonOrganizer.mockResolvedValue({
      status: "ok",
      hackathon: { id: HACKATHON_ID, name: "Test Hackathon", slug: "test-hackathon", status: "active" },
    })
    mockRemindJudgeInvitation.mockResolvedValue({
      success: true,
      invitation: {
        id: INVITATION_ID,
        email: "judge@example.com",
        token: "judge-token-123",
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        reminded_at: "2026-08-26T12:00:00.000Z",
        updated_at: "2026-08-26T12:00:00.000Z",
      },
    })
    mockCheckRateLimit.mockReturnValue({ allowed: true, remaining: 9, resetAt: Date.now() + 60000 })
  })

  it("returns 401 when unauthenticated", async () => {
    mockResolvePrincipal.mockResolvedValue({ kind: "anon" })

    const res = await app.handle(new Request(remindUrl, { method: "POST" }))

    expect(res.status).toBe(401)
  })

  it("returns 404 for invalid UUID invitation ID", async () => {
    const res = await app.handle(
      new Request(
        `http://localhost/api/dashboard/hackathons/${HACKATHON_ID}/judging/invitations/bad-id/remind`,
        { method: "POST" }
      )
    )

    expect(res.status).toBe(404)
  })

  it("returns 404 when hackathon not found", async () => {
    mockCheckHackathonOrganizer.mockResolvedValue({ status: "not_found" })

    const res = await app.handle(new Request(remindUrl, { method: "POST" }))

    expect(res.status).toBe(404)
  })

  it("returns 403 when not authorized", async () => {
    mockCheckHackathonOrganizer.mockResolvedValue({ status: "not_authorized" })

    const res = await app.handle(new Request(remindUrl, { method: "POST" }))

    expect(res.status).toBe(403)
  })

  it("checks authorization before rate limiting", async () => {
    mockCheckHackathonOrganizer.mockResolvedValue({ status: "not_found" })

    await app.handle(new Request(remindUrl, { method: "POST" }))

    expect(mockCheckHackathonOrganizer).toHaveBeenCalled()
    expect(mockCheckRateLimit).not.toHaveBeenCalled()
  })

  it("returns 429 when rate limited", async () => {
    mockCheckRateLimit.mockReturnValue({ allowed: false, remaining: 0, resetAt: Date.now() + 60000 })

    const res = await app.handle(new Request(remindUrl, { method: "POST" }))

    expect(res.status).toBe(429)
  })

  it("returns 400 when remind service fails", async () => {
    mockRemindJudgeInvitation.mockResolvedValue({
      success: false,
      error: "Reminder already sent",
      code: "already_reminded",
    })

    const res = await app.handle(new Request(remindUrl, { method: "POST" }))
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.error).toBe("Reminder already sent")
    expect(data.code).toBe("already_reminded")
  })

  it("sends reminder email and logs audit on success", async () => {
    const res = await app.handle(new Request(remindUrl, { method: "POST" }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(mockRemindJudgeInvitation).toHaveBeenCalledWith(INVITATION_ID, HACKATHON_ID)
    expect(mockSendJudgeInvitationReminderEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryId: `${INVITATION_ID}/manual/manual`,
      })
    )
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "judge_invitation.reminded",
        resourceType: "hackathon",
        resourceId: HACKATHON_ID,
        metadata: { invitationId: INVITATION_ID },
      })
    )
  })

  it("rejects effectively ended events before claiming or sending", async () => {
    mockCheckHackathonOrganizer.mockResolvedValue({
      status: "ok",
      hackathon: {
        id: HACKATHON_ID,
        name: "Test Hackathon",
        slug: "test-hackathon",
        status: "active",
        starts_at: "2020-01-01T00:00:00.000Z",
        ends_at: "2020-01-02T00:00:00.000Z",
      },
    })

    const res = await app.handle(new Request(remindUrl, { method: "POST" }))
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: "hackathon_ended" })
    expect(mockRemindJudgeInvitation).not.toHaveBeenCalled()
    expect(mockSendJudgeInvitationReminderEmail).not.toHaveBeenCalled()
  })

  it("uses a hashed request idempotency key for provider retries", async () => {
    const res = await app.handle(new Request(remindUrl, {
      method: "POST",
      headers: { "Idempotency-Key": "retry-this-request" },
    }))

    expect(res.status).toBe(200)
    expect(mockSendJudgeInvitationReminderEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryId: expect.stringMatching(new RegExp(`^${INVITATION_ID}/manual/[a-f0-9]{24}$`)),
      }),
    )
  })
})
