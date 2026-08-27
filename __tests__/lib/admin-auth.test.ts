import { describe, expect, it, beforeEach, afterEach } from "bun:test"
import { mockAuth, resetAllMocks } from "./supabase-mock"

const { resolvePrincipal, requireAdmin, isAdminEnabled } =
  await import("@/lib/auth/principal")

describe("Admin Auth", () => {
  const originalAdminEnabled = process.env.ADMIN_ENABLED

  beforeEach(() => {
    resetAllMocks()
  })

  afterEach(() => {
    if (originalAdminEnabled === undefined) {
      delete process.env.ADMIN_ENABLED
    } else {
      process.env.ADMIN_ENABLED = originalAdminEnabled
    }
  })

  describe("isAdminEnabled", () => {
    it("returns true when ADMIN_ENABLED=true", () => {
      process.env.ADMIN_ENABLED = "true"
      expect(isAdminEnabled()).toBe(true)
    })

    it("returns false when ADMIN_ENABLED is not set", () => {
      delete process.env.ADMIN_ENABLED
      expect(isAdminEnabled()).toBe(false)
    })

    it("returns false when ADMIN_ENABLED is anything other than true", () => {
      process.env.ADMIN_ENABLED = "false"
      expect(isAdminEnabled()).toBe(false)
    })
  })

  describe("resolvePrincipal", () => {
    it("returns admin principal when admin claim is true and ADMIN_ENABLED", async () => {
      process.env.ADMIN_ENABLED = "true"
      mockAuth.mockImplementation(() =>
        Promise.resolve({
          userId: "admin-user",
          orgId: null,
          orgRole: null,
          sessionClaims: { metadata: { admin: true } },
        })
      )

      const request = new Request("http://localhost/api/admin/stats")
      const principal = await resolvePrincipal(request)

      expect(principal.kind).toBe("admin")
      if (principal.kind === "admin") {
        expect(principal.userId).toBe("admin-user")
        expect(principal.scopes).toContain("admin:read")
        expect(principal.scopes).toContain("admin:write")
        expect(principal.scopes).toContain("admin:scenarios")
      }
    })

    it("returns user principal when ADMIN_ENABLED is false even if admin claim is true", async () => {
      delete process.env.ADMIN_ENABLED
      mockAuth.mockImplementation(() =>
        Promise.resolve({
          userId: "admin-user",
          orgId: null,
          orgRole: null,
          sessionClaims: { metadata: { admin: true } },
        })
      )

      const request = new Request("http://localhost/api/admin/stats")
      const principal = await resolvePrincipal(request)

      expect(principal.kind).not.toBe("admin")
    })

    it("returns user principal when admin claim is missing", async () => {
      process.env.ADMIN_ENABLED = "true"
      mockAuth.mockImplementation(() =>
        Promise.resolve({
          userId: "normal-user",
          orgId: null,
          orgRole: null,
          sessionClaims: {},
        })
      )

      const request = new Request("http://localhost/api/test")
      const principal = await resolvePrincipal(request)

      expect(principal.kind).not.toBe("admin")
    })

    it("resolves authentication once for the same request", async () => {
      mockAuth.mockImplementation(() =>
        Promise.resolve({
          userId: "normal-user",
          orgId: null,
          orgRole: null,
          sessionClaims: {},
        })
      )

      const request = new Request("http://localhost/api/test")
      const [first, second] = await Promise.all([
        resolvePrincipal(request),
        resolvePrincipal(request),
      ])

      expect(first).toEqual(second)
      expect(mockAuth).toHaveBeenCalledTimes(1)
    })
  })

  describe("requireAdmin", () => {
    it("passes for admin principal when enabled", () => {
      process.env.ADMIN_ENABLED = "true"
      const adminPrincipal = {
        kind: "admin" as const,
        userId: "admin-user",
        tenantId: "tenant-1",
        orgId: null,
        scopes: ["admin:read" as const, "admin:write" as const, "admin:scenarios" as const],
      }

      expect(() => requireAdmin(adminPrincipal)).not.toThrow()
    })

    it("throws 403 for non-admin principal", () => {
      process.env.ADMIN_ENABLED = "true"
      const userPrincipal = {
        kind: "user" as const,
        tenantId: "t1",
        userId: "u1",
        orgId: null,
        orgRole: null,
        scopes: [],
      }

      expect(() => requireAdmin(userPrincipal)).toThrow()
    })

    it("throws 404 when ADMIN_ENABLED is false", () => {
      delete process.env.ADMIN_ENABLED
      const adminPrincipal = {
        kind: "admin" as const,
        userId: "admin-user",
        tenantId: "tenant-1",
        orgId: null,
        scopes: ["admin:read" as const, "admin:write" as const, "admin:scenarios" as const],
      }

      try {
        requireAdmin(adminPrincipal)
        expect(true).toBe(false)
      } catch (e) {
        expect((e as AuthError).statusCode).toBe(404)
      }
    })
  })
})
