import { describe, it, expect, mock, beforeEach } from "bun:test"

type MockHackathon = {
  id: string
  name: string
  slug: string
  default_locale?: string | null
}

type MockAggregateResult =
  | { status: "created"; hackathon: MockHackathon }
  | { status: "replayed"; hackathon: MockHackathon }
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
      hackathon: MockHackathon
      error: {
        code: "draft_conflict"
        message: string
      }
    }
  | { status: "in_progress" | "failed"; hackathon: null }

const mockCreateHackathonFromImport = mock(
  (): Promise<MockAggregateResult> => Promise.resolve({ status: "failed", hackathon: null }),
)
const mockImportTranslationVariants = mock(() => Promise.resolve())
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
mock.module("@/lib/services/luma-import-create", () => ({
  createHackathonAggregateWithResult: mockCreateHackathonFromImport,
  importTranslationVariants: mockImportTranslationVariants,
  finalizeHackathonCreation: mockFinalizeHackathonCreation,
}))
mock.module("@/lib/workflows/creation-finalization", () => ({
  startHackathonCreationFinalizationWorkflow:
    mockStartHackathonCreationFinalizationWorkflow,
}))

function created(hackathon: MockHackathon): MockAggregateResult {
  return { status: "created", hackathon }
}

const draftId = "11111111-1111-4111-8111-111111111111"

const mockExtractEventPageData = mock(() => Promise.resolve(null))
mock.module("@/lib/services/event-page-import", () => ({
  extractEventPageData: mockExtractEventPageData,
}))

const mockExtractLumaEventData = mock(() => Promise.resolve(null))
mock.module("@/lib/services/luma-import", () => ({
  extractLumaEventData: mockExtractLumaEventData,
}))

const mockExtractLumaRichContent = mock(() => Promise.resolve(null))
const mockExtractEventPageRichContent = mock(() => Promise.resolve(null))
mock.module("@/lib/services/luma-extract", () => ({
  extractLumaRichContent: mockExtractLumaRichContent,
  extractEventPageRichContent: mockExtractEventPageRichContent,
}))

const mockLogAudit = mock(() => Promise.resolve())
mock.module("@/lib/services/audit", () => ({
  logAudit: mockLogAudit,
  listAllAuditLogs: mock(() => Promise.resolve({ logs: [], total: 0 })),
}))

const mockTriggerWebhooks = mock(() => Promise.resolve())
mock.module("@/lib/services/webhooks", () => ({
  triggerWebhooks: mockTriggerWebhooks,
}))

const mockAuth = mock(() => Promise.resolve({ userId: null, orgId: null, orgRole: null }))
mock.module("@clerk/nextjs/server", () => ({
  auth: mockAuth,
  clerkClient: mock(() => Promise.resolve({
    organizations: {
      getOrganization: mock(() => Promise.resolve({ name: "Test Org" })),
    },
  })),
}))

const mockVerifyApiKey = mock(() => Promise.resolve(null))
mock.module("@/lib/services/api-keys", () => ({
  verifyApiKey: mockVerifyApiKey,
  createApiKey: mock(() => Promise.resolve(null)),
  listApiKeys: mock(() => Promise.resolve([])),
  revokeApiKey: mock(() => Promise.resolve(false)),
  getApiKeyById: mock(() => Promise.resolve(null)),
}))

const mockCheckRateLimit = mock(() =>
  Promise.resolve({ allowed: true, remaining: 9, resetAt: Date.now() + 60_000 })
)
class MockRateLimitError extends Error {
  constructor(
    public resetAt: number,
    public remaining: number
  ) {
    super("Rate limit exceeded")
  }
}
mock.module("@/lib/services/rate-limit", () => ({
  checkRateLimit: mockCheckRateLimit,
  RateLimitError: MockRateLimitError,
  getRateLimitHeaders: () => ({}),
  defaultRateLimits: { "api_key:default": { maxRequests: 100, windowMs: 60_000 } },
}))

const mockGetOrCreateTenant = mock(() => Promise.resolve(null))
const mockGetOrCreatePersonalTenant = mock(() => Promise.resolve(null))
mock.module("@/lib/services/tenants", () => ({
  getOrCreateTenant: mockGetOrCreateTenant,
  getOrCreatePersonalTenant: mockGetOrCreatePersonalTenant,
  getTenantById: () =>
    Promise.resolve({ id: "tenant-1", clerk_org_id: "org-1", clerk_user_id: null }),
  isOrgTenant: () => Promise.resolve(true),
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

const { api } = await import("@/lib/api")

describe("POST /api/dashboard/import/event (create from editor data)", () => {
  beforeEach(() => {
    mockCreateHackathonFromImport.mockClear()
    mockImportTranslationVariants.mockClear()
    mockFinalizeHackathonCreation.mockClear()
    mockStartHackathonCreationFinalizationWorkflow.mockClear()
    mockExtractLumaEventData.mockClear()
    mockExtractLumaRichContent.mockClear()
    mockExtractEventPageData.mockClear()
    mockExtractEventPageRichContent.mockClear()
    mockLogAudit.mockClear()
    mockTriggerWebhooks.mockClear()
    mockAuth.mockClear()
    mockVerifyApiKey.mockClear()
    mockCheckRateLimit.mockClear()
    mockCheckRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 9,
      resetAt: Date.now() + 60_000,
    })
    mockGetOrCreateTenant.mockClear()
    mockGetOrCreatePersonalTenant.mockClear()
    mockStartHackathonCreationFinalizationWorkflow.mockResolvedValue(
      "creation-finalization-run-1",
    )
  })

  it("creates hackathon from import when authenticated", async () => {
    mockAuth.mockResolvedValueOnce({
      userId: "user-1",
      orgId: "org-1",
      orgRole: "org:admin",
    })

    mockGetOrCreateTenant.mockResolvedValueOnce({ id: "tenant-1" })

    mockCreateHackathonFromImport.mockResolvedValueOnce(created({
      id: "h1",
      name: "Imported Hackathon",
      slug: "imported-hackathon",
    }))

    const res = await api.handle(
      new Request("http://localhost/api/dashboard/import/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftId,
          expectedOrganizationId: "org-1",
          name: "Imported Hackathon",
          description: "From Luma",
          startsAt: "2026-03-15T09:00:00.000-08:00",
          endsAt: "2026-03-16T17:00:00.000-08:00",
          locationType: "in_person",
          locationName: "San Francisco",
          locationUrl: null,
          imageUrl: "https://images.lumacdn.com/test.png",
          sourceUrl: "https://luma.com/test-event?access=raw#private",
        }),
      })
    )

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.id).toBe("h1")
    expect(data.slug).toBe("imported-hackathon")
    expect(data.replayed).toBe(false)
    expect(mockCreateHackathonFromImport).toHaveBeenCalledWith(
      "tenant-1",
      expect.objectContaining({ draftId }),
    )
    expect(mockFinalizeHackathonCreation).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        principal: expect.objectContaining({ kind: "user", userId: "user-1" }),
        hackathon: expect.objectContaining({ id: "h1" }),
        auditMetadata: {
          source: "luma_import",
          sourceUrl: "https://luma.com/test-event",
        },
        webhookData: {
          hackathonId: "h1",
          source: "luma_import",
          sourceUrl: "https://luma.com/test-event",
        },
      }),
    )
  })

  it("rejects an imported create when another tab changed the organization", async () => {
    mockAuth.mockResolvedValueOnce({
      userId: "user-1",
      orgId: "org-1",
      orgRole: "org:admin",
    })
    mockGetOrCreateTenant.mockResolvedValueOnce({ id: "tenant-1" })

    const res = await api.handle(
      new Request("http://localhost/api/dashboard/import/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftId,
          expectedOrganizationId: "org-other",
          name: "Imported Hackathon",
        }),
      }),
    )

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({
      error: "Your active organization changed. Review it and try again.",
      code: "organization_context_changed",
      retryable: true,
    })
    expect(mockCreateHackathonFromImport).not.toHaveBeenCalled()
  })

  it("returns a replay after resuming imported-event finalization", async () => {
    mockAuth.mockResolvedValueOnce({
      userId: "user-1",
      orgId: "org-1",
      orgRole: "org:admin",
    })
    mockGetOrCreateTenant.mockResolvedValueOnce({ id: "tenant-1" })
    mockCreateHackathonFromImport.mockResolvedValueOnce({
      status: "replayed",
      hackathon: {
        id: draftId,
        name: "Imported Hackathon",
        slug: "imported-hackathon",
        default_locale: "fr",
      },
    })

    const res = await api.handle(
      new Request("http://localhost/api/dashboard/import/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftId,
          name: "Imported Hackathon",
          description: "From Luma",
          sourceUrl: "https://luma.com/test-event",
          defaultLocale: "fr",
          translationLinks: [
            { url: "https://luma.com/test-event-en", languageCode: "EN-us" },
            { url: "https://luma.com/test-event-en", languageCode: "es" },
            { url: "https://example.com/not-luma", languageCode: "fr" },
            {
              url: "https://luma.com/no-language",
              languageCode: "definitely-invalid",
            },
          ],
        }),
      }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      id: draftId,
      name: "Imported Hackathon",
      slug: "imported-hackathon",
      replayed: true,
    })
    expect(mockCreateHackathonFromImport).toHaveBeenCalledWith(
      "tenant-1",
      expect.objectContaining({ draftId }),
    )
    expect(mockFinalizeHackathonCreation).toHaveBeenCalledTimes(1)
    expect(mockFinalizeHackathonCreation).toHaveBeenCalledWith(
      expect.objectContaining({
        translations: expect.objectContaining({
          translationLinks: [
            { url: "https://luma.com/test-event-en", languageCode: "en" },
          ],
        }),
      }),
    )
  })

  it("returns the imported event when its durable setup still needs retry", async () => {
    mockAuth.mockResolvedValueOnce({
      userId: "user-1",
      orgId: "org-1",
      orgRole: "org:admin",
    })
    mockGetOrCreateTenant.mockResolvedValueOnce({ id: "tenant-1" })
    mockCreateHackathonFromImport.mockResolvedValueOnce({
      status: "replayed",
      hackathon: {
        id: draftId,
        name: "Imported Hackathon",
        slug: "imported-hackathon",
      },
    })
    mockFinalizeHackathonCreation.mockResolvedValueOnce({ status: "failed" })

    const res = await api.handle(
      new Request("http://localhost/api/dashboard/import/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftId,
          name: "Imported Hackathon",
        }),
      }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      id: draftId,
      name: "Imported Hackathon",
      slug: "imported-hackathon",
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
        tenantId: "tenant-1",
        hackathon: expect.objectContaining({ id: draftId }),
      }),
    )
  })

  it("keeps an imported draft retryable when finalization cannot be scheduled", async () => {
    mockAuth.mockResolvedValueOnce({
      userId: "user-1",
      orgId: "org-1",
      orgRole: "org:admin",
    })
    mockGetOrCreateTenant.mockResolvedValueOnce({ id: "tenant-1" })
    mockCreateHackathonFromImport.mockResolvedValueOnce({
      status: "created",
      hackathon: {
        id: draftId,
        name: "Imported Hackathon",
        slug: "imported-hackathon",
      },
    })
    mockFinalizeHackathonCreation.mockResolvedValueOnce({ status: "failed" })
    mockStartHackathonCreationFinalizationWorkflow.mockResolvedValue(null)

    const res = await api.handle(
      new Request("http://localhost/api/dashboard/import/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftId,
          name: "Imported Hackathon",
        }),
      }),
    )

    expect(res.status).toBe(503)
    expect(res.headers.get("Retry-After")).toBe("2")
    expect(await res.json()).toEqual({
      error: "Your event was created, but setup could not be scheduled. Keep this page open and try again.",
      code: "finalization_unscheduled",
      retryable: true,
      committed: true,
      existingEvent: {
        id: draftId,
        name: "Imported Hackathon",
        slug: "imported-hackathon",
      },
    })
    expect(mockStartHackathonCreationFinalizationWorkflow).toHaveBeenCalledTimes(2)
  })

  it("keeps newer imported edits when finalization details conflict", async () => {
    mockAuth.mockResolvedValueOnce({
      userId: "user-1",
      orgId: "org-1",
      orgRole: "org:admin",
    })
    mockGetOrCreateTenant.mockResolvedValueOnce({ id: "tenant-1" })
    mockCreateHackathonFromImport.mockResolvedValueOnce({
      status: "replayed",
      hackathon: {
        id: draftId,
        name: "Imported Hackathon",
        slug: "imported-hackathon",
      },
    })
    mockFinalizeHackathonCreation.mockResolvedValueOnce({
      status: "invalid",
      error: {
        code: "draft_conflict",
        message: "This saved draft already created an event with different import details. Open that event to continue.",
      },
    })

    const res = await api.handle(
      new Request("http://localhost/api/dashboard/import/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftId,
          name: "Imported Hackathon",
          sourceUrl: "https://luma.com/new-source",
        }),
      }),
    )

    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({
      error: "This saved draft already created an event with different import details. Open that event to continue.",
      code: "draft_conflict",
      retryable: false,
      existingEvent: {
        id: draftId,
        name: "Imported Hackathon",
        slug: "imported-hackathon",
      },
    })
  })

  it("returns a non-retryable conflict when imported content changes for a draft ID", async () => {
    mockAuth.mockResolvedValueOnce({
      userId: "user-1",
      orgId: "org-1",
      orgRole: "org:admin",
    })
    mockGetOrCreateTenant.mockResolvedValueOnce({ id: "tenant-1" })
    mockCreateHackathonFromImport.mockResolvedValueOnce({
      status: "invalid",
      hackathon: { id: "h-imported", name: "Imported Event", slug: "imported-event" },
      error: {
        code: "draft_conflict",
        message: "This saved draft already created an event. Open that event to continue.",
      },
    })

    const res = await api.handle(
      new Request("http://localhost/api/dashboard/import/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId, name: "Changed imported event" }),
      }),
    )

    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({
      error: "This saved draft already created an event. Open that event to continue.",
      code: "draft_conflict",
      retryable: false,
      existingEvent: {
        id: "h-imported",
        name: "Imported Event",
        slug: "imported-event",
      },
    })
    expect(mockImportTranslationVariants).not.toHaveBeenCalled()
    expect(mockLogAudit).not.toHaveBeenCalled()
    expect(mockTriggerWebhooks).not.toHaveBeenCalled()
  })

  it("returns a retryable conflict while the same draft is being created", async () => {
    mockAuth.mockResolvedValueOnce({
      userId: "user-1",
      orgId: "org-1",
      orgRole: "org:admin",
    })
    mockGetOrCreateTenant.mockResolvedValueOnce({ id: "tenant-1" })
    mockCreateHackathonFromImport.mockResolvedValueOnce({
      status: "in_progress",
      hackathon: null,
    })

    const res = await api.handle(
      new Request("http://localhost/api/dashboard/import/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId, name: "Imported Hackathon" }),
      }),
    )

    expect(res.status).toBe(409)
    expect(res.headers.get("Retry-After")).toBe("2")
    expect(await res.json()).toEqual({
      error: "Event creation is already in progress. Try again shortly.",
      code: "creation_in_progress",
      retryable: true,
    })
    expect(mockImportTranslationVariants).not.toHaveBeenCalled()
    expect(mockLogAudit).not.toHaveBeenCalled()
    expect(mockTriggerWebhooks).not.toHaveBeenCalled()
  })

  it("returns a retryable failure when aggregate creation cannot finish", async () => {
    mockAuth.mockResolvedValueOnce({
      userId: "user-1",
      orgId: "org-1",
      orgRole: "org:admin",
    })
    mockGetOrCreateTenant.mockResolvedValueOnce({ id: "tenant-1" })
    mockCreateHackathonFromImport.mockResolvedValueOnce({
      status: "failed",
      hackathon: null,
    })

    const res = await api.handle(
      new Request("http://localhost/api/dashboard/import/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId, name: "Imported Hackathon" }),
      }),
    )

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({
      error: "Failed to create hackathon",
      code: "creation_failed",
      retryable: true,
    })
    expect(mockImportTranslationVariants).not.toHaveBeenCalled()
    expect(mockLogAudit).not.toHaveBeenCalled()
    expect(mockTriggerWebhooks).not.toHaveBeenCalled()
  })

  it("rejects a malformed draft ID before aggregate creation", async () => {
    mockAuth.mockResolvedValueOnce({
      userId: "user-1",
      orgId: "org-1",
      orgRole: "org:admin",
    })

    const res = await api.handle(
      new Request("http://localhost/api/dashboard/import/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId: "not-a-uuid", name: "Imported Hackathon" }),
      }),
    )

    expect(res.status).toBe(422)
    expect(mockCreateHackathonFromImport).not.toHaveBeenCalled()
    expect(mockImportTranslationVariants).not.toHaveBeenCalled()
    expect(mockLogAudit).not.toHaveBeenCalled()
    expect(mockTriggerWebhooks).not.toHaveBeenCalled()
  })

  it("creates hackathon from generic event-page data when authenticated", async () => {
    mockAuth.mockResolvedValueOnce({
      userId: "user-1",
      orgId: "org-1",
      orgRole: "org:admin",
    })

    mockGetOrCreateTenant.mockResolvedValueOnce({ id: "tenant-1" })

    mockCreateHackathonFromImport.mockResolvedValueOnce(created({
      id: "h-generic",
      name: "Imported Event Page",
      slug: "imported-event-page",
    }))

    const res = await api.handle(
      new Request("http://localhost/api/dashboard/import/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Imported Event Page",
          description: "From Eventbrite",
          startsAt: "2026-06-08T09:00:00-04:00",
          endsAt: "2026-06-08T20:00:00-04:00",
          locationType: "in_person",
          locationName: "Ottawa",
          locationUrl: null,
          imageUrl: "https://example.com/banner.png",
          sponsors: [{ name: "OpenAI", tier: "gold" }],
          rules: "Bring your laptop.",
          prizes: [{ name: "Grand Prize", description: null, value: "$5,000" }],
          sourceUrl: "https://eventbrite.com/e/my-event",
        }),
      })
    )

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.id).toBe("h-generic")
    expect(data.slug).toBe("imported-event-page")
    expect(mockCreateHackathonFromImport).toHaveBeenCalledWith(
      "tenant-1",
      expect.objectContaining({
        sponsors: [{ name: "OpenAI", tier: "gold" }],
        prizes: [{ name: "Grand Prize", description: null, value: "$5,000" }],
      })
    )
  })

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce({ userId: null, orgId: null, orgRole: null })

    const res = await api.handle(
      new Request("http://localhost/api/dashboard/import/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test" }),
      })
    )

    expect(res.status).toBe(401)
  })

  it("rejects a whitespace-only imported event name", async () => {
    mockAuth.mockResolvedValueOnce({
      userId: "user-1",
      orgId: "org-1",
      orgRole: "org:admin",
    })
    mockGetOrCreateTenant.mockResolvedValueOnce({ id: "tenant-1" })

    const res = await api.handle(
      new Request("http://localhost/api/dashboard/import/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "   " }),
      })
    )

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "Give your event a name." })
    expect(mockCreateHackathonFromImport).not.toHaveBeenCalled()
  })

  it("forwards agendaItems in the one aggregate create call", async () => {
    mockAuth.mockResolvedValueOnce({
      userId: "user-1",
      orgId: "org-1",
      orgRole: "org:admin",
    })

    mockGetOrCreateTenant.mockResolvedValueOnce({ id: "tenant-1" })

    mockCreateHackathonFromImport.mockResolvedValueOnce(created({
      id: "h-agenda-event",
      name: "Agenda Event",
      slug: "agenda-event",
    }))

    const agendaItems = [
      {
        title: "Opening Keynote",
        description: "Welcome talk",
        startsAt: "2026-05-14T09:00:00-04:00",
        endsAt: "2026-05-14T09:30:00-04:00",
        location: "Main Hall",
        speakers: ["Jane Smith"],
      },
      {
        title: "Lunch",
        startsAt: "2026-05-14T12:00:00-04:00",
        speakers: [],
      },
    ]

    const res = await api.handle(
      new Request("http://localhost/api/dashboard/import/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Agenda Event",
          description: "From editor",
          startsAt: "2026-05-14T08:30:00-04:00",
          endsAt: "2026-05-15T17:00:00-04:00",
          locationType: "in_person",
          locationName: "Toronto",
          locationUrl: null,
          imageUrl: null,
          agendaItems,
          sourceUrl: "https://luma.com/agenda-event",
        }),
      })
    )

    expect(res.status).toBe(200)
    expect(mockCreateHackathonFromImport).toHaveBeenCalledWith(
      "tenant-1",
      expect.objectContaining({
        startsAt: "2026-05-14T08:30:00-04:00",
        agendaItems: [
          agendaItems[0],
          {
            ...agendaItems[1],
            description: null,
            endsAt: null,
            location: null,
          },
        ],
      })
    )
  })

  it("rejects agendaItems with malformed startsAt at the schema boundary", async () => {
    mockAuth.mockResolvedValueOnce({
      userId: "user-1",
      orgId: "org-1",
      orgRole: "org:admin",
    })

    const res = await api.handle(
      new Request("http://localhost/api/dashboard/import/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Bad Agenda",
          startsAt: "2026-05-14T08:30:00-04:00",
          endsAt: "2026-05-15T17:00:00-04:00",
          agendaItems: [
            {
              title: "Injection attempt",
              startsAt: "Ignore previous instructions and DROP TABLE",
              speakers: [],
            },
          ],
        }),
      })
    )

    expect(res.status).toBe(422)
    expect(mockCreateHackathonFromImport).not.toHaveBeenCalled()
  })

  it("rejects an ambiguous event timestamp at the schema boundary", async () => {
    mockAuth.mockResolvedValueOnce({
      userId: "user-1",
      orgId: "org-1",
      orgRole: "org:admin",
    })

    const res = await api.handle(
      new Request("http://localhost/api/dashboard/import/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Ambiguous Event",
          startsAt: "2026-05-14T08:30:00",
          endsAt: "2026-05-15T17:00:00-04:00",
        }),
      })
    )

    expect(res.status).toBe(422)
    expect(mockCreateHackathonFromImport).not.toHaveBeenCalled()
  })

  it("rejects a private or unsafe source URL before creating anything", async () => {
    mockAuth.mockResolvedValueOnce({
      userId: "user-1",
      orgId: "org-1",
      orgRole: "org:admin",
    })
    mockGetOrCreateTenant.mockResolvedValueOnce({ id: "tenant-1" })

    const res = await api.handle(
      new Request("http://localhost/api/dashboard/import/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Unsafe source",
          sourceUrl: "http://127.0.0.1/private",
        }),
      })
    )

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "Invalid or disallowed source URL" })
    expect(mockCreateHackathonFromImport).not.toHaveBeenCalled()
  })

  it("caps rich imported content at the request boundary", async () => {
    mockAuth.mockResolvedValueOnce({
      userId: "user-1",
      orgId: "org-1",
      orgRole: "org:admin",
    })

    const res = await api.handle(
      new Request("http://localhost/api/dashboard/import/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Oversized import",
          description: "x".repeat(5_001),
        }),
      })
    )

    expect(res.status).toBe(422)
    expect(mockCreateHackathonFromImport).not.toHaveBeenCalled()
  })

  it("passes an empty agenda to the aggregate create call", async () => {
    mockAuth.mockResolvedValueOnce({
      userId: "user-1",
      orgId: "org-1",
      orgRole: "org:admin",
    })

    mockGetOrCreateTenant.mockResolvedValueOnce({ id: "tenant-1" })

    mockCreateHackathonFromImport.mockResolvedValueOnce(created({
      id: "h-no-agenda",
      name: "No Agenda",
      slug: "no-agenda",
    }))

    const res = await api.handle(
      new Request("http://localhost/api/dashboard/import/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "No Agenda",
          startsAt: "2026-05-14T08:30:00-04:00",
          endsAt: "2026-05-15T17:00:00-04:00",
          agendaItems: [],
        }),
      })
    )

    expect(res.status).toBe(200)
    expect(mockCreateHackathonFromImport).toHaveBeenCalledWith(
      "tenant-1",
      expect.objectContaining({ agendaItems: [] })
    )
  })
})

describe("POST /api/dashboard/import/url (create from URL)", () => {
  beforeEach(() => {
    mockCreateHackathonFromImport.mockClear()
    mockImportTranslationVariants.mockClear()
    mockFinalizeHackathonCreation.mockClear()
    mockStartHackathonCreationFinalizationWorkflow.mockClear()
    mockExtractLumaEventData.mockClear()
    mockExtractLumaRichContent.mockClear()
    mockExtractEventPageData.mockClear()
    mockExtractEventPageRichContent.mockClear()
    mockLogAudit.mockClear()
    mockTriggerWebhooks.mockClear()
    mockAuth.mockClear()
    mockVerifyApiKey.mockClear()
    mockGetOrCreateTenant.mockClear()
    mockGetOrCreatePersonalTenant.mockClear()
    mockCheckRateLimit.mockClear()
    mockCheckRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 9,
      resetAt: Date.now() + 60_000,
    })
    mockStartHackathonCreationFinalizationWorkflow.mockResolvedValue(
      "creation-finalization-run-1",
    )
  })

  it("rate limits paid extraction per authenticated caller", async () => {
    mockVerifyApiKey.mockResolvedValueOnce({
      id: "key-1",
      tenant_id: "tenant-1",
      scopes: ["hackathons:write"],
    })
    mockCheckRateLimit.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 60_000,
    })

    const res = await api.handle(
      new Request("http://localhost/api/dashboard/import/url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer sk_live_test",
        },
        body: JSON.stringify({ url: "https://lu.ma/test-hackathon" }),
      })
    )

    expect(res.status).toBe(429)
    expect(mockExtractLumaEventData).not.toHaveBeenCalled()
    expect(mockExtractEventPageData).not.toHaveBeenCalled()
  })

  it("creates hackathon from a Luma URL with API key auth", async () => {
    mockVerifyApiKey.mockResolvedValueOnce({
      id: "key-1",
      tenant_id: "tenant-1",
      scopes: ["hackathons:write"],
    })

    mockExtractLumaEventData.mockResolvedValueOnce({
      name: "Extracted Luma Event",
      description: "From page",
      startsAt: "2026-03-15T09:00:00-07:00",
      endsAt: "2026-03-16T17:00:00-07:00",
      locationType: "in_person",
      locationName: "San Francisco",
      locationUrl: null,
      imageUrl: "https://images.lumacdn.com/test.png",
      language: null,
      translationLinks: [],    })

    mockExtractLumaRichContent.mockResolvedValueOnce({
      sponsors: [{ name: "OpenAI", tier: "gold" }],
      rules: "Bring your laptop.",
      prizes: [{ name: "Grand Prize", description: null, value: "$5,000" }],
      challenges: [],
      translationLinks: [],
      cleanedDescription: null,
    })

    mockCreateHackathonFromImport.mockResolvedValueOnce(created({
      id: "h2",
      name: "CLI Imported Hackathon",
      slug: "cli-imported-hackathon",
    }))

    const res = await api.handle(
      new Request("http://localhost/api/dashboard/import/url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer sk_live_test",
        },
        body: JSON.stringify({
          draftId,
          url: "https://lu.ma/test-hackathon?access=raw#private",
          name: "CLI Imported Hackathon",
        }),
      })
    )

    expect(res.status).toBe(200)
    expect(mockCreateHackathonFromImport).toHaveBeenCalledWith(
      "tenant-1",
      expect.objectContaining({
        draftId,
        name: "CLI Imported Hackathon",
        description: "From page",
        startsAt: "2026-03-15T09:00:00-07:00",
        endsAt: "2026-03-16T17:00:00-07:00",
        registrationOpensAt: null,
        registrationClosesAt: null,
        locationType: "in_person",
        locationName: "San Francisco",
        locationUrl: null,
        imageUrl: "https://images.lumacdn.com/test.png",
        rules: "Bring your laptop.",
        defaultLocale: null,
        sponsors: [{ name: "OpenAI", tier: "gold" }],
        prizes: [{ name: "Grand Prize", description: null, value: "$5,000" }],
        agendaItems: [],
      })
    )
    expect((await res.json()).replayed).toBe(false)
    expect(mockFinalizeHackathonCreation).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        principal: expect.objectContaining({ kind: "api_key", keyId: "key-1" }),
        hackathon: expect.objectContaining({ id: "h2" }),
        auditMetadata: {
          source: "luma_import",
          sourceUrl: "https://lu.ma/test-hackathon",
        },
        webhookData: {
          hackathonId: "h2",
          source: "luma_import",
          sourceUrl: "https://lu.ma/test-hackathon",
        },
      }),
    )
  })

  it("returns a URL-import replay after resuming its finalization", async () => {
    mockVerifyApiKey.mockResolvedValueOnce({
      id: "key-1",
      tenant_id: "tenant-1",
      scopes: ["hackathons:write"],
    })
    mockExtractLumaEventData.mockResolvedValueOnce({
      name: "Extracted Luma Event",
      description: "From page",
      startsAt: "2026-03-15T09:00:00-07:00",
      endsAt: "2026-03-16T17:00:00-07:00",
      locationType: "in_person",
      locationName: "San Francisco",
      locationUrl: null,
      imageUrl: null,
      language: "fr",
      translationLinks: [{ url: "https://luma.com/test-event-en", languageCode: "en" }],
    })
    mockExtractLumaRichContent.mockResolvedValueOnce(null)
    mockCreateHackathonFromImport.mockResolvedValueOnce({
      status: "replayed",
      hackathon: {
        id: draftId,
        name: "Extracted Luma Event",
        slug: "extracted-luma-event",
        default_locale: "fr",
      },
    })

    const res = await api.handle(
      new Request("http://localhost/api/dashboard/import/url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer sk_live_test",
        },
        body: JSON.stringify({ draftId, url: "https://luma.com/test-event" }),
      }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      id: draftId,
      name: "Extracted Luma Event",
      slug: "extracted-luma-event",
      replayed: true,
    })
    expect(mockCreateHackathonFromImport).toHaveBeenCalledWith(
      "tenant-1",
      expect.objectContaining({ draftId }),
    )
    expect(mockFinalizeHackathonCreation).toHaveBeenCalledWith(
      expect.objectContaining({
        hackathon: expect.objectContaining({ id: draftId }),
        translations: expect.objectContaining({
          translationLinks: [
            { url: "https://luma.com/test-event-en", languageCode: "en" },
          ],
        }),
      }),
    )
  })

  it("validates, deduplicates, and caps translation links before finalization", async () => {
    mockVerifyApiKey.mockResolvedValueOnce({
      id: "key-1",
      tenant_id: "tenant-1",
      scopes: ["hackathons:write"],
    })
    mockExtractLumaEventData.mockResolvedValueOnce({
      name: "Translated Event",
      description: "Primary page",
      startsAt: "2026-03-15T09:00:00-07:00",
      endsAt: "2026-03-16T17:00:00-07:00",
      locationType: "virtual",
      locationName: null,
      locationUrl: null,
      imageUrl: null,
      language: "en",
      translationLinks: [
        { url: "https://example.com/not-luma", languageCode: "fr" },
        {
          url: `https://luma.com/${"x".repeat(2050)}`,
          languageCode: "fr",
        },
        {
          url: "https://luma.com/no-language",
          languageCode: "definitely-invalid",
        },
        ...Array.from({ length: 5 }, (_, index) => ({
          url: `https://luma.com/event-${index}`,
          languageCode: "FR-ca",
        })),
      ],
    })
    mockExtractLumaRichContent.mockResolvedValueOnce({
      sponsors: [],
      rules: null,
      prizes: [],
      challenges: [],
      agendaItems: [],
      cleanedDescription: null,
      translationLinks: [
        { url: "https://luma.com/event-0", languageCode: "es" },
        ...Array.from({ length: 8 }, (_, index) => ({
          url: `https://lu.ma/event-${index + 5}`,
          languageCode: "EN-us",
        })),
      ],
    })
    mockCreateHackathonFromImport.mockResolvedValueOnce(created({
      id: "translated-event",
      name: "Translated Event",
      slug: "translated-event",
      default_locale: "en",
    }))

    const res = await api.handle(
      new Request("http://localhost/api/dashboard/import/url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer sk_live_test",
        },
        body: JSON.stringify({ url: "https://luma.com/translated-event" }),
      }),
    )

    expect(res.status).toBe(200)
    const expectedLinks = [
      ...Array.from({ length: 5 }, (_, index) => ({
        url: `https://luma.com/event-${index}`,
        languageCode: "fr",
      })),
      ...Array.from({ length: 5 }, (_, index) => ({
        url: `https://lu.ma/event-${index + 5}`,
        languageCode: "en",
      })),
    ]
    const workflowInput = mockStartHackathonCreationFinalizationWorkflow
      .mock.calls[0]?.[0] as {
        translations?: { translationLinks: { url: string; languageCode: string }[] }
      }
    expect(workflowInput.translations?.translationLinks).toEqual(expectedLinks)
    expect(mockFinalizeHackathonCreation).toHaveBeenCalledWith(
      expect.objectContaining({
        translations: expect.objectContaining({
          translationLinks: expectedLinks,
        }),
      }),
    )
  })

  it("keeps a URL-import draft retryable when finalization cannot be scheduled", async () => {
    mockVerifyApiKey.mockResolvedValueOnce({
      id: "key-1",
      tenant_id: "tenant-1",
      scopes: ["hackathons:write"],
    })
    mockExtractLumaEventData.mockResolvedValueOnce({
      name: "Extracted Luma Event",
      description: "From page",
      startsAt: "2026-03-15T09:00:00-07:00",
      endsAt: "2026-03-16T17:00:00-07:00",
      locationType: "in_person",
      locationName: "San Francisco",
      locationUrl: null,
      imageUrl: null,
      language: null,
      translationLinks: [],
    })
    mockExtractLumaRichContent.mockResolvedValueOnce(null)
    mockCreateHackathonFromImport.mockResolvedValueOnce({
      status: "created",
      hackathon: {
        id: draftId,
        name: "Extracted Luma Event",
        slug: "extracted-luma-event",
      },
    })
    mockFinalizeHackathonCreation.mockResolvedValueOnce({ status: "failed" })
    mockStartHackathonCreationFinalizationWorkflow.mockResolvedValue(null)

    const res = await api.handle(
      new Request("http://localhost/api/dashboard/import/url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer sk_live_test",
        },
        body: JSON.stringify({ draftId, url: "https://luma.com/test-event" }),
      }),
    )

    expect(res.status).toBe(503)
    expect(res.headers.get("Retry-After")).toBe("2")
    expect(await res.json()).toEqual({
      error: "Your event was created, but setup could not be scheduled. Keep this page open and try again.",
      code: "finalization_unscheduled",
      retryable: true,
      committed: true,
      existingEvent: {
        id: draftId,
        name: "Extracted Luma Event",
        slug: "extracted-luma-event",
      },
    })
    expect(mockStartHackathonCreationFinalizationWorkflow).toHaveBeenCalledTimes(2)
  })

  it("returns a retryable conflict while a URL import is in progress", async () => {
    mockVerifyApiKey.mockResolvedValueOnce({
      id: "key-1",
      tenant_id: "tenant-1",
      scopes: ["hackathons:write"],
    })
    mockExtractLumaEventData.mockResolvedValueOnce({
      name: "Extracted Luma Event",
      description: null,
      startsAt: "2026-03-15T09:00:00-07:00",
      endsAt: "2026-03-16T17:00:00-07:00",
      locationType: "virtual",
      locationName: null,
      locationUrl: null,
      imageUrl: null,
      language: null,
      translationLinks: [],
    })
    mockExtractLumaRichContent.mockResolvedValueOnce(null)
    mockCreateHackathonFromImport.mockResolvedValueOnce({
      status: "in_progress",
      hackathon: null,
    })

    const res = await api.handle(
      new Request("http://localhost/api/dashboard/import/url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer sk_live_test",
        },
        body: JSON.stringify({ draftId, url: "https://luma.com/test-event" }),
      }),
    )

    expect(res.status).toBe(409)
    expect(res.headers.get("Retry-After")).toBe("2")
    expect(await res.json()).toEqual({
      error: "Event creation is already in progress. Try again shortly.",
      code: "creation_in_progress",
      retryable: true,
    })
    expect(mockImportTranslationVariants).not.toHaveBeenCalled()
    expect(mockLogAudit).not.toHaveBeenCalled()
    expect(mockTriggerWebhooks).not.toHaveBeenCalled()
  })

  it("returns a retryable failure when URL aggregate creation cannot finish", async () => {
    mockVerifyApiKey.mockResolvedValueOnce({
      id: "key-1",
      tenant_id: "tenant-1",
      scopes: ["hackathons:write"],
    })
    mockExtractLumaEventData.mockResolvedValueOnce({
      name: "Extracted Luma Event",
      description: null,
      startsAt: "2026-03-15T09:00:00-07:00",
      endsAt: "2026-03-16T17:00:00-07:00",
      locationType: "virtual",
      locationName: null,
      locationUrl: null,
      imageUrl: null,
      language: null,
      translationLinks: [],
    })
    mockExtractLumaRichContent.mockResolvedValueOnce(null)
    mockCreateHackathonFromImport.mockResolvedValueOnce({
      status: "failed",
      hackathon: null,
    })

    const res = await api.handle(
      new Request("http://localhost/api/dashboard/import/url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer sk_live_test",
        },
        body: JSON.stringify({ draftId, url: "https://luma.com/test-event" }),
      }),
    )

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({
      error: "Failed to create hackathon",
      code: "creation_failed",
      retryable: true,
    })
    expect(mockImportTranslationVariants).not.toHaveBeenCalled()
    expect(mockLogAudit).not.toHaveBeenCalled()
    expect(mockTriggerWebhooks).not.toHaveBeenCalled()
  })

  it("rejects a malformed URL-import draft ID before fetching the page", async () => {
    mockVerifyApiKey.mockResolvedValueOnce({
      id: "key-1",
      tenant_id: "tenant-1",
      scopes: ["hackathons:write"],
    })

    const res = await api.handle(
      new Request("http://localhost/api/dashboard/import/url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer sk_live_test",
        },
        body: JSON.stringify({ draftId: "not-a-uuid", url: "https://luma.com/test-event" }),
      }),
    )

    expect(res.status).toBe(422)
    expect(mockExtractLumaEventData).not.toHaveBeenCalled()
    expect(mockExtractEventPageData).not.toHaveBeenCalled()
    expect(mockCreateHackathonFromImport).not.toHaveBeenCalled()
    expect(mockImportTranslationVariants).not.toHaveBeenCalled()
    expect(mockLogAudit).not.toHaveBeenCalled()
    expect(mockTriggerWebhooks).not.toHaveBeenCalled()
  })

  it("creates hackathon from a non-Luma event page URL with rich content", async () => {
    mockVerifyApiKey.mockResolvedValueOnce({
      id: "key-1",
      tenant_id: "tenant-1",
      scopes: ["hackathons:write"],
    })

    mockExtractEventPageData.mockResolvedValueOnce({
      name: "Devpost Hackathon",
      description: "A hackathon on Devpost",
      startsAt: "2026-06-01T09:00:00Z",
      endsAt: "2026-06-02T17:00:00Z",
      locationType: "virtual",
      locationName: null,
      locationUrl: "https://devpost.com/hackathon",
      imageUrl: "https://devpost.com/banner.png",
      language: null,
      translationLinks: [],    })

    mockExtractEventPageRichContent.mockResolvedValueOnce({
      sponsors: [{ name: "Stripe", tier: "gold" }],
      rules: "Teams of 1-4. No pre-built projects.",
      prizes: [{ name: "Best Overall", description: null, value: "$10,000" }],
      challenges: [],
      translationLinks: [],
      cleanedDescription: null,
    })

    mockCreateHackathonFromImport.mockResolvedValueOnce(created({
      id: "h-devpost",
      name: "Devpost Hackathon",
      slug: "devpost-hackathon",
    }))

    const res = await api.handle(
      new Request("http://localhost/api/dashboard/import/url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer sk_live_test",
        },
        body: JSON.stringify({
          url: "https://devpost.com/hackathon/test",
        }),
      })
    )

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.id).toBe("h-devpost")
    expect(data.slug).toBe("devpost-hackathon")
    expect(mockExtractEventPageData).toHaveBeenCalledWith("https://devpost.com/hackathon/test")
    expect(mockExtractEventPageRichContent).toHaveBeenCalledWith(
      "https://devpost.com/hackathon/test",
      { eventStartsAt: "2026-06-01T09:00:00Z" }
    )
    expect(mockCreateHackathonFromImport).toHaveBeenCalledWith(
      "tenant-1",
      expect.objectContaining({
        name: "Devpost Hackathon",
        description: "A hackathon on Devpost",
        startsAt: "2026-06-01T09:00:00Z",
        endsAt: "2026-06-02T17:00:00Z",
        registrationOpensAt: null,
        registrationClosesAt: null,
        locationType: "virtual",
        locationName: null,
        locationUrl: "https://devpost.com/hackathon",
        imageUrl: "https://devpost.com/banner.png",
        rules: "Teams of 1-4. No pre-built projects.",
        defaultLocale: null,
        sponsors: [{ name: "Stripe", tier: "gold" }],
        prizes: [{ name: "Best Overall", description: null, value: "$10,000" }],
      })
    )
  })

  it("passes extracted agenda items to the aggregate create call", async () => {
    mockVerifyApiKey.mockResolvedValueOnce({
      id: "key-1",
      tenant_id: "tenant-1",
      scopes: ["hackathons:write"],
    })

    mockExtractLumaEventData.mockResolvedValueOnce({
      name: "Agenda Event",
      description: null,
      startsAt: "2026-05-10T09:00:00-04:00",
      endsAt: "2026-05-11T17:00:00-04:00",
      locationType: "in_person",
      locationName: "NYC",
      locationUrl: null,
      imageUrl: null,
      language: null,
      translationLinks: [],
    })

    mockExtractLumaRichContent.mockResolvedValueOnce({
      sponsors: [],
      rules: null,
      prizes: [],
      challenges: [],
      translationLinks: [],
      cleanedDescription: null,
      agendaItems: [
        {
          title: "Kickoff",
          description: "Welcome",
          startsAt: "2026-05-10T09:00:00-04:00",
          endsAt: "2026-05-10T09:30:00-04:00",
          location: "Main Hall",
          speakers: [],
        },
      ],
    })

    mockCreateHackathonFromImport.mockResolvedValueOnce(created({
      id: "h-agenda",
      name: "Agenda Event",
      slug: "agenda-event",
    }))

    const res = await api.handle(
      new Request("http://localhost/api/dashboard/import/url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer sk_live_test",
        },
        body: JSON.stringify({ url: "https://luma.com/agenda-event" }),
      })
    )

    expect(res.status).toBe(200)
    expect(mockCreateHackathonFromImport).toHaveBeenCalledWith(
      "tenant-1",
      expect.objectContaining({
        agendaItems: [
          {
            title: "Kickoff",
            description: "Welcome",
            startsAt: "2026-05-10T09:00:00-04:00",
            endsAt: "2026-05-10T09:30:00-04:00",
            location: "Main Hall",
            speakers: [],
          },
        ],
      })
    )
  })

  it("returns 404 when event page URL yields no extractable data", async () => {
    mockVerifyApiKey.mockResolvedValueOnce({
      id: "key-1",
      tenant_id: "tenant-1",
      scopes: ["hackathons:write"],
    })

    mockExtractEventPageData.mockResolvedValueOnce(null)

    const res = await api.handle(
      new Request("http://localhost/api/dashboard/import/url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer sk_live_test",
        },
        body: JSON.stringify({ url: "https://example.com/no-schema" }),
      })
    )

    expect(res.status).toBe(404)
  })

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValueOnce({ userId: null, orgId: null, orgRole: null })

    const res = await api.handle(
      new Request("http://localhost/api/dashboard/import/url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://devpost.com/hackathon/test" }),
      })
    )

    expect(res.status).toBe(401)
  })
})

describe("POST /api/public/import/url (validation, no auth)", () => {
  beforeEach(() => {
    mockExtractLumaEventData.mockClear()
    mockExtractEventPageData.mockClear()
    mockAuth.mockClear()
  })

  it("returns event data for a non-Luma URL without auth", async () => {
    mockExtractEventPageData.mockResolvedValueOnce({
      name: "Public Event",
      description: "A public event",
      startsAt: "2026-06-01T09:00:00",
      endsAt: "2026-06-01T17:00:00",
      locationType: "virtual",
      locationName: null,
      locationUrl: null,
      imageUrl: null,
      language: null,
      translationLinks: [],    })

    const res = await api.handle(
      new Request("http://localhost/api/public/import/url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://devpost.com/hackathon/test" }),
      })
    )

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.name).toBe("Public Event")
  })

  it("returns event data for a Luma URL without auth", async () => {
    mockExtractLumaEventData.mockResolvedValueOnce({
      name: "Luma Event",
      description: "A luma event",
      startsAt: "2026-06-01T09:00:00",
      endsAt: "2026-06-01T17:00:00",
      locationType: "in_person",
      locationName: "San Francisco",
      locationUrl: null,
      imageUrl: null,
      language: null,
      translationLinks: [],    })

    const res = await api.handle(
      new Request("http://localhost/api/public/import/url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://luma.com/my-event" }),
      })
    )

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.name).toBe("Luma Event")
  })

  it("returns 404 when no data extracted", async () => {
    mockExtractEventPageData.mockResolvedValueOnce(null)

    const res = await api.handle(
      new Request("http://localhost/api/public/import/url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://example.com/no-schema" }),
      })
    )

    expect(res.status).toBe(404)
  })
})
