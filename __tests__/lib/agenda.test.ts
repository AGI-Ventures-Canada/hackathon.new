import { describe, it, expect } from "bun:test"
import { anchorAgendaTimestamp, composeAgendaDescription } from "@/lib/utils/agenda"

describe("anchorAgendaTimestamp", () => {
  const eventStart = "2026-05-14T08:30:00-04:00"

  it("returns null for null input", () => {
    expect(anchorAgendaTimestamp(null, eventStart)).toBeNull()
    expect(anchorAgendaTimestamp(undefined, eventStart)).toBeNull()
  })

  it("returns the original ISO when no event anchor is provided", () => {
    expect(anchorAgendaTimestamp("2026-05-14T09:00:00-04:00", null)).toBe(
      "2026-05-14T09:00:00-04:00"
    )
  })

  it("leaves items already within 30 days of the event alone", () => {
    const item = "2026-05-15T09:00:00-04:00"
    expect(anchorAgendaTimestamp(item, eventStart)).toBe(item)
  })

  it("re-anchors 1970-01-01 fallback dates to the event date, preserving time and offset", () => {
    expect(anchorAgendaTimestamp("1970-01-01T08:30:00-04:00", eventStart)).toBe(
      "2026-05-14T08:30:00-04:00"
    )
  })

  it("re-anchors 2026-01-01 fallback dates to the event date when far enough off", () => {
    expect(anchorAgendaTimestamp("2026-01-01T09:00:00-04:00", eventStart)).toBe(
      "2026-05-14T09:00:00-04:00"
    )
  })

  it("borrows the event's offset when the item has no offset and is within window", () => {
    expect(anchorAgendaTimestamp("2026-05-14T09:00:00", eventStart)).toBe(
      "2026-05-14T09:00:00-04:00"
    )
  })

  it("uses the event's offset during re-anchor when the item has no offset", () => {
    expect(anchorAgendaTimestamp("1970-01-01T09:00:00", eventStart)).toBe(
      "2026-05-14T09:00:00-04:00"
    )
  })

  it("preserves the item's offset over the event's during re-anchor", () => {
    expect(anchorAgendaTimestamp("1970-01-01T09:00:00+09:00", eventStart)).toBe(
      "2026-05-14T09:00:00+09:00"
    )
  })

  it("returns the original when the item has no parseable time and is far off", () => {
    expect(anchorAgendaTimestamp("not-a-date", eventStart)).toBe("not-a-date")
  })

  it("handles Z (UTC) suffix as a valid offset", () => {
    expect(anchorAgendaTimestamp("2026-05-14T13:00:00Z", eventStart)).toBe(
      "2026-05-14T13:00:00Z"
    )
  })

  it("re-anchors when item is 1970 even if event has no offset", () => {
    expect(anchorAgendaTimestamp("1970-01-01T09:00:00", "2026-05-14T08:30:00")).toBe(
      "2026-05-14T09:00:00"
    )
  })
})

describe("composeAgendaDescription", () => {
  it("returns null when both speakers and description are empty", () => {
    expect(composeAgendaDescription([], null)).toBeNull()
    expect(composeAgendaDescription(undefined, undefined)).toBeNull()
    expect(composeAgendaDescription([], "")).toBeNull()
  })

  it("returns trimmed description when there are no speakers", () => {
    expect(composeAgendaDescription([], "  Hello  ")).toBe("Hello")
  })

  it("returns just the speakers line when description is empty", () => {
    expect(composeAgendaDescription(["Jane Smith"], null)).toBe("Speakers: Jane Smith")
  })

  it("joins multiple speakers with commas", () => {
    expect(composeAgendaDescription(["Jane", "John", "Alex"], null)).toBe(
      "Speakers: Jane, John, Alex"
    )
  })

  it("filters out empty/whitespace speaker entries", () => {
    expect(composeAgendaDescription(["Jane", "  ", "", "John"], null)).toBe(
      "Speakers: Jane, John"
    )
  })

  it("combines speakers and description with a blank line between", () => {
    expect(composeAgendaDescription(["Jane"], "A talk on AI")).toBe(
      "Speakers: Jane\n\nA talk on AI"
    )
  })

  it("trims whitespace around the description", () => {
    expect(composeAgendaDescription(["Jane"], "   talk   ")).toBe(
      "Speakers: Jane\n\ntalk"
    )
  })
})
