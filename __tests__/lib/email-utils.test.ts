import { describe, it, expect } from "bun:test"
import { formatTimeLeft } from "@/lib/email/utils"

describe("formatTimeLeft", () => {
  it("returns days for time more than 24 hours away", () => {
    const threedays = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
    const result = formatTimeLeft(threedays)
    expect(result).toMatch(/^\d+ days?$/)
  })

  it("returns hours for time less than 24 hours away", () => {
    const twelveHours = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString()
    const result = formatTimeLeft(twelveHours)
    expect(result).toMatch(/^\d+ hours?$/)
  })

  it("returns 1 hour for singular", () => {
    const oneHour = new Date(Date.now() + 90 * 60 * 1000).toISOString()
    const result = formatTimeLeft(oneHour)
    expect(result).toBe("1 hour")
  })

  it("returns 'less than an hour' for sub-hour future dates", () => {
    const thirtyMin = new Date(Date.now() + 30 * 60 * 1000).toISOString()
    const result = formatTimeLeft(thirtyMin)
    expect(result).toBe("less than an hour")
  })

  it("returns 'less than an hour' for expired dates", () => {
    const past = new Date(Date.now() - 1000).toISOString()
    const result = formatTimeLeft(past)
    expect(result).toBe("less than an hour")
  })

  it("returns 1 day for exactly 24 hours", () => {
    const oneDay = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const result = formatTimeLeft(oneDay)
    expect(result).toBe("1 day")
  })
})
