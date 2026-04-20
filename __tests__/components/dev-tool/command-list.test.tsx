import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test"
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react"
import { UserCircle2, Rocket } from "lucide-react"

const { CommandPaletteList } = await import("@/components/dev-tool/commands/command-list")
import type { DevCommand } from "@/components/dev-tool/commands/registry"

function makeCommand(overrides: Partial<DevCommand> & Pick<DevCommand, "id" | "category">): DevCommand {
  return {
    title: overrides.title ?? `Cmd ${overrides.id}`,
    subtitle: overrides.subtitle,
    icon: overrides.icon ?? UserCircle2,
    run: overrides.run ?? mock(() => {}),
    ...overrides,
  }
}

const commands: DevCommand[] = [
  makeCommand({ id: "scn-1", category: "scenario", title: "Pre-registration" }),
  makeCommand({ id: "scn-2", category: "scenario", title: "Results ready" }),
  makeCommand({ id: "persona-1", category: "persona", title: "Switch to judge" }),
  makeCommand({ id: "lifecycle-1", category: "lifecycle", title: "Go live", icon: Rocket }),
]

beforeEach(() => {
  // no-op: component is self-contained
})

afterEach(() => {
  cleanup()
})

describe("CommandPaletteList", () => {
  describe("view mode toggle", () => {
    it("defaults to list view and shows all category groups", () => {
      render(<CommandPaletteList commands={commands} runningId={null} />)
      expect(screen.getByText("Jump to state")).toBeDefined()
      expect(screen.getByText("Switch persona")).toBeDefined()
      expect(screen.getByText("Change status / phase / timeline")).toBeDefined()
      expect(screen.queryByRole("button", { pressed: true, name: "Tab view" })).toBeNull()
    })

    it("switches to tab view when the tab-view toggle is clicked", async () => {
      render(<CommandPaletteList commands={commands} runningId={null} />)
      fireEvent.click(screen.getByRole("button", { name: "Tab view" }))
      await waitFor(() => {
        const tabToggle = screen.getByRole("button", { name: "Tab view" })
        expect(tabToggle.getAttribute("aria-pressed")).toBe("true")
      })
    })

    it("switches back to list view when the list-view toggle is clicked", async () => {
      render(<CommandPaletteList commands={commands} runningId={null} />)
      fireEvent.click(screen.getByRole("button", { name: "Tab view" }))
      fireEvent.click(screen.getByRole("button", { name: "List view" }))
      await waitFor(() => {
        const listToggle = screen.getByRole("button", { name: "List view" })
        expect(listToggle.getAttribute("aria-pressed")).toBe("true")
      })
    })
  })

  describe("tab view", () => {
    it("renders a tab button for each non-empty category with a count", async () => {
      render(<CommandPaletteList commands={commands} runningId={null} />)
      fireEvent.click(screen.getByRole("button", { name: "Tab view" }))
      await waitFor(() => {
        const scenarioTab = screen.getByRole("button", { name: /Jump to state/ })
        expect(scenarioTab).toBeDefined()
        expect(within(scenarioTab).getByText("2")).toBeDefined()
      })
    })

    it("does not render a tab for categories with zero commands", async () => {
      render(<CommandPaletteList commands={commands} runningId={null} />)
      fireEvent.click(screen.getByRole("button", { name: "Tab view" }))
      await waitFor(() => screen.getByRole("button", { name: /Jump to state/ }))
      expect(screen.queryByRole("button", { name: /Seed data/ })).toBeNull()
      expect(screen.queryByRole("button", { name: /Settings/ })).toBeNull()
    })

    it("defaults the active tab to the first available category", async () => {
      render(<CommandPaletteList commands={commands} runningId={null} />)
      fireEvent.click(screen.getByRole("button", { name: "Tab view" }))
      await waitFor(() => {
        expect(screen.getByText("Pre-registration")).toBeDefined()
        expect(screen.getByText("Results ready")).toBeDefined()
        expect(screen.queryByText("Switch to judge")).toBeNull()
        expect(screen.queryByText("Go live")).toBeNull()
      })
    })

    it("shows only the active category's commands when a different tab is clicked", async () => {
      render(<CommandPaletteList commands={commands} runningId={null} />)
      fireEvent.click(screen.getByRole("button", { name: "Tab view" }))
      await waitFor(() => screen.getByRole("button", { name: /Switch persona/ }))
      fireEvent.click(screen.getByRole("button", { name: /Switch persona/ }))
      await waitFor(() => {
        expect(screen.getByText("Switch to judge")).toBeDefined()
        expect(screen.queryByText("Pre-registration")).toBeNull()
        expect(screen.queryByText("Go live")).toBeNull()
      })
    })

    it("marks the active category tab with aria-pressed", async () => {
      render(<CommandPaletteList commands={commands} runningId={null} />)
      fireEvent.click(screen.getByRole("button", { name: "Tab view" }))
      await waitFor(() => screen.getByRole("button", { name: /Switch persona/ }))
      fireEvent.click(screen.getByRole("button", { name: /Switch persona/ }))
      await waitFor(() => {
        const personaTab = screen.getByRole("button", { name: /Switch persona/ })
        expect(personaTab.getAttribute("aria-pressed")).toBe("true")
      })
      const scenarioTab = screen.getByRole("button", { name: /Jump to state/ })
      expect(scenarioTab.getAttribute("aria-pressed")).toBe("false")
    })

    it("hides the category tabs and falls back to list rendering while searching", async () => {
      render(<CommandPaletteList commands={commands} runningId={null} />)
      fireEvent.click(screen.getByRole("button", { name: "Tab view" }))
      await waitFor(() => screen.getByRole("button", { name: /Jump to state/ }))
      fireEvent.change(screen.getByPlaceholderText("Search commands, scenarios, settings..."), {
        target: { value: "live" },
      })
      await waitFor(() => {
        expect(screen.queryByRole("button", { name: /Jump to state/ })).toBeNull()
      })
    })
  })
})
