import { describe, expect, it } from "bun:test"
import { formatEmailDeadline } from "@/lib/email/deadline"

describe("email deadlines", () => {
  it("includes an exact time and timezone independent of server settings", () => {
    expect(formatEmailDeadline("2026-09-11T16:30:00Z")).toContain("4:30 PM UTC")
  })
  it("supports a supplied recipient timezone", () => {
    expect(formatEmailDeadline("2026-09-11T16:30:00Z", "America/Toronto")).toContain("12:30 PM EDT")
  })
  it("falls back to UTC for an invalid timezone", () => {
    expect(formatEmailDeadline("2026-09-11T16:30:00Z", "Bad/Zone")).toContain("4:30 PM UTC")
  })
  it("gives a useful fallback for a missing date", () => {
    expect(formatEmailDeadline("invalid")).toBe("Check the event page for the latest time")
  })
})
