import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { render, screen, cleanup, act } from "@testing-library/react"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any

const mockReplace = g.__nextNavState.router.replace

const { SSOCallback } = await import("@/app/(auth)/sso-callback/sso-callback")

let callbacks: Array<{ fn: () => void; delay: number }>
let originalGlobalSetTimeout: typeof globalThis.setTimeout
let originalWindowSetTimeout: typeof window.setTimeout
let originalLocation: Location

function setLocation(pathname: string) {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...originalLocation, pathname, replace: () => {} },
  })
}

beforeEach(() => {
  g.__clerkState.isLoaded = true
  g.__clerkState.isSignedIn = true
  g.__clerkState.orgId = null
  g.__nextNavState.searchParams = new URLSearchParams()
  mockReplace.mockClear()

  callbacks = []
  const stub = ((fn: () => void, delay: number) => {
    callbacks.push({ fn, delay })
    return callbacks.length as unknown as ReturnType<typeof setTimeout>
  }) as typeof globalThis.setTimeout
  originalGlobalSetTimeout = globalThis.setTimeout
  originalWindowSetTimeout = window.setTimeout
  globalThis.setTimeout = stub
  window.setTimeout = stub as unknown as typeof window.setTimeout

  originalLocation = window.location
  setLocation("/sso-callback")
})

afterEach(() => {
  globalThis.setTimeout = originalGlobalSetTimeout
  window.setTimeout = originalWindowSetTimeout
  Object.defineProperty(window, "location", {
    configurable: true,
    value: originalLocation,
  })
  cleanup()
})

function flushTimers() {
  const pending = [...callbacks]
  callbacks = []
  pending.forEach(({ fn }) => fn())
}

describe("SSOCallback", () => {
  it("renders Clerk callback element and loading state", () => {
    render(<SSOCallback />)
    expect(screen.getByTestId("authenticate-with-redirect-callback")).toBeDefined()
    expect(screen.getByText("Signing you in…")).toBeDefined()
  })

  it("does not pass force-redirect props to Clerk callback", () => {
    render(<SSOCallback />)
    const el = screen.getByTestId("authenticate-with-redirect-callback")
    expect(el.getAttribute("signinforceredirecturl")).toBeNull()
    expect(el.getAttribute("signupforceredirecturl")).toBeNull()
  })

  it("schedules an 8 second fallback timeout when signed in", () => {
    render(<SSOCallback />)
    expect(callbacks.find((c) => c.delay === 8000)).toBeDefined()
  })

  it("does not schedule fallback when auth is not loaded", () => {
    g.__clerkState.isLoaded = false
    render(<SSOCallback />)
    expect(callbacks.find((c) => c.delay === 8000)).toBeUndefined()
  })

  it("does not schedule fallback when user is not signed in", () => {
    g.__clerkState.isSignedIn = false
    render(<SSOCallback />)
    expect(callbacks.find((c) => c.delay === 8000)).toBeUndefined()
  })

  it("falls back to /onboarding when user has no org", async () => {
    render(<SSOCallback />)
    await act(async () => {
      flushTimers()
    })
    expect(mockReplace).toHaveBeenCalledWith("/onboarding")
  })

  it("falls back to /home when user has an org", async () => {
    g.__clerkState.orgId = "org_abc"
    render(<SSOCallback />)
    await act(async () => {
      flushTimers()
    })
    expect(mockReplace).toHaveBeenCalledWith("/home")
  })

  it("honors ?redirect_url over the orgId-based default", async () => {
    g.__nextNavState.searchParams = new URLSearchParams("redirect_url=/judge-invite/abc")
    render(<SSOCallback />)
    await act(async () => {
      flushTimers()
    })
    expect(mockReplace).toHaveBeenCalledWith("/judge-invite/abc")
  })

  it("does not navigate if Clerk already moved off /sso-callback", async () => {
    render(<SSOCallback />)
    setLocation("/home")
    await act(async () => {
      flushTimers()
    })
    expect(mockReplace).not.toHaveBeenCalled()
  })
})
