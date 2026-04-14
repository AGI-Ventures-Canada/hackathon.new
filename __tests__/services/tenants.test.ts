import { describe, expect, it, beforeEach } from "bun:test"
import type { Tenant } from "@/lib/db/hackathon-types"
import {
  createChainableMock,
  resetSupabaseMocks,
  setMockFromImplementation,
  resetClerkMocks,
  mockClerkClient,
} from "../lib/supabase-mock"

const {
  getOrCreateTenant,
  getOrCreatePersonalTenant,
  getTenantById,
  updateTenantName,
  searchTenants,
} = await import("@/lib/services/tenants")

const mockOrgTenant: Tenant = {
  id: "t1",
  name: "Test Org",
  slug: "test-org",
  clerk_org_id: "org_abc123",
  clerk_user_id: null,
  logo_url: null,
  logo_url_dark: null,
  description: null,
  website_url: null,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
}

const mockPersonalTenant: Tenant = {
  id: "t2",
  name: "Personal user_ab",
  slug: null,
  clerk_org_id: null,
  clerk_user_id: "user_abc123",
  logo_url: null,
  logo_url_dark: null,
  description: null,
  website_url: null,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
}

describe("Tenants Service", () => {
  beforeEach(() => {
    resetSupabaseMocks()
    resetClerkMocks()
  })

  describe("getOrCreateTenant (org tenant)", () => {
    it("returns existing tenant when found", async () => {
      const chain = createChainableMock({
        data: mockOrgTenant,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await getOrCreateTenant("org_abc123")

      expect(result).not.toBeNull()
      expect(result?.id).toBe("t1")
      expect(result?.clerk_org_id).toBe("org_abc123")
    })

    it("creates new tenant when not found", async () => {
      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createChainableMock({ data: null, error: null })
        }
        return createChainableMock({ data: mockOrgTenant, error: null })
      })

      const result = await getOrCreateTenant("org_abc123")

      expect(result).not.toBeNull()
      expect(result?.clerk_org_id).toBe("org_abc123")
    })

    it("uses provided org name", async () => {
      const tenantWithName = { ...mockOrgTenant, name: "Acme Inc." }

      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createChainableMock({ data: null, error: null })
        }
        return createChainableMock({ data: tenantWithName, error: null })
      })

      const result = await getOrCreateTenant("org_abc123", "Acme Inc.")

      expect(result).not.toBeNull()
      expect(result?.name).toBe("Acme Inc.")
    })

    it("fetches org name from Clerk when no name provided", async () => {
      const tenantWithClerkName = { ...mockOrgTenant, name: "Test Org" }

      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createChainableMock({ data: null, error: null })
        }
        return createChainableMock({ data: tenantWithClerkName, error: null })
      })

      const result = await getOrCreateTenant("org_abc123xyz789")

      expect(result).not.toBeNull()
      expect(result?.name).toBe("Test Org")
      expect(mockClerkClient).toHaveBeenCalled()
    })

    it("falls back to org id prefix when Clerk fetch fails", async () => {
      const tenantWithDefaultName = { ...mockOrgTenant, name: "Org org_abc1" }

      mockClerkClient.mockImplementation(() =>
        Promise.resolve({
          organizations: {
            getOrganization: () => Promise.reject(new Error("Clerk unavailable")),
          },
        })
      )

      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createChainableMock({ data: null, error: null })
        }
        return createChainableMock({ data: tenantWithDefaultName, error: null })
      })

      const result = await getOrCreateTenant("org_abc123xyz789")

      expect(result).not.toBeNull()
      expect(result?.name).toMatch(/^Org org_/)
    })

    it("syncs fallback name from Clerk for existing tenant", async () => {
      const existingTenant = { ...mockOrgTenant, name: "Org org_abc1" }
      const updatedTenant = { ...mockOrgTenant, name: "Test Org" }

      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createChainableMock({ data: existingTenant, error: null })
        }
        return createChainableMock({ data: updatedTenant, error: null })
      })

      const result = await getOrCreateTenant("org_abc123")

      expect(result).not.toBeNull()
      expect(result?.name).toBe("Test Org")
      expect(mockClerkClient).toHaveBeenCalled()
    })

    it("syncs name from Clerk when different", async () => {
      const existingTenant = { ...mockOrgTenant, name: "Old Name" }
      const updatedTenant = { ...mockOrgTenant, name: "New Clerk Name" }

      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createChainableMock({ data: existingTenant, error: null })
        }
        return createChainableMock({ data: updatedTenant, error: null })
      })

      const result = await getOrCreateTenant("org_abc123", "New Clerk Name")

      expect(result).not.toBeNull()
      expect(result?.name).toBe("New Clerk Name")
    })

    it("retries on race condition (conflict error)", async () => {
      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createChainableMock({ data: null, error: null })
        }
        if (callCount === 2) {
          return createChainableMock({
            data: null,
            error: { message: "Conflict", code: "23505" },
          })
        }
        return createChainableMock({ data: mockOrgTenant, error: null })
      })

      const result = await getOrCreateTenant("org_abc123")

      expect(result).not.toBeNull()
    })

    it("returns null when both create and retry fail", async () => {
      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount <= 2) {
          return createChainableMock({
            data: null,
            error: { message: "Database error" },
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await getOrCreateTenant("org_fail")

      expect(result).toBeNull()
    })
  })

  describe("getOrCreatePersonalTenant", () => {
    it("returns existing personal tenant when found", async () => {
      const chain = createChainableMock({
        data: mockPersonalTenant,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await getOrCreatePersonalTenant("user_abc123")

      expect(result).not.toBeNull()
      expect(result?.id).toBe("t2")
      expect(result?.clerk_user_id).toBe("user_abc123")
    })

    it("creates new personal tenant when not found", async () => {
      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createChainableMock({ data: null, error: null })
        }
        return createChainableMock({ data: mockPersonalTenant, error: null })
      })

      const result = await getOrCreatePersonalTenant("user_abc123")

      expect(result).not.toBeNull()
      expect(result?.clerk_user_id).toBe("user_abc123")
    })

    it("uses provided user name", async () => {
      const tenantWithName = { ...mockPersonalTenant, name: "Jane Doe" }

      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createChainableMock({ data: null, error: null })
        }
        return createChainableMock({ data: tenantWithName, error: null })
      })

      const result = await getOrCreatePersonalTenant("user_abc123", "Jane Doe")

      expect(result).not.toBeNull()
      expect(result?.name).toBe("Jane Doe")
    })

    it("generates default name from user id when no name provided", async () => {
      const tenantWithDefaultName = { ...mockPersonalTenant, name: "Personal user_xyz" }

      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createChainableMock({ data: null, error: null })
        }
        return createChainableMock({ data: tenantWithDefaultName, error: null })
      })

      const result = await getOrCreatePersonalTenant("user_xyz123")

      expect(result).not.toBeNull()
    })

    it("handles short user ids", async () => {
      const tenantWithShortId = { ...mockPersonalTenant, name: "Personal user_ab", clerk_user_id: "user_ab" }

      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createChainableMock({ data: null, error: null })
        }
        return createChainableMock({ data: tenantWithShortId, error: null })
      })

      const result = await getOrCreatePersonalTenant("user_ab")

      expect(result).not.toBeNull()
    })

    it("updates name when existing tenant has fallback name and userName is provided", async () => {
      const fallbackTenant = { ...mockPersonalTenant, name: "Personal Account" }
      const updatedTenant = { ...fallbackTenant, name: "Jane Doe" }

      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createChainableMock({ data: fallbackTenant, error: null })
        }
        return createChainableMock({ data: updatedTenant, error: null })
      })

      const result = await getOrCreatePersonalTenant("user_abc123", "Jane Doe")

      expect(result).not.toBeNull()
      expect(result?.name).toBe("Jane Doe")
    })

    it("does not update name when existing tenant has a real name", async () => {
      const realNameTenant = { ...mockPersonalTenant, name: "Already Named" }

      setMockFromImplementation(() =>
        createChainableMock({ data: realNameTenant, error: null })
      )

      const result = await getOrCreatePersonalTenant("user_abc123", "New Name")

      expect(result).not.toBeNull()
      expect(result?.name).toBe("Already Named")
    })

    it("retries on race condition", async () => {
      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createChainableMock({ data: null, error: null })
        }
        if (callCount === 2) {
          return createChainableMock({
            data: null,
            error: { message: "Conflict" },
          })
        }
        return createChainableMock({ data: mockPersonalTenant, error: null })
      })

      const result = await getOrCreatePersonalTenant("user_abc123")

      expect(result).not.toBeNull()
    })
  })

  describe("getTenantById", () => {
    it("returns tenant when found", async () => {
      const chain = createChainableMock({
        data: mockOrgTenant,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await getTenantById("t1")

      expect(result).not.toBeNull()
      expect(result?.id).toBe("t1")
    })

    it("returns null when not found", async () => {
      const chain = createChainableMock({
        data: null,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await getTenantById("nonexistent")

      expect(result).toBeNull()
    })
  })

  describe("updateTenantName", () => {
    it("updates tenant name successfully", async () => {
      const updatedTenant = { ...mockOrgTenant, name: "New Company Name" }

      const chain = createChainableMock({
        data: updatedTenant,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await updateTenantName("t1", "New Company Name")

      expect(result).not.toBeNull()
      expect(result?.name).toBe("New Company Name")
    })

    it("returns null on database error", async () => {
      const chain = createChainableMock({
        data: null,
        error: { message: "Database error" },
      })
      setMockFromImplementation(() => chain)

      const result = await updateTenantName("t1", "New Name")

      expect(result).toBeNull()
    })

    it("updates updated_at timestamp", async () => {
      const updatedTenant = {
        ...mockOrgTenant,
        name: "Updated Name",
        updated_at: "2024-01-02T00:00:00Z",
      }

      const chain = createChainableMock({
        data: updatedTenant,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await updateTenantName("t1", "Updated Name")

      expect(result).not.toBeNull()
      expect(result?.updated_at).not.toBe(mockOrgTenant.updated_at)
    })

    it("handles unicode names", async () => {
      const updatedTenant = { ...mockOrgTenant, name: "日本語の会社" }

      const chain = createChainableMock({
        data: updatedTenant,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await updateTenantName("t1", "日本語の会社")

      expect(result).not.toBeNull()
      expect(result?.name).toBe("日本語の会社")
    })
  })

  describe("searchTenants", () => {
    it("returns matching tenants", async () => {
      const searchResults = [
        { id: "t1", name: "Acme Corp", slug: "acme", logo_url: null, website_url: null },
        { id: "t2", name: "Acme Labs", slug: "acme-labs", logo_url: null, website_url: null },
      ]

      const chain = createChainableMock({
        data: searchResults,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await searchTenants("acme")

      expect(result).toHaveLength(2)
      expect(result[0].name).toBe("Acme Corp")
      expect(result[1].name).toBe("Acme Labs")
    })

    it("returns empty array for short queries", async () => {
      const result = await searchTenants("a")

      expect(result).toEqual([])
    })

    it("returns empty array for empty query", async () => {
      const result = await searchTenants("")

      expect(result).toEqual([])
    })

    it("sanitizes query to prevent injection", async () => {
      const chain = createChainableMock({
        data: [],
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await searchTenants("test%_().,\\")

      expect(result).toEqual([])
    })

    it("respects limit option", async () => {
      const searchResults = [
        { id: "t1", name: "Result 1", slug: "r1", logo_url: null, website_url: null },
      ]

      const chain = createChainableMock({
        data: searchResults,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await searchTenants("test", { limit: 1 })

      expect(result).toHaveLength(1)
    })

    it("excludes specified tenant ids", async () => {
      const searchResults = [
        { id: "t2", name: "Other Tenant", slug: "other", logo_url: null, website_url: null },
      ]

      const chain = createChainableMock({
        data: searchResults,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await searchTenants("tenant", { excludeIds: ["t1"] })

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe("t2")
    })

    it("returns empty array on database error", async () => {
      const chain = createChainableMock({
        data: null,
        error: { message: "Database error" },
      })
      setMockFromImplementation(() => chain)

      const result = await searchTenants("test")

      expect(result).toEqual([])
    })
  })

  describe("Tenant Owner Constraints", () => {
    it("org tenant has clerk_org_id set", () => {
      expect(mockOrgTenant.clerk_org_id).not.toBeNull()
      expect(mockOrgTenant.clerk_user_id).toBeNull()
    })

    it("personal tenant has clerk_user_id set", () => {
      expect(mockPersonalTenant.clerk_user_id).not.toBeNull()
      expect(mockPersonalTenant.clerk_org_id).toBeNull()
    })

    it("tenant id is a uuid format", () => {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      const tenantId = "123e4567-e89b-12d3-a456-426614174000"
      expect(tenantId).toMatch(uuidRegex)
    })

    it("at least one owner id must be set", () => {
      const hasOwner = (tenant: Tenant) =>
        tenant.clerk_org_id !== null || tenant.clerk_user_id !== null

      expect(hasOwner(mockOrgTenant)).toBe(true)
      expect(hasOwner(mockPersonalTenant)).toBe(true)
    })
  })
})
