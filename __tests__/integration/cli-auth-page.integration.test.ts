import { beforeEach, describe, expect, it, mock } from "bun:test"

const mockAuth = mock(() =>
  Promise.resolve({ userId: "user-123", orgId: null, orgRole: null })
)
const mockRedirect = mock((_url: string): never => {
  throw new Error("NEXT_REDIRECT")
})
const mockHeaders = mock(() =>
  Promise.resolve({
    get: (name: string) => (name === "host" ? "app.oatmeal.dev:3000" : null),
  })
)

mock.module("@clerk/nextjs/server", () => ({ auth: mockAuth }))
mock.module("next/navigation", () => ({ redirect: mockRedirect }))
mock.module("next/headers", () => ({ headers: mockHeaders }))

const mockCompleteCliAuthSession = mock(() => Promise.resolve({ success: true }))
mock.module("@/lib/services/cli-auth", () => ({
  completeCliAuthSession: mockCompleteCliAuthSession,
  getCliKeyScopes: (scopes: string[]) => scopes.filter((scope) => scope !== "keys:write"),
  isValidCliDeviceToken: (token: string) => /^[a-f0-9]{64}$/.test(token),
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

const MockCliAuthAuthorizeClient = () => null
mock.module("@/components/cli-auth/cli-auth-authorize-client", () => ({
  CliAuthAuthorizeClient: MockCliAuthAuthorizeClient,
}))

const { default: CliAuthPage } = await import("@/app/(public)/cli-auth/page")
const validToken = "a".repeat(64)

describe("CLI Auth Page", () => {
  beforeEach(() => {
    mockAuth.mockReset()
    mockRedirect.mockReset()
    mockHeaders.mockReset()
    mockCompleteCliAuthSession.mockReset()
    mockGetOrCreateTenant.mockReset()
    mockLogAudit.mockReset()

    mockAuth.mockResolvedValue({ userId: "user-123", orgId: null, orgRole: null })
    mockRedirect.mockImplementation((_url: string): never => {
      throw new Error("NEXT_REDIRECT")
    })
    mockHeaders.mockResolvedValue({
      get: (name: string) => (name === "host" ? "app.oatmeal.dev:3000" : null),
    })
    mockCompleteCliAuthSession.mockResolvedValue({ success: true })
    mockGetOrCreateTenant.mockResolvedValue({ id: "tenant-org-1", name: "Test Org" })
  })

  it("renders the browser-only authorization handoff without reading a token from the URL", async () => {
    const result = await CliAuthPage({ searchParams: Promise.resolve({}) })
    expect(result).toBeDefined()
    expect(mockCompleteCliAuthSession).not.toHaveBeenCalled()
  })

  it("redirects a signed-out form submission without putting the token in the redirect", async () => {
    mockAuth.mockResolvedValue({ userId: null, orgId: null, orgRole: null })
    const result = await CliAuthPage({ searchParams: Promise.resolve({}) })
    const child = (result as { props: { children: { props: { action: (data: FormData) => Promise<void> } } } }).props.children
    const data = new FormData()
    data.set("token", validToken)
    await expect(child.props.action(data)).rejects.toThrow("NEXT_REDIRECT")
    expect(mockRedirect).toHaveBeenCalledWith("/sign-in?redirect_url=%2Fcli-auth")
  })

  it("requires an explicit authorization action before creating a key", async () => {
    mockAuth.mockResolvedValue({
      userId: "user-123",
      orgId: "org-456",
      orgRole: "org:admin",
    })

    const result = await CliAuthPage({ searchParams: Promise.resolve({}) })
    expect(mockCompleteCliAuthSession).not.toHaveBeenCalled()

    const child = (result as { props: { children: { props: { action: (data: FormData) => Promise<void> } } } }).props.children
    const data = new FormData()
    data.set("token", validToken)

    await expect(child.props.action(data)).rejects.toThrow("NEXT_REDIRECT")
    expect(mockCompleteCliAuthSession).toHaveBeenCalledTimes(1)
    expect(mockLogAudit).toHaveBeenCalledTimes(1)
  })

  it("renders a completed state without reusing the device token", async () => {
    const result = await CliAuthPage({
      searchParams: Promise.resolve({ result: "success" }),
    })

    expect(result).toBeDefined()
    expect(mockAuth).not.toHaveBeenCalled()
    expect(mockCompleteCliAuthSession).not.toHaveBeenCalled()
  })
})
