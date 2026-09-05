import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { resetComponentMocks } from "@/__tests__/lib/component-mocks"
import { JudgingTaskSheet } from "@/components/hackathon/judging/judging-setup-editors"
import type { JudgingSetup } from "@/lib/judging/setup"

const originalFetch = globalThis.fetch
const setup = {
  id: "event-1", slug: "our-event", name: "Our event", version: "v1", status: "active",
  settings: { timezone: "UTC", instructions: "", browseEnabled: false, remindersEnabled: true },
  prizes: [
    { id: "prize-1", name: "Best demo", judging_style: "gate_check", value: "Trophy" },
    { id: "prize-2", name: "Community choice", judging_style: "gate_check", value: "Gift" },
  ],
  coreCriteria: [], rooms: [], rounds: [],
  prizeCriteria: [
    { prizeId: "prize-1", criteria: [{ id: "question-1", name: "Works reliably?", description: null }] },
    { prizeId: "prize-2", criteria: [{ id: "question-2", name: "Helps the community?", description: null }] },
  ],
  readiness: { scoringLocked: false },
} as unknown as JudgingSetup

beforeEach(() => {
  cleanup()
  localStorage.clear()
  resetComponentMocks()
  globalThis.fetch = mock(() => Promise.resolve(Response.json({ setup }))) as typeof fetch
})
afterEach(() => { cleanup(); globalThis.fetch = originalFetch })

describe("judging Action Items task sheet", () => {
  it("opens the prize named by the issue and keeps full settings one click away", async () => {
    render(<JudgingTaskSheet hackathonId="event-1" editor="scorecard" prizeId="prize-1" onClose={() => {}} />)
    const edit = await screen.findByRole("button", { name: "Edit Best demo" })
    expect(screen.queryByRole("button", { name: "Edit Community choice" })).toBeNull()
    expect(screen.getByRole("link", { name: "Open judging settings" }).getAttribute("href")).toBe("/e/our-event/manage/judging/settings")
    fireEvent.click(edit)
    expect(screen.getByDisplayValue("Works reliably?")).toBeDefined()
    expect(screen.queryByDisplayValue("Helps the community?")).toBeNull()
  })

  it("drops the old prize editor while fetching a newly selected issue", async () => {
    const sheet = render(<JudgingTaskSheet hackathonId="event-1" editor="scorecard" prizeId="prize-1" onClose={() => {}} />)
    await screen.findByRole("button", { name: "Edit Best demo" })
    let finish!: (response: Response) => void
    globalThis.fetch = mock(() => new Promise<Response>((resolve) => { finish = resolve })) as typeof fetch
    sheet.rerender(<JudgingTaskSheet hackathonId="event-1" editor="scorecard" prizeId="prize-2" onClose={() => {}} />)
    expect(screen.queryByRole("button", { name: "Edit Best demo" })).toBeNull()
    finish(Response.json({ setup }))
    await waitFor(() => expect(screen.getByRole("button", { name: "Edit Community choice" })).toBeDefined())
    expect(screen.queryByRole("button", { name: "Edit Best demo" })).toBeNull()
  })
})
