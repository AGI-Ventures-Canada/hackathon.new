import { describe, it, expect, beforeEach, mock } from "bun:test"
import {
  createChainableMock,
  resetSupabaseMocks,
  setMockFromImplementation,
} from "../lib/supabase-mock"

const mockWithDeliveryLease = mock(async (
  _key: string,
  work: () => Promise<unknown>,
) => ({ acquired: true as const, value: await work() }))
mock.module("@/lib/services/delivery-lease", () => ({
  withDeliveryLease: mockWithDeliveryLease,
}))

const {
  computeReminderSchedule,
  hasReminderDeliveryFailure,
  processPendingReminders,
  reminderDeliveryWasSent,
  validateReminderEntity,
  reconcileRemindersForEntity,
} = await import(
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

function daysAfter(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY)
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
      const created = new Date(Date.now() - HOUR)
      const deadline = daysAfter(created, 7)
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

    it("uses the supplied clock when filtering old reminder times", () => {
      const created = new Date("2026-08-01T12:00:00.000Z")
      const deadline = new Date("2026-08-08T12:00:00.000Z")
      const now = new Date("2026-08-07T13:00:00.000Z")

      const schedule = computeReminderSchedule(created, deadline, now)

      expect(schedule).toEqual([
        {
          scheduledFor: new Date("2026-08-08T09:00:00.000Z"),
          urgency: "high",
        },
      ])
    })
  })
})

describe("scheduleReminders", () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  it("inserts computed reminders into database", async () => {
    const { scheduleReminders } = await import("@/lib/services/smart-reminders")

    let upsertedRows: Array<Record<string, unknown>> = []
    let conflictTarget = ""
    setMockFromImplementation((table) => {
      if (table === "scheduled_reminders") {
        const mock = createChainableMock({
          data: [{ id: "r1" }, { id: "r2" }, { id: "r3" }],
          error: null,
        })
        mock.upsert = ((
          rows: Array<Record<string, unknown>>,
          options: { onConflict: string },
        ) => {
          upsertedRows = rows
          conflictTarget = options.onConflict
          return mock
        }) as typeof mock.upsert
        return mock
      }
      return createChainableMock({ data: null, error: null })
    })

    const created = new Date(Date.now() - HOUR)
    const deadline = daysAfter(created, 7)

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
    expect(conflictTarget).toBe(
      "entity_type,entity_id,reminder_type,scheduled_for",
    )
    expect(upsertedRows.every((row) => !("sent_at" in row))).toBe(true)
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

  it("surfaces reminder persistence failures", async () => {
    const { scheduleReminders } = await import("@/lib/services/smart-reminders")
    setMockFromImplementation(() =>
      createChainableMock({ data: null, error: { message: "database unavailable" } })
    )

    await expect(
      scheduleReminders(
        "team_invitation",
        "inv-123",
        "hack-456",
        "invitation_reminder",
        new Date(),
        daysFromNow(7),
        { email: "test@example.com" },
      ),
    ).rejects.toThrow("Failed to schedule reminders: database unavailable")
  })
})

describe("reconcileRemindersForEntity", () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  it("reactivates A after A to B to A, keeps sent rows, and allows two types at one time", async () => {
    const sameTime = "2026-09-10T12:00:00.000Z"
    const operations: string[] = []
    let upsertedRows: Array<Record<string, unknown>> = []
    let upsertOptions: { onConflict?: string } = {}
    let cancelledIds: string[] = []
    let call = 0

    setMockFromImplementation((table) => {
      if (table !== "scheduled_reminders") {
        return createChainableMock({ data: null, error: null })
      }
      call++
      if (call === 1) {
        return createChainableMock({
          data: [
            {
              id: "old-a",
              reminder_type: "event_starting",
              scheduled_for: sameTime,
            sent_at: null,
            cancelled_at: "2026-09-01T12:00:00.000Z",
            fail_count: 3,
            last_error: "old failure",
            },
            {
              id: "old-b",
              reminder_type: "event_starting",
              scheduled_for: "2026-09-11T12:00:00.000Z",
            sent_at: null,
            cancelled_at: null,
            fail_count: 0,
            last_error: null,
            },
            {
              id: "sent-row",
              reminder_type: "registration_closing",
              scheduled_for: sameTime,
            sent_at: "2026-09-01T11:00:00.000Z",
            cancelled_at: null,
            fail_count: 0,
            last_error: null,
            },
          ],
          error: null,
        })
      }
      if (call === 2) {
        const chain = createChainableMock({
          data: [{ id: "old-a" }, { id: "new-type" }],
          error: null,
        })
        chain.upsert = ((
          rows: Array<Record<string, unknown>>,
          options: { onConflict: string },
        ) => {
          operations.push("upsert")
          upsertedRows = rows
          upsertOptions = options
          return chain
        }) as typeof chain.upsert
        return chain
      }

      const chain = createChainableMock({ data: [], error: null })
      chain.update = ((value: Record<string, unknown>) => {
        operations.push("cancel")
        expect(value.cancelled_at).toBe("2026-09-02T12:00:00.000Z")
        return chain
      }) as typeof chain.update
      chain.in = ((field: string, values: string[]) => {
        expect(field).toBe("id")
        cancelledIds = values
        return chain
      }) as typeof chain.in
      return chain
    })

    const count = await reconcileRemindersForEntity(
      "hackathon_event",
      "11111111-1111-1111-1111-111111111111",
      [
        {
          hackathonId: "11111111-1111-1111-1111-111111111111",
          reminderType: "event_starting",
          scheduledFor: new Date(sameTime),
          urgency: "medium",
          metadata: { version: "A-again" },
        },
        {
          hackathonId: "11111111-1111-1111-1111-111111111111",
          reminderType: "submission_due",
          scheduledFor: new Date(sameTime),
          urgency: "high",
          metadata: { version: "same-time-other-type" },
        },
        {
          hackathonId: "11111111-1111-1111-1111-111111111111",
          reminderType: "registration_closing",
          scheduledFor: new Date(sameTime),
          urgency: "low",
          metadata: { version: "already-sent" },
        },
      ],
      new Date("2026-09-02T12:00:00.000Z"),
    )

    expect(count).toBe(2)
    expect(operations).toEqual(["upsert", "cancel"])
    expect(upsertOptions.onConflict).toBe(
      "entity_type,entity_id,reminder_type,scheduled_for",
    )
    expect(upsertedRows.map((row) => row.reminder_type).sort()).toEqual([
      "event_starting",
      "submission_due",
    ])
    expect(upsertedRows[0]?.cancelled_at).toBeNull()
    expect(upsertedRows.every((row) => !("sent_at" in row))).toBe(true)
    expect(cancelledIds).toEqual(["old-b"])
  })

  it("keeps retry state for an unchanged active reminder identity", async () => {
    const sameTime = "2026-09-10T12:00:00.000Z"
    const scheduled = createChainableMock({
      data: [{
        id: "failed-a",
        reminder_type: "event_starting",
        scheduled_for: sameTime,
        sent_at: null,
        cancelled_at: null,
        fail_count: 3,
        last_error: "provider unavailable",
      }],
      error: null,
    })
    setMockFromImplementation((table) =>
      table === "scheduled_reminders"
        ? scheduled
        : createChainableMock({ data: null, error: null }),
    )

    const count = await reconcileRemindersForEntity(
      "hackathon_event",
      "11111111-1111-1111-1111-111111111111",
      [{
        hackathonId: "11111111-1111-1111-1111-111111111111",
        reminderType: "event_starting",
        scheduledFor: new Date(sameTime),
        urgency: "medium",
        metadata: { version: "unchanged" },
      }],
    )

    expect(count).toBe(0)
    expect(scheduled.upsert).not.toHaveBeenCalled()
    expect(scheduled.update).not.toHaveBeenCalled()
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

  it("surfaces cancellation-state failures", async () => {
    const { cancelRemindersForEntity } = await import("@/lib/services/smart-reminders")
    setMockFromImplementation(() =>
      createChainableMock({ data: null, error: { message: "write failed" } })
    )

    await expect(
      cancelRemindersForEntity("team_invitation", "inv-999"),
    ).rejects.toThrow("Failed to cancel reminders: write failed")
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

  it("surfaces cancellation-state failures", async () => {
    const { cancelUpcomingReminder } = await import("@/lib/services/smart-reminders")
    setMockFromImplementation(() =>
      createChainableMock({ data: null, error: { message: "write failed" } })
    )

    await expect(
      cancelUpcomingReminder("team_invitation", "inv-123"),
    ).rejects.toThrow("Failed to cancel upcoming reminder: write failed")
  })
})

describe("reminder delivery lifecycle", () => {
  const reminder = {
    id: "reminder-1",
    entity_type: "hackathon_event" as const,
    entity_id: "hackathon-1",
    hackathon_id: "hackathon-1",
    reminder_type: "event_starting" as const,
    scheduled_for: "2026-08-26T12:00:00.000Z",
    urgency: "low" as const,
    sent_at: null,
    cancelled_at: null,
    metadata: { deadlineDate: new Date(Date.now() + DAY).toISOString() },
    fail_count: 0,
    last_error: null,
    created_at: "2026-08-25T12:00:00.000Z",
  }

  it("rejects stale event reminder rows after draft or closeout", async () => {
    for (const status of ["draft", "completed", "archived"]) {
      resetSupabaseMocks()
      setMockFromImplementation(() =>
        createChainableMock({
          data: {
            status,
            starts_at: new Date(Date.now() - HOUR).toISOString(),
            ends_at: null,
          },
          error: null,
        })
      )

      await expect(validateReminderEntity(reminder)).resolves.toBe(false)
    }
  })

  it("allows event reminders only while the event is live and pre-completion", async () => {
    for (const status of ["published", "registration_open", "active", "judging"]) {
      resetSupabaseMocks()
      setMockFromImplementation(() =>
        createChainableMock({
          data: {
            status,
            starts_at: reminder.metadata.deadlineDate,
            ends_at: null,
            registration_closes_at: null,
          },
          error: null,
        })
      )

      await expect(validateReminderEntity(reminder)).resolves.toBe(true)
    }
  })

  it("rejects an event reminder after its deadline changes", async () => {
    resetSupabaseMocks()
    setMockFromImplementation(() => createChainableMock({
      data: {
        status: "active",
        starts_at: new Date(Date.now() + 2 * DAY).toISOString(),
        ends_at: null,
        registration_closes_at: null,
      },
      error: null,
    }))

    await expect(validateReminderEntity(reminder)).resolves.toBe(false)
  })

  it("rejects a stale published row after its event has effectively ended", async () => {
    resetSupabaseMocks()
    setMockFromImplementation(() =>
      createChainableMock({
        data: {
          status: "published",
          starts_at: new Date(Date.now() - 2 * HOUR).toISOString(),
          ends_at: new Date(Date.now() - HOUR).toISOString(),
        },
        error: null,
      })
    )

    await expect(validateReminderEntity(reminder)).resolves.toBe(false)
  })

  it("distinguishes no eligible recipients from a delivery failure", () => {
    expect(hasReminderDeliveryFailure({ sent: 0, failed: 0 })).toBe(false)
    expect(hasReminderDeliveryFailure({ sent: 0, failed: 1 })).toBe(true)
    expect(hasReminderDeliveryFailure({ success: false })).toBe(true)
    expect(hasReminderDeliveryFailure({ success: true })).toBe(false)
    expect(reminderDeliveryWasSent({ sent: 0, failed: 0 })).toBe(false)
    expect(reminderDeliveryWasSent({ sent: 1, failed: 0 })).toBe(true)
    expect(reminderDeliveryWasSent({ sent: 1, failed: 1 })).toBe(false)
    expect(reminderDeliveryWasSent({ success: true })).toBe(true)
    expect(reminderDeliveryWasSent({ success: false })).toBe(false)
  })

  it("marks completion only after provider acceptance", async () => {
    resetSupabaseMocks()
    const updates: Array<Record<string, unknown>> = []
    setMockFromImplementation(() => {
      const chain = createChainableMock({ data: [reminder], error: null })
      chain.update = ((value: Record<string, unknown>) => {
        updates.push(value)
        return chain
      }) as typeof chain.update
      return chain
    })

    const result = await processPendingReminders(50, {
      validate: async () => true,
      dispatch: async () => true,
    })

    expect(result).toEqual({ processed: 1, sent: 1, skipped: 0, errors: 0 })
    expect(updates).toHaveLength(1)
    expect(typeof updates[0].sent_at).toBe("string")
  })

  it("keeps a rejected delivery pending and records a retry", async () => {
    resetSupabaseMocks()
    const updates: Array<Record<string, unknown>> = []
    setMockFromImplementation(() => {
      const chain = createChainableMock({ data: [reminder], error: null })
      chain.update = ((value: Record<string, unknown>) => {
        updates.push(value)
        return chain
      }) as typeof chain.update
      return chain
    })

    const result = await processPendingReminders(50, {
      validate: async () => true,
      dispatch: async () => {
        throw new Error("provider unavailable")
      },
    })

    expect(result).toEqual({ processed: 1, sent: 0, skipped: 0, errors: 1 })
    expect(updates).toEqual([
      { fail_count: 1, last_error: "provider unavailable" },
    ])
  })

  it("retries when completion persistence fails after provider acceptance", async () => {
    resetSupabaseMocks()
    let scheduledReminderCalls = 0
    const updates: Array<Record<string, unknown>> = []
    setMockFromImplementation(() => {
      scheduledReminderCalls++
      const chain = createChainableMock(
        scheduledReminderCalls === 2
          ? { data: null, error: { message: "write failed" } }
          : { data: [reminder], error: null },
      )
      chain.update = ((value: Record<string, unknown>) => {
        updates.push(value)
        return chain
      }) as typeof chain.update
      return chain
    })

    const result = await processPendingReminders(50, {
      validate: async () => true,
      dispatch: async () => true,
    })

    expect(result).toEqual({ processed: 1, sent: 0, skipped: 0, errors: 1 })
    expect(updates.some((update) => typeof update.sent_at === "string")).toBe(true)
    expect(updates).toContainEqual({
      last_error: "Failed to mark reminder sent: write failed",
    })
  })

  it("surfaces pending-reminder query failures to cron", async () => {
    resetSupabaseMocks()
    setMockFromImplementation(() =>
      createChainableMock({ data: null, error: { message: "query failed" } })
    )

    await expect(processPendingReminders()).rejects.toThrow(
      "Failed to load pending reminders: query failed",
    )
  })

  it("surfaces failure-state persistence errors to cron", async () => {
    resetSupabaseMocks()
    let scheduledReminderCalls = 0
    setMockFromImplementation(() => {
      scheduledReminderCalls++
      return createChainableMock(
        scheduledReminderCalls === 1
          ? { data: [reminder], error: null }
          : { data: null, error: { message: "write failed" } },
      )
    })

    await expect(
      processPendingReminders(50, {
        validate: async () => true,
        dispatch: async () => {
          throw new Error("provider unavailable")
        },
      }),
    ).rejects.toThrow("Failed to record reminder failure: write failed")
  })
})


describe("judge invitation reminder cadence", () => {
  it("reminds after 48 hours and a day before expiry, not generic event milestones", async () => {
    const { computeJudgeInvitationReminderSchedule } = await import("@/lib/services/smart-reminders")
    const created = new Date("2026-09-05T12:00:00Z")
    const schedule = computeJudgeInvitationReminderSchedule(created, new Date("2026-09-12T12:00:00Z"), created)
    expect(schedule.map((item) => item.scheduledFor.toISOString())).toEqual(["2026-09-07T12:00:00.000Z", "2026-09-11T12:00:00.000Z"])
    const short = computeJudgeInvitationReminderSchedule(created, new Date("2026-09-06T12:00:00Z"), created)
    expect(short).toHaveLength(0)
  })
})
