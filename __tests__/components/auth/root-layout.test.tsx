import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { mockAuth } from "../../lib/supabase-mock"

const mockHasAdminMetadata = mock((_claims: unknown) => false)

mock.module("next/font/google", () => ({
  Geist: () => ({ variable: "geist-sans" }),
  Geist_Mono: () => ({ variable: "geist-mono" }),
  JetBrains_Mono: () => ({ variable: "jetbrains-mono" }),
}))

mock.module("@/lib/auth/principal", () => ({
  hasAdminMetadata: (...args: [unknown]) => mockHasAdminMetadata(...args),
}))

mock.module("@/components/theme-provider", () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="theme-provider">{children}</div>
  ),
}))

mock.module("@/components/clerk-provider", () => ({
  ThemedClerkProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="clerk-provider">{children}</div>
  ),
}))

mock.module("@/components/posthog-provider", () => ({
  PostHogProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="posthog-provider">{children}</div>
  ),
}))

mock.module("@/components/search-command", () => ({
  SearchCommand: () => <div data-testid="search-command" />,
}))

mock.module("@/components/dev-tool/dev-tool", () => ({
  DevTool: () => <div data-testid="dev-tool" />,
}))

const originalNodeEnv = process.env.NODE_ENV
const originalAdminEnabled = process.env.ADMIN_ENABLED
const { default: RootLayout, metadata } = await import("@/app/layout")

function restoreEnvironment() {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV
  else process.env.NODE_ENV = originalNodeEnv
  if (originalAdminEnabled === undefined) delete process.env.ADMIN_ENABLED
  else process.env.ADMIN_ENABLED = originalAdminEnabled
}

beforeEach(() => {
  process.env.NODE_ENV = "production"
  delete process.env.ADMIN_ENABLED
  mockAuth.mockReset()
  mockAuth.mockImplementation(() =>
    Promise.resolve({ userId: null, orgId: null, orgRole: null }),
  )
  mockHasAdminMetadata.mockReset()
  mockHasAdminMetadata.mockReturnValue(false)
})

afterAll(restoreEnvironment)

describe("RootLayout", () => {
  it("renders the shared providers", async () => {
    const html = renderToStaticMarkup(
      await RootLayout({ children: <main>Event builder</main> }),
    )

    expect(metadata).toEqual({
      title: "hackathon.new",
      description: "Run your hackathon from start to finish.",
    })
    expect(html).toContain('data-testid="theme-provider"')
    expect(html).toContain('data-testid="clerk-provider"')
    expect(html).toContain('data-testid="posthog-provider"')
    expect(html).toContain("Event builder")
    expect(html).not.toContain('data-testid="dev-tool"')
    expect(mockAuth).not.toHaveBeenCalled()
  })

  it("shows local development tools without checking authentication", async () => {
    process.env.NODE_ENV = "development"

    const html = renderToStaticMarkup(
      await RootLayout({ children: <main>Home</main> }),
    )

    expect(html).toContain('data-testid="dev-tool"')
    expect(mockAuth).not.toHaveBeenCalled()
  })

  it("does not authenticate when production admin tools are disabled", async () => {
    process.env.ADMIN_ENABLED = "false"

    const html = renderToStaticMarkup(
      await RootLayout({ children: <main>Home</main> }),
    )

    expect(html).not.toContain('data-testid="dev-tool"')
    expect(mockAuth).not.toHaveBeenCalled()
  })

  it("hides production admin tools from a signed-out session", async () => {
    process.env.ADMIN_ENABLED = "true"

    const html = renderToStaticMarkup(
      await RootLayout({ children: <main>Home</main> }),
    )

    expect(html).not.toContain('data-testid="dev-tool"')
    expect(mockAuth).toHaveBeenCalledTimes(1)
    expect(mockHasAdminMetadata).not.toHaveBeenCalled()
  })

  it("uses signed-in session claims to decide production admin access", async () => {
    process.env.ADMIN_ENABLED = "true"
    const claims = { metadata: { admin: true } }
    mockAuth.mockImplementation(() =>
      Promise.resolve({ userId: "user_admin", orgId: null, sessionClaims: claims }),
    )
    mockHasAdminMetadata.mockReturnValue(true)

    const html = renderToStaticMarkup(
      await RootLayout({ children: <main>Home</main> }),
    )

    expect(mockHasAdminMetadata).toHaveBeenCalledWith(claims)
    expect(html).toContain('data-testid="dev-tool"')
  })
})
