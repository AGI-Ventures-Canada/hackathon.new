import { describe, it, expect, beforeEach, mock } from "bun:test"
import {
  createChainableMock,
  resetSupabaseMocks,
  setMockFromImplementation,
  setMockRpcImplementation,
  mockClerkClient,
} from "../lib/supabase-mock"

const mockSendTeamInvitationEmail = mock(() => Promise.resolve({ success: true }))
mock.module("@/lib/email/team-invitations", () => ({
  sendTeamInvitationEmail: mockSendTeamInvitationEmail,
}))

const mockScheduleReminders = mock(() => Promise.resolve(0))
const mockCancelRemindersForEntity = mock(() => Promise.resolve(0))
const mockCancelUpcomingReminder = mock(() => Promise.resolve(0))
mock.module("@/lib/services/smart-reminders", () => ({
  scheduleReminders: mockScheduleReminders,
  cancelRemindersForEntity: mockCancelRemindersForEntity,
  cancelUpcomingReminder: mockCancelUpcomingReminder,
  computeReminderSchedule: mock(() => []),
  processPendingReminders: mock(() => Promise.resolve({ processed: 0, sent: 0, skipped: 0, errors: 0 })),
}))

const mockWithDeliveryLease = mock(async (
  _key: string,
  work: () => Promise<unknown>,
) => ({ acquired: true as const, value: await work() }))
mock.module("@/lib/services/delivery-lease", () => ({
  withDeliveryLease: mockWithDeliveryLease,
}))

const {
  createTeamInvitation,
  getInvitationByToken,
  acceptTeamInvitation,
  cancelOtherPendingTeamInvitations,
  declineTeamInvitation,
  cancelTeamInvitation,
  listTeamInvitations,
  getTeamWithHackathon,
  remindTeamInvitation,
  releaseTeamInvitationReminderClaim,
  sendPendingTeamInvitationEmails,
  retryPendingTeamInvitationEmails,
  markTeamInvitationEmailed,
} = await import("@/lib/services/team-invitations")

const mockTeam = {
  id: "team_1",
  hackathon_id: "h1",
  captain_clerk_user_id: "user_captain",
  status: "forming",
  name: "Test Team",
}

const mockHackathon = {
  id: "h1",
  status: "active",
  starts_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  ends_at: null,
  registration_closes_at: null,
  allow_late_registration: true,
  max_team_size: 5,
}

const mockInvitation = {
  id: "inv_1",
  team_id: "team_1",
  hackathon_id: "h1",
  email: "invitee@example.com",
  token: "test_token_123",
  invited_by_clerk_user_id: "user_captain",
  status: "pending",
  expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

describe("Team Invitations Service", () => {
  beforeEach(() => {
    resetSupabaseMocks()
    mockCancelRemindersForEntity.mockClear()
    mockWithDeliveryLease.mockClear()
    mockWithDeliveryLease.mockImplementation(async (_key, work) => ({
      acquired: true as const,
      value: await work(),
    }))
    mockClerkClient.mockReset()
    mockClerkClient.mockResolvedValue({
      users: {
        getUser: mock(() => Promise.resolve({
          firstName: "Captain",
          lastName: "Hook",
          primaryEmailAddress: { emailAddress: "captain@example.com" },
        })),
        getUserList: mock(() => Promise.resolve({ data: [] })),
      },
    } as unknown)
  })

  describe("createTeamInvitation", () => {
    it("creates invitation successfully", async () => {
      let callCount = 0
      setMockFromImplementation((table) => {
        callCount++
        if (table === "teams") {
          return createChainableMock({ data: mockTeam, error: null })
        }
        if (table === "hackathons") {
          return createChainableMock({ data: mockHackathon, error: null })
        }
        if (table === "hackathon_participants") {
          return createChainableMock({ data: null, error: null, count: 1 })
        }
        if (table === "team_invitations") {
          if (callCount <= 5) {
            return createChainableMock({ data: null, error: null, count: 0 })
          }
          return createChainableMock({ data: mockInvitation, error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await createTeamInvitation({
        teamId: "team_1",
        hackathonId: "h1",
        email: "invitee@example.com",
        invitedByClerkUserId: "user_captain",
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.invitation.email).toBe("invitee@example.com")
      }
    })

    it("returns error when team not found", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: null, error: { message: "Not found" } })
      )

      const result = await createTeamInvitation({
        teamId: "nonexistent",
        hackathonId: "h1",
        email: "test@example.com",
        invitedByClerkUserId: "user_123",
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.code).toBe("team_not_found")
      }
    })

    it("returns error when user is not captain", async () => {
      const teamWithDifferentCaptain = {
        ...mockTeam,
        captain_clerk_user_id: "different_user",
      }
      setMockFromImplementation(() =>
        createChainableMock({ data: teamWithDifferentCaptain, error: null })
      )

      const result = await createTeamInvitation({
        teamId: "team_1",
        hackathonId: "h1",
        email: "test@example.com",
        invitedByClerkUserId: "user_captain",
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.code).toBe("not_captain")
      }
    })

    it("returns error when team is locked", async () => {
      const lockedTeam = { ...mockTeam, status: "locked" }
      setMockFromImplementation(() =>
        createChainableMock({ data: lockedTeam, error: null })
      )

      const result = await createTeamInvitation({
        teamId: "team_1",
        hackathonId: "h1",
        email: "test@example.com",
        invitedByClerkUserId: "user_captain",
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.code).toBe("team_locked")
      }
    })

    it("returns not open when team is disbanded", async () => {
      const disbandedTeam = { ...mockTeam, status: "disbanded" }
      setMockFromImplementation(() =>
        createChainableMock({ data: disbandedTeam, error: null })
      )

      const result = await createTeamInvitation({
        teamId: "team_1",
        hackathonId: "h1",
        email: "test@example.com",
        invitedByClerkUserId: "user_captain",
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.code).toBe("team_not_open")
      }
    })

    it("allows teams waiting for approval to invite members", async () => {
      let teamInvitationCalls = 0
      setMockFromImplementation((table) => {
        if (table === "teams") {
          return createChainableMock({ data: { ...mockTeam, status: "pending_approval" }, error: null })
        }
        if (table === "hackathons") {
          return createChainableMock({ data: mockHackathon, error: null })
        }
        if (table === "hackathon_participants") {
          return createChainableMock({ data: null, error: null, count: 1 })
        }
        if (table === "team_invitations") {
          teamInvitationCalls++
          if (teamInvitationCalls <= 2) {
            return createChainableMock({ data: null, error: null, count: 0 })
          }
          return createChainableMock({ data: mockInvitation, error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await createTeamInvitation({
        teamId: "team_1",
        hackathonId: "h1",
        email: "invitee@example.com",
        invitedByClerkUserId: "user_captain",
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.invitation.id).toBe("inv_1")
      }
    })

    it("returns error when hackathon not found", async () => {
      setMockFromImplementation((table) => {
        if (table === "teams") {
          return createChainableMock({ data: mockTeam, error: null })
        }
        if (table === "hackathons") {
          return createChainableMock({ data: null, error: { message: "Not found" } })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await createTeamInvitation({
        teamId: "team_1",
        hackathonId: "nonexistent",
        email: "test@example.com",
        invitedByClerkUserId: "user_captain",
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.code).toBe("hackathon_not_found")
      }
    })

    it("returns error when hackathon has ended", async () => {
      setMockFromImplementation((table) => {
        if (table === "teams") {
          return createChainableMock({ data: mockTeam, error: null })
        }
        if (table === "hackathons") {
          return createChainableMock({
            data: { ...mockHackathon, status: "completed" },
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await createTeamInvitation({
        teamId: "team_1",
        hackathonId: "h1",
        email: "test@example.com",
        invitedByClerkUserId: "user_captain",
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.code).toBe("hackathon_ended")
      }
    })

    it("returns error when hackathon is archived", async () => {
      setMockFromImplementation((table) => {
        if (table === "teams") {
          return createChainableMock({ data: mockTeam, error: null })
        }
        if (table === "hackathons") {
          return createChainableMock({
            data: { ...mockHackathon, status: "archived" },
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await createTeamInvitation({
        teamId: "team_1",
        hackathonId: "h1",
        email: "test@example.com",
        invitedByClerkUserId: "user_captain",
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.code).toBe("hackathon_ended")
      }
    })

    it("returns error when registration has closed", async () => {
      setMockFromImplementation((table) => {
        if (table === "teams") {
          return createChainableMock({ data: mockTeam, error: null })
        }
        if (table === "hackathons") {
          return createChainableMock({
            data: {
              ...mockHackathon,
              status: "registration_open",
              starts_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
              registration_closes_at: new Date(Date.now() - 60_000).toISOString(),
            },
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await createTeamInvitation({
        teamId: "team_1",
        hackathonId: "h1",
        email: "test@example.com",
        invitedByClerkUserId: "user_captain",
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.code).toBe("registration_closed")
      }
    })

    it("allows team invites during active events after registration closes", async () => {
      let teamInvitationCalls = 0
      setMockFromImplementation((table) => {
        if (table === "teams") {
          return createChainableMock({ data: mockTeam, error: null })
        }
        if (table === "hackathons") {
          return createChainableMock({
            data: {
              ...mockHackathon,
              status: "active",
              registration_closes_at: new Date(Date.now() - 60_000).toISOString(),
            },
            error: null,
          })
        }
        if (table === "hackathon_participants") {
          return createChainableMock({ data: null, error: null, count: 1 })
        }
        if (table === "team_invitations") {
          teamInvitationCalls++
          if (teamInvitationCalls <= 2) {
            return createChainableMock({ data: null, error: null, count: 0 })
          }
          return createChainableMock({ data: mockInvitation, error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await createTeamInvitation({
        teamId: "team_1",
        hackathonId: "h1",
        email: "invitee@example.com",
        invitedByClerkUserId: "user_captain",
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.invitation.email).toBe("invitee@example.com")
      }
    })

    it("blocks team invites after registration closes when late signups are off", async () => {
      setMockFromImplementation((table) => {
        if (table === "teams") {
          return createChainableMock({ data: mockTeam, error: null })
        }
        if (table === "hackathons") {
          return createChainableMock({
            data: {
              ...mockHackathon,
              status: "active",
              registration_closes_at: new Date(Date.now() - 60_000).toISOString(),
              allow_late_registration: false,
            },
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await createTeamInvitation({
        teamId: "team_1",
        hackathonId: "h1",
        email: "invitee@example.com",
        invitedByClerkUserId: "user_captain",
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.code).toBe("registration_closed")
      }
    })

    it("returns error when team would exceed max size", async () => {
      setMockFromImplementation((table) => {
        if (table === "teams") {
          return createChainableMock({ data: mockTeam, error: null })
        }
        if (table === "hackathons") {
          return createChainableMock({
            data: { ...mockHackathon, max_team_size: 2 },
            error: null,
          })
        }
        if (table === "hackathon_participants") {
          return createChainableMock({ data: null, error: null, count: 2 })
        }
        if (table === "team_invitations") {
          return createChainableMock({ data: null, error: null, count: 0 })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await createTeamInvitation({
        teamId: "team_1",
        hackathonId: "h1",
        email: "test@example.com",
        invitedByClerkUserId: "user_captain",
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.code).toBe("team_full")
      }
    })

    it("returns error when invitation already exists", async () => {
      let teamInvitationCalls = 0
      setMockFromImplementation((table) => {
        if (table === "teams") {
          return createChainableMock({ data: mockTeam, error: null })
        }
        if (table === "hackathons") {
          return createChainableMock({ data: mockHackathon, error: null })
        }
        if (table === "hackathon_participants") {
          return createChainableMock({ data: null, error: null, count: 1 })
        }
        if (table === "team_invitations") {
          teamInvitationCalls++
          if (teamInvitationCalls === 1) {
            return createChainableMock({ data: null, error: null, count: 0 })
          }
          return createChainableMock({ data: { id: "existing" }, error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await createTeamInvitation({
        teamId: "team_1",
        hackathonId: "h1",
        email: "existing@example.com",
        invitedByClerkUserId: "user_captain",
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.code).toBe("already_invited")
      }
    })

    it("expires an old pending invitation before creating a replacement", async () => {
      let invitationCalls = 0
      let teamCalls = 0
      let expiredUpdate: Record<string, unknown> | null = null
      let teamUpdate: Record<string, unknown> | null = null
      setMockFromImplementation((table) => {
        if (table === "teams") {
          teamCalls++
          const chain = createChainableMock({ data: teamCalls === 1 ? mockTeam : null, error: null })
          if (teamCalls > 1) {
            const originalUpdate = chain.update
            chain.update = mock((value: Record<string, unknown>) => {
              teamUpdate = value
              return originalUpdate(value)
            }) as typeof chain.update
          }
          return chain
        }
        if (table === "hackathons") {
          return createChainableMock({ data: mockHackathon, error: null })
        }
        if (table === "hackathon_participants") {
          return createChainableMock({ data: null, error: null, count: 1 })
        }
        if (table === "team_invitations") {
          invitationCalls++
          if (invitationCalls === 1) {
            return createChainableMock({ data: null, error: null, count: 0 })
          }
          if (invitationCalls === 2) {
            return createChainableMock({
              data: {
                id: "expired_invite",
                expires_at: new Date(Date.now() - 60_000).toISOString(),
              },
              error: null,
            })
          }
          if (invitationCalls === 3) {
            const chain = createChainableMock({
              data: {
                team_id: "team_1",
                email: "invitee@example.com",
                is_captain_invite: true,
              },
              error: null,
            })
            const originalUpdate = chain.update
            chain.update = mock((value: Record<string, unknown>) => {
              expiredUpdate = value
              return originalUpdate(value)
            }) as typeof chain.update
            return chain
          }
          return createChainableMock({ data: mockInvitation, error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await createTeamInvitation({
        teamId: "team_1",
        hackathonId: "h1",
        email: "invitee@example.com",
        invitedByClerkUserId: "user_captain",
      })

      expect(result.success).toBe(true)
      expect(expiredUpdate).toEqual(expect.objectContaining({ status: "expired" }))
      expect(teamUpdate).toEqual(expect.objectContaining({ pending_captain_email: null }))
    })

    it("fails closed when pending invitations cannot be checked", async () => {
      let invitationCalls = 0
      setMockFromImplementation((table) => {
        if (table === "teams") return createChainableMock({ data: mockTeam, error: null })
        if (table === "hackathons") {
          return createChainableMock({ data: mockHackathon, error: null })
        }
        if (table === "hackathon_participants") {
          return createChainableMock({ data: null, error: null, count: 1 })
        }
        invitationCalls++
        return invitationCalls === 1
          ? createChainableMock({ data: null, error: null, count: 0 })
          : createChainableMock({ data: null, error: { message: "database unavailable" } })
      })

      const result = await createTeamInvitation({
        teamId: "team_1",
        hackathonId: "h1",
        email: "invitee@example.com",
        invitedByClerkUserId: "user_captain",
      })

      expect(result).toEqual({
        success: false,
        error: "Failed to check existing invitations",
        code: "lookup_failed",
      })
    })

    it("trims and lowercases email address", async () => {
      let capturedEmail: string | null = null
      setMockFromImplementation((table) => {
        if (table === "teams") {
          return createChainableMock({ data: mockTeam, error: null })
        }
        if (table === "hackathons") {
          return createChainableMock({ data: mockHackathon, error: null })
        }
        if (table === "hackathon_participants") {
          return createChainableMock({ data: null, error: null, count: 1 })
        }
        if (table === "team_invitations") {
          const chain = createChainableMock({ data: null, error: null, count: 0 })
          const originalInsert = chain.insert as (data: unknown) => unknown
          chain.insert = (data: unknown) => {
            if (data && typeof data === "object" && "email" in data) {
              capturedEmail = (data as { email: string }).email
            }
            return originalInsert(data)
          }
          return chain
        }
        return createChainableMock({ data: null, error: null })
      })

      await createTeamInvitation({
        teamId: "team_1",
        hackathonId: "h1",
        email: "  TEST@EXAMPLE.COM  ",
        invitedByClerkUserId: "user_captain",
      })

      expect(capturedEmail).not.toBeNull()
      expect(capturedEmail).toBe("test@example.com")
    })

    it("returns a private role-unavailable error when invitee is a judge", async () => {
      const { mockClerkClient } = await import("../lib/supabase-mock")
      mockClerkClient.mockResolvedValueOnce({
        organizations: {
          getOrganization: mock(() => Promise.resolve({ name: "Test Org" })),
        },
        users: {
          getUserList: mock(() => Promise.resolve({ data: [{ id: "user_judge" }] })),
        },
      } as unknown)

      let participantQueryCount = 0
      setMockFromImplementation((table) => {
        if (table === "teams") {
          return createChainableMock({ data: mockTeam, error: null })
        }
        if (table === "hackathons") {
          return createChainableMock({ data: mockHackathon, error: null })
        }
        if (table === "hackathon_participants") {
          participantQueryCount++
          if (participantQueryCount === 1) {
            return createChainableMock({ data: null, error: null, count: 1 })
          }
          return createChainableMock({
            data: { id: "j1", role: "judge", team_id: null },
            error: null,
          })
        }
        if (table === "team_invitations") {
          return createChainableMock({ data: null, error: null, count: 0 })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await createTeamInvitation({
        teamId: "team_1",
        hackathonId: "h1",
        email: "judge@example.com",
        invitedByClerkUserId: "user_captain",
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.code).toBe("role_unavailable")
        expect(result.error).not.toContain("judge")
      }
    })
  })

  describe("getInvitationByToken", () => {
    it("returns invitation with team and hackathon details", async () => {
      const invitationWithJoins = {
        ...mockInvitation,
        teams: { name: "Test Team" },
        hackathons: { name: "Test Hackathon", slug: "test-hackathon", status: "active" },
      }
      setMockFromImplementation(() =>
        createChainableMock({ data: invitationWithJoins, error: null })
      )

      const result = await getInvitationByToken("test_token_123")

      expect(result).not.toBeNull()
      expect(result?.team.name).toBe("Test Team")
      expect(result?.hackathon.name).toBe("Test Hackathon")
      expect(result?.hackathon.slug).toBe("test-hackathon")
    })

    it("returns null when token not found", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: null, error: { message: "Not found" } })
      )

      const result = await getInvitationByToken("nonexistent_token")

      expect(result).toBeNull()
    })
  })

  describe("acceptTeamInvitation", () => {
    it("returns success when RPC succeeds", async () => {
      setMockRpcImplementation(() =>
        Promise.resolve({
          data: [{ success: true, team_id: "team_1", hackathon_id: "h1", error_code: null, error_message: null }],
          error: null,
        })
      )

      const result = await acceptTeamInvitation("test_token", "user_123", "user@example.com")

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.teamId).toBe("team_1")
        expect(result.hackathonId).toBe("h1")
      }
    })

    it("returns error when RPC fails", async () => {
      setMockRpcImplementation(() =>
        Promise.resolve({
          data: null,
          error: { message: "RPC error" },
        })
      )

      const result = await acceptTeamInvitation("test_token", "user_123", "user@example.com")

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.code).toBe("rpc_failed")
      }
    })

    it("returns error when no result from RPC", async () => {
      setMockRpcImplementation(() =>
        Promise.resolve({
          data: [],
          error: null,
        })
      )

      const result = await acceptTeamInvitation("test_token", "user_123", "user@example.com")

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.code).toBe("no_result")
      }
    })

    it("returns error from RPC error_code", async () => {
      setMockRpcImplementation(() =>
        Promise.resolve({
          data: [{ success: false, team_id: null, hackathon_id: null, error_code: "invitation_expired", error_message: "Invitation has expired" }],
          error: null,
        })
      )

      const result = await acceptTeamInvitation("expired_token", "user_123", "user@example.com")

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.code).toBe("invitation_expired")
        expect(result.error).toBe("Invitation has expired")
      }
    })

    it("returns at_capacity when event is full", async () => {
      setMockRpcImplementation(() =>
        Promise.resolve({
          data: [{ success: false, team_id: null, hackathon_id: null, error_code: "at_capacity", error_message: "Event is at full capacity" }],
          error: null,
        })
      )

      const result = await acceptTeamInvitation("test_token", "user_123", "user@example.com")

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.code).toBe("at_capacity")
        expect(result.error).toBe("Event is at full capacity")
      }
    })
  })

  describe("declineTeamInvitation", () => {
    it("returns error when invitation not found for email", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: null, error: null })
      )

      const result = await declineTeamInvitation("test_token", ["user@example.com"])

      expect(result.success).toBe(false)
      expect(result.code).toBe("not_found")
    })

    it("declines invitation with matching email", async () => {
      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createChainableMock({
            data: { id: "inv_1", email: "test@example.com" },
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await declineTeamInvitation("test_token", ["primary@example.com", "test@example.com"])

      expect(result.success).toBe(true)
      expect(mockCancelRemindersForEntity).toHaveBeenCalledWith(
        "team_invitation",
        "inv_1",
      )
    })

    it("returns error when email does not match", async () => {
      setMockFromImplementation(() =>
        createChainableMock({
          data: { id: "inv_1", email: "different@example.com" },
          error: null,
        })
      )

      const result = await declineTeamInvitation("test_token", ["test@example.com"])

      expect(result.success).toBe(false)
      expect(result.code).toBe("email_mismatch")
    })

    it("returns error when invitation not found", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: null, error: null })
      )

      const result = await declineTeamInvitation("nonexistent", ["test@example.com"])

      expect(result.success).toBe(false)
      expect(result.code).toBe("not_found")
    })

    it("is case insensitive for email matching", async () => {
      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createChainableMock({
            data: { id: "inv_1", email: "TEST@EXAMPLE.COM" },
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await declineTeamInvitation("test_token", ["test@example.com"])

      expect(result.success).toBe(true)
    })
  })

  describe("cancelOtherPendingTeamInvitations", () => {
    it("cancels sibling invites across every verified email", async () => {
      const chain = createChainableMock({
        data: [{ id: "inv_2" }, { id: "inv_3" }],
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await cancelOtherPendingTeamInvitations(
        "h1",
        ["Primary@Example.com", "secondary@example.com", "primary@example.com"],
        "inv_1",
      )

      expect(result).toBe(2)
      expect(chain.in).toHaveBeenCalledWith("email", [
        "primary@example.com",
        "secondary@example.com",
      ])
      expect(chain.neq).toHaveBeenCalledWith("id", "inv_1")
      expect(mockCancelRemindersForEntity).toHaveBeenCalledTimes(2)
    })
  })

  describe("cancelTeamInvitation", () => {
    it("cancels invitation when user is captain", async () => {
      let callCount = 0
      setMockFromImplementation((table) => {
        callCount++
        if (table === "team_invitations" && callCount === 1) {
          return createChainableMock({
            data: { team_id: "team_1", status: "pending" },
            error: null,
          })
        }
        if (table === "teams") {
          return createChainableMock({
            data: { captain_clerk_user_id: "user_captain" },
            error: null,
          })
        }
        if (table === "team_invitations" && callCount > 1) {
          return createChainableMock({ data: { id: "inv_1" }, error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await cancelTeamInvitation("inv_1", "user_captain")

      expect(result.success).toBe(true)
    })

    it("returns error when invitation not found", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: null, error: null })
      )

      const result = await cancelTeamInvitation("nonexistent", "user_captain")

      expect(result.success).toBe(false)
      expect(result.error).toBe("Invitation not found or not pending")
    })

    it("returns error when invitation is not pending", async () => {
      setMockFromImplementation(() =>
        createChainableMock({
          data: { team_id: "team_1", status: "accepted" },
          error: null,
        })
      )

      const result = await cancelTeamInvitation("inv_1", "user_captain")

      expect(result.success).toBe(false)
      expect(result.error).toBe("Invitation not found or not pending")
    })

    it("returns error when user is not captain", async () => {
      let callCount = 0
      setMockFromImplementation((table) => {
        callCount++
        if (table === "team_invitations" && callCount === 1) {
          return createChainableMock({
            data: { team_id: "team_1", status: "pending" },
            error: null,
          })
        }
        if (table === "teams") {
          return createChainableMock({
            data: { captain_clerk_user_id: "different_user" },
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await cancelTeamInvitation("inv_1", "not_captain")

      expect(result.success).toBe(false)
      expect(result.error).toBe("Only team captain can cancel invitations")
    })
  })

  describe("listTeamInvitations", () => {
    it("returns all invitations for team when user is captain", async () => {
      const invitations = [
        { ...mockInvitation, id: "inv_1" },
        { ...mockInvitation, id: "inv_2", email: "other@example.com" },
      ]
      setMockFromImplementation((table) => {
        if (table === "teams") {
          return createChainableMock({
            data: { captain_clerk_user_id: "user_captain" },
            error: null,
          })
        }
        return createChainableMock({ data: invitations, error: null })
      })

      const result = await listTeamInvitations("team_1", "user_captain")

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.invitations).toHaveLength(2)
      }
    })

    it("returns all invitations for team when user is team member", async () => {
      const invitations = [{ ...mockInvitation, id: "inv_1" }]
      setMockFromImplementation((table) => {
        if (table === "teams") {
          return createChainableMock({
            data: { captain_clerk_user_id: "other_captain" },
            error: null,
          })
        }
        if (table === "hackathon_participants") {
          return createChainableMock({ data: { id: "membership_1" }, error: null })
        }
        return createChainableMock({ data: invitations, error: null })
      })

      const result = await listTeamInvitations("team_1", "team_member")

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.invitations).toHaveLength(1)
      }
    })

    it("returns error when user is not team member", async () => {
      setMockFromImplementation((table) => {
        if (table === "teams") {
          return createChainableMock({
            data: { captain_clerk_user_id: "other_captain" },
            error: null,
          })
        }
        if (table === "hackathon_participants") {
          return createChainableMock({ data: null, error: null })
        }
        return createChainableMock({ data: [], error: null })
      })

      const result = await listTeamInvitations("team_1", "unauthorized_user")

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.code).toBe("not_team_member")
      }
    })

    it("returns error when team not found", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: null, error: { message: "Not found" } })
      )

      const result = await listTeamInvitations("nonexistent", "user_captain")

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.code).toBe("team_not_found")
      }
    })

    it("filters by status when provided", async () => {
      const chain = createChainableMock({ data: [mockInvitation], error: null })
      setMockFromImplementation((table) => {
        if (table === "teams") {
          return createChainableMock({
            data: { captain_clerk_user_id: "user_captain" },
            error: null,
          })
        }
        return chain
      })

      const result = await listTeamInvitations("team_1", "user_captain", { status: "pending" })

      expect(result.success).toBe(true)
      expect(chain.eq).toHaveBeenCalled()
    })

    it("returns error on database error", async () => {
      setMockFromImplementation((table) => {
        if (table === "teams") {
          return createChainableMock({
            data: { captain_clerk_user_id: "user_captain" },
            error: null,
          })
        }
        return createChainableMock({ data: null, error: { message: "DB error" } })
      })

      const result = await listTeamInvitations("team_1", "user_captain")

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.code).toBe("query_failed")
      }
    })
  })

  describe("getTeamWithHackathon", () => {
    it("returns team with hackathon info", async () => {
      setMockFromImplementation(() =>
        createChainableMock({
          data: {
            name: "Test Team",
            hackathons: { name: "Test Hackathon", slug: "test-hackathon", status: "active", starts_at: "2025-06-01T00:00:00Z", ends_at: "2025-06-02T00:00:00Z" },
            hackathon_participants: [],
          },
          error: null,
        })
      )

      const result = await getTeamWithHackathon("team_1")

      expect(result).not.toBeNull()
      expect(result?.name).toBe("Test Team")
      expect(result?.hackathon.name).toBe("Test Hackathon")
      expect(result?.hackathon.slug).toBe("test-hackathon")
      expect(result?.hackathon.status).toBe("active")
      expect(result?.hackathon.starts_at).toBe("2025-06-01T00:00:00Z")
      expect(result?.hackathon.ends_at).toBe("2025-06-02T00:00:00Z")
      expect(result?.memberNames).toEqual([])
    })

    it("returns null when team not found", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: null, error: { message: "Not found" } })
      )

      const result = await getTeamWithHackathon("nonexistent")

      expect(result).toBeNull()
    })
  })

  describe("remindTeamInvitation", () => {
    const pendingInvitation = {
      ...mockInvitation,
      reminded_at: null,
      teams: { captain_clerk_user_id: "user_captain" },
    }

    it("succeeds for a pending invitation with no prior reminder", async () => {
      let invitationCalls = 0
      setMockFromImplementation((table) => {
        if (table === "hackathons") {
          return createChainableMock({ data: { status: "active", starts_at: null, ends_at: null }, error: null })
        }
        invitationCalls++
        if (invitationCalls === 1) {
          return createChainableMock({ data: pendingInvitation, error: null })
        }
        return createChainableMock({
          data: { ...pendingInvitation, reminded_at: new Date().toISOString() },
          error: null,
        })
      })

      const result = await remindTeamInvitation("11111111-1111-1111-1111-111111111111", "user_captain", "22222222-2222-2222-2222-222222222222")

      expect(result.success).toBe(true)
    })

    it("succeeds when teamId matches", async () => {
      let invitationCalls = 0
      setMockFromImplementation((table) => {
        if (table === "hackathons") {
          return createChainableMock({ data: { status: "active", starts_at: null, ends_at: null }, error: null })
        }
        invitationCalls++
        if (invitationCalls === 1) {
          return createChainableMock({ data: pendingInvitation, error: null })
        }
        return createChainableMock({
          data: { ...pendingInvitation, reminded_at: new Date().toISOString() },
          error: null,
        })
      })

      const result = await remindTeamInvitation(
        "11111111-1111-1111-1111-111111111111",
        "user_captain",
        "22222222-2222-2222-2222-222222222222"
      )

      expect(result.success).toBe(true)
    })

    it("returns not_found when teamId is not a valid UUID", async () => {
      const result = await remindTeamInvitation(
        "11111111-1111-1111-1111-111111111111",
        "user_captain",
        "not-a-uuid"
      )

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.code).toBe("not_found")
      }
    })

    it("returns not_found when teamId does not match invitation", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: null, error: { message: "Not found" } })
      )

      const result = await remindTeamInvitation(
        "11111111-1111-1111-1111-111111111111",
        "user_captain",
        "33333333-3333-3333-3333-333333333333"
      )

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.code).toBe("not_found")
      }
    })

    it("returns not_found when invitation does not exist", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: null, error: { message: "Not found" } })
      )

      const result = await remindTeamInvitation("22222222-2222-2222-2222-222222222222", "user_captain", "33333333-3333-3333-3333-333333333333")

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.code).toBe("not_found")
      }
    })

    it("returns not_captain when user is not team captain", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: pendingInvitation, error: null })
      )

      const result = await remindTeamInvitation("11111111-1111-1111-1111-111111111111", "user_not_captain", "22222222-2222-2222-2222-222222222222")

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.code).toBe("not_captain")
      }
    })

    it("returns not_pending when invitation is not pending", async () => {
      setMockFromImplementation(() =>
        createChainableMock({
          data: { ...pendingInvitation, status: "accepted" },
          error: null,
        })
      )

      const result = await remindTeamInvitation("11111111-1111-1111-1111-111111111111", "user_captain", "22222222-2222-2222-2222-222222222222")

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.code).toBe("not_pending")
      }
    })

    it("returns expired when invitation has expired", async () => {
      setMockFromImplementation(() =>
        createChainableMock({
          data: {
            ...pendingInvitation,
            expires_at: new Date(Date.now() - 1000).toISOString(),
          },
          error: null,
        })
      )

      const result = await remindTeamInvitation("11111111-1111-1111-1111-111111111111", "user_captain", "22222222-2222-2222-2222-222222222222")

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
          : createChainableMock({ data: pendingInvitation, error: null }))
        const result = await remindTeamInvitation(
          "11111111-1111-1111-1111-111111111111",
          "user_captain",
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
            ? { ...pendingInvitation, reminded_at: new Date().toISOString() }
            : null,
          error: null,
        })
      })

      const result = await remindTeamInvitation("11111111-1111-1111-1111-111111111111", "user_captain", "22222222-2222-2222-2222-222222222222")

      expect(result).toMatchObject({ success: false, code: "already_reminded" })
    })
  })

  describe("releaseTeamInvitationReminderClaim", () => {
    it("releases only the matching pending claim", async () => {
      const chain = createChainableMock({ data: null, error: null })
      setMockFromImplementation(() => chain)
      await releaseTeamInvitationReminderClaim("inv_1", "2026-08-01T00:00:00Z")
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
        releaseTeamInvitationReminderClaim("inv_1", "2026-08-01T00:00:00Z"),
      ).rejects.toThrow("Failed to release team invitation reminder claim: release failed")
    })
  })

  describe("markTeamInvitationEmailed", () => {
    it("updates emailed_at on the invitation row", async () => {
      let captured: { table: string; update?: unknown } | null = null
      setMockFromImplementation((table) => {
        const chain = createChainableMock({ data: null, error: null })
        const originalUpdate = chain.update as (data: unknown) => unknown
        chain.update = (data: unknown) => {
          captured = { table, update: data }
          return originalUpdate(data)
        }
        return chain
      })

      await markTeamInvitationEmailed("inv_1")

      expect(captured).not.toBeNull()
      expect(captured!.table).toBe("team_invitations")
      const update = captured!.update as { emailed_at: string }
      expect(typeof update.emailed_at).toBe("string")
    })

    it("throws when DB returns an error", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: null, error: { message: "boom" } })
      )

      await expect(markTeamInvitationEmailed("inv_1")).rejects.toThrow(/boom/)
    })
  })

  describe("sendPendingTeamInvitationEmails", () => {
    beforeEach(() => {
      mockSendTeamInvitationEmail.mockClear()
      mockSendTeamInvitationEmail.mockResolvedValue({ success: true })
      mockScheduleReminders.mockClear()
      mockScheduleReminders.mockResolvedValue(0)
    })

    const teamRow = {
      id: "team_1",
      name: "Test Team",
      status: "forming",
      hackathons: {
        id: "h1",
        name: "Test Hackathon",
        slug: "test-hackathon",
        status: "published",
        starts_at: null,
        ends_at: null,
        registration_closes_at: null,
        allow_late_registration: true,
        max_team_size: 5,
        max_participants: null,
      },
      hackathon_participants: [],
    }

    it("returns sent: 0 when no pending invites exist", async () => {
      setMockFromImplementation(() => createChainableMock({ data: [], error: null }))

      const result = await sendPendingTeamInvitationEmails("h1")

      expect(result).toEqual({ sent: 0, total: 0, failedEmails: [] })
      expect(mockSendTeamInvitationEmail).not.toHaveBeenCalled()
      expect(mockScheduleReminders).not.toHaveBeenCalled()
    })

    it("surfaces a pending-invitation query failure", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: null, error: { message: "connection lost" } })
      )

      await expect(sendPendingTeamInvitationEmails("h1")).rejects.toThrow(
        /Failed to load pending team invitations: connection lost/
      )
      expect(mockSendTeamInvitationEmail).not.toHaveBeenCalled()
    })

    it("emails each pending invitation, marks emailed_at, and schedules reminders", async () => {
      const pending = [
        { ...mockInvitation, id: "inv_1", email: "a@example.com", token: "t1", team_id: "team_1", invited_by_clerk_user_id: "user_captain" },
        { ...mockInvitation, id: "inv_2", email: "b@example.com", token: "t2", team_id: "team_1", invited_by_clerk_user_id: "user_captain" },
      ]

      const { mockClerkClient } = await import("../lib/supabase-mock")
      const getUserMock = mock(() =>
        Promise.resolve({ firstName: "Captain", lastName: "Hook" })
      )
      mockClerkClient.mockResolvedValueOnce({
        users: {
          getUser: getUserMock,
          getUserList: mock(() => Promise.resolve({ data: [] })),
        },
      } as unknown)

      const updateCalls: string[] = []
      setMockFromImplementation((table) => {
        if (table === "team_invitations") {
          const chain = createChainableMock({ data: pending, error: null })
          const originalUpdate = chain.update as (data: unknown) => unknown
          chain.update = (data: unknown) => {
            updateCalls.push(JSON.stringify(data))
            return originalUpdate(data)
          }
          return chain
        }
        if (table === "teams") {
          return createChainableMock({ data: teamRow, error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await sendPendingTeamInvitationEmails("h1")

      expect(result.sent).toBe(2)
      expect(result.total).toBe(2)
      expect(result.failedEmails).toEqual([])
      expect(mockSendTeamInvitationEmail).toHaveBeenCalledTimes(2)
      expect(mockSendTeamInvitationEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "a@example.com",
          teamName: "Test Team",
          hackathonName: "Test Hackathon",
          inviterName: "Captain Hook",
          inviteToken: "t1",
          deliveryId: "inv_1",
        })
      )
      expect(getUserMock).toHaveBeenCalledTimes(1)
      expect(mockScheduleReminders).toHaveBeenCalledTimes(2)
      expect(updateCalls.every((c) => c.includes("emailed_at"))).toBe(true)
    })

    it("skips Clerk lookup for the literal \"system\" inviter", async () => {
      const pending = [
        { ...mockInvitation, id: "inv_sys", email: "captain@example.com", token: "tsys", team_id: "team_1", invited_by_clerk_user_id: "system" },
      ]

      const { mockClerkClient } = await import("../lib/supabase-mock")
      const getUserSpy = mock(() => Promise.reject(new Error("should not be called")))
      mockClerkClient.mockResolvedValueOnce({
        users: {
          getUser: getUserSpy,
          getUserList: mock(() => Promise.resolve({ data: [] })),
        },
      } as unknown)

      setMockFromImplementation((table) => {
        if (table === "team_invitations") return createChainableMock({ data: pending, error: null })
        if (table === "teams") return createChainableMock({ data: teamRow, error: null })
        return createChainableMock({ data: null, error: null })
      })

      const result = await sendPendingTeamInvitationEmails("h1")

      expect(result.sent).toBe(1)
      expect(getUserSpy).not.toHaveBeenCalled()
      expect(mockSendTeamInvitationEmail).toHaveBeenCalledWith(
        expect.objectContaining({ inviterName: "Your team captain" })
      )
    })

    it("falls back to a generic captain label when clerk lookup fails", async () => {
      const pending = [
        { ...mockInvitation, id: "inv_1", email: "a@example.com", token: "t1", team_id: "team_1", invited_by_clerk_user_id: "user_missing" },
      ]

      const { mockClerkClient } = await import("../lib/supabase-mock")
      mockClerkClient.mockResolvedValueOnce({
        users: {
          getUser: mock(() => Promise.reject(new Error("not found"))),
          getUserList: mock(() => Promise.resolve({ data: [] })),
        },
      } as unknown)

      setMockFromImplementation((table) => {
        if (table === "team_invitations") return createChainableMock({ data: pending, error: null })
        if (table === "teams") return createChainableMock({ data: teamRow, error: null })
        return createChainableMock({ data: null, error: null })
      })

      const result = await sendPendingTeamInvitationEmails("h1")

      expect(result.sent).toBe(1)
      expect(mockSendTeamInvitationEmail).toHaveBeenCalledWith(
        expect.objectContaining({ inviterName: "Your team captain" })
      )
    })

    it("marks only completed deliveries and leaves failed rows pending", async () => {
      const pending = [
        { ...mockInvitation, id: "inv_1", email: "good@example.com", token: "t1", team_id: "team_1" },
        { ...mockInvitation, id: "inv_2", email: "bad@example.com", token: "t2", team_id: "team_1" },
      ]
      const updates: Array<{ emailed_at: string | null }> = []
      setMockFromImplementation((table) => {
        if (table === "team_invitations") {
          const chain = createChainableMock({ data: pending, error: null })
          const originalUpdate = chain.update as (data: unknown) => unknown
          chain.update = (data: unknown) => {
            updates.push(data as { emailed_at: string | null })
            return originalUpdate(data)
          }
          return chain
        }
        if (table === "teams") {
          return createChainableMock({ data: teamRow, error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      mockSendTeamInvitationEmail
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ success: false })

      const result = await sendPendingTeamInvitationEmails("h1")

      expect(result.sent).toBe(1)
      expect(result.total).toBe(2)
      expect(result.failedEmails).toEqual(["bad@example.com"])
      expect(mockScheduleReminders).toHaveBeenCalledTimes(1)
      expect(updates).toHaveLength(1)
      expect(typeof updates[0].emailed_at).toBe("string")
    })

    it("keeps a delivered invitation checkpoint when reminder scheduling fails", async () => {
      const pending = [
        { ...mockInvitation, id: "inv_1", email: "a@example.com", token: "t1", team_id: "team_1" },
      ]
      const invitationChain = createChainableMock({ data: pending, error: null })
      setMockFromImplementation((table) => {
        if (table === "team_invitations") return invitationChain
        if (table === "teams") return createChainableMock({ data: teamRow, error: null })
        return createChainableMock({ data: null, error: null })
      })
      mockScheduleReminders.mockRejectedValueOnce(new Error("reminder storage unavailable"))

      const result = await sendPendingTeamInvitationEmails("h1")

      expect(result).toEqual({ sent: 1, total: 1, failedEmails: [] })
      expect(mockSendTeamInvitationEmail).toHaveBeenCalledTimes(1)
      expect(invitationChain.update).toHaveBeenCalledWith({
        emailed_at: expect.any(String),
      })
    })

    it("cancels an unsent captain invite and clears its stale team marker after the event ends", async () => {
      const pending = [
        {
          ...mockInvitation,
          id: "inv_1",
          email: "a@example.com",
          token: "t1",
          team_id: "team_1",
          is_captain_invite: true,
        },
      ]
      let invitationCalls = 0
      let teamCalls = 0
      let cancelledUpdate: Record<string, unknown> | null = null
      let teamUpdate: Record<string, unknown> | null = null
      setMockFromImplementation((table) => {
        if (table === "team_invitations") {
          invitationCalls++
          const data = invitationCalls === 1
            ? pending
            : invitationCalls === 2
              ? pending[0]
              : {
                  team_id: "team_1",
                  email: "a@example.com",
                  is_captain_invite: true,
                }
          const chain = createChainableMock({ data, error: null })
          if (invitationCalls === 3) {
            const originalUpdate = chain.update
            chain.update = mock((value: Record<string, unknown>) => {
              cancelledUpdate = value
              return originalUpdate(value)
            }) as typeof chain.update
          }
          return chain
        }
        if (table === "teams") {
          teamCalls++
          if (teamCalls === 1) {
            return createChainableMock({ data: {
              ...teamRow,
              hackathons: {
                ...teamRow.hackathons,
                starts_at: "2026-01-01T00:00:00.000Z",
                ends_at: "2026-01-02T00:00:00.000Z",
              },
            }, error: null })
          }
          const chain = createChainableMock({ data: null, error: null })
          const originalUpdate = chain.update
          chain.update = mock((value: Record<string, unknown>) => {
            teamUpdate = value
            return originalUpdate(value)
          }) as typeof chain.update
          return chain
        }
        return createChainableMock({ data: null, error: null })
      })

      await expect(sendPendingTeamInvitationEmails("h1")).resolves.toEqual({
        sent: 0,
        total: 1,
        failedEmails: [],
      })
      expect(cancelledUpdate).toEqual(expect.objectContaining({ status: "cancelled" }))
      expect(teamUpdate).toEqual(expect.objectContaining({ pending_captain_email: null }))
      expect(mockSendTeamInvitationEmail).not.toHaveBeenCalled()
    })

    it("cancels a queued invite when the recipient became a judge", async () => {
      const pending = [
        { ...mockInvitation, id: "inv_stale", email: "judge@example.com" },
      ]
      let cancelledUpdate: Record<string, unknown> | null = null
      const invitationChain = createChainableMock({ data: pending, error: null })
      const originalUpdate = invitationChain.update
      invitationChain.update = mock((value: Record<string, unknown>) => {
        cancelledUpdate = value
        return originalUpdate(value)
      }) as typeof invitationChain.update
      mockClerkClient.mockResolvedValueOnce({
        users: {
          getUser: mock(() => Promise.resolve({ firstName: "Captain", lastName: "Hook" })),
          getUserList: mock(() => Promise.resolve({ data: [{ id: "judge_1" }] })),
        },
      } as unknown)
      setMockFromImplementation((table) => {
        if (table === "team_invitations") return invitationChain
        if (table === "teams") return createChainableMock({ data: teamRow, error: null })
        if (table === "hackathon_participants") {
          return createChainableMock({
            data: { role: "judge", team_id: null },
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      await expect(sendPendingTeamInvitationEmails("h1")).resolves.toEqual({
        sent: 0,
        total: 1,
        failedEmails: [],
      })
      expect(cancelledUpdate).toEqual(expect.objectContaining({ status: "cancelled" }))
      expect(mockSendTeamInvitationEmail).not.toHaveBeenCalled()
    })
  })

  describe("retryPendingTeamInvitationEmails", () => {
    beforeEach(() => {
      mockSendTeamInvitationEmail.mockClear()
      mockSendTeamInvitationEmail.mockResolvedValue({ success: true })
      mockScheduleReminders.mockClear()
      mockScheduleReminders.mockResolvedValue(1)
    })

    it("retries bounded pending rows for live events", async () => {
      let invitationCalls = 0
      setMockFromImplementation((table) => {
        if (table === "team_invitations") {
          invitationCalls++
          if (invitationCalls === 1) {
            return createChainableMock({
              data: [{
                hackathon_id: "h1",
                hackathons: { status: "published", starts_at: null, ends_at: null },
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
        }
        if (table === "teams") {
          return createChainableMock({
            data: {
              id: "team_1",
              name: "Test Team",
              status: "forming",
              hackathons: {
                id: "h1",
                name: "Test Hackathon",
                slug: "test-hackathon",
                status: "published",
                starts_at: null,
                ends_at: null,
                registration_closes_at: null,
                allow_late_registration: true,
                max_team_size: 5,
                max_participants: null,
              },
              hackathon_participants: [],
            },
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      await expect(retryPendingTeamInvitationEmails(10)).resolves.toEqual({
        events: 1,
        sent: 1,
        failed: 0,
      })
      expect(mockSendTeamInvitationEmail).toHaveBeenCalledTimes(1)
    })

    it("does not retry queued draft invitations", async () => {
      setMockFromImplementation(() =>
        createChainableMock({
          data: [{
            hackathon_id: "h1",
            hackathons: { status: "draft", starts_at: null, ends_at: null },
          }],
          error: null,
        })
      )

      await expect(retryPendingTeamInvitationEmails()).resolves.toEqual({
        events: 0,
        sent: 0,
        failed: 0,
      })
      expect(mockSendTeamInvitationEmail).not.toHaveBeenCalled()
    })

    it("surfaces retry queue failures", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: null, error: { message: "retry lookup failed" } })
      )
      await expect(retryPendingTeamInvitationEmails()).rejects.toThrow(
        "Failed to load retryable team invitations: retry lookup failed"
      )
    })
  })
})
