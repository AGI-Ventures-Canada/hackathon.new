import { describe, it, expect, beforeEach, mock } from "bun:test"
import type { JudgeInvitation } from "@/lib/db/hackathon-types"
import {
  createChainableMock,
  resetSupabaseMocks,
  setMockFromImplementation,
  mockMultiTableQuery,
  mockTableQuery,
  mockCount,
  mockError,
  mockClerkClient,
} from "../lib/supabase-mock"

const mockSendJudgeInvitationEmail = mock(() => Promise.resolve({ success: true }))
const mockSendJudgeAddedNotification = mock(() => Promise.resolve({ success: true }))
const mockScheduleReminders = mock(() => Promise.resolve(1))
const mockCancelRemindersForEntity = mock(() => Promise.resolve())

mock.module("@/lib/email/judge-invitations", () => ({
  sendJudgeInvitationEmail: mockSendJudgeInvitationEmail,
  sendJudgeAddedNotification: mockSendJudgeAddedNotification,
}))

mock.module("@/lib/services/smart-reminders", () => ({
  scheduleReminders: mockScheduleReminders,
  cancelRemindersForEntity: mockCancelRemindersForEntity,
}))

const mockWithDeliveryLease = mock(async (
  _key: string,
  work: () => Promise<unknown>,
) => ({ acquired: true as const, value: await work() }))
mock.module("@/lib/services/delivery-lease", () => ({
  withDeliveryLease: mockWithDeliveryLease,
}))

const {
  createJudgeInvitation,
  getJudgeInvitationByToken,
  acceptJudgeInvitation,
  cancelJudgeInvitation,
  declineJudgeInvitation,
  listJudgeInvitations,
  sendPendingJudgeInvitationEmails,
  retryPendingJudgeInvitationEmails,
  createJudgePendingNotification,
  hasPendingJudgeInvitation,
  hasPendingJudgeEntry,
  countPendingJudgeInvitations,
  remindJudgeInvitation,
  releaseJudgeInvitationReminderClaim,
  markJudgeInvitationEmailed,
} = await import("@/lib/services/judge-invitations")

const mockInvitation: JudgeInvitation = {
  id: "inv1",
  hackathon_id: "h1",
  email: "judge@example.com",
  token: "test-token-123",
  invited_by_clerk_user_id: "organizer_123",
  status: "pending",
  expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  accepted_by_clerk_user_id: null,
  emailed_at: null,
  reminded_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
}

describe("Judge Invitations Service", () => {
  beforeEach(() => {
    resetSupabaseMocks()
    mockCancelRemindersForEntity.mockClear()
    mockCancelRemindersForEntity.mockResolvedValue()
    mockWithDeliveryLease.mockClear()
    mockWithDeliveryLease.mockImplementation(async (_key, work) => ({
      acquired: true as const,
      value: await work(),
    }))
    mockClerkClient.mockReset()
    mockClerkClient.mockResolvedValue({
      users: {
        getUserList: mock(() => Promise.resolve({ data: [] })),
      },
    } as unknown)
  })

  describe("createJudgeInvitation", () => {
    it("rejects missing and completed events before checking invitations", async () => {
      for (const hackathon of [
        null,
        {
          status: "completed",
          starts_at: "2026-01-01T00:00:00Z",
          ends_at: "2026-01-02T00:00:00Z",
        },
      ]) {
        setMockFromImplementation((table) => table === "hackathons"
          ? createChainableMock({ data: hackathon, error: null })
          : createChainableMock({ data: null, error: null }))
        const result = await createJudgeInvitation({
          hackathonId: "h1",
          email: "judge@example.com",
          invitedByClerkUserId: "organizer_123",
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.code).toBe(hackathon ? "hackathon_ended" : "hackathon_not_found")
        }
      }
    })

    it("creates invitation successfully when email is not already invited", async () => {
      let invitationCalls = 0
      setMockFromImplementation((table) => {
        if (table === "hackathons") {
          return createChainableMock({ data: { status: "published", starts_at: null, ends_at: null }, error: null })
        }
        invitationCalls++
        if (invitationCalls === 1) {
          return createChainableMock({ data: null, error: null })
        }
        return createChainableMock({ data: mockInvitation, error: null })
      })

      const result = await createJudgeInvitation({
        hackathonId: "h1",
        email: "judge@example.com",
        invitedByClerkUserId: "organizer_123",
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.invitation.email).toBe("judge@example.com")
      }
    })

    it("returns already_invited error when pending invitation exists for email", async () => {
      setMockFromImplementation((table) => table === "hackathons"
        ? createChainableMock({ data: { status: "published", starts_at: null, ends_at: null }, error: null })
        : createChainableMock({ data: { id: "existing" }, error: null }),
      )

      const result = await createJudgeInvitation({
        hackathonId: "h1",
        email: "judge@example.com",
        invitedByClerkUserId: "organizer_123",
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.code).toBe("already_invited")
      }
    })

    it("expires an old pending invitation before creating a replacement", async () => {
      let invitationCalls = 0
      let expiredUpdate: Record<string, unknown> | null = null
      setMockFromImplementation((table) => {
        if (table === "hackathons") {
          return createChainableMock({
            data: { status: "published", starts_at: null, ends_at: null },
            error: null,
          })
        }
        invitationCalls++
        if (invitationCalls === 1) {
          return createChainableMock({
            data: {
              id: "expired_invite",
              expires_at: new Date(Date.now() - 60_000).toISOString(),
            },
            error: null,
          })
        }
        if (invitationCalls === 2) {
          const chain = createChainableMock({ data: null, error: null })
          const originalUpdate = chain.update
          chain.update = mock((value: Record<string, unknown>) => {
            expiredUpdate = value
            return originalUpdate(value)
          }) as typeof chain.update
          return chain
        }
        return createChainableMock({ data: mockInvitation, error: null })
      })

      const result = await createJudgeInvitation({
        hackathonId: "h1",
        email: "judge@example.com",
        invitedByClerkUserId: "organizer_123",
      })

      expect(result.success).toBe(true)
      expect(expiredUpdate).toEqual(expect.objectContaining({ status: "expired" }))
    })

    it("fails closed when pending invitations cannot be checked", async () => {
      setMockFromImplementation((table) => table === "hackathons"
        ? createChainableMock({
            data: { status: "published", starts_at: null, ends_at: null },
            error: null,
          })
        : createChainableMock({
            data: null,
            error: { message: "database unavailable" },
          }))

      await expect(createJudgeInvitation({
        hackathonId: "h1",
        email: "judge@example.com",
        invitedByClerkUserId: "organizer_123",
      })).resolves.toEqual({
        success: false,
        error: "Failed to check existing invitations",
        code: "lookup_failed",
      })
    })

    it("trims and lowercases email before storing", async () => {
      let invitationCalls = 0
      let insertedEmail: string | null = null
      setMockFromImplementation((table) => {
        if (table === "hackathons") {
          return createChainableMock({ data: { status: "published", starts_at: null, ends_at: null }, error: null })
        }
        invitationCalls++
        if (invitationCalls === 1) {
          return createChainableMock({ data: null, error: null })
        }
        const chain = createChainableMock({
          data: { ...mockInvitation, email: "judge@example.com" },
          error: null,
        })
        const originalInsert = chain.insert
        chain.insert = mock((value: { email: string }) => {
          insertedEmail = value.email
          return originalInsert(value)
        }) as typeof chain.insert
        return chain
      })

      const result = await createJudgeInvitation({
        hackathonId: "h1",
        email: "  JUDGE@EXAMPLE.COM  ",
        invitedByClerkUserId: "organizer_123",
      })

      expect(result.success).toBe(true)
      expect(insertedEmail).toBe("judge@example.com")
    })

    it("returns insert_failed error when database insert fails", async () => {
      let invitationCalls = 0
      setMockFromImplementation((table) => {
        if (table === "hackathons") {
          return createChainableMock({ data: { status: "published", starts_at: null, ends_at: null }, error: null })
        }
        invitationCalls++
        if (invitationCalls === 1) {
          return createChainableMock({ data: null, error: null })
        }
        return createChainableMock({
          data: null,
          error: { message: "Insert failed" },
        })
      })

      const result = await createJudgeInvitation({
        hackathonId: "h1",
        email: "judge@example.com",
        invitedByClerkUserId: "organizer_123",
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.code).toBe("insert_failed")
      }
    })
  })

  describe("getJudgeInvitationByToken", () => {
    it("returns invitation with hackathon details", async () => {
      const chain = createChainableMock({
        data: {
          ...mockInvitation,
          hackathons: { name: "Test Hackathon", slug: "test-hackathon", status: "active" },
        },
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await getJudgeInvitationByToken("test-token-123")

      expect(result).not.toBeNull()
      expect(result?.hackathon.name).toBe("Test Hackathon")
      expect(result?.hackathon.slug).toBe("test-hackathon")
    })

    it("returns null when token does not exist in database", async () => {
      const chain = createChainableMock({
        data: null,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await getJudgeInvitationByToken("invalid-token")

      expect(result).toBeNull()
    })

    it("returns null when database query fails", async () => {
      const chain = createChainableMock({
        data: null,
        error: { message: "DB error" },
      })
      setMockFromImplementation(() => chain)

      const result = await getJudgeInvitationByToken("test-token")

      expect(result).toBeNull()
    })
  })

  describe("cancelJudgeInvitation", () => {
    it("cancels pending invitation and updates status to cancelled", async () => {
      let fetchedInvitation = false
      setMockFromImplementation(() => {
        if (!fetchedInvitation) {
          fetchedInvitation = true
          return createChainableMock({
            data: { id: "inv1", status: "pending" },
            error: null,
          })
        }
        return createChainableMock({ data: { id: "inv1" }, error: null })
      })

      const result = await cancelJudgeInvitation("inv1", "h1")

      expect(result.success).toBe(true)
      expect(mockCancelRemindersForEntity).toHaveBeenCalledWith("judge_invitation", "inv1")
    })

    it("returns error when invitation does not exist", async () => {
      const chain = createChainableMock({
        data: null,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await cancelJudgeInvitation("inv1", "h1")

      expect(result.success).toBe(false)
      expect(result.error).toBe("Invitation not found or not pending")
    })

    it("returns error when invitation status is already accepted", async () => {
      const chain = createChainableMock({
        data: { id: "inv1", status: "accepted" },
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await cancelJudgeInvitation("inv1", "h1")

      expect(result.success).toBe(false)
    })

    it("returns error when database update fails", async () => {
      let fetchedInvitation = false
      setMockFromImplementation(() => {
        if (!fetchedInvitation) {
          fetchedInvitation = true
          return createChainableMock({
            data: { id: "inv1", status: "pending" },
            error: null,
          })
        }
        return createChainableMock({
          data: null,
          error: { message: "Update failed" },
        })
      })

      const result = await cancelJudgeInvitation("inv1", "h1")

      expect(result.success).toBe(false)
    })
  })

  describe("declineJudgeInvitation", () => {
    it("records a recipient decline separately from organizer cancellation", async () => {
      const chain = createChainableMock({ data: { id: "inv1" }, error: null })
      setMockFromImplementation(() => chain)

      await expect(declineJudgeInvitation("inv1", "h1")).resolves.toEqual({ success: true })
      expect(chain.update).toHaveBeenCalledWith({
        status: "declined",
        updated_at: expect.any(String),
      })
      expect(chain.eq).toHaveBeenCalledWith("hackathon_id", "h1")
      expect(chain.eq).toHaveBeenCalledWith("status", "pending")
      expect(mockCancelRemindersForEntity).toHaveBeenCalledWith("judge_invitation", "inv1")
    })

    it("does not report success when a pending invitation was not claimed", async () => {
      setMockFromImplementation(() => createChainableMock({ data: null, error: null }))

      await expect(declineJudgeInvitation("inv1", "h1")).resolves.toEqual({
        success: false,
        error: "Invitation not found or not pending",
      })
    })
  })

  describe("markJudgeInvitationEmailed", () => {
    it("records delivery after a successful send", async () => {
      const chain = createChainableMock({ data: null, error: null })
      setMockFromImplementation(() => chain)

      await markJudgeInvitationEmailed("inv1")

      expect(chain.update).toHaveBeenCalledWith({ emailed_at: expect.any(String) })
      expect(chain.eq).toHaveBeenCalledWith("id", "inv1")
    })

    it("surfaces a delivery-state write failure", async () => {
      const chain = createChainableMock({
        data: null,
        error: { message: "database unavailable" },
      })
      setMockFromImplementation(() => chain)

      await expect(markJudgeInvitationEmailed("inv1")).rejects.toThrow(
        "Failed to mark judge invitation emailed: database unavailable",
      )
    })
  })

  describe("sendPendingJudgeInvitationEmails", () => {
    const setLiveEventAndInvitations = (
      invitationChain: ReturnType<typeof createChainableMock>,
    ) => {
      setMockFromImplementation((table) =>
        table === "hackathons"
          ? createChainableMock({
              data: { status: "published", starts_at: null, ends_at: null },
              error: null,
            })
          : invitationChain,
      )
    }

    beforeEach(() => {
      mockSendJudgeInvitationEmail.mockClear()
      mockSendJudgeInvitationEmail.mockResolvedValue({ success: true })
      mockScheduleReminders.mockClear()
      mockScheduleReminders.mockResolvedValue(1)
    })

    it("sends emails for all pending invitations", async () => {
      const pendingInvitations = [
        { ...mockInvitation, id: "inv1", email: "judge1@example.com", token: "token1" },
        { ...mockInvitation, id: "inv2", email: "judge2@example.com", token: "token2" },
      ]
      const chain = createChainableMock({
        data: pendingInvitations,
        error: null,
      })
      setLiveEventAndInvitations(chain)

      const result = await sendPendingJudgeInvitationEmails("h1", "Test Hackathon", "Organizer Name")

      expect(result.sent).toBe(2)
      expect(mockSendJudgeInvitationEmail).toHaveBeenCalledTimes(2)
      expect(mockSendJudgeInvitationEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "judge1@example.com",
          hackathonName: "Test Hackathon",
          inviterName: "Organizer Name",
          inviteToken: "token1",
        })
      )
      expect(mockScheduleReminders).toHaveBeenCalledTimes(2)
      expect(mockScheduleReminders).toHaveBeenCalledWith(
        "judge_invitation",
        "inv1",
        "h1",
        "invitation_reminder",
        new Date(mockInvitation.created_at),
        new Date(mockInvitation.expires_at),
        expect.objectContaining({
          email: "judge1@example.com",
          hackathonName: "Test Hackathon",
          inviterName: "Organizer Name",
          inviteToken: "token1",
        }),
      )
    })

    it("returns sent: 0 when no pending invitations exist", async () => {
      const chain = createChainableMock({
        data: [],
        error: null,
      })
      setLiveEventAndInvitations(chain)

      const result = await sendPendingJudgeInvitationEmails("h1", "Test Hackathon", "Organizer")

      expect(result.sent).toBe(0)
      expect(mockSendJudgeInvitationEmail).not.toHaveBeenCalled()
      expect(mockScheduleReminders).not.toHaveBeenCalled()
    })

    it("counts only successfully sent emails", async () => {
      const pendingInvitations = [
        { ...mockInvitation, id: "inv1", email: "judge1@example.com", token: "token1" },
        { ...mockInvitation, id: "inv2", email: "judge2@example.com", token: "token2" },
      ]
      const chain = createChainableMock({
        data: pendingInvitations,
        error: null,
      })
      setLiveEventAndInvitations(chain)

      mockSendJudgeInvitationEmail
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ success: false })

      const result = await sendPendingJudgeInvitationEmails("h1", "Test Hackathon", "Organizer")

      expect(result.sent).toBe(1)
      expect(mockSendJudgeInvitationEmail).toHaveBeenCalledTimes(2)
      expect(mockScheduleReminders).toHaveBeenCalledTimes(1)
      expect(mockScheduleReminders).toHaveBeenCalledWith(
        "judge_invitation",
        "inv1",
        "h1",
        "invitation_reminder",
        new Date(mockInvitation.created_at),
        new Date(mockInvitation.expires_at),
        expect.objectContaining({ email: "judge1@example.com" }),
      )
      expect(chain.update).toHaveBeenCalledTimes(1)
      expect(chain.update).toHaveBeenCalledWith({ emailed_at: expect.any(String) })
      expect(chain.in).not.toHaveBeenCalled()
    })

    it("keeps a delivered invitation checkpoint when reminder scheduling rejects", async () => {
      const pendingInvitations = [
        { ...mockInvitation, id: "inv1", email: "judge1@example.com", token: "token1" },
      ]
      const chain = createChainableMock({ data: pendingInvitations, error: null })
      setLiveEventAndInvitations(chain)
      mockScheduleReminders.mockRejectedValueOnce(new Error("reminder storage unavailable"))

      const result = await sendPendingJudgeInvitationEmails("h1", "Test Hackathon", "Organizer")

      expect(result).toEqual({
        sent: 1,
        total: 1,
        failedEmails: [],
      })
      expect(mockScheduleReminders).toHaveBeenCalledTimes(1)
      expect(chain.update).toHaveBeenCalledWith({ emailed_at: expect.any(String) })
    })

    it("returns sent: 0 when DB returns empty result (emailed_at filter applied at query level)", async () => {
      const chain = createChainableMock({
        data: [],
        error: null,
      })
      setLiveEventAndInvitations(chain)

      const result = await sendPendingJudgeInvitationEmails("h1", "Test Hackathon", "Organizer")

      expect(result.sent).toBe(0)
      expect(mockSendJudgeInvitationEmail).not.toHaveBeenCalled()
      expect(mockScheduleReminders).not.toHaveBeenCalled()
    })

    it("does not send after the event has effectively ended", async () => {
      const pendingInvitations = [mockInvitation]
      setMockFromImplementation((table) =>
        table === "hackathons"
          ? createChainableMock({
              data: {
                status: "published",
                starts_at: "2026-01-01T00:00:00.000Z",
                ends_at: "2026-01-02T00:00:00.000Z",
              },
              error: null,
            })
          : createChainableMock({ data: pendingInvitations, error: null }),
      )

      await expect(
        sendPendingJudgeInvitationEmails("h1", "Test Hackathon", "Organizer"),
      ).resolves.toEqual({ sent: 0, total: 0, failedEmails: [] })
      expect(mockSendJudgeInvitationEmail).not.toHaveBeenCalled()
    })

    it("surfaces event-state query failures", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: null, error: { message: "database unavailable" } }),
      )

      await expect(
        sendPendingJudgeInvitationEmails("h1", "Test Hackathon", "Organizer"),
      ).rejects.toThrow(
        "Failed to validate judge invitation delivery: database unavailable",
      )
    })

    it("surfaces pending invitation query failures", async () => {
      setMockFromImplementation((table) => table === "hackathons"
        ? createChainableMock({
            data: { status: "active", starts_at: null, ends_at: null },
            error: null,
          })
        : createChainableMock({ data: null, error: { message: "pending lookup failed" } }))

      await expect(
        sendPendingJudgeInvitationEmails("h1", "Test Hackathon", "Organizer"),
      ).rejects.toThrow("Failed to load pending judge invitations: pending lookup failed")
      expect(mockSendJudgeInvitationEmail).not.toHaveBeenCalled()
    })

    it("cancels a queued invitation when the recipient is already a judge", async () => {
      const invitationChain = createChainableMock({ data: [mockInvitation], error: null })
      let cancelledUpdate: Record<string, unknown> | null = null
      const originalUpdate = invitationChain.update
      invitationChain.update = mock((value: Record<string, unknown>) => {
        cancelledUpdate = value
        return originalUpdate(value)
      }) as typeof invitationChain.update
      mockClerkClient.mockResolvedValueOnce({
        users: {
          getUserList: mock(() => Promise.resolve({ data: [{ id: "judge_1" }] })),
        },
      } as unknown)
      setMockFromImplementation((table) => {
        if (table === "hackathons") {
          return createChainableMock({
            data: { status: "published", starts_at: null, ends_at: null },
            error: null,
          })
        }
        if (table === "hackathon_participants") {
          return createChainableMock({ data: { role: "judge" }, error: null })
        }
        return invitationChain
      })

      await expect(
        sendPendingJudgeInvitationEmails("h1", "Test Hackathon", "Organizer"),
      ).resolves.toEqual({ sent: 0, total: 1, failedEmails: [] })
      expect(cancelledUpdate).toEqual(expect.objectContaining({ status: "cancelled" }))
      expect(mockSendJudgeInvitationEmail).not.toHaveBeenCalled()
    })
  })

  describe("retryPendingJudgeInvitationEmails", () => {
    beforeEach(() => {
      mockSendJudgeInvitationEmail.mockClear()
      mockSendJudgeInvitationEmail.mockResolvedValue({ success: true })
      mockScheduleReminders.mockClear()
      mockScheduleReminders.mockResolvedValue(1)
    })

    it("retries bounded pending rows for live events", async () => {
      let invitationCalls = 0
      setMockFromImplementation((table) => {
        if (table === "hackathons") {
          return createChainableMock({
            data: { status: "published", starts_at: null, ends_at: null },
            error: null,
          })
        }
        if (table !== "judge_invitations") {
          return createChainableMock({ data: null, error: null })
        }
        invitationCalls++
        if (invitationCalls === 1) {
          return createChainableMock({
            data: [{
              hackathon_id: "h1",
              hackathons: {
                name: "Test Hackathon",
                slug: "test-hackathon",
                status: "published",
                starts_at: null,
                ends_at: null,
              },
            }],
            error: null,
          })
        }
        if (invitationCalls === 2) {
          return createChainableMock({ data: [mockInvitation], error: null })
        }
        if (invitationCalls === 3) {
          return createChainableMock({ data: mockInvitation, error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      await expect(retryPendingJudgeInvitationEmails(10)).resolves.toEqual({
        events: 1,
        sent: 1,
        failed: 0,
      })
      expect(mockSendJudgeInvitationEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          deliveryId: "inv1",
          inviterName: "The organizer",
        }),
      )
    })

    it("does not retry queued draft invitations", async () => {
      setMockFromImplementation(() =>
        createChainableMock({
          data: [{
            hackathon_id: "h1",
            hackathons: {
              name: "Test Hackathon",
              slug: "test-hackathon",
              status: "draft",
              starts_at: null,
              ends_at: null,
            },
          }],
          error: null,
        })
      )

      await expect(retryPendingJudgeInvitationEmails()).resolves.toEqual({
        events: 0,
        sent: 0,
        failed: 0,
      })
      expect(mockSendJudgeInvitationEmail).not.toHaveBeenCalled()
    })

    it("surfaces retry queue failures", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: null, error: { message: "retry lookup failed" } })
      )
      await expect(retryPendingJudgeInvitationEmails()).rejects.toThrow(
        "Failed to load retryable judge invitations: retry lookup failed"
      )
    })
  })

  describe("createJudgePendingNotification", () => {
    it("upserts a pending notification record", async () => {
      const chain = createChainableMock({ data: null, error: null })
      setMockFromImplementation(() => chain)

      await createJudgePendingNotification("h1", "participant1", "judge@example.com", "Organizer Name")

      expect(chain.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          hackathon_id: "h1",
          participant_id: "participant1",
          email: "judge@example.com",
          added_by_name: "Organizer Name",
          sent_at: null,
        }),
        expect.objectContaining({ onConflict: "hackathon_id,participant_id" })
      )
    })

    it("normalizes email to lowercase", async () => {
      const chain = createChainableMock({ data: null, error: null })
      setMockFromImplementation(() => chain)

      await createJudgePendingNotification("h1", "participant1", "JUDGE@EXAMPLE.COM", "Organizer")

      expect(chain.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ email: "judge@example.com" }),
        expect.anything()
      )
    })

    it("throws when upsert fails", async () => {
      const chain = createChainableMock({
        data: null,
        error: { message: "unique constraint violation", code: "23505" },
      })
      setMockFromImplementation(() => chain)

      await expect(
        createJudgePendingNotification("h1", "participant1", "judge@example.com", "Organizer")
      ).rejects.toThrow("Failed to create judge pending notification: unique constraint violation")
    })
  })

  describe("hasPendingJudgeInvitation", () => {
    it("returns true when a pending invitation exists", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: { id: "inv1" }, error: null })
      )

      const result = await hasPendingJudgeInvitation("h1", "judge@example.com")

      expect(result).toBe(true)
    })

    it("returns false when no pending invitation exists", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: null, error: null })
      )

      const result = await hasPendingJudgeInvitation("h1", "judge@example.com")

      expect(result).toBe(false)
    })

    it("normalizes email to lowercase", async () => {
      const chain = createChainableMock({ data: null, error: null })
      setMockFromImplementation(() => chain)

      await hasPendingJudgeInvitation("h1", "JUDGE@EXAMPLE.COM")

      expect(chain.eq).toHaveBeenCalledWith("email", "judge@example.com")
    })

    it("throws on DB error", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: null, error: { message: "connection failed" } })
      )

      await expect(hasPendingJudgeInvitation("h1", "judge@example.com")).rejects.toThrow(
        "Failed to check pending invitation: connection failed"
      )
    })
  })

  describe("hasPendingJudgeEntry", () => {
    it("returns true when a pending invitation exists", async () => {
      mockMultiTableQuery({
        judge_invitations: { data: { id: "inv1" }, error: null },
        judge_pending_notifications: { data: null, error: null },
      })

      const result = await hasPendingJudgeEntry("h1", "judge@example.com")
      expect(result).toBe(true)
    })

    it("returns true when a pending notification exists", async () => {
      mockMultiTableQuery({
        judge_invitations: { data: null, error: null },
        judge_pending_notifications: { data: { id: "notif1" }, error: null },
      })

      const result = await hasPendingJudgeEntry("h1", "judge@example.com")
      expect(result).toBe(true)
    })

    it("returns true when both exist", async () => {
      mockMultiTableQuery({
        judge_invitations: { data: { id: "inv1" }, error: null },
        judge_pending_notifications: { data: { id: "notif1" }, error: null },
      })

      const result = await hasPendingJudgeEntry("h1", "judge@example.com")
      expect(result).toBe(true)
    })

    it("returns false when neither exists", async () => {
      mockMultiTableQuery({
        judge_invitations: { data: null, error: null },
        judge_pending_notifications: { data: null, error: null },
      })

      const result = await hasPendingJudgeEntry("h1", "judge@example.com")
      expect(result).toBe(false)
    })

    it("throws on invitation DB error", async () => {
      mockMultiTableQuery({
        judge_invitations: { data: null, error: { message: "connection failed" } },
        judge_pending_notifications: { data: null, error: null },
      })

      await expect(hasPendingJudgeEntry("h1", "judge@example.com")).rejects.toThrow(
        "Failed to check pending invitation: connection failed"
      )
    })

    it("throws on notification DB error", async () => {
      mockMultiTableQuery({
        judge_invitations: { data: null, error: null },
        judge_pending_notifications: { data: null, error: { message: "connection failed" } },
      })

      await expect(hasPendingJudgeEntry("h1", "judge@example.com")).rejects.toThrow(
        "Failed to check pending notification: connection failed"
      )
    })
  })

  describe("listJudgeInvitations", () => {
    it("returns all invitations for hackathon", async () => {
      const chain = createChainableMock({
        data: [mockInvitation, { ...mockInvitation, id: "inv2", email: "judge2@example.com" }],
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await listJudgeInvitations("h1")

      expect(result).toHaveLength(2)
    })

    it("filters by status when provided", async () => {
      const chain = createChainableMock({
        data: [mockInvitation],
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await listJudgeInvitations("h1", "pending")

      expect(result).toHaveLength(1)
      expect(result[0].status).toBe("pending")
    })

    it("returns empty array when database query fails", async () => {
      const chain = createChainableMock({
        data: null,
        error: { message: "DB error" },
      })
      setMockFromImplementation(() => chain)

      const result = await listJudgeInvitations("h1")

      expect(result).toEqual([])
    })

    it("returns empty array when no invitations exist", async () => {
      const chain = createChainableMock({
        data: [],
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await listJudgeInvitations("h1")

      expect(result).toEqual([])
    })
  })

  describe("acceptJudgeInvitation", () => {
    it("converts a team member who accepts a judge invitation", async () => {
      setMockFromImplementation((table) => {
        if (table === "judge_invitations") {
          return createChainableMock({
            data: {
              ...mockInvitation,
              hackathons: { name: "Test Hack", slug: "test-hack", status: "active" },
            },
            error: null,
          })
        }
        if (table === "hackathon_participants") {
          return createChainableMock({
            data: { id: "p1", role: "participant", team_id: "team_1" },
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await acceptJudgeInvitation("test-token-123", "user_123", "judge@example.com")

      expect(result.success).toBe(true)
    })
  })

  describe("countPendingJudgeInvitations", () => {
    it("returns the count of pending invitations", async () => {
      mockTableQuery("judge_invitations", mockCount(3))

      const result = await countPendingJudgeInvitations("h1")

      expect(result).toBe(3)
    })

    it("returns 0 when no pending invitations exist", async () => {
      mockTableQuery("judge_invitations", mockCount(0))

      const result = await countPendingJudgeInvitations("h1")

      expect(result).toBe(0)
    })

    it("returns 0 when database query fails", async () => {
      mockTableQuery("judge_invitations", mockError("DB error"))

      const result = await countPendingJudgeInvitations("h1")

      expect(result).toBe(0)
    })

    it("returns 0 when count is null", async () => {
      mockTableQuery("judge_invitations", { data: null, error: null, count: null })

      const result = await countPendingJudgeInvitations("h1")

      expect(result).toBe(0)
    })
  })

  describe("createJudgeInvitation - role conflict", () => {
    it("allows inviting an attendee who is already on a team", async () => {
      const { mockClerkClient } = await import("../lib/supabase-mock")
      mockClerkClient.mockResolvedValueOnce({
        organizations: {
          getOrganization: mock(() => Promise.resolve({ name: "Test Org" })),
        },
        users: {
          getUserList: mock(() => Promise.resolve({ data: [{ id: "user_on_team" }] })),
        },
      } as unknown)

      let invitationCalls = 0
      setMockFromImplementation((table) => {
        if (table === "judge_invitations") {
          invitationCalls++
          return createChainableMock({
            data: invitationCalls === 1 ? null : mockInvitation,
            error: null,
          })
        }
        if (table === "hackathons") {
          return createChainableMock({ data: { status: "published", starts_at: null, ends_at: null }, error: null })
        }
        if (table === "hackathon_participants") {
          return createChainableMock({
            data: { id: "p1", role: "participant", team_id: "team_1" },
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await createJudgeInvitation({
        hackathonId: "h1",
        email: "teamplayer@example.com",
        invitedByClerkUserId: "organizer_123",
      })

      expect(result.success).toBe(true)
    })
  })

  describe("remindJudgeInvitation", () => {
    it("succeeds for a pending invitation with no prior reminder", async () => {
      let invitationCalls = 0
      setMockFromImplementation((table) => {
        if (table === "hackathons") {
          return createChainableMock({ data: { status: "active", starts_at: null, ends_at: null }, error: null })
        }
        invitationCalls++
        if (invitationCalls === 1) {
          return createChainableMock({ data: mockInvitation, error: null })
        }
        return createChainableMock({
          data: { ...mockInvitation, reminded_at: new Date().toISOString() },
          error: null,
        })
      })

      const result = await remindJudgeInvitation("11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222")

      expect(result.success).toBe(true)
    })

    it("returns not_found when invitation does not exist", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: null, error: { message: "Not found" } })
      )

      const result = await remindJudgeInvitation("33333333-3333-3333-3333-333333333333", "22222222-2222-2222-2222-222222222222")

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.code).toBe("not_found")
      }
    })

    it("returns not_pending when invitation is not pending", async () => {
      setMockFromImplementation(() =>
        createChainableMock({
          data: { ...mockInvitation, status: "accepted" },
          error: null,
        })
      )

      const result = await remindJudgeInvitation("11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222")

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.code).toBe("not_pending")
      }
    })

    it("returns expired when invitation has expired", async () => {
      setMockFromImplementation(() =>
        createChainableMock({
          data: {
            ...mockInvitation,
            expires_at: new Date(Date.now() - 1000).toISOString(),
          },
          error: null,
        })
      )

      const result = await remindJudgeInvitation("11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222")

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.code).toBe("expired")
      }
    })

    it("rejects reminders for missing, draft, and ended events", async () => {
      for (const hackathon of [
        null,
        { status: "draft", starts_at: null, ends_at: null },
        {
          status: "completed",
          starts_at: "2026-01-01T00:00:00Z",
          ends_at: "2026-01-02T00:00:00Z",
        },
      ]) {
        setMockFromImplementation((table) => table === "hackathons"
          ? createChainableMock({ data: hackathon, error: null })
          : createChainableMock({ data: mockInvitation, error: null }))
        const result = await remindJudgeInvitation(
          "11111111-1111-1111-1111-111111111111",
          "22222222-2222-2222-2222-222222222222",
        )
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.code).toBe(
            hackathon === null
              ? "hackathon_not_found"
              : hackathon.status === "draft"
                ? "hackathon_draft"
                : "hackathon_ended",
          )
        }
      }
    })

    it("rejects repeat reminders after the one-time claim", async () => {
      let invitationCalls = 0
      setMockFromImplementation((table) => {
        if (table === "hackathons") {
          return createChainableMock({ data: { status: "active", starts_at: null, ends_at: null }, error: null })
        }
        invitationCalls++
        return createChainableMock({
          data: invitationCalls === 1
            ? { ...mockInvitation, reminded_at: new Date().toISOString() }
            : null,
          error: null,
        })
      })

      const result = await remindJudgeInvitation("11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222")

      expect(result).toMatchObject({ success: false, code: "already_reminded" })
    })
  })

  describe("releaseJudgeInvitationReminderClaim", () => {
    it("releases only the matching pending reminder claim", async () => {
      const chain = createChainableMock({ data: null, error: null })
      setMockFromImplementation(() => chain)
      await releaseJudgeInvitationReminderClaim("inv_1", "2026-08-01T00:00:00Z")
      expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({
        reminded_at: null,
        updated_at: expect.any(String),
      }))
      expect(chain.eq).toHaveBeenCalledWith("reminded_at", "2026-08-01T00:00:00Z")
    })

    it("surfaces claim release failures", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: null, error: { message: "release failed" } })
      )
      await expect(
        releaseJudgeInvitationReminderClaim("inv_1", "2026-08-01T00:00:00Z"),
      ).rejects.toThrow("Failed to release judge invitation reminder claim: release failed")
    })
  })
})
