import { describe, it, expect, beforeEach } from "bun:test"
import type { TenantProfile } from "@/lib/db/hackathon-types"
import {
  createChainableMock,
  resetSupabaseMocks,
  setMockFromImplementation,
} from "../lib/supabase-mock"

const {
  getPublicTenantBySlug,
  getPublicTenantById,
  updateTenantProfile,
  isSlugAvailable,
  getPublicTenantWithHackathons,
  getPublicTenantWithEvents,
} = await import("@/lib/services/tenant-profiles")

const mockTenant: TenantProfile = {
  id: "t1",
  clerk_org_id: "org_123",
  clerk_user_id: null,
  name: "Test Org",
  slug: "test-org",
  logo_url: "https://example.com/logo.png",
  logo_url_dark: "https://example.com/logo-dark.png",
  description: "A test organization",
  website_url: "https://example.com",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
}

describe("Tenant Profiles Service", () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  describe("getPublicTenantBySlug", () => {
    it("returns tenant by slug", async () => {
      const chain = createChainableMock({
        data: mockTenant,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await getPublicTenantBySlug("test-org")

      expect(result).not.toBeNull()
      expect(result?.name).toBe("Test Org")
      expect(result?.slug).toBe("test-org")
    })

    it("returns null when not found", async () => {
      const chain = createChainableMock({
        data: null,
        error: { message: "Not found" },
      })
      setMockFromImplementation(() => chain)

      const result = await getPublicTenantBySlug("nonexistent")

      expect(result).toBeNull()
    })
  })

  describe("getPublicTenantById", () => {
    it("returns tenant by id", async () => {
      const chain = createChainableMock({
        data: mockTenant,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await getPublicTenantById("t1")

      expect(result).not.toBeNull()
      expect(result?.id).toBe("t1")
    })

    it("returns null when not found", async () => {
      const chain = createChainableMock({
        data: null,
        error: { message: "Not found" },
      })
      setMockFromImplementation(() => chain)

      const result = await getPublicTenantById("nonexistent")

      expect(result).toBeNull()
    })
  })

  describe("updateTenantProfile", () => {
    it("updates tenant profile successfully", async () => {
      const chain = createChainableMock({
        data: { ...mockTenant, description: "Updated description" },
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await updateTenantProfile("t1", {
        description: "Updated description",
      })

      expect(result).not.toBeNull()
      expect(result?.description).toBe("Updated description")
    })

    it("returns null on error", async () => {
      const chain = createChainableMock({
        data: null,
        error: { message: "DB error" },
      })
      setMockFromImplementation(() => chain)

      const result = await updateTenantProfile("t1", { name: "New Name" })

      expect(result).toBeNull()
    })
  })

  describe("isSlugAvailable", () => {
    it("returns true when slug is available", async () => {
      const chain = createChainableMock({
        data: null,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await isSlugAvailable("available-slug")

      expect(result).toBe(true)
    })

    it("returns false when slug is taken", async () => {
      const chain = createChainableMock({
        data: { id: "t2" },
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await isSlugAvailable("taken-slug")

      expect(result).toBe(false)
    })

    it("excludes specified tenant when checking", async () => {
      const chain = createChainableMock({
        data: null,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await isSlugAvailable("my-slug", "t1")

      expect(result).toBe(true)
    })

    it("returns false on error", async () => {
      const chain = createChainableMock({
        data: null,
        error: { message: "DB error" },
      })
      setMockFromImplementation(() => chain)

      const result = await isSlugAvailable("any-slug")

      expect(result).toBe(false)
    })
  })

  describe("getPublicTenantWithHackathons", () => {
    it("returns tenant with hackathons", async () => {
      const tenantChain = createChainableMock({
        data: mockTenant,
        error: null,
      })
      const hackathonsChain = createChainableMock({
        data: [{ id: "h1", name: "Test Hackathon", slug: "test-hackathon" }],
        error: null,
      })

      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) return tenantChain
        return hackathonsChain
      })

      const result = await getPublicTenantWithHackathons("test-org")

      expect(result).not.toBeNull()
      expect(result?.name).toBe("Test Org")
      expect(result?.hackathons).toHaveLength(1)
    })

    it("returns null when tenant not found", async () => {
      const chain = createChainableMock({
        data: null,
        error: { message: "Not found" },
      })
      setMockFromImplementation(() => chain)

      const result = await getPublicTenantWithHackathons("nonexistent")

      expect(result).toBeNull()
    })

    it("returns tenant with empty hackathons array on hackathons error", async () => {
      const tenantChain = createChainableMock({
        data: mockTenant,
        error: null,
      })
      const hackathonsChain = createChainableMock({
        data: null,
        error: { message: "DB error" },
      })

      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) return tenantChain
        return hackathonsChain
      })

      const result = await getPublicTenantWithHackathons("test-org")

      expect(result).not.toBeNull()
      expect(result?.hackathons).toEqual([])
    })
  })

  describe("getPublicTenantWithEvents", () => {
    const mockOrganizedHackathon = {
      id: "h1",
      name: "Organized Hackathon",
      slug: "organized-hackathon",
      status: "published",
      starts_at: "2026-03-01T00:00:00Z",
      ends_at: "2026-03-02T00:00:00Z",
    }

    const mockSponsoredHackathon = {
      id: "h2",
      name: "Sponsored Hackathon",
      slug: "sponsored-hackathon",
      status: "active",
      starts_at: "2026-04-01T00:00:00Z",
      ends_at: "2026-04-02T00:00:00Z",
      organizer: {
        id: "t2",
        name: "Other Org",
        slug: "other-org",
        logo_url: null,
        logo_url_dark: null,
      },
    }

    it("returns tenant with organized and sponsored hackathons", async () => {
      const tenantChain = createChainableMock({
        data: mockTenant,
        error: null,
      })
      const organizedChain = createChainableMock({
        data: [mockOrganizedHackathon],
        error: null,
      })
      const sponsoredChain = createChainableMock({
        data: [{ hackathon_id: "h2", hackathons: mockSponsoredHackathon }],
        error: null,
      })

      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) return tenantChain
        if (callCount === 2) return organizedChain
        return sponsoredChain
      })

      const result = await getPublicTenantWithEvents("test-org")

      expect(result).not.toBeNull()
      expect(result?.name).toBe("Test Org")
      expect(result?.organizedHackathons).toHaveLength(1)
      expect(result?.organizedHackathons[0].name).toBe("Organized Hackathon")
      expect(result?.organizedHackathons[0].role).toBe("organizer")
      expect(result?.sponsoredHackathons).toHaveLength(1)
      expect(result?.sponsoredHackathons[0].name).toBe("Sponsored Hackathon")
      expect(result?.sponsoredHackathons[0].role).toBe("sponsor")
    })

    it("returns null when tenant not found", async () => {
      const chain = createChainableMock({
        data: null,
        error: { code: "PGRST116", message: "Not found" },
      })
      setMockFromImplementation(() => chain)

      const result = await getPublicTenantWithEvents("nonexistent")

      expect(result).toBeNull()
    })

    it("returns tenant with empty arrays when no hackathons", async () => {
      const tenantChain = createChainableMock({
        data: mockTenant,
        error: null,
      })
      const emptyChain = createChainableMock({
        data: [],
        error: null,
      })

      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) return tenantChain
        return emptyChain
      })

      const result = await getPublicTenantWithEvents("test-org")

      expect(result).not.toBeNull()
      expect(result?.organizedHackathons).toEqual([])
      expect(result?.sponsoredHackathons).toEqual([])
    })

    it("filters out draft hackathons from sponsored list", async () => {
      const tenantChain = createChainableMock({
        data: mockTenant,
        error: null,
      })
      const organizedChain = createChainableMock({
        data: [],
        error: null,
      })
      const sponsoredChain = createChainableMock({
        data: [
          {
            hackathon_id: "h3",
            hackathons: { ...mockSponsoredHackathon, id: "h3", status: "draft" },
          },
          {
            hackathon_id: "h4",
            hackathons: { ...mockSponsoredHackathon, id: "h4", status: "published" },
          },
        ],
        error: null,
      })

      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) return tenantChain
        if (callCount === 2) return organizedChain
        return sponsoredChain
      })

      const result = await getPublicTenantWithEvents("test-org")

      expect(result).not.toBeNull()
      expect(result?.sponsoredHackathons).toHaveLength(1)
      expect(result?.sponsoredHackathons[0].id).toBe("h4")
    })

    it("handles errors gracefully for organized hackathons", async () => {
      const tenantChain = createChainableMock({
        data: mockTenant,
        error: null,
      })
      const errorChain = createChainableMock({
        data: null,
        error: { message: "DB error" },
      })
      const sponsoredChain = createChainableMock({
        data: [{ hackathon_id: "h2", hackathons: mockSponsoredHackathon }],
        error: null,
      })

      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) return tenantChain
        if (callCount === 2) return errorChain
        return sponsoredChain
      })

      const result = await getPublicTenantWithEvents("test-org")

      expect(result).not.toBeNull()
      expect(result?.organizedHackathons).toEqual([])
      expect(result?.sponsoredHackathons).toHaveLength(1)
    })

    it("handles errors gracefully for sponsored hackathons", async () => {
      const tenantChain = createChainableMock({
        data: mockTenant,
        error: null,
      })
      const organizedChain = createChainableMock({
        data: [mockOrganizedHackathon],
        error: null,
      })
      const errorChain = createChainableMock({
        data: null,
        error: { message: "DB error" },
      })

      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) return tenantChain
        if (callCount === 2) return organizedChain
        return errorChain
      })

      const result = await getPublicTenantWithEvents("test-org")

      expect(result).not.toBeNull()
      expect(result?.organizedHackathons).toHaveLength(1)
      expect(result?.sponsoredHackathons).toEqual([])
    })

    it("sorts sponsored hackathons by start date descending", async () => {
      const tenantChain = createChainableMock({
        data: mockTenant,
        error: null,
      })
      const organizedChain = createChainableMock({
        data: [],
        error: null,
      })
      const sponsoredChain = createChainableMock({
        data: [
          {
            hackathon_id: "h1",
            hackathons: {
              ...mockSponsoredHackathon,
              id: "h1",
              starts_at: "2026-01-01T00:00:00Z",
            },
          },
          {
            hackathon_id: "h2",
            hackathons: {
              ...mockSponsoredHackathon,
              id: "h2",
              starts_at: "2026-06-01T00:00:00Z",
            },
          },
          {
            hackathon_id: "h3",
            hackathons: {
              ...mockSponsoredHackathon,
              id: "h3",
              starts_at: "2026-03-01T00:00:00Z",
            },
          },
        ],
        error: null,
      })

      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) return tenantChain
        if (callCount === 2) return organizedChain
        return sponsoredChain
      })

      const result = await getPublicTenantWithEvents("test-org")

      expect(result).not.toBeNull()
      expect(result?.sponsoredHackathons[0].id).toBe("h2")
      expect(result?.sponsoredHackathons[1].id).toBe("h3")
      expect(result?.sponsoredHackathons[2].id).toBe("h1")
    })
  })
})
