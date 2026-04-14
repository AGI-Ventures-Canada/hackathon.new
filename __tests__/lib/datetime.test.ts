import { describe, it, expect } from "bun:test"
import { toLocalDatetime, timeAgo } from "@/lib/utils/datetime"

describe("toLocalDatetime", () => {
  it("formats a date to datetime-local string", () => {
    const date = new Date(2026, 3, 15, 9, 30)
    expect(toLocalDatetime(date)).toBe("2026-04-15T09:30")
  })

  it("pads single-digit months and days", () => {
    const date = new Date(2026, 0, 5, 8, 5)
    expect(toLocalDatetime(date)).toBe("2026-01-05T08:05")
  })

  it("handles midnight", () => {
    const date = new Date(2026, 11, 31, 0, 0)
    expect(toLocalDatetime(date)).toBe("2026-12-31T00:00")
  })
})

describe("timeAgo", () => {
  it("returns minutes ago for recent past", () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString()
    expect(timeAgo(fiveMinAgo)).toBe("5m ago")
  })

  it("returns hours ago for past within 24h", () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 3_600_000).toISOString()
    expect(timeAgo(threeHoursAgo)).toBe("3h ago")
  })

  it("returns days ago for past beyond 24h", () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 3_600_000).toISOString()
    expect(timeAgo(twoDaysAgo)).toBe("2d ago")
  })

  it("returns 'in Xh' for future dates within 24h", () => {
    const inTwoHours = new Date(Date.now() + 2 * 3_600_000 + 5_000).toISOString()
    expect(timeAgo(inTwoHours)).toBe("in 2h")
  })

  it("returns 'in Xd' for future dates beyond 24h", () => {
    const inThreeDays = new Date(Date.now() + 3 * 24 * 3_600_000 + 5_000).toISOString()
    expect(timeAgo(inThreeDays)).toBe("in 3d")
  })

  it("returns 'in Xm' for near-future dates", () => {
    const inTenMin = new Date(Date.now() + 10 * 60_000 + 5_000).toISOString()
    expect(timeAgo(inTenMin)).toBe("in 10m")
  })

  it("returns 0m ago for just-now dates", () => {
    const justNow = new Date(Date.now() - 10_000).toISOString()
    expect(timeAgo(justNow)).toBe("0m ago")
  })
})
