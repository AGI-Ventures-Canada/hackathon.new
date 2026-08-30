import { beforeEach, describe, expect, it, mock } from "bun:test"
import {
  createChainableMock,
  resetSupabaseMocks,
  setMockFromImplementation,
} from "../lib/supabase-mock"

const mockTeamReminder = mock(() => Promise.resolve({ success: true }))
const mockJudgeReminder = mock(() => Promise.resolve({ success: true }))
const mockEventReminder = mock(() => Promise.resolve({ sent: 1, failed: 0 }))

mock.module("@/lib/email/team-invitations", () => ({
  sendTeamInvitationReminderEmail: mockTeamReminder,
}))
mock.module("@/lib/email/judge-invitations", () => ({
  sendJudgeInvitationReminderEmail: mockJudgeReminder,
}))
mock.module("@/lib/email/pre-event-reminders", () => ({
  sendPreEventReminderEmail: mockEventReminder,
}))

const mockWithDeliveryLease = mock(async (
  _key: string,
  work: () => Promise<unknown>,
) => ({ acquired: true as const, value: await work() }))
mock.module("@/lib/services/delivery-lease", () => ({
  withDeliveryLease: mockWithDeliveryLease,
}))

const { processPendingReminders, validateReminderEntity } = await import(
  "@/lib/services/smart-reminders"
)

const baseReminder = {
  id: "reminder_1",
  entity_type: "team_invitation" as const,
  entity_id: "invite_1",
  hackathon_id: "hack_1",
  reminder_type: "invitation_reminder" as const,
  scheduled_for: "2026-08-01T00:00:00Z",
  urgency: "high" as const,
  sent_at: null,
  cancelled_at: null,
  metadata: {
    email: "person@example.com",
    teamName: "Team One",
    hackathonName: "Build Together",
    hackathonSlug: "build-together",
    hackathonStartsAt: "2026-09-10T12:00:00.000Z",
    hackathonEndsAt: "2026-09-11T17:00:00.000Z",
    hackathonTimezone: "America/Toronto",
    inviterName: "Avery",
    inviteToken: "token_1",
    expiresAt: "2099-09-01T00:00:00Z",
    deadlineDate: "2099-09-01T00:00:00Z",
  },
  fail_count: 0,
  last_error: null,
  created_at: "2026-08-01T00:00:00Z",
}

describe("smart reminder default delivery", () => {
  beforeEach(() => {
    resetSupabaseMocks()
    mockTeamReminder.mockClear()
    mockJudgeReminder.mockClear()
    mockEventReminder.mockClear()
    mockTeamReminder.mockResolvedValue({ success: true })
    mockJudgeReminder.mockResolvedValue({ success: true })
    mockEventReminder.mockResolvedValue({ sent: 1, failed: 0 })
  })

  it("dispatches team, judge, and event reminders with durable row ids", async () => {
    const variants = [
      baseReminder,
      { ...baseReminder, id: "reminder_2", entity_type: "judge_invitation" as const },
      {
        ...baseReminder,
        id: "reminder_3",
        entity_type: "hackathon_event" as const,
        entity_id: "hack_1",
        reminder_type: "submission_due" as const,
      },
      {
        ...baseReminder,
        id: "reminder_4",
        entity_type: "hackathon_event" as const,
        entity_id: "hack_1",
        reminder_type: "judge_scoring_starting" as const,
      },
      {
        ...baseReminder,
        id: "reminder_5",
        entity_type: "judge_invitation" as const,
        reminder_type: "judge_event_starting" as const,
        metadata: {
          ...baseReminder.metadata,
          recipientClerkUserId: "judge-user",
        },
      },
    ]

    for (const variant of variants) {
      setMockFromImplementation(() =>
        createChainableMock({ data: [variant], error: null })
      )
      await expect(processPendingReminders(1, { validate: async () => true }))
        .resolves.toEqual({ processed: 1, sent: 1, skipped: 0, errors: 0 })
    }

    expect(mockTeamReminder).toHaveBeenCalledWith(expect.objectContaining({
      deliveryId: "reminder_1",
      to: "person@example.com",
    }))
    expect(mockJudgeReminder).toHaveBeenCalledWith(expect.objectContaining({
      deliveryId: "reminder_2",
      to: "person@example.com",
      hackathonSlug: "build-together",
      hackathonStartsAt: "2026-09-10T12:00:00.000Z",
      hackathonEndsAt: "2026-09-11T17:00:00.000Z",
      hackathonTimezone: "America/Toronto",
    }))
    expect(mockEventReminder).toHaveBeenCalledWith(expect.objectContaining({
      deliveryId: "reminder_3",
      hackathonId: "hack_1",
      reminderType: "submission_due",
    }))
    expect(mockEventReminder).toHaveBeenCalledWith(expect.objectContaining({
      deliveryId: "reminder_4",
      hackathonId: "hack_1",
      reminderType: "judge_scoring_starting",
      hackathonTimezone: "America/Toronto",
    }))
    expect(mockEventReminder).toHaveBeenCalledWith(expect.objectContaining({
      deliveryId: "reminder_5",
      reminderType: "judge_event_starting",
      recipientIds: ["judge-user"],
    }))
  })

  it("records provider rejection for each default dispatcher", async () => {
    const variants = [
      baseReminder,
      { ...baseReminder, id: "reminder_2", entity_type: "judge_invitation" as const },
      {
        ...baseReminder,
        id: "reminder_3",
        entity_type: "hackathon_event" as const,
        entity_id: "hack_1",
        reminder_type: "submission_due" as const,
      },
    ]
    mockTeamReminder.mockResolvedValue({ success: false })
    mockJudgeReminder.mockResolvedValue({ success: false })
    mockEventReminder.mockResolvedValue({ sent: 0, failed: 1 })
    const error = mock(() => {})
    const originalError = console.error
    console.error = error
    try {
      for (const variant of variants) {
        setMockFromImplementation(() =>
          createChainableMock({ data: [variant], error: null })
        )
        await expect(processPendingReminders(1, { validate: async () => true }))
          .resolves.toEqual({ processed: 1, sent: 0, skipped: 0, errors: 1 })
      }
      expect(error).toHaveBeenCalledTimes(3)
    } finally {
      console.error = originalError
    }
  })

  it("cancels invalid, undeliverable, and unknown reminders", async () => {
    for (const dependencies of [
      { validate: async () => false, dispatch: async () => true },
      { validate: async () => true, dispatch: async () => false },
    ]) {
      const updates: Record<string, unknown>[] = []
      setMockFromImplementation(() => {
        const chain = createChainableMock({ data: [baseReminder], error: null })
        chain.update = ((value: Record<string, unknown>) => {
          updates.push(value)
          return chain
        }) as typeof chain.update
        return chain
      })
      await expect(processPendingReminders(1, dependencies)).resolves.toEqual({
        processed: 1,
        sent: 0,
        skipped: 1,
        errors: 0,
      })
      expect(updates[0]).toEqual({
        cancelled_at: expect.any(String),
        last_error: null,
      })
    }

    setMockFromImplementation(() => createChainableMock({
      data: [{ ...baseReminder, entity_type: "unknown" }],
      error: null,
    }))
    await expect(processPendingReminders(1, { validate: async () => true }))
      .resolves.toEqual({ processed: 1, sent: 0, skipped: 1, errors: 0 })
  })

  it("records malformed metadata and skipped-row persistence failures", async () => {
    setMockFromImplementation(() => createChainableMock({
      data: [{ ...baseReminder, metadata: {} }],
      error: null,
    }))
    const error = mock(() => {})
    const originalError = console.error
    console.error = error
    try {
      await expect(processPendingReminders(1, { validate: async () => true }))
        .resolves.toEqual({ processed: 1, sent: 0, skipped: 0, errors: 1 })

      let call = 0
      setMockFromImplementation(() => {
        call++
        return createChainableMock(
          call === 2
            ? { data: null, error: { message: "cancel failed" } }
            : { data: [baseReminder], error: null },
        )
      })
      await expect(processPendingReminders(1, { validate: async () => false }))
        .resolves.toEqual({ processed: 1, sent: 0, skipped: 0, errors: 1 })
      expect(error.mock.calls.length).toBeGreaterThanOrEqual(2)
    } finally {
      console.error = originalError
    }
  })

  it("validates invitation state, expiry, and database errors", async () => {
    for (const entityType of ["team_invitation", "judge_invitation"] as const) {
      let call = 0
      setMockFromImplementation(() => {
        call++
        return call === 1
          ? createChainableMock({
              data: { status: "active", starts_at: null, ends_at: null },
              error: null,
            })
          : createChainableMock({
              data: entityType === "team_invitation"
                ? {
                    status: "pending",
                    expires_at: "2099-01-01T00:00:00Z",
                    hackathon_id: "hack_1",
                    team_id: "team_1",
                    teams: { status: "forming", hackathon_id: "hack_1" },
                  }
                : { status: "pending", expires_at: "2099-01-01T00:00:00Z" },
              error: null,
            })
      })
      await expect(validateReminderEntity({ ...baseReminder, entity_type: entityType }))
        .resolves.toBe(true)

      call = 0
      setMockFromImplementation(() => {
        call++
        return call === 1
          ? createChainableMock({ data: { status: "active" }, error: null })
          : createChainableMock({ data: null, error: { message: "lookup failed" } })
      })
      await expect(validateReminderEntity({ ...baseReminder, entity_type: entityType }))
        .rejects.toThrow("lookup failed")
    }
  })

  it("never sends reminders for a test event", async () => {
    setMockFromImplementation(() => createChainableMock({
      data: {
        status: "active",
        starts_at: "2026-09-01T12:00:00.000Z",
        ends_at: "2099-09-02T12:00:00.000Z",
        is_test_event: true,
      },
      error: null,
    }))

    await expect(validateReminderEntity({
      ...baseReminder,
      entity_type: "hackathon_event",
      entity_id: "hack_1",
      reminder_type: "judge_event_starting",
    })).resolves.toBe(false)
  })

  it("rejects stale invitation states without treating them as delivery failures", async () => {
    for (const invitation of [
      null,
      { status: "accepted", expires_at: "2099-01-01T00:00:00Z" },
      { status: "pending", expires_at: "2020-01-01T00:00:00Z" },
    ]) {
      setMockFromImplementation((table) => {
        if (table === "hackathons") {
          return createChainableMock({
            data: { status: "active", starts_at: null, ends_at: null },
            error: null,
          })
        }
        return createChainableMock({ data: invitation, error: null })
      })

      await expect(validateReminderEntity(baseReminder)).resolves.toBe(false)
    }
  })

  it("rejects team invite reminders after team joining closes", async () => {
    for (const hackathon of [
      {
        status: "judging",
        starts_at: "2026-08-01T00:00:00Z",
        ends_at: "2099-08-03T00:00:00Z",
        registration_closes_at: "2099-08-02T00:00:00Z",
        allow_late_registration: true,
      },
      {
        status: "active",
        starts_at: "2026-08-01T00:00:00Z",
        ends_at: "2099-08-03T00:00:00Z",
        registration_closes_at: "2026-08-02T00:00:00Z",
        allow_late_registration: false,
      },
    ]) {
      setMockFromImplementation((table) => table === "hackathons"
        ? createChainableMock({ data: hackathon, error: null })
        : createChainableMock({
            data: {
              status: "pending",
              expires_at: "2099-01-01T00:00:00Z",
              hackathon_id: "hack_1",
              team_id: "team_1",
              teams: { status: "forming", hackathon_id: "hack_1" },
            },
            error: null,
          }))

      await expect(validateReminderEntity(baseReminder)).resolves.toBe(false)
    }
  })

  it("rejects missing and closed events before reading the reminder entity", async () => {
    for (const hackathon of [
      null,
      { status: "draft", starts_at: null, ends_at: null },
      {
        status: "active",
        starts_at: "2020-01-01T00:00:00Z",
        ends_at: "2020-01-02T00:00:00Z",
      },
    ]) {
      const tables: string[] = []
      setMockFromImplementation((table) => {
        tables.push(table)
        return createChainableMock({ data: hackathon, error: null })
      })

      await expect(validateReminderEntity(baseReminder)).resolves.toBe(false)
      expect(tables).toEqual(["hackathons"])
    }
  })

  it("binds event reminders to their event and rejects unknown entity types", async () => {
    setMockFromImplementation(() => createChainableMock({
      data: {
        status: "active",
        starts_at: "2099-09-01T00:00:00Z",
        ends_at: null,
        registration_closes_at: null,
      },
      error: null,
    }))

    await expect(validateReminderEntity({
      ...baseReminder,
      entity_type: "hackathon_event",
      entity_id: "hack_1",
      reminder_type: "event_starting",
    })).resolves.toBe(true)
    await expect(validateReminderEntity({
      ...baseReminder,
      entity_type: "hackathon_event",
      entity_id: "hack_1",
      reminder_type: "judge_event_starting",
    })).resolves.toBe(true)
    await expect(validateReminderEntity({
      ...baseReminder,
      entity_type: "hackathon_event",
      entity_id: "another_event",
      reminder_type: "event_starting",
    })).resolves.toBe(false)
    await expect(validateReminderEntity({
      ...baseReminder,
      entity_type: "unknown" as never,
    })).resolves.toBe(false)
  })

  it("validates invitation-scoped judge reminders against the accepted judge", async () => {
    setMockFromImplementation((table) => {
      if (table === "hackathons") {
        return createChainableMock({
          data: {
            status: "active",
            starts_at: "2099-09-01T00:00:00Z",
            ends_at: "2099-09-02T00:00:00Z",
          },
          error: null,
        })
      }
      return createChainableMock({
        data: {
          status: "accepted",
          expires_at: "2099-01-01T00:00:00Z",
          accepted_by_clerk_user_id: "judge-user",
        },
        error: null,
      })
    })

    const reminder = {
      ...baseReminder,
      entity_type: "judge_invitation" as const,
      reminder_type: "judge_event_starting" as const,
      metadata: {
        ...baseReminder.metadata,
        deadlineDate: "2099-09-01T00:00:00Z",
        recipientClerkUserId: "judge-user",
      },
    }
    await expect(validateReminderEntity(reminder)).resolves.toBe(true)
    await expect(validateReminderEntity({
      ...reminder,
      metadata: { ...reminder.metadata, recipientClerkUserId: "someone-else" },
    })).resolves.toBe(false)
  })

  it("cancels event reminders when there are no eligible recipients", async () => {
    mockEventReminder.mockResolvedValue({ sent: 0, failed: 0 })
    const updates: Record<string, unknown>[] = []
    setMockFromImplementation(() => {
      const chain = createChainableMock({
        data: [{
          ...baseReminder,
          entity_type: "hackathon_event",
          entity_id: "hack_1",
          reminder_type: "submission_due",
        }],
        error: null,
      })
      chain.update = ((value: Record<string, unknown>) => {
        updates.push(value)
        return chain
      }) as typeof chain.update
      return chain
    })

    await expect(processPendingReminders(1, { validate: async () => true }))
      .resolves.toEqual({ processed: 1, sent: 0, skipped: 1, errors: 0 })
    expect(updates).toContainEqual({
      cancelled_at: expect.any(String),
      last_error: null,
    })
  })
})
