import { describe, expect, it, mock, beforeEach } from "bun:test"
import { Elysia } from "elysia"

const baseTeam = {
  name: "Test Team",
  hackathon: {
    name: "Test Hackathon",
    slug: "test-hackathon",
    status: "draft",
    starts_at: null,
    ends_at: null,
  },
  memberNames: [],
}

const mockGetTeamWithHackathon = mock(() => Promise.resolve(baseTeam))
const mockCreateTeamInvitation = mock(() =>
  Promise.resolve({
    success: true,
    invitation: {
      id: "inv_1",
      team_id: "team_1",
      hackathon_id: "h1",
      email: "invitee@example.com",
      token: "tok_123",
      invited_by_clerk_user_id: "user_captain",
      status: "pending",
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      accepted_at: null,
      accepted_by_clerk_user_id: null,
      reminded_at: null,
      emailed_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  })
)
const mockMarkTeamInvitationEmailed = mock(() => Promise.resolve())
const mockListTeamInvitations = mock(() => Promise.resolve({ success: true, invitations: [] }))
const mockCancelTeamInvitation = mock(() => Promise.resolve({ success: true }))
const mockRemindTeamInvitation = mock(() => Promise.resolve({
  success: true,
  invitation: {
    id: "inv_1",
    email: "invitee@example.com",
    token: "tok_123",
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  },
}))
const mockSendPendingTeamInvitationEmails = mock(() => Promise.resolve({ sent: 0, total: 0, failedEmails: [] }))

mock.module("@/lib/services/team-invitations", () => ({
  getTeamWithHackathon: mockGetTeamWithHackathon,
  createTeamInvitation: mockCreateTeamInvitation,
  markTeamInvitationEmailed: mockMarkTeamInvitationEmailed,
  listTeamInvitations: mockListTeamInvitations,
  cancelTeamInvitation: mockCancelTeamInvitation,
  remindTeamInvitation: mockRemindTeamInvitation,
  sendPendingTeamInvitationEmails: mockSendPendingTeamInvitationEmails,
}))

const mockSendTeamInvitationEmail = mock(() => Promise.resolve({ success: true }))
const mockSendTeamInvitationReminderEmail = mock(() => Promise.resolve({ success: true }))
mock.module("@/lib/email/team-invitations", () => ({
  sendTeamInvitationEmail: mockSendTeamInvitationEmail,
  sendTeamInvitationReminderEmail: mockSendTeamInvitationReminderEmail,
}))

const mockSendTeamInvitationWorkflow = mock(() => Promise.resolve())
mock.module("@/lib/workflows/team-invitations", () => ({
  sendTeamInvitationWorkflow: mockSendTeamInvitationWorkflow,
}))

const mockWorkflowStart = mock(() => Promise.resolve({ runId: "run_1" }))
mock.module("workflow/api", () => ({ start: mockWorkflowStart }))

const mockScheduleReminders = mock(() => Promise.resolve(0))
const mockCancelRemindersForEntity = mock(() => Promise.resolve(0))
const mockCancelUpcomingReminder = mock(() => Promise.resolve(0))
mock.module("@/lib/services/smart-reminders", () => ({
  scheduleReminders: mockScheduleReminders,
  cancelRemindersForEntity: mockCancelRemindersForEntity,
  cancelUpcomingReminder: mockCancelUpcomingReminder,
}))

const mockResolveAdderName = mock(() => Promise.resolve("Captain Test"))
const mockResolveAdderEmail = mock(() => Promise.resolve("captain@example.com"))
const mockResolveAdder = mock(() =>
  Promise.resolve({ name: "Captain Test", email: "captain@example.com" })
)
mock.module("@/lib/auth/resolve-adder-name", () => ({
  resolveAdder: mockResolveAdder,
  resolveAdderName: mockResolveAdderName,
  resolveAdderEmail: mockResolveAdderEmail,
}))

mock.module("@/lib/services/audit", () => ({
  logAudit: mock(() => Promise.resolve(null)),
  listAllAuditLogs: mock(() => Promise.resolve({ logs: [], total: 0 })),
}))

mock.module("@/lib/api/routes/dashboard-judging", () => ({
  dashboardJudgingRoutes: new Elysia(),
}))
mock.module("@/lib/api/routes/dashboard-prizes", () => ({
  dashboardPrizesRoutes: new Elysia(),
}))
mock.module("@/lib/api/routes/dashboard-results", () => ({
  dashboardResultsRoutes: new Elysia(),
}))
mock.module("@/lib/api/routes/dashboard-judge-display", () => ({
  dashboardJudgeDisplayRoutes: new Elysia(),
}))
mock.module("@/lib/api/routes/dashboard-post-event", () => ({
  dashboardPostEventRoutes: new Elysia(),
}))
mock.module("@/lib/api/routes/dashboard-sponsor-fulfillment", () => ({
  dashboardSponsorFulfillmentRoutes: new Elysia(),
}))

const mockResolvePrincipal = mock(() => Promise.resolve({
  kind: "user" as const,
  tenantId: "tenant-123",
  userId: "user_captain",
  orgId: "org-789",
  orgRole: "org:admin",
  scopes: ["hackathons:read", "hackathons:write"],
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
    requirePrincipal: (principal: unknown) => {
      if (!principal || (principal as { kind: string }).kind === "anon") {
        throw new AuthError("Unauthorized", 401)
      }
      return principal
    },
    isAdminEnabled: () => true,
    requireAdmin: () => {},
    requireAdminScopes: () => {},
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

const { dashboardRoutes } = await import("@/lib/api/routes/dashboard")
const { handleRouteError } = await import("@/lib/api/routes/errors")

const app = new Elysia({ prefix: "/api" })
  .onError(({ error, set, path }) => handleRouteError(error, set, path))
  .use(dashboardRoutes)

function postInvitation(body: Record<string, unknown>, teamId = "team_1") {
  return app.handle(
    new Request(`http://localhost/api/dashboard/teams/${teamId}/invitations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  )
}

function postRemind(invitationId: string, teamId = "11111111-1111-1111-1111-111111111111") {
  return app.handle(
    new Request(`http://localhost/api/dashboard/teams/${teamId}/invitations/${invitationId}/remind`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    })
  )
}

describe("Team invitations: draft hackathon gating", () => {
  beforeEach(() => {
    mockGetTeamWithHackathon.mockClear()
    mockCreateTeamInvitation.mockClear()
    mockMarkTeamInvitationEmailed.mockClear()
    mockSendTeamInvitationEmail.mockClear()
    mockSendTeamInvitationReminderEmail.mockClear()
    mockSendTeamInvitationWorkflow.mockClear()
    mockWorkflowStart.mockClear()
    mockScheduleReminders.mockClear()
    mockCancelUpcomingReminder.mockClear()
  })

  it("creates invitation row but does NOT email or schedule reminders when hackathon is draft", async () => {
    mockGetTeamWithHackathon.mockResolvedValueOnce({
      ...baseTeam,
      hackathon: { ...baseTeam.hackathon, status: "draft" },
    })

    const res = await postInvitation({
      hackathonId: "h1",
      email: "invitee@example.com",
    })

    expect(res.status).toBe(200)
    expect(mockCreateTeamInvitation).toHaveBeenCalledTimes(1)
    expect(mockMarkTeamInvitationEmailed).not.toHaveBeenCalled()
    expect(mockWorkflowStart).not.toHaveBeenCalled()
    expect(mockSendTeamInvitationEmail).not.toHaveBeenCalled()
    expect(mockScheduleReminders).not.toHaveBeenCalled()
  })

  it("emails immediately when hackathon is published", async () => {
    mockGetTeamWithHackathon.mockResolvedValueOnce({
      ...baseTeam,
      hackathon: { ...baseTeam.hackathon, status: "published" },
    })

    const res = await postInvitation({
      hackathonId: "h1",
      email: "invitee@example.com",
    })

    expect(res.status).toBe(200)
    expect(mockMarkTeamInvitationEmailed).toHaveBeenCalledTimes(1)
    expect(mockWorkflowStart).toHaveBeenCalledTimes(1)
    expect(mockScheduleReminders).toHaveBeenCalledTimes(1)
  })

  it("persists inviterEmail in reminder metadata when scheduling", async () => {
    mockGetTeamWithHackathon.mockResolvedValueOnce({
      ...baseTeam,
      hackathon: { ...baseTeam.hackathon, status: "published" },
    })

    await postInvitation({
      hackathonId: "h1",
      email: "invitee@example.com",
    })

    expect(mockScheduleReminders).toHaveBeenCalledTimes(1)
    const meta = mockScheduleReminders.mock.calls[0][6] as Record<string, unknown>
    expect(meta.inviterEmail).toBe("captain@example.com")
    expect(meta.inviterName).toBe("Your team captain")
  })

  it("passes inviterEmail to the reminder email on remind", async () => {
    mockGetTeamWithHackathon.mockResolvedValueOnce({
      ...baseTeam,
      hackathon: { ...baseTeam.hackathon, status: "active" },
    })

    await postRemind("22222222-2222-2222-2222-222222222222")

    expect(mockSendTeamInvitationReminderEmail).toHaveBeenCalledTimes(1)
    const args = mockSendTeamInvitationReminderEmail.mock.calls[0][0] as {
      inviterName: string
      inviterEmail?: string
    }
    expect(args.inviterEmail).toBe("captain@example.com")
    expect(args.inviterName).toBe("Captain Test")
  })

  it("blocks remind with hackathon_draft when hackathon is draft", async () => {
    mockGetTeamWithHackathon.mockResolvedValueOnce({
      ...baseTeam,
      hackathon: { ...baseTeam.hackathon, status: "draft" },
    })

    const res = await postRemind("22222222-2222-2222-2222-222222222222")

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe("hackathon_draft")
    expect(mockSendTeamInvitationReminderEmail).not.toHaveBeenCalled()
  })

  it("allows remind when hackathon is not draft", async () => {
    mockGetTeamWithHackathon.mockResolvedValueOnce({
      ...baseTeam,
      hackathon: { ...baseTeam.hackathon, status: "active" },
    })

    const res = await postRemind("22222222-2222-2222-2222-222222222222")

    expect(res.status).toBe(200)
    expect(mockSendTeamInvitationReminderEmail).toHaveBeenCalledTimes(1)
  })
})
