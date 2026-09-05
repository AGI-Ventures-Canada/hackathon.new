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
  mockSignInSetActive.mockImplementation(() => Promise.resolve())
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
    render(<DevSwitchClient token="ticket_xyz" redirect="/e/demo" org={null} signedOut={false} />)
    await waitFor(() => {
      expect(signInCreate).toHaveBeenCalledWith({
        strategy: "ticket",
        ticket: "ticket_xyz",
      })
    })
    await waitFor(() =>
      expect(mockSignInSetActive).toHaveBeenCalledWith({
        session: "session_abc",
        organization: null,
        redirectUrl: "/e/demo",
      })
    )
  })

  it("activates session and clears organization when org is null", async () => {
    render(<DevSwitchClient token="ticket_xyz" redirect="/e/demo" org={null} signedOut={false} />)
    await waitFor(() => expect(mockSignInSetActive).toHaveBeenCalledTimes(1))
    expect(mockSignInSetActive).toHaveBeenCalledWith({
      session: "session_abc",
      organization: null,
      redirectUrl: "/e/demo",
    })
  })

  it("activates session with organization when org is provided", async () => {
    render(
      <DevSwitchClient token="ticket_xyz" redirect="/e/demo" org="org_tenant_123" signedOut={false} />
    )
    await waitFor(() => expect(mockSignInSetActive).toHaveBeenCalledTimes(1))
    expect(mockSignInSetActive).toHaveBeenCalledWith({
      session: "session_abc",
      organization: "org_tenant_123",
      redirectUrl: "/e/demo",
    })
  })

  it("signs out an already-signed-in user and reloads before creating the ticket session", async () => {
    g.__clerkState.isSignedIn = true
    render(<DevSwitchClient token="ticket_xyz" redirect="/e/demo" org={null} signedOut={false} />)
    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1))
    expect(mockSignOut).toHaveBeenCalledTimes(1)
    expect(mockSignOut).toHaveBeenCalledWith({
      sessionId: "sess_current",
      redirectUrl: "/dev-switch?token=ticket_xyz&redirect=%2Fe%2Fdemo&signed_out=1",
    })
    expect(signInCreate).not.toHaveBeenCalled()
  })

  it("continues switching when the signed-out redirect reuses the mounted page", async () => {
    g.__clerkState.isSignedIn = true
    const view = render(<DevSwitchClient token="ticket_xyz" redirect="/e/demo" org={null} signedOut={false} />)
    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1))
    g.__clerkState.isSignedIn = false
    view.rerender(<DevSwitchClient token="ticket_xyz" redirect="/e/demo" org={null} signedOut={true} />)
    await waitFor(() => expect(signInCreate).toHaveBeenCalledTimes(1))
    expect(mockSignInSetActive).toHaveBeenCalledWith({ session: "session_abc", organization: null, redirectUrl: "/e/demo" })
  })

  it("clears the organization when switching to a no-org persona", async () => {
    g.__clerkState.isSignedIn = true
    render(<DevSwitchClient token="ticket_xyz" redirect="/e/demo" org={null} signedOut={false} />)
    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1))
    expect(mockSetActive).toHaveBeenCalledTimes(1)
    expect(mockSetActive).toHaveBeenNthCalledWith(1, {
      organization: null,
    })
    expect(mockSignInSetActive).not.toHaveBeenCalled()
  })

  it("continues ticket sign-in after the signed-out redirect", async () => {
    g.__clerkState.isSignedIn = true
    render(<DevSwitchClient token="ticket_xyz" redirect="/e/demo" org={null} signedOut={true} />)
    await waitFor(() => expect(signInCreate).toHaveBeenCalled())
    expect(mockSignOut).not.toHaveBeenCalled()
    expect(mockSignInSetActive).toHaveBeenCalledWith({
      session: "session_abc",
      organization: null,
      redirectUrl: "/e/demo",
    })
  })

  it("reloads the handoff when the old session is already gone", async () => {
    g.__clerkState.isSignedIn = true
    mockSignOut.mockImplementation(() => Promise.reject({ status: 404 }))
    render(<DevSwitchClient token="ticket_xyz" redirect="/e/demo" org={null} signedOut={false} />)
    await waitFor(() =>
      expect(replaceCalls).toEqual([
        "/dev-switch?token=ticket_xyz&redirect=%2Fe%2Fdemo&signed_out=1",
      ])
    )
    expect(signInCreate).not.toHaveBeenCalled()
    expect(mockSignInSetActive).not.toHaveBeenCalled()
  })

  it("retries no-org session activation after a stale Clerk error", async () => {
    mockSignInSetActive
      .mockImplementationOnce(() =>
      Promise.reject({
        status: 404,
        errors: [{
          code: "organization_not_found_or_unauthorized",
          long_message: "Given organization not found, or you don't have permission to access the organization",
        }],
      })
    ).mockImplementation(() => Promise.resolve())

    render(<DevSwitchClient token="ticket_xyz" redirect="/e/demo" org={null} signedOut={false} />)
    await waitFor(() => expect(mockSignInSetActive).toHaveBeenCalledTimes(2))
    expect(mockSignInSetActive).toHaveBeenNthCalledWith(1, {
      session: "session_abc",
      organization: null,
      redirectUrl: "/e/demo",
    })
    expect(mockSignInSetActive).toHaveBeenNthCalledWith(2, {
      session: "session_abc",
      organization: null,
      redirectUrl: "/e/demo",
    })
  })

  it("reloads the handoff when Clerk returns a stale-session 403 code", async () => {
    g.__clerkState.isSignedIn = true
    mockSignOut.mockImplementation(() => Promise.reject({
      status: 403,
      errors: [{ code: "session_not_found", message: "not found or unauthorized" }],
    }))
    render(<DevSwitchClient token="ticket_xyz" redirect="/e/demo" org={null} signedOut={false} />)
    await waitFor(() =>
      expect(replaceCalls).toEqual([
        "/dev-switch?token=ticket_xyz&redirect=%2Fe%2Fdemo&signed_out=1",
      ])
    )
    expect(signInCreate).not.toHaveBeenCalled()
    expect(mockSignInSetActive).not.toHaveBeenCalled()
  })

  it("does not hide a missing requested organization", async () => {
    mockSignInSetActive.mockImplementationOnce(() =>
      Promise.reject({
        status: 403,
        errors: [{
          code: "organization_not_found_or_unauthorized",
          long_message: "Given organization not found, or you don't have permission to access the organization",
        }],
      })
    )
    render(
      <DevSwitchClient token="ticket_xyz" redirect="/e/demo" org="org_missing" signedOut={false} />
    )
    await waitFor(() => {
      expect(screen.getByText("Sign-in failed")).toBeDefined()
    })
    expect(mockSignInSetActive).toHaveBeenCalledTimes(1)
    expect(replaceCalls).toEqual([])
  })

  it("shows an error for non-stale Clerk 403 failures", async () => {
    g.__clerkState.isSignedIn = true
    mockSignOut.mockImplementation(() => Promise.reject({
      status: 403,
      errors: [{ message: "missing permission" }],
    }))
    render(<DevSwitchClient token="ticket_xyz" redirect="/e/demo" org={null} signedOut={false} />)
    await waitFor(() => {
      expect(screen.getByText("Sign-in failed")).toBeDefined()
    })
    expect(signInCreate).not.toHaveBeenCalled()
    expect(replaceCalls).toEqual([])
  })

  it("shows an error for unknown failures that only say not found", async () => {
    g.__clerkState.isSignedIn = true
    mockSignOut.mockImplementation(() => Promise.reject(new Error("not found")))
    render(<DevSwitchClient token="ticket_xyz" redirect="/e/demo" org={null} signedOut={false} />)
    await waitFor(() => {
      expect(screen.getByText("not found")).toBeDefined()
    })
    expect(signInCreate).not.toHaveBeenCalled()
    expect(replaceCalls).toEqual([])
  })

  it("does not sign out when user is not signed in", async () => {
    render(<DevSwitchClient token="ticket_xyz" redirect="/e/demo" org={null} signedOut={false} />)
    await waitFor(() => expect(signInCreate).toHaveBeenCalled())
    expect(mockSignOut).not.toHaveBeenCalled()
  })

  it("shows an error message when sign-in returns a non-complete status", async () => {
    signInCreateImpl = () => Promise.resolve({ status: "needs_first_factor" })
    render(<DevSwitchClient token="ticket_xyz" redirect="/e/demo" org={null} signedOut={false} />)
    await waitFor(() => {
      expect(screen.getByText(/Unexpected sign-in status/)).toBeDefined()
    })
    expect(replaceCalls).toEqual([])
  })

  it("shows an error message when Clerk completes without a session", async () => {
    signInCreateImpl = () => Promise.resolve({ status: "complete", createdSessionId: null })
    render(<DevSwitchClient token="ticket_xyz" redirect="/e/demo" org={null} signedOut={false} />)
    await waitFor(() => {
      expect(screen.getByText("No session was created.")).toBeDefined()
    })
    expect(mockSetActive).not.toHaveBeenCalled()
    expect(replaceCalls).toEqual([])
  })

  it("shows an error message when sign-in throws", async () => {
    signInCreateImpl = () => Promise.reject(new Error("Ticket expired"))
    render(<DevSwitchClient token="ticket_xyz" redirect="/e/demo" org={null} signedOut={false} />)
    await waitFor(() => {
      expect(screen.getByText("Ticket expired")).toBeDefined()
    })
    expect(mockSignInSetActive).not.toHaveBeenCalled()
  })

  it("waits for Clerk to load before attempting sign-in", async () => {
    g.__clerkState.signInLoaded = false
    render(<DevSwitchClient token="ticket_xyz" redirect="/e/demo" org={null} signedOut={false} />)
    expect(signInCreate).not.toHaveBeenCalled()
  })
})
