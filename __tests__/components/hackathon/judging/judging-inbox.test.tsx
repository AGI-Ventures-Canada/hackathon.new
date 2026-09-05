import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { getRouter, resetComponentMocks } from "../../../lib/component-mocks"
import { JudgingInbox } from "@/components/hackathon/judging/judging-inbox"

const originalFetch = globalThis.fetch
const preferences = { email_enabled: true, in_app_enabled: true, daily_digest: false, quiet_start: 20, quiet_end: 8, timezone: null }
const inbox = { preferences, unreadCount: 1, items: [{ id: "notice", title: "Your projects are ready", body: "You have 2 reviews left.", action_path: "/e/build/judge", read_at: null, resolved_at: null }] }
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } })
let mutation: (url: string, init: RequestInit) => Promise<Response>
const fetchMock = mock((url: string | URL | Request, init?: RequestInit) => init?.method ? mutation(String(url), init) : Promise.resolve(json(inbox)))

describe("judging inbox controls", () => {
  beforeEach(() => {
    resetComponentMocks()
    fetchMock.mockClear()
    mutation = async () => json(preferences)
    globalThis.fetch = fetchMock as unknown as typeof fetch
  })
  afterEach(() => { cleanup(); globalThis.fetch = originalFetch })

  it("loads helpful defaults and links straight to the assigned work", async () => {
    render(<JudgingInbox hackathonId="event" />)
    await screen.findByText("Your projects are ready")
    expect(screen.getByRole("switch", { name: "Email me when I need to act" }).getAttribute("aria-checked")).toBe("true")
    expect(screen.getByRole("switch", { name: "Send daily reminders about my unfinished reviews" }).getAttribute("aria-checked")).toBe("false")
    expect(screen.getByRole("link", { name: "Open judging" }).getAttribute("href")).toBe("/e/build/judge")
    expect(screen.getByText(/Final-hour reminders can arrive during quiet hours/)).toBeDefined()
  })

  it("hides updates before saving a preference and restores them when saving fails", async () => {
    let finish!: (response: Response) => void
    mutation = () => new Promise((resolve) => { finish = resolve })
    render(<JudgingInbox hackathonId="event" />)
    await screen.findByText("Your projects are ready")
    fireEvent.click(screen.getByRole("switch", { name: "Show updates here" }))
    expect(screen.queryByText("Your projects are ready")).toBeNull()
    expect(screen.getByText("You've turned off updates here.")).toBeDefined()
    await act(async () => finish(json({ error: "Could not save reminder settings." }, 500)))
    await screen.findByText("Your projects are ready")
    expect(screen.getByRole("alert").textContent).toContain("Could not save reminder settings.")
    expect(fetchMock.mock.calls.some(([url, init]) => String(url).endsWith("/notification-preferences") && init?.body === '{"in_app_enabled":false}')).toBe(true)
  })

  it("marks an update read immediately and refreshes after the write succeeds", async () => {
    let finish!: (response: Response) => void
    mutation = () => new Promise((resolve) => { finish = resolve })
    render(<JudgingInbox hackathonId="event" />)
    fireEvent.click(await screen.findByRole("button", { name: "Mark read" }))
    expect(screen.queryByRole("button", { name: "Mark read" })).toBeNull()
    await act(async () => finish(new Response(null, { status: 204 })))
    await waitFor(() => expect(getRouter().refresh).toHaveBeenCalledTimes(1))
    expect(fetchMock.mock.calls.some(([url, init]) => String(url).endsWith("/notifications/notice/read") && init?.method === "POST")).toBe(true)
  })

  it("restores an unread update after a failed read request", async () => {
    mutation = async () => json({ error: "Could not mark this update as read." }, 500)
    render(<JudgingInbox hackathonId="event" />)
    fireEvent.click(await screen.findByRole("button", { name: "Mark read" }))
    await screen.findByRole("button", { name: "Mark read" })
    expect(screen.getByRole("alert").textContent).toContain("Could not mark this update as read.")
  })
})
