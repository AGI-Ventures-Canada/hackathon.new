import { beforeEach, describe, expect, it, mock } from "bun:test"
import {
  createChainableMock,
  resetSupabaseMocks,
  setMockFromImplementation,
} from "../lib/supabase-mock"

const mockScheduleReminders = mock(() => Promise.resolve(1))
mock.module("@/lib/services/smart-reminders", () => ({
  scheduleReminders: mockScheduleReminders,
  cancelRemindersForEntity: mock(() => Promise.resolve()),
  cancelUpcomingReminder: mock(() => Promise.resolve(0)),
  computeReminderSchedule: mock(() => []),
  processPendingReminders: mock(() =>
    Promise.resolve({ processed: 0, sent: 0, skipped: 0, errors: 0 })
  ),
}))

const { schedulePreEventReminders } = await import(
  "@/lib/services/pre-event-reminders"
)

describe("schedulePreEventReminders", () => {
  beforeEach(() => {
    resetSupabaseMocks()
    mockScheduleReminders.mockClear()
    mockScheduleReminders.mockResolvedValue(1)
  })

  it("does not schedule reminders for a draft event", async () => {
    setMockFromImplementation((table) => {
      if (table === "hackathons") {
        return createChainableMock({
          data: {
            id: "11111111-1111-1111-1111-111111111111",
            name: "Build Day",
            slug: "build-day",
            registration_closes_at: "2026-09-01T16:00:00.000Z",
            starts_at: "2026-09-02T16:00:00.000Z",
            ends_at: "2026-09-03T16:00:00.000Z",
            created_at: "2026-08-25T16:00:00.000Z",
            status: "draft",
          },
          error: null,
        })
      }
      return createChainableMock({ data: null, error: null })
    })

    expect(
      await schedulePreEventReminders(
        "11111111-1111-1111-1111-111111111111",
      ),
    ).toBe(0)
  })

  it("uses the custom project deadline instead of the event end", async () => {
    setMockFromImplementation((table) => {
      if (table === "hackathons") {
        return createChainableMock({
          data: {
            id: "11111111-1111-1111-1111-111111111111",
            name: "Build Day",
            slug: "build-day",
            registration_closes_at: null,
            starts_at: null,
            ends_at: "2027-09-03T17:00:00.000Z",
            created_at: "2026-08-25T16:00:00.000Z",
            status: "active",
          },
          error: null,
        })
      }
      if (table === "hackathon_schedule_items") {
        return createChainableMock({
          data: { starts_at: "2027-09-03T12:00:00.000Z" },
          error: null,
        })
      }
      return createChainableMock({ data: null, error: null })
    })

    expect(await schedulePreEventReminders(
      "11111111-1111-1111-1111-111111111111",
    )).toBe(1)
    expect(mockScheduleReminders).toHaveBeenCalledWith(
      "hackathon_event",
      "11111111-1111-1111-1111-111111111111",
      "11111111-1111-1111-1111-111111111111",
      "submission_due",
      expect.any(Date),
      new Date("2027-09-03T12:00:00.000Z"),
      expect.objectContaining({ deadlineDate: "2027-09-03T12:00:00.000Z" }),
    )
  })

  it("fails closed when the project deadline cannot be loaded", async () => {
    setMockFromImplementation((table) => table === "hackathons"
      ? createChainableMock({
          data: {
            id: "11111111-1111-1111-1111-111111111111",
            name: "Build Day",
            slug: "build-day",
            registration_closes_at: null,
            starts_at: null,
            ends_at: "2027-09-03T17:00:00.000Z",
            created_at: "2026-08-25T16:00:00.000Z",
            status: "active",
          },
          error: null,
        })
      : createChainableMock({ data: null, error: { message: "database unavailable" } }))

    await expect(schedulePreEventReminders(
      "11111111-1111-1111-1111-111111111111",
    )).rejects.toThrow("Failed to load the project deadline: database unavailable")
    expect(mockScheduleReminders).not.toHaveBeenCalled()
  })
})
