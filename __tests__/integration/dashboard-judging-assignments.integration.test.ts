import { describe, expect, it, mock, beforeEach } from "bun:test"

const mockCheckHackathonOrganizer = mock(() =>
  Promise.resolve({ status: "ok" })
)

mock.module("@/lib/services/public-hackathons", () => ({
  checkHackathonOrganizer: mockCheckHackathonOrganizer,
}))

const mockListJudgeSubmissionAssignments = mock(() => Promise.resolve([]))
const mockAssignJudgeToSubmission = mock(() =>
  Promise.resolve({ success: true, alreadyAssigned: false })
)
const mockUnassignJudgeFromSubmission = mock(() =>
  Promise.resolve({ success: true, removed: true })
)

mock.module("@/lib/services/judging", () => ({
  listJudgeSubmissionAssignments: mockListJudgeSubmissionAssignments,
  assignJudgeToSubmission: mockAssignJudgeToSubmission,
  unassignJudgeFromSubmission: mockUnassignJudgeFromSubmission,
}))

mock.module("@clerk/nextjs/server", () => ({
  auth: mock(() => Promise.resolve({ userId: "user_123", orgId: "org_123" })),
  clerkClient: mock(() => Promise.resolve({ users: {} })),
}))

const mockResolvePrincipal = mock(() =>
  Promise.resolve({
    kind: "user",
    tenantId: "org_123",
    userId: "user_123",
    scopes: ["hackathons:read", "hackathons:write"],
  })
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
    requirePrincipal: (principal: unknown, _types: string[], scopes?: string[]) => {
      if (!principal || (principal as { kind: string }).kind === "anon") {
        throw new AuthError("Unauthorized", 401)
      }
      if (scopes && scopes.length > 0) {
        const principalScopes = (principal as { scopes: string[] }).scopes || []
        for (const scope of scopes) {
          if (!principalScopes.includes(scope)) {
            throw new AuthError(`Missing required scope: ${scope}`, 403)
          }
        }
      }
      return principal
    },
    AuthError,
  }
})

const mockLogAudit = mock(() => Promise.resolve(null))

mock.module("@/lib/services/audit", () => ({
  logAudit: mockLogAudit,
}))

mock.module("@/lib/auth/resolve-adder-name", () => ({
  resolveAdder: mock(() => Promise.resolve({ name: "Test User", email: null })),
  resolveAdderName: mock(() => Promise.resolve("Test User")),
  resolveAdderEmail: mock(() => Promise.resolve(null)),
}))

mock.module("@/lib/services/rate-limit", () => ({
  checkRateLimit: () => ({ allowed: true, remaining: 100, resetAt: Date.now() + 60000 }),
  getRateLimitHeaders: () => ({}),
  defaultRateLimits: {},
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
const { dashboardJudgingRoutes } = await import("@/lib/api/routes/dashboard-judging")
const { handleRouteError } = await import("@/lib/api/routes/errors")

const app = new Elysia({ prefix: "/api/dashboard" })
  .onError(({ error, set, path }) => handleRouteError(error, set, path))
  .use(dashboardJudgingRoutes)

const HACKATHON_ID = "11111111-1111-1111-1111-111111111111"
const JUDGE_ID = "22222222-2222-2222-2222-222222222222"
const SUBMISSION_ID = "33333333-3333-3333-3333-333333333333"

function urlFor(path: string) {
  return `http://localhost/api/dashboard${path}`
}

describe("dashboard judge↔submission assignment routes", () => {
  beforeEach(() => {
    mockCheckHackathonOrganizer.mockReset()
    mockCheckHackathonOrganizer.mockResolvedValue({ status: "ok" })
    mockListJudgeSubmissionAssignments.mockReset()
    mockListJudgeSubmissionAssignments.mockResolvedValue([])
    mockAssignJudgeToSubmission.mockReset()
    mockAssignJudgeToSubmission.mockResolvedValue({ success: true, alreadyAssigned: false })
    mockUnassignJudgeFromSubmission.mockReset()
    mockUnassignJudgeFromSubmission.mockResolvedValue({ success: true, removed: true })
    mockLogAudit.mockClear()
  })

  describe("GET /judges/:participantId/submissions", () => {
    it("returns the assignment list from the service", async () => {
      mockListJudgeSubmissionAssignments.mockResolvedValueOnce([
        {
          submissionId: "s1",
          projectTitle: "Apple",
          teamId: "t1",
          teamName: "Team A",
          isAssigned: true,
          isOwnTeam: false,
        },
      ])

      const res = await app.handle(
        new Request(
          urlFor(`/hackathons/${HACKATHON_ID}/judging/judges/${JUDGE_ID}/submissions`)
        )
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.submissions).toHaveLength(1)
      expect(data.submissions[0].submissionId).toBe("s1")
      expect(mockListJudgeSubmissionAssignments).toHaveBeenCalledWith(HACKATHON_ID, JUDGE_ID)
    })

    it("returns 404 for non-UUID participant", async () => {
      const res = await app.handle(
        new Request(
          urlFor(`/hackathons/${HACKATHON_ID}/judging/judges/not-a-uuid/submissions`)
        )
      )
      expect(res.status).toBe(404)
      expect(mockListJudgeSubmissionAssignments).not.toHaveBeenCalled()
    })

    it("returns 403 when caller is not an organizer", async () => {
      mockCheckHackathonOrganizer.mockResolvedValueOnce({ status: "not_authorized" })

      const res = await app.handle(
        new Request(
          urlFor(`/hackathons/${HACKATHON_ID}/judging/judges/${JUDGE_ID}/submissions`)
        )
      )
      expect(res.status).toBe(403)
    })
  })

  describe("POST /judges/:participantId/submissions/:submissionId", () => {
    it("calls assignJudgeToSubmission and returns success", async () => {
      const res = await app.handle(
        new Request(
          urlFor(
            `/hackathons/${HACKATHON_ID}/judging/judges/${JUDGE_ID}/submissions/${SUBMISSION_ID}`
          ),
          { method: "POST" }
        )
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.success).toBe(true)
      expect(mockAssignJudgeToSubmission).toHaveBeenCalledWith(
        HACKATHON_ID,
        JUDGE_ID,
        SUBMISSION_ID
      )
      expect(mockLogAudit).toHaveBeenCalledTimes(1)
      const auditArg = mockLogAudit.mock.calls[0][0] as { action: string }
      expect(auditArg.action).toBe("judge_assignment.created")
    })

    it("does not audit when assignment already exists (idempotent)", async () => {
      mockAssignJudgeToSubmission.mockResolvedValueOnce({
        success: true,
        alreadyAssigned: true,
      })

      const res = await app.handle(
        new Request(
          urlFor(
            `/hackathons/${HACKATHON_ID}/judging/judges/${JUDGE_ID}/submissions/${SUBMISSION_ID}`
          ),
          { method: "POST" }
        )
      )

      expect(res.status).toBe(200)
      expect(mockLogAudit).not.toHaveBeenCalled()
    })

    it("returns 400 when service rejects (e.g. own team)", async () => {
      mockAssignJudgeToSubmission.mockResolvedValueOnce({
        success: false,
        error: "Judges can't score their own team's project",
      })

      const res = await app.handle(
        new Request(
          urlFor(
            `/hackathons/${HACKATHON_ID}/judging/judges/${JUDGE_ID}/submissions/${SUBMISSION_ID}`
          ),
          { method: "POST" }
        )
      )
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.error).toContain("own team")
    })

    it("returns 404 when submission id is not a UUID", async () => {
      const res = await app.handle(
        new Request(
          urlFor(
            `/hackathons/${HACKATHON_ID}/judging/judges/${JUDGE_ID}/submissions/not-a-uuid`
          ),
          { method: "POST" }
        )
      )
      expect(res.status).toBe(404)
      expect(mockAssignJudgeToSubmission).not.toHaveBeenCalled()
    })
  })

  describe("DELETE /judges/:participantId/submissions/:submissionId", () => {
    it("calls unassignJudgeFromSubmission and returns success", async () => {
      const res = await app.handle(
        new Request(
          urlFor(
            `/hackathons/${HACKATHON_ID}/judging/judges/${JUDGE_ID}/submissions/${SUBMISSION_ID}`
          ),
          { method: "DELETE" }
        )
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.removed).toBe(true)
      expect(mockUnassignJudgeFromSubmission).toHaveBeenCalledWith(
        HACKATHON_ID,
        JUDGE_ID,
        SUBMISSION_ID
      )
      expect(mockLogAudit).toHaveBeenCalledTimes(1)
      const auditArg = mockLogAudit.mock.calls[0][0] as { action: string }
      expect(auditArg.action).toBe("judge_assignment.deleted")
    })

    it("does not audit when nothing was removed (no existing assignment)", async () => {
      mockUnassignJudgeFromSubmission.mockResolvedValueOnce({ success: true, removed: false })

      const res = await app.handle(
        new Request(
          urlFor(
            `/hackathons/${HACKATHON_ID}/judging/judges/${JUDGE_ID}/submissions/${SUBMISSION_ID}`
          ),
          { method: "DELETE" }
        )
      )

      expect(res.status).toBe(200)
      expect(mockLogAudit).not.toHaveBeenCalled()
    })

    it("returns 404 when judge id is not a UUID", async () => {
      const res = await app.handle(
        new Request(
          urlFor(
            `/hackathons/${HACKATHON_ID}/judging/judges/not-a-uuid/submissions/${SUBMISSION_ID}`
          ),
          { method: "DELETE" }
        )
      )
      expect(res.status).toBe(404)
      expect(mockUnassignJudgeFromSubmission).not.toHaveBeenCalled()
    })
  })
})
