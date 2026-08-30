import { afterEach, describe, expect, it, mock } from "bun:test"
import { cleanup, render, screen, fireEvent } from "@testing-library/react"

const { AddItemInput } = await import("@/components/hackathon/manage/add-item-input")

afterEach(() => {
  cleanup()
})

describe("AddItemInput", () => {
  it("shows add button in collapsed state", () => {
    render(<AddItemInput onAdd={() => {}} />)
    expect(screen.getByText("Add item")).toBeDefined()
  })

  it("expands to input on click", () => {
    render(<AddItemInput onAdd={() => {}} />)
    fireEvent.click(screen.getByText("Add item"))
    expect(screen.getByPlaceholderText("What needs to be done?")).toBeDefined()
  })

  it("calls onAdd with trimmed value on Enter", () => {
    const onAdd = mock(() => {})
    render(<AddItemInput onAdd={onAdd} />)
    fireEvent.click(screen.getByText("Add item"))

    const input = screen.getByPlaceholderText("What needs to be done?")
    fireEvent.change(input, { target: { value: "  Fix the bug  " } })
    fireEvent.keyDown(input, { key: "Enter" })

    expect(onAdd).toHaveBeenCalledTimes(1)
    expect(onAdd.mock.calls[0][0]).toBe("Fix the bug")
  })

  it("does not call onAdd for empty string", () => {
    const onAdd = mock(() => {})
    render(<AddItemInput onAdd={onAdd} />)
    fireEvent.click(screen.getByText("Add item"))

    const input = screen.getByPlaceholderText("What needs to be done?")
    fireEvent.keyDown(input, { key: "Enter" })

    expect(onAdd).not.toHaveBeenCalled()
  })

  it("does not call onAdd for whitespace-only string", () => {
    const onAdd = mock(() => {})
    render(<AddItemInput onAdd={onAdd} />)
    fireEvent.click(screen.getByText("Add item"))

    const input = screen.getByPlaceholderText("What needs to be done?")
    fireEvent.change(input, { target: { value: "   " } })
    fireEvent.keyDown(input, { key: "Enter" })

    expect(onAdd).not.toHaveBeenCalled()
  })

  it("passes default severity 'info' to onAdd", () => {
    const onAdd = mock(() => {})
    render(<AddItemInput onAdd={onAdd} />)
    fireEvent.click(screen.getByText("Add item"))

    const input = screen.getByPlaceholderText("What needs to be done?")
    fireEvent.change(input, { target: { value: "Test item" } })
    fireEvent.keyDown(input, { key: "Enter" })

    expect(onAdd.mock.calls[0][1]).toBe("info")
  })

  it("adds a task for later with the shared scheduled priority", () => {
    const onAdd = mock(() => {})
    render(<AddItemInput onAdd={onAdd} />)
    fireEvent.click(screen.getByText("Add item"))
    fireEvent.click(screen.getByRole("button", { name: "Later" }))

    const input = screen.getByPlaceholderText("What needs to be done?")
    fireEvent.change(input, { target: { value: "Book the room" } })
    fireEvent.click(screen.getByRole("button", { name: "Add" }))

    expect(onAdd).toHaveBeenCalledWith("Book the room", "scheduled")
  })

  it("closes on Escape", () => {
    render(<AddItemInput onAdd={() => {}} />)
    fireEvent.click(screen.getByText("Add item"))

    const input = screen.getByPlaceholderText("What needs to be done?")
    fireEvent.keyDown(input, { key: "Escape" })

    expect(screen.getByText("Add item")).toBeDefined()
  })

  it("uses compact placeholder in compact mode", () => {
    render(<AddItemInput onAdd={() => {}} compact />)
    fireEvent.click(screen.getByText("Add item"))
    expect(screen.getByPlaceholderText("Add item...")).toBeDefined()
  })
})
