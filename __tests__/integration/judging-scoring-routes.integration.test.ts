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
  PUBLISHED_STATUSES: ["published", "registration_open", "active", "judging", "completed"],
}))

mock.module("@/lib/services/hackathons", () => ({
  registerForHackathon: mock(() => Promise.resolve({ success: true })),
  getParticipantCount: mock(() => Promise.resolve(0)),
  isUserRegistered: mock(() => Promise.resolve(false)),
  getRegistrationInfo: mock(() => Promise.resolve({ participantRole: null })),
}))

mock.module("@/lib/services/tenant-profiles", () => ({
  getPublicTenantWithEvents: mock(() => Promise.resolve(null)),
  isSlugAvailable: mock(() => Promise.resolve(true)),
}))

mock.module("@/lib/integrations/oauth", () => ({
  exchangeCodeForTokens: mock(() => Promise.resolve(null)),
  saveIntegration: mock(() => Promise.resolve()),
  getProviderConfig: mock(() => null),
}))

mock.module("@/lib/services/submissions", () => ({
  getParticipantWithTeam: mock(() => Promise.resolve(null)),
  getSubmissionForParticipant: mock(() => Promise.resolve(null)),
  getExistingSubmission: mock(() => Promise.resolve(null)),
  createSubmission: mock(() => Promise.resolve({ id: "new-sub" })),
  updateSubmission: mock(() => Promise.resolve({ id: "sub123" })),
  getHackathonSubmissions: mock(() => Promise.resolve([])),
  getTeamMemberCount: mock(() => Promise.resolve(0)),
}))

const mockVerifyAssignmentOwnership = mock(() => Promise.resolve(true))
const mockRecalculateForAssignment = mock(() => Promise.resolve())

mock.module("@/lib/services/judging", () => ({
  addJudge: mock(() => Promise.resolve({ success: true })),
  listJudgingCriteria: mock(() => Promise.resolve([])),
  createJudgingCriteria: mock(() => Promise.resolve(null)),
  updateJudgingCriteria: mock(() => Promise.resolve(null)),
  deleteJudgingCriteria: mock(() => Promise.resolve(false)),
  listJudges: mock(() => Promise.resolve([])),
  removeJudge: mock(() => Promise.resolve({ success: false })),
  listJudgeAssignments: mock(() => Promise.resolve([])),
  assignJudgeToSubmission: mock(() => Promise.resolve({ success: false })),
  removeJudgeAssignment: mock(() => Promise.resolve(false)),
  autoAssignJudges: mock(() => Promise.resolve({ assignedCount: 0 })),
  getJudgingProgress: mock(() => Promise.resolve({ totalAssignments: 0, completedAssignments: 0, judges: [] })),
  getJudgeAssignments: mock(() => Promise.resolve([])),
  getAssignmentDetail: mock(() => Promise.resolve(null)),
  submitScores: mock(() => Promise.resolve({ success: true })),
  saveNotes: mock(() => Promise.resolve(true)),
  getJudgingSetupStatus: mock(() => Promise.resolve({ hasCriteria: false, allCriteriaHaveLevels: true, judgeCount: 0, hasSubmissions: false, hasUnassignedSubmissions: false, isReady: false })),
  verifyAssignmentOwnership: mockVerifyAssignmentOwnership,
  recalculateForAssignment: mockRecalculateForAssignment,
  calculatePrizeResults: mock(() => Promise.resolve({ ok: true })),
  removeJudgeFromPrize: mock(() => Promise.resolve({ removedCount: 0 })),
}))

const mockSubmitBucketSortResponse = mock(() => Promise.resolve({ success: true }))
const mockSubmitGateCheckResponse = mock(() => Promise.resolve({ success: true }))

mock.module("@/lib/services/prize-tracks", () => ({
  listPrizeTracks: mock(() => Promise.resolve([])),
  getPrizeTrack: mock(() => Promise.resolve(null)),
  createPrizeTrack: mock(() => Promise.resolve(null)),
  updatePrizeTrack: mock(() => Promise.resolve(null)),
  deletePrizeTrack: mock(() => Promise.resolve(false)),
  listRounds: mock(() => Promise.resolve([])),
  getRound: mock(() => Promise.resolve(null)),
  createRound: mock(() => Promise.resolve(null)),
  updateRound: mock(() => Promise.resolve(null)),
  activateRound: mock(() => Promise.resolve(false)),
  listBucketDefinitions: mock(() => Promise.resolve([])),
  createDefaultBuckets: mock(() => Promise.resolve([])),
  replaceRoundBucketDefinitions: mock(() => Promise.resolve([])),
  submitBucketResponse: mock(() => Promise.resolve(null)),
  getBucketResponse: mock(() => Promise.resolve(null)),
  submitBinaryResponses: mock(() => Promise.resolve()),
  listBinaryResponses: mock(() => Promise.resolve([])),
  submitBucketSortResponse: mockSubmitBucketSortResponse,
  submitGateCheckResponse: mockSubmitGateCheckResponse,
  getTrackProgress: mock(() => Promise.resolve([])),
  getPrizeTrackWithDetails: mock(() => Promise.resolve(null)),
  calculateBucketSortResults: mock(() => Promise.resolve(null)),
  calculateGateCheckResults: mock(() => Promise.resolve(null)),
  getJudgeTrackAssignments: mock(() => Promise.resolve([])),
  getTrackWorkflowData: mock(() => Promise.resolve([])),
}))

const { Elysia } = await import("elysia")
const { publicRoutes } = await import("@/lib/api/routes/public")
const { handleRouteError } = await import("@/lib/api/routes/errors")

const app = new Elysia({ prefix: "/api" })
  .onError(({ error, set, path }) => handleRouteError(error, set, path))
  .use(publicRoutes)

const VALID_ASSIGNMENT_ID = "11111111-1111-1111-1111-111111111111"

const mockHackathon = {
  id: "22222222-2222-2222-2222-222222222222",
  name: "Test Hackathon",
  slug: "test-hackathon",
  status: "judging",
  organizer: {
    id: "t1",
    name: "Test Org",
    slug: "test-org",
    clerk_org_id: "org_test",
    logo_url: null,
  },
}

describe("Judging Scoring Routes", () => {
  beforeEach(() => {
    mockAuth.mockReset()
    mockGetPublicHackathon.mockReset()
    mockVerifyAssignmentOwnership.mockReset()
    mockRecalculateForAssignment.mockReset()
    mockSubmitBucketSortResponse.mockReset()
    mockSubmitGateCheckResponse.mockReset()

    mockVerifyAssignmentOwnership.mockResolvedValue(true)
    mockRecalculateForAssignment.mockResolvedValue(undefined)
  })

  describe("POST /api/public/hackathons/:slug/judging/assignments/:assignmentId/bucket-sort", () => {
    function bucketSortUrl(slug: string, assignmentId: string) {
      return `http://localhost/api/public/hackathons/${slug}/judging/assignments/${assignmentId}/bucket-sort`
    }

    const validBody = {
      bucketId: "bucket-1",
      gates: [{ criteriaId: "c1", passed: true }],
      notes: "Good project",
    }

    it("returns 401 when not authenticated", async () => {
      mockAuth.mockResolvedValue({ userId: null })

      const res = await app.handle(
        new Request(bucketSortUrl("test-hackathon", VALID_ASSIGNMENT_ID), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validBody),
        })
      )
      const data = await res.json()

      expect(res.status).toBe(401)
      expect(data.code).toBe("not_authenticated")
    })

    it("returns 404 when hackathon slug not found", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(null)

      const res = await app.handle(
        new Request(bucketSortUrl("nonexistent", VALID_ASSIGNMENT_ID), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validBody),
        })
      )
      const data = await res.json()

      expect(res.status).toBe(404)
      expect(data.error).toBe("Hackathon not found")
    })

    it("returns 400 when hackathon is not in judging phase", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue({ ...mockHackathon, status: "completed" })

      const res = await app.handle(
        new Request(bucketSortUrl("test-hackathon", VALID_ASSIGNMENT_ID), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validBody),
        })
      )
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.code).toBe("not_judging")
    })

    it("returns 404 when assignment ownership verification fails", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockVerifyAssignmentOwnership.mockResolvedValue(false)

      const res = await app.handle(
        new Request(bucketSortUrl("test-hackathon", VALID_ASSIGNMENT_ID), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validBody),
        })
      )
      const data = await res.json()

      expect(res.status).toBe(404)
      expect(data.code).toBe("not_found")
    })

    it("returns success when bucket sort submission succeeds", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockVerifyAssignmentOwnership.mockResolvedValue(true)
      mockSubmitBucketSortResponse.mockResolvedValue({ success: true })

      const res = await app.handle(
        new Request(bucketSortUrl("test-hackathon", VALID_ASSIGNMENT_ID), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validBody),
        })
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.success).toBe(true)
    })

    it("allows submission when hackathon status is active", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue({ ...mockHackathon, status: "active" })
      mockVerifyAssignmentOwnership.mockResolvedValue(true)
      mockSubmitBucketSortResponse.mockResolvedValue({ success: true })

      const res = await app.handle(
        new Request(bucketSortUrl("test-hackathon", VALID_ASSIGNMENT_ID), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validBody),
        })
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.success).toBe(true)
    })

    it("returns 400 when bucket sort service returns failure", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockVerifyAssignmentOwnership.mockResolvedValue(true)
      mockSubmitBucketSortResponse.mockResolvedValue({
        success: false,
        error: "Failed to submit bucket response",
        code: "bucket_failed",
      })

      const res = await app.handle(
        new Request(bucketSortUrl("test-hackathon", VALID_ASSIGNMENT_ID), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validBody),
        })
      )
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.code).toBe("bucket_failed")
    })

    it("triggers recalculation after successful submission", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockVerifyAssignmentOwnership.mockResolvedValue(true)
      mockSubmitBucketSortResponse.mockResolvedValue({ success: true })

      await app.handle(
        new Request(bucketSortUrl("test-hackathon", VALID_ASSIGNMENT_ID), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validBody),
        })
      )

      await new Promise((r) => setTimeout(r, 50))
      expect(mockRecalculateForAssignment).toHaveBeenCalledWith(VALID_ASSIGNMENT_ID)
    })

    it("passes correct parameters to verifyAssignmentOwnership", async () => {
      mockAuth.mockResolvedValue({ userId: "user_judge" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockVerifyAssignmentOwnership.mockResolvedValue(true)
      mockSubmitBucketSortResponse.mockResolvedValue({ success: true })

      await app.handle(
        new Request(bucketSortUrl("test-hackathon", VALID_ASSIGNMENT_ID), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validBody),
        })
      )

      expect(mockVerifyAssignmentOwnership).toHaveBeenCalledWith(VALID_ASSIGNMENT_ID, "user_judge")
    })
  })

  describe("POST /api/public/hackathons/:slug/judging/assignments/:assignmentId/gate-check", () => {
    function gateCheckUrl(slug: string, assignmentId: string) {
      return `http://localhost/api/public/hackathons/${slug}/judging/assignments/${assignmentId}/gate-check`
    }

    const validBody = {
      gates: [
        { criteriaId: "c1", passed: true },
        { criteriaId: "c2", passed: false },
      ],
    }

    it("returns 401 when not authenticated", async () => {
      mockAuth.mockResolvedValue({ userId: null })

      const res = await app.handle(
        new Request(gateCheckUrl("test-hackathon", VALID_ASSIGNMENT_ID), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validBody),
        })
      )
      const data = await res.json()

      expect(res.status).toBe(401)
      expect(data.code).toBe("not_authenticated")
    })

    it("returns 404 when hackathon slug not found", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(null)

      const res = await app.handle(
        new Request(gateCheckUrl("nonexistent", VALID_ASSIGNMENT_ID), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validBody),
        })
      )
      const data = await res.json()

      expect(res.status).toBe(404)
      expect(data.error).toBe("Hackathon not found")
    })

    it("returns 400 when hackathon is not in judging phase", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue({ ...mockHackathon, status: "completed" })

      const res = await app.handle(
        new Request(gateCheckUrl("test-hackathon", VALID_ASSIGNMENT_ID), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validBody),
        })
      )
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.code).toBe("not_judging")
    })

    it("returns 404 when assignment ownership verification fails", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockVerifyAssignmentOwnership.mockResolvedValue(false)

      const res = await app.handle(
        new Request(gateCheckUrl("test-hackathon", VALID_ASSIGNMENT_ID), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validBody),
        })
      )
      const data = await res.json()

      expect(res.status).toBe(404)
      expect(data.code).toBe("not_found")
    })

    it("returns success when gate check submission succeeds", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockVerifyAssignmentOwnership.mockResolvedValue(true)
      mockSubmitGateCheckResponse.mockResolvedValue({ success: true })

      const res = await app.handle(
        new Request(gateCheckUrl("test-hackathon", VALID_ASSIGNMENT_ID), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validBody),
        })
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.success).toBe(true)
    })

    it("allows submission when hackathon status is active", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue({ ...mockHackathon, status: "active" })
      mockVerifyAssignmentOwnership.mockResolvedValue(true)
      mockSubmitGateCheckResponse.mockResolvedValue({ success: true })

      const res = await app.handle(
        new Request(gateCheckUrl("test-hackathon", VALID_ASSIGNMENT_ID), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validBody),
        })
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.success).toBe(true)
    })

    it("returns 400 when gate check service returns failure", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockVerifyAssignmentOwnership.mockResolvedValue(true)
      mockSubmitGateCheckResponse.mockResolvedValue({
        success: false,
        error: "Failed to mark assignment complete",
        code: "update_failed",
      })

      const res = await app.handle(
        new Request(gateCheckUrl("test-hackathon", VALID_ASSIGNMENT_ID), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validBody),
        })
      )
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.code).toBe("update_failed")
    })

    it("triggers recalculation after successful submission", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockVerifyAssignmentOwnership.mockResolvedValue(true)
      mockSubmitGateCheckResponse.mockResolvedValue({ success: true })

      await app.handle(
        new Request(gateCheckUrl("test-hackathon", VALID_ASSIGNMENT_ID), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validBody),
        })
      )

      await new Promise((r) => setTimeout(r, 50))
      expect(mockRecalculateForAssignment).toHaveBeenCalledWith(VALID_ASSIGNMENT_ID)
    })

    it("passes correct parameters to verifyAssignmentOwnership", async () => {
      mockAuth.mockResolvedValue({ userId: "user_judge" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockVerifyAssignmentOwnership.mockResolvedValue(true)
      mockSubmitGateCheckResponse.mockResolvedValue({ success: true })

      await app.handle(
        new Request(gateCheckUrl("test-hackathon", VALID_ASSIGNMENT_ID), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validBody),
        })
      )

      expect(mockVerifyAssignmentOwnership).toHaveBeenCalledWith(VALID_ASSIGNMENT_ID, "user_judge")
    })

    it("passes gates array to submitGateCheckResponse", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockVerifyAssignmentOwnership.mockResolvedValue(true)
      mockSubmitGateCheckResponse.mockResolvedValue({ success: true })

      await app.handle(
        new Request(gateCheckUrl("test-hackathon", VALID_ASSIGNMENT_ID), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validBody),
        })
      )

      expect(mockSubmitGateCheckResponse).toHaveBeenCalledWith(
        VALID_ASSIGNMENT_ID,
        validBody.gates
      )
    })
  })
})
