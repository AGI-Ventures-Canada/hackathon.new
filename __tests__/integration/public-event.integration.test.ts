import { describe, expect, it, mock, beforeEach } from "bun:test"

type MockAnnouncement = {
  id: string
  hackathon_id: string
  title: string
  body: string
  priority: "normal" | "urgent"
  audience: string
  published_at: string
  created_at: string
  updated_at: string
}

type MockMentorQueueItem = {
  id: string
  hackathon_id: string
  team_id: string | null
  requester_participant_id: string
  category: string | null
  description: string | null
  status: string
  claimed_by_participant_id: string | null
  claimed_at: string | null
  resolved_at: string | null
  created_at: string
  team_name: string | null
  requester_name: string | null
  mentor_name: string | null
}

const mockGetPublicHackathon = mock(() => Promise.resolve(null))
const mockBuildPollPayload = mock(() => Promise.resolve(null))
const mockResolvePrincipal = mock(() => Promise.resolve({ kind: "anon" }))
const mockGetParticipantWithTeam = mock(() => Promise.resolve(null))
const mockListPerks = mock(() => Promise.resolve([]))
const mockIsPerkReleased = mock(() => true)
const mockSubmitSocialUrl = mock(() => Promise.resolve(null))
const mockCreateMentorRequest = mock(() => Promise.resolve(null))
const mockGetActiveMentorRequest = mock(() => Promise.resolve(null))
const mockGetQueueStats = mock(() => Promise.resolve({ open: 0, claimed: 0, resolved: 0 }))
const mockListMentorQueue = mock(() => Promise.resolve([] as MockMentorQueueItem[]))
const mockGetMentorParticipantId = mock(() => Promise.resolve(null))
const mockClaimRequest = mock(() => Promise.resolve({ success: true }))
const mockResolveRequest = mock(() => Promise.resolve({ success: true }))
const mockGetRegistrationInfo = mock(() =>
  Promise.resolve({ participantRole: null, participantId: null, isRegistered: false, participantCount: 0 })
)
const mockGetSubmissionForParticipant = mock(() =>
  Promise.resolve(null as { id: string; status: string } | null)
)
const mockListPublishedAnnouncements = mock(() => Promise.resolve([] as MockAnnouncement[]))
const mockGetWinnerPageData = mock(() => Promise.resolve([]))

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
  listPublishedAnnouncements: mockListPublishedAnnouncements,
  filterAnnouncementsForViewer: (
    announcements: { audience: string }[],
    viewer: { role: string; hasSubmitted?: boolean },
  ) => announcements.filter((announcement) =>
    announcement.audience === "everyone" ||
    announcement.audience === `${viewer.role}s` ||
    (viewer.role === "participant" && announcement.audience === "attendees") ||
    (viewer.role === "participant" && viewer.hasSubmitted === true && announcement.audience === "submitted") ||
    (viewer.role === "participant" && viewer.hasSubmitted === false && announcement.audience === "not_submitted"),
  ),
}))

mock.module("@/lib/services/winner-pages", () => ({
  getWinnerPageData: mockGetWinnerPageData,
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
  getSubmissionForParticipant: mockGetSubmissionForParticipant,
  isSubmissionWindowOpen: mock(() => Promise.resolve(true)),
}))

mock.module("@/lib/services/social-submissions", () => ({
  submitSocialUrl: mockSubmitSocialUrl,
}))

mock.module("@/lib/services/mentor-requests", () => ({
  createMentorRequest: mockCreateMentorRequest,
  getActiveMentorRequest: mockGetActiveMentorRequest,
  listMentorQueue: mockListMentorQueue,
  getQueueStats: mockGetQueueStats,
  getMentorParticipantId: mockGetMentorParticipantId,
  claimRequest: mockClaimRequest,
  resolveRequest: mockResolveRequest,
  MENTOR_REQUEST_CATEGORY_MAX_LENGTH: 80,
  MENTOR_REQUEST_DESCRIPTION_MAX_LENGTH: 2_000,
}))

mock.module("@/lib/services/hackathons", () => ({
  getRegistrationInfo: mockGetRegistrationInfo,
}))

mock.module("@/lib/services/perks", () => ({
  listPerks: mockListPerks,
  isPerkReleased: mockIsPerkReleased,
}))

mock.module("@/lib/services/rate-limit", () => ({
  checkRateLimit: mock(() => Promise.resolve({ allowed: true, remaining: 9, resetAt: Date.now() + 60_000 })),
  getRateLimitHeaders: () => ({}),
  defaultRateLimits: { "api_key:default": { maxRequests: 100, windowMs: 60_000 } },
  RateLimitError: class extends Error {
    constructor(public resetAt: number, public remaining: number) {
      super("Rate limit exceeded")
    }
  },
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
  results_published_at: "2026-08-25T16:00:00Z",
  organizer: {
    id: "88888888-8888-8888-8888-888888888888",
    clerk_org_id: "org_owner",
    clerk_user_id: null,
  },
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
    mockCreateMentorRequest.mockReset()
    mockGetActiveMentorRequest.mockReset()
    mockGetQueueStats.mockReset()
    mockListMentorQueue.mockReset()
    mockGetMentorParticipantId.mockReset()
    mockGetRegistrationInfo.mockReset()
    mockGetSubmissionForParticipant.mockReset()
    mockListPublishedAnnouncements.mockReset()
    mockGetWinnerPageData.mockReset()
    mockClaimRequest.mockReset()
    mockResolveRequest.mockReset()
    mockResolvePrincipal.mockResolvedValue({ kind: "anon" })
    mockGetParticipantWithTeam.mockResolvedValue(null)
    mockListPerks.mockResolvedValue([])
    mockIsPerkReleased.mockReturnValue(true)
    mockSubmitSocialUrl.mockResolvedValue(null)
    mockCreateMentorRequest.mockResolvedValue({ success: false, code: "db_error", error: "Failed" })
    mockGetActiveMentorRequest.mockResolvedValue(null)
    mockGetQueueStats.mockResolvedValue({ open: 0, claimed: 0, resolved: 0 })
    mockListMentorQueue.mockResolvedValue([])
    mockGetMentorParticipantId.mockResolvedValue(null)
    mockGetRegistrationInfo.mockResolvedValue({ participantRole: null, participantId: null, isRegistered: false, participantCount: 0 })
    mockGetSubmissionForParticipant.mockResolvedValue(null)
    mockListPublishedAnnouncements.mockResolvedValue([])
    mockGetWinnerPageData.mockResolvedValue([])
    mockClaimRequest.mockResolvedValue({ success: true })
    mockResolveRequest.mockResolvedValue({ success: true })
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
      expect(mockGetPublicHackathon).toHaveBeenCalledWith("build-os26")
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

  describe("GET /api/public/hackathons/:slug/winners", () => {
    const url = "http://localhost/api/public/hackathons/build-os26/winners"

    it("returns winners only after results are published", async () => {
      const winner = {
        prizeId: "prize-1",
        prizeName: "Best Overall",
        prizeDescription: null,
        prizeValue: "$500",
        submissionId: "submission-1",
        submissionTitle: "Project Atlas",
        teamName: "Team Atlas",
        rank: 1,
      }
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockGetWinnerPageData.mockResolvedValue([winner])

      const res = await app.handle(new Request(url))

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ winners: [winner] })
      expect(mockGetWinnerPageData).toHaveBeenCalledWith(mockHackathon.id)
    })

    it("does not query or serialize assigned winners before publication", async () => {
      mockGetPublicHackathon.mockResolvedValue({
        ...mockHackathon,
        results_published_at: null,
      })
      mockGetWinnerPageData.mockResolvedValue([{
        prizeName: "Private winner",
        submissionTitle: "Do not reveal",
      }])

      const res = await app.handle(new Request(url))
      const data = await res.json()

      expect(res.status).toBe(404)
      expect(data.error).toBe("Results not yet published")
      expect(JSON.stringify(data)).not.toContain("Do not reveal")
      expect(mockGetWinnerPageData).not.toHaveBeenCalled()
    })

    it("redacts team names after anonymous results are published", async () => {
      mockGetPublicHackathon.mockResolvedValue({
        ...mockHackathon,
        anonymous_judging: true,
      })
      mockGetWinnerPageData.mockResolvedValue([{
        prizeId: "prize-1",
        prizeName: "Best Overall",
        prizeDescription: null,
        prizeValue: "$500",
        submissionId: "submission-1",
        submissionTitle: "Private Project",
        teamName: "Private Team",
        rank: 1,
      }])

      const res = await app.handle(new Request(url))
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.winners[0].teamName).toBeNull()
      expect(JSON.stringify(data)).not.toContain("Private Team")
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

  describe("GET /api/public/hackathons/:slug/announcements", () => {
    const url = "http://localhost/api/public/hackathons/build-os26/announcements"
    const announcement = (audience: string): MockAnnouncement => ({
      id: `id-${audience}`,
      hackathon_id: mockHackathon.id,
      title: `${audience} update`,
      body: `${audience} private body`,
      priority: "normal",
      audience,
      published_at: "2026-08-25T15:00:00Z",
      created_at: "2026-08-25T15:00:00Z",
      updated_at: "2026-08-25T15:00:00Z",
    })

    it("returns only public-safe announcements to signed-out viewers", async () => {
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockListPublishedAnnouncements.mockResolvedValue([
        announcement("everyone"),
        announcement("organizers"),
        announcement("judges"),
        announcement("mentors"),
        announcement("attendees"),
        announcement("submitted"),
        announcement("not_submitted"),
      ])

      const res = await app.handle(new Request(url))
      const data = await res.json()
      const serialized = JSON.stringify(data)

      expect(res.status).toBe(200)
      expect(data).toEqual({
        announcements: [{
          title: "everyone update",
          body: "everyone private body",
          priority: "normal",
          publishedAt: "2026-08-25T15:00:00Z",
        }],
      })
      expect(serialized).not.toContain("organizers private body")
      expect(serialized).not.toContain("id-everyone")
      expect(serialized).not.toContain(mockHackathon.id)
    })

    it("matches attendee project-state audiences", async () => {
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockResolvePrincipal.mockResolvedValue({
        kind: "user",
        userId: "user_attendee",
        tenantId: "tenant_attendee",
        orgId: null,
      })
      mockGetRegistrationInfo.mockResolvedValue({
        participantRole: "participant",
        participantId: "participant_1",
        isRegistered: true,
        participantCount: 1,
      })
      mockGetSubmissionForParticipant.mockResolvedValue({
        id: "submission_1",
        status: "submitted",
      })
      mockListPublishedAnnouncements.mockResolvedValue([
        announcement("everyone"),
        announcement("attendees"),
        announcement("submitted"),
        announcement("not_submitted"),
      ])

      const res = await app.handle(new Request(url))
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.announcements.map((item: { title: string }) => item.title)).toEqual([
        "everyone update",
        "attendees update",
        "submitted update",
      ])
    })

    it("treats a saved project draft as not submitted", async () => {
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockResolvePrincipal.mockResolvedValue({
        kind: "user",
        userId: "user_attendee",
        tenantId: "tenant_attendee",
        orgId: null,
      })
      mockGetRegistrationInfo.mockResolvedValue({
        participantRole: "participant",
        participantId: "participant_1",
        isRegistered: true,
        participantCount: 1,
      })
      mockGetSubmissionForParticipant.mockResolvedValue({
        id: "submission_1",
        status: "draft",
      })
      mockListPublishedAnnouncements.mockResolvedValue([
        announcement("submitted"),
        announcement("not_submitted"),
      ])

      const res = await app.handle(new Request(url))
      const data = await res.json()

      expect(data.announcements.map((item: { title: string }) => item.title)).toEqual([
        "not_submitted update",
      ])
    })

    it("does not treat two missing org IDs as organizer access", async () => {
      mockGetPublicHackathon.mockResolvedValue({
        ...mockHackathon,
        organizer: {
          ...mockHackathon.organizer,
          clerk_org_id: null,
          clerk_user_id: "actual_owner",
        },
      })
      mockResolvePrincipal.mockResolvedValue({
        kind: "user",
        userId: "user_outsider",
        tenantId: "tenant_outsider",
        orgId: null,
      })
      mockListPublishedAnnouncements.mockResolvedValue([
        announcement("everyone"),
        announcement("organizers"),
      ])

      const res = await app.handle(new Request(url))
      const data = await res.json()

      expect(data.announcements.map((item: { title: string }) => item.title)).toEqual([
        "everyone update",
      ])
    })
  })

  describe("POST /api/public/hackathons/:slug/mentor-request", () => {
    const url = "http://localhost/api/public/hackathons/build-os26/mentor-request"

    it("creates mentor requests for approved team members", async () => {
      const request = {
        id: "44444444-4444-4444-4444-444444444444",
        category: "API",
        description: "Need help",
        status: "open",
        created_at: "2026-04-01T12:00:00Z",
      }
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockResolvePrincipal.mockResolvedValue({ kind: "user", userId: "user_1" })
      mockGetRegistrationInfo.mockResolvedValue({ participantRole: "participant", participantId: "participant_1", isRegistered: true, participantCount: 1 })
      mockGetParticipantWithTeam.mockResolvedValue({
        participantId: "participant_1",
        teamId: "team_1",
        teamStatus: "forming",
      })
      mockCreateMentorRequest.mockResolvedValue({ success: true, request })

      const res = await app.handle(new Request(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: "API", description: "Need help" }),
      }))
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.request).toEqual({
        category: "API",
        description: "Need help",
        status: "open",
        createdAt: "2026-04-01T12:00:00Z",
      })
      expect(mockCreateMentorRequest).toHaveBeenCalledWith(
        mockHackathon.id,
        "participant_1",
        "team_1",
        { category: "API", description: "Need help" }
      )
    })

    it("blocks mentor requests for teams waiting for approval", async () => {
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockResolvePrincipal.mockResolvedValue({ kind: "user", userId: "user_1" })
      mockGetRegistrationInfo.mockResolvedValue({ participantRole: "participant", participantId: "participant_1", isRegistered: true, participantCount: 1 })
      mockGetParticipantWithTeam.mockResolvedValue({
        participantId: "participant_1",
        teamId: "team_1",
        teamStatus: "pending_approval",
      })

      const res = await app.handle(new Request(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: "API", description: "Need help" }),
      }))
      const data = await res.json()

      expect(res.status).toBe(409)
      expect(data.code).toBe("team_pending_approval")
      expect(mockCreateMentorRequest).not.toHaveBeenCalled()
    })

    it("blocks mentor requests for disbanded teams", async () => {
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockResolvePrincipal.mockResolvedValue({ kind: "user", userId: "user_1" })
      mockGetRegistrationInfo.mockResolvedValue({ participantRole: "participant", participantId: "participant_1", isRegistered: true, participantCount: 1 })
      mockGetParticipantWithTeam.mockResolvedValue({
        participantId: "participant_1",
        teamId: "team_1",
        teamStatus: "disbanded",
      })

      const res = await app.handle(new Request(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: "API", description: "Need help" }),
      }))
      const data = await res.json()

      expect(res.status).toBe(409)
      expect(data.code).toBe("team_not_active")
      expect(mockCreateMentorRequest).not.toHaveBeenCalled()
    })

    it("blocks non-attendees and inactive events before creating a request", async () => {
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockResolvePrincipal.mockResolvedValue({ kind: "user", userId: "user_judge" })
      mockGetRegistrationInfo.mockResolvedValue({ participantRole: "judge", participantId: "judge_1", isRegistered: true, participantCount: 1 })

      const wrongRole = await app.handle(new Request(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: "Need help" }),
      }))

      expect(wrongRole.status).toBe(403)
      expect(mockCreateMentorRequest).not.toHaveBeenCalled()

      mockGetPublicHackathon.mockResolvedValue({ ...mockHackathon, status: "judging" })
      const inactive = await app.handle(new Request(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: "Need help" }),
      }))

      expect(inactive.status).toBe(409)
      expect(await inactive.json()).toMatchObject({ code: "event_not_active" })
      expect(mockCreateMentorRequest).not.toHaveBeenCalled()
    })
  })

  describe("GET /api/public/hackathons/:slug/mentor-request/me", () => {
    const url = "http://localhost/api/public/hackathons/build-os26/mentor-request/me"

    it("returns only the signed-in attendee's active request", async () => {
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockResolvePrincipal.mockResolvedValue({ kind: "user", userId: "user_attendee" })
      mockGetRegistrationInfo.mockResolvedValue({
        participantRole: "participant",
        participantId: "participant_1",
        isRegistered: true,
        participantCount: 1,
      })
      mockGetParticipantWithTeam.mockResolvedValue({
        participantId: "66666666-6666-6666-6666-666666666666",
        teamId: "55555555-5555-5555-5555-555555555555",
        teamStatus: "forming",
      })
      mockGetActiveMentorRequest.mockResolvedValue({
        id: "44444444-4444-4444-4444-444444444444",
        hackathon_id: mockHackathon.id,
        team_id: "55555555-5555-5555-5555-555555555555",
        requester_participant_id: "66666666-6666-6666-6666-666666666666",
        category: "API",
        description: "Need help with an endpoint",
        status: "open",
        claimed_by_participant_id: null,
        claimed_at: null,
        resolved_at: null,
        created_at: "2026-08-25T15:00:00Z",
      })

      const res = await app.handle(new Request(url))
      const data = await res.json()
      const serialized = JSON.stringify(data)

      expect(res.status).toBe(200)
      expect(data).toEqual({
        request: {
          category: "API",
          description: "Need help with an endpoint",
          status: "open",
          createdAt: "2026-08-25T15:00:00Z",
        },
      })
      expect(serialized).not.toContain("44444444-4444-4444-4444-444444444444")
      expect(serialized).not.toContain("55555555-5555-5555-5555-555555555555")
      expect(serialized).not.toContain("66666666-6666-6666-6666-666666666666")
      expect(res.headers.get("Cache-Control")).toBe("private, no-store")
      expect(res.headers.get("Vary")).toBe("Cookie, Authorization")
    })

    it("does not expose attendee request state to signed-out or other roles", async () => {
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)

      const signedOut = await app.handle(new Request(url))
      expect(signedOut.status).toBe(401)
      expect(mockGetActiveMentorRequest).not.toHaveBeenCalled()

      mockResolvePrincipal.mockResolvedValue({ kind: "user", userId: "user_mentor" })
      mockGetRegistrationInfo.mockResolvedValue({
        participantRole: "mentor",
        participantId: "mentor_1",
        isRegistered: true,
        participantCount: 1,
      })

      const wrongRole = await app.handle(new Request(url))
      expect(wrongRole.status).toBe(403)
      expect(mockGetParticipantWithTeam).not.toHaveBeenCalled()
      expect(mockGetActiveMentorRequest).not.toHaveBeenCalled()
    })
  })

  describe("GET /api/public/hackathons/:slug/mentor-queue", () => {
    const url = "http://localhost/api/public/hackathons/build-os26/mentor-queue"
    const privateRequest = {
      id: "44444444-4444-4444-4444-444444444444",
      hackathon_id: mockHackathon.id,
      team_id: "55555555-5555-5555-5555-555555555555",
      requester_participant_id: "66666666-6666-6666-6666-666666666666",
      category: "API",
      description: "Private request text",
      status: "open",
      claimed_by_participant_id: "private-other-mentor-id",
      claimed_at: null,
      resolved_at: null,
      created_at: "2026-08-25T15:00:00Z",
      team_name: "Team Alpha",
      requester_name: "Hidden attendee",
      mentor_name: null,
    }

    it("returns aggregate counts only to public viewers", async () => {
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockGetQueueStats.mockResolvedValue({ open: 2, claimed: 1, resolved: 4 })
      mockListMentorQueue.mockResolvedValue([privateRequest])

      const res = await app.handle(new Request(url))
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data).toEqual({
        viewer: "public",
        stats: { open: 2, claimed: 1, resolved: 4 },
        requests: [],
      })
      expect(JSON.stringify(data)).not.toContain("Private request text")
      expect(mockListMentorQueue).not.toHaveBeenCalled()
      expect(res.headers.get("Cache-Control")).toBe("private, no-store")
      expect(res.headers.get("Vary")).toBe("Cookie, Authorization")
    })

    it("keeps signed-in non-mentors on the aggregate-only response", async () => {
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockResolvePrincipal.mockResolvedValue({ kind: "user", userId: "user_attendee" })
      mockGetQueueStats.mockResolvedValue({ open: 2, claimed: 1, resolved: 4 })
      mockGetMentorParticipantId.mockResolvedValue(null)
      mockListMentorQueue.mockResolvedValue([privateRequest])

      const res = await app.handle(new Request(url))
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data).toEqual({
        viewer: "public",
        stats: { open: 2, claimed: 1, resolved: 4 },
        requests: [],
      })
      expect(mockGetMentorParticipantId).toHaveBeenCalledWith(
        mockHackathon.id,
        "user_attendee",
      )
      expect(mockListMentorQueue).not.toHaveBeenCalled()
    })

    it("returns safe request fields only to an exact event mentor", async () => {
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockResolvePrincipal.mockResolvedValue({ kind: "user", userId: "user_mentor" })
      mockGetMentorParticipantId.mockResolvedValue("77777777-7777-7777-7777-777777777777")
      mockListMentorQueue.mockResolvedValue([privateRequest])

      const res = await app.handle(new Request(url))
      const data = await res.json()
      const serialized = JSON.stringify(data)

      expect(res.status).toBe(200)
      expect(data.viewer).toBe("mentor")
      expect(data.requests[0]).toEqual({
        id: privateRequest.id,
        teamName: "Team Alpha",
        category: "API",
        description: "Private request text",
        status: "open",
        createdAt: "2026-08-25T15:00:00Z",
        claimedByMe: false,
      })
      expect(serialized).not.toContain(privateRequest.requester_participant_id)
      expect(serialized).not.toContain(privateRequest.team_id)
      expect(serialized).not.toContain("Hidden attendee")
      expect(serialized).not.toContain("private-other-mentor-id")
    })
  })

  describe("mentor claim and resolve routes", () => {
    it("blocks an attendee from claiming a mentor request", async () => {
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockResolvePrincipal.mockResolvedValue({ kind: "user", userId: "user_attendee" })
      mockGetMentorParticipantId.mockResolvedValue(null)

      const res = await app.handle(new Request(
        "http://localhost/api/public/hackathons/build-os26/mentor-request/44444444-4444-4444-4444-444444444444/claim",
        { method: "POST" }
      ))

      expect(res.status).toBe(403)
      expect(mockClaimRequest).not.toHaveBeenCalled()
    })

    it("scopes mentor claims to the resolved hackathon", async () => {
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockResolvePrincipal.mockResolvedValue({ kind: "user", userId: "user_mentor" })
      mockGetMentorParticipantId.mockResolvedValue("mentor_participant")

      const res = await app.handle(new Request(
        "http://localhost/api/public/hackathons/build-os26/mentor-request/44444444-4444-4444-4444-444444444444/claim",
        { method: "POST" }
      ))

      expect(res.status).toBe(200)
      expect(mockGetMentorParticipantId).toHaveBeenCalledWith(mockHackathon.id, "user_mentor")
      expect(mockClaimRequest).toHaveBeenCalledWith("44444444-4444-4444-4444-444444444444", "mentor_participant", mockHackathon.id)
    })

    it("scopes mentor resolutions to the resolved hackathon", async () => {
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockResolvePrincipal.mockResolvedValue({ kind: "user", userId: "user_mentor" })
      mockGetMentorParticipantId.mockResolvedValue("mentor_participant")

      const res = await app.handle(new Request(
        "http://localhost/api/public/hackathons/build-os26/mentor-request/44444444-4444-4444-4444-444444444444/resolve",
        { method: "POST" }
      ))

      expect(res.status).toBe(200)
      expect(mockResolveRequest).toHaveBeenCalledWith("44444444-4444-4444-4444-444444444444", "mentor_participant", mockHackathon.id)
    })

    it("returns 409 when another mentor wins the claim race", async () => {
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockResolvePrincipal.mockResolvedValue({ kind: "user", userId: "user_mentor" })
      mockGetMentorParticipantId.mockResolvedValue("mentor_participant")
      mockClaimRequest.mockResolvedValue({
        success: false,
        code: "already_claimed",
        error: "Another mentor already claimed this request.",
      })

      const res = await app.handle(new Request(
        "http://localhost/api/public/hackathons/build-os26/mentor-request/44444444-4444-4444-4444-444444444444/claim",
        { method: "POST" }
      ))
      const data = await res.json()

      expect(res.status).toBe(409)
      expect(data.code).toBe("already_claimed")
    })
  })
})
