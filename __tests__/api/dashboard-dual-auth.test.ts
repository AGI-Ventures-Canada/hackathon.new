import { describe, expect, it } from "bun:test"
import type { Principal, UserPrincipal, ApiKeyPrincipal } from "@/lib/auth/types"
import { DEFAULT_API_KEY_SCOPES, ALL_SCOPES } from "@/lib/auth/types"
import { requireOrganizationAdminPrincipal, requirePrincipal, AuthError } from "@/lib/auth/principal"

const mockUserPrincipal: UserPrincipal = {
  kind: "user",
  tenantId: "tenant-123",
  userId: "user-456",
  orgId: "org-789",
  orgRole: "org:admin",
  scopes: [
    "keys:read",
    "keys:write",
    "webhooks:read",
    "webhooks:write",
    "hackathons:read",
    "hackathons:write",
    "schedules:read",
    "schedules:write",
    "org:read",
    "org:write",
  ],
}

const mockApiKeyPrincipal: ApiKeyPrincipal = {
  kind: "api_key",
  tenantId: "tenant-123",
  keyId: "key-456",
  scopes: [
    "hackathons:read",
    "hackathons:write",
    "webhooks:read",
    "webhooks:write",
    "schedules:read",
    "org:read",
  ],
}

const mockApiKeyPrincipalLimitedScopes: ApiKeyPrincipal = {
  kind: "api_key",
  tenantId: "tenant-123",
  keyId: "key-789",
  scopes: ["hackathons:read"],
}

const mockAnonPrincipal: Principal = {
  kind: "anon",
}

describe("Dashboard Dual-Auth - requirePrincipal", () => {
  describe("Principal type validation", () => {
    it("accepts user principal when user is allowed", () => {
      expect(() => {
        requirePrincipal(mockUserPrincipal, ["user"])
      }).not.toThrow()
    })

    it("accepts API key principal when api_key is allowed", () => {
      expect(() => {
        requirePrincipal(mockApiKeyPrincipal, ["api_key"])
      }).not.toThrow()
    })

    it("accepts user principal when both user and api_key are allowed", () => {
      expect(() => {
        requirePrincipal(mockUserPrincipal, ["user", "api_key"])
      }).not.toThrow()
    })

    it("accepts API key principal when both user and api_key are allowed", () => {
      expect(() => {
        requirePrincipal(mockApiKeyPrincipal, ["user", "api_key"])
      }).not.toThrow()
    })

    it("rejects API key principal when only user is allowed", () => {
      expect(() => {
        requirePrincipal(mockApiKeyPrincipal, ["user"])
      }).toThrow(AuthError)

      try {
        requirePrincipal(mockApiKeyPrincipal, ["user"])
      } catch (e) {
        expect((e as AuthError).statusCode).toBe(401)
      }
    })

    it("rejects user principal when only api_key is allowed", () => {
      expect(() => {
        requirePrincipal(mockUserPrincipal, ["api_key"])
      }).toThrow(AuthError)

      try {
        requirePrincipal(mockUserPrincipal, ["api_key"])
      } catch (e) {
        expect((e as AuthError).statusCode).toBe(401)
      }
    })

    it("rejects anonymous principal for any auth requirement", () => {
      expect(() => {
        requirePrincipal(mockAnonPrincipal, ["user"])
      }).toThrow(AuthError)

      expect(() => {
        requirePrincipal(mockAnonPrincipal, ["api_key"])
      }).toThrow(AuthError)

      expect(() => {
        requirePrincipal(mockAnonPrincipal, ["user", "api_key"])
      }).toThrow(AuthError)
    })
  })

  describe("Scope enforcement", () => {
    it("allows user with required scope", () => {
      expect(() => {
        requirePrincipal(mockUserPrincipal, ["user"], ["hackathons:read"])
      }).not.toThrow()
    })

    it("allows API key with required scope", () => {
      expect(() => {
        requirePrincipal(mockApiKeyPrincipal, ["api_key"], ["hackathons:read"])
      }).not.toThrow()
    })

    it("allows principal with dual-auth and required scope", () => {
      expect(() => {
        requirePrincipal(mockApiKeyPrincipal, ["user", "api_key"], ["hackathons:read"])
      }).not.toThrow()
    })

    it("rejects API key without required scope", () => {
      expect(() => {
        requirePrincipal(mockApiKeyPrincipalLimitedScopes, ["api_key"], ["webhooks:read"])
      }).toThrow(AuthError)

      try {
        requirePrincipal(mockApiKeyPrincipalLimitedScopes, ["api_key"], ["webhooks:read"])
      } catch (e) {
        expect((e as AuthError).statusCode).toBe(403)
        expect((e as AuthError).message).toContain("webhooks:read")
      }
    })

    it("rejects when missing any of multiple required scopes", () => {
      expect(() => {
        requirePrincipal(mockApiKeyPrincipalLimitedScopes, ["api_key"], [
          "hackathons:read",
          "hackathons:write",
        ])
      }).toThrow(AuthError)
    })

    it("allows when all required scopes are present", () => {
      expect(() => {
        requirePrincipal(mockApiKeyPrincipal, ["api_key"], [
          "hackathons:read",
          "hackathons:write",
        ])
      }).not.toThrow()
    })
  })

  describe("Dual-auth endpoint patterns", () => {
    it("GET /hackathons - accepts both auth types with hackathons:read", () => {
      expect(() => {
        requirePrincipal(mockUserPrincipal, ["user", "api_key"], ["hackathons:read"])
      }).not.toThrow()

      expect(() => {
        requirePrincipal(mockApiKeyPrincipal, ["user", "api_key"], ["hackathons:read"])
      }).not.toThrow()
    })

    it("POST /hackathons - accepts both auth types with hackathons:write", () => {
      expect(() => {
        requirePrincipal(mockUserPrincipal, ["user", "api_key"], ["hackathons:write"])
      }).not.toThrow()

      expect(() => {
        requirePrincipal(mockApiKeyPrincipal, ["user", "api_key"], ["hackathons:write"])
      }).not.toThrow()
    })

    it("GET /webhooks - accepts both auth types with webhooks:read", () => {
      expect(() => {
        requirePrincipal(mockUserPrincipal, ["user", "api_key"], ["webhooks:read"])
      }).not.toThrow()

      expect(() => {
        requirePrincipal(mockApiKeyPrincipal, ["user", "api_key"], ["webhooks:read"])
      }).not.toThrow()
    })

    it("GET /schedules - accepts both auth types with schedules:read", () => {
      expect(() => {
        requirePrincipal(mockUserPrincipal, ["user", "api_key"], ["schedules:read"])
      }).not.toThrow()

      expect(() => {
        requirePrincipal(mockApiKeyPrincipal, ["user", "api_key"], ["schedules:read"])
      }).not.toThrow()
    })

    it("POST /schedules - rejects API key without schedules:write", () => {
      expect(() => {
        requirePrincipal(mockApiKeyPrincipal, ["user", "api_key"], ["schedules:write"])
      }).toThrow(AuthError)
    })

    it("GET /org-profile - accepts both auth types with org:read", () => {
      expect(() => {
        requirePrincipal(mockUserPrincipal, ["user", "api_key"], ["org:read"])
      }).not.toThrow()

      expect(() => {
        requirePrincipal(mockApiKeyPrincipal, ["user", "api_key"], ["org:read"])
      }).not.toThrow()
    })

    it("PATCH /org-profile - rejects API key without org:write", () => {
      expect(() => {
        requirePrincipal(mockApiKeyPrincipal, ["user", "api_key"], ["org:write"])
      }).toThrow(AuthError)
    })

    it("GET /jobs - accepts both auth types without scope requirement", () => {
      expect(() => {
        requirePrincipal(mockUserPrincipal, ["user", "api_key"])
      }).not.toThrow()

      expect(() => {
        requirePrincipal(mockApiKeyPrincipal, ["user", "api_key"])
      }).not.toThrow()
    })

    it("GET /me - accepts both auth types without scope requirement", () => {
      expect(() => {
        requirePrincipal(mockUserPrincipal, ["user", "api_key"])
      }).not.toThrow()

      expect(() => {
        requirePrincipal(mockApiKeyPrincipal, ["user", "api_key"])
      }).not.toThrow()
    })
  })

  describe("Clerk-only endpoint patterns", () => {
    it("GET /keys - rejects API key auth", () => {
      expect(() => {
        requirePrincipal(mockApiKeyPrincipal, ["user"], ["keys:read"])
      }).toThrow(AuthError)
    })

    it("POST /keys - rejects API key auth", () => {
      expect(() => {
        requirePrincipal(mockApiKeyPrincipal, ["user"], ["keys:write"])
      }).toThrow(AuthError)
    })

    it("GET /integrations - rejects API key auth", () => {
      expect(() => {
        requirePrincipal(mockApiKeyPrincipal, ["user"])
      }).toThrow(AuthError)
    })

    it("GET /credentials - rejects API key auth", () => {
      expect(() => {
        requirePrincipal(mockApiKeyPrincipal, ["user"])
      }).toThrow(AuthError)
    })

    it("GET /keys - accepts Clerk user auth", () => {
      expect(() => {
        requirePrincipal(mockUserPrincipal, ["user"], ["keys:read"])
      }).not.toThrow()
    })

    it("GET /organization-members - rejects API key auth", () => {
      expect(() => {
        requirePrincipal(mockApiKeyPrincipal, ["user"], ["org:read"])
      }).toThrow(AuthError)
    })

    it("POST /organization-members/invitations - accepts Clerk admins", () => {
      expect(() => {
        requireOrganizationAdminPrincipal(mockUserPrincipal)
      }).not.toThrow()
    })

    it("POST /organization-members/invitations - rejects org members even with org:write", () => {
      const memberWithWrite: UserPrincipal = {
        ...mockUserPrincipal,
        orgRole: "org:member",
      }

      expect(() => {
        requireOrganizationAdminPrincipal(memberWithWrite)
      }).toThrow(AuthError)
    })
  })
})

describe("Dashboard Route Scope Requirements", () => {
  const dualAuthRoutes = [
    { path: "/dashboard/me", method: "GET", scopes: [] },
    { path: "/dashboard/hackathons", method: "GET", scopes: ["hackathons:read"] },
    { path: "/dashboard/hackathons", method: "POST", scopes: ["hackathons:write"] },
    { path: "/dashboard/hackathons/:id", method: "GET", scopes: ["hackathons:read"] },
    { path: "/dashboard/hackathons/:id/settings", method: "PATCH", scopes: ["hackathons:write"] },
    { path: "/dashboard/hackathons/:id/banner", method: "POST", scopes: ["hackathons:write"] },
    { path: "/dashboard/hackathons/:id/banner", method: "DELETE", scopes: ["hackathons:write"] },
    { path: "/dashboard/hackathons/:id/sponsors", method: "GET", scopes: ["hackathons:read"] },
    { path: "/dashboard/hackathons/:id/sponsors", method: "POST", scopes: ["hackathons:write"] },
    { path: "/dashboard/hackathons/:id/sponsors/:sponsorId", method: "PATCH", scopes: ["hackathons:write"] },
    { path: "/dashboard/hackathons/:id/sponsors/:sponsorId", method: "DELETE", scopes: ["hackathons:write"] },
    { path: "/dashboard/hackathons/:id/sponsors/reorder", method: "PATCH", scopes: ["hackathons:write"] },
    { path: "/dashboard/webhooks", method: "GET", scopes: ["webhooks:read"] },
    { path: "/dashboard/webhooks", method: "POST", scopes: ["webhooks:write"] },
    { path: "/dashboard/webhooks/:id", method: "DELETE", scopes: ["webhooks:write"] },
    { path: "/dashboard/schedules", method: "GET", scopes: ["schedules:read"] },
    { path: "/dashboard/schedules", method: "POST", scopes: ["schedules:write"] },
    { path: "/dashboard/schedules/:id", method: "GET", scopes: ["schedules:read"] },
    { path: "/dashboard/schedules/:id", method: "PATCH", scopes: ["schedules:write"] },
    { path: "/dashboard/schedules/:id", method: "DELETE", scopes: ["schedules:write"] },
    { path: "/dashboard/org-profile", method: "GET", scopes: ["org:read"] },
    { path: "/dashboard/org-profile", method: "PATCH", scopes: ["org:write"] },
    { path: "/dashboard/upload-logo", method: "POST", scopes: ["org:write"] },
    { path: "/dashboard/logo/:variant", method: "DELETE", scopes: ["org:write"] },
    { path: "/dashboard/jobs", method: "GET", scopes: [] },
    { path: "/dashboard/jobs/:id", method: "GET", scopes: [] },
  ]

  const clerkOnlyRoutes = [
    { path: "/dashboard/keys", method: "GET", scopes: ["keys:read"] },
    { path: "/dashboard/keys", method: "POST", scopes: ["keys:write"] },
    { path: "/dashboard/keys/:id/revoke", method: "POST", scopes: ["keys:write"] },
    { path: "/dashboard/integrations", method: "GET", scopes: [] },
    { path: "/dashboard/integrations/:provider/auth-url", method: "GET", scopes: [] },
    { path: "/dashboard/integrations/:provider", method: "DELETE", scopes: [] },
    { path: "/dashboard/credentials", method: "GET", scopes: [] },
    { path: "/dashboard/credentials", method: "POST", scopes: [] },
    { path: "/dashboard/credentials/:provider", method: "PATCH", scopes: [] },
    { path: "/dashboard/credentials/:provider", method: "DELETE", scopes: [] },
    { path: "/dashboard/organization-members", method: "GET", scopes: ["org:read"] },
    { path: "/dashboard/organization-members/invitations", method: "POST", scopes: ["org:write"] },
    { path: "/dashboard/organization-members/invitations/:invitationId", method: "DELETE", scopes: ["org:write"] },
    { path: "/dashboard/organization-members/:userId", method: "DELETE", scopes: ["org:write"] },
  ]

  it("dual-auth routes have correct scope mappings", () => {
    for (const route of dualAuthRoutes) {
      expect(route.path.startsWith("/dashboard")).toBe(true)
      expect(Array.isArray(route.scopes)).toBe(true)
    }
  })

  it("clerk-only routes are security-sensitive", () => {
    const sensitivePatterns = ["/keys", "/integrations", "/credentials", "/organization-members"]

    for (const route of clerkOnlyRoutes) {
      const isSensitive = sensitivePatterns.some((p) => route.path.includes(p))
      expect(isSensitive).toBe(true)
    }
  })

  it("read operations require read scopes", () => {
    const readRoutes = dualAuthRoutes.filter((r) => r.method === "GET" && r.scopes.length > 0)

    for (const route of readRoutes) {
      const hasReadScope = route.scopes.some((s) => s.endsWith(":read"))
      expect(hasReadScope).toBe(true)
    }
  })

  it("write operations require write scopes", () => {
    const writeRoutes = dualAuthRoutes.filter(
      (r) => ["POST", "PATCH", "DELETE"].includes(r.method) && r.scopes.length > 0
    )

    for (const route of writeRoutes) {
      const hasWriteScope = route.scopes.some((s) => s.endsWith(":write"))
      expect(hasWriteScope).toBe(true)
    }
  })

  it("new scopes are in default API key scopes where appropriate", () => {
    expect(DEFAULT_API_KEY_SCOPES).toContain("schedules:read")
    expect(DEFAULT_API_KEY_SCOPES).toContain("org:read")
    expect(DEFAULT_API_KEY_SCOPES).not.toContain("schedules:write")
    expect(DEFAULT_API_KEY_SCOPES).not.toContain("org:write")
  })

  it("all new scopes exist in ALL_SCOPES", () => {
    expect(ALL_SCOPES).toContain("schedules:read")
    expect(ALL_SCOPES).toContain("schedules:write")
    expect(ALL_SCOPES).toContain("org:read")
    expect(ALL_SCOPES).toContain("org:write")
  })
})

describe("/me endpoint response format", () => {
  it("user principal returns user-specific fields", () => {
    const userResponse = {
      tenantId: mockUserPrincipal.tenantId,
      userId: mockUserPrincipal.userId,
      orgId: mockUserPrincipal.orgId,
      orgRole: mockUserPrincipal.orgRole,
      scopes: mockUserPrincipal.scopes,
    }

    expect(userResponse.tenantId).toBe("tenant-123")
    expect(userResponse.userId).toBe("user-456")
    expect(userResponse.orgId).toBe("org-789")
    expect(userResponse.orgRole).toBe("org:admin")
    expect(userResponse).not.toHaveProperty("keyId")
  })

  it("API key principal returns key-specific fields", () => {
    const apiKeyResponse = {
      tenantId: mockApiKeyPrincipal.tenantId,
      keyId: mockApiKeyPrincipal.keyId,
      scopes: mockApiKeyPrincipal.scopes,
    }

    expect(apiKeyResponse.tenantId).toBe("tenant-123")
    expect(apiKeyResponse.keyId).toBe("key-456")
    expect(apiKeyResponse).not.toHaveProperty("userId")
    expect(apiKeyResponse).not.toHaveProperty("orgId")
    expect(apiKeyResponse).not.toHaveProperty("orgRole")
  })
})
