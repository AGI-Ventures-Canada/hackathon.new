import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { resetComponentMocks, setPathname } from "@/__tests__/lib/component-mocks"
import { JudgingNavigation } from "@/components/hackathon/judging/judging-navigation"

beforeEach(() => { cleanup(); resetComponentMocks() })
afterEach(cleanup)

describe("judging route tabs", () => {
  for (const [label, suffix] of [["Overview", ""], ["Judges", "/judges"], ["Settings", "/settings"], ["Results", "/results"]]) {
    it(`marks ${label} as the current page and labels the server content`, () => {
      setPathname(`/e/our-event/manage/judging${suffix}`)
      render(<JudgingNavigation slug="our-event"><h2>Server-rendered content</h2></JudgingNavigation>)
      const active = screen.getByRole("tab", { name: label, selected: true })
      expect(active.tagName).toBe("A")
      expect(active.getAttribute("href")).toBe(`/e/our-event/manage/judging${suffix}`)
      expect(active.getAttribute("aria-current")).toBe("page")
      expect(active.hasAttribute("data-active")).toBe(true)
      expect(screen.getAllByRole("tab")).toHaveLength(4)
      expect(screen.getByRole("tabpanel").getAttribute("id")).toBe(active.getAttribute("aria-controls"))
      expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe(active.id)
      expect(screen.getByRole("heading", { name: "Server-rendered content" })).toBeDefined()
      for (const tab of screen.getAllByRole("tab").filter((tab) => tab !== active)) {
        expect(tab.getAttribute("aria-current")).toBeNull()
        expect(tab.hasAttribute("data-active")).toBe(false)
        expect(tab.tagName).toBe("A")
      }
    })
  }

  it("updates the selected tab on route changes and retains selection on nested pages", () => {
    setPathname("/e/our-event/manage/judging")
    const navigation = render(<JudgingNavigation slug="our-event">Overview content</JudgingNavigation>)
    setPathname("/e/our-event/manage/judging/settings/rounds")
    navigation.rerender(<JudgingNavigation slug="our-event">Round settings</JudgingNavigation>)
    expect(screen.getByRole("tab", { name: "Settings", selected: true }).getAttribute("aria-current")).toBe("page")
    expect(screen.getByRole("tab", { name: "Overview" }).getAttribute("aria-current")).toBeNull()
    expect(screen.getByRole("tabpanel").textContent).toBe("Round settings")
  })

  it("moves keyboard focus between tabs without navigating until a link is activated", async () => {
    setPathname("/e/our-event/manage/judging")
    render(<JudgingNavigation slug="our-event">Overview content</JudgingNavigation>)
    const overview = screen.getByRole("tab", { name: "Overview" })
    await act(async () => {
      overview.focus()
      fireEvent.keyDown(overview, { key: "ArrowRight" })
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Judges" }))
    expect(screen.getByRole("tab", { name: "Overview", selected: true })).toBeDefined()
    expect(screen.getByRole("tab", { name: "Judges" }).getAttribute("href")).toBe("/e/our-event/manage/judging/judges")
  })
})
