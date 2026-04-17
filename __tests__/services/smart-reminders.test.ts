import { describe, it, expect, beforeEach } from "bun:test"
import {
  createChainableMock,
  resetSupabaseMocks,
  setMockFromImplementation,
} from "../lib/supabase-mock"

const { computeReminderSchedule } = await import(
  "@/lib/services/smart-reminders"
)

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

function hoursFromNow(hours: number): Date {
  return new Date(Date.now() + hours * HOUR)
}

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * DAY)
}

describe("computeReminderSchedule", () => {
  describe("Tier 1: Short-notice (< 2 days)", () => {
    it("returns 2 reminders for a 24-hour window", () => {
      const created = new Date(Date.now() - 1 * HOUR)
      const deadline = hoursFromNow(23)
      const schedule = computeReminderSchedule(created, deadline)

      expect(schedule.length).toBe(2)
      expect(schedule[0].urgency).toBe("medium")
      expect(schedule[1].urgency).toBe("high")
    })

    it("returns reminders for a 12-hour window", () => {
      const created = new Date(Date.now() - 1 * HOUR)
      const deadline = hoursFromNow(11)
      const schedule = computeReminderSchedule(created, deadline)

      expect(schedule.length).toBeGreaterThanOrEqual(1)
      for (const entry of schedule) {
        expect(entry.scheduledFor.getTime()).toBeGreaterThan(Date.now())
        expect(entry.scheduledFor.getTime()).toBeLessThan(deadline.getTime())
      }
    })

    it("filters out past reminders for a nearly-expired window", () => {
      const created = new Date(Date.now() - 20 * HOUR)
      const deadline = hoursFromNow(3)
      const schedule = computeReminderSchedule(created, deadline)

      for (const entry of schedule) {
        expect(entry.scheduledFor.getTime()).toBeGreaterThan(Date.now())
      }
    })
  })

  describe("Tier 2: Typical invitations (2-7 days)", () => {
    it("returns 3 reminders for a 7-day window", () => {
      const created = new Date()
      const deadline = daysFromNow(7)
      const schedule = computeReminderSchedule(created, deadline)

      expect(schedule.length).toBe(3)
      expect(schedule[0].urgency).toBe("low")
      expect(schedule[1].urgency).toBe("medium")
      expect(schedule[2].urgency).toBe("high")
    })

    it("returns 3 reminders for a 3-day window", () => {
      const created = new Date()
      const deadline = daysFromNow(3)
      const schedule = computeReminderSchedule(created, deadline)

      expect(schedule.length).toBe(3)
    })

    it("schedules all reminders before the deadline", () => {
      const created = new Date()
      const deadline = daysFromNow(5)
      const schedule = computeReminderSchedule(created, deadline)

      for (const entry of schedule) {
        expect(entry.scheduledFor.getTime()).toBeLessThan(deadline.getTime())
      }
    })
  })

  describe("Tier 3: Pre-event deadlines (7-30 days)", () => {
    it("returns 3 reminders for a 14-day window", () => {
      const created = new Date()
      const deadline = daysFromNow(14)
      const schedule = computeReminderSchedule(created, deadline)

      expect(schedule.length).toBe(3)
      expect(schedule[0].urgency).toBe("low")
      expect(schedule[1].urgency).toBe("medium")
      expect(schedule[2].urgency).toBe("high")
    })

    it("places first reminder 1 week before deadline", () => {
      const created = new Date()
      const deadline = daysFromNow(20)
      const schedule = computeReminderSchedule(created, deadline)

      const weekBefore = deadline.getTime() - 7 * DAY
      expect(Math.abs(schedule[0].scheduledFor.getTime() - weekBefore)).toBeLessThan(HOUR)
    })
  })

  describe("Tier 4: Long-horizon events (30+ days)", () => {
    it("returns 4 reminders for a 60-day window", () => {
      const created = new Date()
      const deadline = daysFromNow(60)
      const schedule = computeReminderSchedule(created, deadline)

      expect(schedule.length).toBe(4)
      expect(schedule[0].urgency).toBe("low")
      expect(schedule[1].urgency).toBe("low")
      expect(schedule[2].urgency).toBe("medium")
      expect(schedule[3].urgency).toBe("high")
    })

    it("places first reminder 2 weeks before deadline", () => {
      const created = new Date()
      const deadline = daysFromNow(45)
      const schedule = computeReminderSchedule(created, deadline)

      const twoWeeksBefore = deadline.getTime() - 14 * DAY
      expect(Math.abs(schedule[0].scheduledFor.getTime() - twoWeeksBefore)).toBeLessThan(HOUR)
    })
  })

  describe("Edge cases", () => {
    it("returns empty array for deadline in the past", () => {
      const created = new Date(Date.now() - 10 * DAY)
      const deadline = new Date(Date.now() - 1 * DAY)
      const schedule = computeReminderSchedule(created, deadline)

      expect(schedule).toEqual([])
    })

    it("returns empty array for zero-length window", () => {
      const now = new Date()
      const schedule = computeReminderSchedule(now, now)

      expect(schedule).toEqual([])
    })

    it("returns empty array for negative window", () => {
      const created = daysFromNow(5)
      const deadline = new Date()
      const schedule = computeReminderSchedule(created, deadline)

      expect(schedule).toEqual([])
    })

    it("deduplicates reminders that are too close together (< 4 hours)", () => {
      const created = new Date(Date.now() - 1 * HOUR)
      const deadline = hoursFromNow(5)
      const schedule = computeReminderSchedule(created, deadline)

      for (let i = 1; i < schedule.length; i++) {
        const gap = schedule[i].scheduledFor.getTime() - schedule[i - 1].scheduledFor.getTime()
        expect(gap).toBeGreaterThanOrEqual(4 * HOUR)
      }
    })

    it("returns only future reminders", () => {
      const created = new Date(Date.now() - 6 * DAY)
      const deadline = daysFromNow(1)
      const schedule = computeReminderSchedule(created, deadline)

      for (const entry of schedule) {
        expect(entry.scheduledFor.getTime()).toBeGreaterThan(Date.now())
      }
    })

    it("returns sorted reminders", () => {
      const created = new Date()
      const deadline = daysFromNow(30)
      const schedule = computeReminderSchedule(created, deadline)

      for (let i = 1; i < schedule.length; i++) {
        expect(schedule[i].scheduledFor.getTime()).toBeGreaterThanOrEqual(
          schedule[i - 1].scheduledFor.getTime()
        )
      }
    })
  })
})

describe("scheduleReminders", () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  it("inserts computed reminders into database", async () => {
    const { scheduleReminders } = await import("@/lib/services/smart-reminders")

    let upsertedRows: unknown[] = []
    setMockFromImplementation((table) => {
      if (table === "scheduled_reminders") {
        const mock = createChainableMock({
          data: [{ id: "r1" }, { id: "r2" }, { id: "r3" }],
          error: null,
        })
        const origUpsert = mock.upsert
        mock.upsert = ((rows: unknown[]) => {
          upsertedRows = rows
          return origUpsert(rows)
        }) as typeof mock.upsert
        return mock
      }
      return createChainableMock({ data: null, error: null })
    })

    const created = new Date()
    const deadline = new Date(Date.now() + 7 * DAY)

    const count = await scheduleReminders(
      "team_invitation",
      "inv-123",
      "hack-456",
      "invitation_reminder",
      created,
      deadline,
      { email: "test@example.com" }
    )

    expect(count).toBe(3)
    expect(upsertedRows.length).toBe(3)
  })

  it("returns 0 when all reminders are in the past", async () => {
    const { scheduleReminders } = await import("@/lib/services/smart-reminders")

    const created = new Date(Date.now() - 10 * DAY)
    const deadline = new Date(Date.now() - 1 * DAY)

    const count = await scheduleReminders(
      "team_invitation",
      "inv-123",
      "hack-456",
      "invitation_reminder",
      created,
      deadline,
      {}
    )

    expect(count).toBe(0)
  })
})

describe("cancelRemindersForEntity", () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  it("cancels all pending reminders for an entity", async () => {
    const { cancelRemindersForEntity } = await import("@/lib/services/smart-reminders")

    setMockFromImplementation(() =>
      createChainableMock({
        data: [{ id: "r1" }, { id: "r2" }],
        error: null,
      })
    )

    const count = await cancelRemindersForEntity("team_invitation", "inv-123")
    expect(count).toBe(2)
  })

  it("returns 0 when no reminders found", async () => {
    const { cancelRemindersForEntity } = await import("@/lib/services/smart-reminders")

    setMockFromImplementation(() =>
      createChainableMock({ data: [], error: null })
    )

    const count = await cancelRemindersForEntity("team_invitation", "inv-999")
    expect(count).toBe(0)
  })
})

describe("cancelUpcomingReminder", () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  it("cancels reminders within the specified window", async () => {
    const { cancelUpcomingReminder } = await import("@/lib/services/smart-reminders")

    setMockFromImplementation(() =>
      createChainableMock({
        data: [{ id: "r1" }],
        error: null,
      })
    )

    const count = await cancelUpcomingReminder("team_invitation", "inv-123")
    expect(count).toBe(1)
  })
})
