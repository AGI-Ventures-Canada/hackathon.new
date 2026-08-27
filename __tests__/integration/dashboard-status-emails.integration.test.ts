import { describe, expect, it, mock, beforeEach } from "bun:test"
import { Elysia } from "elysia"
import { resetSupabaseMocks } from "../lib/supabase-mock"

const mockCheckHackathonOrganizer = mock(() =>
  Promise.resolve({ status: "ok", hackathon: { id: "h1" } })
)
const mockGetHackathonByIdForOrganizer = mock(() =>
  Promise.resolve({ id: "h1", status: "draft", registration_opens_at: null, registration_closes_at: null, starts_at: null, ends_at: null })
)
const mockUpdateHackathonSettings = mock(() =>
  Promise.resolve({
    id: "h1",
    name: "Test Hackathon",
    slug: "test-hackathon",
    description: null,
    rules: null,
    banner_url: null,
    status: "published",
    starts_at: null,
    ends_at: null,
    registration_opens_at: null,
    registration_closes_at: null,
    anonymous_judging: false,
    judging_mode: "points",
    location_type: null,
    location_name: null,
    location_url: null,
    location_latitude: null,
    location_longitude: null,
    require_location_verification: false,
    max_participants: null,
    min_team_size: 1,
    max_team_size: 5,
    allow_solo: true,
  })
)
const mockDeleteHackathon = mock(() => Promise.resolve(true))

mock.module("@/lib/services/public-hackathons", () => ({
  checkHackathonOrganizer: mockCheckHackathonOrganizer,
  getHackathonByIdForOrganizer: mockGetHackathonByIdForOrganizer,
  updateHackathonSettings: mockUpdateHackathonSettings,
  deleteHackathon: mockDeleteHackathon,
}))

const mockExecuteTransition = mock(() =>
  Promise.resolve({ success: true, hackathon: { id: "h1" } })
)
mock.module("@/lib/services/lifecycle", () => ({
  executeTransition: mockExecuteTransition,
}))

const mockGetJudgingSetupStatus = mock(() =>
  Promise.resolve({ isReady: true, issues: [] as string[] })
)
mock.module("@/lib/services/judging", () => ({
  getJudgingSetupStatus: mockGetJudgingSetupStatus,
}))

const mockSendPendingJudgeInvitationEmails = mock(() => Promise.resolve({ sent: 2, total: 2, failedEmails: [] }))

mock.module("@/lib/services/judge-invitations", () => ({
  sendPendingJudgeInvitationEmails: mockSendPendingJudgeInvitationEmails,
  createJudgeInvitation: mock(() => Promise.resolve({ success: true })),
  listJudgeInvitations: mock(() => Promise.resolve([])),
}))

const mockSendPendingTeamInvitationEmails = mock(() => Promise.resolve({ sent: 1, total: 1, failedEmails: [] }))
mock.module("@/lib/services/team-invitations", () => ({
  sendPendingTeamInvitationEmails: mockSendPendingTeamInvitationEmails,
  markTeamInvitationEmailed: mock(() => Promise.resolve()),
  createTeamInvitation: mock(() => Promise.resolve({ success: false, error: "not used", code: "noop" })),
  getTeamWithHackathon: mock(() => Promise.resolve(null)),
  listTeamInvitations: mock(() => Promise.resolve({ success: true, invitations: [] })),
  cancelTeamInvitation: mock(() => Promise.resolve({ success: true })),
  remindTeamInvitation: mock(() => Promise.resolve({ success: false, error: "not used", code: "noop" })),
}))

const mockLogAudit = mock(() => Promise.resolve(null))
mock.module("@/lib/services/audit", () => ({
  logAudit: mockLogAudit,
  listAllAuditLogs: mock(() => Promise.resolve({ logs: [], total: 0 })),
}))

const mockTriggerWebhooks = mock(() => Promise.resolve())
mock.module("@/lib/services/webhooks", () => ({
  triggerWebhooks: mockTriggerWebhooks,
}))

const mockWorkflowStart = mock(() => Promise.resolve({ runId: "run_1" }))
mock.module("workflow/api", () => ({ start: mockWorkflowStart }))
mock.module("@/lib/workflows/judge-notifications", () => ({
  sendJudgeNotificationsWorkflow: mock(() => Promise.resolve()),
}))

const mockFetchPendingNotifications = mock(() => Promise.resolve([]))
const mockSendJudgeNotification = mock(() => Promise.resolve())
mock.module("@/lib/workflows/judge-notifications/steps", () => ({
  fetchPendingNotifications: mockFetchPendingNotifications,
  sendJudgeNotification: mockSendJudgeNotification,
}))

const mockGetUser = mock(() =>
  Promise.resolve({ firstName: "Jane", lastName: "Doe" })
)
mock.module("@clerk/nextjs/server", () => ({
  auth: mock(() => Promise.resolve({ userId: null })),
  clerkClient: mock(() => Promise.resolve({ users: { getUser: mockGetUser } })),
}))

mock.module("@/lib/utils/timeline", () => ({
  validateTimelineDates: mock(() => null),
  getEffectiveStatus: mock((h: { status: string }) => h.status),
}))

mock.module("@/lib/utils/url", () => ({
  isSafeExternalUrl: mock(() => true),
  normalizeOptionalUrl: mock((url: string | undefined) => url),
  normalizeUrl: mock((url: string) => url),
}))

mock.module("@/lib/services/api-keys", () => ({
  createApiKey: mock(() => Promise.resolve(null)),
  listApiKeys: mock(() => Promise.resolve([])),
  revokeApiKey: mock(() => Promise.resolve(false)),
  getApiKeyById: mock(() => Promise.resolve(null)),
}))

mock.module("@/lib/services/jobs", () => ({
  listJobs: mock(() => Promise.resolve([])),
  getJobById: mock(() => Promise.resolve(null)),
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

function patchSettings(body: Record<string, unknown>) {
  return app.handle(
    new Request("http://localhost/api/dashboard/hackathons/h1/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  )
}

const mockHackathonResponse = {
  id: "h1",
  name: "Test Hackathon",
  slug: "test-hackathon",
  description: null,
  rules: null,
  banner_url: null,
  status: "published",
  starts_at: null,
  ends_at: null,
  registration_opens_at: null,
  registration_closes_at: null,
  anonymous_judging: false,
  judging_mode: "points",
  location_type: null,
  location_name: null,
  location_url: null,
  location_latitude: null,
  location_longitude: null,
  require_location_verification: false,
  max_participants: null,
  min_team_size: 1,
  max_team_size: 5,
  allow_solo: true,
}

describe("PATCH /api/dashboard/hackathons/:id/settings - status change emails", () => {
  beforeEach(() => {
    resetSupabaseMocks()
    mockResolvePrincipal.mockClear()
    mockCheckHackathonOrganizer.mockClear()
    mockGetHackathonByIdForOrganizer.mockClear()
    mockUpdateHackathonSettings.mockClear()
    mockExecuteTransition.mockClear()
    mockGetJudgingSetupStatus.mockClear()
    mockSendPendingJudgeInvitationEmails.mockClear()
    mockSendPendingTeamInvitationEmails.mockClear()
    mockLogAudit.mockClear()
    mockTriggerWebhooks.mockClear()
    mockGetUser.mockClear()
    mockWorkflowStart.mockClear()
    mockFetchPendingNotifications.mockClear()
    mockSendJudgeNotification.mockClear()

    mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
    mockExecuteTransition.mockResolvedValue({
      success: true,
      hackathon: mockHackathonResponse,
    })
    mockGetJudgingSetupStatus.mockResolvedValue({ isReady: true, issues: [] })
    mockWorkflowStart.mockResolvedValue({ runId: "run_1" })
    mockFetchPendingNotifications.mockResolvedValue([])
  })

  it("sends pending invitation emails when transitioning from draft to published", async () => {
    mockCheckHackathonOrganizer.mockResolvedValue({
      status: "ok",
      hackathon: { ...mockHackathonResponse, status: "draft" },
    })
    mockGetHackathonByIdForOrganizer.mockResolvedValue({ ...mockHackathonResponse, status: "published" })

    const res = await patchSettings({ status: "published" })
    expect(res.status).toBe(200)
    expect(await res.clone().json()).toMatchObject({ notificationDispatch: "queued" })

    await Promise.resolve()

    expect(mockUpdateHackathonSettings).not.toHaveBeenCalled()
    expect(mockExecuteTransition).toHaveBeenCalledTimes(1)
    expect(mockExecuteTransition).toHaveBeenCalledWith(
      expect.objectContaining({
        registrationOpensAt: expect.any(String),
        registrationClosesAt: undefined,
      }),
    )
    expect(mockSendPendingJudgeInvitationEmails).toHaveBeenCalledTimes(1)
    expect(mockSendPendingJudgeInvitationEmails).toHaveBeenCalledWith(
      "h1",
      "Test Hackathon",
      "Jane Doe",
      { hackathonSlug: "test-hackathon", hackathonStartsAt: null, hackathonEndsAt: null }
    )
    expect(mockSendPendingTeamInvitationEmails).toHaveBeenCalledTimes(1)
    expect(mockSendPendingTeamInvitationEmails).toHaveBeenCalledWith("h1")
  })

  it("keeps organizer-set registration dates when publishing", async () => {
    const registrationOpensAt = "2026-09-01T16:00:00.000Z"
    const registrationClosesAt = "2026-09-12T00:00:00.000Z"
    mockCheckHackathonOrganizer.mockResolvedValue({
      status: "ok",
      hackathon: {
        ...mockHackathonResponse,
        status: "draft",
        registration_opens_at: registrationOpensAt,
        registration_closes_at: registrationClosesAt,
        starts_at: "2026-09-14T16:00:00.000Z",
      },
    })

    const res = await patchSettings({ status: "published" })

    expect(res.status).toBe(200)
    expect(mockExecuteTransition).toHaveBeenCalledWith(
      expect.objectContaining({ registrationOpensAt, registrationClosesAt }),
    )
  })

  it("defaults registration close to the day before the event", async () => {
    mockCheckHackathonOrganizer.mockResolvedValue({
      status: "ok",
      hackathon: {
        ...mockHackathonResponse,
        status: "draft",
        registration_opens_at: null,
        registration_closes_at: null,
        starts_at: "2026-09-14T16:00:00.000Z",
      },
    })

    const res = await patchSettings({ status: "published" })

    expect(res.status).toBe(200)
    expect(mockExecuteTransition).toHaveBeenCalledWith(
      expect.objectContaining({
        registrationOpensAt: expect.any(String),
        registrationClosesAt: "2026-09-13T16:00:00.000Z",
      }),
    )
  })

  it("keeps the default registration window open when the event starts soon", async () => {
    const startsAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    mockCheckHackathonOrganizer.mockResolvedValue({
      status: "ok",
      hackathon: {
        ...mockHackathonResponse,
        status: "draft",
        registration_opens_at: null,
        registration_closes_at: null,
        starts_at: startsAt,
      },
    })

    const res = await patchSettings({ status: "published" })

    expect(res.status).toBe(200)
    expect(mockExecuteTransition).toHaveBeenCalledWith(
      expect.objectContaining({ registrationClosesAt: startsAt }),
    )
  })

  it("does not send pending invitation emails when status stays draft", async () => {
    mockCheckHackathonOrganizer.mockResolvedValue({
      status: "ok",
      hackathon: { ...mockHackathonResponse, status: "draft" },
    })
    mockUpdateHackathonSettings.mockResolvedValue({ ...mockHackathonResponse, status: "draft" })

    const res = await patchSettings({ status: "draft" })
    expect(res.status).toBe(200)

    await Promise.resolve()

    expect(mockSendPendingJudgeInvitationEmails).not.toHaveBeenCalled()
    expect(mockSendPendingTeamInvitationEmails).not.toHaveBeenCalled()
  })

  it("does not send pending invitation emails when previous status was not draft", async () => {
    mockCheckHackathonOrganizer.mockResolvedValue({
      status: "ok",
      hackathon: { ...mockHackathonResponse, status: "published" },
    })
    mockGetHackathonByIdForOrganizer.mockResolvedValue({ ...mockHackathonResponse, status: "active" })

    const res = await patchSettings({ status: "active" })
    expect(res.status).toBe(200)

    await Promise.resolve()

    expect(mockSendPendingJudgeInvitationEmails).not.toHaveBeenCalled()
    expect(mockSendPendingTeamInvitationEmails).not.toHaveBeenCalled()
  })

  it("does not send pending invitation emails for non-status updates", async () => {
    mockUpdateHackathonSettings.mockResolvedValue({ ...mockHackathonResponse, name: "Renamed Hackathon" })

    const res = await patchSettings({ name: "Renamed Hackathon" })
    expect(res.status).toBe(200)

    await Promise.resolve()

    expect(mockSendPendingJudgeInvitationEmails).not.toHaveBeenCalled()
    expect(mockSendPendingTeamInvitationEmails).not.toHaveBeenCalled()
  })

  it("returns 404 early when hackathon not found", async () => {
    mockCheckHackathonOrganizer.mockResolvedValue({ status: "not_found" })

    const res = await patchSettings({ status: "published" })
    expect(res.status).toBe(404)

    expect(mockUpdateHackathonSettings).not.toHaveBeenCalled()
    expect(mockExecuteTransition).not.toHaveBeenCalled()
    expect(mockSendPendingJudgeInvitationEmails).not.toHaveBeenCalled()
    expect(mockSendPendingTeamInvitationEmails).not.toHaveBeenCalled()
  })

  it("returns 403 when tenant does not match", async () => {
    mockCheckHackathonOrganizer.mockResolvedValue({ status: "not_authorized" })

    const res = await patchSettings({ status: "published" })
    expect(res.status).toBe(403)

    expect(mockUpdateHackathonSettings).not.toHaveBeenCalled()
    expect(mockExecuteTransition).not.toHaveBeenCalled()
  })

  it("status-only transition skips updateHackathonSettings", async () => {
    mockCheckHackathonOrganizer.mockResolvedValue({
      status: "ok",
      hackathon: { ...mockHackathonResponse, status: "active" },
    })
    mockGetHackathonByIdForOrganizer.mockResolvedValue({ ...mockHackathonResponse, status: "judging" })

    const res = await patchSettings({ status: "judging" })
    expect(res.status).toBe(200)

    expect(mockUpdateHackathonSettings).not.toHaveBeenCalled()
    expect(mockExecuteTransition).toHaveBeenCalledTimes(1)
  })

  it("returns a stable conflict when another event mutation owns the transition lease", async () => {
    mockCheckHackathonOrganizer.mockResolvedValue({
      status: "ok",
      hackathon: { ...mockHackathonResponse, status: "draft" },
    })
    mockExecuteTransition.mockResolvedValue({
      success: false,
      error: "Another event change is still being saved.",
      code: "event_busy",
    })

    const res = await patchSettings({ status: "published" })

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({
      error: "Another event change is still being saved.",
      code: "event_busy",
    })
    expect(mockUpdateHackathonSettings).not.toHaveBeenCalled()
    expect(mockSendPendingJudgeInvitationEmails).not.toHaveBeenCalled()
  })

  it("blocks judging until scoring setup is complete", async () => {
    mockCheckHackathonOrganizer.mockResolvedValue({
      status: "ok",
      hackathon: { ...mockHackathonResponse, status: "active" },
    })
    mockGetJudgingSetupStatus.mockResolvedValue({
      isReady: false,
      issues: ["Add at least two sort groups for Best Demo."],
    })

    const res = await patchSettings({ status: "judging" })
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body).toEqual({
      error: "Finish scoring setup before judging starts. Add at least two sort groups for Best Demo.",
      code: "judging_setup_incomplete",
      issues: ["Add at least two sort groups for Best Demo."],
    })
    expect(mockExecuteTransition).not.toHaveBeenCalled()
  })

  it("falls back to direct send when judge notifications workflow start() fails", async () => {
    mockCheckHackathonOrganizer.mockResolvedValue({
      status: "ok",
      hackathon: { ...mockHackathonResponse, status: "draft" },
    })
    mockGetHackathonByIdForOrganizer.mockResolvedValue({ ...mockHackathonResponse, status: "published" })
    mockWorkflowStart.mockRejectedValue(new Error("workflow engine unavailable"))

    const pendingNotification = {
      id: "notif1",
      hackathon_id: "h1",
      participant_id: "participant1",
      email: "judge@example.com",
      added_by_name: "Jane Doe",
      sent_at: null,
      created_at: "2026-01-01T00:00:00Z",
    }
    mockFetchPendingNotifications.mockResolvedValue([pendingNotification])

    const notificationSent = new Promise<void>((resolve) => {
      mockSendJudgeNotification.mockImplementation(() => {
        resolve()
        return Promise.resolve()
      })
    })

    const res = await patchSettings({ status: "published" })
    expect(res.status).toBe(200)

    await notificationSent

    expect(mockFetchPendingNotifications).toHaveBeenCalledWith("h1")
    expect(mockSendJudgeNotification).toHaveBeenCalledWith({
      notification: pendingNotification,
      hackathonName: "Test Hackathon",
      hackathonSlug: "test-hackathon",
    })
  })
})
