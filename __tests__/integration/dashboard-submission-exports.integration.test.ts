import { describe, expect, it, mock, beforeEach } from "bun:test"

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
    requirePrincipal: (principal: unknown, _kinds?: unknown, _scopes?: unknown) => {
      if (!principal || (principal as { kind: string }).kind === "anon") {
        throw new AuthError("Unauthorized", 401)
      }
      return principal
    },
    AuthError,
  }
})

mock.module("@/lib/services/rate-limit", () => ({
  checkRateLimit: () => ({ allowed: true, remaining: 100, resetAt: Date.now() + 60000 }),
  getRateLimitHeaders: () => ({}),
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

const mockCheckHackathonOrganizer = mock(() =>
  Promise.resolve({
    status: "ok" as const,
    hackathon: { id: "h1", tenant_id: "tenant-123", status: "completed" } as unknown,
  })
)

mock.module("@/lib/services/public-hackathons", () => ({
  checkHackathonOrganizer: mockCheckHackathonOrganizer,
  getPublicHackathon: mock(() => Promise.resolve(null)),
}))

const mockCreateSubmissionExport = mock(() =>
  Promise.resolve({ success: true, exportId: "exp-1" } as unknown)
)
const mockGetExportById = mock(() => Promise.resolve(null as unknown))
const mockListExportsForHackathon = mock(() => Promise.resolve([] as unknown[]))

mock.module("@/lib/services/submission-exports", () => ({
  createSubmissionExport: mockCreateSubmissionExport,
  getExportById: mockGetExportById,
  listExportsForHackathon: mockListExportsForHackathon,
  DEFAULT_EXPORT_FILTERS: {
    winnersOnly: false,
    includeDrafts: false,
    includeJudgeNotes: true,
  },
}))

const mockLogAudit = mock(() => Promise.resolve(null))

mock.module("@/lib/services/audit", () => ({
  logAudit: mockLogAudit,
}))

const mockCreateSignedUrl = mock(() =>
  Promise.resolve({ data: { signedUrl: "https://signed.example/abc" }, error: null })
)

mock.module("@/lib/db/client", () => ({
  supabase: () => ({
    storage: {
      from: () => ({
        createSignedUrl: mockCreateSignedUrl,
      }),
    },
  }),
}))

const mockStart = mock(() => Promise.resolve({ runId: "wf-1" }))

mock.module("workflow/api", () => ({
  start: mockStart,
}))

const { Elysia } = await import("elysia")
const { dashboardEventRoutes } = await import("@/lib/api/routes/dashboard-event")
const { handleRouteError } = await import("@/lib/api/routes/errors")

const app = new Elysia({ prefix: "/api" })
  .onError(({ error, set, path }) => handleRouteError(error, set, path))
  .use(dashboardEventRoutes)

const HACKATHON_ID = "11111111-1111-1111-1111-111111111111"
const EXPORT_ID = "22222222-2222-2222-2222-222222222222"

const mockUserPrincipal = {
  kind: "user" as const,
  tenantId: "tenant-123",
  userId: "user-456",
  orgId: "org-789",
  orgRole: "org:admin",
  scopes: ["hackathons:read", "hackathons:write"],
}

const completedOrganizerCheck = {
  status: "ok" as const,
  hackathon: { id: HACKATHON_ID, tenant_id: "tenant-123", status: "completed" } as unknown,
}

function resetAll() {
  mockResolvePrincipal.mockReset()
  mockCheckHackathonOrganizer.mockReset()
  mockCreateSubmissionExport.mockReset()
  mockGetExportById.mockReset()
  mockListExportsForHackathon.mockReset()
  mockLogAudit.mockReset()
  mockCreateSignedUrl.mockReset()
  mockStart.mockReset()
  mockCheckHackathonOrganizer.mockResolvedValue(completedOrganizerCheck)
  mockListExportsForHackathon.mockResolvedValue([])
  mockCreateSubmissionExport.mockResolvedValue({ success: true, exportId: EXPORT_ID } as unknown)
  mockCreateSignedUrl.mockResolvedValue({
    data: { signedUrl: "https://signed.example/abc" },
    error: null,
  })
  mockStart.mockResolvedValue({ runId: "wf-1" })
}

describe("POST /api/dashboard/hackathons/:id/exports", () => {
  const url = `http://localhost/api/dashboard/hackathons/${HACKATHON_ID}/exports`

  beforeEach(resetAll)

  it("rejects anon requests with 401", async () => {
    mockResolvePrincipal.mockResolvedValue({ kind: "anon" })
    const res = await app.handle(
      new Request(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
    )
    expect(res.status).toBe(401)
    expect(mockCreateSubmissionExport).not.toHaveBeenCalled()
  })

  it("returns 400 when hackathon is not completed", async () => {
    mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
    mockCheckHackathonOrganizer.mockResolvedValue({
      status: "ok" as const,
      hackathon: { id: HACKATHON_ID, tenant_id: "tenant-123", status: "judging" } as unknown,
    })

    const res = await app.handle(
      new Request(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
    )
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.error).toContain("completed")
    expect(mockCreateSubmissionExport).not.toHaveBeenCalled()
  })

  it("creates an export, starts the workflow, and audits", async () => {
    mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)

    const res = await app.handle(
      new Request(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ winnersOnly: true }),
      })
    )
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.exportId).toBe(EXPORT_ID)
    expect(data.status).toBe("pending")
    expect(mockCreateSubmissionExport).toHaveBeenCalledTimes(1)
    const calls = mockCreateSubmissionExport.mock.calls as unknown as Array<unknown[]>
    const filtersArg = calls[0]![2] as Record<string, boolean>
    expect(filtersArg.winnersOnly).toBe(true)
    expect(filtersArg.includeJudgeNotes).toBe(true)
    expect(mockStart).toHaveBeenCalledTimes(1)
    expect(mockLogAudit).toHaveBeenCalledTimes(1)
  })

  it("returns 409 when an export is already pending", async () => {
    mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
    mockCreateSubmissionExport.mockResolvedValue({
      success: false,
      code: "active_export_exists",
      error: "An export is already being prepared for this hackathon.",
    } as unknown)

    const res = await app.handle(
      new Request(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
    )
    const data = await res.json()

    expect(res.status).toBe(409)
    expect(data.code).toBe("active_export_exists")
    expect(mockStart).not.toHaveBeenCalled()
  })
})

describe("GET /api/dashboard/hackathons/:id/exports", () => {
  const url = `http://localhost/api/dashboard/hackathons/${HACKATHON_ID}/exports`

  beforeEach(resetAll)

  it("rejects anon with 401", async () => {
    mockResolvePrincipal.mockResolvedValue({ kind: "anon" })
    const res = await app.handle(new Request(url))
    expect(res.status).toBe(401)
  })

  it("returns the list of exports", async () => {
    mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
    mockListExportsForHackathon.mockResolvedValue([
      {
        id: EXPORT_ID,
        status: "ready",
        submission_count: 5,
        file_size_bytes: 18039,
        created_at: "2026-05-27T00:00:00Z",
        ready_at: "2026-05-27T00:01:00Z",
        expires_at: "2026-06-26T00:00:00Z",
        error_message: null,
      },
    ])

    const res = await app.handle(new Request(url))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.exports).toHaveLength(1)
    expect(data.exports[0].id).toBe(EXPORT_ID)
    expect(data.exports[0].submissionCount).toBe(5)
    expect(data.exports[0].fileSizeBytes).toBe(18039)
  })
})

describe("GET /api/dashboard/hackathons/:id/exports/:exportId/download", () => {
  const url = `http://localhost/api/dashboard/hackathons/${HACKATHON_ID}/exports/${EXPORT_ID}/download`

  beforeEach(() => {
    resetAll()
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000"
  })

  it("redirects anon to sign-in with the original URL as redirect_url", async () => {
    mockResolvePrincipal.mockResolvedValue({ kind: "anon" })
    const res = await app.handle(new Request(url))

    expect(res.status).toBe(302)
    const location = res.headers.get("location")
    expect(location).toContain("/sign-in?redirect_url=")
    expect(location).toContain(encodeURIComponent(`/api/dashboard/hackathons/${HACKATHON_ID}/exports/${EXPORT_ID}/download`))
  })

  it("returns 404 when exportId is not a valid UUID", async () => {
    mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
    const badUrl = `http://localhost/api/dashboard/hackathons/${HACKATHON_ID}/exports/not-a-uuid/download`

    const res = await app.handle(new Request(badUrl))
    expect(res.status).toBe(404)
  })

  it("returns 404 when the export belongs to a different hackathon", async () => {
    mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
    mockGetExportById.mockResolvedValue({
      id: EXPORT_ID,
      hackathon_id: "different-hackathon-id",
      status: "ready",
      storage_path: "x/y.zip",
      expires_at: null,
    })

    const res = await app.handle(new Request(url))
    expect(res.status).toBe(404)
    expect(mockCreateSignedUrl).not.toHaveBeenCalled()
  })

  it("returns 409 when export is not ready", async () => {
    mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
    mockGetExportById.mockResolvedValue({
      id: EXPORT_ID,
      hackathon_id: HACKATHON_ID,
      status: "processing",
      storage_path: null,
      expires_at: null,
    })

    const res = await app.handle(new Request(url))
    const data = await res.json()
    expect(res.status).toBe(409)
    expect(data.error).toContain("processing")
  })

  it("returns 410 when the export has expired", async () => {
    mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
    mockGetExportById.mockResolvedValue({
      id: EXPORT_ID,
      hackathon_id: HACKATHON_ID,
      status: "ready",
      storage_path: "x/y.zip",
      expires_at: "2020-01-01T00:00:00Z",
    })

    const res = await app.handle(new Request(url))
    expect(res.status).toBe(410)
  })

  it("redirects to the signed URL when the export is ready", async () => {
    mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
    mockGetExportById.mockResolvedValue({
      id: EXPORT_ID,
      hackathon_id: HACKATHON_ID,
      status: "ready",
      storage_path: "h/e/file.zip",
      expires_at: "2099-12-31T00:00:00Z",
    })

    const res = await app.handle(new Request(url))

    expect(res.status).toBe(302)
    expect(res.headers.get("location")).toBe("https://signed.example/abc")
    expect(mockCreateSignedUrl).toHaveBeenCalledWith("h/e/file.zip", 3600)
    expect(mockLogAudit).toHaveBeenCalledTimes(1)
  })
})
