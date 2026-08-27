import { describe, it, expect, beforeEach } from "bun:test"
import {
  resetAllMocks,
  mockAuth,
  mockMultiTableQuery,
  createChainableMock,
  setMockFromImplementation,
} from "../lib/supabase-mock"

const { getManageHackathon } = await import("@/lib/services/manage-hackathon")

const mockHackathonRow = {
  id: "h1",
  tenant_id: "t1",
  name: "Test Hackathon",
  slug: "test-hackathon",
  description: null,
  rules: null,
  starts_at: "2026-02-15T09:00:00Z",
  ends_at: "2026-02-17T18:00:00Z",
  registration_opens_at: null,
  registration_closes_at: null,
  max_participants: null,
  min_team_size: 1,
  max_team_size: 5,
  allow_solo: true,
  status: "published",
  banner_url: null,
  metadata: {},
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  organizer: {
    id: "t1",
    name: "Test Org",
    slug: "test-org",
    logo_url: null,
    logo_url_dark: null,
    clerk_org_id: "org_123",
  },
}

function setupHackathonMock() {
  mockMultiTableQuery({
    hackathons: { data: mockHackathonRow, error: null },
    hackathon_sponsors: { data: [], error: null },
  })
}

describe("Manage Hackathon Service", () => {
  beforeEach(() => {
    resetAllMocks()
  })

  describe("getManageHackathon", () => {
    it("returns unauthenticated error when user is not authenticated", async () => {
      mockAuth.mockImplementation(() =>
        Promise.resolve({ userId: null, orgId: null, orgRole: null })
      )

      const result = await getManageHackathon("test-hackathon-unauth")

      expect(result).toEqual({ ok: false, reason: "unauthenticated" })
    })

    it("returns not_found error when hackathon is not found", async () => {
      mockAuth.mockImplementation(() =>
        Promise.resolve({ userId: "user_123", orgId: "org_123", orgRole: "admin" })
      )
      setMockFromImplementation(() =>
        createChainableMock({ data: null, error: { message: "Not found", code: "PGRST116" } })
      )

      const result = await getManageHackathon("nonexistent-hackathon")

      expect(result).toEqual({ ok: false, reason: "not_found" })
    })

    it("returns not_organizer error when user is not the organizer", async () => {
      mockAuth.mockImplementation(() =>
        Promise.resolve({ userId: "user_123", orgId: "org_different", orgRole: "admin" })
      )
      setupHackathonMock()

      const result = await getManageHackathon("test-hackathon-notorg")

      expect(result).toEqual({ ok: false, reason: "not_organizer" })
    })

    it("returns not_organizer error when user has no orgId", async () => {
      mockAuth.mockImplementation(() =>
        Promise.resolve({ userId: "user_123", orgId: null, orgRole: null })
      )
      setupHackathonMock()

      const result = await getManageHackathon("test-hackathon-noid")

      expect(result).toEqual({ ok: false, reason: "not_organizer" })
    })

    it("returns hackathon when user is the organizer", async () => {
      mockAuth.mockImplementation(() =>
        Promise.resolve({ userId: "user_123", orgId: "org_123", orgRole: "admin" })
      )
      setupHackathonMock()

      const result = await getManageHackathon("test-hackathon-organizer")

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.hackathon.name).toBe("Test Hackathon")
        expect(result.hackathon.stored_status).toBe("published")
        expect(result.hackathon.organizer.clerk_org_id).toBe("org_123")
      }
    })
  })
})
