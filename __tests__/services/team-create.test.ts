import { describe, it, expect, beforeEach, mock } from "bun:test"
import {
  createChainableMock,
  resetSupabaseMocks,
  resetClerkMocks,
  mockClerkClient,
  setMockFromImplementation,
} from "../lib/supabase-mock"

const mockSendTeamInvitationEmail = mock(() => Promise.resolve({ success: true }))
mock.module("@/lib/email/team-invitations", () => ({
  sendTeamInvitationEmail: mockSendTeamInvitationEmail,
}))

const mockMarkTeamInvitationEmailed = mock(() => Promise.resolve())
mock.module("@/lib/services/team-invitations", () => ({
  markTeamInvitationEmailed: mockMarkTeamInvitationEmailed,
}))

const mockScheduleReminders = mock(() => Promise.resolve(0))
mock.module("@/lib/services/smart-reminders", () => ({
  scheduleReminders: mockScheduleReminders,
  cancelRemindersForEntity: mock(() => Promise.resolve(0)),
  cancelUpcomingReminder: mock(() => Promise.resolve(0)),
  computeReminderSchedule: mock(() => []),
  processPendingReminders: mock(() =>
    Promise.resolve({ processed: 0, sent: 0, skipped: 0, errors: 0 })
  ),
}))

const { createTeamWithMembers } = await import("@/lib/services/hackathons")

type SupaResult = { data: unknown; error: { message: string } | null }

function tableImpl(handlers: Record<string, SupaResult | SupaResult[]>) {
  const counters: Record<string, number> = {}
  return (table: string) => {
    const entry = handlers[table]
    if (Array.isArray(entry)) {
      const i = counters[table] ?? 0
      counters[table] = i + 1
      const value = entry[Math.min(i, entry.length - 1)]
      return createChainableMock(value as never)
    }
    return createChainableMock((entry ?? { data: null, error: null }) as never)
  }
}

function mockClerkUserList(emails: { id: string; email: string }[]) {
  mockClerkClient.mockResolvedValueOnce({
    users: {
      getUserList: () =>
        Promise.resolve({
          data: emails.map((u) => ({
            id: u.id,
            firstName: "Captain",
            lastName: "Test",
            emailAddresses: [{ emailAddress: u.email }],
            primaryEmailAddress: { emailAddress: u.email },
          })),
        }),
      getUser: () =>
        Promise.resolve({
          id: "organizer_1",
          firstName: "Org",
          lastName: "Anizer",
          primaryEmailAddress: { emailAddress: "org@example.com" },
        }),
    },
  } as never)
}

describe("createTeamWithMembers", () => {
  beforeEach(() => {
    resetSupabaseMocks()
    resetClerkMocks()
    mockSendTeamInvitationEmail.mockClear()
    mockMarkTeamInvitationEmailed.mockClear()
    mockScheduleReminders.mockClear()
  })

  describe("captain email is not in Clerk", () => {
    it("creates pending team but does NOT email when hackathon is draft", async () => {
      mockClerkUserList([])
      setMockFromImplementation(
        tableImpl({
          hackathons: { data: { name: "H", slug: "h", status: "draft", starts_at: null, ends_at: null }, error: null },
          teams: { data: { id: "team_1", name: "T" }, error: null },
          team_invitations: { data: { id: "inv_1" }, error: null },
        })
      )

      const result = await createTeamWithMembers("h1", {
        name: "T",
        captainEmail: "new@example.com",
        organizerClerkUserId: "organizer_1",
      })

      expect("team" in result).toBe(true)
      if ("team" in result) {
        expect(result.invited).toBe(true)
        expect(result.queued).toBe(true)
      }
      expect(mockSendTeamInvitationEmail).not.toHaveBeenCalled()
      expect(mockMarkTeamInvitationEmailed).not.toHaveBeenCalled()
      expect(mockScheduleReminders).not.toHaveBeenCalled()
    })

    it("emails immediately when hackathon is published", async () => {
      mockClerkUserList([])
      setMockFromImplementation(
        tableImpl({
          hackathons: { data: { name: "H", slug: "h", status: "published", starts_at: null, ends_at: null }, error: null },
          teams: { data: { id: "team_1", name: "T" }, error: null },
          team_invitations: { data: { id: "inv_1" }, error: null },
        })
      )

      const result = await createTeamWithMembers("h1", {
        name: "T",
        captainEmail: "new@example.com",
        organizerClerkUserId: "organizer_1",
      })

      expect("team" in result).toBe(true)
      if ("team" in result) {
        expect(result.invited).toBe(true)
        expect(result.queued).toBe(false)
      }
      expect(mockSendTeamInvitationEmail).toHaveBeenCalledTimes(1)
      expect(mockMarkTeamInvitationEmailed).toHaveBeenCalledTimes(1)
      expect(mockScheduleReminders).toHaveBeenCalledTimes(1)
    })
  })

  describe("captain email belongs to a Clerk user who is NOT registered", () => {
    it("creates pending team but does NOT email when hackathon is draft", async () => {
      mockClerkUserList([{ id: "user_captain", email: "captain@example.com" }])
      setMockFromImplementation(
        tableImpl({
          hackathon_participants: { data: null, error: null },
          hackathons: { data: { name: "H", slug: "h", status: "draft", starts_at: null, ends_at: null }, error: null },
          teams: { data: { id: "team_1", name: "T" }, error: null },
          team_invitations: { data: { id: "inv_1" }, error: null },
        })
      )

      const result = await createTeamWithMembers("h1", {
        name: "T",
        captainEmail: "captain@example.com",
        organizerClerkUserId: "organizer_1",
      })

      expect("team" in result).toBe(true)
      if ("team" in result) {
        expect(result.invited).toBe(true)
        expect(result.queued).toBe(true)
      }
      expect(mockSendTeamInvitationEmail).not.toHaveBeenCalled()
    })

    it("queues an invite instead of returning the legacy not-registered error", async () => {
      mockClerkUserList([{ id: "user_captain", email: "captain@example.com" }])
      setMockFromImplementation(
        tableImpl({
          hackathon_participants: { data: null, error: null },
          hackathons: { data: { name: "H", slug: "h", status: "published", starts_at: null, ends_at: null }, error: null },
          teams: { data: { id: "team_1", name: "T" }, error: null },
          team_invitations: { data: { id: "inv_1" }, error: null },
        })
      )

      const result = await createTeamWithMembers("h1", {
        name: "T",
        captainEmail: "captain@example.com",
      })

      expect("error" in result).toBe(false)
      expect(mockSendTeamInvitationEmail).toHaveBeenCalledTimes(1)
    })
  })

  describe("captain email belongs to a registered participant", () => {
    it("assigns them directly as captain and sends NO invite email", async () => {
      mockClerkUserList([{ id: "user_captain", email: "captain@example.com" }])
      setMockFromImplementation(
        tableImpl({
          hackathon_participants: { data: { id: "p_1", team_id: null }, error: null },
          teams: { data: { id: "team_1", name: "T" }, error: null },
        })
      )

      const result = await createTeamWithMembers("h1", {
        name: "T",
        captainEmail: "captain@example.com",
      })

      expect("team" in result).toBe(true)
      if ("team" in result) {
        expect(result.invited).toBeUndefined()
      }
      expect(mockSendTeamInvitationEmail).not.toHaveBeenCalled()
      expect(mockMarkTeamInvitationEmailed).not.toHaveBeenCalled()
    })

    it("errors when the participant is already on a team", async () => {
      mockClerkUserList([{ id: "user_captain", email: "captain@example.com" }])
      setMockFromImplementation(
        tableImpl({
          hackathon_participants: { data: { id: "p_1", team_id: "team_existing" }, error: null },
        })
      )

      const result = await createTeamWithMembers("h1", {
        name: "T",
        captainEmail: "captain@example.com",
      })

      expect("error" in result).toBe(true)
      if ("error" in result) {
        expect(result.error).toBe("That user is already on a team")
      }
    })
  })
})
