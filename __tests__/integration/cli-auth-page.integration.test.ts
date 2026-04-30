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

mock.module("@/lib/services/tenants", () => ({
  getOrCreateTenant: mockGetOrCreateTenant,
}))

const mockLogAudit = mock(() => Promise.resolve(null))

mock.module("@/lib/services/audit", () => ({
  logAudit: mockLogAudit,
  listAllAuditLogs: mock(() => Promise.resolve({ logs: [], total: 0 })),
}))

const MockCliAuthOrgGate = () => "Pick an organization"

mock.module("@/components/cli-auth/cli-auth-org-gate", () => ({
  CliAuthOrgGate: MockCliAuthOrgGate,
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
    mockLogAudit.mockReset()

    mockAuth.mockResolvedValue({ userId: "user-123", orgId: null })
    mockRedirect.mockImplementation((_url: string): never => {
      throw new Error("NEXT_REDIRECT")
    })
    mockHeaders.mockResolvedValue({
      get: (name: string) => (name === "host" ? "app.oatmeal.dev:3000" : null),
    })
    mockCompleteCliAuthSession.mockResolvedValue({ success: true })
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
  })

  describe("successful auth", () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue({ userId: "user-123", orgId: "org-456" })
    })

    it("calls completeCliAuthSession with hostname from host header (no port)", async () => {
      await CliAuthPage({ searchParams: Promise.resolve({ token: validToken }) })

      expect(mockCompleteCliAuthSession).toHaveBeenCalledWith(
        validToken,
        "tenant-org-1",
        "app.oatmeal.dev"
      )
    })

    it("uses org tenant when orgId is present", async () => {
      await CliAuthPage({ searchParams: Promise.resolve({ token: validToken }) })

      expect(mockGetOrCreateTenant).toHaveBeenCalledWith("org-456")
      expect(mockCompleteCliAuthSession).toHaveBeenCalledWith(
        validToken,
        "tenant-org-1",
        "app.oatmeal.dev"
      )
    })

    it("shows an org picker when orgId is null", async () => {
      mockAuth.mockResolvedValue({ userId: "user-123", orgId: null })

      const result = await CliAuthPage({ searchParams: Promise.resolve({ token: validToken }) })

      expect(mockCompleteCliAuthSession).not.toHaveBeenCalled()
      expect(mockGetOrCreateTenant).not.toHaveBeenCalled()
      const child = (result as { props: { children: { type: unknown } } }).props.children
      expect(child.type).toBe(MockCliAuthOrgGate)
    })

    it("logs audit event on success", async () => {
      await CliAuthPage({ searchParams: Promise.resolve({ token: validToken }) })

      expect(mockLogAudit).toHaveBeenCalledTimes(1)
      const call = mockLogAudit.mock.calls[0] as unknown as [{ action: string; resourceType: string; resourceId: string; principal: { kind: string; tenantId: string; userId: string } }]
      expect(call[0].action).toBe("cli_auth.completed")
      expect(call[0].resourceType).toBe("cli_auth_session")
      expect(call[0].resourceId).toBe(validToken.slice(0, 12))
      expect(call[0].principal.kind).toBe("user")
      expect(call[0].principal.tenantId).toBe("tenant-org-1")
      expect(call[0].principal.userId).toBe("user-123")
    })

    it("passes hostname undefined when host header is absent", async () => {
      mockHeaders.mockResolvedValue({ get: () => null })

      await CliAuthPage({ searchParams: Promise.resolve({ token: validToken }) })

      expect(mockCompleteCliAuthSession).toHaveBeenCalledWith(
        validToken,
        "tenant-org-1",
        undefined
      )
    })
  })

  describe("failure paths", () => {
    it("does not log audit when session completion fails", async () => {
      mockCompleteCliAuthSession.mockResolvedValue({ success: false, error: "Session expired" })

      await CliAuthPage({ searchParams: Promise.resolve({ token: validToken }) })

      expect(mockLogAudit).not.toHaveBeenCalled()
    })

    it("returns error result when tenant cannot be resolved", async () => {
      mockAuth.mockResolvedValue({ userId: "user-123", orgId: "org-456" })
      mockGetOrCreateTenant.mockResolvedValue(null)

      const result = await CliAuthPage({ searchParams: Promise.resolve({ token: validToken }) })

      expect(mockCompleteCliAuthSession).not.toHaveBeenCalled()
      expect(mockLogAudit).not.toHaveBeenCalled()
      expect(result).toBeDefined()
    })

    it("returns generic error message when completeCliAuthSession throws", async () => {
      mockCompleteCliAuthSession.mockRejectedValue(new Error("DB connection failed"))

      const result = await CliAuthPage({ searchParams: Promise.resolve({ token: validToken }) })

      expect(mockLogAudit).not.toHaveBeenCalled()
      expect(result).toBeDefined()
    })

    it("does not expose internal error details in result on exception", async () => {
      mockCompleteCliAuthSession.mockRejectedValue(new Error("secret DB password is abc123"))

      const pageResult = await CliAuthPage({ searchParams: Promise.resolve({ token: validToken }) })

      const resultStr = JSON.stringify(pageResult)
      expect(resultStr).not.toContain("abc123")
    })
  })
})
