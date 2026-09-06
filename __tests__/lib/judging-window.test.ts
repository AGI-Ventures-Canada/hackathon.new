import { describe, expect, it } from "bun:test"
import { canWriteJudgingWindow, getJudgeNotificationDisposition, resolveJudgingWindow, validateJudgingSchedule } from "@/lib/utils/judging-window"

describe("separate judging window", () => {
  const event = { judging_opens_at: "2026-09-08T12:00:00Z", judging_closes_at: "2026-09-09T12:00:00Z" }
  it("opens at the scheduled instant and closes at the deadline", () => {
    expect(canWriteJudgingWindow(event, null, new Date("2026-09-08T11:59:59Z"))).toBe(false)
    expect(canWriteJudgingWindow(event, null, new Date("2026-09-08T12:00:00Z"))).toBe(true)
    expect(canWriteJudgingWindow(event, null, new Date("2026-09-09T12:00:00Z"))).toBe(false)
  })
  it("inherits event dates unless the entire round window is overridden", () => {
    expect(resolveJudgingWindow(event, {}).inherited).toBe(true)
    expect(resolveJudgingWindow(event, { opens_at: "2026-09-10T12:00:00Z", closes_at: "2026-09-11T12:00:00Z" }, new Date("2026-09-10T14:00:00Z"))).toMatchObject({ inherited: false, state: "open" })
    expect(resolveJudgingWindow(event, { opens_at: "2026-09-10T12:00:00Z" }).state).toBe("invalid")
  })
  it("keeps legacy manual judging available without inventing a past cutoff", () => {
    expect(canWriteJudgingWindow({})).toBe(true)
    expect(getJudgeNotificationDisposition({ status: "judging", ends_at: "2000-01-01T00:00:00Z" })).toBe("send")
  })
  it("suppresses completed events and queues private test events", () => {
    expect(getJudgeNotificationDisposition({ status: "completed" })).toBe("reject")
    expect(getJudgeNotificationDisposition({ status: "active", is_test_event: true })).toBe("queue")
    expect(getJudgeNotificationDisposition({ status: "draft" })).toBe("queue")
  })
  it("validates both dates and a real IANA zone", () => {
    expect(validateJudgingSchedule({ opensAt: event.judging_opens_at, closesAt: event.judging_closes_at, timezone: "America/Toronto" })).toBeNull()
    expect(validateJudgingSchedule({ opensAt: event.judging_opens_at, closesAt: null })).not.toBeNull()
    expect(validateJudgingSchedule({ opensAt: null, closesAt: null, timezone: "Invalid/Place" })).not.toBeNull()
  })
})
