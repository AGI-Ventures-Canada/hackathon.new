import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { CopyButton } from "@/components/ui/copy-button"

const writeText = mock(async () => {})

beforeEach(() => {
  writeText.mockClear()
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  })
})

afterEach(cleanup)

describe("CopyButton", () => {
  it("names its icon-only state before and after copying", async () => {
    render(<CopyButton value="invite-link" size="icon" />)

    fireEvent.click(screen.getByRole("button", { name: "Copy" }))
    expect(writeText).toHaveBeenCalledWith("invite-link")
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Copied" })).toBeDefined()
    })
  })
})
