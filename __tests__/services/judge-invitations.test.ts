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
} from "../lib/supabase-mock"

const mockSendJudgeInvitationEmail = mock(() => Promise.resolve({ success: true }))
const mockSendJudgeAddedNotification = mock(() => Promise.resolve({ success: true }))

mock.module("@/lib/email/judge-invitations", () => ({
  sendJudgeInvitationEmail: mockSendJudgeInvitationEmail,
  sendJudgeAddedNotification: mockSendJudgeAddedNotification,
}))

const {
  createJudgeInvitation,
  getJudgeInvitationByToken,
  acceptJudgeInvitation,
  cancelJudgeInvitation,
  listJudgeInvitations,
  sendPendingJudgeInvitationEmails,
  createJudgePendingNotification,
  hasPendingJudgeInvitation,
  hasPendingJudgeEntry,
  countPendingJudgeInvitations,
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
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
}

describe("Judge Invitations Service", () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  describe("createJudgeInvitation", () => {
    it("creates invitation successfully when email is not already invited", async () => {
      let checkedExisting = false
      setMockFromImplementation(() => {
        if (!checkedExisting) {
          checkedExisting = true
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
      const chain = createChainableMock({
        data: { id: "existing" },
        error: null,
      })
      setMockFromImplementation(() => chain)

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

    it("normalizes email to lowercase before storing", async () => {
      let checkedExisting = false
      setMockFromImplementation(() => {
        if (!checkedExisting) {
          checkedExisting = true
          return createChainableMock({ data: null, error: null })
        }
        return createChainableMock({
          data: { ...mockInvitation, email: "judge@example.com" },
          error: null,
        })
      })

      const result = await createJudgeInvitation({
        hackathonId: "h1",
        email: "JUDGE@EXAMPLE.COM",
        invitedByClerkUserId: "organizer_123",
      })

      expect(result.success).toBe(true)
    })

    it("returns insert_failed error when database insert fails", async () => {
      let checkedExisting = false
      setMockFromImplementation(() => {
        if (!checkedExisting) {
          checkedExisting = true
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
        return createChainableMock({ data: null, error: null })
      })

      const result = await cancelJudgeInvitation("inv1", "h1")

      expect(result.success).toBe(true)
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

  describe("sendPendingJudgeInvitationEmails", () => {
    beforeEach(() => {
      mockSendJudgeInvitationEmail.mockClear()
      mockSendJudgeInvitationEmail.mockResolvedValue({ success: true })
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
      setMockFromImplementation(() => chain)

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
    })

    it("returns sent: 0 when no pending invitations exist", async () => {
      const chain = createChainableMock({
        data: [],
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await sendPendingJudgeInvitationEmails("h1", "Test Hackathon", "Organizer")

      expect(result.sent).toBe(0)
      expect(mockSendJudgeInvitationEmail).not.toHaveBeenCalled()
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
      setMockFromImplementation(() => chain)

      mockSendJudgeInvitationEmail
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ success: false })

      const result = await sendPendingJudgeInvitationEmails("h1", "Test Hackathon", "Organizer")

      expect(result.sent).toBe(1)
      expect(mockSendJudgeInvitationEmail).toHaveBeenCalledTimes(2)
    })

    it("returns sent: 0 when DB returns empty result (emailed_at filter applied at query level)", async () => {
      const chain = createChainableMock({
        data: [],
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await sendPendingJudgeInvitationEmails("h1", "Test Hackathon", "Organizer")

      expect(result.sent).toBe(0)
      expect(mockSendJudgeInvitationEmail).not.toHaveBeenCalled()
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
    it("returns role_conflict when user joined a team after invitation was sent", async () => {
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

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.code).toBe("role_conflict")
      }
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
    it("returns role_conflict when invitee is already on a team", async () => {
      const { mockClerkClient } = await import("../lib/supabase-mock")
      mockClerkClient.mockResolvedValueOnce({
        organizations: {
          getOrganization: mock(() => Promise.resolve({ name: "Test Org" })),
        },
        users: {
          getUserList: mock(() => Promise.resolve({ data: [{ id: "user_on_team" }] })),
        },
      } as unknown)

      let checkedExisting = false
      setMockFromImplementation((table) => {
        if (table === "judge_invitations" && !checkedExisting) {
          checkedExisting = true
          return createChainableMock({ data: null, error: null })
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

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.code).toBe("role_conflict")
      }
    })
  })
})
