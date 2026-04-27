import { describe, it, expect, mock, beforeEach } from "bun:test"

const mockCreateHackathonFromImport = mock(() => Promise.resolve(null))
const mockCreateSponsorsFromImport = mock(() => Promise.resolve())
const mockCreatePrizesFromImport = mock(() => Promise.resolve())
const mockCreateAgendaFromImport = mock(() => Promise.resolve())
mock.module("@/lib/services/luma-import-create", () => ({
  createHackathonFromImport: mockCreateHackathonFromImport,
  createSponsorsFromImport: mockCreateSponsorsFromImport,
  createPrizesFromImport: mockCreatePrizesFromImport,
  createAgendaFromImport: mockCreateAgendaFromImport,
}))

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

const mockGetOrCreateTenant = mock(() => Promise.resolve(null))
const mockGetOrCreatePersonalTenant = mock(() => Promise.resolve(null))
mock.module("@/lib/services/tenants", () => ({
  getOrCreateTenant: mockGetOrCreateTenant,
  getOrCreatePersonalTenant: mockGetOrCreatePersonalTenant,
}))

const { api } = await import("@/lib/api")

describe("POST /api/dashboard/import/event (create from editor data)", () => {
  beforeEach(() => {
    mockCreateHackathonFromImport.mockClear()
    mockCreateSponsorsFromImport.mockClear()
    mockCreatePrizesFromImport.mockClear()
    mockCreateAgendaFromImport.mockClear()
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
  })

  it("creates hackathon from import when authenticated", async () => {
    mockAuth.mockResolvedValueOnce({
      userId: "user-1",
      orgId: "org-1",
      orgRole: "org:admin",
    })

    mockGetOrCreateTenant.mockResolvedValueOnce({ id: "tenant-1" })

    mockCreateHackathonFromImport.mockResolvedValueOnce({
      id: "h1",
      name: "Imported Hackathon",
      slug: "imported-hackathon",
    })

    const res = await api.handle(
      new Request("http://localhost/api/dashboard/import/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Imported Hackathon",
          description: "From Luma",
          startsAt: "2026-03-15T09:00:00.000-08:00",
          endsAt: "2026-03-16T17:00:00.000-08:00",
          locationType: "in_person",
          locationName: "San Francisco",
          locationUrl: null,
          imageUrl: "https://images.lumacdn.com/test.png",
          sourceUrl: "https://luma.com/test-event",
        }),
      })
    )

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.id).toBe("h1")
    expect(data.slug).toBe("imported-hackathon")
  })

  it("creates hackathon from generic event-page data when authenticated", async () => {
    mockAuth.mockResolvedValueOnce({
      userId: "user-1",
      orgId: "org-1",
      orgRole: "org:admin",
    })

    mockGetOrCreateTenant.mockResolvedValueOnce({ id: "tenant-1" })

    mockCreateHackathonFromImport.mockResolvedValueOnce({
      id: "h-generic",
      name: "Imported Event Page",
      slug: "imported-event-page",
    })

    const res = await api.handle(
      new Request("http://localhost/api/dashboard/import/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Imported Event Page",
          description: "From Eventbrite",
          startsAt: "2026-06-08T09:00:00",
          endsAt: "2026-06-08T20:00:00",
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
    expect(mockCreateSponsorsFromImport).toHaveBeenCalledWith("h-generic", [
      { name: "OpenAI", tier: "gold" },
    ])
    expect(mockCreatePrizesFromImport).toHaveBeenCalledWith("h-generic", [
      { name: "Grand Prize", description: null, value: "$5,000" },
    ])
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

  it("forwards agendaItems to createAgendaFromImport with the event start anchor", async () => {
    mockAuth.mockResolvedValueOnce({
      userId: "user-1",
      orgId: "org-1",
      orgRole: "org:admin",
    })

    mockGetOrCreateTenant.mockResolvedValueOnce({ id: "tenant-1" })

    mockCreateHackathonFromImport.mockResolvedValueOnce({
      id: "h-agenda-event",
      name: "Agenda Event",
      slug: "agenda-event",
    })

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
    expect(mockCreateAgendaFromImport).toHaveBeenCalledWith(
      "h-agenda-event",
      agendaItems,
      "2026-05-14T08:30:00-04:00"
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
    expect(mockCreateAgendaFromImport).not.toHaveBeenCalled()
  })

  it("does not call createAgendaFromImport when agendaItems is empty", async () => {
    mockAuth.mockResolvedValueOnce({
      userId: "user-1",
      orgId: "org-1",
      orgRole: "org:admin",
    })

    mockGetOrCreateTenant.mockResolvedValueOnce({ id: "tenant-1" })

    mockCreateHackathonFromImport.mockResolvedValueOnce({
      id: "h-no-agenda",
      name: "No Agenda",
      slug: "no-agenda",
    })

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
    expect(mockCreateAgendaFromImport).not.toHaveBeenCalled()
  })
})

describe("POST /api/dashboard/import/url (create from URL)", () => {
  beforeEach(() => {
    mockCreateHackathonFromImport.mockClear()
    mockCreateSponsorsFromImport.mockClear()
    mockCreatePrizesFromImport.mockClear()
    mockCreateAgendaFromImport.mockClear()
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
      startsAt: "2026-03-15T09:00:00",
      endsAt: "2026-03-16T17:00:00",
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

    mockCreateHackathonFromImport.mockResolvedValueOnce({
      id: "h2",
      name: "CLI Imported Hackathon",
      slug: "cli-imported-hackathon",
    })

    const res = await api.handle(
      new Request("http://localhost/api/dashboard/import/url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer sk_live_test",
        },
        body: JSON.stringify({
          url: "lu.ma/test-hackathon",
          name: "CLI Imported Hackathon",
        }),
      })
    )

    expect(res.status).toBe(200)
    expect(mockCreateHackathonFromImport).toHaveBeenCalledWith("tenant-1", {
      name: "CLI Imported Hackathon",
      description: "From page",
      startsAt: "2026-03-15T09:00:00",
      endsAt: "2026-03-16T17:00:00",
      locationType: "in_person",
      locationName: "San Francisco",
      locationUrl: null,
      imageUrl: "https://images.lumacdn.com/test.png",
      rules: "Bring your laptop.",
      defaultLocale: null,
    })
    expect(mockCreateSponsorsFromImport).toHaveBeenCalledWith("h2", [
      { name: "OpenAI", tier: "gold" },
    ])
    expect(mockCreatePrizesFromImport).toHaveBeenCalledWith("h2", [
      { name: "Grand Prize", description: null, value: "$5,000" },
    ])
    expect(mockCreateAgendaFromImport).not.toHaveBeenCalled()
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
      startsAt: "2026-06-01T09:00:00",
      endsAt: "2026-06-02T17:00:00",
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

    mockCreateHackathonFromImport.mockResolvedValueOnce({
      id: "h-devpost",
      name: "Devpost Hackathon",
      slug: "devpost-hackathon",
    })

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
      { eventStartsAt: "2026-06-01T09:00:00" }
    )
    expect(mockCreateHackathonFromImport).toHaveBeenCalledWith("tenant-1", {
      name: "Devpost Hackathon",
      description: "A hackathon on Devpost",
      startsAt: "2026-06-01T09:00:00",
      endsAt: "2026-06-02T17:00:00",
      locationType: "virtual",
      locationName: null,
      locationUrl: "https://devpost.com/hackathon",
      imageUrl: "https://devpost.com/banner.png",
      rules: "Teams of 1-4. No pre-built projects.",
      defaultLocale: null,
    })
    expect(mockCreateSponsorsFromImport).toHaveBeenCalledWith("h-devpost", [
      { name: "Stripe", tier: "gold" },
    ])
    expect(mockCreatePrizesFromImport).toHaveBeenCalledWith("h-devpost", [
      { name: "Best Overall", description: null, value: "$10,000" },
    ])
  })

  it("passes extracted agenda items to createAgendaFromImport", async () => {
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

    mockCreateHackathonFromImport.mockResolvedValueOnce({
      id: "h-agenda",
      name: "Agenda Event",
      slug: "agenda-event",
    })

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
    expect(mockCreateAgendaFromImport).toHaveBeenCalledWith(
      "h-agenda",
      [
        {
          title: "Kickoff",
          description: "Welcome",
          startsAt: "2026-05-10T09:00:00-04:00",
          endsAt: "2026-05-10T09:30:00-04:00",
          location: "Main Hall",
          speakers: [],
        },
      ],
      "2026-05-10T09:00:00-04:00"
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
