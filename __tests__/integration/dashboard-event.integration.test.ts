import { describe, expect, it, mock, beforeEach } from "bun:test"
import {
  createChainableMock,
  resetClerkMocks,
  resetSupabaseMocks,
  setMockFromImplementation,
} from "../lib/supabase-mock"

const mockSetPhase = mock(() => Promise.resolve({ success: true }))

const mockListAnnouncements = mock(() => Promise.resolve([]))
const mockGetAnnouncementById = mock(() => Promise.resolve(null))
const mockCreateAnnouncement = mock(() => Promise.resolve(null))
const mockUpdateAnnouncement = mock(() => Promise.resolve(null))
const mockDeleteAnnouncement = mock(() => Promise.resolve(false))
const mockPublishAnnouncement = mock(() => Promise.resolve(null))
const mockUnpublishAnnouncement = mock(() => Promise.resolve(null))
const mockScheduleAnnouncement = mock(() => Promise.resolve(null))

mock.module("@/lib/services/announcements", () => ({
  ANNOUNCEMENT_AUDIENCES: ["everyone", "organizers", "judges", "mentors", "attendees", "submitted", "not_submitted"],
  listAnnouncements: mockListAnnouncements,
  getAnnouncementById: mockGetAnnouncementById,
  createAnnouncement: mockCreateAnnouncement,
  updateAnnouncement: mockUpdateAnnouncement,
  deleteAnnouncement: mockDeleteAnnouncement,
  publishAnnouncement: mockPublishAnnouncement,
  unpublishAnnouncement: mockUnpublishAnnouncement,
  scheduleAnnouncement: mockScheduleAnnouncement,
}))

const mockListScheduleItems = mock(() => Promise.resolve([]))
const mockGetScheduleItemById = mock(() => Promise.resolve(null))
const mockCreateScheduleItem = mock(() => Promise.resolve(null))
const mockUpdateScheduleItem = mock(() => Promise.resolve(null))
const mockDeleteScheduleItem = mock(() => Promise.resolve(false))
const mockGetTriggerItem = mock(() => Promise.resolve(null))

mock.module("@/lib/services/schedule-items", () => ({
  listScheduleItems: mockListScheduleItems,
  getScheduleItemById: mockGetScheduleItemById,
  createScheduleItem: mockCreateScheduleItem,
  updateScheduleItem: mockUpdateScheduleItem,
  deleteScheduleItem: mockDeleteScheduleItem,
  getTriggerItem: mockGetTriggerItem,
}))

const mockSendBulkEmail = mock(() => Promise.resolve({ sent: 0 }))

mock.module("@/lib/services/participant-emails", () => ({
  sendBulkEmail: mockSendBulkEmail,
}))

const mockGetQueueStats = mock(() =>
  Promise.resolve({ open: 0, claimed: 0, resolved: 0 }),
)

mock.module("@/lib/services/mentor-requests", () => ({
  getQueueStats: mockGetQueueStats,
}))

const mockListHackathonPeople = mock(() => Promise.resolve([] as unknown[]))
const mockPeopleToCsvRows = mock((people: unknown[]) => people as Record<string, string>[])

mock.module("@/lib/services/hackathon-people", () => ({
  listHackathonPeople: mockListHackathonPeople,
  peopleToCsvRows: mockPeopleToCsvRows,
}))

const mockMaybeReleaseChallengesForPublishLink = mock(() => Promise.resolve(false))
const mockCreateChallenge = mock(() => Promise.resolve(null))
const mockGetChallengeById = mock(() => Promise.resolve(null))

mock.module("@/lib/services/challenges", () => ({
  listChallenges: mock(() => Promise.resolve([])),
  getChallengeById: mockGetChallengeById,
  createChallenge: mockCreateChallenge,
  updateChallenge: mock(() => Promise.resolve(null)),
  deleteChallenge: mock(() => Promise.resolve(false)),
  reorderChallenges: mock(() => Promise.resolve(false)),
  releaseChallenges: mock(() => Promise.resolve(false)),
  maybeReleaseChallengesForPublishLink: mockMaybeReleaseChallengesForPublishLink,
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

const mockApprovePendingTeam = mock(() =>
  Promise.resolve({
    success: true as const,
    team: { id: "22222222-2222-2222-2222-222222222222", name: "Team One", status: "forming" },
    membersNotified: 2,
  })
)
const mockDenyPendingTeam = mock(() =>
  Promise.resolve({
    success: true as const,
    team: { id: "22222222-2222-2222-2222-222222222222", name: "Team One", status: "disbanded" },
    membersUnassigned: 2,
    invitesCancelled: 1,
    membersNotified: 2,
  })
)

mock.module("@/lib/services/hackathons", () => ({
  listTeamsWithMembers: mock(() => Promise.resolve([])),
  createTeamWithMembers: mock(() => Promise.resolve(null)),
  modifyTeamMembers: mock(() => Promise.resolve(null)),
  bulkAssignTeams: mock(() => Promise.resolve({ assigned: 0 })),
  deleteTeam: mock(() => Promise.resolve({ success: true, membersUnassigned: 0, invitesCancelled: 0, roomsCleared: 0 })),
  setTeamCaptain: mock(() => Promise.resolve({ success: true })),
  approvePendingTeam: mockApprovePendingTeam,
  denyPendingTeam: mockDenyPendingTeam,
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
    resetSupabaseMocks()
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
    mockGetScheduleItemById.mockReset()
    mockCreateScheduleItem.mockReset()
    mockUpdateScheduleItem.mockReset()
    mockDeleteScheduleItem.mockReset()
    mockGetTriggerItem.mockReset()
    mockMaybeReleaseChallengesForPublishLink.mockReset()
    mockCreateChallenge.mockReset()
    mockApprovePendingTeam.mockReset()
    mockDenyPendingTeam.mockReset()
    mockListHackathonPeople.mockReset()
    mockPeopleToCsvRows.mockReset()
    mockGetQueueStats.mockReset()
    mockListHackathonPeople.mockResolvedValue([])
    mockPeopleToCsvRows.mockImplementation((people: unknown) => people as Record<string, string>[])
    mockGetQueueStats.mockResolvedValue({ open: 0, claimed: 0, resolved: 0 })
    mockGetScheduleItemById.mockResolvedValue(null)

    mockSetPhase.mockResolvedValue({ success: true })
    mockCreateChallenge.mockResolvedValue(null)
    mockApprovePendingTeam.mockResolvedValue({
      success: true,
      team: { id: "22222222-2222-2222-2222-222222222222", name: "Team One", status: "forming" },
      membersNotified: 2,
    })
    mockDenyPendingTeam.mockResolvedValue({
      success: true,
      team: { id: "22222222-2222-2222-2222-222222222222", name: "Team One", status: "disbanded" },
      membersUnassigned: 2,
      invitesCancelled: 1,
      membersNotified: 2,
    })
    mockCheckHackathonOrganizer.mockResolvedValue({
      status: "authorized" as const,
      hackathon: {
        id: "h1",
        tenant_id: "tenant-123",
        status: "draft",
        updated_at: "2026-08-25T15:00:00.000Z",
      },
    })
  })

  describe("GET /api/dashboard/hackathons/:id/mentor-requests", () => {
    const url = "http://localhost/api/dashboard/hackathons/11111111-1111-1111-1111-111111111111/mentor-requests"

    it("returns aggregate mentor totals without request details", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockGetQueueStats.mockResolvedValue({ open: 2, claimed: 1, resolved: 4 })

      const res = await app.handle(new Request(url))
      const data = await res.json()
      const serialized = JSON.stringify(data)

      expect(res.status).toBe(200)
      expect(data).toEqual({ stats: { open: 2, claimed: 1, resolved: 4 } })
      expect(serialized).not.toContain("requests")
      expect(serialized).not.toContain("participant")
      expect(res.headers.get("Cache-Control")).toBe("private, no-store")
      expect(mockGetQueueStats).toHaveBeenCalledWith(
        "11111111-1111-1111-1111-111111111111",
      )
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

  describe("POST /api/dashboard/hackathons/:id/teams/:teamId/approve", () => {
    const teamId = "22222222-2222-2222-2222-222222222222"

    it("approves a waiting team for an organizer", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)

      const res = await app.handle(
        new Request(`${baseUrl}/teams/${teamId}/approve`, { method: "POST" })
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.team.status).toBe("forming")
      expect(data.membersNotified).toBe(2)
      expect(mockApprovePendingTeam).toHaveBeenCalledWith(teamId, hackathonId)
    })

    it("returns 409 when the team is not waiting", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockApprovePendingTeam.mockResolvedValueOnce({ error: "This team is not waiting for approval", code: "not_pending" })

      const res = await app.handle(
        new Request(`${baseUrl}/teams/${teamId}/approve`, { method: "POST" })
      )
      const data = await res.json()

      expect(res.status).toBe(409)
      expect(data.code).toBe("not_pending")
    })

    it("returns 404 when the team is missing", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockApprovePendingTeam.mockResolvedValueOnce({ error: "Team not found", code: "not_found" })

      const res = await app.handle(
        new Request(`${baseUrl}/teams/${teamId}/approve`, { method: "POST" })
      )
      const data = await res.json()

      expect(res.status).toBe(404)
      expect(data.code).toBe("not_found")
    })
  })

  describe("POST /api/dashboard/hackathons/:id/teams/:teamId/deny", () => {
    const teamId = "22222222-2222-2222-2222-222222222222"

    it("denies a waiting team for an organizer", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)

      const res = await app.handle(
        new Request(`${baseUrl}/teams/${teamId}/deny`, { method: "POST" })
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.membersUnassigned).toBe(2)
      expect(data.invitesCancelled).toBe(1)
      expect(data.membersNotified).toBe(2)
      expect(mockDenyPendingTeam).toHaveBeenCalledWith(teamId, hackathonId)
    })

    it("returns 409 when the team is not waiting", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockDenyPendingTeam.mockResolvedValueOnce({ error: "This team is not waiting for approval", code: "not_pending" })

      const res = await app.handle(
        new Request(`${baseUrl}/teams/${teamId}/deny`, { method: "POST" })
      )
      const data = await res.json()

      expect(res.status).toBe(409)
      expect(data.code).toBe("not_pending")
    })

    it("returns 404 when the team is missing", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockDenyPendingTeam.mockResolvedValueOnce({ error: "Team not found", code: "not_found" })

      const res = await app.handle(
        new Request(`${baseUrl}/teams/${teamId}/deny`, { method: "POST" })
      )
      const data = await res.json()

      expect(res.status).toBe(404)
      expect(data.code).toBe("not_found")
    })
  })

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

    it("uses the effective active status for a WebMCP announcement draft", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockCheckHackathonOrganizer.mockResolvedValue({
        status: "authorized" as const,
        hackathon: {
          id: hackathonId,
          tenant_id: "tenant-123",
          status: "published",
          starts_at: "2020-01-01T00:00:00.000Z",
          ends_at: "2099-01-01T00:00:00.000Z",
          updated_at: "2026-08-25T15:00:00.000Z",
        },
      })
      mockCreateAnnouncement.mockResolvedValue({
        id: announcementId,
        hackathon_id: hackathonId,
        title: "Update",
        body: "New info",
        priority: "normal",
        published_at: null,
      })

      const res = await app.handle(
        new Request(`${baseUrl}/announcements`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-webmcp-request": "1",
            "x-webmcp-expected-status": "active",
            "x-webmcp-event-version": "2026-08-25T15:00:00.000Z",
          },
          body: JSON.stringify({ title: "Update", body: "New info" }),
        }),
      )

      expect(res.status).toBe(200)
      expect(mockCreateAnnouncement).toHaveBeenCalledTimes(1)
    })

    it("rejects a stale WebMCP announcement after the event expires", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockCheckHackathonOrganizer.mockResolvedValue({
        status: "authorized" as const,
        hackathon: {
          id: hackathonId,
          tenant_id: "tenant-123",
          status: "published",
          starts_at: "2019-01-01T00:00:00.000Z",
          ends_at: "2020-01-01T00:00:00.000Z",
          updated_at: "2026-08-25T15:00:00.000Z",
        },
      })

      const res = await app.handle(
        new Request(`${baseUrl}/announcements`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-webmcp-request": "1",
            "x-webmcp-expected-status": "active",
            "x-webmcp-event-version": "2026-08-25T15:00:00.000Z",
          },
          body: JSON.stringify({ title: "Late update", body: "Too late" }),
        }),
      )

      expect(res.status).toBe(409)
      expect(await res.json()).toMatchObject({ code: "event_changed" })
      expect(mockCreateAnnouncement).not.toHaveBeenCalled()
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

    it("returns a stable conflict while another event mutation holds the lease", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      let rateLimitCall = 0
      setMockFromImplementation((table) => {
        if (table === "hackathons") {
          return createChainableMock({ data: { id: hackathonId }, error: null })
        }
        if (table !== "rate_limits") {
          return createChainableMock({ data: null, error: null })
        }
        rateLimitCall += 1
        return createChainableMock(
          rateLimitCall === 2
            ? { data: null, error: { message: "duplicate", code: "23505" } }
            : { data: null, error: null },
        )
      })

      const res = await app.handle(
        new Request(`${baseUrl}/announcements`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Busy", body: "Try later" }),
        }),
      )

      expect(res.status).toBe(409)
      expect(await res.json()).toEqual({
        error: "Another event change is still being saved.",
        code: "event_busy",
      })
      expect(mockCheckHackathonOrganizer).not.toHaveBeenCalled()
      expect(mockCreateAnnouncement).not.toHaveBeenCalled()
    })

    it("returns a stable retryable failure when the event lease is unavailable", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      setMockFromImplementation((table) =>
        table === "hackathons"
          ? createChainableMock({ data: { id: hackathonId }, error: null })
          : createChainableMock({
              data: null,
              error: { message: "database unavailable" },
            }),
      )

      const res = await app.handle(
        new Request(`${baseUrl}/announcements`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Retry", body: "Try later" }),
        }),
      )

      expect(res.status).toBe(503)
      expect(await res.json()).toEqual({
        error: "The event change lock is unavailable.",
        code: "lease_unavailable",
      })
      expect(mockCreateAnnouncement).not.toHaveBeenCalled()
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

    it("lets WebMCP add an ordinary item before completion", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockCheckHackathonOrganizer.mockResolvedValue({
        status: "authorized" as const,
        hackathon: {
          id: hackathonId,
          tenant_id: "tenant-123",
          status: "published",
          starts_at: "2020-01-01T00:00:00.000Z",
          ends_at: "2099-01-01T00:00:00.000Z",
          updated_at: "2026-08-25T15:00:00.000Z",
        },
      })
      mockCreateScheduleItem.mockResolvedValue({
        id: itemId,
        title: "Lunch",
      })

      const res = await app.handle(
        new Request(`${baseUrl}/schedule`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-webmcp-request": "1",
            "x-webmcp-expected-status": "active",
            "x-webmcp-event-version": "2026-08-25T15:00:00.000Z",
          },
          body: JSON.stringify({
            title: "Lunch",
            startsAt: "2026-09-10T19:00:00.000Z",
          }),
        }),
      )

      expect(res.status).toBe(200)
      expect(mockCreateScheduleItem).toHaveBeenCalledTimes(1)
    })

    it("returns the original schedule item when WebMCP retries the same request", async () => {
      const receiptId = "44444444-4444-4444-8444-444444444444"
      const existing = {
        id: receiptId,
        hackathon_id: hackathonId,
        title: "Lunch",
        starts_at: "2026-09-10T19:00:00.000Z",
      }
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockGetScheduleItemById.mockResolvedValue(existing)

      const res = await app.handle(
        new Request(`${baseUrl}/schedule`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-webmcp-request": "1",
            "x-webmcp-expected-status": "draft",
            "x-webmcp-event-version": "2026-08-25T15:00:00.000Z",
            "x-webmcp-idempotency-key": receiptId,
          },
          body: JSON.stringify({
            title: "Lunch",
            startsAt: "2026-09-10T19:00:00.000Z",
          }),
        }),
      )

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual(existing)
      expect(mockGetScheduleItemById).toHaveBeenCalledWith(receiptId, hackathonId)
      expect(mockCreateScheduleItem).not.toHaveBeenCalled()
    })

    it("rejects an expired WebMCP schedule write before creating it", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockCheckHackathonOrganizer.mockResolvedValue({
        status: "authorized" as const,
        hackathon: {
          id: hackathonId,
          tenant_id: "tenant-123",
          status: "published",
          starts_at: "2019-01-01T00:00:00.000Z",
          ends_at: "2020-01-01T00:00:00.000Z",
          updated_at: "2026-08-25T15:00:00.000Z",
        },
      })

      const res = await app.handle(
        new Request(`${baseUrl}/schedule`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-webmcp-request": "1",
            "x-webmcp-expected-status": "active",
            "x-webmcp-event-version": "2026-08-25T15:00:00.000Z",
          },
          body: JSON.stringify({
            title: "Late item",
            startsAt: "2026-09-10T19:00:00.000Z",
          }),
        }),
      )

      expect(res.status).toBe(409)
      expect(await res.json()).toMatchObject({ code: "event_changed" })
      expect(mockCreateScheduleItem).not.toHaveBeenCalled()
    })

    it("keeps WebMCP from adding a schedule trigger", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)

      const res = await app.handle(
        new Request(`${baseUrl}/schedule`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-webmcp-request": "1",
            "x-webmcp-expected-status": "draft",
            "x-webmcp-event-version": "2026-08-25T15:00:00.000Z",
          },
          body: JSON.stringify({
            title: "Release",
            startsAt: "2026-09-10T19:00:00.000Z",
            triggerType: "challenge_release",
          }),
        }),
      )

      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ code: "invalid_request" })
      expect(mockCreateScheduleItem).not.toHaveBeenCalled()
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

    it("accepts event_publish on the challenge_release trigger item", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockGetTriggerItem.mockResolvedValue({ id: itemId, trigger_type: "challenge_release" })
      mockUpdateScheduleItem.mockResolvedValue({ id: itemId, trigger_type: "challenge_release", linked_to: "event_publish" })

      const res = await app.handle(
        new Request(`${baseUrl}/schedule/${itemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ linkedTo: "event_publish" }),
        })
      )

      expect(res.status).toBe(200)
      expect(mockGetTriggerItem).toHaveBeenCalledWith(hackathonId, "challenge_release")
      expect(mockUpdateScheduleItem).toHaveBeenCalled()
    })

    it("rejects event_publish on a non-challenge_release item", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockGetTriggerItem.mockResolvedValue({ id: "different-trigger-id", trigger_type: "challenge_release" })

      const res = await app.handle(
        new Request(`${baseUrl}/schedule/${itemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ linkedTo: "event_publish" }),
        })
      )
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.error).toBe("event_publish link is only valid on challenge_release items")
      expect(mockUpdateScheduleItem).not.toHaveBeenCalled()
    })

    it("rejects event_publish when no challenge_release trigger item exists", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockGetTriggerItem.mockResolvedValue(null)

      const res = await app.handle(
        new Request(`${baseUrl}/schedule/${itemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ linkedTo: "event_publish" }),
        })
      )
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.error).toBe("event_publish link is only valid on challenge_release items")
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

  describe("POST /api/dashboard/hackathons/:id/challenges", () => {
    it("fires maybeReleaseChallengesForPublishLink after a successful create", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockCreateChallenge.mockResolvedValueOnce({
        id: "c1",
        hackathonId,
        title: "Build something",
        description: null,
        resources: [],
        sortOrder: 0,
        createdAt: "2026-04-28T00:00:00Z",
        updatedAt: "2026-04-28T00:00:00Z",
      })

      const res = await app.handle(
        new Request(`${baseUrl}/challenges`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Build something" }),
        })
      )

      expect(res.status).toBe(200)
      expect(mockMaybeReleaseChallengesForPublishLink).toHaveBeenCalledWith(hackathonId, "tenant-123")
    })

    it("rejects a stale WebMCP challenge before creating it", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockCheckHackathonOrganizer.mockResolvedValue({
        status: "authorized" as const,
        hackathon: {
          id: hackathonId,
          tenant_id: "tenant-123",
          status: "published",
          starts_at: "2019-01-01T00:00:00.000Z",
          ends_at: "2020-01-01T00:00:00.000Z",
          updated_at: "2026-08-25T16:00:00.000Z",
        },
      })

      const res = await app.handle(
        new Request(`${baseUrl}/challenges`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-webmcp-request": "1",
            "x-webmcp-expected-status": "active",
            "x-webmcp-event-version": "2026-08-25T15:00:00.000Z",
          },
          body: JSON.stringify({ title: "Blocked" }),
        }),
      )
      expect(res.status).toBe(409)
      expect(await res.json()).toMatchObject({ code: "event_changed" })
      expect(mockCreateChallenge).not.toHaveBeenCalled()
    })
  })

  describe("POST /api/dashboard/hackathons/:id/email-blast", () => {
    const blastUrl = `${baseUrl}/email-blast`

    function postBlast(idempotencyKey?: string) {
      return app.handle(
        new Request(blastUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
          },
          body: JSON.stringify({ subject: "Hi", html: "<p>Hi</p>" }),
        })
      )
    }

    it("blocks email blast when hackathon is in draft", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockCheckHackathonOrganizer.mockResolvedValue({
        status: "ok" as const,
        hackathon: { id: hackathonId, tenant_id: "tenant-123", status: "draft" },
      })
      mockSendBulkEmail.mockClear()

      const res = await postBlast()
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.code).toBe("hackathon_draft")
      expect(mockSendBulkEmail).not.toHaveBeenCalled()
    })

    it("sends email blast when hackathon is active", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockCheckHackathonOrganizer.mockResolvedValue({
        status: "ok" as const,
        hackathon: { id: hackathonId, tenant_id: "tenant-123", status: "active" },
      })
      mockSendBulkEmail.mockClear()
      mockSendBulkEmail.mockResolvedValueOnce({ sent: 5 })

      const res = await postBlast("send-blast-1")
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.sent).toBe(5)
      expect(mockSendBulkEmail).toHaveBeenCalledTimes(1)
      expect(mockSendBulkEmail).toHaveBeenCalledWith(
        hackathonId,
        expect.objectContaining({ deliveryId: expect.stringMatching(/^[a-f0-9]{24}$/) }),
      )
    })

    it("rejects an invalid blast idempotency key", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockCheckHackathonOrganizer.mockResolvedValue({
        status: "ok" as const,
        hackathon: { id: hackathonId, tenant_id: "tenant-123", status: "active" },
      })
      mockSendBulkEmail.mockClear()

      const res = await app.handle(new Request(blastUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": " ",
        },
        body: JSON.stringify({ subject: "Hi", html: "<p>Hi</p>" }),
      }))

      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ code: "invalid_idempotency_key" })
      expect(mockSendBulkEmail).not.toHaveBeenCalled()
    })

    it("blocks email blast after an event has effectively ended", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockCheckHackathonOrganizer.mockResolvedValue({
        status: "ok" as const,
        hackathon: {
          id: hackathonId,
          tenant_id: "tenant-123",
          status: "active",
          starts_at: "2020-01-01T00:00:00.000Z",
          ends_at: "2020-01-02T00:00:00.000Z",
        },
      })
      mockSendBulkEmail.mockClear()

      const res = await postBlast()

      expect(res.status).toBe(409)
      expect(await res.json()).toMatchObject({ code: "hackathon_ended" })
      expect(mockSendBulkEmail).not.toHaveBeenCalled()
    })

    it("returns 404 when hackathon not found", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockCheckHackathonOrganizer.mockResolvedValue({ status: "not_found" as const })
      mockSendBulkEmail.mockClear()

      const res = await postBlast()
      expect(res.status).toBe(404)
      expect(mockSendBulkEmail).not.toHaveBeenCalled()
    })

    it("returns 403 when tenant does not match", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockCheckHackathonOrganizer.mockResolvedValue({ status: "not_authorized" as const })
      mockSendBulkEmail.mockClear()

      const res = await postBlast()
      expect(res.status).toBe(403)
      expect(mockSendBulkEmail).not.toHaveBeenCalled()
    })
  })

  describe("GET /api/dashboard/hackathons/:id/people", () => {
    const url = `${baseUrl}/people`

    it("rejects unauthenticated requests", async () => {
      mockResolvePrincipal.mockResolvedValue({ kind: "anon" })

      const res = await app.handle(new Request(url))
      const data = await res.json()

      expect(res.status).toBeGreaterThanOrEqual(400)
      expect(data.error).toBe("Unauthorized")
    })

    it("returns 403 when caller is not the organizer", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockCheckHackathonOrganizer.mockResolvedValue({ status: "not_authorized" as const })

      const res = await app.handle(new Request(url))
      expect(res.status).toBe(403)
    })

    it("returns the people roster as JSON for an organizer", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockListHackathonPeople.mockResolvedValueOnce([
        {
          id: "p1",
          name: "Ada",
          email: "ada@example.com",
          role: "participant",
          status: "accepted",
          teamId: null,
          teamName: null,
          isCaptain: false,
          joinedOrInvitedAt: "2026-05-01T00:00:00Z",
          remindedAt: null,
        },
      ])

      const res = await app.handle(new Request(url))
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.people).toHaveLength(1)
      expect(data.people[0].email).toBe("ada@example.com")
      expect(mockListHackathonPeople).toHaveBeenCalledWith(hackathonId)
    })
  })

  describe("PATCH /api/dashboard/hackathons/:id/participants/:participantId", () => {
    it("rejects a role and team change in one request before either can commit", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      const participantId = "33333333-3333-4333-8333-333333333333"

      const res = await app.handle(new Request(`${baseUrl}/participants/${participantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "judge", teamId: "22222222-2222-4222-8222-222222222222" }),
      }))

      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: "Change the role and team separately" })
    })
  })

  describe("GET /api/dashboard/hackathons/:id/people.csv", () => {
    const url = `${baseUrl}/people.csv`

    it("rejects unauthenticated requests", async () => {
      mockResolvePrincipal.mockResolvedValue({ kind: "anon" })

      const res = await app.handle(new Request(url))
      expect(res.status).toBeGreaterThanOrEqual(400)
    })

    it("returns 403 when caller is not the organizer", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockCheckHackathonOrganizer.mockResolvedValue({ status: "not_authorized" as const })

      const res = await app.handle(new Request(url))
      expect(res.status).toBe(403)
    })

    it("returns 404 when the hackathon is not found", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockCheckHackathonOrganizer.mockResolvedValue({ status: "not_found" as const })

      const res = await app.handle(new Request(url))
      expect(res.status).toBe(404)
    })

    it("returns text/csv with a download header for an organizer", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockCheckHackathonOrganizer.mockResolvedValue({
        status: "ok" as const,
        hackathon: { id: hackathonId, tenant_id: "tenant-123", slug: "test-event" },
      })
      mockListHackathonPeople.mockResolvedValueOnce([
        {
          id: "p1",
          name: "Ada",
          email: "ada@example.com",
          role: "participant",
          status: "accepted",
          teamId: null,
          teamName: null,
          isCaptain: false,
          joinedOrInvitedAt: "2026-05-01T00:00:00Z",
          remindedAt: null,
        },
      ])
      mockPeopleToCsvRows.mockImplementationOnce((people: unknown) =>
        (people as { email: string }[]).map((p) => ({
          Name: "Ada",
          Email: p.email,
          Role: "Attendee",
          Status: "Accepted",
          Team: "",
          Captain: "No",
          "Joined or invited at": "2026-05-01T00:00:00Z",
        }))
      )

      const res = await app.handle(new Request(url))

      expect(res.status).toBe(200)
      expect(res.headers.get("content-type")).toContain("text/csv")
      const disposition = res.headers.get("content-disposition") ?? ""
      expect(disposition).toContain("attachment")
      expect(disposition).toContain("test-event-people-")
      const body = await res.text()
      expect(body.split("\r\n")[0]).toBe("Name,Email,Role,Status,Team,Captain,Joined or invited at")
      expect(body).toContain("ada@example.com")
    })

    it("uses a client-supplied date in the filename when provided", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockCheckHackathonOrganizer.mockResolvedValue({
        status: "ok" as const,
        hackathon: { id: hackathonId, tenant_id: "tenant-123", slug: "test-event" },
      })

      const res = await app.handle(new Request(`${url}?date=2026-01-15`))
      const disposition = res.headers.get("content-disposition") ?? ""
      expect(disposition).toContain("test-event-people-2026-01-15.csv")
    })

    it("ignores a malformed date query param and falls back to UTC today", async () => {
      mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)
      mockCheckHackathonOrganizer.mockResolvedValue({
        status: "ok" as const,
        hackathon: { id: hackathonId, tenant_id: "tenant-123", slug: "test-event" },
      })

      const res = await app.handle(new Request(`${url}?date=not-a-date`))
      const disposition = res.headers.get("content-disposition") ?? ""
      expect(disposition).toMatch(/test-event-people-\d{4}-\d{2}-\d{2}\.csv/)
      expect(disposition).not.toContain("not-a-date")
    })
  })
})
