import { describe, expect, it } from "bun:test"
import { formatDateRange } from "@/emails/_components/event-detail-box"

describe("formatDateRange", () => {
  it("returns null when startsAt is null", () => {
    expect(formatDateRange(null, null)).toBeNull()
  })

  it("returns null when startsAt is undefined", () => {
    expect(formatDateRange(undefined, undefined)).toBeNull()
  })

  it("returns single date when endsAt is null", () => {
    const result = formatDateRange("2026-04-20T08:30:00Z", null)
    expect(result).toContain("Apr")
    expect(result).toContain("20")
    expect(result).toContain("2026")
  })

  it("formats single-day range (same UTC day) without a dash", () => {
    const result = formatDateRange("2026-05-14T09:00:00Z", "2026-05-14T19:00:00Z")
    expect(result).toContain("May")
    expect(result).toContain("14")
    expect(result).toContain("2026")
    expect(result).not.toContain("–")
  })

  it("formats same-month range as compact", () => {
    const result = formatDateRange("2026-04-20T08:30:00Z", "2026-04-22T17:00:00Z")
    expect(result).toContain("Apr")
    expect(result).toContain("20")
    expect(result).toContain("22")
    expect(result).toContain("2026")
    expect(result).toContain("\u2013")
  })

  it("formats same-year cross-month range", () => {
    const result = formatDateRange("2026-03-28T08:00:00Z", "2026-04-02T17:00:00Z")
    expect(result).toContain("Mar")
    expect(result).toContain("Apr")
    expect(result).toContain("2026")
  })

  it("formats cross-year range with both years", () => {
    const result = formatDateRange("2025-12-28T08:00:00Z", "2026-01-05T17:00:00Z")
    expect(result).toContain("2025")
    expect(result).toContain("2026")
  })
})
