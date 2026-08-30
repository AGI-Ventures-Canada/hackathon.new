import { afterEach, describe, expect, it, setSystemTime } from "bun:test"
import { getNotificationDisposition } from "@/lib/utils/notification-lifecycle"

describe("getNotificationDisposition", () => {
  afterEach(() => setSystemTime())

  it("queues draft work while the event can still go live", () => {
    setSystemTime(new Date("2025-12-31T12:00:00.000Z"))
    expect(getNotificationDisposition({
      status: "draft",
      starts_at: "2026-01-01T00:00:00.000Z",
      ends_at: "2026-01-02T00:00:00.000Z",
      is_test_event: false,
    })).toBe("queue")
  })

  it("rejects draft work after the event end instead of creating an impossible queue", () => {
    setSystemTime(new Date("2026-01-03T12:00:00.000Z"))
    expect(getNotificationDisposition({
      status: "draft",
      starts_at: "2026-01-01T00:00:00.000Z",
      ends_at: "2026-01-02T00:00:00.000Z",
      is_test_event: false,
    })).toBe("reject")
  })

  it.each(["published", "registration_open", "active", "judging"] as const)(
    "sends in the %s state before completion",
    (status) => {
      setSystemTime(new Date("2026-08-26T12:00:00.000Z"))
      expect(getNotificationDisposition({
        status,
        starts_at: "2026-08-20T00:00:00.000Z",
        ends_at: "2026-08-30T00:00:00.000Z",
        is_test_event: false,
      })).toBe("send")
    },
  )

  it("rejects a stale live status after the event end", () => {
    setSystemTime(new Date("2026-08-26T12:00:00.000Z"))
    expect(getNotificationDisposition({
      status: "active",
      starts_at: "2026-08-20T00:00:00.000Z",
      ends_at: "2026-08-25T00:00:00.000Z",
      is_test_event: false,
    })).toBe("reject")
  })

  it.each(["completed", "archived"] as const)("rejects %s events", (status) => {
    expect(getNotificationDisposition({
      status,
      starts_at: "2026-08-20T00:00:00.000Z",
      ends_at: null,
      is_test_event: false,
    })).toBe("reject")
  })

  it("keeps test-event messages queued at every live stage", () => {
    expect(getNotificationDisposition({
      status: "active",
      starts_at: "2026-08-20T00:00:00.000Z",
      ends_at: null,
      is_test_event: true,
    })).toBe("queue")
  })
})
