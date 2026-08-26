import { beforeEach, describe, expect, it, mock } from "bun:test"

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
    requirePrincipal: (principal: { kind: string }) => {
      if (principal.kind === "anon") throw new AuthError("Unauthorized", 401)
    },
    AuthError,
  }
})

const mockCheckHackathonOrganizer = mock(() => Promise.resolve({ status: "not_found" }))

mock.module("@/lib/services/public-hackathons", () => ({
  checkHackathonOrganizer: mockCheckHackathonOrganizer,
}))

const mockGetTeamWithHackathon = mock(() => Promise.resolve(null))
const mockRemindTeamInvitationAsOrganizer = mock(() =>
  Promise.resolve({ success: false, error: "not configured", code: "not_found" }),
)
const mockReleaseTeamInvitationReminderClaim = mock(() => Promise.resolve())

mock.module("@/lib/services/team-invitations", () => ({
  getTeamWithHackathon: mockGetTeamWithHackathon,
  remindTeamInvitationAsOrganizer: mockRemindTeamInvitationAsOrganizer,
  releaseTeamInvitationReminderClaim: mockReleaseTeamInvitationReminderClaim,
}))

const mockSendTeamInvitationEmail = mock(() => Promise.resolve({ success: true }))

mock.module("@/lib/email/team-invitations", () => ({
  sendTeamInvitationEmail: mockSendTeamInvitationEmail,
}))

const mockCancelUpcomingReminder = mock(() => Promise.resolve(1))

mock.module("@/lib/services/smart-reminders", () => ({
  cancelUpcomingReminder: mockCancelUpcomingReminder,
}))

const mockResolveAdderEmail = mock(() => Promise.resolve("organizer@example.com"))

mock.module("@/lib/auth/resolve-adder-name", () => ({
  resolveAdderEmail: mockResolveAdderEmail,
}))

const mockLogAudit = mock(() => Promise.resolve())

mock.module("@/lib/services/audit", () => ({
  logAudit: mockLogAudit,
}))

const mockCheckRateLimit = mock(() => ({
  allowed: true,
  remaining: 4,
  resetAt: Date.now() + 60_000,
}))

mock.module("@/lib/services/rate-limit", () => ({
  checkRateLimit: mockCheckRateLimit,
  getRateLimitHeaders: () => ({}),
  defaultRateLimits: {
    "api_key:default": { maxRequests: 100, windowMs: 60_000 },
  },
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
const TEAM_ID = "22222222-2222-2222-2222-222222222222"
const INVITATION_ID = "33333333-3333-3333-3333-333333333333"
const REMINDED_AT = "2026-08-26T12:00:00.000Z"
const URL = `http://localhost/api/dashboard/hackathons/${HACKATHON_ID}/teams/${TEAM_ID}/invitations/${INVITATION_ID}/remind`

const principal = {
  kind: "user" as const,
  tenantId: "tenant_1",
  userId: "user_1",
  orgId: "org_1",
  orgRole: "org:admin",
  scopes: ["hackathons:read", "hackathons:write"],
}

const activeHackathon = {
  id: HACKATHON_ID,
  name: "Test Hackathon",
  slug: "test-hackathon",
  status: "active" as const,
  starts_at: "2099-06-01T00:00:00Z",
  ends_at: "2099-06-02T00:00:00Z",
}

describe("organizer team invitation reminders", () => {
  beforeEach(() => {
    mockResolvePrincipal.mockReset()
    mockResolvePrincipal.mockResolvedValue(principal)
    mockCheckHackathonOrganizer.mockReset()
    mockCheckHackathonOrganizer.mockResolvedValue({
      status: "authorized",
      hackathon: activeHackathon,
    })
    mockGetTeamWithHackathon.mockReset()
    mockGetTeamWithHackathon.mockResolvedValue({
      name: "Team One",
      hackathon: activeHackathon,
      memberNames: ["Ada", "Grace"],
    })
    mockRemindTeamInvitationAsOrganizer.mockReset()
    mockRemindTeamInvitationAsOrganizer.mockResolvedValue({
      success: true,
      invitation: {
        id: INVITATION_ID,
        email: "person@example.com",
        token: "token_1",
        expires_at: "2099-06-01T00:00:00Z",
        reminded_at: REMINDED_AT,
        updated_at: REMINDED_AT,
      },
    })
    mockReleaseTeamInvitationReminderClaim.mockReset()
    mockReleaseTeamInvitationReminderClaim.mockResolvedValue()
    mockSendTeamInvitationEmail.mockReset()
    mockSendTeamInvitationEmail.mockResolvedValue({ success: true })
    mockCancelUpcomingReminder.mockReset()
    mockCancelUpcomingReminder.mockResolvedValue(1)
    mockResolveAdderEmail.mockReset()
    mockResolveAdderEmail.mockResolvedValue("organizer@example.com")
    mockLogAudit.mockReset()
    mockLogAudit.mockResolvedValue()
    mockCheckRateLimit.mockReset()
    mockCheckRateLimit.mockReturnValue({
      allowed: true,
      remaining: 4,
      resetAt: Date.now() + 60_000,
    })
  })

  it("rejects unauthenticated, invalid-id, and unauthorized requests", async () => {
    mockResolvePrincipal.mockResolvedValue({ kind: "anon" })
    let res = await app.handle(new Request(URL, { method: "POST" }))
    expect(res.status).toBe(401)

    mockResolvePrincipal.mockResolvedValue(principal)
    res = await app.handle(new Request(
      `http://localhost/api/dashboard/hackathons/${HACKATHON_ID}/teams/bad/invitations/bad/remind`,
      { method: "POST" },
    ))
    expect(res.status).toBe(400)

    mockCheckHackathonOrganizer.mockResolvedValue({ status: "not_authorized" })
    res = await app.handle(new Request(URL, { method: "POST" }))
    expect(res.status).toBe(403)
    expect(mockGetTeamWithHackathon).not.toHaveBeenCalled()
  })

  it("rejects draft and ended events before rate limiting or claiming", async () => {
    for (const hackathon of [
      { ...activeHackathon, status: "draft" as const },
      { ...activeHackathon, status: "completed" as const },
    ]) {
      mockCheckHackathonOrganizer.mockResolvedValue({
        status: "authorized",
        hackathon,
      })

      const res = await app.handle(new Request(URL, { method: "POST" }))
      const data = await res.json()

      expect(res.status).toBe(hackathon.status === "draft" ? 400 : 409)
      expect(data.code).toBe(
        hackathon.status === "draft" ? "hackathon_draft" : "hackathon_ended",
      )
    }

    expect(mockCheckRateLimit).not.toHaveBeenCalled()
    expect(mockRemindTeamInvitationAsOrganizer).not.toHaveBeenCalled()
  })

  it("rejects malformed idempotency keys and rate-limited requests", async () => {
    let res = await app.handle(new Request(URL, {
      method: "POST",
      headers: { "Idempotency-Key": "x".repeat(201) },
    }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe("invalid_idempotency_key")
    expect(mockCheckRateLimit).not.toHaveBeenCalled()

    mockCheckRateLimit.mockReturnValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 60_000,
    })
    res = await app.handle(new Request(URL, { method: "POST" }))
    expect(res.status).toBe(429)
    expect(mockRemindTeamInvitationAsOrganizer).not.toHaveBeenCalled()
  })

  it("rejects cross-event teams and service-level claim conflicts", async () => {
    mockGetTeamWithHackathon.mockResolvedValue({
      name: "Team One",
      hackathon: { ...activeHackathon, id: "44444444-4444-4444-4444-444444444444" },
      memberNames: [],
    })
    let res = await app.handle(new Request(URL, { method: "POST" }))
    expect(res.status).toBe(404)
    expect(mockRemindTeamInvitationAsOrganizer).not.toHaveBeenCalled()

    mockGetTeamWithHackathon.mockResolvedValue({
      name: "Team One",
      hackathon: activeHackathon,
      memberNames: [],
    })
    mockRemindTeamInvitationAsOrganizer.mockResolvedValue({
      success: false,
      error: "Reminder already sent",
      code: "already_reminded",
    })
    res = await app.handle(new Request(URL, { method: "POST" }))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ code: "already_reminded" })
    expect(mockSendTeamInvitationEmail).not.toHaveBeenCalled()
  })

  it("sends once, cancels the queued reminder, and records the audit event", async () => {
    const res = await app.handle(new Request(URL, {
      method: "POST",
      headers: { "Idempotency-Key": "stable-retry-key" },
    }))

    expect(res.status).toBe(200)
    expect(mockSendTeamInvitationEmail).toHaveBeenCalledTimes(1)
    expect(mockSendTeamInvitationEmail).toHaveBeenCalledWith(expect.objectContaining({
      deliveryId: expect.stringMatching(new RegExp(`^${INVITATION_ID}/manual/[a-f0-9]{24}$`)),
      hackathonSlug: "test-hackathon",
      teamMembers: ["Ada", "Grace"],
    }))
    expect(mockCancelUpcomingReminder).toHaveBeenCalledWith(
      "team_invitation",
      INVITATION_ID,
    )
    expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: "team_invitation.reminded",
      metadata: {
        hackathonId: HACKATHON_ID,
        teamId: TEAM_ID,
        viaOrganizer: true,
      },
    }))
  })

  it("releases the claim when the provider rejects or throws", async () => {
    for (const delivery of [
      () => Promise.resolve({ success: false }),
      () => Promise.reject(new Error("provider unavailable")),
    ]) {
      mockSendTeamInvitationEmail.mockImplementationOnce(delivery)

      const res = await app.handle(new Request(URL, { method: "POST" }))

      expect(res.status).toBe(502)
      expect(await res.json()).toMatchObject({ code: "email_delivery_failed" })
    }

    expect(mockReleaseTeamInvitationReminderClaim).toHaveBeenCalledTimes(2)
    expect(mockReleaseTeamInvitationReminderClaim).toHaveBeenCalledWith(
      INVITATION_ID,
      REMINDED_AT,
    )
    expect(mockCancelUpcomingReminder).not.toHaveBeenCalled()
    expect(mockLogAudit).not.toHaveBeenCalled()
  })

  it("still returns delivery failure if releasing the claim also fails", async () => {
    mockSendTeamInvitationEmail.mockResolvedValue({ success: false })
    mockReleaseTeamInvitationReminderClaim.mockRejectedValue(new Error("write failed"))

    const res = await app.handle(new Request(URL, { method: "POST" }))

    expect(res.status).toBe(502)
    expect(await res.json()).toMatchObject({ code: "email_delivery_failed" })
    expect(mockReleaseTeamInvitationReminderClaim).toHaveBeenCalledTimes(1)
  })

  it("reports cleanup failure after a successful provider delivery", async () => {
    mockCancelUpcomingReminder.mockRejectedValue(new Error("database unavailable"))

    const res = await app.handle(new Request(URL, { method: "POST" }))

    expect(res.status).toBe(500)
    expect(await res.json()).toMatchObject({ code: "reminder_state_failed" })
    expect(mockSendTeamInvitationEmail).toHaveBeenCalledTimes(1)
    expect(mockLogAudit).not.toHaveBeenCalled()
  })
})
