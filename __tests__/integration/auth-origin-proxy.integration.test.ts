import { beforeEach, describe, expect, it, mock } from "bun:test"
import { NextRequest, type NextResponse } from "next/server"
import { AUTH_REQUEST_ORIGIN_HEADER } from "@/lib/auth/redirect"

type ProxyHandler = (auth: { protect: () => Promise<void> }, request: NextRequest) => Promise<NextResponse>
let protectedRoute = false
const protect = mock(() => Promise.resolve())
mock.module("@clerk/nextjs/server", () => ({
  clerkMiddleware: (handler: ProxyHandler) => handler,
  createRouteMatcher: () => () => protectedRoute,
}))
const { default: handler } = await import("@/proxy")
const proxy = handler as unknown as ProxyHandler

beforeEach(() => { protectedRoute = false; protect.mockReset(); protect.mockResolvedValue() })

describe("auth return origin proxy boundary", () => {
  it("overwrites a caller-supplied origin with the current request origin", async () => {
    const request = new NextRequest("https://preview.example.com/sign-in?redirect_url=%2Fhome%2Fjudging", { headers: { [AUTH_REQUEST_ORIGIN_HEADER]: "https://evil.example", "x-forwarded-host": "evil.example" } })
    const response = await proxy({ protect }, request)
    expect(response.headers.get(`x-middleware-request-${AUTH_REQUEST_ORIGIN_HEADER}`)).toBe("https://preview.example.com")
    expect(protect).not.toHaveBeenCalled()
  })
  it("keeps Clerk protection in front of protected routes", async () => {
    protectedRoute = true
    protect.mockRejectedValue(new Error("SIGN_IN_REQUIRED"))
    await expect(proxy({ protect }, new NextRequest("https://preview.example.com/home/judging"))).rejects.toThrow("SIGN_IN_REQUIRED")
    expect(protect).toHaveBeenCalledTimes(1)
  })
})
