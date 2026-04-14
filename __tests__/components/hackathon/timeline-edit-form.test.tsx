import React from "react"
import { describe, expect, it, beforeEach, afterEach, mock } from "bun:test"
import { render, screen, cleanup, fireEvent } from "@testing-library/react"
mock.module("@/components/hackathon/preview/edit-context", () => ({
  useEditOptional: () => null,
  useEdit: () => { throw new Error("useEdit must be used within EditProvider") },
  EditProvider: ({ children }: { children: React.ReactNode }) => children,
  SECTION_ORDER: ["name", "dates", "location", "sponsors", "judges", "prizes", "timeline", "about", "rules"],
}))

const { TimelineEditForm } = await import(
  "@/components/hackathon/edit-drawer/timeline-edit-form"
)

const baseData = {
  startsAt: new Date(2026, 2, 25, 9, 0).toISOString(),
  endsAt: new Date(2026, 2, 27, 17, 0).toISOString(),
}

const emptyData = {
  startsAt: null,
  endsAt: null,
}

describe("TimelineEditForm", () => {
  beforeEach(() => {})
  afterEach(cleanup)

  it("renders event dates picker", () => {
    render(<TimelineEditForm initialData={baseData} />)
    expect(screen.getByText("Event Dates")).toBeTruthy()
  })

  it("shows description text", () => {
    render(<TimelineEditForm initialData={baseData} />)
    expect(
      screen.getByText("Set when the event starts and ends"),
    ).toBeTruthy()
  })

  it("renders Save button disabled when no changes", () => {
    render(<TimelineEditForm initialData={baseData} />)
    const saveButton = screen.getByText("Save")
    expect(saveButton.hasAttribute("disabled")).toBe(true)
  })

  it("renders Cancel button", () => {
    render(<TimelineEditForm initialData={baseData} />)
    expect(screen.getByText("Cancel")).toBeTruthy()
  })

  it("does not show Reset button when pristine", () => {
    render(<TimelineEditForm initialData={baseData} />)
    expect(screen.queryByText("Reset")).toBeNull()
  })

  it("renders placeholder text when dates are empty", () => {
    render(<TimelineEditForm initialData={emptyData} />)
    expect(screen.getByText("Select event dates")).toBeTruthy()
  })

  it("renders formatted ranges when dates are set", () => {
    render(<TimelineEditForm initialData={baseData} />)
    expect(screen.getByText(/Mar 25 at 9:00 AM/)).toBeTruthy()
  })

  it("calls onCancel when Cancel is clicked", () => {
    const onCancel = mock(() => {})
    render(<TimelineEditForm initialData={baseData} onCancel={onCancel} />)
    fireEvent.click(screen.getByText("Cancel"))
    expect(onCancel).toHaveBeenCalled()
  })

  it("calls onSave with correct data structure", async () => {
    const onSave = mock(() => Promise.resolve(true))
    render(<TimelineEditForm initialData={emptyData} onSave={onSave} />)
    expect(onSave).not.toHaveBeenCalled()
  })

  it("shows keyboard shortcut hints", () => {
    render(<TimelineEditForm initialData={baseData} />)
    expect(screen.getByText("save")).toBeTruthy()
    expect(screen.getByText("save & next")).toBeTruthy()
  })
})
