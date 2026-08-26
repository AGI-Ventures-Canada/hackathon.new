import { describe, expect, it, mock, beforeEach } from "bun:test"

const mockAuth = mock(() => Promise.resolve({ userId: null }))

mock.module("@clerk/nextjs/server", () => ({
  auth: mockAuth,
  clerkClient: mock(() => Promise.resolve({
    organizations: {
      getOrganization: mock(() => Promise.resolve({ name: "Test Org" })),
    },
    users: {
      getUser: mock(() => Promise.resolve({
        firstName: "Test",
        lastName: "User",
        username: null,
        emailAddresses: [],
      })),
    },
  })),
}))

const mockGetPublicHackathon = mock(() => Promise.resolve(null))
const mockGetRegistrationInfo = mock(() => Promise.resolve({
  participantId: "p1",
  participantRole: "participant",
}))

mock.module("@/lib/services/public-hackathons", () => ({
  getPublicHackathon: mockGetPublicHackathon,
  getPublicHackathonById: mock(() => Promise.resolve(null)),
  listPublicHackathons: mock(() => Promise.resolve({ hackathons: [], total: 0 })),
  getHackathonByIdForOrganizer: mock(() => Promise.resolve(null)),
  checkHackathonOrganizer: mock(() => Promise.resolve({ status: "not_found" })),
  getHackathonByIdWithFullData: mock(() => Promise.resolve(null)),
  getHackathonByIdWithAccess: mock(() => Promise.resolve(null)),
  updateHackathonSettings: mock(() => Promise.resolve(null)),
}))

mock.module("@/lib/services/hackathons", () => ({
  registerForHackathon: mock(() => Promise.resolve({ success: true })),
  getParticipantCount: mock(() => Promise.resolve(0)),
  isUserRegistered: mock(() => Promise.resolve(false)),
  getRegistrationInfo: mockGetRegistrationInfo,
}))

mock.module("@/lib/services/tenant-profiles", () => ({
  getPublicTenantWithEvents: mock(() => Promise.resolve(null)),
}))

mock.module("@/lib/integrations/oauth", () => ({
  exchangeCodeForTokens: mock(() => Promise.resolve(null)),
  saveIntegration: mock(() => Promise.resolve()),
  getProviderConfig: mock(() => null),
}))

const mockGetParticipantWithTeam = mock(() => Promise.resolve(null))
const mockGetExistingSubmission = mock(() => Promise.resolve(null))
const mockCreateSubmission = mock(() => Promise.resolve({ id: "new-sub" }))
const mockUpdateSubmission = mock(() => Promise.resolve({ id: "sub123" }))
const mockGetSubmissionForParticipant = mock(() => Promise.resolve(null))
const mockGetHackathonSubmissions = mock(() => Promise.resolve([]))
const mockNotifySubmissionMembers = mock(() => Promise.resolve(0))
const mockGetPresenterView = mock(() => Promise.resolve(null))
const mockResolvePresenterSubmissions = mock(() => Promise.resolve([]))

mock.module("@/lib/services/submissions", () => ({
  getParticipantWithTeam: mockGetParticipantWithTeam,
  getSubmissionForParticipant: mockGetSubmissionForParticipant,
  getExistingSubmission: mockGetExistingSubmission,
  createSubmission: mockCreateSubmission,
  updateSubmission: mockUpdateSubmission,
  getHackathonSubmissions: mockGetHackathonSubmissions,
  getTeamMemberCount: mock(() => Promise.resolve(0)),
  notifySubmissionMembers: mockNotifySubmissionMembers,
}))

mock.module("@/lib/services/presenter-views", () => ({
  getPresenterView: mockGetPresenterView,
  resolvePresenterSubmissions: mockResolvePresenterSubmissions,
}))

const mockUploadScreenshot = mock(() => Promise.resolve({ url: "https://storage.test/screenshot.webp", path: "sub123/screenshot.webp" }))
const mockDeleteScreenshot = mock(() => Promise.resolve(true))
const mockUploadScreenshotVersion = mock(() => Promise.resolve({
  url: "https://storage.test/version.webp",
  path: "sub123/versions/request-0.webp",
}))
const mockDeleteScreenshotVersion = mock(() => Promise.resolve(true))

mock.module("@/lib/services/storage", () => ({
  uploadScreenshot: mockUploadScreenshot,
  deleteScreenshot: mockDeleteScreenshot,
  uploadScreenshotVersion: mockUploadScreenshotVersion,
  deleteScreenshotVersion: mockDeleteScreenshotVersion,
  uploadLogo: mock(() => Promise.resolve(null)),
  deleteLogo: mock(() => Promise.resolve(true)),
  uploadBanner: mock(() => Promise.resolve(null)),
  deleteBanner: mock(() => Promise.resolve(true)),
  optimizeImage: mock(() => Promise.resolve({ buffer: Buffer.alloc(1024), mimeType: "image/webp" })),
  optimizeScreenshot: mock(() => Promise.resolve({ buffer: Buffer.alloc(1024), mimeType: "image/webp" })),
  optimizeBanner: mock(() => Promise.resolve({ buffer: Buffer.alloc(1024), mimeType: "image/webp" })),
  ImageTooLargeError: class ImageTooLargeError extends Error {
    constructor(size: number, maxSize: number = 200 * 1024) {
      super(`Optimized image is ${Math.round(size / 1024)}KB, max is ${maxSize / 1024}KB`)
      this.name = "ImageTooLargeError"
    }
  },
}))

mock.module("@/lib/utils/sort-hackathons", () => ({
  sortByStatusPriority: mock((arr: unknown[]) => arr),
}))

const mockTriggerWebhooks = mock(() => Promise.resolve())

mock.module("@/lib/services/webhooks", () => ({ triggerWebhooks: mockTriggerWebhooks }))

const mockSyncSubmissionChallenges = mock(() => Promise.resolve(true))
mock.module("@/lib/services/challenges", () => ({
  syncSubmissionChallenges: mockSyncSubmissionChallenges,
}))

const { Elysia } = await import("elysia")
const { publicRoutes } = await import("@/lib/api/routes/public")

const app = new Elysia({ prefix: "/api" }).use(publicRoutes)

const mockHackathon = {
  id: "h1",
  tenant_id: "tenant1",
  name: "Test Hackathon",
  slug: "test-hackathon",
  description: "A test hackathon",
  rules: null,
  banner_url: null,
  status: "active",
  allow_solo: true,
  min_team_size: 1,
  starts_at: "2026-03-01T00:00:00Z",
  ends_at: "2026-03-02T00:00:00Z",
  registration_opens_at: "2026-01-01T00:00:00Z",
  registration_closes_at: "2026-02-28T00:00:00Z",
  organizer: {
    id: "t1",
    name: "Test Org",
    slug: "test-org",
    logo_url: null,
  },
  sponsors: [],
  anonymous_judging: false,
  results_published_at: null,
}

const mockSubmission = {
  id: "sub123",
  hackathon_id: "h1",
  participant_id: "p1",
  team_id: null,
  title: "Test Project",
  description: "A test project",
  github_url: "https://github.com/test/repo",
  live_app_url: null,
  demo_video_url: null,
  screenshot_url: null,
  status: "submitted",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
}

const aggregateRequestId = "00000000-0000-4000-8000-000000000001"

const PRESENTER_VIEW_ID = "44444444-4444-4444-4444-444444444444"

function createCompleteSubmissionForm(
  retainedScreenshotSlots: number[] = [],
  files: Array<{ slot: number; type: string }> = [],
  overrides: Record<string, unknown> = {}
) {
  const formData = new FormData()
  formData.append("payload", JSON.stringify({
    title: "Project Atlas",
    description: "A helper for teams.",
    githubUrl: "github.com/acme/atlas",
    liveAppUrl: "atlas.example.com",
    demoVideoUrl: "video.example.com/demo",
    retainedScreenshotSlots,
    requestId: aggregateRequestId,
    ...overrides,
  }))
  for (const file of files) {
    formData.append(
      `screenshot_${file.slot}`,
      new Blob(["test"], { type: file.type }),
      `screenshot-${file.slot}.${file.type === "text/plain" ? "txt" : "png"}`
    )
  }
  return formData
}

describe("Public Screenshot Routes", () => {
  beforeEach(() => {
    mockAuth.mockReset()
    mockGetPublicHackathon.mockReset()
    mockGetRegistrationInfo.mockReset()
    mockGetParticipantWithTeam.mockReset()
    mockGetExistingSubmission.mockReset()
    mockCreateSubmission.mockReset()
    mockUpdateSubmission.mockReset()
    mockUploadScreenshot.mockReset()
    mockDeleteScreenshot.mockReset()
    mockUploadScreenshotVersion.mockReset()
    mockDeleteScreenshotVersion.mockReset()
    mockTriggerWebhooks.mockReset()
    mockSyncSubmissionChallenges.mockReset()
    mockGetSubmissionForParticipant.mockReset()
    mockGetHackathonSubmissions.mockReset()
    mockNotifySubmissionMembers.mockReset()
    mockGetPresenterView.mockReset()
    mockResolvePresenterSubmissions.mockReset()
    mockNotifySubmissionMembers.mockImplementation(() => Promise.resolve(0))
    mockGetRegistrationInfo.mockImplementation(() => Promise.resolve({
      participantId: "p1",
      participantRole: "participant",
    }))

    mockCreateSubmission.mockImplementation(() => Promise.resolve({ id: "new-sub" }))
    mockUpdateSubmission.mockImplementation(() => Promise.resolve({ id: "sub123" }))
    mockUploadScreenshot.mockImplementation(() => Promise.resolve({ url: "https://storage.test/screenshot.webp", path: "sub123/screenshot.webp" }))
    mockDeleteScreenshot.mockImplementation(() => Promise.resolve(true))
    mockUploadScreenshotVersion.mockImplementation(() => Promise.resolve({
      url: "https://storage.test/version.webp",
      path: `${aggregateRequestId}/versions/${aggregateRequestId}-0.webp`,
    }))
    mockDeleteScreenshotVersion.mockImplementation(() => Promise.resolve(true))
    mockTriggerWebhooks.mockImplementation(() => Promise.resolve())
    mockSyncSubmissionChallenges.mockImplementation(() => Promise.resolve(true))
    mockGetPresenterView.mockResolvedValue(null)
    mockResolvePresenterSubmissions.mockResolvedValue([])
  })

  it("blocks every project write for a disbanded team", async () => {
    const baseUrl = "http://localhost/api/public/hackathons/test-hackathon/submissions"
    mockAuth.mockResolvedValue({ userId: "user_123" })
    mockGetPublicHackathon.mockResolvedValue(mockHackathon)
    mockGetParticipantWithTeam.mockResolvedValue({
      participantId: "p1",
      teamId: "team1",
      teamStatus: "disbanded",
    })

    const create = await app.handle(new Request(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Project Atlas",
        description: "A helper for teams.",
        githubUrl: "github.com/acme/atlas",
      }),
    }))
    expect(create.status).toBe(409)
    expect((await create.json()).code).toBe("team_not_active")

    const update = await app.handle(new Request(baseUrl, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Updated Atlas" }),
    }))
    expect(update.status).toBe(409)
    expect((await update.json()).code).toBe("team_not_active")

    const screenshotForm = new FormData()
    screenshotForm.append(
      "file",
      new Blob(["test"], { type: "image/png" }),
      "screenshot.png",
    )
    const upload = await app.handle(new Request(`${baseUrl}/screenshot`, {
      method: "POST",
      body: screenshotForm,
    }))
    expect(upload.status).toBe(409)
    expect((await upload.json()).code).toBe("team_not_active")

    const remove = await app.handle(new Request(`${baseUrl}/screenshot`, {
      method: "DELETE",
    }))
    expect(remove.status).toBe(409)
    expect((await remove.json()).code).toBe("team_not_active")
    expect(mockGetExistingSubmission).not.toHaveBeenCalled()
    expect(mockCreateSubmission).not.toHaveBeenCalled()
    expect(mockUpdateSubmission).not.toHaveBeenCalled()
  })

  describe("POST /api/public/hackathons/:slug/submissions", () => {
    it("saves a normalized video link", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockGetParticipantWithTeam.mockResolvedValue({ participantId: "p1", teamId: null })
      mockGetExistingSubmission.mockResolvedValue(null)

      const res = await app.handle(
        new Request("http://localhost/api/public/hackathons/test-hackathon/submissions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "Project Atlas",
            description: "A helper for teams.",
            githubUrl: "github.com/acme/atlas",
            liveAppUrl: null,
            demoVideoUrl: "youtube.com/watch?v=atlas-demo",
          }),
        })
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.submissionId).toBe("new-sub")
      expect(mockCreateSubmission).toHaveBeenCalledWith(
        "h1",
        "p1",
        null,
        expect.objectContaining({
          githubUrl: "https://github.com/acme/atlas",
          liveAppUrl: null,
          demoVideoUrl: "https://youtube.com/watch?v=atlas-demo",
        })
      )
      expect(mockNotifySubmissionMembers).toHaveBeenCalledWith({
        hackathonId: "h1",
        participantId: "p1",
        submissionId: "new-sub",
        teamId: null,
        projectTitle: "Project Atlas",
      })
    })

    it("rejects an invalid video link", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockGetParticipantWithTeam.mockResolvedValue({ participantId: "p1", teamId: null })
      mockGetExistingSubmission.mockResolvedValue(null)

      const res = await app.handle(
        new Request("http://localhost/api/public/hackathons/test-hackathon/submissions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "Project Atlas",
            description: "A helper for teams.",
            githubUrl: "github.com/acme/atlas",
            liveAppUrl: null,
            demoVideoUrl: "not a url",
          }),
        })
      )
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data).toEqual({
        error: "Invalid video link",
        code: "invalid_demo_video_url",
      })
      expect(mockCreateSubmission).not.toHaveBeenCalled()
    })

    it("blocks pending teams from submitting", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockGetParticipantWithTeam.mockResolvedValue({
        participantId: "p1",
        teamId: "team1",
        teamStatus: "pending_approval",
      })

      const res = await app.handle(
        new Request("http://localhost/api/public/hackathons/test-hackathon/submissions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "Project Atlas",
            description: "A helper for teams.",
            githubUrl: "github.com/acme/atlas",
          }),
        })
      )
      const data = await res.json()

      expect(res.status).toBe(409)
      expect(data.code).toBe("team_pending_approval")
      expect(mockCreateSubmission).not.toHaveBeenCalled()
    })
  })

  describe("PATCH /api/public/hackathons/:slug/submissions", () => {
    it("updates a normalized video link", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockGetParticipantWithTeam.mockResolvedValue({ participantId: "p1", teamId: null })
      mockGetExistingSubmission.mockResolvedValue(mockSubmission)

      const res = await app.handle(
        new Request("http://localhost/api/public/hackathons/test-hackathon/submissions", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            demoVideoUrl: "youtu.be/atlas-demo",
          }),
        })
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.submissionId).toBe("sub123")
      expect(mockUpdateSubmission).toHaveBeenCalledWith(
        "sub123",
        "p1",
        null,
        expect.objectContaining({
          demoVideoUrl: "https://youtu.be/atlas-demo",
        })
      )
      expect(mockNotifySubmissionMembers).not.toHaveBeenCalled()
    })

    it("rejects an invalid video link", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockGetParticipantWithTeam.mockResolvedValue({ participantId: "p1", teamId: null })
      mockGetExistingSubmission.mockResolvedValue(mockSubmission)

      const res = await app.handle(
        new Request("http://localhost/api/public/hackathons/test-hackathon/submissions", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            demoVideoUrl: "not a url",
          }),
        })
      )
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data).toEqual({
        error: "Invalid video link",
        code: "invalid_demo_video_url",
      })
      expect(mockUpdateSubmission).not.toHaveBeenCalled()
    })

    it("blocks pending teams from updating a submission", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockGetParticipantWithTeam.mockResolvedValue({
        participantId: "p1",
        teamId: "team1",
        teamStatus: "pending_approval",
      })

      const res = await app.handle(
        new Request("http://localhost/api/public/hackathons/test-hackathon/submissions", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "Updated Atlas",
          }),
        })
      )
      const data = await res.json()

      expect(res.status).toBe(409)
      expect(data.code).toBe("team_pending_approval")
      expect(mockGetExistingSubmission).not.toHaveBeenCalled()
      expect(mockUpdateSubmission).not.toHaveBeenCalled()
    })
  })

  describe("POST /api/public/hackathons/:slug/submissions/complete", () => {
    it("fails closed across authentication, event, registration, and team lifecycle guards", async () => {
      const url = "http://localhost/api/public/hackathons/test-hackathon/submissions/complete"

      mockAuth.mockResolvedValue({ userId: null })
      let response = await app.handle(new Request(url, {
        method: "POST",
        body: createCompleteSubmissionForm(),
      }))
      expect(response.status).toBe(401)
      expect((await response.json()).code).toBe("not_authenticated")

      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(null)
      response = await app.handle(new Request(url, {
        method: "POST",
        body: createCompleteSubmissionForm(),
      }))
      expect(response.status).toBe(404)
      expect((await response.json()).code).toBe("hackathon_not_found")

      mockGetPublicHackathon.mockResolvedValue({ ...mockHackathon, status: "judging" })
      response = await app.handle(new Request(url, {
        method: "POST",
        body: createCompleteSubmissionForm(),
      }))
      expect(response.status).toBe(400)
      expect((await response.json()).code).toBe("submissions_closed")

      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockGetParticipantWithTeam.mockResolvedValue(null)
      response = await app.handle(new Request(url, {
        method: "POST",
        body: createCompleteSubmissionForm(),
      }))
      expect(response.status).toBe(403)
      expect((await response.json()).code).toBe("not_registered")

      mockGetParticipantWithTeam.mockResolvedValue({
        participantId: "p1",
        teamId: "team1",
        teamStatus: "pending_approval",
      })
      response = await app.handle(new Request(url, {
        method: "POST",
        body: createCompleteSubmissionForm(),
      }))
      expect(response.status).toBe(409)
      expect((await response.json()).code).toBe("team_pending_approval")

      mockGetParticipantWithTeam.mockResolvedValue({
        participantId: "p1",
        teamId: "team1",
        teamStatus: "disbanded",
      })
      response = await app.handle(new Request(url, {
        method: "POST",
        body: createCompleteSubmissionForm(),
      }))
      expect(response.status).toBe(409)
      expect((await response.json()).code).toBe("team_not_active")
      expect(mockCreateSubmission).not.toHaveBeenCalled()
    })

    it("rejects malformed aggregate forms before any project write", async () => {
      const url = "http://localhost/api/public/hackathons/test-hackathon/submissions/complete"
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockGetParticipantWithTeam.mockResolvedValue({
        participantId: "p1",
        teamId: null,
        teamStatus: null,
      })

      let response = await app.handle(new Request(url, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "not multipart",
      }))
      expect(response.status).toBe(400)
      expect((await response.json()).code).toBe("invalid_form")

      response = await app.handle(new Request(url, {
        method: "POST",
        body: new FormData(),
      }))
      expect(response.status).toBe(400)
      expect((await response.json()).code).toBe("invalid_form")

      const malformed = new FormData()
      malformed.append("payload", "not json")
      response = await app.handle(new Request(url, {
        method: "POST",
        body: malformed,
      }))
      expect(response.status).toBe(400)
      expect((await response.json()).code).toBe("invalid_form")

      response = await app.handle(new Request(url, {
        method: "POST",
        body: createCompleteSubmissionForm([], [], {
          challengeIds: ["not-a-uuid"],
        }),
      }))
      expect(response.status).toBe(400)
      expect((await response.json()).code).toBe("invalid_challenge_id")
      expect(mockCreateSubmission).not.toHaveBeenCalled()
      expect(mockUpdateSubmission).not.toHaveBeenCalled()
    })

    it("rejects conflicting, duplicate, and stale screenshot slots", async () => {
      const url = "http://localhost/api/public/hackathons/test-hackathon/submissions/complete"
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockGetParticipantWithTeam.mockResolvedValue({
        participantId: "p1",
        teamId: null,
        teamStatus: null,
      })

      let response = await app.handle(new Request(url, {
        method: "POST",
        body: createCompleteSubmissionForm([], [{ slot: 2, type: "image/png" }]),
      }))
      expect(response.status).toBe(400)
      expect((await response.json()).code).toBe("invalid_screenshot_slot")

      const duplicate = createCompleteSubmissionForm([], [{ slot: 0, type: "image/png" }])
      duplicate.append(
        "screenshot_0",
        new Blob(["again"], { type: "image/png" }),
        "again.png",
      )
      response = await app.handle(new Request(url, {
        method: "POST",
        body: duplicate,
      }))
      expect(response.status).toBe(400)
      expect((await response.json()).code).toBe("invalid_screenshot_slot")

      response = await app.handle(new Request(url, {
        method: "POST",
        body: createCompleteSubmissionForm([0], [{ slot: 0, type: "image/png" }]),
      }))
      expect(response.status).toBe(400)
      expect((await response.json()).code).toBe("invalid_screenshot_slot")

      mockGetExistingSubmission.mockResolvedValue({
        ...mockSubmission,
        metadata: {},
      })
      response = await app.handle(new Request(url, {
        method: "POST",
        body: createCompleteSubmissionForm([0]),
      }))
      expect(response.status).toBe(409)
      expect((await response.json()).code).toBe("stale_screenshot")
      expect(mockCreateSubmission).not.toHaveBeenCalled()
      expect(mockUpdateSubmission).not.toHaveBeenCalled()
    })

    it("rejects judges and mentors before loading an attendee submission", async () => {
      mockAuth.mockResolvedValue({ userId: "judge_123" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockGetRegistrationInfo.mockResolvedValue({
        participantId: "judge-participant",
        participantRole: "judge",
      })

      const res = await app.handle(new Request(
        "http://localhost/api/public/hackathons/test-hackathon/submissions/complete",
        {
          method: "POST",
          body: createCompleteSubmissionForm(),
        }
      ))
      const data = await res.json()

      expect(res.status).toBe(403)
      expect(data.code).toBe("not_attendee")
      expect(mockGetParticipantWithTeam).not.toHaveBeenCalled()
      expect(mockCreateSubmission).not.toHaveBeenCalled()
    })

    it("creates the project and uploads screenshots through one aggregate request", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockGetParticipantWithTeam.mockResolvedValue({
        participantId: "p1",
        teamId: null,
        teamStatus: null,
      })
      mockGetExistingSubmission.mockResolvedValue(null)
      const versionPath = `${aggregateRequestId}/versions/${aggregateRequestId}-0.webp`
      mockCreateSubmission.mockResolvedValue({
        ...mockSubmission,
        id: aggregateRequestId,
        metadata: {},
      })
      mockUploadScreenshotVersion.mockResolvedValue({
        url: "https://storage.test/version.webp",
        path: versionPath,
      })

      const res = await app.handle(new Request(
        "http://localhost/api/public/hackathons/test-hackathon/submissions/complete",
        {
          method: "POST",
          body: createCompleteSubmissionForm([], [{ slot: 0, type: "image/png" }]),
        }
      ))
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data).toEqual(expect.objectContaining({
        submissionId: aggregateRequestId,
        screenshots: [{ slot: 0, url: "https://storage.test/version.webp" }],
      }))
      expect(mockCreateSubmission).toHaveBeenCalledTimes(1)
      expect(mockUploadScreenshotVersion).toHaveBeenCalledWith(
        aggregateRequestId,
        expect.any(Buffer),
        0,
        expect.any(String),
      )
      const uploadAttemptId = mockUploadScreenshotVersion.mock.calls[0]?.[3]
      expect(uploadAttemptId).not.toBe(aggregateRequestId)
      expect(mockCreateSubmission).toHaveBeenCalledWith(
        "h1",
        "p1",
        null,
        expect.objectContaining({
          submissionId: aggregateRequestId,
          screenshotUrl: "https://storage.test/version.webp",
          metadata: expect.objectContaining({
            screenshotUrls: { "0": "https://storage.test/version.webp" },
            submissionScreenshotPaths: { "0": versionPath },
            submissionScreenshotCleanup: [],
            submissionAggregateRequestId: aggregateRequestId,
          }),
        })
      )
      expect(mockUpdateSubmission).not.toHaveBeenCalled()
      expect(mockNotifySubmissionMembers).toHaveBeenCalledTimes(1)
      expect(mockTriggerWebhooks).toHaveBeenCalledTimes(1)
    })

    it("stages two screenshots and commits their metadata once", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockGetParticipantWithTeam.mockResolvedValue({
        participantId: "p1",
        teamId: null,
        teamStatus: null,
      })
      mockGetExistingSubmission.mockResolvedValue(null)
      const firstPath = `${aggregateRequestId}/versions/${aggregateRequestId}-0.webp`
      const secondPath = `${aggregateRequestId}/versions/${aggregateRequestId}-1.webp`
      mockUploadScreenshotVersion
        .mockResolvedValueOnce({ url: "https://storage.test/first.webp", path: firstPath })
        .mockResolvedValueOnce({ url: "https://storage.test/second.webp", path: secondPath })
      mockCreateSubmission.mockResolvedValue({
        ...mockSubmission,
        id: aggregateRequestId,
        metadata: {},
      })

      const res = await app.handle(new Request(
        "http://localhost/api/public/hackathons/test-hackathon/submissions/complete",
        {
          method: "POST",
          body: createCompleteSubmissionForm([], [
            { slot: 0, type: "image/png" },
            { slot: 1, type: "image/jpeg" },
          ]),
        }
      ))
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.screenshots).toEqual([
        { slot: 0, url: "https://storage.test/first.webp" },
        { slot: 1, url: "https://storage.test/second.webp" },
      ])
      expect(mockUploadScreenshotVersion).toHaveBeenCalledTimes(2)
      expect(mockCreateSubmission).toHaveBeenCalledTimes(1)
      expect(mockCreateSubmission).toHaveBeenCalledWith(
        "h1",
        "p1",
        null,
        expect.objectContaining({
          metadata: expect.objectContaining({
            screenshotUrls: {
              "0": "https://storage.test/first.webp",
              "1": "https://storage.test/second.webp",
            },
            submissionScreenshotPaths: { "0": firstPath, "1": secondPath },
          }),
        }),
      )
      expect(mockUpdateSubmission).not.toHaveBeenCalled()
    })

    it("removes one screenshot while retaining another through one aggregate request", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockGetParticipantWithTeam.mockResolvedValue({
        participantId: "p1",
        teamId: null,
        teamStatus: null,
      })
      mockGetExistingSubmission.mockResolvedValue({
        ...mockSubmission,
        screenshot_url: "https://storage.test/first.webp",
        metadata: {
          screenshotUrls: {
            "0": "https://storage.test/first.webp",
            "1": "https://storage.test/second.webp",
          },
        },
      })
      mockUpdateSubmission.mockResolvedValue({ ...mockSubmission, metadata: {} })

      const res = await app.handle(new Request(
        "http://localhost/api/public/hackathons/test-hackathon/submissions/complete",
        {
          method: "POST",
          body: createCompleteSubmissionForm([1]),
        }
      ))
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.screenshots).toEqual([
        { slot: 1, url: "https://storage.test/second.webp" },
      ])
      expect(mockUpdateSubmission).toHaveBeenCalledTimes(1)
      expect(mockUpdateSubmission).toHaveBeenCalledWith(
        "sub123",
        "p1",
        null,
        expect.objectContaining({
          screenshotUrl: "https://storage.test/second.webp",
          metadata: expect.objectContaining({
            screenshotUrls: { "1": "https://storage.test/second.webp" },
            submissionScreenshotCleanup: ["slot:0"],
            submissionAggregateRequestId: aggregateRequestId,
          }),
        }),
      )
      expect(mockDeleteScreenshot).toHaveBeenCalledWith("sub123", 0)
      expect(mockUploadScreenshotVersion).not.toHaveBeenCalled()
      expect(mockNotifySubmissionMembers).not.toHaveBeenCalled()
      expect(mockTriggerWebhooks).toHaveBeenCalledTimes(1)
    })

    it("validates screenshot files before saving the project", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockGetParticipantWithTeam.mockResolvedValue({
        participantId: "p1",
        teamId: null,
        teamStatus: null,
      })

      const res = await app.handle(new Request(
        "http://localhost/api/public/hackathons/test-hackathon/submissions/complete",
        {
          method: "POST",
          body: createCompleteSubmissionForm([], [{ slot: 0, type: "text/plain" }]),
        }
      ))
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.code).toBe("invalid_file_type")
      expect(mockCreateSubmission).not.toHaveBeenCalled()
      expect(mockUpdateSubmission).not.toHaveBeenCalled()
    })

    it("rejects insecure or credentialed project links before saving", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockGetParticipantWithTeam.mockResolvedValue({
        participantId: "p1",
        teamId: null,
        teamStatus: null,
      })

      const insecureResponse = await app.handle(new Request(
        "http://localhost/api/public/hackathons/test-hackathon/submissions/complete",
        {
          method: "POST",
          body: createCompleteSubmissionForm([], [], {
            liveAppUrl: "http://atlas.example.com",
          }),
        }
      ))
      const credentialedResponse = await app.handle(new Request(
        "http://localhost/api/public/hackathons/test-hackathon/submissions/complete",
        {
          method: "POST",
          body: createCompleteSubmissionForm([], [], {
            githubUrl: "https://token@github.com/acme/atlas",
          }),
        }
      ))

      expect(insecureResponse.status).toBe(400)
      expect((await insecureResponse.json()).code).toBe("invalid_url")
      expect(credentialedResponse.status).toBe(400)
      expect((await credentialedResponse.json()).code).toBe("invalid_url")
      expect(mockCreateSubmission).not.toHaveBeenCalled()
      expect(mockUpdateSubmission).not.toHaveBeenCalled()
    })

    it("does not save or emit side effects when screenshot staging fails", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockGetParticipantWithTeam.mockResolvedValue({
        participantId: "p1",
        teamId: null,
        teamStatus: null,
      })
      mockGetExistingSubmission.mockResolvedValue(null)
      mockUploadScreenshotVersion.mockResolvedValue(null)

      const res = await app.handle(new Request(
        "http://localhost/api/public/hackathons/test-hackathon/submissions/complete",
        {
          method: "POST",
          body: createCompleteSubmissionForm([], [{ slot: 0, type: "image/png" }]),
        }
      ))
      const data = await res.json()

      expect(res.status).toBe(500)
      expect(data.code).toBe("upload_failed")
      expect(mockCreateSubmission).not.toHaveBeenCalled()
      expect(mockUpdateSubmission).not.toHaveBeenCalled()
      expect(mockNotifySubmissionMembers).not.toHaveBeenCalled()
      expect(mockTriggerWebhooks).not.toHaveBeenCalled()
      const uploadAttemptId = mockUploadScreenshotVersion.mock.calls[0]?.[3]
      expect(uploadAttemptId).not.toBe(aggregateRequestId)
      expect(mockDeleteScreenshotVersion).toHaveBeenCalledWith(
        aggregateRequestId,
        `${aggregateRequestId}/versions/${uploadAttemptId}-0.webp`,
      )
    })

    it("replays a concurrent create winner without deleting its screenshot", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockGetParticipantWithTeam.mockResolvedValue({
        participantId: "p1",
        teamId: null,
        teamStatus: null,
      })
      const losingPath = `${aggregateRequestId}/versions/losing-attempt-0.webp`
      const winnerPath = `${aggregateRequestId}/versions/winner-attempt-0.webp`
      mockGetExistingSubmission
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          ...mockSubmission,
          id: aggregateRequestId,
          screenshot_url: "https://storage.test/winner.webp",
          metadata: {
            screenshotUrls: { "0": "https://storage.test/winner.webp" },
            submissionScreenshotPaths: { "0": winnerPath },
            submissionAggregateRequestId: aggregateRequestId,
          },
        })
      mockUploadScreenshotVersion.mockResolvedValue({
        url: "https://storage.test/loser.webp",
        path: losingPath,
      })
      mockCreateSubmission.mockResolvedValue(null)

      const res = await app.handle(new Request(
        "http://localhost/api/public/hackathons/test-hackathon/submissions/complete",
        {
          method: "POST",
          body: createCompleteSubmissionForm([], [{ slot: 0, type: "image/png" }]),
        }
      ))
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.screenshots).toEqual([
        { slot: 0, url: "https://storage.test/winner.webp" },
      ])
      expect(mockDeleteScreenshotVersion).toHaveBeenCalledWith(aggregateRequestId, losingPath)
      expect(mockDeleteScreenshotVersion).not.toHaveBeenCalledWith(aggregateRequestId, winnerPath)
      expect(mockNotifySubmissionMembers).not.toHaveBeenCalled()
      expect(mockTriggerWebhooks).not.toHaveBeenCalled()
    })

    it("cleans staged files and emits no side effects when metadata save fails", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockGetParticipantWithTeam.mockResolvedValue({
        participantId: "p1",
        teamId: null,
        teamStatus: null,
      })
      const oldPath = "sub123/versions/old-0.webp"
      const stagedPath = `sub123/versions/${aggregateRequestId}-0.webp`
      mockGetExistingSubmission.mockResolvedValue({
        ...mockSubmission,
        screenshot_url: "https://storage.test/old.webp",
        metadata: {
          screenshotUrls: { "0": "https://storage.test/old.webp" },
          submissionScreenshotPaths: { "0": oldPath },
        },
      })
      mockUploadScreenshotVersion.mockResolvedValue({
        url: "https://storage.test/new.webp",
        path: stagedPath,
      })
      mockUpdateSubmission.mockResolvedValue(null)

      const res = await app.handle(new Request(
        "http://localhost/api/public/hackathons/test-hackathon/submissions/complete",
        {
          method: "POST",
          body: createCompleteSubmissionForm([], [{ slot: 0, type: "image/png" }]),
        }
      ))
      const data = await res.json()

      expect(res.status).toBe(409)
      expect(data.code).toBe("stale_submission")
      expect(mockUpdateSubmission).toHaveBeenCalledTimes(1)
      expect(mockDeleteScreenshotVersion).toHaveBeenCalledWith("sub123", stagedPath)
      expect(mockDeleteScreenshotVersion).not.toHaveBeenCalledWith("sub123", oldPath)
      expect(mockNotifySubmissionMembers).not.toHaveBeenCalled()
      expect(mockTriggerWebhooks).not.toHaveBeenCalled()
    })

    it("records failed screenshot cleanup for a safe retry", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockGetParticipantWithTeam.mockResolvedValue({
        participantId: "p1",
        teamId: null,
        teamStatus: null,
      })
      mockGetExistingSubmission.mockResolvedValue({
        ...mockSubmission,
        screenshot_url: "https://storage.test/old.webp",
        metadata: { screenshotUrls: { "0": "https://storage.test/old.webp" } },
      })
      mockUpdateSubmission.mockResolvedValue({ ...mockSubmission, metadata: {} })
      mockDeleteScreenshot.mockResolvedValue(false)

      const res = await app.handle(new Request(
        "http://localhost/api/public/hackathons/test-hackathon/submissions/complete",
        { method: "POST", body: createCompleteSubmissionForm() }
      ))
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.cleanupPending).toBe(true)
      expect(mockUpdateSubmission).toHaveBeenCalledTimes(1)
      expect(mockUpdateSubmission).toHaveBeenCalledWith(
        "sub123",
        "p1",
        null,
        expect.objectContaining({
          metadata: expect.objectContaining({
            submissionScreenshotCleanup: ["slot:0"],
            submissionAggregateRequestId: aggregateRequestId,
          }),
        }),
      )
      expect(mockTriggerWebhooks).toHaveBeenCalledTimes(1)
    })

    it("retries pending cleanup without another save or duplicate side effects", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockGetParticipantWithTeam.mockResolvedValue({
        participantId: "p1",
        teamId: null,
        teamStatus: null,
      })
      mockGetExistingSubmission.mockResolvedValue({
        ...mockSubmission,
        metadata: {
          screenshotUrls: {},
          submissionScreenshotPaths: {},
          submissionScreenshotCleanup: ["slot:0"],
          submissionAggregateRequestId: aggregateRequestId,
        },
      })

      const res = await app.handle(new Request(
        "http://localhost/api/public/hackathons/test-hackathon/submissions/complete",
        { method: "POST", body: createCompleteSubmissionForm() }
      ))
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.cleanupPending).toBe(false)
      expect(mockDeleteScreenshot).toHaveBeenCalledWith("sub123", 0)
      expect(mockCreateSubmission).not.toHaveBeenCalled()
      expect(mockUpdateSubmission).not.toHaveBeenCalled()
      expect(mockNotifySubmissionMembers).not.toHaveBeenCalled()
      expect(mockTriggerWebhooks).not.toHaveBeenCalled()
    })

    it("retries challenge syncing on an idempotent project replay", async () => {
      const challengeId = "11111111-1111-4111-8111-111111111111"
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockGetParticipantWithTeam.mockResolvedValue({
        participantId: "p1",
        teamId: null,
        teamStatus: null,
      })
      mockGetExistingSubmission.mockResolvedValue({
        ...mockSubmission,
        metadata: {
          screenshotUrls: {},
          submissionScreenshotPaths: {},
          submissionScreenshotCleanup: [],
          submissionAggregateRequestId: aggregateRequestId,
        },
      })
      mockSyncSubmissionChallenges
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true)
      const request = () => new Request(
        "http://localhost/api/public/hackathons/test-hackathon/submissions/complete",
        {
          method: "POST",
          body: createCompleteSubmissionForm([], [], { challengeIds: [challengeId] }),
        },
      )

      const failed = await app.handle(request())
      expect(failed.status).toBe(503)
      expect((await failed.json()).code).toBe("challenge_sync_failed")

      const retried = await app.handle(request())
      expect(retried.status).toBe(200)
      expect(mockSyncSubmissionChallenges).toHaveBeenCalledTimes(2)
      expect(mockSyncSubmissionChallenges).toHaveBeenCalledWith("sub123", [challengeId])
      expect(mockCreateSubmission).not.toHaveBeenCalled()
      expect(mockUpdateSubmission).not.toHaveBeenCalled()
      expect(mockNotifySubmissionMembers).not.toHaveBeenCalled()
      expect(mockTriggerWebhooks).not.toHaveBeenCalled()
    })

    it("rejects screenshot files over 4MB in total before saving", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockGetParticipantWithTeam.mockResolvedValue({
        participantId: "p1",
        teamId: null,
        teamStatus: null,
      })
      const formData = createCompleteSubmissionForm()
      formData.append(
        "screenshot_0",
        new Blob([new Uint8Array(2_100_000)], { type: "image/png" }),
        "first.png",
      )
      formData.append(
        "screenshot_1",
        new Blob([new Uint8Array(2_100_000)], { type: "image/png" }),
        "second.png",
      )

      const res = await app.handle(new Request(
        "http://localhost/api/public/hackathons/test-hackathon/submissions/complete",
        { method: "POST", body: formData }
      ))
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.code).toBe("file_too_large")
      expect(mockGetExistingSubmission).not.toHaveBeenCalled()
      expect(mockCreateSubmission).not.toHaveBeenCalled()
      expect(mockUpdateSubmission).not.toHaveBeenCalled()
    })
  })

  describe("POST /api/public/hackathons/:slug/submissions/screenshot", () => {
    it("returns 401 when not authenticated", async () => {
      mockAuth.mockResolvedValue({ userId: null })

      const formData = new FormData()
      formData.append("file", new Blob(["test"], { type: "image/png" }), "screenshot.png")

      const res = await app.handle(
        new Request("http://localhost/api/public/hackathons/test-hackathon/submissions/screenshot", {
          method: "POST",
          body: formData,
        })
      )
      const data = await res.json()

      expect(res.status).toBe(401)
      expect(data.code).toBe("not_authenticated")
    })

    it("returns 404 when hackathon not found", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(null)

      const formData = new FormData()
      formData.append("file", new Blob(["test"], { type: "image/png" }), "screenshot.png")

      const res = await app.handle(
        new Request("http://localhost/api/public/hackathons/nonexistent/submissions/screenshot", {
          method: "POST",
          body: formData,
        })
      )
      const data = await res.json()

      expect(res.status).toBe(404)
      expect(data.code).toBe("hackathon_not_found")
    })

    it("returns 400 when hackathon is not active", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue({ ...mockHackathon, status: "completed" })

      const formData = new FormData()
      formData.append("file", new Blob(["test"], { type: "image/png" }), "screenshot.png")

      const res = await app.handle(
        new Request("http://localhost/api/public/hackathons/test-hackathon/submissions/screenshot", {
          method: "POST",
          body: formData,
        })
      )
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.code).toBe("submissions_closed")
    })

    it("returns 403 when user is not registered", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockGetParticipantWithTeam.mockResolvedValue(null)

      const formData = new FormData()
      formData.append("file", new Blob(["test"], { type: "image/png" }), "screenshot.png")

      const res = await app.handle(
        new Request("http://localhost/api/public/hackathons/test-hackathon/submissions/screenshot", {
          method: "POST",
          body: formData,
        })
      )
      const data = await res.json()

      expect(res.status).toBe(403)
      expect(data.code).toBe("not_registered")
    })

    it("blocks pending teams from uploading a screenshot", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockGetParticipantWithTeam.mockResolvedValue({
        participantId: "p1",
        teamId: "team1",
        teamStatus: "pending_approval",
      })

      const formData = new FormData()
      formData.append("file", new Blob(["test"], { type: "image/png" }), "screenshot.png")

      const res = await app.handle(
        new Request("http://localhost/api/public/hackathons/test-hackathon/submissions/screenshot", {
          method: "POST",
          body: formData,
        })
      )
      const data = await res.json()

      expect(res.status).toBe(409)
      expect(data.code).toBe("team_pending_approval")
      expect(mockGetExistingSubmission).not.toHaveBeenCalled()
      expect(mockUploadScreenshot).not.toHaveBeenCalled()
    })

    it("returns 400 when no submission exists", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockGetParticipantWithTeam.mockResolvedValue({ participantId: "p1", teamId: null })
      mockGetExistingSubmission.mockResolvedValue(null)

      const formData = new FormData()
      formData.append("file", new Blob(["test"], { type: "image/png" }), "screenshot.png")

      const res = await app.handle(
        new Request("http://localhost/api/public/hackathons/test-hackathon/submissions/screenshot", {
          method: "POST",
          body: formData,
        })
      )
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.code).toBe("no_submission")
    })

    it("returns 400 when no file provided", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockGetParticipantWithTeam.mockResolvedValue({ participantId: "p1", teamId: null })
      mockGetExistingSubmission.mockResolvedValue(mockSubmission)

      const formData = new FormData()

      const res = await app.handle(
        new Request("http://localhost/api/public/hackathons/test-hackathon/submissions/screenshot", {
          method: "POST",
          body: formData,
        })
      )
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.code).toBe("no_file")
    })

    it("returns 400 for invalid file type", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockGetParticipantWithTeam.mockResolvedValue({ participantId: "p1", teamId: null })
      mockGetExistingSubmission.mockResolvedValue(mockSubmission)

      const formData = new FormData()
      formData.append("file", new Blob(["test"], { type: "application/pdf" }), "doc.pdf")

      const res = await app.handle(
        new Request("http://localhost/api/public/hackathons/test-hackathon/submissions/screenshot", {
          method: "POST",
          body: formData,
        })
      )
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.code).toBe("invalid_file_type")
    })

    it("returns 400 for file too large", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockGetParticipantWithTeam.mockResolvedValue({ participantId: "p1", teamId: null })
      mockGetExistingSubmission.mockResolvedValue(mockSubmission)

      const largeFile = new Blob([new ArrayBuffer(4 * 1024 * 1024 + 1)], { type: "image/png" })
      const formData = new FormData()
      formData.append("file", largeFile, "large.png")

      const res = await app.handle(
        new Request("http://localhost/api/public/hackathons/test-hackathon/submissions/screenshot", {
          method: "POST",
          body: formData,
        })
      )
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.code).toBe("file_too_large")
    })

    it("returns 500 when upload fails", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockGetParticipantWithTeam.mockResolvedValue({ participantId: "p1", teamId: null })
      mockGetExistingSubmission.mockResolvedValue(mockSubmission)
      mockUploadScreenshotVersion.mockResolvedValue(null)

      const formData = new FormData()
      formData.append("file", new Blob(["test"], { type: "image/png" }), "screenshot.png")

      const res = await app.handle(
        new Request("http://localhost/api/public/hackathons/test-hackathon/submissions/screenshot", {
          method: "POST",
          body: formData,
        })
      )
      const data = await res.json()

      expect(res.status).toBe(500)
      expect(data.code).toBe("upload_failed")
    })

    it("returns 500 when submission update fails", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockGetParticipantWithTeam.mockResolvedValue({ participantId: "p1", teamId: null })
      mockGetExistingSubmission.mockResolvedValue(mockSubmission)
      mockUploadScreenshotVersion.mockResolvedValue({
        url: "https://storage.test/screenshot.webp",
        path: "sub123/versions/upload-attempt-0.webp",
      })
      mockUpdateSubmission.mockResolvedValue(null)

      const formData = new FormData()
      formData.append("file", new Blob(["test"], { type: "image/png" }), "screenshot.png")

      const res = await app.handle(
        new Request("http://localhost/api/public/hackathons/test-hackathon/submissions/screenshot", {
          method: "POST",
          body: formData,
        })
      )
      const data = await res.json()

      expect(res.status).toBe(409)
      expect(data.code).toBe("stale_submission")
      expect(mockDeleteScreenshotVersion).toHaveBeenCalledWith(
        "sub123",
        "sub123/versions/upload-attempt-0.webp",
      )
    })

    it("successfully uploads screenshot", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockGetParticipantWithTeam.mockResolvedValue({ participantId: "p1", teamId: null })
      mockGetExistingSubmission.mockResolvedValue(mockSubmission)
      mockUploadScreenshotVersion.mockResolvedValue({
        url: "https://storage.test/screenshot.webp",
        path: "sub123/versions/upload-attempt-0.webp",
      })
      mockUpdateSubmission.mockResolvedValue({
        ...mockSubmission,
        screenshot_url: "https://storage.test/screenshot.webp",
        metadata: {
          screenshotUrls: { "0": "https://storage.test/screenshot.webp" },
          submissionScreenshotPaths: { "0": "sub123/versions/upload-attempt-0.webp" },
        },
      })

      const formData = new FormData()
      formData.append("file", new Blob(["test"], { type: "image/png" }), "screenshot.png")

      const res = await app.handle(
        new Request("http://localhost/api/public/hackathons/test-hackathon/submissions/screenshot", {
          method: "POST",
          body: formData,
        })
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.screenshotUrl).toBe("https://storage.test/screenshot.webp")
    })

    it("calls uploadScreenshot with correct parameters", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockGetParticipantWithTeam.mockResolvedValue({ participantId: "p1", teamId: null })
      mockGetExistingSubmission.mockResolvedValue(mockSubmission)

      const formData = new FormData()
      formData.append("file", new Blob(["test"], { type: "image/jpeg" }), "screenshot.jpg")

      await app.handle(
        new Request("http://localhost/api/public/hackathons/test-hackathon/submissions/screenshot", {
          method: "POST",
          body: formData,
        })
      )

      expect(mockUploadScreenshotVersion).toHaveBeenCalledWith(
        "sub123",
        expect.any(Buffer),
        0,
        expect.any(String),
      )
    })

    it("uploads screenshot to the requested slot", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockGetParticipantWithTeam.mockResolvedValue({ participantId: "p1", teamId: null })
      mockGetExistingSubmission.mockResolvedValue(mockSubmission)

      const formData = new FormData()
      formData.append("file", new Blob(["test"], { type: "image/jpeg" }), "screenshot.jpg")
      formData.append("slot", "1")

      await app.handle(
        new Request("http://localhost/api/public/hackathons/test-hackathon/submissions/screenshot", {
          method: "POST",
          body: formData,
        })
      )

      expect(mockUploadScreenshotVersion).toHaveBeenCalledWith(
        "sub123",
        expect.any(Buffer),
        1,
        expect.any(String),
      )
    })

    it("returns 400 for an invalid upload slot", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockGetParticipantWithTeam.mockResolvedValue({ participantId: "p1", teamId: null })
      mockGetExistingSubmission.mockResolvedValue(mockSubmission)

      const formData = new FormData()
      formData.append("file", new Blob(["test"], { type: "image/png" }), "screenshot.png")
      formData.append("slot", "9")

      const res = await app.handle(
        new Request("http://localhost/api/public/hackathons/test-hackathon/submissions/screenshot", {
          method: "POST",
          body: formData,
        })
      )
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.code).toBe("invalid_screenshot_slot")
      expect(mockUploadScreenshot).not.toHaveBeenCalled()
    })

    it("accepts webp format", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockGetParticipantWithTeam.mockResolvedValue({ participantId: "p1", teamId: null })
      mockGetExistingSubmission.mockResolvedValue(mockSubmission)

      const formData = new FormData()
      formData.append("file", new Blob(["test"], { type: "image/webp" }), "screenshot.webp")

      const res = await app.handle(
        new Request("http://localhost/api/public/hackathons/test-hackathon/submissions/screenshot", {
          method: "POST",
          body: formData,
        })
      )

      expect(res.status).toBe(200)
    })
  })

  describe("DELETE /api/public/hackathons/:slug/submissions/screenshot", () => {
    it("returns 401 when not authenticated", async () => {
      mockAuth.mockResolvedValue({ userId: null })

      const res = await app.handle(
        new Request("http://localhost/api/public/hackathons/test-hackathon/submissions/screenshot", {
          method: "DELETE",
        })
      )
      const data = await res.json()

      expect(res.status).toBe(401)
      expect(data.code).toBe("not_authenticated")
    })

    it("returns 404 when hackathon not found", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(null)

      const res = await app.handle(
        new Request("http://localhost/api/public/hackathons/nonexistent/submissions/screenshot", {
          method: "DELETE",
        })
      )
      const data = await res.json()

      expect(res.status).toBe(404)
      expect(data.code).toBe("hackathon_not_found")
    })

    it("returns 400 when hackathon is not active", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue({ ...mockHackathon, status: "judging" })

      const res = await app.handle(
        new Request("http://localhost/api/public/hackathons/test-hackathon/submissions/screenshot", {
          method: "DELETE",
        })
      )
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.code).toBe("submissions_closed")
    })

    it("returns 403 when user is not registered", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockGetParticipantWithTeam.mockResolvedValue(null)

      const res = await app.handle(
        new Request("http://localhost/api/public/hackathons/test-hackathon/submissions/screenshot", {
          method: "DELETE",
        })
      )
      const data = await res.json()

      expect(res.status).toBe(403)
      expect(data.code).toBe("not_registered")
    })

    it("returns 404 when no submission exists", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockGetParticipantWithTeam.mockResolvedValue({ participantId: "p1", teamId: null })
      mockGetExistingSubmission.mockResolvedValue(null)

      const res = await app.handle(
        new Request("http://localhost/api/public/hackathons/test-hackathon/submissions/screenshot", {
          method: "DELETE",
        })
      )
      const data = await res.json()

      expect(res.status).toBe(404)
      expect(data.code).toBe("no_submission")
    })

    it("successfully deletes screenshot", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockGetParticipantWithTeam.mockResolvedValue({ participantId: "p1", teamId: null })
      mockGetExistingSubmission.mockResolvedValue(mockSubmission)
      mockDeleteScreenshot.mockResolvedValue(true)
      mockUpdateSubmission.mockResolvedValue({ id: "sub123" })

      const res = await app.handle(
        new Request("http://localhost/api/public/hackathons/test-hackathon/submissions/screenshot", {
          method: "DELETE",
        })
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.success).toBe(true)
    })

    it("calls deleteScreenshot with submission id", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockGetParticipantWithTeam.mockResolvedValue({ participantId: "p1", teamId: null })
      mockGetExistingSubmission.mockResolvedValue({
        ...mockSubmission,
        screenshot_url: "https://storage.test/screenshot.webp",
      })

      await app.handle(
        new Request("http://localhost/api/public/hackathons/test-hackathon/submissions/screenshot", {
          method: "DELETE",
        })
      )

      expect(mockDeleteScreenshot).toHaveBeenCalledWith("sub123", 0)
    })

    it("updates submission to clear screenshot URL", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockGetParticipantWithTeam.mockResolvedValue({ participantId: "p1", teamId: null })
      mockGetExistingSubmission.mockResolvedValue(mockSubmission)

      await app.handle(
        new Request("http://localhost/api/public/hackathons/test-hackathon/submissions/screenshot", {
          method: "DELETE",
        })
      )

      expect(mockUpdateSubmission).toHaveBeenCalledWith(
        "sub123",
        "p1",
        null,
        expect.objectContaining({ screenshotUrl: null })
      )
    })

    it("returns 500 when clearing the screenshot URL fails", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockGetParticipantWithTeam.mockResolvedValue({ participantId: "p1", teamId: null })
      mockGetExistingSubmission.mockResolvedValue(mockSubmission)
      mockUpdateSubmission.mockResolvedValue(null)

      const res = await app.handle(
        new Request("http://localhost/api/public/hackathons/test-hackathon/submissions/screenshot", {
          method: "DELETE",
        })
      )
      const data = await res.json()

      expect(res.status).toBe(409)
      expect(data.code).toBe("stale_submission")
      expect(mockDeleteScreenshot).not.toHaveBeenCalled()
    })
  })

  describe("GET /api/public/hackathons/:slug/submissions/me", () => {
    it("returns null submission when not authenticated", async () => {
      mockAuth.mockResolvedValue({ userId: null })

      const res = await app.handle(
        new Request("http://localhost/api/public/hackathons/test-hackathon/submissions/me")
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.submission).toBeNull()
    })

    it("returns null submission when hackathon not found", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(null)

      const res = await app.handle(
        new Request("http://localhost/api/public/hackathons/nonexistent/submissions/me")
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.submission).toBeNull()
    })

    it("returns submission with screenshot URL when exists", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockGetSubmissionForParticipant.mockResolvedValue({
        ...mockSubmission,
        screenshot_url: "https://storage.test/screenshot.webp",
      })

      const res = await app.handle(
        new Request("http://localhost/api/public/hackathons/test-hackathon/submissions/me")
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.submission).not.toBeNull()
      expect(data.submission.screenshotUrl).toBe("https://storage.test/screenshot.webp")
    })
  })

  describe("GET /api/public/hackathons/:slug/submissions", () => {
    it("returns 404 when hackathon not found", async () => {
      mockGetPublicHackathon.mockResolvedValue(null)

      const res = await app.handle(
        new Request("http://localhost/api/public/hackathons/nonexistent/submissions")
      )
      const data = await res.json()

      expect(res.status).toBe(404)
      expect(data.code).toBe("hackathon_not_found")
    })

    it("returns submissions with screenshot URLs", async () => {
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockGetHackathonSubmissions.mockResolvedValue([
        {
          ...mockSubmission,
          screenshot_url: "https://storage.test/screenshot1.webp",
          demo_video_url: null,
          submitter_name: "Test User",
        },
        {
          ...mockSubmission,
          id: "sub456",
          screenshot_url: null,
          demo_video_url: "https://youtube.com/watch?v=123",
          submitter_name: "Another User",
        },
      ])

      const res = await app.handle(
        new Request("http://localhost/api/public/hackathons/test-hackathon/submissions")
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.submissions).toHaveLength(2)
      expect(data.submissions[0].screenshotUrl).toBe("https://storage.test/screenshot1.webp")
      expect(data.submissions[1].screenshotUrl).toBeNull()
    })

    it("hides submitter identity for unpublished anonymous judging", async () => {
      mockGetPublicHackathon.mockResolvedValue({
        ...mockHackathon,
        anonymous_judging: true,
      })
      mockGetHackathonSubmissions.mockResolvedValue([
        { ...mockSubmission, submitter_name: "Private Team" },
      ])

      const res = await app.handle(
        new Request("http://localhost/api/public/hackathons/test-hackathon/submissions")
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.submissions[0].submitter).toBe("Anonymous project")
    })

    it("keeps submitter identity hidden after anonymous results are published", async () => {
      mockGetPublicHackathon.mockResolvedValue({
        ...mockHackathon,
        anonymous_judging: true,
        results_published_at: "2026-08-25T12:00:00.000Z",
      })
      mockGetHackathonSubmissions.mockResolvedValue([
        { ...mockSubmission, submitter_name: "Winning Team" },
      ])

      const res = await app.handle(
        new Request("http://localhost/api/public/hackathons/test-hackathon/submissions")
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.submissions[0].submitter).toBe("Anonymous project")
    })
  })

  describe("GET /api/public/hackathons/:slug/presenter-views/:viewId", () => {
    it("hides submitter identity in anonymous showcase data", async () => {
      mockGetPublicHackathon.mockResolvedValue({
        ...mockHackathon,
        anonymous_judging: true,
      })
      mockGetPresenterView.mockResolvedValue({
        id: PRESENTER_VIEW_ID,
        hackathon_id: mockHackathon.id,
        name: "Finalists",
        config: { kind: "manual", submissionIds: [mockSubmission.id] },
      })
      mockResolvePresenterSubmissions.mockResolvedValue([
        { ...mockSubmission, submitter_name: "Private Team" },
      ])

      const res = await app.handle(
        new Request(
          `http://localhost/api/public/hackathons/test-hackathon/presenter-views/${PRESENTER_VIEW_ID}`,
        ),
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.submissions[0].submitter).toBe("Anonymous project")
      expect(mockGetPublicHackathon).toHaveBeenCalledWith("test-hackathon")
    })

    it("does not use a presenter view UUID to reveal an unpublished event", async () => {
      mockGetPresenterView.mockResolvedValue({
        id: PRESENTER_VIEW_ID,
        hackathon_id: mockHackathon.id,
        name: "Finalists",
        config: { kind: "manual", submissionIds: [mockSubmission.id] },
      })
      mockGetPublicHackathon.mockResolvedValue(null)

      const res = await app.handle(
        new Request(
          `http://localhost/api/public/hackathons/test-hackathon/presenter-views/${PRESENTER_VIEW_ID}`,
        ),
      )

      expect(res.status).toBe(404)
      expect(mockGetPublicHackathon).toHaveBeenCalledWith("test-hackathon")
      expect(mockResolvePresenterSubmissions).not.toHaveBeenCalled()
    })

    it("rejects malformed view capabilities before loading an unpublished event", async () => {
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)

      const res = await app.handle(
        new Request(
          "http://localhost/api/public/hackathons/test-hackathon/presenter-views/not-a-capability",
        ),
      )

      expect(res.status).toBe(404)
      expect(mockGetPresenterView).not.toHaveBeenCalled()
      expect(mockGetPublicHackathon).not.toHaveBeenCalled()
    })

    it("rejects unknown view capabilities before loading an unpublished event", async () => {
      mockGetPresenterView.mockResolvedValue(null)
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)

      const res = await app.handle(
        new Request(
          `http://localhost/api/public/hackathons/test-hackathon/presenter-views/${PRESENTER_VIEW_ID}`,
        ),
      )

      expect(res.status).toBe(404)
      expect(mockGetPresenterView).toHaveBeenCalledWith(PRESENTER_VIEW_ID)
      expect(mockGetPublicHackathon).not.toHaveBeenCalled()
    })
  })
})
