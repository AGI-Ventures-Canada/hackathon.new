import { describe, it, expect, afterEach } from "bun:test"
import { render, screen, cleanup } from "@testing-library/react"
import { DashboardGridLoading } from "@/components/dashboard/dashboard-grid-loading"

afterEach(() => {
  cleanup()
})

describe("DashboardGridLoading", () => {
  it("renders a dashboard grid skeleton", () => {
    const { container } = render(<DashboardGridLoading />)

    expect(screen.getByLabelText("Loading")).toBeDefined()
    expect(container.querySelectorAll("[data-slot='skeleton']").length).toBeGreaterThan(0)
  })

  it("can render search, progress, and pagination placeholders", () => {
    const { container } = render(
      <DashboardGridLoading
        statCards={0}
        cardCount={2}
        showSearch
        showProgress
        showPagination
      />,
    )

    expect(screen.getByLabelText("Loading")).toBeDefined()
    expect(container.querySelectorAll("[data-slot='skeleton']").length).toBeGreaterThan(14)
  })
})
