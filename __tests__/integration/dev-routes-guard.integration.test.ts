import { describe, expect, it, afterEach, mock } from "bun:test"
import { Elysia } from "elysia"

const mockResolvePrincipal = mock(() =>
  Promise.resolve({ kind: "anon" as const })
)
const mockIsAdminEnabled = mock(() => true)

mock.module("@/lib/auth/principal", () => ({
  resolvePrincipal: mockResolvePrincipal,
  isAdminEnabled: mockIsAdminEnabled,
}))

const { devRoutes } = await import("@/lib/api/routes/dev")

describe("dev routes guard", () => {
  const originalNodeEnv = process.env.NODE_ENV
  const originalAdminEnabled = process.env.ADMIN_ENABLED

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv
    if (originalAdminEnabled === undefined) {
      delete process.env.ADMIN_ENABLED
    } else {
      process.env.ADMIN_ENABLED = originalAdminEnabled
    }
    mockResolvePrincipal.mockReset()
    mockIsAdminEnabled.mockReset()
    mockResolvePrincipal.mockImplementation(() =>
      Promise.resolve({ kind: "anon" as const })
    )
    mockIsAdminEnabled.mockImplementation(() => true)
  })

  it("allows requests in development environment", async () => {
    process.env.NODE_ENV = "development"
    process.env.ADMIN_ENABLED = "true"

    const app = new Elysia({ prefix: "/api" }).use(devRoutes)
    const res = await app.handle(
      new Request("http://localhost/api/dev/config-status")
    )

    expect(res.status).toBe(200)
    expect(mockResolvePrincipal).not.toHaveBeenCalled()
  })

  it("returns 403 for unauthenticated requests in non-dev environment", async () => {
    process.env.NODE_ENV = "production"
    process.env.ADMIN_ENABLED = "true"

    const app = new Elysia({ prefix: "/api" }).use(devRoutes)
    const res = await app.handle(
      new Request("http://localhost/api/dev/config-status")
    )

    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe("Forbidden")
  })

  it("allows admin requests in non-dev environment", async () => {
    process.env.NODE_ENV = "production"
    process.env.ADMIN_ENABLED = "true"
    mockResolvePrincipal.mockImplementation(() =>
      Promise.resolve({ kind: "admin" as const })
    )

    const app = new Elysia({ prefix: "/api" }).use(devRoutes)
    const res = await app.handle(
      new Request("http://localhost/api/dev/config-status")
    )

    expect(res.status).toBe(200)
    expect(mockResolvePrincipal).toHaveBeenCalledTimes(1)
  })

  it("returns 403 when ADMIN_ENABLED is not set in non-dev", async () => {
    process.env.NODE_ENV = "production"
    delete process.env.ADMIN_ENABLED
    mockIsAdminEnabled.mockImplementation(() => false)

    const app = new Elysia({ prefix: "/api" }).use(devRoutes)
    const res = await app.handle(
      new Request("http://localhost/api/dev/config-status")
    )

    expect(res.status).toBe(403)
    expect(mockResolvePrincipal).not.toHaveBeenCalled()
  })
})
