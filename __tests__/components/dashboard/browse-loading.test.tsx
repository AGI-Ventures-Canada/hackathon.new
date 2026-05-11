import { describe, it, expect, afterEach } from "bun:test"
import { render, screen, cleanup } from "@testing-library/react"
import BrowseLoading from "@/app/(dashboard)/browse/loading"

afterEach(() => {
  cleanup()
})

describe("BrowseLoading", () => {
  it("renders the Explore page header with skeleton content", () => {
    const { container } = render(<BrowseLoading />)

    expect(screen.getByText("Browse Hackathons")).toBeDefined()
    expect(screen.getByText("Discover and join published hackathons")).toBeDefined()
    expect(screen.getByLabelText("Loading")).toBeDefined()
    expect(container.querySelectorAll("[data-slot='skeleton']").length).toBeGreaterThan(15)
  })
})
