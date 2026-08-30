import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { JudgeInviteAcceptClient } from "@/app/(public)/judge-invite/[token]/judge-invite-accept-client"

const originalFetch = globalThis.fetch
const navigation = globalThis as typeof globalThis & {
  __nextNavState: { router: { replace: ReturnType<typeof mock> } }
}

const invitation = {
  hackathonName: "Test Hackathon",
  hackathonSlug: "test-hackathon",
  email: "judge@example.com",
  status: "pending",
  expiresAt: "2026-09-06T12:00:00.000Z",
  expiresLabel: "Sunday, September 6, 2026 at 12:00 PM UTC",
  eventSchedule: "Sunday, September 6, 2026 at 8:30 AM UTC",
}

beforeEach(() => {
  navigation.__nextNavState.router.replace.mockClear()
  sessionStorage.clear()
  globalThis.fetch = mock(() => Promise.resolve(
    new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  )) as unknown as typeof fetch
})

afterEach(() => {
  cleanup()
  globalThis.fetch = originalFetch
})

describe("judge invitation acceptance", () => {
  it("shows the event time and invitation email before acceptance", () => {
    render(
      <JudgeInviteAcceptClient
        token="invite-token"
        invitation={invitation}
        isAuthenticated={false}
      />,
    )

    expect(screen.getByText(invitation.eventSchedule)).toBeDefined()
    expect(screen.getByText(invitation.email)).toBeDefined()
    expect(screen.getByText(invitation.expiresLabel)).toBeDefined()
  })

  it("opens the judging workspace immediately after acceptance", async () => {
    render(
      <JudgeInviteAcceptClient
        token="invite-token"
        invitation={invitation}
        isAuthenticated
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Accept & Become Judge" }))

    await waitFor(() => {
      expect(navigation.__nextNavState.router.replace).toHaveBeenCalledWith(
        "/e/test-hackathon/judge",
      )
    })
    expect(screen.getByRole("link", { name: "Open Judging" }).getAttribute("href"))
      .toBe("/e/test-hackathon/judge")
  })

  it("keeps the invitation token through sign in and sign up", () => {
    render(
      <JudgeInviteAcceptClient
        token="invite-token"
        invitation={invitation}
        isAuthenticated={false}
      />,
    )

    expect(screen.getByRole("link", { name: "Sign In to Accept" }).getAttribute("href"))
      .toContain(encodeURIComponent("/judge-invite/invite-token?accept=true"))
    expect(screen.getByRole("link", { name: "Create Account" }).getAttribute("href"))
      .toContain(encodeURIComponent("/judge-invite/invite-token?accept=true"))
    fireEvent.click(screen.getByRole("link", { name: "Sign In to Accept" }))
    expect(sessionStorage.getItem("judge-invite-auto-accept:invite-token")).toBe("1")
  })

  it("accepts after sign in without asking for another click", async () => {
    sessionStorage.setItem("judge-invite-auto-accept:invite-token", "1")
    render(
      <JudgeInviteAcceptClient
        token="invite-token"
        invitation={invitation}
        isAuthenticated
        autoAccept
      />,
    )

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledTimes(1)
      expect(navigation.__nextNavState.router.replace).toHaveBeenCalledWith(
        "/e/test-hackathon/judge",
      )
    })
  })

  it("does not accept from a crafted query without an earlier button click", async () => {
    render(
      <JudgeInviteAcceptClient
        token="invite-token"
        invitation={invitation}
        isAuthenticated
        autoAccept
      />,
    )

    await waitFor(() => expect(globalThis.fetch).not.toHaveBeenCalled())
    expect(screen.getByRole("button", { name: "Accept & Become Judge" })).toBeDefined()
  })

  it("still asks for terms after sign in", () => {
    sessionStorage.setItem("judge-invite-auto-accept:invite-token", "1")
    render(
      <JudgeInviteAcceptClient
        token="invite-token"
        invitation={{
          ...invitation,
          requireTermsAcceptance: true,
          termsContent: "Be kind.",
          termsHash: "terms-hash",
        }}
        isAuthenticated
        autoAccept
      />,
    )

    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(
      screen.getByRole("button", { name: "Accept & Become Judge" }).hasAttribute("disabled"),
    ).toBe(true)
  })

  it("opens judging directly when the invitation was already accepted", () => {
    render(
      <JudgeInviteAcceptClient
        token="invite-token"
        invitation={{ ...invitation, status: "accepted" }}
        isAuthenticated
      />,
    )

    expect(screen.getByRole("link", { name: "Open Judging" }).getAttribute("href"))
      .toBe("/e/test-hackathon/judge")
  })
})
