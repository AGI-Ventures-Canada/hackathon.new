import { beforeEach, describe, expect, it, mock } from "bun:test"

const mockResolvePrincipal = mock(() => Promise.resolve({ kind: "anon" } as unknown))

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
    requirePrincipal: (principal: { kind: string } | null) => {
      if (!principal || principal.kind === "anon") throw new AuthError("Unauthorized", 401)
      return principal
    },
    AuthError,
  }
})

const mockCreateTestEventSandbox = mock(() => Promise.resolve({
  id: "11111111-1111-4111-8111-111111111111",
  name: "Launch Lab Test Event",
  slug: "launch-lab-test-event",
  stage: "judging" as const,
  replayed: false,
  counts: {
    attendees: 36,
    teams: 12,
    projects: 12,
    judges: 6,
    sponsors: 5,
    scheduleItems: 10,
  },
}))
const mockConvertTestEventToDraft = mock(() => Promise.resolve({
  id: "11111111-1111-4111-8111-111111111111",
  name: "Launch Lab Test Event",
  slug: "launch-lab-test-event",
  status: "draft" as const,
  isTestEvent: false as const,
}))

mock.module("@/lib/services/test-event-sandbox", () => {
  class TestEventSandboxError extends Error {
    constructor(message: string, readonly code: string) {
      super(message)
      this.name = "TestEventSandboxError"
    }
  }
  return {
    createTestEventSandbox: mockCreateTestEventSandbox,
    convertTestEventToDraft: mockConvertTestEventToDraft,
    TestEventSandboxError,
  }
})

const mockWithEventMutationLease = mock(
  async (_key: string, mutation: () => Promise<unknown>) => mutation(),
)
mock.module("@/lib/services/event-mutation-lease", () => {
  class EventMutationLeaseError extends Error {
    constructor(message: string, readonly code: string) {
      super(message)
      this.name = "EventMutationLeaseError"
    }
  }
  return {
    withEventMutationLease: mockWithEventMutationLease,
    EventMutationLeaseError,
  }
})

const mockCheckRateLimit = mock(() =>
  Promise.resolve({ allowed: true, remaining: 2, resetAt: Date.now() + 60_000 }),
)
mock.module("@/lib/services/rate-limit", () => {
  class RateLimitError extends Error {
    constructor(readonly resetAt: number, readonly remaining: number) {
      super("Rate limit exceeded")
      this.name = "RateLimitError"
    }
  }
  return {
    checkRateLimit: mockCheckRateLimit,
    getRateLimitHeaders: () => ({}),
    RateLimitError,
  }
})

const mockIsOrgTenant = mock(() => Promise.resolve(true))
mock.module("@/lib/services/tenants", () => ({
  isOrgTenant: mockIsOrgTenant,
  organizationRequiredResponse: () => new Response(JSON.stringify({
    error: "Switch to an organization to create a hackathon.",
    code: "organization_required",
  }), { status: 403, headers: { "Content-Type": "application/json" } }),
}))

const mockCheckHackathonOrganizer = mock(() => Promise.resolve({
  status: "ok" as const,
  hackathon: { id: "11111111-1111-4111-8111-111111111111" },
}))
mock.module("@/lib/services/public-hackathons", () => ({
  checkHackathonOrganizer: mockCheckHackathonOrganizer,
}))

const mockLogAudit = mock(() => Promise.resolve(null))
mock.module("@/lib/services/audit", () => ({ logAudit: mockLogAudit }))

const { Elysia } = await import("elysia")
const { dashboardTestEventRoutes } = await import("@/lib/api/routes/dashboard-test-events")
const { handleRouteError } = await import("@/lib/api/routes/errors")
const { TestEventSandboxError } = await import("@/lib/services/test-event-sandbox")
const { EventMutationLeaseError } = await import("@/lib/services/event-mutation-lease")

const app = new Elysia({ prefix: "/api/dashboard" })
  .onError(({ error, set, path }) => handleRouteError(error, set, path))
  .use(dashboardTestEventRoutes)

const EVENT_ID = "11111111-1111-4111-8111-111111111111"
const CREATE_URL = "http://localhost/api/dashboard/hackathons/test-event"
const userPrincipal = {
  kind: "user" as const,
  tenantId: "tenant-123",
  userId: "user-456",
  orgId: "org-789",
  orgRole: "org:admin",
  scopes: ["hackathons:read", "hackathons:write"],
}

function createRequest(body: Record<string, unknown>) {
  return app.handle(new Request(CREATE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }))
}

describe("test event dashboard routes", () => {
  beforeEach(() => {
    mockResolvePrincipal.mockReset()
    mockResolvePrincipal.mockResolvedValue(userPrincipal)
    mockCreateTestEventSandbox.mockClear()
    mockConvertTestEventToDraft.mockClear()
    mockWithEventMutationLease.mockClear()
    mockCheckRateLimit.mockClear()
    mockCheckRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 2,
      resetAt: Date.now() + 60_000,
    })
    mockIsOrgTenant.mockClear()
    mockIsOrgTenant.mockResolvedValue(true)
    mockCheckHackathonOrganizer.mockClear()
    mockCheckHackathonOrganizer.mockResolvedValue({
      status: "ok",
      hackathon: { id: EVENT_ID },
    })
    mockLogAudit.mockClear()
  })

  it("requires authentication", async () => {
    mockResolvePrincipal.mockResolvedValue({ kind: "anon" })
    const response = await createRequest({
      creationId: EVENT_ID,
      stage: "registration",
      expectedOrganizationId: "org-789",
    })

    expect(response.status).toBe(401)
    expect(mockCreateTestEventSandbox).not.toHaveBeenCalled()
  })

  it("requires an organization admin for a Clerk user", async () => {
    mockResolvePrincipal.mockResolvedValue({ ...userPrincipal, orgRole: "org:member" })
    const response = await createRequest({
      creationId: EVENT_ID,
      stage: "registration",
      expectedOrganizationId: "org-789",
    })

    expect(response.status).toBe(403)
    expect(mockCreateTestEventSandbox).not.toHaveBeenCalled()
  })

  it("fails safely when the active organization changed", async () => {
    const response = await createRequest({
      creationId: EVENT_ID,
      stage: "registration",
      expectedOrganizationId: "org-other",
    })
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.code).toBe("organization_context_changed")
    expect(mockCreateTestEventSandbox).not.toHaveBeenCalled()
  })

  it("creates inside the active organization and reports email suppression", async () => {
    const response = await createRequest({
      creationId: EVENT_ID,
      stage: "judging",
      timeZone: "America/Toronto",
      expectedOrganizationId: "org-789",
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      id: EVENT_ID,
      stage: "judging",
      committed: true,
      delivery: "suppressed",
    })
    expect(mockCreateTestEventSandbox).toHaveBeenCalledWith(
      "tenant-123",
      "judging",
      EVENT_ID,
      "America/Toronto",
    )
    expect(mockWithEventMutationLease).toHaveBeenCalledWith(
      "test-event-tenant-tenant-123",
      expect.any(Function),
    )
    expect(mockLogAudit).toHaveBeenCalledTimes(1)
  })

  it("applies a closed write rate limit before starting the large fixture", async () => {
    mockCheckRateLimit.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 60_000,
    })
    const response = await createRequest({
      creationId: EVENT_ID,
      stage: "registration",
      expectedOrganizationId: "org-789",
    })

    expect(response.status).toBe(429)
    expect(mockCreateTestEventSandbox).not.toHaveBeenCalled()
    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      "test_event_create:user:user-456",
      { maxRequests: 10, windowMs: 60 * 60 * 1000 },
      { failureMode: "closed" },
    )
  })

  it("maps idempotency conflicts to a retry-safe 409 response", async () => {
    mockCreateTestEventSandbox.mockRejectedValueOnce(
      new TestEventSandboxError("That ID already used another stage.", "creation_conflict"),
    )
    const response = await createRequest({
      creationId: EVENT_ID,
      stage: "results",
      expectedOrganizationId: "org-789",
    })
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body).toMatchObject({
      code: "creation_conflict",
      retryable: false,
      committed: false,
    })
  })

  it("reports a tenant creation lease collision as in progress", async () => {
    mockWithEventMutationLease.mockRejectedValueOnce(
      new EventMutationLeaseError("Busy", "event_busy"),
    )
    const response = await createRequest({
      creationId: EVENT_ID,
      stage: "judging",
      expectedOrganizationId: "org-789",
    })
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body).toMatchObject({
      code: "creation_in_progress",
      retryable: true,
      committed: false,
    })
  })

  it("allows a scoped organization API key without a browser organization token", async () => {
    mockResolvePrincipal.mockResolvedValue({
      kind: "api_key",
      tenantId: "tenant-api",
      keyId: "key-1",
      scopes: ["hackathons:write"],
    })
    const response = await createRequest({
      creationId: EVENT_ID,
      stage: "registration",
      timeZone: "UTC",
    })

    expect(response.status).toBe(200)
    expect(mockCreateTestEventSandbox).toHaveBeenCalledWith(
      "tenant-api",
      "registration",
      EVENT_ID,
      "UTC",
    )
  })

  it("does not write a second audit row for an idempotent replay", async () => {
    mockCreateTestEventSandbox.mockResolvedValueOnce({
      ...(await mockCreateTestEventSandbox()),
      replayed: true,
    })
    mockCreateTestEventSandbox.mockClear()
    const response = await createRequest({
      creationId: EVENT_ID,
      stage: "judging",
      expectedOrganizationId: "org-789",
    })

    expect(response.status).toBe(200)
    expect(mockLogAudit).not.toHaveBeenCalled()
  })

  it("converts a tenant-owned test event to a private draft", async () => {
    const response = await app.handle(new Request(
      `http://localhost/api/dashboard/hackathons/${EVENT_ID}/convert-test-event`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedOrganizationId: "org-789" }),
      },
    ))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({ status: "draft", isTestEvent: false, committed: true })
    expect(mockCheckHackathonOrganizer).toHaveBeenCalledWith(EVENT_ID, "tenant-123")
    expect(mockConvertTestEventToDraft).toHaveBeenCalledWith("tenant-123", EVENT_ID)
    expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: "hackathon.test_event_converted",
      metadata: {
        removed: "everyone, all teams, projects, judges, invites, assignments, scores, and generated task history",
        retained: "event setup and custom organizer tasks",
      },
      critical: true,
    }))
  })

  it("reports a committed conversion when the audit write fails", async () => {
    mockLogAudit.mockRejectedValueOnce(new Error("audit unavailable"))

    const response = await app.handle(new Request(
      `http://localhost/api/dashboard/hackathons/${EVENT_ID}/convert-test-event`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedOrganizationId: "org-789" }),
      },
    ))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      status: "draft",
      isTestEvent: false,
      committed: true,
      auditRecorded: false,
    })
    expect(mockConvertTestEventToDraft).toHaveBeenCalledTimes(1)
  })
})
