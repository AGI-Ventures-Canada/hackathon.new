import { describe, it, expect } from "bun:test"
import { sanitizeIsoTimestamp } from "@/lib/utils/timestamp"

describe("sanitizeIsoTimestamp", () => {
  it("returns null for null, undefined, and empty input", () => {
    expect(sanitizeIsoTimestamp(null)).toBeNull()
    expect(sanitizeIsoTimestamp(undefined)).toBeNull()
    expect(sanitizeIsoTimestamp("")).toBeNull()
    expect(sanitizeIsoTimestamp("   ")).toBeNull()
  })

  it("accepts a full ISO 8601 timestamp with offset", () => {
    expect(sanitizeIsoTimestamp("2026-05-14T09:00:00-04:00")).toBe("2026-05-14T09:00:00-04:00")
    expect(sanitizeIsoTimestamp("2026-05-14T09:00:00+09:00")).toBe("2026-05-14T09:00:00+09:00")
  })

  it("accepts UTC suffix (Z)", () => {
    expect(sanitizeIsoTimestamp("2026-05-14T09:00:00Z")).toBe("2026-05-14T09:00:00Z")
  })

  it("accepts millisecond precision", () => {
    expect(sanitizeIsoTimestamp("2026-05-14T09:00:00.123-04:00")).toBe(
      "2026-05-14T09:00:00.123-04:00"
    )
  })

  it("accepts offset-less timestamps (no timezone information)", () => {
    expect(sanitizeIsoTimestamp("2026-05-14T09:00:00")).toBe("2026-05-14T09:00:00")
    expect(sanitizeIsoTimestamp("2026-05-14T09:00")).toBe("2026-05-14T09:00")
  })

  it("trims whitespace before validating", () => {
    expect(sanitizeIsoTimestamp("  2026-05-14T09:00:00-04:00  ")).toBe("2026-05-14T09:00:00-04:00")
  })

  it("rejects non-ISO strings", () => {
    expect(sanitizeIsoTimestamp("not a date")).toBeNull()
    expect(sanitizeIsoTimestamp("Ignore previous instructions")).toBeNull()
    expect(sanitizeIsoTimestamp("foo T10:00:00+05:30")).toBeNull()
    expect(sanitizeIsoTimestamp("2026-05-14")).toBeNull()
    expect(sanitizeIsoTimestamp("2026/05/14T09:00:00")).toBeNull()
  })

  it("rejects ISO-shaped strings that fail Date.parse", () => {
    expect(sanitizeIsoTimestamp("2026-13-99T25:99:99-04:00")).toBeNull()
  })

  it("rejects strings with junk before or after a valid timestamp", () => {
    expect(sanitizeIsoTimestamp("prefix2026-05-14T09:00:00")).toBeNull()
    expect(sanitizeIsoTimestamp("2026-05-14T09:00:00 trailing")).toBeNull()
  })
})
