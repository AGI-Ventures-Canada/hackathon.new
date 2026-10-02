import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { resetComponentMocks } from "@/__tests__/lib/component-mocks"
import { JudgingInviteComposer } from "@/components/hackathon/judging/judging-invite-composer"
import type { JudgeBatchResult } from "@/lib/services/judging-invite-batch"

const originalFetch = globalThis.fetch
const prizes = [{ id: "prize-1", name: "Best demo" }]
const rooms = [{ id: "room-1", name: "Main stage" }, { id: "room-2", name: "Workshop" }]
type BatchRequest = { emails: string[]; preview: boolean; retryFailed: boolean; message: string; prizeIds: string[]; roomIds: string[]; requestKey: string }
let requests: BatchRequest[] = []

function respond(results: JudgeBatchResult[]) {
  return new Response(JSON.stringify({ results }), { status: 200 })
}

function renderComposer(onSaved = () => {}) {
  return render(<JudgingInviteComposer hackathonId="event-1" prizes={prizes} rooms={rooms} onSaved={onSaved} />)
}

beforeEach(() => {
  cleanup()
  localStorage.clear()
  resetComponentMocks()
  requests = []
  globalThis.fetch = mock((_url, init) => {
    const body = JSON.parse(String(init?.body)) as BatchRequest
    requests.push(body)
    return Promise.resolve(respond(body.emails.map((email) => ({ email, outcome: body.preview ? "ready" : "invited", message: body.preview ? "Ready to invite." : "Invitation saved.", ...(!body.preview ? { delivery: "sent" as const } : {}) }))))
  }) as typeof fetch
})

afterEach(() => {
  cleanup()
  globalThis.fetch = originalFetch
})

describe("judging invitation composer", () => {
  it("shows duplicate entries and previews each address once before sending", async () => {
    const saved = mock(() => {})
    renderComposer(saved)
    fireEvent.change(screen.getByRole("textbox", { name: "Who's judging?" }), { target: { value: "Alex@example.com, alex@example.com\nSAM@example.com; sam@example.com" } })
    expect(screen.getByRole("status").textContent).toContain("alex@example.com (2 times)")
    expect(screen.getByRole("status").textContent).toContain("sam@example.com (2 times)")
    expect(requests).toHaveLength(0)
    fireEvent.click(screen.getByRole("button", { name: "Preview invitations" }))
    await screen.findByRole("button", { name: "Send invitations" })
    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({ emails: ["alex@example.com", "sam@example.com"], preview: true })
    expect(saved).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Send invitations" }))
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1))
    expect(requests[1]).toMatchObject({ emails: ["alex@example.com", "sam@example.com"], preview: false })
  })

  it("keeps successful outcomes visible and retries only a failed delivery", async () => {
    const saved = mock(() => {})
    globalThis.fetch = mock((_url, init) => {
      const body = JSON.parse(String(init?.body)) as BatchRequest
      requests.push(body)
      return Promise.resolve(respond(body.emails.map((email) => body.preview
        ? { email, outcome: "ready", message: "Ready to invite." }
        : { email, outcome: "invited", delivery: email === "sam@example.com" && !body.retryFailed ? "failed" : "sent", message: "This delivery needs a retry." })))
    }) as typeof fetch
    renderComposer(saved)
    fireEvent.change(screen.getByRole("textbox", { name: "Who's judging?" }), { target: { value: "alex@example.com, sam@example.com" } })
    fireEvent.click(screen.getByRole("checkbox", { name: "Main stage" }))
    fireEvent.click(screen.getByRole("button", { name: "Preview invitations" }))
    fireEvent.click(await screen.findByRole("button", { name: "Send invitations" }))
    const retry = await screen.findByRole("button", { name: "Retry failed invitations" })
    expect(screen.getByText("alex@example.com")).toBeDefined()
    expect(screen.getByText("This delivery needs a retry.")).toBeDefined()
    expect((screen.getByRole("textbox", { name: "Who's judging?" }) as HTMLTextAreaElement).value).toContain("sam@example.com")
    fireEvent.click(retry)
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(2))
    expect(requests[2]).toMatchObject({ emails: ["sam@example.com"], preview: false, retryFailed: true, roomIds: ["room-1"] })
    expect(requests[2].requestKey).not.toBe(requests[1].requestKey)
    expect(screen.getByText("alex@example.com")).toBeDefined()
    expect(screen.queryByRole("button", { name: "Retry failed invitations" })).toBeNull()
  })

  it("recovers room and prize choices with the message after changing setup steps", async () => {
    const first = renderComposer()
    fireEvent.change(screen.getByRole("textbox", { name: "Who's judging?" }), { target: { value: "alex@example.com" } })
    fireEvent.change(screen.getByRole("textbox", { name: "Personal message (optional)" }), { target: { value: "Thanks for helping our teams." } })
    fireEvent.click(screen.getByRole("checkbox", { name: "Main stage" }))
    fireEvent.click(screen.getByRole("checkbox", { name: "Best demo" }))
    first.unmount()
    renderComposer()
    expect(screen.getByRole("checkbox", { name: "Main stage" }).getAttribute("aria-checked")).toBe("true")
    expect(screen.getByRole("checkbox", { name: "Best demo" }).getAttribute("aria-checked")).toBe("true")
    expect((screen.getByRole("textbox", { name: "Personal message (optional)" }) as HTMLTextAreaElement).value).toBe("Thanks for helping our teams.")
    fireEvent.click(screen.getByRole("button", { name: "Preview invitations" }))
    await screen.findByRole("button", { name: "Send invitations" })
    expect(requests[0]).toMatchObject({ emails: ["alex@example.com"], roomIds: ["room-1"], prizeIds: ["prize-1"], message: "Thanks for helping our teams.", preview: true })
    fireEvent.click(screen.getByRole("checkbox", { name: "Workshop" }))
    expect(screen.queryByRole("button", { name: "Send invitations" })).toBeNull()
    expect(screen.getByRole("button", { name: "Preview invitations" })).toBeDefined()
  })

  it("retains invalid entries to fix and shows the server's queued outcome", async () => {
    globalThis.fetch = mock((_url, init) => {
      const body = JSON.parse(String(init?.body)) as BatchRequest
      requests.push(body)
      return Promise.resolve(respond([
        { email: "alex@example.com", outcome: body.preview ? "ready" : "added", ...(body.preview ? {} : { delivery: "queued" as const }), message: "Judge added. Their email is queued." },
        { email: "bad-email", outcome: "invalid", message: "Enter a valid email address." },
      ]))
    }) as typeof fetch
    renderComposer()
    fireEvent.change(screen.getByRole("textbox", { name: "Who's judging?" }), { target: { value: "alex@example.com, bad-email" } })
    fireEvent.click(screen.getByRole("button", { name: "Preview invitations" }))
    fireEvent.click(await screen.findByRole("button", { name: "Send invitations" }))
    await screen.findByRole("button", { name: "Preview invitations" })
    expect(screen.getByText("Judge added. Their email is queued.")).toBeDefined()
    expect((screen.getByRole("textbox", { name: "Who's judging?" }) as HTMLTextAreaElement).value).toContain("bad-email")
  })
})
