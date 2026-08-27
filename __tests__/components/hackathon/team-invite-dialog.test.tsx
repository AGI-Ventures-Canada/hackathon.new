import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import {
  getRouter,
  resetComponentMocks,
  setRouter,
} from "../../lib/component-mocks"
import { PREPARE_TEAM_INVITE_EVENT } from "@/lib/webmcp/client-events"

const { TeamInviteDialog } = await import(
  "@/components/hackathon/team-invite-dialog"
)

const originalFetch = globalThis.fetch
const originalRequestAnimationFrame = globalThis.requestAnimationFrame
const originalCancelAnimationFrame = globalThis.cancelAnimationFrame
let fetchSpy: ReturnType<typeof mock>

function response(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  }))
}

function renderInvite() {
  return render(
    <TeamInviteDialog
      teamId="team-1"
      hackathonId="h1"
      teamName="Test Team"
      maxTeamSize={5}
    />,
  )
}

describe("TeamInviteDialog", () => {
  beforeEach(() => {
    cleanup()
    resetComponentMocks()
    setRouter({ refresh: mock(() => {}) })
    fetchSpy = mock(() => response({ queued: false }))
    globalThis.fetch = fetchSpy as unknown as typeof fetch
    globalThis.requestAnimationFrame = mock(() => 1)
    globalThis.cancelAnimationFrame = mock(() => {})
  })

  afterEach(() => {
    cleanup()
    globalThis.fetch = originalFetch
    globalThis.requestAnimationFrame = originalRequestAnimationFrame
    globalThis.cancelAnimationFrame = originalCancelAnimationFrame
  })

  it("renders the invite button", () => {
    renderInvite()
    expect(screen.getByText("Invite Member")).toBeDefined()
  })

  it("opens the existing human review with an agent-prepared email", async () => {
    renderInvite()
    const acknowledge = mock(() => {})

    act(() => {
      window.dispatchEvent(new CustomEvent(PREPARE_TEAM_INVITE_EVENT, {
        detail: { email: "friend@example.com", acknowledge },
      }))
    })

    const input = await screen.findByLabelText("Email Address") as HTMLInputElement
    expect(input.value).toBe("friend@example.com")
    expect(screen.getByText('Send an email invitation to join "Test Team".')).toBeDefined()
    expect(acknowledge).toHaveBeenCalledWith({ ok: true })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("reports a queued invitation honestly and closes on the human Enter action", async () => {
    fetchSpy.mockImplementation(() => response({
      queued: true,
      delivery: "queued",
      queueReason: "event_draft",
    }))
    renderInvite()
    fireEvent.click(screen.getByRole("button", { name: "Invite Member" }))
    fireEvent.change(screen.getByLabelText("Email Address"), {
      target: { value: "friend@example.com" },
    })

    fireEvent.click(screen.getByRole("button", { name: "Send Invitation" }))

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1)
      expect(screen.getAllByText("Invitation saved").length).toBeGreaterThan(0)
      expect(screen.getAllByText(/This event is still a draft.*We'll send it when you go live/).length)
        .toBeGreaterThan(0)
    })
    expect(screen.queryByText("Invitation sent")).toBeNull()
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("/api/dashboard/teams/team-1/invitations")
    expect(JSON.parse(init.body as string)).toEqual({
      hackathonId: "h1",
      email: "friend@example.com",
    })

    fireEvent.keyDown(window, { key: "Enter" })
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    expect(getRouter().refresh).toHaveBeenCalledTimes(1)
  })

  it("keeps failed delivery visible without claiming the email was sent", async () => {
    fetchSpy.mockImplementation(() => response({ delivery: "failed", queued: false }))
    renderInvite()
    fireEvent.click(screen.getByRole("button", { name: "Invite Member" }))
    fireEvent.change(screen.getByLabelText("Email Address"), {
      target: { value: "friend@example.com" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Send Invitation" }))

    await screen.findByText(
      "We couldn't confirm the email was sent. Use Send again in the invite list.",
    )
    expect(screen.getAllByText("Invitation saved").length).toBeGreaterThan(0)
    expect(screen.queryByText("Invitation sent")).toBeNull()
    expect(globalThis.requestAnimationFrame).not.toHaveBeenCalled()
    expect(getRouter().refresh).not.toHaveBeenCalled()
  })

  it("shows the API error and permits a corrected retry", async () => {
    fetchSpy
      .mockImplementationOnce(() => response({ error: "That team is full." }, 409))
      .mockImplementationOnce(() => response({ queued: false }))
    renderInvite()
    fireEvent.click(screen.getByRole("button", { name: "Invite Member" }))
    fireEvent.change(screen.getByLabelText("Email Address"), {
      target: { value: "friend@example.com" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Send Invitation" }))
    await screen.findByText("That team is full.")
    expect(screen.queryByText("Invitation sent")).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Send Invitation" }))
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2))
    expect(screen.getAllByText("Invitation sent").length).toBeGreaterThan(0)
  })
})
