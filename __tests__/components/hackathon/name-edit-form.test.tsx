import { describe, expect, it, mock, afterEach } from "bun:test"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { NameEditForm } from "@/components/hackathon/edit-drawer/name-edit-form"

afterEach(() => cleanup())

describe("NameEditForm", () => {
  it("stays open when the draft rejects a save", async () => {
    const onSave = mock(() => Promise.resolve(false))
    const onCancel = mock(() => {})
    render(
      <NameEditForm
        initialName="Original event"
        onSave={onSave}
        onCancel={onCancel}
      />,
    )

    fireEvent.change(screen.getByLabelText("Hackathon Name"), {
      target: { value: "Changed event" },
    })
    fireEvent.click(screen.getByText("Save & exit"))

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onCancel).not.toHaveBeenCalled()
    expect(screen.getByLabelText("Hackathon Name")).toBeDefined()
  })
})
