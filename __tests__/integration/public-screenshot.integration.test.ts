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

const mockUploadScreenshot = mock(() => Promise.resolve({ url: "https://storage.test/screenshot.webp", path: "sub123/screenshot.webp" }))
const mockDeleteScreenshot = mock(() => Promise.resolve(true))

mock.module("@/lib/services/storage", () => ({
  uploadScreenshot: mockUploadScreenshot,
  deleteScreenshot: mockDeleteScreenshot,
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

mock.module("@/lib/services/webhooks", () => ({
  triggerWebhooks: mock(() => Promise.resolve()),
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

describe("Public Screenshot Routes", () => {
  beforeEach(() => {
    mockAuth.mockReset()
    mockGetPublicHackathon.mockReset()
    mockGetParticipantWithTeam.mockReset()
    mockGetExistingSubmission.mockReset()
    mockCreateSubmission.mockReset()
    mockUpdateSubmission.mockReset()
    mockUploadScreenshot.mockReset()
    mockDeleteScreenshot.mockReset()
    mockGetSubmissionForParticipant.mockReset()
    mockGetHackathonSubmissions.mockReset()
    mockNotifySubmissionMembers.mockReset()
    mockNotifySubmissionMembers.mockImplementation(() => Promise.resolve(0))

    mockCreateSubmission.mockImplementation(() => Promise.resolve({ id: "new-sub" }))
    mockUpdateSubmission.mockImplementation(() => Promise.resolve({ id: "sub123" }))
    mockUploadScreenshot.mockImplementation(() => Promise.resolve({ url: "https://storage.test/screenshot.webp", path: "sub123/screenshot.webp" }))
    mockDeleteScreenshot.mockImplementation(() => Promise.resolve(true))
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

      const largeFile = new Blob([new ArrayBuffer(11 * 1024 * 1024)], { type: "image/png" })
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
      mockUploadScreenshot.mockResolvedValue(null)

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
      mockUploadScreenshot.mockResolvedValue({ url: "https://storage.test/screenshot.webp", path: "sub123/screenshot.webp" })
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

      expect(res.status).toBe(500)
      expect(data.code).toBe("update_failed")
    })

    it("successfully uploads screenshot", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockGetParticipantWithTeam.mockResolvedValue({ participantId: "p1", teamId: null })
      mockGetExistingSubmission.mockResolvedValue(mockSubmission)
      mockUploadScreenshot.mockResolvedValue({ url: "https://storage.test/screenshot.webp", path: "sub123/screenshot.webp" })
      mockUpdateSubmission.mockResolvedValue({ id: "sub123" })

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

      expect(mockUploadScreenshot).toHaveBeenCalledWith(
        "sub123",
        expect.any(Buffer),
        0
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

      expect(mockUploadScreenshot).toHaveBeenCalledWith(
        "sub123",
        expect.any(Buffer),
        1
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
      mockGetExistingSubmission.mockResolvedValue(mockSubmission)

      await app.handle(
        new Request("http://localhost/api/public/hackathons/test-hackathon/submissions/screenshot", {
          method: "DELETE",
        })
      )

      expect(mockDeleteScreenshot).toHaveBeenCalledWith("sub123")
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

      expect(res.status).toBe(500)
      expect(data.code).toBe("update_failed")
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
  })
})
