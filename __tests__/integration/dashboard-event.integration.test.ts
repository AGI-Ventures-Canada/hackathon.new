import { describe, expect, it, mock, beforeEach } from "bun:test"
import { resetClerkMocks } from "../lib/supabase-mock"

const mockSetPhase = mock(() => Promise.resolve({ success: true }))

const mockListAnnouncements = mock(() => Promise.resolve([]))
const mockCreateAnnouncement = mock(() => Promise.resolve(null))
const mockUpdateAnnouncement = mock(() => Promise.resolve(null))
const mockDeleteAnnouncement = mock(() => Promise.resolve(false))
const mockPublishAnnouncement = mock(() => Promise.resolve(null))
const mockUnpublishAnnouncement = mock(() => Promise.resolve(null))
const mockScheduleAnnouncement = mock(() => Promise.resolve(null))

mock.module("@/lib/services/announcements", () => ({
  ANNOUNCEMENT_AUDIENCES: ["everyone", "organizers", "judges", "mentors", "attendees", "submitted", "not_submitted"],
  listAnnouncements: mockListAnnouncements,
  createAnnouncement: mockCreateAnnouncement,
  updateAnnouncement: mockUpdateAnnouncement,
  deleteAnnouncement: mockDeleteAnnouncement,
  publishAnnouncement: mockPublishAnnouncement,
  unpublishAnnouncement: mockUnpublishAnnouncement,
  scheduleAnnouncement: mockScheduleAnnouncement,
}))

const mockListScheduleItems = mock(() => Promise.resolve([]))
const mockCreateScheduleItem = mock(() => Promise.resolve(null))
const mockUpdateScheduleItem = mock(() => Promise.resolve(null))
const mockDeleteScheduleItem = mock(() => Promise.resolve(false))

mock.module("@/lib/services/schedule-items", () => ({
  listScheduleItems: mockListScheduleItems,
  createScheduleItem: mockCreateScheduleItem,
  updateScheduleItem: mockUpdateScheduleItem,
  deleteScheduleItem: mockDeleteScheduleItem,
}))

mock.module("@/lib/services/phases", () => ({
  getPhasesForStatus: (status: string) => {
    if (status === "active") return ["build", "submission_open"]
    if (status === "judging") return ["preliminaries", "finals", "results_pending"]
    return []
  },
  getPhaseLabel: (phase: string) => phase,
  validatePhaseTransition: () => null,
  setPhase: mockSetPhase,
  getPhase: mock(() => Promise.resolve("build")),
}))

const mockCheckHackathonOrganizer = mock(() =>
  Promise.resolve({ status: "authorized" as const, hackathon: { id: "h1", tenant_id: "tenant-123" } })
)

mock.module("@/lib/services/public-hackathons", () => ({
  checkHackathonOrganizer: mockCheckHackathonOrganizer,
  getPublicHackathon: mock(() => Promise.resolve(null)),
}))

const mockResolvePrincipal = mock(() =>
  Promise.resolve({ kind: "anon" })
)

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
const { dashboardEventRoutes } = await import("@/lib/api/routes/dashboard-event")
const { handleRouteError } = await import("@/lib/api/routes/errors")

const app = new Elysia({ prefix: "/api" })
  .onError(({ error, set, path }) => handleRouteError(error, set, path))
  .use(dashboardEventRoutes)

const mockUserPrincipal = {
  kind: "user" as const,
  tenantId: "tenant-123",
  userId: "user-456",
  orgId: "org-789",
  orgRole: "org:admin",
  scopes: ["hackathons:read", "hackathons:write"],
}

describe("Dashboard Event Routes Integration Tests", () => {
  beforeEach(() => {
    resetClerkMocks()
    mockResolvePrincipal.mockReset()
    mockSetPhase.mockReset()
    mockCheckHackathonOrganizer.mockReset()
    mockListAnnouncements.mockReset()
    mockCreateAnnouncement.mockReset()
    mockUpdateAnnouncement.mockReset()
    mockDeleteAnnouncement.mockReset()
    mockPublishAnnouncement.mockReset()
    mockUnpublishAnnouncement.mockReset()
    mockScheduleAnnouncement.mockReset()
    mockListScheduleItems.mockReset()
    mockCreateScheduleItem.mockReset()
    mockUpdateScheduleItem.mockReset()
    mockDeleteScheduleItem.mockReset()

    mockSetPhase.mockResolvedValue({ success: true })
    mockCheckHackathonOrganizer.mockResolvedValue({
      status: "authorized" as const,
      hackathon: { id: "h1", tenant_id: "tenant-123" },
    })
  })

  describe("PATCH /api/dashboard/hackathons/:id/phase", () => {
    const url = "http://localhost/api/dashboard/hackathons/11111111-1111-1111-1111-111111111111/phase"

    it("rejects unauthenticated requests", async () => {
      mockResolvePrincipal.mockResolvedValue({ kind: "anon" })

      const res = await app.handle(
        new Request(url, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phase: "build" }),
        })
      )
      const data = await res.json()

      expect(data.error).toBe("Unauthorized")
      expect(res.status).toBeGreaterThanOrEqual(400)
    })

    it("sets phase successfully for authenticated organizer", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)

      const res = await app.handle(
        new Request(url, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phase: "build" }),
        })
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.phase).toBe("build")
      expect(mockSetPhase).toHaveBeenCalledWith(
        "11111111-1111-1111-1111-111111111111",
        "tenant-123",
        "build"
      )
    })

    it("rejects invalid phase values", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)

      const res = await app.handle(
        new Request(url, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phase: "invalid_phase" }),
        })
      )
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.error).toContain("Invalid phase")
    })

    it("returns 404 when hackathon not found", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockCheckHackathonOrganizer.mockResolvedValue({ status: "not_found" as const })

      const res = await app.handle(
        new Request(url, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phase: "build" }),
        })
      )
      const data = await res.json()

      expect(res.status).toBe(404)
      expect(data.error).toBe("Hackathon not found")
    })

    it("returns 403 when user is not organizer", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockCheckHackathonOrganizer.mockResolvedValue({ status: "not_authorized" as const })

      const res = await app.handle(
        new Request(url, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phase: "build" }),
        })
      )
      const data = await res.json()

      expect(res.status).toBe(403)
      expect(data.error).toBe("Not authorized to manage this hackathon")
    })

    it("returns 400 when setPhase returns an error", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockSetPhase.mockResolvedValue({ error: "Phase not valid for status" })

      const res = await app.handle(
        new Request(url, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phase: "submission_open" }),
        })
      )
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.error).toBe("Phase not valid for status")
    })

    it("accepts all valid phase values", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)

      const phases = ["build", "submission_open", "preliminaries", "finals", "results_pending"]

      for (const phase of phases) {
        mockSetPhase.mockResolvedValue({ success: true })

        const res = await app.handle(
          new Request(url, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phase }),
          })
        )
        const data = await res.json()

        expect(res.status).toBe(200)
        expect(data.phase).toBe(phase)
      }
    })
  })

  const hackathonId = "11111111-1111-1111-1111-111111111111"
  const announcementId = "22222222-2222-2222-2222-222222222222"
  const itemId = "33333333-3333-3333-3333-333333333333"
  const baseUrl = `http://localhost/api/dashboard/hackathons/${hackathonId}`

  describe("GET /api/dashboard/hackathons/:id/announcements", () => {
    it("lists announcements for authenticated organizer", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockListAnnouncements.mockResolvedValue([
        { id: announcementId, hackathon_id: hackathonId, title: "Welcome", body: "Hello all", priority: "normal", published_at: null, created_at: "2026-04-02T00:00:00Z", updated_at: "2026-04-02T00:00:00Z" },
      ])

      const res = await app.handle(new Request(`${baseUrl}/announcements`))
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.announcements).toHaveLength(1)
      expect(data.announcements[0].title).toBe("Welcome")
    })

    it("rejects unauthenticated requests", async () => {
      mockResolvePrincipal.mockResolvedValue({ kind: "anon" })

      const res = await app.handle(new Request(`${baseUrl}/announcements`))
      const data = await res.json()

      expect(data.error).toBe("Unauthorized")
    })
  })

  describe("POST /api/dashboard/hackathons/:id/announcements", () => {
    it("creates an announcement", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      const created = { id: announcementId, hackathon_id: hackathonId, title: "Update", body: "New info", priority: "normal", published_at: null, created_at: "2026-04-02T00:00:00Z", updated_at: "2026-04-02T00:00:00Z" }
      mockCreateAnnouncement.mockResolvedValue(created)

      const res = await app.handle(
        new Request(`${baseUrl}/announcements`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Update", body: "New info" }),
        })
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.title).toBe("Update")
    })

    it("returns 400 when creation fails", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockCreateAnnouncement.mockResolvedValue(null)

      const res = await app.handle(
        new Request(`${baseUrl}/announcements`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Fail", body: "Test" }),
        })
      )
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.error).toBe("Failed to create announcement")
    })
  })

  describe("PATCH /api/dashboard/hackathons/:id/announcements/:announcementId", () => {
    it("updates an announcement", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockUpdateAnnouncement.mockResolvedValue({ id: announcementId, title: "Updated" })

      const res = await app.handle(
        new Request(`${baseUrl}/announcements/${announcementId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Updated" }),
        })
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.title).toBe("Updated")
    })

    it("returns 400 for invalid UUID", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)

      const res = await app.handle(
        new Request(`${baseUrl}/announcements/not-a-uuid`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Updated" }),
        })
      )
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.error).toBe("Invalid announcement ID")
    })
  })

  describe("DELETE /api/dashboard/hackathons/:id/announcements/:announcementId", () => {
    it("deletes an announcement", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockDeleteAnnouncement.mockResolvedValue(true)

      const res = await app.handle(
        new Request(`${baseUrl}/announcements/${announcementId}`, { method: "DELETE" })
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.success).toBe(true)
    })

    it("returns 400 for invalid UUID", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)

      const res = await app.handle(
        new Request(`${baseUrl}/announcements/bad-id`, { method: "DELETE" })
      )
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.error).toBe("Invalid announcement ID")
    })
  })

  describe("POST /api/dashboard/hackathons/:id/announcements/:announcementId/publish", () => {
    it("publishes an announcement", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockPublishAnnouncement.mockResolvedValue({ id: announcementId, published_at: "2026-04-02T10:00:00Z" })

      const res = await app.handle(
        new Request(`${baseUrl}/announcements/${announcementId}/publish`, { method: "POST" })
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.published_at).toBeTruthy()
    })

    it("returns 400 for invalid UUID", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)

      const res = await app.handle(
        new Request(`${baseUrl}/announcements/draft/publish`, { method: "POST" })
      )
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.error).toBe("Invalid announcement ID")
    })
  })

  describe("POST /api/dashboard/hackathons/:id/announcements/:announcementId/unpublish", () => {
    it("unpublishes an announcement", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockUnpublishAnnouncement.mockResolvedValue({ id: announcementId, published_at: null })

      const res = await app.handle(
        new Request(`${baseUrl}/announcements/${announcementId}/unpublish`, { method: "POST" })
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.published_at).toBeNull()
    })
  })

  describe("POST /api/dashboard/hackathons/:id/announcements/:announcementId/schedule", () => {
    it("schedules an announcement for the future", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      const futureDate = new Date(Date.now() + 3_600_000).toISOString()
      mockScheduleAnnouncement.mockResolvedValue({ id: announcementId, published_at: futureDate })

      const res = await app.handle(
        new Request(`${baseUrl}/announcements/${announcementId}/schedule`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scheduledAt: futureDate }),
        })
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.published_at).toBe(futureDate)
    })

    it("rejects past dates", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      const pastDate = new Date(Date.now() - 3_600_000).toISOString()

      const res = await app.handle(
        new Request(`${baseUrl}/announcements/${announcementId}/schedule`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scheduledAt: pastDate }),
        })
      )
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.error).toContain("future")
    })

    it("rejects invalid dates", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)

      const res = await app.handle(
        new Request(`${baseUrl}/announcements/${announcementId}/schedule`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scheduledAt: "not-a-date" }),
        })
      )
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.error).toContain("Invalid")
    })
  })

  describe("GET /api/dashboard/hackathons/:id/schedule", () => {
    it("lists schedule items", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockListScheduleItems.mockResolvedValue([
        { id: itemId, hackathon_id: hackathonId, title: "Opening", starts_at: "2026-04-28T09:00:00Z", ends_at: null, location: "Main Hall", sort_order: 0, created_at: "2026-04-02T00:00:00Z", updated_at: "2026-04-02T00:00:00Z" },
      ])

      const res = await app.handle(new Request(`${baseUrl}/schedule`))
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.scheduleItems).toHaveLength(1)
      expect(data.scheduleItems[0].title).toBe("Opening")
    })
  })

  describe("POST /api/dashboard/hackathons/:id/schedule", () => {
    it("creates a schedule item", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      const created = { id: itemId, hackathon_id: hackathonId, title: "Lunch", starts_at: "2026-04-28T12:00:00Z", ends_at: "2026-04-28T13:00:00Z", location: "Cafeteria", sort_order: 0 }
      mockCreateScheduleItem.mockResolvedValue(created)

      const res = await app.handle(
        new Request(`${baseUrl}/schedule`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Lunch", startsAt: "2026-04-28T12:00:00Z", endsAt: "2026-04-28T13:00:00Z", location: "Cafeteria" }),
        })
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.title).toBe("Lunch")
    })

    it("returns 400 when creation fails", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockCreateScheduleItem.mockResolvedValue(null)

      const res = await app.handle(
        new Request(`${baseUrl}/schedule`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Fail", startsAt: "2026-04-28T12:00:00Z" }),
        })
      )
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.error).toBe("Failed to create schedule item")
    })
  })

  describe("PATCH /api/dashboard/hackathons/:id/schedule/:itemId", () => {
    it("updates a schedule item", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockUpdateScheduleItem.mockResolvedValue({ id: itemId, title: "Updated Lunch" })

      const res = await app.handle(
        new Request(`${baseUrl}/schedule/${itemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Updated Lunch" }),
        })
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.title).toBe("Updated Lunch")
    })

    it("returns 400 for invalid UUID", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)

      const res = await app.handle(
        new Request(`${baseUrl}/schedule/not-a-uuid`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Updated" }),
        })
      )
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.error).toBe("Invalid schedule item ID")
    })
  })

  describe("DELETE /api/dashboard/hackathons/:id/schedule/:itemId", () => {
    it("deletes a schedule item", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockListScheduleItems.mockResolvedValue([{ id: itemId, trigger_type: null }])
      mockDeleteScheduleItem.mockResolvedValue(true)

      const res = await app.handle(
        new Request(`${baseUrl}/schedule/${itemId}`, { method: "DELETE" })
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.success).toBe(true)
    })

    it("returns 400 for invalid UUID", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)

      const res = await app.handle(
        new Request(`${baseUrl}/schedule/bad-id`, { method: "DELETE" })
      )
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.error).toBe("Invalid schedule item ID")
    })
  })
})
