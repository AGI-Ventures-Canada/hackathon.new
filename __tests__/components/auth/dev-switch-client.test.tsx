import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test"
import { render, screen, cleanup, waitFor } from "@testing-library/react"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any

let signInCreateImpl: (...args: unknown[]) => Promise<unknown> = () =>
  Promise.resolve({ status: "complete", createdSessionId: "session_abc" })

const signInCreate = mock((...args: unknown[]) => signInCreateImpl(...args))

const mockSetActive = g.__clerkState.setActive
const mockSignInSetActive = g.__clerkState.signInSetActive
const mockSignOut = g.__clerkState.signOut

const replaceCalls: string[] = []
const originalLocation = window.location
const locationMock = {
  replace: (url: string) => {
    replaceCalls.push(url)
  },
}

const { DevSwitchClient } = await import("@/app/(auth)/dev-switch/switch-client")

beforeEach(() => {
  g.__clerkState.signInLoaded = true
  g.__clerkState.signIn = { create: signInCreate }
  g.__clerkState.isLoaded = true
  g.__clerkState.sessionLoaded = true
  g.__clerkState.session = { id: "sess_current" }
  g.__clerkState.isSignedIn = false

  signInCreateImpl = () =>
    Promise.resolve({ status: "complete", createdSessionId: "session_abc" })
  signInCreate.mockClear()
  mockSetActive.mockImplementation(() => Promise.resolve())
  mockSetActive.mockClear()
  mockSignInSetActive.mockClear()
  mockSignOut.mockImplementation(() => Promise.resolve())
  mockSignOut.mockClear()
  replaceCalls.length = 0
  Object.defineProperty(window, "location", {
    configurable: true,
    value: locationMock,
  })
})

afterEach(() => {
  g.__clerkState.signInLoaded = false
  g.__clerkState.signIn = null
  Object.defineProperty(window, "location", {
    configurable: true,
    value: originalLocation,
  })
  cleanup()
})

describe("DevSwitchClient", () => {
  it("signs in via ticket and redirects", async () => {
    render(<DevSwitchClient token="ticket_xyz" redirect="/e/demo" org={null} />)
    await waitFor(() => {
      expect(signInCreate).toHaveBeenCalledWith({
        strategy: "ticket",
        ticket: "ticket_xyz",
      })
    })
    await waitFor(() => expect(replaceCalls).toEqual(["/e/demo"]))
  })

  it("activates session without organization when org is null", async () => {
    render(<DevSwitchClient token="ticket_xyz" redirect="/e/demo" org={null} />)
    await waitFor(() => expect(mockSetActive).toHaveBeenCalledTimes(1))
    expect(mockSetActive).toHaveBeenCalledWith({ session: "session_abc" })
  })

  it("activates session with organization when org is provided", async () => {
    render(
      <DevSwitchClient token="ticket_xyz" redirect="/e/demo" org="org_tenant_123" />
    )
    await waitFor(() => expect(mockSetActive).toHaveBeenCalledTimes(1))
    expect(mockSetActive).toHaveBeenCalledWith({
      session: "session_abc",
      organization: "org_tenant_123",
    })
  })

  it("signs out an already-signed-in user before creating the ticket session", async () => {
    g.__clerkState.isSignedIn = true
    render(<DevSwitchClient token="ticket_xyz" redirect="/e/demo" org={null} />)
    await waitFor(() => expect(signInCreate).toHaveBeenCalled())
    expect(mockSignOut).toHaveBeenCalledTimes(1)
    expect(mockSignOut).toHaveBeenCalledWith({ sessionId: "sess_current" })
  })

  it("continues when the old session is already gone", async () => {
    g.__clerkState.isSignedIn = true
    mockSignOut.mockImplementation(() => Promise.reject({ status: 404 }))
    render(<DevSwitchClient token="ticket_xyz" redirect="/e/demo" org={null} />)
    await waitFor(() => expect(signInCreate).toHaveBeenCalled())
    await waitFor(() => expect(mockSetActive).toHaveBeenCalledWith({ session: "session_abc" }))
    expect(replaceCalls).toEqual(["/e/demo"])
  })

  it("continues when Clerk returns stale-session 403 text", async () => {
    g.__clerkState.isSignedIn = true
    mockSignOut.mockImplementation(() => Promise.reject({
      status: 403,
      errors: [{ message: "not found or unauthorized" }],
    }))
    render(<DevSwitchClient token="ticket_xyz" redirect="/e/demo" org={null} />)
    await waitFor(() => expect(signInCreate).toHaveBeenCalled())
    await waitFor(() => expect(mockSetActive).toHaveBeenCalledWith({ session: "session_abc" }))
    expect(replaceCalls).toEqual(["/e/demo"])
  })

  it("shows an error for non-stale Clerk 403 failures", async () => {
    g.__clerkState.isSignedIn = true
    mockSignOut.mockImplementation(() => Promise.reject({
      status: 403,
      errors: [{ message: "missing permission" }],
    }))
    render(<DevSwitchClient token="ticket_xyz" redirect="/e/demo" org={null} />)
    await waitFor(() => {
      expect(screen.getByText("Sign-in failed")).toBeDefined()
    })
    expect(signInCreate).not.toHaveBeenCalled()
    expect(replaceCalls).toEqual([])
  })

  it("does not sign out when user is not signed in", async () => {
    render(<DevSwitchClient token="ticket_xyz" redirect="/e/demo" org={null} />)
    await waitFor(() => expect(signInCreate).toHaveBeenCalled())
    expect(mockSignOut).not.toHaveBeenCalled()
  })

  it("shows an error message when sign-in returns a non-complete status", async () => {
    signInCreateImpl = () => Promise.resolve({ status: "needs_first_factor" })
    render(<DevSwitchClient token="ticket_xyz" redirect="/e/demo" org={null} />)
    await waitFor(() => {
      expect(screen.getByText(/Unexpected sign-in status/)).toBeDefined()
    })
    expect(replaceCalls).toEqual([])
  })

  it("shows an error message when sign-in throws", async () => {
    signInCreateImpl = () => Promise.reject(new Error("Ticket expired"))
    render(<DevSwitchClient token="ticket_xyz" redirect="/e/demo" org={null} />)
    await waitFor(() => {
      expect(screen.getByText("Ticket expired")).toBeDefined()
    })
    expect(mockSetActive).not.toHaveBeenCalled()
    expect(mockSignInSetActive).not.toHaveBeenCalled()
  })

  it("waits for Clerk to load before attempting sign-in", async () => {
    g.__clerkState.signInLoaded = false
    render(<DevSwitchClient token="ticket_xyz" redirect="/e/demo" org={null} />)
    expect(signInCreate).not.toHaveBeenCalled()
  })
})
