import { describe, expect, it, mock, beforeEach } from "bun:test"

const mockAuth = mock(() => Promise.resolve({ userId: "user-123", orgId: null }))
const mockRedirect = mock((_url: string): never => {
  throw new Error("NEXT_REDIRECT")
})
const mockHeaders = mock(() =>
  Promise.resolve({
    get: (name: string) => (name === "host" ? "app.oatmeal.dev:3000" : null),
  })
)

mock.module("@clerk/nextjs/server", () => ({
  auth: mockAuth,
}))

mock.module("next/navigation", () => ({
  redirect: mockRedirect,
}))

mock.module("next/headers", () => ({
  headers: mockHeaders,
}))

const mockCompleteCliAuthSession = mock(() => Promise.resolve({ success: true }))

mock.module("@/lib/services/cli-auth", () => ({
  createCliAuthSession: mock(() => Promise.resolve(null)),
  pollCliAuthSession: mock(() => Promise.resolve({ status: "pending" as const })),
  completeCliAuthSession: mockCompleteCliAuthSession,
}))

const mockGetOrCreateTenant = mock(() =>
  Promise.resolve({ id: "tenant-org-1", name: "Test Org" })
)
const mockGetOrCreatePersonalTenant = mock(() =>
  Promise.resolve({ id: "tenant-personal-1", name: "Personal" })
)

mock.module("@/lib/services/tenants", () => ({
  getOrCreateTenant: mockGetOrCreateTenant,
  getOrCreatePersonalTenant: mockGetOrCreatePersonalTenant,
}))

const mockLogAudit = mock(() => Promise.resolve(null))

mock.module("@/lib/services/audit", () => ({
  logAudit: mockLogAudit,
  listAllAuditLogs: mock(() => Promise.resolve({ logs: [], total: 0 })),
}))

const { default: CliAuthPage } = await import("@/app/(public)/cli-auth/page")

const validToken = "a".repeat(32)

describe("CLI Auth Page", () => {
  beforeEach(() => {
    mockAuth.mockReset()
    mockRedirect.mockReset()
    mockHeaders.mockReset()
    mockCompleteCliAuthSession.mockReset()
    mockGetOrCreateTenant.mockReset()
    mockGetOrCreatePersonalTenant.mockReset()
    mockLogAudit.mockReset()

    mockAuth.mockResolvedValue({ userId: "user-123", orgId: null })
    mockRedirect.mockImplementation((_url: string): never => {
      throw new Error("NEXT_REDIRECT")
    })
    mockHeaders.mockResolvedValue({
      get: (name: string) => (name === "host" ? "app.oatmeal.dev:3000" : null),
    })
    mockCompleteCliAuthSession.mockResolvedValue({ success: true })
    mockGetOrCreatePersonalTenant.mockResolvedValue({ id: "tenant-personal-1", name: "Personal" })
    mockGetOrCreateTenant.mockResolvedValue({ id: "tenant-org-1", name: "Test Org" })
  })

  describe("invalid token", () => {
    it("renders error UI when token is missing", async () => {
      const result = await CliAuthPage({ searchParams: Promise.resolve({}) })
      expect(mockCompleteCliAuthSession).not.toHaveBeenCalled()
      expect(result).toBeDefined()
    })

    it("renders error UI when token is too short", async () => {
      const result = await CliAuthPage({ searchParams: Promise.resolve({ token: "short" }) })
      expect(mockCompleteCliAuthSession).not.toHaveBeenCalled()
      expect(result).toBeDefined()
    })
  })

  describe("unauthenticated user", () => {
    it("redirects to sign-in when userId is null", async () => {
      mockAuth.mockResolvedValue({ userId: null, orgId: null })

      await expect(
        CliAuthPage({ searchParams: Promise.resolve({ token: validToken }) })
      ).rejects.toThrow("NEXT_REDIRECT")

      expect(mockRedirect).toHaveBeenCalledWith(
        `/sign-in?redirect_url=${encodeURIComponent(
          `/cli-auth?token=${encodeURIComponent(validToken)}`
        )}`
      )
    })

    it("keeps the personal choice through sign-in", async () => {
      mockAuth.mockResolvedValue({ userId: null, orgId: null })

      await expect(
        CliAuthPage({ searchParams: Promise.resolve({ token: validToken, personal: "1" }) })
      ).rejects.toThrow("NEXT_REDIRECT")

      expect(mockRedirect).toHaveBeenCalledWith(
        `/sign-in?redirect_url=${encodeURIComponent(
          `/cli-auth?token=${encodeURIComponent(validToken)}&personal=1`
        )}`
      )
    })
  })

  describe("workspace choice", () => {
    it("shows workspace choices before using a personal workspace", async () => {
      const result = await CliAuthPage({ searchParams: Promise.resolve({ token: validToken }) })

      expect(mockCompleteCliAuthSession).not.toHaveBeenCalled()
      expect(JSON.stringify(result)).toContain("Pick a workspace")
    })
  })

  describe("successful auth", () => {
    it("calls completeCliAuthSession with hostname from host header (no port)", async () => {
      await CliAuthPage({ searchParams: Promise.resolve({ token: validToken, personal: "1" }) })

      expect(mockCompleteCliAuthSession).toHaveBeenCalledWith(
        validToken,
        "tenant-personal-1",
        "app.oatmeal.dev"
      )
    })

    it("uses org tenant when orgId is present", async () => {
      mockAuth.mockResolvedValue({ userId: "user-123", orgId: "org-456" })

      await CliAuthPage({ searchParams: Promise.resolve({ token: validToken }) })

      expect(mockGetOrCreateTenant).toHaveBeenCalledWith("org-456")
      expect(mockGetOrCreatePersonalTenant).not.toHaveBeenCalled()
      expect(mockCompleteCliAuthSession).toHaveBeenCalledWith(
        validToken,
        "tenant-org-1",
        "app.oatmeal.dev"
      )
    })

    it("uses personal tenant when the user picks personal workspace", async () => {
      await CliAuthPage({ searchParams: Promise.resolve({ token: validToken, personal: "1" }) })

      expect(mockGetOrCreatePersonalTenant).toHaveBeenCalledWith("user-123")
      expect(mockGetOrCreateTenant).not.toHaveBeenCalled()
    })

    it("logs audit event on success", async () => {
      await CliAuthPage({ searchParams: Promise.resolve({ token: validToken, personal: "1" }) })

      expect(mockLogAudit).toHaveBeenCalledTimes(1)
      const call = mockLogAudit.mock.calls[0] as unknown as [{ action: string; resourceType: string; resourceId: string; principal: { kind: string; tenantId: string; userId: string } }]
      expect(call[0].action).toBe("cli_auth.completed")
      expect(call[0].resourceType).toBe("cli_auth_session")
      expect(call[0].resourceId).toBe(validToken.slice(0, 12))
      expect(call[0].principal.kind).toBe("user")
      expect(call[0].principal.tenantId).toBe("tenant-personal-1")
      expect(call[0].principal.userId).toBe("user-123")
    })

    it("passes hostname undefined when host header is absent", async () => {
      mockHeaders.mockResolvedValue({ get: () => null })

      await CliAuthPage({ searchParams: Promise.resolve({ token: validToken, personal: "1" }) })

      expect(mockCompleteCliAuthSession).toHaveBeenCalledWith(
        validToken,
        "tenant-personal-1",
        undefined
      )
    })
  })

  describe("failure paths", () => {
    it("does not log audit when session completion fails", async () => {
      mockCompleteCliAuthSession.mockResolvedValue({ success: false, error: "Session expired" })

      await CliAuthPage({ searchParams: Promise.resolve({ token: validToken, personal: "1" }) })

      expect(mockLogAudit).not.toHaveBeenCalled()
    })

    it("returns error result when tenant cannot be resolved", async () => {
      mockGetOrCreatePersonalTenant.mockResolvedValue(null)

      const result = await CliAuthPage({ searchParams: Promise.resolve({ token: validToken, personal: "1" }) })

      expect(mockCompleteCliAuthSession).not.toHaveBeenCalled()
      expect(mockLogAudit).not.toHaveBeenCalled()
      expect(result).toBeDefined()
    })

    it("returns generic error message when completeCliAuthSession throws", async () => {
      mockCompleteCliAuthSession.mockRejectedValue(new Error("DB connection failed"))

      const result = await CliAuthPage({ searchParams: Promise.resolve({ token: validToken, personal: "1" }) })

      expect(mockLogAudit).not.toHaveBeenCalled()
      expect(result).toBeDefined()
    })

    it("does not expose internal error details in result on exception", async () => {
      mockCompleteCliAuthSession.mockRejectedValue(new Error("secret DB password is abc123"))

      const pageResult = await CliAuthPage({ searchParams: Promise.resolve({ token: validToken, personal: "1" }) })

      const resultStr = JSON.stringify(pageResult)
      expect(resultStr).not.toContain("abc123")
    })
  })
})
