import { describe, it, expect, beforeEach, mock } from "bun:test"
import {
  createChainableMock,
  resetSupabaseMocks,
  setMockFromImplementation,
} from "../lib/supabase-mock"

const mockSendReminderEmailsWithResult = mock(() =>
  Promise.resolve({ eligible: 1, sent: 1, failed: 0 }),
)

mock.module("@/lib/email/post-event-reminders", () => ({
  sendReminderEmailsWithResult: mockSendReminderEmailsWithResult,
  buildPrizeClaimReminderContent: () => ({
    subject: "Claim your prize",
    heading: "Your prize is waiting",
    body: "Claim it",
    ctaLabel: "View results",
    ctaUrl: "https://hackathon.new/e/test-hack",
  }),
  buildOrganizerFulfillmentReminderContent: () => ({
    subject: "Deliver prizes",
    heading: "Prizes need delivery",
    body: "Deliver them",
    ctaLabel: "Manage fulfillment",
    ctaUrl: "https://hackathon.new/e/test-hack/manage",
  }),
  buildFeedbackFollowupContent: () => ({
    subject: "Share feedback",
    heading: "Tell us what you think",
    body: "Share it",
    ctaLabel: "Share feedback",
    ctaUrl: "https://example.com/survey",
  }),
}))

const mockGetFulfillmentSummary = mock(() =>
  Promise.resolve({ assigned: 1, contacted: 0, shipped: 0, claimed: 0 }),
)

mock.module("@/lib/services/prize-fulfillment", () => ({
  getFulfillmentSummary: mockGetFulfillmentSummary,
}))

const mockWithDeliveryLease = mock(async (
  _key: string,
  work: () => Promise<unknown>,
) => ({ acquired: true as const, value: await work() }))
mock.module("@/lib/services/delivery-lease", () => ({
  withDeliveryLease: mockWithDeliveryLease,
}))

const {
  schedulePostEventReminders,
  listReminders,
  getReminderById,
  cancelReminder,
  getPendingReminders,
  markReminderSent,
  processReminder,
  processAllPendingReminders,
  cancelPendingPostEventReminders,
} = await import("@/lib/services/post-event-reminders")

describe("Post-Event Reminders Service", () => {
  beforeEach(() => {
    resetSupabaseMocks()
    mockSendReminderEmailsWithResult.mockClear()
    mockSendReminderEmailsWithResult.mockImplementation(() =>
      Promise.resolve({ eligible: 1, sent: 1, failed: 0 }),
    )
    mockGetFulfillmentSummary.mockClear()
    mockGetFulfillmentSummary.mockResolvedValue({
      assigned: 1,
      contacted: 0,
      shipped: 0,
      claimed: 0,
    })
  })

  describe("schedulePostEventReminders", () => {
    it("returns 0 when hackathon not found", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: null, error: null })
      )

      const count = await schedulePostEventReminders("11111111-1111-1111-1111-111111111111")
      expect(count).toBe(0)
    })

    it("surfaces an event lookup failure", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: null, error: { message: "database unavailable" } })
      )

      await expect(schedulePostEventReminders("hack_1")).rejects.toThrow(
        "Failed to load event for post-event reminders: database unavailable"
      )
    })

    it("schedules reminders for a hackathon", async () => {
      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createChainableMock({
            data: {
              id: "11111111-1111-1111-1111-111111111111",
              name: "Test Hack",
              slug: "test-hack",
              status: "completed",
              results_published_at: "2026-01-01T00:00:00Z",
              feedback_survey_sent_at: null,
              feedback_survey_url: null,
            },
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const count = await schedulePostEventReminders("11111111-1111-1111-1111-111111111111")
      expect(count).toBe(2)
    })

    it("reactivates only reminders cancelled by results unpublishing", async () => {
      const chains: ReturnType<typeof createChainableMock>[] = []
      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createChainableMock({
            data: {
              id: "11111111-1111-1111-1111-111111111111",
              name: "Test Hack",
              slug: "test-hack",
              status: "completed",
              results_published_at: "2026-08-20T00:00:00.000Z",
              feedback_survey_sent_at: null,
              feedback_survey_url: null,
            },
            error: null,
          })
        }
        const isInspection = callCount === 2 || callCount === 4
        const chain = createChainableMock({
          data: isInspection
            ? {
                sent_at: null,
                cancelled_at: "2026-08-19T00:00:00.000Z",
                metadata: { cancellationReason: "results_unpublished" },
              }
            : null,
          error: null,
        })
        chains.push(chain)
        return chain
      })

      await expect(
        schedulePostEventReminders("11111111-1111-1111-1111-111111111111"),
      ).resolves.toBe(2)
      const writes = chains.filter((chain) => chain.upsert.mock.calls.length > 0)
      expect(writes).toHaveLength(2)
      for (const chain of writes) {
        expect(chain.upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            cancelled_at: null,
            metadata: expect.objectContaining({
              publicationVersion: "2026-08-20T00:00:00.000Z",
            }),
          }),
          { onConflict: "hackathon_id,type" },
        )
        const payload = chain.upsert.mock.calls[0]?.[0] as Record<string, unknown>
        expect(payload).not.toHaveProperty("sent_at")
      }
    })

    it("does not reactivate reminders cancelled for another reason", async () => {
      const chains: ReturnType<typeof createChainableMock>[] = []
      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createChainableMock({
            data: {
              id: "11111111-1111-1111-1111-111111111111",
              name: "Test Hack",
              slug: "test-hack",
              status: "completed",
              results_published_at: "2026-08-20T00:00:00.000Z",
              feedback_survey_sent_at: null,
              feedback_survey_url: null,
            },
            error: null,
          })
        }
        const chain = createChainableMock({
          data: {
            sent_at: null,
            cancelled_at: "2026-08-19T00:00:00.000Z",
            metadata: { cancellationReason: "organizer_cancelled" },
          },
          error: null,
        })
        chains.push(chain)
        return chain
      })

      await expect(
        schedulePostEventReminders("11111111-1111-1111-1111-111111111111"),
      ).resolves.toBe(0)
      expect(chains.every((chain) => chain.upsert.mock.calls.length === 0)).toBe(true)
    })

    it("schedules feedback followup when survey URL exists", async () => {
      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createChainableMock({
            data: {
              id: "11111111-1111-1111-1111-111111111111",
              name: "Test Hack",
              slug: "test-hack",
              status: "completed",
              results_published_at: "2026-01-01T00:00:00Z",
              feedback_survey_sent_at: null,
              feedback_survey_url: "https://forms.google.com/test",
            },
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const count = await schedulePostEventReminders("11111111-1111-1111-1111-111111111111")
      expect(count).toBe(3)
    })

    it("skips feedback followup when survey already sent", async () => {
      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createChainableMock({
            data: {
              id: "11111111-1111-1111-1111-111111111111",
              name: "Test Hack",
              slug: "test-hack",
              status: "completed",
              results_published_at: "2026-01-01T00:00:00Z",
              feedback_survey_sent_at: "2026-01-01T00:00:00Z",
              feedback_survey_url: "https://forms.google.com/test",
            },
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const count = await schedulePostEventReminders("11111111-1111-1111-1111-111111111111")
      expect(count).toBe(2)
    })

    it("does not schedule before results are published", async () => {
      setMockFromImplementation(() =>
        createChainableMock({
          data: {
            id: "11111111-1111-1111-1111-111111111111",
            name: "Test Hack",
            slug: "test-hack",
            status: "completed",
            results_published_at: null,
            feedback_survey_sent_at: null,
            feedback_survey_url: null,
          },
          error: null,
        }),
      )

      expect(
        await schedulePostEventReminders("11111111-1111-1111-1111-111111111111"),
      ).toBe(0)
    })

    it("surfaces partial scheduling failures for retry", async () => {
      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createChainableMock({
            data: {
              id: "11111111-1111-1111-1111-111111111111",
              name: "Test Hack",
              slug: "test-hack",
              status: "completed",
              results_published_at: "2026-01-01T00:00:00Z",
              feedback_survey_sent_at: null,
              feedback_survey_url: null,
            },
            error: null,
          })
        }
        return createChainableMock(callCount === 2
          ? { data: null, error: null }
          : { data: null, error: { message: "write failed" } })
      })

      await expect(
        schedulePostEventReminders("11111111-1111-1111-1111-111111111111"),
      ).rejects.toThrow("Failed to schedule prize_claim reminder: write failed")
    })
  })

  describe("listReminders", () => {
    it("returns empty array when no reminders", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: [], error: null })
      )

      const result = await listReminders("11111111-1111-1111-1111-111111111111")
      expect(result).toEqual([])
    })

    it("returns reminders on success", async () => {
      const mockReminders = [
        {
          id: "r1",
          hackathon_id: "h1",
          type: "prize_claim",
          scheduled_for: "2026-04-06T00:00:00Z",
          sent_at: null,
          cancelled_at: null,
          recipient_filter: "winners",
          metadata: {},
          created_at: "2026-04-03T00:00:00Z",
        },
      ]
      setMockFromImplementation(() =>
        createChainableMock({ data: mockReminders, error: null })
      )

      const result = await listReminders("11111111-1111-1111-1111-111111111111")
      expect(result).toHaveLength(1)
      expect(result[0].type).toBe("prize_claim")
    })

    it("returns empty array on error", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: null, error: { message: "DB error" } })
      )

      const result = await listReminders("11111111-1111-1111-1111-111111111111")
      expect(result).toEqual([])
    })
  })

  describe("getReminderById", () => {
    it("returns reminder when found", async () => {
      const mockReminder = {
        id: "r1",
        hackathon_id: "h1",
        type: "prize_claim",
        scheduled_for: "2026-04-06T00:00:00Z",
        sent_at: null,
        cancelled_at: null,
        recipient_filter: "winners",
        metadata: {},
        created_at: "2026-04-03T00:00:00Z",
      }
      setMockFromImplementation(() =>
        createChainableMock({ data: mockReminder, error: null })
      )

      const result = await getReminderById("r1", "h1")
      expect(result).not.toBeNull()
      expect(result!.type).toBe("prize_claim")
    })

    it("returns null when not found", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: null, error: { message: "Not found" } })
      )

      const result = await getReminderById("r1", "h1")
      expect(result).toBeNull()
    })
  })

  describe("cancelReminder", () => {
    it("cancels a pending reminder", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: [{ id: "r1" }], error: null })
      )

      const result = await cancelReminder("r1", "h1")
      expect(result).toBe(true)
    })

    it("returns false when no rows matched", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: [], error: null })
      )

      const result = await cancelReminder("r1", "h1")
      expect(result).toBe(false)
    })

    it("returns false on error", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: null, error: { message: "DB error" } })
      )

      const result = await cancelReminder("r1", "h1")
      expect(result).toBe(false)
    })
  })

  describe("getPendingReminders", () => {
    it("returns empty array when no pending reminders", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: [], error: null })
      )

      const result = await getPendingReminders()
      expect(result).toEqual([])
    })

    it("returns pending reminders", async () => {
      const mockData = [
        {
          id: "r1",
          hackathon_id: "h1",
          type: "prize_claim",
          scheduled_for: "2026-04-01T00:00:00Z",
          sent_at: null,
          cancelled_at: null,
          recipient_filter: "winners",
          metadata: {},
          created_at: "2026-03-29T00:00:00Z",
        },
      ]
      setMockFromImplementation(() =>
        createChainableMock({ data: mockData, error: null })
      )

      const result = await getPendingReminders()
      expect(result).toHaveLength(1)
    })

    it("surfaces query errors to cron", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: null, error: { message: "database unavailable" } })
      )

      await expect(getPendingReminders()).rejects.toThrow(
        "Failed to get pending post-event reminders: database unavailable",
      )
    })
  })

  describe("markReminderSent", () => {
    it("marks a reminder as sent", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: null, error: null })
      )

      await markReminderSent("r1")
    })

    it("surfaces completion-state write failures", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: null, error: { message: "write failed" } })
      )

      await expect(markReminderSent("r1")).rejects.toThrow(
        "Failed to mark post-event reminder sent: write failed",
      )
    })
  })

  describe("delivery durability", () => {
    const reminder = {
      id: "r1",
      hackathon_id: "h1",
      type: "prize_claim",
      scheduled_for: "2026-04-01T00:00:00Z",
      sent_at: null,
      cancelled_at: null,
      recipient_filter: "winners",
      metadata: { hackathonName: "Test Hack", hackathonSlug: "test-hack" },
      created_at: "2026-03-29T00:00:00Z",
    }

    it("marks a pending reminder only after all provider sends succeed", async () => {
      const events: string[] = []
      mockSendReminderEmailsWithResult.mockImplementation(async () => {
        events.push("provider")
        return { eligible: 1, sent: 1, failed: 0 }
      })
      setMockFromImplementation((table) => {
        if (table === "post_event_reminders") {
          const chain = createChainableMock({ data: [reminder], error: null })
          chain.update = ((value: Record<string, unknown>) => {
            events.push(typeof value.sent_at === "string" ? "complete" : "other")
            return chain
          }) as typeof chain.update
          return chain
        }
        if (table === "hackathons") {
          return createChainableMock({
            data: { status: "completed", results_published_at: "2026-04-01T00:00:00Z" },
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      await expect(processAllPendingReminders()).resolves.toEqual({
        processed: 1,
        totalSent: 1,
        errors: 0,
      })
      expect(mockSendReminderEmailsWithResult).toHaveBeenCalledTimes(1)
      expect(events).toEqual(["provider", "complete"])
    })

    it("leaves a partial provider failure pending for retry", async () => {
      mockSendReminderEmailsWithResult.mockImplementation(() =>
        Promise.resolve({ eligible: 1, sent: 0, failed: 1 }),
      )
      const updates: unknown[] = []
      setMockFromImplementation((table) => {
        if (table === "post_event_reminders") {
          const chain = createChainableMock({ data: [reminder], error: null })
          chain.update = ((value: unknown) => {
            updates.push(value)
            return chain
          }) as typeof chain.update
          return chain
        }
        if (table === "hackathons") {
          return createChainableMock({
            data: { status: "completed", results_published_at: "2026-04-01T00:00:00Z" },
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      await expect(processAllPendingReminders()).resolves.toEqual({
        processed: 0,
        totalSent: 0,
        errors: 1,
      })
      expect(updates).toEqual([])
    })

    it("leaves provider-accepted work pending when completion persistence fails", async () => {
      let postEventCalls = 0
      setMockFromImplementation((table) => {
        if (table === "post_event_reminders") {
          postEventCalls++
          return createChainableMock(
            postEventCalls === 1
              ? { data: [reminder], error: null }
              : { data: null, error: { message: "write failed" } },
          )
        }
        if (table === "hackathons") {
          return createChainableMock({
            data: { status: "completed", results_published_at: "2026-04-01T00:00:00Z" },
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      await expect(processAllPendingReminders()).resolves.toEqual({
        processed: 0,
        totalSent: 0,
        errors: 1,
      })
      expect(mockSendReminderEmailsWithResult).toHaveBeenCalledTimes(1)
    })

    it("rejects a manual send that is no longer pending", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: null, error: null }),
      )

      await expect(processReminder(reminder as never)).rejects.toThrow(
        "no longer pending",
      )
    })

    it("surfaces pending-row and lifecycle validation failures", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: null, error: { message: "pending lookup failed" } })
      )
      await expect(processReminder(reminder as never)).rejects.toThrow(
        "Failed to load pending post-event reminder: pending lookup failed"
      )

      setMockFromImplementation((table) => table === "post_event_reminders"
        ? createChainableMock({ data: reminder, error: null })
        : createChainableMock({ data: null, error: { message: "lifecycle lookup failed" } }))
      await expect(processReminder(reminder as never)).rejects.toThrow(
        "Failed to validate post-event reminder: lifecycle lookup failed"
      )
    })

    it("cancels stale delivery rows before contacting the provider", async () => {
      let reminderCall = 0
      let cancelChain: ReturnType<typeof createChainableMock> | null = null
      setMockFromImplementation((table) => {
        if (table === "hackathons") {
          return createChainableMock({
            data: { status: "active", results_published_at: null },
            error: null,
          })
        }
        reminderCall++
        if (reminderCall === 1) return createChainableMock({ data: reminder, error: null })
        cancelChain = createChainableMock({ data: null, error: null })
        return cancelChain
      })

      await expect(processReminder(reminder as never)).resolves.toBe(0)
      expect(cancelChain?.update).toHaveBeenCalledWith({
        cancelled_at: expect.any(String),
      })
      expect(mockSendReminderEmailsWithResult).not.toHaveBeenCalled()
    })

    it("leaves a reactivated row pending when a worker holds an older publication", async () => {
      const olderReminder = {
        ...reminder,
        metadata: {
          ...reminder.metadata,
          publicationVersion: "2026-08-01T00:00:00.000Z",
        },
      }
      setMockFromImplementation((table) => table === "hackathons"
        ? createChainableMock({
            data: {
              status: "completed",
              results_published_at: "2026-08-20T00:00:00.000Z",
            },
            error: null,
          })
        : createChainableMock({ data: olderReminder, error: null }))

      await expect(processReminder(olderReminder as never)).resolves.toBe(0)
      expect(mockSendReminderEmailsWithResult).not.toHaveBeenCalled()
    })

    it("surfaces stale-reminder cancellation failures", async () => {
      let reminderCall = 0
      setMockFromImplementation((table) => {
        if (table === "hackathons") {
          return createChainableMock({ data: { status: "active", results_published_at: null }, error: null })
        }
        reminderCall++
        return reminderCall === 1
          ? createChainableMock({ data: reminder, error: null })
          : createChainableMock({ data: null, error: { message: "cancel failed" } })
      })

      await expect(processReminder(reminder as never)).rejects.toThrow(
        "Failed to cancel stale post-event reminder: cancel failed"
      )
    })

    it("processes organizer and survey reminder metadata with stable delivery keys", async () => {
      const variants = [
        {
          ...reminder,
          id: "organizer_1",
          type: "organizer_fulfillment",
          recipient_filter: "organizers",
        },
        {
          ...reminder,
          id: "feedback_1",
          type: "feedback_followup",
          recipient_filter: "all_participants",
          metadata: {
            hackathonName: "Test Hack",
            hackathonSlug: "test-hack",
            surveyUrl: " https://survey.example.com ",
          },
        },
      ]

      for (const variant of variants) {
        let reminderCall = 0
        setMockFromImplementation((table) => {
          if (table === "hackathons") {
            return createChainableMock({
              data: { status: "completed", results_published_at: "2026-04-01T00:00:00Z" },
              error: null,
            })
          }
          reminderCall++
          return reminderCall === 1
            ? createChainableMock({ data: variant, error: null })
            : createChainableMock({ data: null, error: null })
        })

        await expect(processReminder(variant as never)).resolves.toBe(1)
      }

      expect(mockSendReminderEmailsWithResult).toHaveBeenNthCalledWith(
        1,
        "h1",
        "organizer_fulfillment",
        "organizers",
        expect.any(Function),
        "post-event/organizer_1",
      )
      expect(mockSendReminderEmailsWithResult).toHaveBeenNthCalledWith(
        2,
        "h1",
        "feedback_followup",
        "all_participants",
        expect.any(Function),
        "post-event/feedback_1",
      )
      expect(mockGetFulfillmentSummary).toHaveBeenCalledWith("h1")
    })

    it("scopes reminder idempotency to the current results publication", async () => {
      const publicationReminder = {
        ...reminder,
        metadata: {
          ...reminder.metadata,
          publicationVersion: "2026-08-20T00:00:00.000Z",
        },
      }
      let reminderCall = 0
      setMockFromImplementation((table) => {
        if (table === "hackathons") {
          return createChainableMock({
            data: {
              status: "completed",
              results_published_at: "2026-08-20T00:00:00.000Z",
            },
            error: null,
          })
        }
        reminderCall++
        return reminderCall === 1
          ? createChainableMock({ data: publicationReminder, error: null })
          : createChainableMock({ data: null, error: null })
      })

      await expect(processReminder(publicationReminder as never)).resolves.toBe(1)
      expect(mockSendReminderEmailsWithResult).toHaveBeenCalledWith(
        "h1",
        "prize_claim",
        "winners",
        expect.any(Function),
        expect.stringMatching(/^post-event\/r1\/[a-f0-9]{24}$/),
      )
    })

    it("completes no-op organizer and survey reminders without contacting the provider", async () => {
      mockGetFulfillmentSummary.mockResolvedValue({
        assigned: 0,
        contacted: 0,
        shipped: 0,
        claimed: 3,
      })
      const variants = [
        {
          ...reminder,
          id: "organizer_done",
          type: "organizer_fulfillment",
          recipient_filter: "organizers",
        },
        {
          ...reminder,
          id: "feedback_missing_url",
          type: "feedback_followup",
          recipient_filter: "all_participants",
        },
      ]

      for (const variant of variants) {
        let reminderCall = 0
        setMockFromImplementation((table) => {
          if (table === "hackathons") {
            return createChainableMock({
              data: { status: "completed", results_published_at: "2026-04-01T00:00:00Z" },
              error: null,
            })
          }
          reminderCall++
          return reminderCall === 1
            ? createChainableMock({ data: variant, error: null })
            : createChainableMock({ data: null, error: null })
        })

        await expect(processReminder(variant as never)).resolves.toBe(0)
      }

      expect(mockSendReminderEmailsWithResult).not.toHaveBeenCalled()
    })

    it("continues a batch after one provider failure", async () => {
      const secondReminder = { ...reminder, id: "r2" }
      mockSendReminderEmailsWithResult
        .mockResolvedValueOnce({ eligible: 1, sent: 0, failed: 1 })
        .mockResolvedValueOnce({ eligible: 1, sent: 1, failed: 0 })
      setMockFromImplementation((table) => {
        if (table === "post_event_reminders") {
          return createChainableMock({ data: [reminder, secondReminder], error: null })
        }
        if (table === "hackathons") {
          return createChainableMock({
            data: { status: "completed", results_published_at: "2026-04-01T00:00:00Z" },
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      await expect(processAllPendingReminders()).resolves.toEqual({
        processed: 1,
        totalSent: 1,
        errors: 1,
      })
      expect(mockSendReminderEmailsWithResult).toHaveBeenCalledTimes(2)
    })

    it("rejects malformed metadata and unknown reminder types", async () => {
      for (const variant of [
        { ...reminder, metadata: { hackathonName: "", hackathonSlug: "test-hack" } },
        { ...reminder, type: "unknown" },
      ]) {
        setMockFromImplementation((table) => table === "hackathons"
          ? createChainableMock({
              data: { status: "completed", results_published_at: "2026-04-01T00:00:00Z" },
              error: null,
            })
          : createChainableMock({ data: variant, error: null }))

        await expect(processReminder(variant as never)).rejects.toThrow()
      }
      expect(mockSendReminderEmailsWithResult).not.toHaveBeenCalled()
    })
  })

  describe("cancelPendingPostEventReminders", () => {
    it("returns the number of pending reminders cancelled", async () => {
      const writes: ReturnType<typeof createChainableMock>[] = []
      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createChainableMock({
            data: [
              { id: "r1", metadata: { publicationVersion: "publication_1" } },
              { id: "r2", metadata: {} },
            ],
            error: null,
          })
        }
        const chain = createChainableMock({ data: { id: `r${callCount - 1}` }, error: null })
        writes.push(chain)
        return chain
      })
      await expect(cancelPendingPostEventReminders("hack_1")).resolves.toBe(2)
      expect(writes[0]?.update).toHaveBeenCalledWith(expect.objectContaining({
        metadata: expect.objectContaining({
          cancellationReason: "results_unpublished",
          cancelledPublicationVersion: "publication_1",
        }),
      }))
    })

    it("surfaces cleanup failures", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: null, error: { message: "cleanup failed" } })
      )
      await expect(cancelPendingPostEventReminders("hack_1")).rejects.toThrow(
        "Failed to cancel post-event reminders: cleanup failed"
      )
    })
  })
})
