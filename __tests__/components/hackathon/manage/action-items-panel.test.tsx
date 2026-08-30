import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

const setPanelOpen = mock(() => {})
let panelOpen = false

mock.module("@/hooks/use-is-client", () => ({
  useIsClient: () => true,
}))
mock.module("@/components/hackathon/manage/action-items-context", () => ({
  useActionItems: () => ({
    activeItems: [],
    completedItems: [],
    addCustomItem: mock(() => {}),
    remainingCount: 0,
    panelOpen,
    setPanelOpen,
    isStale: false,
    actionItemsError: null,
    totalCount: 0,
  }),
}))
mock.module("@/components/hackathon/manage/add-item-input", () => ({
  AddItemInput: () => <button type="button">Add a task</button>,
}))
mock.module("@/components/hackathon/manage/action-item-row", () => ({
  ActionItemRow: () => null,
}))

const { ActionItemsPanel } = await import(
  "@/components/hackathon/manage/action-items-panel"
)
const { ActionItemsTab } = await import(
  "@/components/hackathon/manage/action-items-tab"
)

beforeEach(() => {
  panelOpen = false
  setPanelOpen.mockClear()
})

afterEach(cleanup)

describe("ActionItemsPanel", () => {
  it("keeps the closed drawer out of the focus order", () => {
    render(<ActionItemsPanel visible />)

    const toggle = screen.getByRole("button", { name: "Open action items" })
    const panel = document.getElementById("action-items-panel")!
    expect(toggle.getAttribute("aria-expanded")).toBe("false")
    expect(panel.getAttribute("aria-hidden")).toBe("true")
    expect(panel.hasAttribute("inert")).toBe(true)

    fireEvent.click(toggle)
    expect(setPanelOpen).toHaveBeenCalledWith(true)
  })

  it("names the close control and exposes the open drawer", () => {
    panelOpen = true
    render(<ActionItemsPanel visible />)

    expect(screen.getByRole("button", { name: "Close action items" }).getAttribute("aria-expanded")).toBe("true")
    const panel = document.getElementById("action-items-panel")!
    expect(panel.getAttribute("aria-hidden")).toBe("false")
    expect(panel.hasAttribute("inert")).toBe(false)
  })

  it("keeps add task available when the panel is empty", () => {
    panelOpen = true
    render(<ActionItemsPanel visible />)

    expect(screen.getAllByRole("button", { name: "Add a task" }).length).toBeGreaterThan(0)
  })

  it("keeps add task available when the full tab is empty", () => {
    render(<ActionItemsTab />)

    expect(screen.getByRole("button", { name: "Add a task" })).toBeDefined()
  })
})
