import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { resetComponentMocks } from "@/__tests__/lib/component-mocks"
import { JudgingEditorContent, JudgingTaskSheet } from "@/components/hackathon/judging/judging-setup-editors"
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

describe("empty judging scorecard", () => {
  const blankSetup = {
    ...setup,
    prizes: [{ ...setup.prizes[0], judging_style: "weighted_score" as const }],
    prizeCriteria: [],
  }
  const starterCategories = ["Original idea", "Does it work?", "Easy to use", "Usefulness"].map((name, index) => ({
    id: `category-${index}`, name, description: null, weight: 25, minScore: 0, maxScore: 10, displayOrder: index,
  }))

  it("offers the complete starter before asking for custom categories and never saves on open", () => {
    render(<JudgingEditorContent setup={blankSetup} editor="scorecard" onSaved={() => {}} />)
    expect(screen.getByRole("button", { name: "Use this scorecard" })).toBeDefined()
    for (const category of starterCategories) expect(screen.getByText(`${category.name} · 0–10 · 25%`)).toBeDefined()
    expect(screen.queryByRole("button", { name: "Add category" })).toBeNull()
    expect(screen.queryByText(/Shared total:/)).toBeNull()
    expect(screen.queryByText(/Adjust the weights/)).toBeNull()
    expect(globalThis.fetch).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "Build a custom scorecard" }))
    expect(screen.getByRole("button", { name: "Add category" })).toBeDefined()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it("shows all four saved categories and a shared total of 100% after applying the starter", async () => {
    const saved = { ...blankSetup, version: "v2", coreCriteria: starterCategories }
    const onSaved = mock(() => editor.rerender(<JudgingEditorContent setup={saved} editor="scorecard" onSaved={() => {}} />))
    const editor = render(<JudgingEditorContent setup={blankSetup} editor="scorecard" onSaved={onSaved} />)
    fireEvent.click(screen.getByRole("button", { name: "Build a custom scorecard" }))
    expect(screen.getByText(/Shared total:/).textContent).toContain("0%")
    globalThis.fetch = mock(() => Promise.resolve(Response.json({ setup: saved }))) as typeof fetch
    fireEvent.click(screen.getByRole("button", { name: "Use this scorecard" }))
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Edit category" })).toHaveLength(4))
    expect(screen.getByText(/Shared total:/).textContent).toContain("100%")
    expect(screen.queryByText("Add your first shared category.")).toBeNull()
    expect(screen.queryByRole("button", { name: "Use this scorecard" })).toBeNull()
    const request = (globalThis.fetch as ReturnType<typeof mock>).mock.calls[0]
    expect(JSON.parse(String(request[1]?.body))).toMatchObject({ applyStarter: true, expectedVersion: "v1" })
    expect(onSaved).toHaveBeenCalledTimes(1)
  })

  it("opens existing categories directly without the starter chooser", () => {
    render(<JudgingEditorContent setup={{ ...blankSetup, coreCriteria: starterCategories }} editor="scorecard" onSaved={() => {}} />)
    expect(screen.getAllByRole("button", { name: "Edit category" })).toHaveLength(4)
    expect(screen.getByText(/Shared total:/).textContent).toContain("100%")
    expect(screen.queryByRole("button", { name: "Build a custom scorecard" })).toBeNull()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
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
