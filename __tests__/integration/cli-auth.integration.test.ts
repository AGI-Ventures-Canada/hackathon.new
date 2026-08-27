import { describe, expect, it, mock, beforeEach } from "bun:test"

const mockCreateCliAuthSession = mock(() =>
  Promise.resolve({
    id: "session-1",
    device_token: "a".repeat(64),
    status: "pending",
    expires_at: new Date(Date.now() + 300_000).toISOString(),
  })
)
const mockPollCliAuthSession = mock(() =>
  Promise.resolve({ status: "pending" as const })
)

mock.module("@/lib/services/cli-auth", () => ({
  createCliAuthSession: mockCreateCliAuthSession,
  pollCliAuthSession: mockPollCliAuthSession,
  completeCliAuthSession: mock(() => Promise.resolve({ success: true })),
  isValidCliDeviceToken: (token: string) => /^[a-f0-9]{64}$/.test(token),
}))

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

mock.module("@clerk/nextjs/server", () => ({
  auth: mock(() => Promise.resolve({ userId: null, orgId: null })),
  clerkClient: mock(() => Promise.resolve({
    organizations: {
      getOrganization: mock(() => Promise.resolve({ name: "Test Org" })),
    },
    users: {
      getUser: mock(() => Promise.resolve({ firstName: "Test", lastName: "User", username: null, emailAddresses: [] })),
    },
  })),
}))

mock.module("@/lib/services/public-hackathons", () => ({
  getPublicHackathon: mock(() => Promise.resolve(null)),
  getPublicHackathonById: mock(() => Promise.resolve(null)),
  listPublicHackathons: mock(() => Promise.resolve({ hackathons: [], total: 0 })),
  getHackathonByIdForOrganizer: mock(() => Promise.resolve(null)),
  checkHackathonOrganizer: mock(() => Promise.resolve({ status: "not_found" })),
  getHackathonByIdWithFullData: mock(() => Promise.resolve(null)),
  getHackathonByIdWithAccess: mock(() => Promise.resolve(null)),
  updateHackathonSettings: mock(() => Promise.resolve(null)),
}))

mock.module("@/lib/services/hackathons", () => ({
  registerForHackathon: mock(() => Promise.resolve({ success: false })),
  getParticipantCount: mock(() => Promise.resolve(0)),
  isUserRegistered: mock(() => Promise.resolve(false)),
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
  createSubmission: mock(() => Promise.resolve(null)),
  updateSubmission: mock(() => Promise.resolve(null)),
  getHackathonSubmissions: mock(() => Promise.resolve([])),
  getTeamMemberCount: mock(() => Promise.resolve(0)),
  notifySubmissionMembers: mock(() => Promise.resolve(0)),
  isSubmissionWindowOpen: mock(() => Promise.resolve(true)),
}))

mock.module("@/lib/utils/url", () => ({
  urlInputProps: { type: "text", inputMode: "url", autoCapitalize: "none", spellCheck: false },
  normalizeUrl: mock((url: string) => url),
  normalizeUrlFieldValue: mock((url: string) => url),
  normalizeOptionalUrl: mock((url: string | null | undefined) => url ?? null),
}))

const { Elysia } = await import("elysia")
const { publicRoutes } = await import("@/lib/api/routes/public")

const publicApp = new Elysia({ prefix: "/api" }).use(publicRoutes)

const validToken = "a".repeat(64)

describe("CLI Auth Routes Integration Tests", () => {
  beforeEach(() => {
    mockCreateCliAuthSession.mockClear()
    mockPollCliAuthSession.mockClear()
  })

  describe("GET /api/public/cli-auth/poll", () => {
    it("returns pending status for new session", async () => {
      mockPollCliAuthSession.mockResolvedValueOnce({ status: "pending" })

      const res = await publicApp.handle(
        new Request(`http://localhost/api/public/cli-auth/poll?token=${validToken}`)
      )

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.status).toBe("pending")
    })

    it("returns complete with API key", async () => {
      mockPollCliAuthSession.mockResolvedValueOnce({
        status: "complete",
        apiKey: "sk_live_test123",
      })

      const res = await publicApp.handle(
        new Request(`http://localhost/api/public/cli-auth/poll?token=${validToken}`)
      )

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.status).toBe("complete")
      expect(data.apiKey).toBe("sk_live_test123")
    })

    it("creates new session when expired and returns pending", async () => {
      mockPollCliAuthSession.mockResolvedValueOnce({ status: "expired" })

      const res = await publicApp.handle(
        new Request(`http://localhost/api/public/cli-auth/poll?token=${validToken}`)
      )

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.status).toBe("pending")
      expect(mockCreateCliAuthSession).toHaveBeenCalledWith(validToken)
    })

    it("returns pending even if session re-creation fails", async () => {
      mockPollCliAuthSession.mockResolvedValueOnce({ status: "expired" })
      mockCreateCliAuthSession.mockRejectedValueOnce(new Error("DB error"))

      const res = await publicApp.handle(
        new Request(`http://localhost/api/public/cli-auth/poll?token=${validToken}`)
      )

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.status).toBe("pending")
    })

    it("returns 400 for short token", async () => {
      const res = await publicApp.handle(
        new Request("http://localhost/api/public/cli-auth/poll?token=short")
      )

      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toBe("Invalid token")
    })

    it("returns 422 when token query param is missing", async () => {
      const res = await publicApp.handle(
        new Request("http://localhost/api/public/cli-auth/poll")
      )

      expect(res.status).toBe(422)
    })

    it("does not require authentication", async () => {
      mockPollCliAuthSession.mockResolvedValueOnce({ status: "pending" })

      const res = await publicApp.handle(
        new Request(`http://localhost/api/public/cli-auth/poll?token=${validToken}`)
      )

      expect(res.status).toBe(200)
    })
  })
})
