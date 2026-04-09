import { describe, expect, it, mock, beforeEach } from "bun:test"

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

const mockFrom = mock(() => ({
  select: mock(() => ({ eq: mock(() => ({ eq: mock(() => ({ single: mock(() => Promise.resolve({ data: null, error: null })) })) })) })),
  update: mock(() => ({ eq: mock(() => ({ eq: mock(() => ({ select: mock(() => ({ single: mock(() => Promise.resolve({ data: { id: "team-1", name: "New Name" }, error: null })) })) })) })) })),
}))

mock.module("@/lib/db/client", () => ({
  supabase: () => ({ from: mockFrom }),
}))

const mockLogAudit = mock(() => Promise.resolve())

mock.module("@/lib/services/audit", () => ({
  logAudit: mockLogAudit,
}))

mock.module("@/lib/services/phases", () => ({
  getPhasesForStatus: () => [],
  getPhaseLabel: (phase: string) => phase,
  validatePhaseTransition: () => null,
  setPhase: mock(() => Promise.resolve({ success: true })),
  getPhase: mock(() => Promise.resolve("build")),
}))

mock.module("@/lib/services/hackathons", () => ({
  listTeamsWithMembers: mock(() => Promise.resolve([])),
  createTeamWithMembers: mock(() => Promise.resolve(null)),
  modifyTeamMembers: mock(() => Promise.resolve(null)),
  bulkAssignTeams: mock(() => Promise.resolve({ assigned: 0 })),
}))

mock.module("@/lib/services/rooms", () => ({
  listRooms: mock(() => Promise.resolve([])),
  createRoom: mock(() => Promise.resolve(null)),
  updateRoom: mock(() => Promise.resolve(null)),
  deleteRoom: mock(() => Promise.resolve(false)),
  addTeamToRoom: mock(() => Promise.resolve(false)),
  removeTeamFromRoom: mock(() => Promise.resolve(false)),
  togglePresented: mock(() => Promise.resolve(null)),
  setRoomTimer: mock(() => Promise.resolve(null)),
  clearRoomTimer: mock(() => Promise.resolve(null)),
  pauseRoomTimer: mock(() => Promise.resolve(null)),
  resumeRoomTimer: mock(() => Promise.resolve(null)),
}))

mock.module("@/lib/services/categories", () => ({
  listCategories: mock(() => Promise.resolve([])),
  createCategory: mock(() => Promise.resolve(null)),
  updateCategory: mock(() => Promise.resolve(null)),
  deleteCategory: mock(() => Promise.resolve(false)),
}))

mock.module("@/lib/services/announcements", () => ({
  ANNOUNCEMENT_AUDIENCES: ["everyone"],
  listAnnouncements: mock(() => Promise.resolve([])),
  createAnnouncement: mock(() => Promise.resolve(null)),
  updateAnnouncement: mock(() => Promise.resolve(null)),
  deleteAnnouncement: mock(() => Promise.resolve(false)),
  publishAnnouncement: mock(() => Promise.resolve(null)),
  unpublishAnnouncement: mock(() => Promise.resolve(null)),
  scheduleAnnouncement: mock(() => Promise.resolve(null)),
}))

mock.module("@/lib/services/schedule-items", () => ({
  listScheduleItems: mock(() => Promise.resolve([])),
  createScheduleItem: mock(() => Promise.resolve(null)),
  updateScheduleItem: mock(() => Promise.resolve(null)),
  deleteScheduleItem: mock(() => Promise.resolve(false)),
}))

mock.module("@/lib/services/judging-rounds", () => ({
  listRounds: mock(() => Promise.resolve([])),
  createRound: mock(() => Promise.resolve(null)),
  updateRound: mock(() => Promise.resolve(null)),
  deleteRound: mock(() => Promise.resolve(false)),
  activateRound: mock(() => Promise.resolve(null)),
}))

mock.module("@/lib/services/social-submissions", () => ({
  listSocialSubmissions: mock(() => Promise.resolve([])),
  reviewSocialSubmission: mock(() => Promise.resolve(null)),
}))

mock.module("@/lib/services/mentor-requests", () => ({
  listMentorQueue: mock(() => Promise.resolve([])),
}))

mock.module("@/lib/services/challenge", () => ({
  getChallenge: mock(() => Promise.resolve(null)),
  saveChallenge: mock(() => Promise.resolve(null)),
  releaseChallenge: mock(() => Promise.resolve(null)),
}))

mock.module("@/lib/services/event-dashboard", () => ({
  getLiveStats: mock(() => Promise.resolve({})),
}))

mock.module("@/lib/services/participant-emails", () => ({
  sendBulkEmail: mock(() => Promise.resolve({ sent: 0 })),
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

describe("PATCH /api/dashboard/hackathons/:id/teams/:teamId", () => {
  const hackathonId = "11111111-1111-1111-1111-111111111111"
  const teamId = "22222222-2222-2222-2222-222222222222"
  const url = `http://localhost/api/dashboard/hackathons/${hackathonId}/teams/${teamId}`

  beforeEach(() => {
    mockResolvePrincipal.mockReset()
    mockCheckHackathonOrganizer.mockReset()
    mockFrom.mockReset()
    mockLogAudit.mockReset()
    mockLogAudit.mockResolvedValue(undefined)
    mockCheckHackathonOrganizer.mockResolvedValue({
      status: "authorized" as const,
      hackathon: { id: hackathonId, tenant_id: "tenant-123" },
    })
  })

  it("rejects unauthenticated requests", async () => {
    mockResolvePrincipal.mockResolvedValue({ kind: "anon" })

    const res = await app.handle(
      new Request(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New Name" }),
      })
    )

    expect(res.status).toBe(401)
  })

  it("returns 400 for invalid team UUID", async () => {
    mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)

    const badUrl = `http://localhost/api/dashboard/hackathons/${hackathonId}/teams/not-a-uuid`
    const res = await app.handle(
      new Request(badUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New Name" }),
      })
    )
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.error).toBe("Invalid team ID")
  })

  it("allows organizer to rename team", async () => {
    mockResolvePrincipal.mockResolvedValue(mockUserPrincipal)

    mockFrom.mockReturnValue({
      update: mock(() => ({
        eq: mock(() => ({
          eq: mock(() => ({
            select: mock(() => ({
              single: mock(() => Promise.resolve({ data: { id: teamId, name: "New Name" }, error: null })),
            })),
          })),
        })),
      })),
    })

    const res = await app.handle(
      new Request(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New Name" }),
      })
    )
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.name).toBe("New Name")
  })

  it("allows captain to rename their team", async () => {
    const captainPrincipal = { ...mockUserPrincipal, userId: "captain-123" }
    mockResolvePrincipal.mockResolvedValue(captainPrincipal)
    mockCheckHackathonOrganizer.mockResolvedValue({
      status: "not_authorized" as const,
    })

    let callCount = 0
    mockFrom.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return {
          select: mock(() => ({
            eq: mock(() => ({
              eq: mock(() => ({
                single: mock(() => Promise.resolve({ data: { captain_clerk_user_id: "captain-123" }, error: null })),
              })),
            })),
          })),
        }
      }
      return {
        update: mock(() => ({
          eq: mock(() => ({
            eq: mock(() => ({
              select: mock(() => ({
                single: mock(() => Promise.resolve({ data: { id: teamId, name: "Captain Name" }, error: null })),
              })),
            })),
          })),
        })),
      }
    })

    const res = await app.handle(
      new Request(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Captain Name" }),
      })
    )
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.name).toBe("Captain Name")
  })

  it("rejects non-captain non-organizer with 403", async () => {
    mockResolvePrincipal.mockResolvedValue({ ...mockUserPrincipal, userId: "random-user" })
    mockCheckHackathonOrganizer.mockResolvedValue({
      status: "not_authorized" as const,
    })

    mockFrom.mockReturnValue({
      select: mock(() => ({
        eq: mock(() => ({
          eq: mock(() => ({
            single: mock(() => Promise.resolve({ data: { captain_clerk_user_id: "captain-123" }, error: null })),
          })),
        })),
      })),
    })

    const res = await app.handle(
      new Request(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Nope" }),
      })
    )
    const data = await res.json()

    expect(res.status).toBe(403)
    expect(data.error).toContain("captain")
  })
})
