import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { resetComponentMocks, setRouter } from "../../lib/component-mocks"
import { InviteAcceptClient } from "@/app/(public)/invite/[token]/invite-accept-client"

const originalFetch = globalThis.fetch
const push = mock(() => {})
const refresh = mock(() => {})
const invitation = { teamName: "Team One", hackathonName: "Build Day", hackathonSlug: "build-day", hackathonStatus: "active", email: "test@example.com", status: "pending", expiresAt: "2099-01-01T00:00:00Z" }

beforeEach(() => {
  resetComponentMocks()
  push.mockClear()
  refresh.mockClear()
  setRouter({ push, refresh })
  globalThis.fetch = mock(() => Promise.resolve(Response.json({ success: true }))) as unknown as typeof fetch
})
afterEach(() => { cleanup(); globalThis.fetch = originalFetch })

describe("team invite journey", () => {
  it.each(["expired", "accepted", "declined", "cancelled"])("keeps the event reachable after %s", (status) => {
    render(<InviteAcceptClient token="test-token" invitation={{ ...invitation, status }} isAuthenticated />)
    fireEvent.click(screen.getByRole("button", { name: "View event" }))
    expect(push).toHaveBeenCalledWith("/e/build-day")
  })
  it("opens the event immediately after joining", async () => {
    render(<InviteAcceptClient token="test-token" invitation={invitation} isAuthenticated />)
    fireEvent.click(screen.getByRole("button", { name: "Accept & Join Team" }))
    await waitFor(() => expect(push).toHaveBeenCalledWith("/e/build-day"))
    expect(refresh).toHaveBeenCalledTimes(1)
  })
  it("preserves the invite through sign in and lets visitors view the event", () => {
    render(<InviteAcceptClient token="test-token" invitation={invitation} isAuthenticated={false} />)
    expect(screen.getByRole("link", { name: "Sign In to Accept" }).getAttribute("href")).toContain(encodeURIComponent("/invite/test-token"))
    expect(screen.getByRole("link", { name: "Create Account" }).getAttribute("href")).toContain(encodeURIComponent("/invite/test-token"))
    expect(screen.getByRole("link", { name: "View event" }).getAttribute("href")).toBe("/e/build-day")
  })
  it("keeps a failed join on the invitation page", async () => {
    globalThis.fetch = mock(() => Promise.resolve(Response.json({ error: "Team is full" }, { status: 409 }))) as unknown as typeof fetch
    render(<InviteAcceptClient token="test-token" invitation={invitation} isAuthenticated />)
    fireEvent.click(screen.getByRole("button", { name: "Accept & Join Team" }))
    await screen.findByText("Team is full")
    expect(push).not.toHaveBeenCalled()
  })
})
