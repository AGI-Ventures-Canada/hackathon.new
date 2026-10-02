import { describe, expect, it, mock, beforeEach } from "bun:test"
import { resetClerkMocks } from "../lib/supabase-mock"

const mockCheckHackathonOrganizer = mock(() => Promise.resolve({ status: "ok" }))
const mockUploadSponsorLogo = mock(() =>
  Promise.resolve({ url: "https://cdn.example.com/sponsor-logo.webp", path: "sponsors/h1/s1/logo.webp" })
)
const mockDeleteSponsorLogo = mock(() => Promise.resolve(true))
const mockAddSponsor = mock(() => Promise.resolve({ id: "22222222-2222-4222-8222-222222222222", name: "Example", tier: "none", created_at: "2026-09-05T12:00:00Z" }))
const mockRemoveSponsor = mock(() => Promise.resolve(true))
const mockUpdateSponsor = mock(() => Promise.resolve(null))
const mockListHackathonSponsors = mock(() => Promise.resolve([]))
const mockUpdateTenantSponsorLogos = mock(() => Promise.resolve())
const mockIsSlugAvailable = mock(() => Promise.resolve(true))
const mockLogAudit = mock(() => Promise.resolve(null))

mock.module("@/lib/services/public-hackathons", () => ({
  checkHackathonOrganizer: mockCheckHackathonOrganizer,
}))

mock.module("@/lib/services/storage", () => ({
  uploadSponsorLogo: mockUploadSponsorLogo,
  deleteSponsorLogo: mockDeleteSponsorLogo,
  uploadLogo: mock(() => Promise.resolve(null)),
  deleteLogo: mock(() => Promise.resolve(true)),
  uploadBanner: mock(() => Promise.resolve(null)),
  deleteBanner: mock(() => Promise.resolve(true)),
  uploadScreenshot: mock(() => Promise.resolve(null)),
  deleteScreenshot: mock(() => Promise.resolve(true)),
  optimizeImage: mock(() => Promise.resolve({ buffer: Buffer.alloc(64), mimeType: "image/webp" })),
  optimizeScreenshot: mock(() => Promise.resolve({ buffer: Buffer.alloc(64), mimeType: "image/webp" })),
  optimizeBanner: mock(() => Promise.resolve({ buffer: Buffer.alloc(64), mimeType: "image/webp" })),
  ImageTooLargeError: class ImageTooLargeError extends Error {
    constructor(size: number) {
      super(`Image too large: ${size}`)
      this.name = "ImageTooLargeError"
    }
  },
}))

mock.module("@/lib/services/sponsors", () => ({
  addSponsor: mockAddSponsor,
  removeSponsor: mockRemoveSponsor,
  updateSponsor: mockUpdateSponsor,
  listHackathonSponsors: mockListHackathonSponsors,
}))

mock.module("@/lib/services/tenant-sponsors", () => ({
  updateTenantSponsorLogos: mockUpdateTenantSponsorLogos,
  upsertTenantSponsor: mock(() => Promise.resolve({ id: "saved-sponsor" })),
}))

mock.module("@/lib/services/tenant-profiles", () => ({
  isSlugAvailable: mockIsSlugAvailable,
}))

mock.module("@/lib/services/audit", () => ({
  logAudit: mockLogAudit,
  listAllAuditLogs: mock(() => Promise.resolve({ logs: [], total: 0 })),
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

mock.module("@/lib/services/event-mutation-lease", () => ({
  withEventMutationLease: async (_id: string, operation: () => Promise<unknown>) => operation(),
  EventMutationLeaseError: class EventMutationLeaseError extends Error {},
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

function makeFormData(fields: Record<string, string | File>) {
  const fd = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    fd.append(key, value)
  }
  return fd
}

function fakeImageFile(type = "image/png") {
  return new File(["fake-image-data"], "logo.png", { type })
}

describe("Sponsor Logo API Integration Tests", () => {
  beforeEach(() => {
    resetClerkMocks()
    mockResolvePrincipal.mockReset()
    mockCheckHackathonOrganizer.mockReset()
    mockUploadSponsorLogo.mockReset()
    mockDeleteSponsorLogo.mockReset()
    mockUpdateSponsor.mockReset()
    mockListHackathonSponsors.mockReset()
    mockUpdateTenantSponsorLogos.mockReset()
    mockIsSlugAvailable.mockReset()
    mockLogAudit.mockReset()
    mockListHackathonSponsors.mockResolvedValue([{ id: "s1", tenant_sponsor_id: null }])
    mockUpdateSponsor.mockResolvedValue({ id: "s1" })
  })

  describe("POST /api/dashboard/hackathons/:id/sponsors/:sponsorId/logo", () => {
    it("rejects unauthenticated requests", async () => {
      mockResolvePrincipal.mockResolvedValue({ kind: "anon" })

      const fd = makeFormData({ file: fakeImageFile(), variant: "light" })
      const res = await app.handle(
        new Request("http://localhost/api/dashboard/hackathons/h1/sponsors/s1/logo", {
          method: "POST",
          body: fd,
        })
      )
      const data = await res.json()

      expect(data.error).toBe("Unauthorized")
      expect(res.status).toBeGreaterThanOrEqual(400)
    })

    it("returns 404 when hackathon not found", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockCheckHackathonOrganizer.mockResolvedValue({ status: "not_found" })

      const fd = makeFormData({ file: fakeImageFile(), variant: "light" })
      const res = await app.handle(
        new Request("http://localhost/api/dashboard/hackathons/h1/sponsors/s1/logo", {
          method: "POST",
          body: fd,
        })
      )
      const data = await res.json()

      expect(res.status).toBe(404)
      expect(data.error).toBe("Hackathon not found")
    })

    it("returns 403 when not authorized", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockCheckHackathonOrganizer.mockResolvedValue({ status: "not_authorized" })

      const fd = makeFormData({ file: fakeImageFile(), variant: "light" })
      const res = await app.handle(
        new Request("http://localhost/api/dashboard/hackathons/h1/sponsors/s1/logo", {
          method: "POST",
          body: fd,
        })
      )
      const data = await res.json()

      expect(res.status).toBe(403)
      expect(data.error).toContain("Not authorized")
    })

    it("returns 400 when no file is provided", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockCheckHackathonOrganizer.mockResolvedValue({ status: "ok" })

      const fd = makeFormData({ variant: "light" })
      const res = await app.handle(
        new Request("http://localhost/api/dashboard/hackathons/h1/sponsors/s1/logo", {
          method: "POST",
          body: fd,
        })
      )
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.error).toBe("No file provided")
    })

    it("returns 400 when file exceeds 5MB limit", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockCheckHackathonOrganizer.mockResolvedValue({ status: "ok" })

      const largeFile = new File([new ArrayBuffer(6 * 1024 * 1024)], "large.png", { type: "image/png" })
      const fd = makeFormData({ file: largeFile, variant: "light" })
      const res = await app.handle(
        new Request("http://localhost/api/dashboard/hackathons/h1/sponsors/s1/logo", {
          method: "POST",
          body: fd,
        })
      )
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.error).toContain("File too large")
    })

    it("returns 400 for invalid variant", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockCheckHackathonOrganizer.mockResolvedValue({ status: "ok" })

      const fd = makeFormData({ file: fakeImageFile(), variant: "invalid" })
      const res = await app.handle(
        new Request("http://localhost/api/dashboard/hackathons/h1/sponsors/s1/logo", {
          method: "POST",
          body: fd,
        })
      )
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.error).toContain("Invalid variant")
    })

    it("returns 400 for invalid file type", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockCheckHackathonOrganizer.mockResolvedValue({ status: "ok" })

      const invalidFile = new File(["fake-data"], "document.pdf", { type: "application/pdf" })
      const fd = makeFormData({ file: invalidFile, variant: "light" })
      const res = await app.handle(
        new Request("http://localhost/api/dashboard/hackathons/h1/sponsors/s1/logo", {
          method: "POST",
          body: fd,
        })
      )
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.error).toContain("Invalid file type")
    })

    it("uploads light logo and returns url", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockCheckHackathonOrganizer.mockResolvedValue({ status: "ok" })
      mockUploadSponsorLogo.mockResolvedValue({
        url: "https://cdn.example.com/sponsor-logo.webp",
        path: "sponsors/h1/s1/logo.webp",
      })
      mockListHackathonSponsors.mockResolvedValue([{ id: "s1", tenant_sponsor_id: null }])

      const fd = makeFormData({ file: fakeImageFile(), variant: "light" })
      const res = await app.handle(
        new Request("http://localhost/api/dashboard/hackathons/h1/sponsors/s1/logo", {
          method: "POST",
          body: fd,
        })
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.url).toBe("https://cdn.example.com/sponsor-logo.webp")
      expect(mockUploadSponsorLogo).toHaveBeenCalledWith("h1", "s1", expect.any(Buffer), "image/png", "light")
      expect(mockUpdateSponsor).toHaveBeenCalledWith("s1", { logoUrl: "https://cdn.example.com/sponsor-logo.webp" }, "h1")
      expect(mockLogAudit).toHaveBeenCalled()
    })

    it("uploads dark logo and updates dark logo field", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockCheckHackathonOrganizer.mockResolvedValue({ status: "ok" })
      mockUploadSponsorLogo.mockResolvedValue({
        url: "https://cdn.example.com/sponsor-logo-dark.webp",
        path: "sponsors/h1/s1/logo-dark.webp",
      })
      mockListHackathonSponsors.mockResolvedValue([{ id: "s1", tenant_sponsor_id: null }])

      const fd = makeFormData({ file: fakeImageFile(), variant: "dark" })
      const res = await app.handle(
        new Request("http://localhost/api/dashboard/hackathons/h1/sponsors/s1/logo", {
          method: "POST",
          body: fd,
        })
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.url).toBe("https://cdn.example.com/sponsor-logo-dark.webp")
      expect(mockUpdateSponsor).toHaveBeenCalledWith("s1", { logoUrlDark: "https://cdn.example.com/sponsor-logo-dark.webp" }, "h1")
    })

    it("returns 500 when upload fails", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockCheckHackathonOrganizer.mockResolvedValue({ status: "ok" })
      mockUploadSponsorLogo.mockResolvedValue(null)

      const fd = makeFormData({ file: fakeImageFile(), variant: "light" })
      const res = await app.handle(
        new Request("http://localhost/api/dashboard/hackathons/h1/sponsors/s1/logo", {
          method: "POST",
          body: fd,
        })
      )
      const data = await res.json()

      expect(res.status).toBe(500)
      expect(data.error).toBe("Failed to upload sponsor logo")
    })

    it("propagates logo update to tenant sponsor when sponsor has tenant_sponsor_id", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockCheckHackathonOrganizer.mockResolvedValue({ status: "ok" })
      mockUploadSponsorLogo.mockResolvedValue({
        url: "https://cdn.example.com/logo.webp",
        path: "sponsors/h1/s1/logo.webp",
      })
      mockListHackathonSponsors.mockResolvedValue([
        { id: "s1", tenant_sponsor_id: "ts1" },
      ])

      const fd = makeFormData({ file: fakeImageFile(), variant: "light" })
      await app.handle(
        new Request("http://localhost/api/dashboard/hackathons/h1/sponsors/s1/logo", {
          method: "POST",
          body: fd,
        })
      )

      expect(mockUpdateTenantSponsorLogos).toHaveBeenCalledWith("ts1", "tenant-123", { logoUrl: "https://cdn.example.com/logo.webp" })
    })
  })

  describe("PATCH /api/dashboard/hackathons/:id/sponsors/:sponsorId", () => {
    it("updates linked sponsor asset source", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockCheckHackathonOrganizer.mockResolvedValue({ status: "ok", hackathon: { status: "draft", updated_at: "2026-09-05T12:00:00Z" } })
      mockUpdateSponsor.mockResolvedValue({
        id: "22222222-2222-4222-8222-222222222222",
        hackathon_id: "11111111-1111-4111-8111-111111111111",
        sponsor_tenant_id: "org-1",
        tenant_sponsor_id: null,
        use_org_assets: true,
        name: "Sponsor",
        logo_url: null,
        logo_url_dark: null,
        website_url: "https://example.com",
        tier: "gold",
        display_order: 0,
        created_at: "2026-03-19T00:00:00.000Z",
      })

      const res = await app.handle(
        new Request("http://localhost/api/dashboard/hackathons/11111111-1111-4111-8111-111111111111/sponsors/22222222-2222-4222-8222-222222222222", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ useOrgAssets: true }),
        })
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.id).toBe("22222222-2222-4222-8222-222222222222")
      expect(mockUpdateSponsor).toHaveBeenCalledWith(
        "22222222-2222-4222-8222-222222222222",
        { useOrgAssets: true },
        "11111111-1111-4111-8111-111111111111"
      )
      expect(mockLogAudit).toHaveBeenCalled()
    })
  })

  describe("DELETE /api/dashboard/hackathons/:id/sponsors/:sponsorId/logo", () => {
    it("rejects unauthenticated requests", async () => {
      mockResolvePrincipal.mockResolvedValue({ kind: "anon" })

      const res = await app.handle(
        new Request("http://localhost/api/dashboard/hackathons/h1/sponsors/s1/logo", {
          method: "DELETE",
        })
      )
      const data = await res.json()

      expect(data.error).toBe("Unauthorized")
      expect(res.status).toBeGreaterThanOrEqual(400)
    })

    it("returns 400 for invalid variant", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)

      const res = await app.handle(
        new Request("http://localhost/api/dashboard/hackathons/h1/sponsors/s1/logo?variant=invalid", {
          method: "DELETE",
        })
      )
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.error).toContain("Invalid variant")
    })

    it("returns 404 when hackathon not found", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockCheckHackathonOrganizer.mockResolvedValue({ status: "not_found" })

      const res = await app.handle(
        new Request("http://localhost/api/dashboard/hackathons/h1/sponsors/s1/logo", {
          method: "DELETE",
        })
      )
      const data = await res.json()

      expect(res.status).toBe(404)
      expect(data.error).toBe("Hackathon not found")
    })

    it("returns 403 when not authorized", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockCheckHackathonOrganizer.mockResolvedValue({ status: "not_authorized" })

      const res = await app.handle(
        new Request("http://localhost/api/dashboard/hackathons/h1/sponsors/s1/logo", {
          method: "DELETE",
        })
      )
      const data = await res.json()

      expect(res.status).toBe(403)
      expect(data.error).toContain("Not authorized")
    })

    it("deletes light logo by default and clears logoUrl", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockCheckHackathonOrganizer.mockResolvedValue({ status: "ok" })
      mockDeleteSponsorLogo.mockResolvedValue(true)

      const res = await app.handle(
        new Request("http://localhost/api/dashboard/hackathons/h1/sponsors/s1/logo", {
          method: "DELETE",
        })
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.success).toBe(true)
      expect(mockDeleteSponsorLogo).toHaveBeenCalledWith("h1", "s1", "light")
      expect(mockUpdateSponsor).toHaveBeenCalledWith("s1", { logoUrl: null }, "h1")
      expect(mockLogAudit).toHaveBeenCalled()
    })

    it("deletes dark logo and clears logoUrlDark when variant=dark", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockCheckHackathonOrganizer.mockResolvedValue({ status: "ok" })
      mockDeleteSponsorLogo.mockResolvedValue(true)

      const res = await app.handle(
        new Request("http://localhost/api/dashboard/hackathons/h1/sponsors/s1/logo?variant=dark", {
          method: "DELETE",
        })
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.success).toBe(true)
      expect(mockDeleteSponsorLogo).toHaveBeenCalledWith("h1", "s1", "dark")
      expect(mockUpdateSponsor).toHaveBeenCalledWith("s1", { logoUrlDark: null }, "h1")
    })

    it("deletes light logo when variant=light is explicitly passed", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockCheckHackathonOrganizer.mockResolvedValue({ status: "ok" })
      mockDeleteSponsorLogo.mockResolvedValue(true)

      const res = await app.handle(
        new Request("http://localhost/api/dashboard/hackathons/h1/sponsors/s1/logo?variant=light", {
          method: "DELETE",
        })
      )

      expect(res.status).toBe(200)
      expect(mockDeleteSponsorLogo).toHaveBeenCalledWith("h1", "s1", "light")
      expect(mockUpdateSponsor).toHaveBeenCalledWith("s1", { logoUrl: null }, "h1")
    })
  })

  describe("GET /api/dashboard/organizations/slug-available", () => {
    it("rejects unauthenticated requests", async () => {
      mockResolvePrincipal.mockResolvedValue({ kind: "anon" })

      const res = await app.handle(
        new Request("http://localhost/api/dashboard/organizations/slug-available?slug=my-org")
      )
      const data = await res.json()

      expect(data.error).toBe("Unauthorized")
      expect(res.status).toBeGreaterThanOrEqual(400)
    })

    it("returns available: true when slug is free", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockIsSlugAvailable.mockResolvedValue(true)

      const res = await app.handle(
        new Request("http://localhost/api/dashboard/organizations/slug-available?slug=my-org")
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.available).toBe(true)
      expect(mockIsSlugAvailable).toHaveBeenCalledWith("my-org")
    })

    it("returns available: false when slug is taken", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockIsSlugAvailable.mockResolvedValue(false)

      const res = await app.handle(
        new Request("http://localhost/api/dashboard/organizations/slug-available?slug=taken-slug")
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.available).toBe(false)
    })

    it("returns 422 when slug query param is missing", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)

      const res = await app.handle(
        new Request("http://localhost/api/dashboard/organizations/slug-available")
      )

      expect(res.status).toBe(422)
    })

    it("returns 422 when slug is empty string", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)

      const res = await app.handle(
        new Request("http://localhost/api/dashboard/organizations/slug-available?slug=")
      )

      expect(res.status).toBe(422)
    })
  })
})


describe("Sponsor WebMCP API", () => {
  const eventId = "11111111-1111-4111-8111-111111111111"
  const sponsorId = "22222222-2222-4222-8222-222222222222"
  const version = "2026-09-05T12:00:00.000Z"
  const headers = { "Content-Type": "application/json", "x-webmcp-request": "1", "x-webmcp-expected-status": "draft", "x-webmcp-event-version": version, "x-webmcp-idempotency-key": "33333333-3333-4333-8333-333333333333" }
  beforeEach(() => {
    mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
    mockCheckHackathonOrganizer.mockResolvedValue({ status: "ok", hackathon: { status: "draft", updated_at: version } })
    mockAddSponsor.mockClear()
    mockRemoveSponsor.mockClear()
    mockUpdateSponsor.mockReset()
    mockUpdateSponsor.mockResolvedValue({ id: sponsorId })
  })
  it("adds an authorized sponsor with a stable retry identity", async () => {
    const response = await app.handle(new Request(`http://localhost/api/dashboard/hackathons/${eventId}/sponsors`, { method: "POST", headers, body: JSON.stringify({ name: "Example" }) }))
    expect(response.status).toBe(200)
    expect(mockAddSponsor.mock.calls[0][0]).toMatchObject({ id: headers["x-webmcp-idempotency-key"], hackathonId: eventId, name: "Example" })
  })
  it.each(["POST", "PATCH", "DELETE"])("rejects stale %s context before mutation", async (method) => {
    const response = await app.handle(new Request(`http://localhost/api/dashboard/hackathons/${eventId}/sponsors${method === "POST" ? "" : `/${sponsorId}`}`, { method, headers: { ...headers, "x-webmcp-event-version": "old" }, ...(method !== "DELETE" ? { body: JSON.stringify({ name: "Example" }) } : {}) }))
    expect(response.status).toBe(409)
    expect(mockAddSponsor).not.toHaveBeenCalled()
    expect(mockUpdateSponsor).not.toHaveBeenCalled()
    expect(mockRemoveSponsor).not.toHaveBeenCalled()
  })
  it("rejects unsafe website edits for the CLI and browser alike", async () => {
    const response = await app.handle(new Request(`http://localhost/api/dashboard/hackathons/${eventId}/sponsors/${sponsorId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ websiteUrl: "http://localhost/private" }) }))
    expect(response.status).toBe(400)
    expect(mockUpdateSponsor).not.toHaveBeenCalled()
  })
  it("does not query a malformed sponsor ID", async () => {
    const response = await app.handle(new Request(`http://localhost/api/dashboard/hackathons/${eventId}/sponsors/not-an-id`, { method: "DELETE", headers }))
    expect(response.status).toBe(404)
    expect(mockRemoveSponsor).not.toHaveBeenCalled()
  })
  it("rejects a sponsor change from another organizer", async () => {
    mockCheckHackathonOrganizer.mockResolvedValue({ status: "not_authorized" })
    const response = await app.handle(new Request(`http://localhost/api/dashboard/hackathons/${eventId}/sponsors/${sponsorId}`, { method: "DELETE", headers }))
    expect(response.status).toBe(403)
    expect(mockRemoveSponsor).not.toHaveBeenCalled()
  })
})
