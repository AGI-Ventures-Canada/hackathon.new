import { describe, it, expect, mock, afterEach } from "bun:test"
import { render, screen, cleanup, fireEvent } from "@testing-library/react"

mock.module("@/components/ui/address-autocomplete", () => ({
  AddressAutocomplete: ({ value, onChange, placeholder, id }: {
    value: string
    onChange: (val: string) => void
    placeholder?: string
    id?: string
  }) => (
    <input
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  ),
}))

const { StepLocation } = await import("@/components/hackathon/create-flow/step-location")

afterEach(() => {
  cleanup()
})

describe("StepLocation", () => {
  it("renders the heading", () => {
    render(
      <StepLocation locationType={null} locationName={null} locationUrl={null} onChange={() => {}} />
    )
    expect(screen.getByText("Where will it take place?")).toBeDefined()
  })

  it("renders In-person and Virtual toggle buttons", () => {
    render(
      <StepLocation locationType={null} locationName={null} locationUrl={null} onChange={() => {}} />
    )
    expect(screen.getByText("In-person")).toBeDefined()
    expect(screen.getByText("Virtual")).toBeDefined()
  })

  it("announces the selected location type", () => {
    render(
      <StepLocation locationType="virtual" locationName={null} locationUrl="" onChange={() => {}} />
    )

    expect(screen.getByRole("group", { name: "Event location type" })).toBeDefined()
    expect(screen.getByRole("button", { name: "Virtual" }).getAttribute("aria-pressed")).toBe("true")
    expect(screen.getByRole("button", { name: "In-person" }).getAttribute("aria-pressed")).toBe("false")
  })

  it("calls onChange with in_person when In-person is clicked", () => {
    const onChange = mock(() => {})
    render(
      <StepLocation locationType={null} locationName={null} locationUrl={null} onChange={onChange} />
    )
    fireEvent.click(screen.getByText("In-person"))
    expect(onChange).toHaveBeenCalledWith({
      locationType: "in_person",
      locationName: null,
      locationUrl: null,
    })
  })

  it("calls onChange with virtual when Virtual is clicked", () => {
    const onChange = mock(() => {})
    render(
      <StepLocation locationType={null} locationName={null} locationUrl={null} onChange={onChange} />
    )
    fireEvent.click(screen.getByText("Virtual"))
    expect(onChange).toHaveBeenCalledWith({
      locationType: "virtual",
      locationName: null,
      locationUrl: null,
    })
  })

  it("shows venue input when in_person is selected", () => {
    render(
      <StepLocation locationType="in_person" locationName="" locationUrl={null} onChange={() => {}} />
    )
    expect(screen.getByText("Venue")).toBeDefined()
    expect(screen.getByPlaceholderText("Search for a venue...")).toBeDefined()
  })

  it("shows meeting link input when virtual is selected", () => {
    render(
      <StepLocation locationType="virtual" locationName={null} locationUrl="" onChange={() => {}} />
    )
    expect(screen.getByText("Meeting link")).toBeDefined()
    expect(screen.getByPlaceholderText("zoom.us/j/123456789")).toBeDefined()
  })

  it("hides venue/url inputs when no type is selected", () => {
    render(
      <StepLocation locationType={null} locationName={null} locationUrl={null} onChange={() => {}} />
    )
    expect(screen.queryByText("Venue")).toBeNull()
    expect(screen.queryByText("Meeting link")).toBeNull()
  })
})
