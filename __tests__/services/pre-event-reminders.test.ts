import { beforeEach, describe, expect, it, mock } from "bun:test"
import {
  createChainableMock,
  resetSupabaseMocks,
  setMockFromImplementation,
} from "../lib/supabase-mock"

const mockComputeReminderSchedule = mock((
  _createdAt: Date,
  deadline: Date,
) => [{ scheduledFor: new Date(deadline.getTime() - 60_000), urgency: "high" as const }])
const mockReconcileRemindersForEntity = mock((
  _entityType: string,
  _entityId: string,
  desired: unknown[],
) => Promise.resolve(desired.length))
mock.module("@/lib/services/smart-reminders", () => ({
  scheduleReminders: mock(() => Promise.resolve(0)),
  reconcileRemindersForEntity: mockReconcileRemindersForEntity,
  cancelRemindersForEntity: mock(() => Promise.resolve()),
  cancelUpcomingReminder: mock(() => Promise.resolve(0)),
  computeReminderSchedule: mockComputeReminderSchedule,
  processPendingReminders: mock(() =>
    Promise.resolve({ processed: 0, sent: 0, skipped: 0, errors: 0 })
  ),
}))

const { scheduleAcceptedJudgeReminders, schedulePreEventReminders } = await import(
  "@/lib/services/pre-event-reminders"
)

describe("schedulePreEventReminders", () => {
  beforeEach(() => {
    resetSupabaseMocks()
    mockComputeReminderSchedule.mockClear()
    mockComputeReminderSchedule.mockImplementation((_, deadline) => [
      {
        scheduledFor: new Date(deadline.getTime() - 60_000),
        urgency: "high",
      },
    ])
    mockReconcileRemindersForEntity.mockClear()
    mockReconcileRemindersForEntity.mockImplementation(
      (_, __, desired) => Promise.resolve(desired.length),
    )
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
    expect(mockReconcileRemindersForEntity).toHaveBeenCalledWith(
      "hackathon_event",
      "11111111-1111-1111-1111-111111111111",
      [],
      expect.any(Date),
    )
  })

  it("cancels reminders for a test event", async () => {
    setMockFromImplementation((table) => table === "hackathons"
      ? createChainableMock({
          data: {
            id: "11111111-1111-1111-1111-111111111111",
            name: "Practice Event",
            slug: "practice-event",
            registration_closes_at: null,
            starts_at: "2026-09-02T16:00:00.000Z",
            ends_at: "2026-09-03T16:00:00.000Z",
            created_at: "2026-08-25T16:00:00.000Z",
            status: "published",
            is_test_event: true,
          },
          error: null,
        })
      : createChainableMock({ data: null, error: null }))

    await expect(schedulePreEventReminders(
      "11111111-1111-1111-1111-111111111111",
      new Date("2026-08-30T12:00:00.000Z"),
    )).resolves.toBe(0)
    expect(mockReconcileRemindersForEntity).toHaveBeenCalledWith(
      "hackathon_event",
      "11111111-1111-1111-1111-111111111111",
      [],
      new Date("2026-08-30T12:00:00.000Z"),
    )
  })

  it("uses the custom project deadline instead of the event end", async () => {
    const deadlineQuery = createChainableMock({
      data: { starts_at: "2027-09-03T12:00:00.000Z" },
      error: null,
    })
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
        return deadlineQuery
      }
      return createChainableMock({ data: null, error: null })
    })

    expect(await schedulePreEventReminders(
      "11111111-1111-1111-1111-111111111111",
      new Date("2026-08-30T12:00:00.000Z"),
    )).toBe(5)
    expect(mockReconcileRemindersForEntity).toHaveBeenCalledWith(
      "hackathon_event",
      "11111111-1111-1111-1111-111111111111",
      expect.arrayContaining([
        expect.objectContaining({
          hackathonId: "11111111-1111-1111-1111-111111111111",
          reminderType: "submission_due",
          metadata: expect.objectContaining({
            deadlineDate: "2027-09-03T12:00:00.000Z",
          }),
        }),
        expect.objectContaining({
          reminderType: "judge_scoring_starting",
          metadata: expect.objectContaining({
            deadlineDate: "2027-09-03T12:00:00.000Z",
            hackathonTimezone: "UTC",
          }),
        }),
      ]),
      new Date("2026-08-30T12:00:00.000Z"),
    )
    expect(deadlineQuery.order).toHaveBeenCalledWith(
      "starts_at",
      { ascending: true },
    )
    expect(deadlineQuery.limit).toHaveBeenCalledWith(1)
  })

  it("schedules judges exactly one day and one hour before event and scoring start", async () => {
    setMockFromImplementation((table) => {
      if (table === "hackathons") {
        return createChainableMock({
          data: {
            id: "11111111-1111-1111-1111-111111111111",
            name: "Build Day",
            slug: "build-day",
            registration_closes_at: null,
            starts_at: "2026-09-10T12:00:00.000Z",
            ends_at: "2026-09-11T17:00:00.000Z",
            created_at: "2026-08-25T16:00:00.000Z",
            status: "published",
          },
          error: null,
        })
      }
      if (table === "hackathon_schedule_items") {
        return createChainableMock({
          data: { starts_at: "2026-09-11T16:00:00.000Z" },
          error: null,
        })
      }
      return createChainableMock({ data: null, error: null })
    })

    await schedulePreEventReminders(
      "11111111-1111-1111-1111-111111111111",
      new Date("2026-09-01T12:00:00.000Z"),
    )

    const desired = mockReconcileRemindersForEntity.mock.calls[0]?.[2] as Array<{
      reminderType: string
      scheduledFor: Date
      urgency: string
      metadata: Record<string, unknown>
    }>
    expect(desired.filter((reminder) => reminder.reminderType.startsWith("judge_")))
      .toEqual([
        {
          reminderType: "judge_event_starting",
          scheduledFor: new Date("2026-09-09T12:00:00.000Z"),
          urgency: "medium",
          metadata: expect.objectContaining({
            deadlineDate: "2026-09-10T12:00:00.000Z",
            hackathonTimezone: "UTC",
            reminderWindow: "24_hours",
          }),
          hackathonId: "11111111-1111-1111-1111-111111111111",
        },
        {
          reminderType: "judge_event_starting",
          scheduledFor: new Date("2026-09-10T11:00:00.000Z"),
          urgency: "high",
          metadata: expect.objectContaining({ reminderWindow: "1_hour" }),
          hackathonId: "11111111-1111-1111-1111-111111111111",
        },
        {
          reminderType: "judge_scoring_starting",
          scheduledFor: new Date("2026-09-10T16:00:00.000Z"),
          urgency: "medium",
          metadata: expect.objectContaining({
            deadlineDate: "2026-09-11T16:00:00.000Z",
            hackathonTimezone: "UTC",
            reminderWindow: "24_hours",
          }),
          hackathonId: "11111111-1111-1111-1111-111111111111",
        },
        {
          reminderType: "judge_scoring_starting",
          scheduledFor: new Date("2026-09-11T15:00:00.000Z"),
          urgency: "high",
          metadata: expect.objectContaining({ reminderWindow: "1_hour" }),
          hackathonId: "11111111-1111-1111-1111-111111111111",
        },
      ])
  })

  it("reminds organizers before the event and before judging", async () => {
    setMockFromImplementation((table) => {
      if (table === "hackathons") {
        return createChainableMock({
          data: {
            id: "11111111-1111-1111-1111-111111111111",
            name: "Build Day",
            slug: "build-day",
            registration_closes_at: null,
            starts_at: "2026-09-10T12:00:00.000Z",
            ends_at: "2026-09-11T17:00:00.000Z",
            created_at: "2026-08-25T16:00:00.000Z",
            status: "published",
          },
          error: null,
        })
      }
      return createChainableMock({
        data: table === "hackathon_schedule_items"
          ? { starts_at: "2026-09-11T16:00:00.000Z" }
          : null,
        error: null,
      })
    })

    await schedulePreEventReminders(
      "11111111-1111-1111-1111-111111111111",
      new Date("2026-09-01T12:00:00.000Z"),
    )

    const desired = mockReconcileRemindersForEntity.mock.calls[0]?.[2] as Array<{
      reminderType: string
      scheduledFor: Date
      metadata: Record<string, unknown>
    }>
    expect(desired.filter((reminder) => reminder.reminderType.startsWith("organizer_")))
      .toEqual([
        expect.objectContaining({
          reminderType: "organizer_event_readiness",
          scheduledFor: new Date("2026-09-03T12:00:00.000Z"),
          metadata: expect.objectContaining({ reminderWindow: "7_days" }),
        }),
        expect.objectContaining({
          reminderType: "organizer_event_readiness",
          scheduledFor: new Date("2026-09-09T12:00:00.000Z"),
          metadata: expect.objectContaining({ reminderWindow: "24_hours" }),
        }),
        expect.objectContaining({
          reminderType: "organizer_judging_readiness",
          scheduledFor: new Date("2026-09-10T16:00:00.000Z"),
          metadata: expect.objectContaining({ reminderWindow: "24_hours" }),
        }),
        expect.objectContaining({
          reminderType: "organizer_judging_readiness",
          scheduledFor: new Date("2026-09-11T15:00:00.000Z"),
          metadata: expect.objectContaining({ reminderWindow: "1_hour" }),
        }),
      ])
  })

  it("gives a late judge one stable catch-up without duplicating future event reminders", async () => {
    setMockFromImplementation((table) => table === "hackathon_schedule_items"
      ? createChainableMock({ data: null, error: null })
      : createChainableMock({ data: null, error: null }))

    const now = new Date("2026-09-09T13:00:00.000Z")
    await scheduleAcceptedJudgeReminders({
      invitationId: "22222222-2222-2222-2222-222222222222",
      hackathonId: "11111111-1111-1111-1111-111111111111",
      hackathonName: "Build Day",
      hackathonSlug: "build-day",
      startsAt: "2026-09-10T12:00:00.000Z",
      endsAt: null,
      recipientClerkUserId: "judge-user",
      now,
    })

    expect(mockReconcileRemindersForEntity).toHaveBeenCalledWith(
      "judge_invitation",
      "22222222-2222-2222-2222-222222222222",
      [
        expect.objectContaining({
          reminderType: "judge_event_starting",
          scheduledFor: new Date("2026-09-09T12:00:00.000Z"),
          urgency: "medium",
          metadata: expect.objectContaining({
            recipientClerkUserId: "judge-user",
            reminderWindow: "24_hours",
          }),
        }),
      ],
      now,
    )
  })

  it("sends only the nearest catch-up when both judge windows were missed", async () => {
    setMockFromImplementation(() => createChainableMock({ data: null, error: null }))
    const now = new Date("2026-09-10T11:10:00.000Z")

    await scheduleAcceptedJudgeReminders({
      invitationId: "22222222-2222-2222-2222-222222222222",
      hackathonId: "11111111-1111-1111-1111-111111111111",
      hackathonName: "Build Day",
      hackathonSlug: "build-day",
      startsAt: "2026-09-10T12:00:00.000Z",
      endsAt: null,
      recipientClerkUserId: "judge-user",
      now,
    })

    const desired = mockReconcileRemindersForEntity.mock.calls[0]?.[2] as Array<{
      reminderType: string
      scheduledFor: Date
    }>
    expect(desired).toEqual([
      expect.objectContaining({
        reminderType: "judge_event_starting",
        scheduledFor: new Date("2026-09-10T11:00:00.000Z"),
      }),
    ])
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
    expect(mockReconcileRemindersForEntity).not.toHaveBeenCalled()
  })

  it("cancels every unsent event reminder after judging starts", async () => {
    setMockFromImplementation((table) => table === "hackathons"
      ? createChainableMock({
          data: {
            id: "11111111-1111-1111-1111-111111111111",
            name: "Build Day",
            slug: "build-day",
            registration_closes_at: null,
            starts_at: "2026-09-02T16:00:00.000Z",
            ends_at: "2026-09-03T16:00:00.000Z",
            created_at: "2026-08-25T16:00:00.000Z",
            status: "judging",
          },
          error: null,
        })
      : createChainableMock({ data: null, error: null }))

    await schedulePreEventReminders(
      "11111111-1111-1111-1111-111111111111",
      new Date("2026-08-30T12:00:00.000Z"),
    )

    expect(mockReconcileRemindersForEntity).toHaveBeenCalledWith(
      "hackathon_event",
      "11111111-1111-1111-1111-111111111111",
      [],
      new Date("2026-08-30T12:00:00.000Z"),
    )
  })
})
