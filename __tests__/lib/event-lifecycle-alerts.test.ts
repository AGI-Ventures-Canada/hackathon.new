import { describe, expect, it } from "bun:test"
import {
  canPublishEventDates,
  getEventLifecycleAlerts,
} from "@/lib/utils/event-lifecycle-alerts"

const now = "2026-08-27T12:00:00.000Z"

describe("event lifecycle alerts", () => {
  it("blocks a draft event whose end date has passed", () => {
    expect(
      getEventLifecycleAlerts({
        storedStatus: "draft",
        startsAt: "2026-06-20T12:00:00.000Z",
        endsAt: "2026-06-21T12:00:00.000Z",
        now,
      }),
    ).toEqual([
      expect.objectContaining({ code: "draft_dates_ended", severity: "error" }),
    ])
    expect(
      canPublishEventDates({
        startsAt: "2026-06-20T12:00:00.000Z",
        endsAt: "2026-06-21T12:00:00.000Z",
        now,
      }),
    ).toBe(false)
  })

  it("warns when a draft event has started but has not ended", () => {
    expect(
      getEventLifecycleAlerts({
        storedStatus: "draft",
        startsAt: "2026-08-27T11:00:00.000Z",
        endsAt: "2026-08-28T12:00:00.000Z",
        now,
      })[0]?.code,
    ).toBe("draft_dates_started")
  })

  it("asks organizers to finish an event after its end time", () => {
    expect(
      getEventLifecycleAlerts({
        storedStatus: "published",
        startsAt: "2026-08-25T12:00:00.000Z",
        endsAt: "2026-08-26T12:00:00.000Z",
        now,
      })[0],
    ).toMatchObject({ code: "event_should_be_finished", action: "finish_event" })
  })

  it("detects signup dates in the wrong order", () => {
    expect(
      getEventLifecycleAlerts({
        storedStatus: "draft",
        startsAt: "2026-09-10T12:00:00.000Z",
        endsAt: "2026-09-11T12:00:00.000Z",
        registrationOpensAt: "2026-09-09T12:00:00.000Z",
        registrationClosesAt: "2026-09-08T12:00:00.000Z",
        now,
      }).map((alert) => alert.code),
    ).toContain("registration_dates_invalid")
  })

  it("warns organizers when location checks require manual signup", () => {
    expect(
      getEventLifecycleAlerts({
        storedStatus: "published",
        startsAt: "2026-09-10T12:00:00.000Z",
        endsAt: "2026-09-11T12:00:00.000Z",
        requireLocationVerification: true,
        now,
      })[0],
    ).toMatchObject({ code: "location_check_in_required", action: "update_location" })
  })

  it("allows a valid future event to publish", () => {
    expect(
      canPublishEventDates({
        startsAt: "2026-09-10T12:00:00.000Z",
        endsAt: "2026-09-11T12:00:00.000Z",
        now,
      }),
    ).toBe(true)
  })
})
