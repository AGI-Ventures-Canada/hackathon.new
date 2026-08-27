import { describe, expect, it, mock, beforeEach } from "bun:test"

const mockAuth = mock(() => Promise.resolve({ userId: null }))
const mockGetPublicHackathon = mock(() => Promise.resolve(null))
const mockRegisterForHackathon = mock(() =>
  Promise.resolve({ success: true, participantId: "p1", teamId: "t1" })
)
const mockGetParticipantCount = mock(() => Promise.resolve(42))
const mockIsUserRegistered = mock(() => Promise.resolve(false))
const mockFindPendingTeamInvitationForEmails = mock(() => Promise.resolve(null))

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
        emailAddresses: [{
          emailAddress: "captain@example.com",
          verification: { status: "verified" },
        }],
      })),
    },
  })),
}))

const mockGetPublicHackathonById = mock(() => Promise.resolve(null))

const mockCurrentTermsHash = mock(() => Promise.resolve(null as string | null))
const mockRecordTermsAcceptance = mock(() => Promise.resolve())

mock.module("@/lib/services/hackathon-terms", () => ({
  currentTermsHash: mockCurrentTermsHash,
  recordTermsAcceptance: mockRecordTermsAcceptance,
}))

mock.module("@/lib/services/public-hackathons", () => ({
  getPublicHackathon: mockGetPublicHackathon,
  getPublicHackathonById: mockGetPublicHackathonById,
  listPublicHackathons: mock(() => Promise.resolve({ hackathons: [], total: 0 })),
  getHackathonByIdForOrganizer: mock(() => Promise.resolve(null)),
  checkHackathonOrganizer: mock(() => Promise.resolve({ status: "not_found" })),
  getHackathonByIdWithFullData: mock(() => Promise.resolve(null)),
  getHackathonByIdWithAccess: mock(() => Promise.resolve(null)),
  updateHackathonSettings: mock(() => Promise.resolve(null)),
}))

mock.module("@/lib/services/hackathons", () => ({
  registerForHackathon: mockRegisterForHackathon,
  getParticipantCount: mockGetParticipantCount,
  isUserRegistered: mockIsUserRegistered,
}))
mock.module("@/lib/services/team-invitations", () => ({
  findPendingTeamInvitationForEmails: mockFindPendingTeamInvitationForEmails,
}))

const mockGetPublicTenantWithEvents = mock(() => Promise.resolve(null))

mock.module("@/lib/services/tenant-profiles", () => ({
  getPublicTenantWithEvents: mockGetPublicTenantWithEvents,
  isSlugAvailable: mock(() => Promise.resolve(true)),
}))

mock.module("@/lib/integrations/oauth", () => ({
  exchangeCodeForTokens: mock(() => Promise.resolve(null)),
  saveIntegration: mock(() => Promise.resolve()),
  getProviderConfig: mock(() => null),
}))

const { Elysia } = await import("elysia")
const { publicRoutes } = await import("@/lib/api/routes/public")

const app = new Elysia({ prefix: "/api" }).use(publicRoutes)

const mockHackathon = {
  id: "h1",
  name: "Test Hackathon",
  slug: "test-hackathon",
  description: "A test hackathon",
  rules: null,
  banner_url: null,
  status: "registration_open",
  starts_at: "2026-03-01T00:00:00Z",
  ends_at: "2026-03-02T00:00:00Z",
  registration_opens_at: "2026-01-01T00:00:00Z",
  registration_closes_at: "2026-02-28T00:00:00Z",
  allow_late_registration: true,
  organizer: {
    id: "t1",
    name: "Test Org",
    slug: "test-org",
    logo_url: null,
  },
  sponsors: [],
}

describe("Public Registration Routes", () => {
  beforeEach(() => {
    mockAuth.mockReset()
    mockGetPublicHackathon.mockReset()
    mockGetPublicHackathonById.mockReset()
    mockRegisterForHackathon.mockReset()
    mockGetParticipantCount.mockReset()
    mockIsUserRegistered.mockReset()
    mockGetPublicTenantWithEvents.mockReset()
    mockCurrentTermsHash.mockReset()
    mockRecordTermsAcceptance.mockReset()
    mockFindPendingTeamInvitationForEmails.mockReset()
    mockFindPendingTeamInvitationForEmails.mockResolvedValue(null)
    mockCurrentTermsHash.mockResolvedValue(null)
  })

  it("does not expose the retired unsigned OAuth callback", async () => {
    const state = Buffer.from(JSON.stringify({
      tenantId: "11111111-1111-1111-1111-111111111111",
      userId: "attacker",
    })).toString("base64url")
    const res = await app.handle(new Request(
      `http://localhost/api/public/integrations/gmail/callback?code=code&state=${state}`,
    ))

    expect(res.status).toBe(404)
  })

  describe("POST /api/public/hackathons/:slug/register", () => {
    it("returns 401 when not authenticated", async () => {
      mockAuth.mockResolvedValue({ userId: null })

      const res = await app.handle(
        new Request("http://localhost/api/public/hackathons/test-hackathon/register", {
          method: "POST",
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
        new Request("http://localhost/api/public/hackathons/nonexistent/register", {
          method: "POST",
        })
      )
      const data = await res.json()

      expect(res.status).toBe(404)
      expect(data.code).toBe("hackathon_not_found")
    })

    it("returns success when registration succeeds", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockRegisterForHackathon.mockResolvedValue({
        success: true,
        participantId: "p123",
        teamId: "t123",
      })

      const res = await app.handle(
        new Request("http://localhost/api/public/hackathons/test-hackathon/register", {
          method: "POST",
        })
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.participantId).toBe("p123")
      expect(data.teamId).toBe("t123")
    })

    it("returns 409 when already registered", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockRegisterForHackathon.mockResolvedValue({
        success: false,
        error: "Already registered for this hackathon",
        code: "already_registered",
      })

      const res = await app.handle(
        new Request("http://localhost/api/public/hackathons/test-hackathon/register", {
          method: "POST",
        })
      )
      const data = await res.json()

      expect(res.status).toBe(409)
      expect(data.code).toBe("already_registered")
    })

    it("opens the matching team invite instead of creating a new team", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockFindPendingTeamInvitationForEmails.mockResolvedValue({
        token: "invite-token",
        teamName: "Captain's Team",
      })

      const res = await app.handle(
        new Request("http://localhost/api/public/hackathons/test-hackathon/register", {
          method: "POST",
        }),
      )

      expect(res.status).toBe(409)
      expect(await res.json()).toMatchObject({
        code: "pending_team_invitation",
        inviteUrl: "/invite/invite-token",
      })
      expect(mockRegisterForHackathon).not.toHaveBeenCalled()
    })

    it("returns 400 when registration is not open", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockRegisterForHackathon.mockResolvedValue({
        success: false,
        error: "Registration is not open",
        code: "registration_not_open",
      })

      const res = await app.handle(
        new Request("http://localhost/api/public/hackathons/test-hackathon/register", {
          method: "POST",
        })
      )
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.code).toBe("registration_not_open")
    })

    it("returns 400 when at capacity", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockRegisterForHackathon.mockResolvedValue({
        success: false,
        error: "Event is at full capacity",
        code: "at_capacity",
      })

      const res = await app.handle(
        new Request("http://localhost/api/public/hackathons/test-hackathon/register", {
          method: "POST",
        })
      )
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.code).toBe("at_capacity")
    })

    it("returns 400 when event has ended", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockRegisterForHackathon.mockResolvedValue({
        success: false,
        error: "This event has ended",
        code: "event_ended",
      })

      const res = await app.handle(
        new Request("http://localhost/api/public/hackathons/test-hackathon/register", {
          method: "POST",
        })
      )
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.code).toBe("event_ended")
    })

    it("returns 400 when registration has closed", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockRegisterForHackathon.mockResolvedValue({
        success: false,
        error: "Registration has closed",
        code: "registration_closed",
      })

      const res = await app.handle(
        new Request("http://localhost/api/public/hackathons/test-hackathon/register", {
          method: "POST",
        })
      )
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.code).toBe("registration_closed")
    })

    it("returns 400 with terms_required when terms enabled and no hash provided", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockCurrentTermsHash.mockResolvedValue("expected-hash")

      const res = await app.handle(
        new Request("http://localhost/api/public/hackathons/test-hackathon/register", {
          method: "POST",
        })
      )
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.code).toBe("terms_required")
      expect(mockRegisterForHackathon).not.toHaveBeenCalled()
    })

    it("returns 400 when terms hash does not match", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockCurrentTermsHash.mockResolvedValue("expected-hash")

      const res = await app.handle(
        new Request("http://localhost/api/public/hackathons/test-hackathon/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ terms_hash: "stale-hash" }),
        })
      )
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.code).toBe("terms_required")
      expect(mockRegisterForHackathon).not.toHaveBeenCalled()
    })

    it("registers and records acceptance when terms hash matches", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockCurrentTermsHash.mockResolvedValue("expected-hash")
      mockRegisterForHackathon.mockResolvedValue({
        success: true,
        participantId: "p1",
        teamId: "t1",
      })

      const res = await app.handle(
        new Request("http://localhost/api/public/hackathons/test-hackathon/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ terms_hash: "expected-hash" }),
        })
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.success).toBe(true)
      expect(mockRecordTermsAcceptance).toHaveBeenCalledTimes(1)
    })

    it("keeps the recorded acceptance when registration later fails", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockCurrentTermsHash.mockResolvedValue("expected-hash")
      mockRegisterForHackathon.mockResolvedValue({
        success: false,
        error: "Already registered",
        code: "already_registered",
      })

      const res = await app.handle(
        new Request("http://localhost/api/public/hackathons/test-hackathon/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ terms_hash: "expected-hash" }),
        })
      )

      expect(res.status).toBe(409)
      expect(mockRecordTermsAcceptance).toHaveBeenCalledWith("h1", "user_123", "expected-hash")
    })

    it("does not register when terms acceptance cannot be recorded", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockCurrentTermsHash.mockResolvedValue("expected-hash")
      mockRecordTermsAcceptance.mockRejectedValue(new Error("database unavailable"))

      const res = await app.handle(
        new Request("http://localhost/api/public/hackathons/test-hackathon/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ terms_hash: "expected-hash" }),
        })
      )
      const data = await res.json()

      expect(res.status).toBe(500)
      expect(data).toMatchObject({ code: "terms_record_failed", retryable: true })
      expect(mockRegisterForHackathon).not.toHaveBeenCalled()
    })

    it("calls registerForHackathon with correct parameters", async () => {
      mockAuth.mockResolvedValue({ userId: "user_456" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockRegisterForHackathon.mockResolvedValue({
        success: true,
        participantId: "p789",
        teamId: "t789",
      })

      await app.handle(
        new Request("http://localhost/api/public/hackathons/test-hackathon/register", {
          method: "POST",
        })
      )

      expect(mockRegisterForHackathon).toHaveBeenCalledWith(
        "h1",
        "user_456",
        "Test User's Team",
        ["captain@example.com"],
      )
    })
  })

  describe("GET /api/public/hackathons/:slug/registration", () => {
    it("returns 404 when hackathon not found", async () => {
      mockGetPublicHackathon.mockResolvedValue(null)

      const res = await app.handle(
        new Request("http://localhost/api/public/hackathons/nonexistent/registration")
      )
      const data = await res.json()

      expect(res.status).toBe(404)
      expect(data.error).toBe("Hackathon not found")
    })

    it("returns participant count and isRegistered null when not authenticated", async () => {
      mockAuth.mockResolvedValue({ userId: null })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockGetParticipantCount.mockResolvedValue(25)

      const res = await app.handle(
        new Request("http://localhost/api/public/hackathons/test-hackathon/registration")
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.participantCount).toBe(25)
      expect(data.isRegistered).toBeNull()
    })

    it("returns participant count and isRegistered true when authenticated and registered", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockGetParticipantCount.mockResolvedValue(42)
      mockIsUserRegistered.mockResolvedValue(true)

      const res = await app.handle(
        new Request("http://localhost/api/public/hackathons/test-hackathon/registration")
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.participantCount).toBe(42)
      expect(data.isRegistered).toBe(true)
    })

    it("returns isRegistered false when authenticated but not registered", async () => {
      mockAuth.mockResolvedValue({ userId: "user_123" })
      mockGetPublicHackathon.mockResolvedValue(mockHackathon)
      mockGetParticipantCount.mockResolvedValue(10)
      mockIsUserRegistered.mockResolvedValue(false)

      const res = await app.handle(
        new Request("http://localhost/api/public/hackathons/test-hackathon/registration")
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.participantCount).toBe(10)
      expect(data.isRegistered).toBe(false)
    })
  })

  describe("GET /api/public/orgs/:slug", () => {
    const mockTenant = {
      id: "t1",
      name: "Test Org",
      slug: "test-org",
      logo_url: "https://example.com/logo.png",
      logo_url_dark: null,
      description: "A test org",
      website_url: "https://example.com",
      organizedHackathons: [
        {
          id: "h1",
          name: "Org Hackathon",
          slug: "org-hackathon",
          description: "Organized event",
          banner_url: null,
          status: "active",
          starts_at: "2026-03-01T00:00:00Z",
          ends_at: "2026-03-02T00:00:00Z",
          role: "organizer",
        },
      ],
      sponsoredHackathons: [
        {
          id: "h2",
          name: "Sponsored Hackathon",
          slug: "sponsored-hackathon",
          description: "Sponsored event",
          banner_url: null,
          status: "completed",
          starts_at: "2026-01-01T00:00:00Z",
          ends_at: "2026-01-02T00:00:00Z",
          role: "sponsor",
          organizer: {
            id: "t2",
            name: "Other Org",
            slug: "other-org",
            logo_url: null,
          },
        },
      ],
    }

    it("returns 404 when org not found", async () => {
      mockGetPublicTenantWithEvents.mockResolvedValue(null)

      const res = await app.handle(
        new Request("http://localhost/api/public/orgs/nonexistent")
      )
      const data = await res.json()

      expect(res.status).toBe(404)
      expect(data.error).toBe("Organization not found")
    })

    it("returns org with organized and sponsored hackathons", async () => {
      mockGetPublicTenantWithEvents.mockResolvedValue(mockTenant)

      const res = await app.handle(
        new Request("http://localhost/api/public/orgs/test-org")
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.name).toBe("Test Org")
      expect(data.organizedHackathons).toHaveLength(1)
      expect(data.organizedHackathons[0].slug).toBe("org-hackathon")
      expect(data.sponsoredHackathons).toHaveLength(1)
      expect(data.sponsoredHackathons[0].slug).toBe("sponsored-hackathon")
      expect(data.sponsoredHackathons[0].organizer.name).toBe("Other Org")
    })
  })
})
