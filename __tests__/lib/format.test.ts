import { describe, expect, it } from "bun:test"
import { formatDate, formatDateTime, formatDateRange, sortByStartDate } from "@/lib/utils/format"

describe("formatDate", () => {
  it("formats string date to YYYY-MM-DD", () => {
    expect(formatDate("2026-03-15T12:30:00Z")).toBe("2026-03-15")
  })

  it("formats Date object to YYYY-MM-DD", () => {
    const date = new Date("2026-03-15T12:30:00Z")
    expect(formatDate(date)).toBe("2026-03-15")
  })
})

describe("formatDateTime", () => {
  it("formats string to YYYY-MM-DD HH:MM:SS", () => {
    expect(formatDateTime("2026-03-15T12:30:45Z")).toBe("2026-03-15 12:30:45")
  })

  it("formats Date object to YYYY-MM-DD HH:MM:SS", () => {
    const date = new Date("2026-03-15T12:30:45Z")
    expect(formatDateTime(date)).toBe("2026-03-15 12:30:45")
  })
})

describe("formatDateRange", () => {
  it("returns 'Dates TBD' when startsAt is null", () => {
    expect(formatDateRange(null, null)).toBe("Dates TBD")
    expect(formatDateRange(null, "2026-03-15T00:00:00Z")).toBe("Dates TBD")
  })

  it("formats single date when endsAt is null", () => {
    const result = formatDateRange("2026-03-15T00:00:00Z", null)
    expect(result).toContain("Mar")
    expect(result).toContain("15")
    expect(result).toContain("2026")
  })

  it("formats single-day range (same start and end date) without a dash", () => {
    const result = formatDateRange("2026-05-14T09:00:00Z", "2026-05-14T19:00:00Z")
    expect(result).toContain("May")
    expect(result).toContain("14")
    expect(result).toContain("2026")
    expect(result).not.toContain("–")
    expect(result.match(/14/g)?.length).toBe(1)
  })

  it("formats same-month range with compact format", () => {
    const result = formatDateRange("2026-03-10T00:00:00Z", "2026-03-15T00:00:00Z")
    expect(result).toContain("Mar")
    expect(result).toContain("10")
    expect(result).toContain("15")
    expect(result).toContain("2026")
    expect(result.match(/Mar/g)?.length).toBe(1)
  })

  it("formats cross-month range with full format", () => {
    const result = formatDateRange("2026-03-28T00:00:00Z", "2026-04-02T00:00:00Z")
    expect(result).toContain("Mar")
    expect(result).toContain("Apr")
    expect(result).toContain("28")
    expect(result).toContain("2")
  })

  it("formats cross-year range with full format", () => {
    const result = formatDateRange("2025-12-28T00:00:00Z", "2026-01-02T00:00:00Z")
    expect(result).toContain("Dec")
    expect(result).toContain("Jan")
    expect(result).toContain("2025")
    expect(result).toContain("2026")
  })

  it("uses en-dash separator", () => {
    const result = formatDateRange("2026-03-10T00:00:00Z", "2026-03-15T00:00:00Z")
    expect(result).toContain("–")
  })

  it("uses an explicit time zone for hydration-safe date boundaries", () => {
    expect(
      formatDateRange(
        "2026-10-25T00:30:00Z",
        "2026-10-27T00:30:00Z",
        "UTC",
      ),
    ).toBe("Oct 25 – 27, 2026")
  })
})

describe("sortByStartDate", () => {
  it("sorts items by start date ascending by default", () => {
    const items = [
      { starts_at: "2026-03-15T00:00:00Z" },
      { starts_at: "2026-01-01T00:00:00Z" },
      { starts_at: "2026-02-10T00:00:00Z" },
    ]
    const sorted = sortByStartDate(items)
    expect(sorted[0].starts_at).toBe("2026-01-01T00:00:00Z")
    expect(sorted[1].starts_at).toBe("2026-02-10T00:00:00Z")
    expect(sorted[2].starts_at).toBe("2026-03-15T00:00:00Z")
  })

  it("sorts items by start date descending when specified", () => {
    const items = [
      { starts_at: "2026-01-01T00:00:00Z" },
      { starts_at: "2026-03-15T00:00:00Z" },
    ]
    const sorted = sortByStartDate(items, true)
    expect(sorted[0].starts_at).toBe("2026-03-15T00:00:00Z")
    expect(sorted[1].starts_at).toBe("2026-01-01T00:00:00Z")
  })

  it("places null dates at the end", () => {
    const items = [
      { starts_at: null },
      { starts_at: "2026-01-01T00:00:00Z" },
      { starts_at: null },
    ]
    const sorted = sortByStartDate(items)
    expect(sorted[0].starts_at).toBe("2026-01-01T00:00:00Z")
    expect(sorted[1].starts_at).toBeNull()
    expect(sorted[2].starts_at).toBeNull()
  })

  it("does not mutate the original array", () => {
    const items = [
      { starts_at: "2026-03-15T00:00:00Z" },
      { starts_at: "2026-01-01T00:00:00Z" },
    ]
    const original = [...items]
    sortByStartDate(items)
    expect(items[0].starts_at).toBe(original[0].starts_at)
    expect(items[1].starts_at).toBe(original[1].starts_at)
  })
})
