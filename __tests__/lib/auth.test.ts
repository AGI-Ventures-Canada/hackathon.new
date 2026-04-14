import { describe, expect, it } from "bun:test"
import {
  scopesForRole,
  hasScope,
  hasAllScopes,
  ALL_SCOPES,
  DEFAULT_API_KEY_SCOPES,
} from "@/lib/auth/types"
import { hasAdminMetadata } from "@/lib/auth/principal"
import type { UserPrincipal, ApiKeyPrincipal, AnonPrincipal } from "@/lib/auth/types"

describe("Auth Types", () => {
  describe("scopesForRole", () => {
    it("returns all scopes for org:admin", () => {
      const scopes = scopesForRole("org:admin")
      expect(scopes).toEqual(ALL_SCOPES)
    })

    it("returns member scopes for org:member", () => {
      const scopes = scopesForRole("org:member")
      expect(scopes).toContain("hackathons:read")
      expect(scopes).toContain("teams:read")
      expect(scopes).toContain("keys:write")
      expect(scopes).not.toContain("hackathons:write")
      expect(scopes).not.toContain("schedules:write")
      expect(scopes).not.toContain("org:write")
    })

    it("returns read-only scopes for unknown roles (fail-safe)", () => {
      const scopes = scopesForRole("unknown")
      expect(scopes).toEqual(["hackathons:read", "teams:read", "submissions:read"])
    })

    it("returns all scopes for null role (personal account)", () => {
      const scopes = scopesForRole(null)
      expect(scopes).toEqual(ALL_SCOPES)
    })
  })

  describe("hasScope", () => {
    const userPrincipal: UserPrincipal = {
      kind: "user",
      tenantId: "tenant-1",
      userId: "user-1",
      orgId: "org-1",
      orgRole: "org:admin",
      scopes: ["hackathons:write", "hackathons:read"],
    }

    const personalPrincipal: UserPrincipal = {
      kind: "user",
      tenantId: "tenant-2",
      userId: "user-2",
      orgId: null,
      orgRole: null,
      scopes: ["hackathons:read", "teams:read", "submissions:read"],
    }

    const apiKeyPrincipal: ApiKeyPrincipal = {
      kind: "api_key",
      tenantId: "tenant-1",
      keyId: "key-1",
      scopes: ["hackathons:write", "hackathons:read"],
    }

    const anonPrincipal: AnonPrincipal = {
      kind: "anon",
    }

    it("returns true if user has scope", () => {
      expect(hasScope(userPrincipal, "hackathons:write")).toBe(true)
      expect(hasScope(userPrincipal, "hackathons:read")).toBe(true)
    })

    it("returns false if user lacks scope", () => {
      expect(hasScope(userPrincipal, "keys:write")).toBe(false)
    })

    it("returns true if personal user has scope", () => {
      expect(hasScope(personalPrincipal, "hackathons:read")).toBe(true)
    })

    it("returns false if personal user lacks scope", () => {
      expect(hasScope(personalPrincipal, "hackathons:write")).toBe(false)
    })

    it("returns true if api_key has scope", () => {
      expect(hasScope(apiKeyPrincipal, "hackathons:write")).toBe(true)
    })

    it("returns false for anon principal", () => {
      expect(hasScope(anonPrincipal, "hackathons:write")).toBe(false)
      expect(hasScope(anonPrincipal, "hackathons:read")).toBe(false)
    })
  })

  describe("hasAllScopes", () => {
    const principal: UserPrincipal = {
      kind: "user",
      tenantId: "tenant-1",
      userId: "user-1",
      orgId: "org-1",
      orgRole: "org:admin",
      scopes: ["hackathons:write", "hackathons:read", "keys:read"],
    }

    it("returns true if principal has all scopes", () => {
      expect(hasAllScopes(principal, ["hackathons:write", "hackathons:read"])).toBe(true)
    })

    it("returns false if principal lacks any scope", () => {
      expect(hasAllScopes(principal, ["hackathons:write", "keys:write"])).toBe(false)
    })

    it("returns true for empty scopes array", () => {
      expect(hasAllScopes(principal, [])).toBe(true)
    })
  })

  describe("DEFAULT_API_KEY_SCOPES", () => {
    it("includes hackathons:read and submissions:read", () => {
      expect(DEFAULT_API_KEY_SCOPES).toContain("hackathons:read")
      expect(DEFAULT_API_KEY_SCOPES).toContain("submissions:read")
    })

    it("does not include admin scopes", () => {
      expect(DEFAULT_API_KEY_SCOPES).not.toContain("keys:write")
    })
  })

  describe("hasAdminMetadata", () => {
    it.each([
      [null, false],
      [undefined, false],
      [{}, false],
      [{ metadata: null }, false],
      [{ metadata: {} }, false],
      [{ metadata: { admin: false } }, false],
      [{ metadata: { admin: "true" } }, false],
      [{ metadata: { admin: true } }, true],
    ])("hasAdminMetadata(%j) === %s", (claims, expected) => {
      expect(hasAdminMetadata(claims)).toBe(expected)
    })
  })
})
