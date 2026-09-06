import { describe, expect, it, mock, beforeEach } from "bun:test"
import { Elysia } from "elysia"
import {
  createChainableMock,
  resetSupabaseMocks,
  setMockFromImplementation,
} from "../lib/supabase-mock"

const mockHackathonResponse = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "Test Hackathon",
  slug: "test-hackathon",
  description: null,
  rules: null,
  banner_url: null,
  status: "published",
  updated_at: "2026-08-25T15:00:00.000Z",
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
  default_locale: "en",
  translations: null,
}

const mockCheckHackathonOrganizer = mock(() =>
  Promise.resolve({ status: "ok", hackathon: mockHackathonResponse })
)
const mockUpdateHackathonSettings = mock(() => Promise.resolve(mockHackathonResponse))
const mockUpdateHackathonTranslation = mock(() => Promise.resolve(mockHackathonResponse))
const mockGetHackathonByIdForOrganizer = mock(() => Promise.resolve(mockHackathonResponse))
const mockDeleteHackathon = mock(() => Promise.resolve(true))

mock.module("@/lib/services/public-hackathons", () => ({
  checkHackathonOrganizer: mockCheckHackathonOrganizer,
  getHackathonByIdForOrganizer: mockGetHackathonByIdForOrganizer,
  updateHackathonSettings: mockUpdateHackathonSettings,
  updateHackathonTranslation: mockUpdateHackathonTranslation,
  deleteHackathon: mockDeleteHackathon,
}))

const mockExecuteTransition = mock(() =>
  Promise.resolve({ success: true, hackathon: mockHackathonResponse }),
)
const mockGetJudgingCompletionReadiness = mock(() =>
  Promise.resolve({
    ready: true,
    requiresJudgeScoring: false,
    incompleteAssignmentCount: 0,
    incompleteResponseCount: 0,
    reasons: [],
  }),
)
mock.module("@/lib/services/lifecycle", () => ({
  executeTransition: mockExecuteTransition,
  getJudgingCompletionReadiness: mockGetJudgingCompletionReadiness,
}))

mock.module("@/lib/services/judge-invitations", () => ({
  sendPendingJudgeInvitationEmails: mock(() => Promise.resolve({ sent: 0, total: 0, failedEmails: [] })),
  createJudgeInvitation: mock(() => Promise.resolve({ success: true })),
  listJudgeInvitations: mock(() => Promise.resolve([])),
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

mock.module("workflow/api", () => ({ start: mock(() => Promise.resolve({ runId: "run_1" })) }))
mock.module("@/lib/workflows/judge-notifications", () => ({
  sendJudgeNotificationsWorkflow: mock(() => Promise.resolve()),
}))
mock.module("@/lib/workflows/judge-notifications/steps", () => ({
  fetchPendingNotifications: mock(() => Promise.resolve([])),
  sendJudgeNotification: mock(() => Promise.resolve()),
}))

mock.module("@clerk/nextjs/server", () => ({
  auth: mock(() => Promise.resolve({ userId: null })),
  clerkClient: mock(() => Promise.resolve({ users: { getUser: mock(() => Promise.resolve({ firstName: "Jane", lastName: "Doe" })) } })),
}))

const realTimeline = await import("@/lib/utils/timeline")
mock.module("@/lib/utils/timeline", () => ({
  ...realTimeline,
  validateTimelineDates: mock(() => null),
  getEffectiveStatus: mock((h: {
    status: string
    starts_at?: string | null
    ends_at?: string | null
  }) => {
    if (h.status === "draft" || h.status === "archived") return h.status
    if (h.ends_at && Date.now() >= new Date(h.ends_at).getTime()) {
      return h.status === "judging" ? "judging" : "completed"
    }
    if (h.starts_at && Date.now() >= new Date(h.starts_at).getTime()) return "active"
    return h.status
  }),
}))

mock.module("@/lib/utils/url", () => ({
  normalizeOptionalUrl: mock((url: string | undefined) => url),
  normalizeUrl: mock((url: string) => url),
  isSafeExternalUrl: mock(() => true),
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

mock.module("@/lib/api/routes/dashboard-judging", () => ({ dashboardJudgingRoutes: new Elysia() }))
mock.module("@/lib/api/routes/dashboard-prizes", () => ({ dashboardPrizesRoutes: new Elysia() }))
mock.module("@/lib/api/routes/dashboard-results", () => ({ dashboardResultsRoutes: new Elysia() }))
mock.module("@/lib/api/routes/dashboard-judge-display", () => ({ dashboardJudgeDisplayRoutes: new Elysia() }))

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
  tenantId: "22222222-2222-2222-2222-222222222222",
  userId: "user-456",
  orgId: "org-789",
  orgRole: "org:admin",
  scopes: ["hackathons:read", "hackathons:write"],
}

function patchSettings(
  body: Record<string, unknown>,
  headers?: Record<string, string>,
) {
  return app.handle(
    new Request("http://localhost/api/dashboard/hackathons/11111111-1111-1111-1111-111111111111/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    })
  )
}

describe("PATCH /api/dashboard/hackathons/:id/settings - locale branch", () => {
  beforeEach(() => {
    resetSupabaseMocks()
    mockResolvePrincipal.mockClear()
    mockCheckHackathonOrganizer.mockClear()
    mockUpdateHackathonSettings.mockClear()
    mockUpdateHackathonTranslation.mockClear()
    mockGetHackathonByIdForOrganizer.mockClear()
    mockLogAudit.mockClear()
    mockTriggerWebhooks.mockClear()
    mockExecuteTransition.mockClear()

    mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
    mockCheckHackathonOrganizer.mockResolvedValue({ status: "ok", hackathon: mockHackathonResponse })
    mockUpdateHackathonSettings.mockResolvedValue(mockHackathonResponse)
    mockUpdateHackathonTranslation.mockResolvedValue(mockHackathonResponse)
  })

  it("routes translatable fields through updateHackathonTranslation when locale differs from primary", async () => {
    const res = await patchSettings({ locale: "fr", name: "Bonjour", description: "French desc" })
    expect(res.status).toBe(200)

    expect(mockUpdateHackathonTranslation).toHaveBeenCalledTimes(1)
    expect(mockUpdateHackathonTranslation).toHaveBeenCalledWith(
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
      "fr",
      expect.objectContaining({ name: "Bonjour", description: "French desc" })
    )
    expect(mockUpdateHackathonSettings).toHaveBeenCalledWith(
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
      expect.any(Object),
      {
        expectedVersion: "2026-08-25T15:00:00.000Z",
        allowedStatuses: ["draft", "published", "registration_open", "active", "judging"],
      },
    )
  })

  it("normalizes unusual locale strings before using as translation key", async () => {
    const res = await patchSettings({ locale: "FR-CA", name: "Bonjour" })
    expect(res.status).toBe(200)

    expect(mockUpdateHackathonTranslation).toHaveBeenCalledWith(
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
      "fr",
      expect.objectContaining({ name: "Bonjour" })
    )
  })

  it("falls through to updateHackathonSettings when normalized locale equals primary", async () => {
    const res = await patchSettings({ locale: "EN_US", name: "Hello" })
    expect(res.status).toBe(200)

    expect(mockUpdateHackathonTranslation).not.toHaveBeenCalled()
    expect(mockUpdateHackathonSettings).toHaveBeenCalledWith(
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
      expect.objectContaining({ name: "Hello" }),
      {
        expectedVersion: "2026-08-25T15:00:00.000Z",
        allowedStatuses: ["draft", "published", "registration_open", "active", "judging"],
      },
    )
  })

  it("allows a current WebMCP details update before completion", async () => {
    mockCheckHackathonOrganizer.mockResolvedValue({
      status: "ok",
      hackathon: {
        ...mockHackathonResponse,
        starts_at: "2020-01-01T00:00:00.000Z",
        ends_at: "2099-01-01T00:00:00.000Z",
      },
    })
    const res = await patchSettings(
      { name: "Updated name" },
      {
        "x-webmcp-request": "1",
        "x-webmcp-expected-status": "active",
        "x-webmcp-event-version": "2026-08-25T15:00:00.000Z",
      },
    )

    expect(res.status).toBe(200)
    expect(mockUpdateHackathonSettings).toHaveBeenCalledTimes(1)
  })

  it("rejects an expired WebMCP details update before writing", async () => {
    mockCheckHackathonOrganizer.mockResolvedValue({
      status: "ok",
      hackathon: {
        ...mockHackathonResponse,
        starts_at: "2019-01-01T00:00:00.000Z",
        ends_at: "2020-01-01T00:00:00.000Z",
      },
    })

    const res = await patchSettings(
      { name: "Late update" },
      {
        "x-webmcp-request": "1",
        "x-webmcp-expected-status": "active",
        "x-webmcp-event-version": "2026-08-25T15:00:00.000Z",
      },
    )

    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: "event_changed" })
    expect(mockUpdateHackathonSettings).not.toHaveBeenCalled()
  })

  it("rejects WebMCP timeline updates after draft", async () => {
    const res = await patchSettings(
      {
        startsAt: "2026-09-10T16:00:00.000Z",
        endsAt: "2026-09-11T16:00:00.000Z",
      },
      {
        "x-webmcp-request": "1",
        "x-webmcp-expected-status": "published",
        "x-webmcp-event-version": "2026-08-25T15:00:00.000Z",
      },
    )

    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: "event_changed" })
    expect(mockUpdateHackathonSettings).not.toHaveBeenCalled()
  })

  it("rejects stale or out-of-contract WebMCP settings updates", async () => {
    const stale = await patchSettings(
      { name: "Stale name" },
      {
        "x-webmcp-request": "1",
        "x-webmcp-expected-status": "published",
        "x-webmcp-event-version": "2026-08-25T14:00:00.000Z",
      },
    )
    expect(stale.status).toBe(409)

    const statusChange = await patchSettings(
      { status: "active" },
      {
        "x-webmcp-request": "1",
        "x-webmcp-expected-status": "published",
        "x-webmcp-event-version": "2026-08-25T15:00:00.000Z",
      },
    )
    expect(statusChange.status).toBe(400)
    expect(await statusChange.json()).toMatchObject({
      code: "webmcp_invalid_mutation",
    })
    expect(mockUpdateHackathonSettings).not.toHaveBeenCalled()
  })

  it("rejects ordinary settings writes after the event is complete", async () => {
    mockCheckHackathonOrganizer.mockResolvedValue({
      status: "ok",
      hackathon: { ...mockHackathonResponse, status: "completed" },
    })

    const res = await patchSettings({ name: "Too late" })

    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: "event_changed" })
    expect(mockUpdateHackathonSettings).not.toHaveBeenCalled()
  })

  it("rejects a status change mixed with any other setting", async () => {
    const res = await patchSettings({ status: "active", name: "Mixed write" })

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({
      error: "Change the event stage separately from other settings.",
      code: "status_must_be_separate",
    })
    expect(mockCheckHackathonOrganizer).not.toHaveBeenCalled()
    expect(mockExecuteTransition).not.toHaveBeenCalled()
    expect(mockUpdateHackathonSettings).not.toHaveBeenCalled()
  })

  it("returns a stable conflict while another settings mutation owns the event lease", async () => {
    let rateLimitCall = 0
    setMockFromImplementation((table) => {
      if (table === "hackathons") {
        return createChainableMock({ data: { id: mockHackathonResponse.id }, error: null })
      }
      if (table === "rate_limits") {
        rateLimitCall += 1
        return createChainableMock(
          rateLimitCall === 2
            ? { data: null, error: { message: "duplicate", code: "23505" } }
            : { data: null, error: null },
        )
      }
      return createChainableMock({ data: null, error: null })
    })

    const res = await patchSettings({ name: "Wait for the other save" })

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({
      error: "Another event change is still being saved.",
      code: "event_busy",
    })
    expect(mockCheckHackathonOrganizer).not.toHaveBeenCalled()
    expect(mockUpdateHackathonSettings).not.toHaveBeenCalled()
  })

  it("returns a stable retryable failure when the settings lease is unavailable", async () => {
    setMockFromImplementation((table) =>
      createChainableMock(
        table === "hackathons"
          ? { data: { id: mockHackathonResponse.id }, error: null }
          : table === "rate_limits"
          ? { data: null, error: { message: "database unavailable" } }
          : { data: null, error: null },
      ),
    )

    const res = await patchSettings({ name: "Try later" })

    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({
      error: "The event change lock is unavailable.",
      code: "lease_unavailable",
    })
    expect(mockCheckHackathonOrganizer).not.toHaveBeenCalled()
    expect(mockUpdateHackathonSettings).not.toHaveBeenCalled()
  })

  it("falls through to updateHackathonSettings when locale normalizes to null", async () => {
    const res = await patchSettings({ locale: "123", name: "Hello" })
    expect(res.status).toBe(200)

    expect(mockUpdateHackathonTranslation).not.toHaveBeenCalled()
    expect(mockUpdateHackathonSettings).toHaveBeenCalledWith(
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
      expect.objectContaining({ name: "Hello" }),
      {
        expectedVersion: "2026-08-25T15:00:00.000Z",
        allowedStatuses: ["draft", "published", "registration_open", "active", "judging"],
      },
    )
  })

  it("excludes translatable fields from updateHackathonSettings when both translation and non-translation fields are sent", async () => {
    const res = await patchSettings({
      locale: "fr",
      name: "Bonjour",
      maxTeamSize: 10,
      anonymousJudging: true,
    })
    expect(res.status).toBe(200)

    expect(mockUpdateHackathonTranslation).toHaveBeenCalledWith(
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
      "fr",
      expect.objectContaining({ name: "Bonjour" })
    )
    const translationCall = mockUpdateHackathonTranslation.mock.calls[0]![3] as Record<string, unknown>
    expect(translationCall).not.toHaveProperty("maxTeamSize")
    expect(translationCall).not.toHaveProperty("anonymousJudging")

    expect(mockUpdateHackathonSettings).toHaveBeenCalledTimes(1)
    const settingsCall = mockUpdateHackathonSettings.mock.calls[0]![2] as Record<string, unknown>
    expect(settingsCall).toMatchObject({ maxTeamSize: 10, anonymousJudging: true })
    expect(settingsCall).not.toHaveProperty("name")
  })

  it("rejects empty locale via schema validation", async () => {
    const res = await patchSettings({ locale: "", name: "Hello" })
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)

    expect(mockUpdateHackathonTranslation).not.toHaveBeenCalled()
    expect(mockUpdateHackathonSettings).not.toHaveBeenCalled()
  })

  it("returns 500 when the translation write fails after the organizer check passes", async () => {
    mockUpdateHackathonTranslation.mockResolvedValueOnce(null as never)

    const res = await patchSettings({ locale: "fr", name: "Bonjour" })
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe("Failed to update translation")
  })

  it("returns a conflict when the guarded settings write loses its event version", async () => {
    mockUpdateHackathonSettings.mockResolvedValueOnce(null as never)

    const res = await patchSettings({ locale: "fr", name: "Bonjour", maxTeamSize: 10 })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.code).toBe("event_changed")
  })
})

describe("PATCH /api/dashboard/hackathons/:id/settings - terms validation", () => {
  beforeEach(() => {
    resetSupabaseMocks()
    mockResolvePrincipal.mockClear()
    mockCheckHackathonOrganizer.mockClear()
    mockUpdateHackathonSettings.mockClear()
    mockUpdateHackathonTranslation.mockClear()

    mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
    mockUpdateHackathonSettings.mockResolvedValue(mockHackathonResponse)
  })

  it("rejects requireTermsAcceptance=true when no terms content is set anywhere", async () => {
    mockCheckHackathonOrganizer.mockResolvedValue({
      status: "ok",
      hackathon: { ...mockHackathonResponse, terms_content: null },
    })

    const res = await patchSettings({ requireTermsAcceptance: true })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe("terms_content_required")
    expect(mockUpdateHackathonSettings).not.toHaveBeenCalled()
  })

  it("rejects requireTermsAcceptance=true when body explicitly sets termsContent to null", async () => {
    mockCheckHackathonOrganizer.mockResolvedValue({
      status: "ok",
      hackathon: { ...mockHackathonResponse, terms_content: "Existing terms" },
    })

    const res = await patchSettings({ requireTermsAcceptance: true, termsContent: null })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe("terms_content_required")
    expect(mockUpdateHackathonSettings).not.toHaveBeenCalled()
  })

  it("rejects requireTermsAcceptance=true when body termsContent is whitespace only", async () => {
    mockCheckHackathonOrganizer.mockResolvedValue({
      status: "ok",
      hackathon: { ...mockHackathonResponse, terms_content: null },
    })

    const res = await patchSettings({ requireTermsAcceptance: true, termsContent: "   \n  " })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe("terms_content_required")
  })

  it("accepts requireTermsAcceptance=true when content is provided in body", async () => {
    mockCheckHackathonOrganizer.mockResolvedValue({
      status: "ok",
      hackathon: { ...mockHackathonResponse, terms_content: null },
    })

    const res = await patchSettings({
      requireTermsAcceptance: true,
      termsContent: "## Terms\n\nBe excellent.",
    })
    expect(res.status).toBe(200)
    expect(mockUpdateHackathonSettings).toHaveBeenCalledWith(
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
      expect.objectContaining({
        requireTermsAcceptance: true,
        termsContent: "## Terms\n\nBe excellent.",
      }),
      {
        expectedVersion: "2026-08-25T15:00:00.000Z",
        allowedStatuses: ["draft", "published", "registration_open", "active", "judging"],
      },
    )
  })

  it("accepts requireTermsAcceptance=true when content already exists in DB", async () => {
    mockCheckHackathonOrganizer.mockResolvedValue({
      status: "ok",
      hackathon: { ...mockHackathonResponse, terms_content: "Existing terms" },
    })

    const res = await patchSettings({ requireTermsAcceptance: true })
    expect(res.status).toBe(200)
  })

  it("accepts requireTermsAcceptance=false without requiring content", async () => {
    mockCheckHackathonOrganizer.mockResolvedValue({
      status: "ok",
      hackathon: { ...mockHackathonResponse, terms_content: null },
    })

    const res = await patchSettings({ requireTermsAcceptance: false })
    expect(res.status).toBe(200)
  })
})
