import { describe, it, expect, beforeEach } from "bun:test"
import type { HackathonSponsor, SponsorTier } from "@/lib/db/hackathon-types"
import {
  createChainableMock,
  resetSupabaseMocks,
  setMockFromImplementation,
} from "../lib/supabase-mock"

const { addSponsor, removeSponsor, listHackathonSponsors, updateSponsor, reorderSponsors, listHackathonSponsorsWithTenants } = await import(
  "@/lib/services/sponsors"
)

const mockSponsor: HackathonSponsor = {
  id: "s1",
  hackathon_id: "h1",
  sponsor_tenant_id: null,
  tenant_sponsor_id: null,
  use_org_assets: false,
  name: "Test Sponsor",
  logo_url: "https://example.com/logo.png",
  logo_url_dark: "https://example.com/logo-dark.png",
  website_url: "https://example.com",
  tier: "gold" as SponsorTier,
  custom_tier_label: null,
  display_order: 0,
  created_at: "2026-01-01T00:00:00Z",
}

describe("Sponsors Service", () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  describe("addSponsor", () => {
    it("adds a sponsor successfully", async () => {
      const chain = createChainableMock({
        data: mockSponsor,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await addSponsor({
        hackathonId: "h1",
        name: "Test Sponsor",
        logoUrl: "https://example.com/logo.png",
        websiteUrl: "https://example.com",
        tier: "gold",
      })

      expect(result).not.toBeNull()
      expect(result?.name).toBe("Test Sponsor")
      expect(result?.tier).toBe("gold")
    })

    it("returns null on error", async () => {
      const chain = createChainableMock({
        data: null,
        error: { message: "DB error" },
      })
      setMockFromImplementation(() => chain)

      const result = await addSponsor({
        hackathonId: "h1",
        name: "Test Sponsor",
      })

      expect(result).toBeNull()
    })

    it("uses default tier when not specified", async () => {
      const chain = createChainableMock({
        data: { ...mockSponsor, tier: "none" },
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await addSponsor({
        hackathonId: "h1",
        name: "Test Sponsor",
      })

      expect(result?.tier).toBe("none")
    })
  })

  describe("removeSponsor", () => {
    it("removes a sponsor successfully", async () => {
      const chain = createChainableMock({ data: null, error: null })
      setMockFromImplementation(() => chain)

      const result = await removeSponsor("s1", "h1")

      expect(result).toBe(true)
    })

    it("returns false on error", async () => {
      const chain = createChainableMock({
        data: null,
        error: { message: "DB error" },
      })
      setMockFromImplementation(() => chain)

      const result = await removeSponsor("s1", "h1")

      expect(result).toBe(false)
    })
  })

  describe("listHackathonSponsors", () => {
    it("returns sponsors for a hackathon", async () => {
      const chain = createChainableMock({
        data: [mockSponsor],
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await listHackathonSponsors("h1")

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe("Test Sponsor")
    })

    it("returns empty array when no sponsors", async () => {
      const chain = createChainableMock({ data: [], error: null })
      setMockFromImplementation(() => chain)

      const result = await listHackathonSponsors("h_empty")

      expect(result).toEqual([])
    })

    it("returns empty array on error", async () => {
      const chain = createChainableMock({
        data: null,
        error: { message: "DB error" },
      })
      setMockFromImplementation(() => chain)

      const result = await listHackathonSponsors("h_err")

      expect(result).toEqual([])
    })
  })

  describe("updateSponsor", () => {
    it("updates a sponsor successfully", async () => {
      const chain = createChainableMock({
        data: { ...mockSponsor, name: "Updated Sponsor" },
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await updateSponsor("s1", { name: "Updated Sponsor" }, "h1")

      expect(result).not.toBeNull()
      expect(result?.name).toBe("Updated Sponsor")
    })

    it("returns null on error", async () => {
      const chain = createChainableMock({
        data: null,
        error: { message: "DB error" },
      })
      setMockFromImplementation(() => chain)

      const result = await updateSponsor("s1", { name: "Updated Sponsor" }, "h1")

      expect(result).toBeNull()
    })

    it("updates the org asset source flag", async () => {
      const chain = createChainableMock({
        data: { ...mockSponsor, use_org_assets: true },
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await updateSponsor("s1", { useOrgAssets: true }, "h1")

      expect(result?.use_org_assets).toBe(true)
    })
  })

  describe("reorderSponsors", () => {
    it("reorders sponsors successfully", async () => {
      const chain = createChainableMock({ data: null, error: null })
      setMockFromImplementation(() => chain)

      const result = await reorderSponsors("h1", ["s1", "s2", "s3"])

      expect(result).toBe(true)
    })

    it("returns false on error", async () => {
      const chain = createChainableMock({
        data: null,
        error: { message: "DB error" },
      })
      setMockFromImplementation(() => chain)

      const result = await reorderSponsors("h1", ["s1"])

      expect(result).toBe(false)
    })
  })

  describe("listHackathonSponsorsWithTenants", () => {
    it("returns sponsors with tenant data", async () => {
      const chain = createChainableMock({
        data: [
          {
            ...mockSponsor,
            tenant: { slug: "test-tenant", name: "Test Tenant", logo_url: null },
          },
        ],
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await listHackathonSponsorsWithTenants("h1")

      expect(result).toHaveLength(1)
      expect(result[0].tenant?.slug).toBe("test-tenant")
    })

    it("returns empty array on error", async () => {
      const chain = createChainableMock({
        data: null,
        error: { message: "DB error" },
      })
      setMockFromImplementation(() => chain)

      const result = await listHackathonSponsorsWithTenants("h_err")

      expect(result).toEqual([])
    })
  })
})
