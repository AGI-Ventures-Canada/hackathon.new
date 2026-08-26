import { describe, expect, it, mock, beforeEach } from "bun:test"
import { resetClerkMocks } from "../lib/supabase-mock"

const mockCheckHackathonOrganizer = mock(() => Promise.resolve({ status: "ok" }))
const mockDeleteHackathon = mock(() => Promise.resolve(true))
const mockLogAudit = mock(() => Promise.resolve(null))
const mockTriggerWebhooks = mock(() => Promise.resolve())
const mockCreateHackathon = mock(() =>
  Promise.resolve({ id: "h-new", name: "New Hack", slug: "new-hack" })
)
type MockAggregateResult =
  | { status: "created"; hackathon: { id: string; name: string; slug: string } }
  | { status: "replayed"; hackathon: { id: string; name: string; slug: string } }
  | {
      status: "invalid"
      hackathon: null
      error: {
        code: "invalid_draft" | "incomplete_agenda"
        message: string
      }
    }
  | {
      status: "invalid"
      hackathon: { id: string; name: string; slug: string }
      error: {
        code: "draft_conflict"
        message: string
      }
    }
  | { status: "in_progress" | "failed"; hackathon: null }

const mockCreateHackathonAggregate = mock((): Promise<MockAggregateResult> =>
  Promise.resolve({
    status: "created",
    hackathon: { id: "h-new", name: "New Hack", slug: "new-hack" },
  })
)
type MockFinalizationResult =
  | { status: "complete" | "in_progress" | "failed" }
  | {
      status: "invalid"
      error: { code: "draft_conflict"; message: string }
    }
const mockFinalizeHackathonCreation = mock(
  (): Promise<MockFinalizationResult> => Promise.resolve({ status: "complete" }),
)
const mockStartHackathonCreationFinalizationWorkflow = mock(
  (): Promise<string | null> => Promise.resolve("creation-finalization-run-1"),
)
const mockGetTenantById = mock(() =>
  Promise.resolve({ id: "tenant-123", clerk_org_id: "org-789", clerk_user_id: null })
)

mock.module("@/lib/services/public-hackathons", () => ({
  checkHackathonOrganizer: mockCheckHackathonOrganizer,
  deleteHackathon: mockDeleteHackathon,
}))

mock.module("@/lib/services/hackathons", () => ({
  createHackathon: mockCreateHackathon,
}))

mock.module("@/lib/services/luma-import-create", () => ({
  createHackathonAggregateWithResult: mockCreateHackathonAggregate,
  finalizeHackathonCreation: mockFinalizeHackathonCreation,
}))

mock.module("@/lib/workflows/creation-finalization", () => ({
  startHackathonCreationFinalizationWorkflow:
    mockStartHackathonCreationFinalizationWorkflow,
}))

mock.module("@/lib/services/tenants", () => ({
  getTenantById: mockGetTenantById,
  isOrgTenant: async (_tenantId: string) => {
    const tenant = await mockGetTenantById()
    return Boolean(tenant?.clerk_org_id)
  },
  organizationRequiredResponse: () =>
    new Response(
      JSON.stringify({
        error:
          "Switch to an organization to create a hackathon. Personal accounts can't host events.",
        code: "organization_required",
      }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    ),
}))

mock.module("@/lib/services/audit", () => ({
  logAudit: mockLogAudit,
  listAllAuditLogs: mock(() => Promise.resolve({ logs: [], total: 0 })),
}))

mock.module("@/lib/services/webhooks", () => ({
  triggerWebhooks: mockTriggerWebhooks,
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

describe("DELETE /api/dashboard/hackathons/:id", () => {
  beforeEach(() => {
    resetClerkMocks()
    mockResolvePrincipal.mockReset()
    mockCheckHackathonOrganizer.mockReset()
    mockDeleteHackathon.mockReset()
    mockLogAudit.mockReset()
    mockTriggerWebhooks.mockReset()
  })

  it("rejects unauthenticated requests", async () => {
    mockResolvePrincipal.mockResolvedValue({ kind: "anon" })

    const res = await app.handle(
      new Request("http://localhost/api/dashboard/hackathons/h1", { method: "DELETE" })
    )
    const data = await res.json()

    expect(data.error).toBe("Unauthorized")
    expect(res.status).toBeGreaterThanOrEqual(400)
  })

  it("returns 404 when hackathon not found", async () => {
    mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
    mockCheckHackathonOrganizer.mockResolvedValue({ status: "not_found" })

    const res = await app.handle(
      new Request("http://localhost/api/dashboard/hackathons/h1", { method: "DELETE" })
    )
    const data = await res.json()

    expect(res.status).toBe(404)
    expect(data.error).toBe("Hackathon not found")
  })

  it("returns 403 when tenant does not own hackathon", async () => {
    mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
    mockCheckHackathonOrganizer.mockResolvedValue({ status: "not_authorized" })

    const res = await app.handle(
      new Request("http://localhost/api/dashboard/hackathons/h1", { method: "DELETE" })
    )
    const data = await res.json()

    expect(res.status).toBe(403)
    expect(data.error).toBe("Not authorized")
  })

  it("returns 200 with success on successful delete", async () => {
    mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
    mockCheckHackathonOrganizer.mockResolvedValue({ status: "ok" })
    mockDeleteHackathon.mockResolvedValue(true)

    const res = await app.handle(
      new Request("http://localhost/api/dashboard/hackathons/h1", { method: "DELETE" })
    )
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
  })

  it("returns 500 when delete service call fails", async () => {
    mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
    mockCheckHackathonOrganizer.mockResolvedValue({ status: "ok" })
    mockDeleteHackathon.mockResolvedValue(false)

    const res = await app.handle(
      new Request("http://localhost/api/dashboard/hackathons/h1", { method: "DELETE" })
    )
    const data = await res.json()

    expect(res.status).toBe(500)
    expect(data.error).toBe("Failed to delete hackathon")
  })
})

describe("POST /api/dashboard/hackathons", () => {
  beforeEach(() => {
    resetClerkMocks()
    mockResolvePrincipal.mockReset()
    mockCreateHackathon.mockReset()
    mockCreateHackathonAggregate.mockReset()
    mockFinalizeHackathonCreation.mockReset()
    mockStartHackathonCreationFinalizationWorkflow.mockReset()
    mockGetTenantById.mockReset()
    mockLogAudit.mockReset()
    mockTriggerWebhooks.mockReset()
    mockLogAudit.mockResolvedValue(null)
    mockTriggerWebhooks.mockResolvedValue(undefined)
    mockFinalizeHackathonCreation.mockResolvedValue({ status: "complete" })
    mockStartHackathonCreationFinalizationWorkflow.mockResolvedValue(
      "creation-finalization-run-1",
    )
  })

  it("rejects personal-account principals with organization_required", async () => {
    mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
    mockGetTenantById.mockResolvedValue({
      id: "tenant-personal",
      clerk_org_id: null,
      clerk_user_id: "user-456",
    })

    const res = await app.handle(
      new Request("http://localhost/api/dashboard/hackathons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "My Hack" }),
      })
    )
    const data = await res.json()

    expect(res.status).toBe(403)
    expect(data.code).toBe("organization_required")
    expect(mockCreateHackathonAggregate).not.toHaveBeenCalled()
  })

  it("creates hackathon for an org-backed tenant", async () => {
    mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
    mockGetTenantById.mockResolvedValue({
      id: "tenant-123",
      clerk_org_id: "org-789",
      clerk_user_id: null,
    })
    mockCreateHackathonAggregate.mockResolvedValue({
      status: "created",
      hackathon: {
        id: "h-new",
        name: "Org Hack",
        slug: "org-hack",
      },
    })

    const res = await app.handle(
      new Request("http://localhost/api/dashboard/hackathons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Org Hack" }),
      })
    )
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.id).toBe("h-new")
    expect(data.replayed).toBe(false)
    expect(mockCreateHackathonAggregate).toHaveBeenCalledTimes(1)
    expect(mockCreateHackathonAggregate).toHaveBeenCalledWith("tenant-123", {
      draftId: undefined,
      name: "Org Hack",
      description: null,
      startsAt: null,
      endsAt: null,
      registrationOpensAt: null,
      registrationClosesAt: null,
      locationType: null,
      locationName: null,
      locationUrl: null,
      imageUrl: null,
      sponsors: [],
      rules: null,
      prizes: [],
      challenges: [],
      agendaItems: [],
    })
    expect(mockFinalizeHackathonCreation).toHaveBeenCalledWith({
      tenantId: "tenant-123",
      principal: mockUserPrincipal,
      hackathon: { id: "h-new", name: "Org Hack", slug: "org-hack" },
      auditMetadata: { name: "Org Hack" },
      webhookData: {
        hackathonId: "h-new",
        name: "Org Hack",
        slug: "org-hack",
      },
    })
  })

  it("rejects a create click when the active organization changed", async () => {
    mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)

    const res = await app.handle(
      new Request("http://localhost/api/dashboard/hackathons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Wrong Org Hack",
          expectedOrganizationId: "org-other",
        }),
      }),
    )

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({
      error: "Your active organization changed. Review it and try again.",
      code: "organization_context_changed",
      retryable: true,
    })
    expect(mockGetTenantById).not.toHaveBeenCalled()
    expect(mockCreateHackathonAggregate).not.toHaveBeenCalled()
  })

  it("forwards a valid draft ID and resumes finalization on replay", async () => {
    mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
    mockGetTenantById.mockResolvedValue({
      id: "tenant-123",
      clerk_org_id: "org-789",
      clerk_user_id: null,
    })
    mockCreateHackathonAggregate.mockResolvedValue({
      status: "replayed",
      hackathon: {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Org Hack",
        slug: "org-hack",
      },
    })

    const res = await app.handle(
      new Request("http://localhost/api/dashboard/hackathons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftId: "11111111-1111-4111-8111-111111111111",
          name: "Org Hack",
        }),
      })
    )
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data).toEqual({
      id: "11111111-1111-4111-8111-111111111111",
      name: "Org Hack",
      slug: "org-hack",
      replayed: true,
    })
    expect(mockCreateHackathonAggregate).toHaveBeenCalledWith(
      "tenant-123",
      expect.objectContaining({ draftId: "11111111-1111-4111-8111-111111111111" }),
    )
    expect(mockFinalizeHackathonCreation).toHaveBeenCalledTimes(1)
  })

  it("returns the created resource distinctly when durable finalization needs retry", async () => {
    mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
    mockGetTenantById.mockResolvedValue({
      id: "tenant-123",
      clerk_org_id: "org-789",
      clerk_user_id: null,
    })
    mockCreateHackathonAggregate.mockResolvedValue({
      status: "replayed",
      hackathon: {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Org Hack",
        slug: "org-hack",
      },
    })
    mockFinalizeHackathonCreation.mockResolvedValue({ status: "failed" })
    mockStartHackathonCreationFinalizationWorkflow
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("creation-finalization-run-2")

    const res = await app.handle(
      new Request("http://localhost/api/dashboard/hackathons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftId: "11111111-1111-4111-8111-111111111111",
          name: "Org Hack",
        }),
      })
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      id: "11111111-1111-4111-8111-111111111111",
      name: "Org Hack",
      slug: "org-hack",
      replayed: true,
      finalization: {
        status: "failed",
        retryable: true,
        retryScheduled: true,
        message: "The event was created. We're finishing setup now.",
      },
    })
    expect(mockStartHackathonCreationFinalizationWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-123",
        hackathon: expect.objectContaining({
          id: "11111111-1111-4111-8111-111111111111",
        }),
      }),
    )
    expect(mockStartHackathonCreationFinalizationWorkflow).toHaveBeenCalledTimes(2)
  })

  it("keeps the draft retryable when finalization cannot be scheduled", async () => {
    mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
    mockGetTenantById.mockResolvedValue({
      id: "tenant-123",
      clerk_org_id: "org-789",
      clerk_user_id: null,
    })
    mockCreateHackathonAggregate.mockResolvedValue({
      status: "created",
      hackathon: {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Org Hack",
        slug: "org-hack",
      },
    })
    mockFinalizeHackathonCreation.mockResolvedValue({ status: "failed" })
    mockStartHackathonCreationFinalizationWorkflow.mockResolvedValue(null)

    const res = await app.handle(
      new Request("http://localhost/api/dashboard/hackathons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftId: "11111111-1111-4111-8111-111111111111",
          name: "Org Hack",
        }),
      })
    )

    expect(res.status).toBe(503)
    expect(res.headers.get("Retry-After")).toBe("2")
    expect(await res.json()).toEqual({
      error: "Your event was created, but setup could not be scheduled. Keep this page open and try again.",
      code: "finalization_unscheduled",
      retryable: true,
      committed: true,
      existingEvent: {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Org Hack",
        slug: "org-hack",
      },
    })
    expect(mockStartHackathonCreationFinalizationWorkflow).toHaveBeenCalledTimes(2)
  })

  it("returns the existing event without clearing newer edits on a finalization conflict", async () => {
    mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
    mockGetTenantById.mockResolvedValue({
      id: "tenant-123",
      clerk_org_id: "org-789",
      clerk_user_id: null,
    })
    mockCreateHackathonAggregate.mockResolvedValue({
      status: "replayed",
      hackathon: {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Org Hack",
        slug: "org-hack",
      },
    })
    mockFinalizeHackathonCreation.mockResolvedValue({
      status: "invalid",
      error: {
        code: "draft_conflict",
        message: "This saved draft already created an event with different import details. Open that event to continue.",
      },
    })

    const res = await app.handle(
      new Request("http://localhost/api/dashboard/hackathons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftId: "11111111-1111-4111-8111-111111111111",
          name: "Org Hack",
        }),
      })
    )

    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({
      error: "This saved draft already created an event with different import details. Open that event to continue.",
      code: "draft_conflict",
      retryable: false,
      existingEvent: {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Org Hack",
        slug: "org-hack",
      },
    })
  })

  it("returns a retryable conflict while the same draft is still being created", async () => {
    mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
    mockGetTenantById.mockResolvedValue({
      id: "tenant-123",
      clerk_org_id: "org-789",
      clerk_user_id: null,
    })
    mockCreateHackathonAggregate.mockResolvedValue({ status: "in_progress", hackathon: null })

    const res = await app.handle(
      new Request("http://localhost/api/dashboard/hackathons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftId: "11111111-1111-4111-8111-111111111111",
          name: "Org Hack",
        }),
      })
    )

    expect(res.status).toBe(409)
    expect(res.headers.get("Retry-After")).toBe("2")
    expect(await res.json()).toEqual({
      error: "Event creation is already in progress. Try again shortly.",
      code: "creation_in_progress",
      retryable: true,
    })
    expect(mockLogAudit).not.toHaveBeenCalled()
    expect(mockTriggerWebhooks).not.toHaveBeenCalled()
  })

  it("returns a retryable server error when aggregate creation fails", async () => {
    mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
    mockGetTenantById.mockResolvedValue({
      id: "tenant-123",
      clerk_org_id: "org-789",
      clerk_user_id: null,
    })
    mockCreateHackathonAggregate.mockResolvedValue({ status: "failed", hackathon: null })

    const res = await app.handle(
      new Request("http://localhost/api/dashboard/hackathons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftId: "11111111-1111-4111-8111-111111111111",
          name: "Org Hack",
        }),
      })
    )

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({
      error: "Failed to create hackathon",
      code: "creation_failed",
      retryable: true,
    })
    expect(mockLogAudit).not.toHaveBeenCalled()
    expect(mockTriggerWebhooks).not.toHaveBeenCalled()
  })

  it("returns a non-retryable correction when reviewed content is incomplete", async () => {
    mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
    mockGetTenantById.mockResolvedValue({
      id: "tenant-123",
      clerk_org_id: "org-789",
      clerk_user_id: null,
    })
    mockCreateHackathonAggregate.mockResolvedValue({
      status: "invalid",
      hackathon: null,
      error: {
        code: "incomplete_agenda",
        message: "Add a start time to every agenda item.",
      },
    })

    const res = await app.handle(
      new Request("http://localhost/api/dashboard/hackathons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Org Hack",
          agendaItems: [{
            title: "Kickoff",
            description: null,
            startsAt: null,
            endsAt: null,
            location: null,
            speakers: [],
          }],
        }),
      })
    )

    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({
      error: "Add a start time to every agenda item.",
      code: "incomplete_agenda",
      retryable: false,
    })
    expect(mockLogAudit).not.toHaveBeenCalled()
    expect(mockTriggerWebhooks).not.toHaveBeenCalled()
  })

  it("returns a non-retryable conflict when a draft ID is reused with new details", async () => {
    mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
    mockGetTenantById.mockResolvedValue({
      id: "tenant-123",
      clerk_org_id: "org-789",
      clerk_user_id: null,
    })
    mockCreateHackathonAggregate.mockResolvedValue({
      status: "invalid",
      hackathon: { id: "h-new", name: "New Hack", slug: "new-hack" },
      error: {
        code: "draft_conflict",
        message: "This saved draft already created an event. Open that event to continue.",
      },
    })

    const res = await app.handle(
      new Request("http://localhost/api/dashboard/hackathons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftId: "11111111-1111-4111-8111-111111111111",
          name: "Changed event",
        }),
      })
    )

    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({
      error: "This saved draft already created an event. Open that event to continue.",
      code: "draft_conflict",
      retryable: false,
      existingEvent: { id: "h-new", name: "New Hack", slug: "new-hack" },
    })
    expect(mockLogAudit).not.toHaveBeenCalled()
    expect(mockTriggerWebhooks).not.toHaveBeenCalled()
  })

  it("rejects a malformed draft ID before aggregate creation", async () => {
    mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
    mockGetTenantById.mockResolvedValue({
      id: "tenant-123",
      clerk_org_id: "org-789",
      clerk_user_id: null,
    })

    const res = await app.handle(
      new Request("http://localhost/api/dashboard/hackathons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId: "not-a-uuid", name: "Org Hack" }),
      })
    )

    expect(res.status).toBe(422)
    expect(mockCreateHackathonAggregate).not.toHaveBeenCalled()
    expect(mockLogAudit).not.toHaveBeenCalled()
    expect(mockTriggerWebhooks).not.toHaveBeenCalled()
  })

  it("rejects a whitespace-only event name before creating anything", async () => {
    mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
    mockGetTenantById.mockResolvedValue({
      id: "tenant-123",
      clerk_org_id: "org-789",
      clerk_user_id: null,
    })

    const res = await app.handle(
      new Request("http://localhost/api/dashboard/hackathons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "   " }),
      })
    )

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "Give your event a name." })
    expect(mockCreateHackathonAggregate).not.toHaveBeenCalled()
  })
})
