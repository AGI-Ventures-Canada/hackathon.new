import { describe, expect, it, mock, beforeEach } from "bun:test"

const mockGetPublicHackathon = mock(() => Promise.resolve(null))
const mockBuildPollPayload = mock(() => Promise.resolve(null))
const mockResolvePrincipal = mock(() => Promise.resolve({ kind: "anon" }))
const mockGetParticipantWithTeam = mock(() => Promise.resolve(null))
const mockListPerks = mock(() => Promise.resolve([]))
const mockIsPerkReleased = mock(() => true)
const mockSubmitSocialUrl = mock(() => Promise.resolve(null))

class MockAuthError extends Error {
  constructor(
    message: string,
    public statusCode: number = 401
  ) {
    super(message)
    this.name = "AuthError"
  }
}

mock.module("@/lib/services/public-hackathons", () => ({
  getPublicHackathon: mockGetPublicHackathon,
}))

mock.module("@/lib/services/polling", () => ({
  buildPollPayload: mockBuildPollPayload,
}))

mock.module("@/lib/services/announcements", () => ({
  listPublishedAnnouncements: mock(() => Promise.resolve([])),
}))

mock.module("@/lib/services/schedule-items", () => ({
  listScheduleItems: mock(() => Promise.resolve([])),
}))

mock.module("@/lib/auth/principal", () => ({
  resolvePrincipal: mockResolvePrincipal,
  AuthError: MockAuthError,
}))

mock.module("@/lib/services/submissions", () => ({
  getParticipantWithTeam: mockGetParticipantWithTeam,
}))

mock.module("@/lib/services/social-submissions", () => ({
  submitSocialUrl: mockSubmitSocialUrl,
}))

mock.module("@/lib/services/perks", () => ({
  listPerks: mockListPerks,
  isPerkReleased: mockIsPerkReleased,
}))

const { Elysia } = await import("elysia")
const { publicEventRoutes } = await import("@/lib/api/routes/public-event")
const { handleRouteError } = await import("@/lib/api/routes/errors")

const app = new Elysia({ prefix: "/api" })
  .onError(({ error, set, path }) => handleRouteError(error, set, path))
  .use(publicEventRoutes)

const mockHackathon = {
  id: "11111111-1111-1111-1111-111111111111",
  slug: "build-os26",
  name: "Build OS26",
  status: "active",
}

const mockPollPayload = {
  ts: Date.now(),
  phase: "build",
  status: "active",
  timers: {
    global: { endsAt: "2026-04-28T17:00:00Z", label: "Build ends" },
    rooms: [],
  },
  challenge: {
    released: true,
    releasedAt: "2026-04-28T10:00:00Z",
    title: "Build an AI tool",
  },
  stats: {
    submissionCount: 5,
    teamCount: 10,
    judgingComplete: 0,
    judgingTotal: 0,
    mentorQueueOpen: 2,
  },
}

describe("Public Event Routes Integration Tests", () => {
  beforeEach(() => {
    mockGetPublicHackathon.mockReset()
    mockBuildPollPayload.mockReset()
    mockResolvePrincipal.mockReset()
    mockGetParticipantWithTeam.mockReset()
    mockListPerks.mockReset()
    mockIsPerkReleased.mockReset()
    mockSubmitSocialUrl.mockReset()
    mockResolvePrincipal.mockResolvedValue({ kind: "anon" })
    mockGetParticipantWithTeam.mockResolvedValue(null)
    mockListPerks.mockResolvedValue([])
    mockIsPerkReleased.mockReturnValue(true)
    mockSubmitSocialUrl.mockResolvedValue(null)
  })

  describe("GET /api/public/hackathons/:slug/poll", () => {
    const url = "http://localhost/api/public/hackathons/build-os26/poll"

    it("returns poll payload for a valid hackathon", async () => {
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockBuildPollPayload.mockResolvedValue(mockPollPayload)

      const res = await app.handle(new Request(url))
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.phase).toBe("build")
      expect(data.status).toBe("active")
      expect(data.timers.global.endsAt).toBe("2026-04-28T17:00:00Z")
      expect(data.stats.submissionCount).toBe(5)
    })

    it("returns 404 when hackathon not found", async () => {
      mockGetPublicHackathon.mockResolvedValue(null)

      const res = await app.handle(new Request(url))
      const data = await res.json()

      expect(res.status).toBe(404)
      expect(data.error).toBe("Hackathon not found")
    })

    it("returns 500 when poll payload build fails", async () => {
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockBuildPollPayload.mockResolvedValue(null)

      const res = await app.handle(new Request(url))
      const data = await res.json()

      expect(res.status).toBe(500)
      expect(data.error).toBe("Failed to build poll payload")
    })

    it("sets cache control headers", async () => {
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockBuildPollPayload.mockResolvedValue(mockPollPayload)

      const res = await app.handle(new Request(url))

      expect(res.headers.get("Cache-Control")).toBe(
        "public, max-age=2, stale-while-revalidate=5"
      )
    })

    it("passes hackathon id to buildPollPayload", async () => {
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockBuildPollPayload.mockResolvedValue(mockPollPayload)

      await app.handle(new Request(url))

      expect(mockBuildPollPayload).toHaveBeenCalledWith(
        "11111111-1111-1111-1111-111111111111"
      )
    })
  })

  describe("POST /api/public/hackathons/:slug/social-submit", () => {
    const url = "http://localhost/api/public/hackathons/build-os26/social-submit"

    it("submits a social URL for approved team members", async () => {
      const submission = { id: "social_1", url: "https://example.com/post" }
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockResolvePrincipal.mockResolvedValue({ kind: "user", userId: "user_1" })
      mockGetParticipantWithTeam.mockResolvedValue({
        participantId: "participant_1",
        teamId: "team_1",
        teamStatus: "forming",
      })
      mockSubmitSocialUrl.mockResolvedValue(submission)

      const res = await app.handle(new Request(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://example.com/post" }),
      }))
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data).toEqual(submission)
      expect(mockSubmitSocialUrl).toHaveBeenCalledWith(
        mockHackathon.id,
        "participant_1",
        "team_1",
        "https://example.com/post"
      )
    })

    it("blocks social URLs for teams waiting for approval", async () => {
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockResolvePrincipal.mockResolvedValue({ kind: "user", userId: "user_1" })
      mockGetParticipantWithTeam.mockResolvedValue({
        participantId: "participant_1",
        teamId: "team_1",
        teamStatus: "pending_approval",
      })

      const res = await app.handle(new Request(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://example.com/post" }),
      }))
      const data = await res.json()

      expect(res.status).toBe(409)
      expect(data.code).toBe("team_pending_approval")
      expect(mockSubmitSocialUrl).not.toHaveBeenCalled()
    })
  })

  describe("GET /api/public/hackathons/:slug/perks", () => {
    const url = "http://localhost/api/public/hackathons/build-os26/perks"

    it("returns released perks for approved team members", async () => {
      const perk = { id: "perk_1", title: "Credits" }
      mockGetPublicHackathon.mockResolvedValue({ ...mockHackathon, starts_at: "2026-04-28T10:00:00Z" })
      mockResolvePrincipal.mockResolvedValue({ kind: "user", userId: "user_1" })
      mockGetParticipantWithTeam.mockResolvedValue({
        participantId: "participant_1",
        teamId: "team_1",
        teamStatus: "forming",
      })
      mockListPerks.mockResolvedValue([perk])

      const res = await app.handle(new Request(url))
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.perks).toEqual([perk])
    })

    it("blocks perks for teams waiting for approval", async () => {
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockResolvePrincipal.mockResolvedValue({ kind: "user", userId: "user_1" })
      mockGetParticipantWithTeam.mockResolvedValue({
        participantId: "participant_1",
        teamId: "team_1",
        teamStatus: "pending_approval",
      })

      const res = await app.handle(new Request(url))
      const data = await res.json()

      expect(res.status).toBe(409)
      expect(data.code).toBe("team_pending_approval")
      expect(mockListPerks).not.toHaveBeenCalled()
    })
  })
})
