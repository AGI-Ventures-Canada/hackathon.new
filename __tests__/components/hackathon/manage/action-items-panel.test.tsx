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
  }),
}))
mock.module("@/components/hackathon/manage/add-item-input", () => ({
  AddItemInput: () => null,
}))
mock.module("@/components/hackathon/manage/action-item-row", () => ({
  ActionItemRow: () => null,
}))

const { ActionItemsPanel } = await import(
  "@/components/hackathon/manage/action-items-panel"
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
})
