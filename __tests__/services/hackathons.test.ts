import { describe, it, expect, beforeEach } from "bun:test"
import type { Hackathon } from "@/lib/db/hackathon-types"
import {
  createChainableMock,
  resetSupabaseMocks,
  resetClerkMocks,
  mockClerkClient,
  setMockFromImplementation,
  setMockRpcImplementation,
} from "../lib/supabase-mock"

const {
  listParticipatingHackathons,
  listOrganizedHackathons,
  listSponsoredHackathons,
  isUserRegistered,
  getParticipantCount,
  getRegistrationInfo,
  registerForHackathon,
  getParticipantTeamInfo,
  listTeamsWithMembers,
  modifyTeamMembers,
  bulkAssignTeams,
} = await import("@/lib/services/hackathons")

const mockHackathon: Hackathon = {
  id: "h1",
  tenant_id: "t1",
  name: "Test Hackathon",
  slug: "test-hackathon",
  description: "A test hackathon",
  rules: null,
  starts_at: null,
  ends_at: null,
  registration_opens_at: null,
  registration_closes_at: null,
  allow_late_registration: true,
  max_participants: null,
  min_team_size: 1,
  max_team_size: 5,
  allow_solo: true,
  require_team_approval: false,
  status: "published",
  banner_url: null,
  metadata: {},
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
}

describe("Hackathons Service", () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  describe("listParticipatingHackathons", () => {
    it("returns hackathons the user participates in", async () => {
      const chain = createChainableMock({
        data: [
          {
            hackathon_id: "h1",
            role: "participant",
            hackathons: mockHackathon,
          },
        ],
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await listParticipatingHackathons("user_123")

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe("Test Hackathon")
      expect(result[0].role).toBe("participant")
    })

    it("returns empty array when user has no hackathons", async () => {
      const chain = createChainableMock({ data: [], error: null })
      setMockFromImplementation(() => chain)

      const result = await listParticipatingHackathons("user_empty")

      expect(result).toEqual([])
    })

    it("returns empty array on error", async () => {
      const chain = createChainableMock({
        data: null,
        error: { message: "DB error" },
      })
      setMockFromImplementation(() => chain)

      const result = await listParticipatingHackathons("user_err")

      expect(result).toEqual([])
    })

    it("filters out rows where hackathons is null", async () => {
      const chain = createChainableMock({
        data: [
          { hackathon_id: "h1", role: "participant", hackathons: null },
          {
            hackathon_id: "h2",
            role: "judge",
            hackathons: { ...mockHackathon, id: "h2", name: "Second" },
          },
        ],
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await listParticipatingHackathons("user_mixed")

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe("Second")
      expect(result[0].role).toBe("judge")
    })

    it("filters by search in memory", async () => {
      const chain = createChainableMock({
        data: [
          { hackathon_id: "h1", role: "participant", hackathons: { ...mockHackathon, name: "React Hack" } },
          { hackathon_id: "h2", role: "participant", hackathons: { ...mockHackathon, id: "h2", name: "Vue Hack" } },
        ],
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await listParticipatingHackathons("user_123", { search: "react" })

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe("React Hack")
    })

    it("searches description too", async () => {
      const chain = createChainableMock({
        data: [
          { hackathon_id: "h1", role: "participant", hackathons: { ...mockHackathon, name: "Generic", description: "Build with React" } },
        ],
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await listParticipatingHackathons("user_123", { search: "react" })

      expect(result).toHaveLength(1)
    })
  })

  describe("listOrganizedHackathons", () => {
    it("returns hackathons for the tenant", async () => {
      const chain = createChainableMock({
        data: [mockHackathon],
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await listOrganizedHackathons("t1")

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe("Test Hackathon")
    })

    it("returns empty array when tenant has no hackathons", async () => {
      const chain = createChainableMock({ data: [], error: null })
      setMockFromImplementation(() => chain)

      const result = await listOrganizedHackathons("t_empty")

      expect(result).toEqual([])
    })

    it("returns empty array on error", async () => {
      const chain = createChainableMock({
        data: null,
        error: { message: "DB error" },
      })
      setMockFromImplementation(() => chain)

      const result = await listOrganizedHackathons("t_err")

      expect(result).toEqual([])
    })

    it("applies search filter when search option provided", async () => {
      const chain = createChainableMock({
        data: [mockHackathon],
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await listOrganizedHackathons("t1", { search: "test" })

      expect(result).toHaveLength(1)
      expect(chain.or).toHaveBeenCalled()
    })

    it("skips search filter for short queries", async () => {
      const chain = createChainableMock({
        data: [mockHackathon],
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await listOrganizedHackathons("t1", { search: "a" })

      expect(result).toHaveLength(1)
      expect(chain.or).not.toHaveBeenCalled()
    })
  })

  describe("listSponsoredHackathons", () => {
    it("returns sponsored hackathons", async () => {
      const chain = createChainableMock({
        data: [{ hackathon_id: "h1", hackathons: mockHackathon }],
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await listSponsoredHackathons("t1")

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe("Test Hackathon")
    })

    it("returns empty array on error", async () => {
      const chain = createChainableMock({
        data: null,
        error: { message: "DB error" },
      })
      setMockFromImplementation(() => chain)

      const result = await listSponsoredHackathons("t_err")

      expect(result).toEqual([])
    })

    it("filters by search in memory", async () => {
      const chain = createChainableMock({
        data: [
          { hackathon_id: "h1", hackathons: { ...mockHackathon, name: "React Hack" } },
          { hackathon_id: "h2", hackathons: { ...mockHackathon, id: "h2", name: "Vue Hack" } },
        ],
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await listSponsoredHackathons("t1", { search: "react" })

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe("React Hack")
    })

    it("filters out rows where hackathons is null", async () => {
      const chain = createChainableMock({
        data: [
          { hackathon_id: "h1", hackathons: null },
          { hackathon_id: "h2", hackathons: mockHackathon },
        ],
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await listSponsoredHackathons("t1")

      expect(result).toHaveLength(1)
    })
  })

  describe("isUserRegistered", () => {
    it("returns true when user is registered", async () => {
      const chain = createChainableMock({
        data: { id: "p1" },
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await isUserRegistered("h1", "user_123")

      expect(result).toBe(true)
    })

    it("returns false when user is not registered", async () => {
      const chain = createChainableMock({
        data: null,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await isUserRegistered("h1", "user_new")

      expect(result).toBe(false)
    })

    it("returns false on error", async () => {
      const chain = createChainableMock({
        data: null,
        error: { message: "DB error" },
      })
      setMockFromImplementation(() => chain)

      const result = await isUserRegistered("h1", "user_err")

      expect(result).toBe(false)
    })
  })

  describe("getParticipantCount", () => {
    it("returns correct count", async () => {
      const chain = createChainableMock({
        data: null,
        error: null,
        count: 42,
      })
      setMockFromImplementation(() => chain)

      const result = await getParticipantCount("h1")

      expect(result).toBe(42)
    })

    it("returns 0 when no participants", async () => {
      const chain = createChainableMock({
        data: null,
        error: null,
        count: 0,
      })
      setMockFromImplementation(() => chain)

      const result = await getParticipantCount("h_empty")

      expect(result).toBe(0)
    })

    it("returns 0 on error", async () => {
      const chain = createChainableMock({
        data: null,
        error: { message: "DB error" },
        count: null,
      })
      setMockFromImplementation(() => chain)

      const result = await getParticipantCount("h_err")

      expect(result).toBe(0)
    })
  })

  describe("getRegistrationInfo", () => {
    it("returns both registration status and count in parallel", async () => {
      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createChainableMock({ data: { id: "p1" }, error: null })
        }
        return createChainableMock({ data: null, error: null, count: 25 })
      })

      const result = await getRegistrationInfo("h1", "user_123")

      expect(result.isRegistered).toBe(true)
      expect(result.participantCount).toBe(25)
    })

    it("returns not registered with correct count", async () => {
      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createChainableMock({ data: null, error: null })
        }
        return createChainableMock({ data: null, error: null, count: 10 })
      })

      const result = await getRegistrationInfo("h1", "user_new")

      expect(result.isRegistered).toBe(false)
      expect(result.participantCount).toBe(10)
    })

    it("handles errors gracefully", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: null, error: { message: "DB error" }, count: null })
      )

      const result = await getRegistrationInfo("h1", "user_err")

      expect(result.isRegistered).toBe(false)
      expect(result.participantCount).toBe(0)
    })
  })

  describe("registerForHackathon", () => {
    it("returns success when registration succeeds", async () => {
      setMockRpcImplementation(() =>
        Promise.resolve({
          data: [{ success: true, participant_id: "p123", error_code: null, error_message: null }],
          error: null,
        })
      )

      const result = await registerForHackathon("h1", "user_123")

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.participantId).toBe("p123")
      }
    })

    it("returns error when hackathon not found", async () => {
      setMockRpcImplementation(() =>
        Promise.resolve({
          data: [{ success: false, participant_id: null, error_code: "hackathon_not_found", error_message: "Hackathon not found" }],
          error: null,
        })
      )

      const result = await registerForHackathon("h_missing", "user_123")

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.code).toBe("hackathon_not_found")
      }
    })

    it("returns error when registration is not open", async () => {
      setMockRpcImplementation(() =>
        Promise.resolve({
          data: [{ success: false, participant_id: null, error_code: "registration_not_open", error_message: "Registration is not open" }],
          error: null,
        })
      )

      const result = await registerForHackathon("h1", "user_123")

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.code).toBe("registration_not_open")
      }
    })

    it("returns error when already registered", async () => {
      setMockRpcImplementation(() =>
        Promise.resolve({
          data: [{ success: false, participant_id: null, error_code: "already_registered", error_message: "Already registered for this hackathon" }],
          error: null,
        })
      )

      const result = await registerForHackathon("h1", "user_123")

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.code).toBe("already_registered")
      }
    })

    it("returns error when event has ended", async () => {
      setMockRpcImplementation(() =>
        Promise.resolve({
          data: [{ success: false, participant_id: null, error_code: "event_ended", error_message: "This event has ended" }],
          error: null,
        })
      )

      const result = await registerForHackathon("h1", "user_123")

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.code).toBe("event_ended")
      }
    })

    it("returns error when at capacity", async () => {
      setMockRpcImplementation(() =>
        Promise.resolve({
          data: [{ success: false, participant_id: null, error_code: "at_capacity", error_message: "Event is at full capacity" }],
          error: null,
        })
      )

      const result = await registerForHackathon("h1", "user_123")

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.code).toBe("at_capacity")
      }
    })

    it("returns error when RPC fails", async () => {
      setMockRpcImplementation(() =>
        Promise.resolve({
          data: null,
          error: { message: "RPC error" },
        })
      )

      const result = await registerForHackathon("h1", "user_123")

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

      const result = await registerForHackathon("h1", "user_123")

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.code).toBe("no_result")
      }
    })
  })

  describe("getParticipantTeamInfo", () => {
    beforeEach(() => {
      resetClerkMocks()
    })

    it("returns null when user has no team", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: null, error: null })
      )

      const result = await getParticipantTeamInfo("h1", "user_123")
      expect(result).toBeNull()
    })

    it("includes email from Clerk for each member", async () => {
      const participantsCalls = { count: 0 }
      setMockFromImplementation((table) => {
        if (table === "hackathon_participants") {
          participantsCalls.count++
          if (participantsCalls.count === 1) {
            return createChainableMock({ data: { team_id: "team_1" }, error: null })
          }
          return createChainableMock({
            data: [{ clerk_user_id: "user_captain", role: "participant", registered_at: "2026-01-01T00:00:00Z" }],
            error: null,
          })
        }
        if (table === "teams") {
          return createChainableMock({
            data: { id: "team_1", name: "Test Team", status: "forming", invite_code: "abc123", captain_clerk_user_id: "user_captain" },
            error: null,
          })
        }
        if (table === "team_invitations") {
          return createChainableMock({ data: [], error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      mockClerkClient.mockResolvedValueOnce({
        users: {
          getUserList: () =>
            Promise.resolve({
              data: [
                {
                  id: "user_captain",
                  firstName: "Alex",
                  lastName: "Smith",
                  username: null,
                  emailAddresses: [{ emailAddress: "alex@example.com" }],
                },
              ],
            }),
        },
      })

      const result = await getParticipantTeamInfo("h1", "user_captain")
      expect(result).not.toBeNull()
      expect(result!.members).toHaveLength(1)
      expect(result!.members[0].email).toBe("alex@example.com")
      expect(result!.members[0].displayName).toBe("Alex Smith")
    })

    it("exposes pending invitation tokens to the captain", async () => {
      const participantsCalls = { count: 0 }
      setMockFromImplementation((table) => {
        if (table === "hackathon_participants") {
          participantsCalls.count++
          if (participantsCalls.count === 1) {
            return createChainableMock({ data: { team_id: "team_1" }, error: null })
          }
          return createChainableMock({
            data: [{ clerk_user_id: "user_captain", role: "participant", registered_at: "2026-01-01T00:00:00Z" }],
            error: null,
          })
        }
        if (table === "teams") {
          return createChainableMock({
            data: { id: "team_1", name: "Test Team", status: "forming", invite_code: "abc123", captain_clerk_user_id: "user_captain" },
            error: null,
          })
        }
        if (table === "team_invitations") {
          return createChainableMock({
            data: [
              {
                id: "inv_1",
                email: "newbie@example.com",
                expires_at: "2026-12-31T00:00:00Z",
                created_at: "2026-04-01T00:00:00Z",
                reminded_at: null,
                token: "secret-token-abc",
              },
            ],
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      mockClerkClient.mockResolvedValueOnce({
        users: {
          getUserList: () =>
            Promise.resolve({
              data: [
                {
                  id: "user_captain",
                  firstName: "Alex",
                  lastName: "Smith",
                  username: null,
                  emailAddresses: [{ emailAddress: "alex@example.com" }],
                },
              ],
            }),
        },
      })

      const result = await getParticipantTeamInfo("h1", "user_captain")
      expect(result).not.toBeNull()
      expect(result!.pendingInvitations).toHaveLength(1)
      expect(result!.pendingInvitations[0].token).toBe("secret-token-abc")
      expect(result!.pendingInvitations[0].email).toBe("newbie@example.com")
    })

    it("hides pending invitation tokens from non-captain teammates", async () => {
      const participantsCalls = { count: 0 }
      setMockFromImplementation((table) => {
        if (table === "hackathon_participants") {
          participantsCalls.count++
          if (participantsCalls.count === 1) {
            return createChainableMock({ data: { team_id: "team_1" }, error: null })
          }
          return createChainableMock({
            data: [
              { clerk_user_id: "user_captain", role: "participant", registered_at: "2026-01-01T00:00:00Z" },
              { clerk_user_id: "user_member", role: "participant", registered_at: "2026-01-02T00:00:00Z" },
            ],
            error: null,
          })
        }
        if (table === "teams") {
          return createChainableMock({
            data: { id: "team_1", name: "Test Team", status: "forming", invite_code: "abc123", captain_clerk_user_id: "user_captain" },
            error: null,
          })
        }
        if (table === "team_invitations") {
          return createChainableMock({
            data: [
              {
                id: "inv_1",
                email: "newbie@example.com",
                expires_at: "2026-12-31T00:00:00Z",
                created_at: "2026-04-01T00:00:00Z",
                reminded_at: null,
                token: "secret-token-abc",
              },
            ],
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      mockClerkClient.mockResolvedValueOnce({
        users: {
          getUserList: () => Promise.resolve({ data: [] }),
        },
      })

      const result = await getParticipantTeamInfo("h1", "user_member")
      expect(result).not.toBeNull()
      expect(result!.isCaptain).toBe(false)
      expect(result!.pendingInvitations).toHaveLength(1)
      expect(result!.pendingInvitations[0].token).toBeNull()
    })

    it("sets email to null when Clerk call fails", async () => {
      const participantsCalls = { count: 0 }
      setMockFromImplementation((table) => {
        if (table === "hackathon_participants") {
          participantsCalls.count++
          if (participantsCalls.count === 1) {
            return createChainableMock({ data: { team_id: "team_1" }, error: null })
          }
          return createChainableMock({
            data: [{ clerk_user_id: "user_captain", role: "participant", registered_at: "2026-01-01T00:00:00Z" }],
            error: null,
          })
        }
        if (table === "teams") {
          return createChainableMock({
            data: { id: "team_1", name: "Test Team", status: "forming", invite_code: "abc123", captain_clerk_user_id: "user_captain" },
            error: null,
          })
        }
        if (table === "team_invitations") {
          return createChainableMock({ data: [], error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      mockClerkClient.mockRejectedValueOnce(new Error("Clerk unavailable"))

      const result = await getParticipantTeamInfo("h1", "user_captain")
      expect(result).not.toBeNull()
      expect(result!.members[0].email).toBeNull()
      expect(result!.members[0].displayName).toBeNull()
    })

    it("returns the assigned room when the team is in room_teams", async () => {
      const participantsCalls = { count: 0 }
      setMockFromImplementation((table) => {
        if (table === "hackathon_participants") {
          participantsCalls.count++
          if (participantsCalls.count === 1) {
            return createChainableMock({ data: { team_id: "team_1" }, error: null })
          }
          return createChainableMock({
            data: [{ clerk_user_id: "user_captain", role: "participant", registered_at: "2026-01-01T00:00:00Z" }],
            error: null,
          })
        }
        if (table === "teams") {
          return createChainableMock({
            data: { id: "team_1", name: "Test Team", status: "forming", invite_code: "abc123", captain_clerk_user_id: "user_captain" },
            error: null,
          })
        }
        if (table === "team_invitations") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "room_teams") {
          return createChainableMock({
            data: { room_id: "room_1", rooms: { id: "room_1", name: "Room A" } },
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      mockClerkClient.mockResolvedValueOnce({
        users: { getUserList: () => Promise.resolve({ data: [] }) },
      })

      const result = await getParticipantTeamInfo("h1", "user_captain")
      expect(result).not.toBeNull()
      expect(result!.room).toEqual({ id: "room_1", name: "Room A" })
    })

    it("returns null room when the team is not assigned to a room", async () => {
      const participantsCalls = { count: 0 }
      setMockFromImplementation((table) => {
        if (table === "hackathon_participants") {
          participantsCalls.count++
          if (participantsCalls.count === 1) {
            return createChainableMock({ data: { team_id: "team_1" }, error: null })
          }
          return createChainableMock({
            data: [{ clerk_user_id: "user_captain", role: "participant", registered_at: "2026-01-01T00:00:00Z" }],
            error: null,
          })
        }
        if (table === "teams") {
          return createChainableMock({
            data: { id: "team_1", name: "Test Team", status: "forming", invite_code: "abc123", captain_clerk_user_id: "user_captain" },
            error: null,
          })
        }
        if (table === "team_invitations") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "room_teams") {
          return createChainableMock({ data: null, error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      mockClerkClient.mockResolvedValueOnce({
        users: { getUserList: () => Promise.resolve({ data: [] }) },
      })

      const result = await getParticipantTeamInfo("h1", "user_captain")
      expect(result).not.toBeNull()
      expect(result!.room).toBeNull()
    })

    it("returns null room and continues when room_teams query errors", async () => {
      const participantsCalls = { count: 0 }
      setMockFromImplementation((table) => {
        if (table === "hackathon_participants") {
          participantsCalls.count++
          if (participantsCalls.count === 1) {
            return createChainableMock({ data: { team_id: "team_1" }, error: null })
          }
          return createChainableMock({
            data: [{ clerk_user_id: "user_captain", role: "participant", registered_at: "2026-01-01T00:00:00Z" }],
            error: null,
          })
        }
        if (table === "teams") {
          return createChainableMock({
            data: { id: "team_1", name: "Test Team", status: "forming", invite_code: "abc123", captain_clerk_user_id: "user_captain" },
            error: null,
          })
        }
        if (table === "team_invitations") {
          return createChainableMock({ data: [], error: null })
        }
        if (table === "room_teams") {
          return createChainableMock({ data: null, error: { message: "db went sideways" } })
        }
        return createChainableMock({ data: null, error: null })
      })

      mockClerkClient.mockResolvedValueOnce({
        users: { getUserList: () => Promise.resolve({ data: [] }) },
      })

      const result = await getParticipantTeamInfo("h1", "user_captain")
      expect(result).not.toBeNull()
      expect(result!.room).toBeNull()
      expect(result!.team.id).toBe("team_1")
    })
  })

  describe("listTeamsWithMembers", () => {
    beforeEach(() => {
      resetClerkMocks()
      mockClerkClient.mockResolvedValue({
        users: { getUserList: () => Promise.resolve({ data: [] }) },
      } as never)
    })

    function mockTables(rows: {
      teams?: unknown[]
      participants?: unknown[]
      submissions?: unknown[]
      room_teams?: unknown[]
      team_invitations?: unknown[]
    }) {
      setMockFromImplementation((table) => {
        switch (table) {
          case "teams":
            return createChainableMock({ data: rows.teams ?? [], error: null })
          case "hackathon_participants":
            return createChainableMock({ data: rows.participants ?? [], error: null })
          case "submissions":
            return createChainableMock({ data: rows.submissions ?? [], error: null })
          case "room_teams":
            return createChainableMock({ data: rows.room_teams ?? [], error: null })
          case "team_invitations":
            return createChainableMock({ data: rows.team_invitations ?? [], error: null })
          default:
            return createChainableMock({ data: [], error: null })
        }
      })
    }

    it("plumbs reminded_at through onto pending member invitations", async () => {
      mockTables({
        teams: [
          { id: "team_1", name: "Rocket", status: "active", mode: null, captain_clerk_user_id: "user_cap", pending_captain_email: null },
        ],
        team_invitations: [
          { id: "inv_member_reminded", team_id: "team_1", email: "reminded@example.com", is_captain_invite: false, created_at: "2026-05-05T00:00:00Z", reminded_at: "2026-05-06T12:00:00Z" },
          { id: "inv_member_fresh", team_id: "team_1", email: "fresh@example.com", is_captain_invite: false, created_at: "2026-05-05T00:00:00Z", reminded_at: null },
        ],
      })

      const result = await listTeamsWithMembers("h1")
      expect(result).toHaveLength(1)

      const team = result[0]
      const reminded = team.pendingInvitations.find((inv) => inv.email === "reminded@example.com")!
      expect(reminded.remindedAt).toBe("2026-05-06T12:00:00Z")
      const fresh = team.pendingInvitations.find((inv) => inv.email === "fresh@example.com")!
      expect(fresh.remindedAt).toBeNull()
    })

    it("populates pendingCaptainRemindedAt from the captain invitation row", async () => {
      mockTables({
        teams: [
          { id: "team_1", name: "Rocket", status: "active", mode: null, captain_clerk_user_id: null, pending_captain_email: "captain@example.com" },
        ],
        team_invitations: [
          { id: "inv_captain", team_id: "team_1", email: "captain@example.com", is_captain_invite: true, created_at: "2026-05-01T00:00:00Z", reminded_at: "2026-05-02T15:00:00Z" },
        ],
      })

      const result = await listTeamsWithMembers("h1")
      expect(result[0].pendingCaptainInvitationId).toBe("inv_captain")
      expect(result[0].pendingCaptainRemindedAt).toBe("2026-05-02T15:00:00Z")
    })

    it("leaves pendingCaptainRemindedAt null when there is no captain invitation", async () => {
      mockTables({
        teams: [
          { id: "team_1", name: "Rocket", status: "active", mode: null, captain_clerk_user_id: "user_cap", pending_captain_email: null },
        ],
      })

      const result = await listTeamsWithMembers("h1")
      expect(result[0].pendingCaptainInvitationId).toBeNull()
      expect(result[0].pendingCaptainRemindedAt).toBeNull()
    })

    it("takes the first captain invitation row when multiple exist", async () => {
      mockTables({
        teams: [
          { id: "team_1", name: "Rocket", status: "active", mode: null, captain_clerk_user_id: null, pending_captain_email: "captain@example.com" },
        ],
        team_invitations: [
          { id: "inv_captain_first", team_id: "team_1", email: "old@example.com", is_captain_invite: true, created_at: "2026-05-01T00:00:00Z", reminded_at: "2026-05-02T10:00:00Z" },
          { id: "inv_captain_second", team_id: "team_1", email: "new@example.com", is_captain_invite: true, created_at: "2026-05-03T00:00:00Z", reminded_at: null },
        ],
      })

      const result = await listTeamsWithMembers("h1")
      expect(result[0].pendingCaptainInvitationId).toBe("inv_captain_first")
      expect(result[0].pendingCaptainRemindedAt).toBe("2026-05-02T10:00:00Z")
    })

    it("requests a full page of users so more than 10 members resolve", async () => {
      const memberIds = Array.from({ length: 25 }, (_, i) => `user_${i}`)
      mockTables({
        teams: [
          { id: "team_1", name: "Rocket", status: "active", mode: null, captain_clerk_user_id: "user_0", pending_captain_email: null },
        ],
        participants: memberIds.map((id) => ({ clerk_user_id: id, role: "participant", team_id: "team_1" })),
      })

      let capturedArgs: { userId: string[]; limit?: number } | null = null
      mockClerkClient.mockResolvedValueOnce({
        users: {
          getUserList: (args: { userId: string[]; limit?: number }) => {
            capturedArgs = args
            return Promise.resolve({
              data: memberIds.map((id) => ({
                id,
                firstName: id,
                lastName: null,
                username: null,
                emailAddresses: [{ emailAddress: `${id}@example.com` }],
              })),
            })
          },
        },
      } as never)

      const result = await listTeamsWithMembers("h1")

      expect(capturedArgs!.limit).toBe(100)
      expect(result[0].members).toHaveLength(25)
      expect(result[0].members.every((m) => m.displayName !== null)).toBe(true)
    })
  })

  describe("modifyTeamMembers", () => {
    const hackathonId = "11111111-1111-1111-1111-111111111111"
    const teamId = "22222222-2222-2222-2222-222222222222"

    it("updates members only after verifying the team belongs to the hackathon", async () => {
      setMockFromImplementation((table) => {
        if (table === "teams") return createChainableMock({ data: { id: "team_1" }, error: null })
        if (table === "hackathon_participants") return createChainableMock({ data: [{ id: "participant_1" }], error: null })
        return createChainableMock({ data: null, error: null })
      })

      expect(await modifyTeamMembers(teamId, hackathonId, { add: ["user_1"] })).toBe(true)
    })

    it("rejects a team from another hackathon", async () => {
      setMockFromImplementation(() => createChainableMock({ data: null, error: null }))

      expect(await modifyTeamMembers("33333333-3333-3333-3333-333333333333", hackathonId, { add: ["user_1"] })).toBe(false)
    })

    it("fails when a requested member was not updated", async () => {
      setMockFromImplementation((table) => {
        if (table === "teams") return createChainableMock({ data: { id: "team_1" }, error: null })
        return createChainableMock({ data: [], error: null })
      })

      expect(await modifyTeamMembers(teamId, hackathonId, { remove: ["user_missing"] })).toBe(false)
    })
  })

  describe("bulkAssignTeams", () => {
    const hackathonId = "11111111-1111-1111-1111-111111111111"
    const teamId = "22222222-2222-2222-2222-222222222222"
    const roomId = "33333333-3333-3333-3333-333333333333"

    it("checks every team and room before calling the assignment RPC", async () => {
      setMockFromImplementation((table) => {
        if (table === "teams") return createChainableMock({ data: [{ id: "team_1" }], error: null })
        if (table === "rooms") return createChainableMock({ data: [{ id: "room_1" }], error: null })
        return createChainableMock({ data: null, error: null })
      })
      setMockRpcImplementation(() => Promise.resolve({
        data: [{ success: true, assigned_count: 1 }],
        error: null,
      }))

      expect(await bulkAssignTeams(hackathonId, [{ teamId, roomId }])).toEqual({
        success: true,
        assignedCount: 1,
      })
    })

    it("rejects assignments containing another event's resources", async () => {
      setMockFromImplementation((table) => {
        if (table === "teams") return createChainableMock({ data: [{ id: "team_1" }], error: null })
        if (table === "rooms") return createChainableMock({ data: [], error: null })
        return createChainableMock({ data: null, error: null })
      })

      expect(await bulkAssignTeams(hackathonId, [{
        teamId,
        roomId: "44444444-4444-4444-4444-444444444444",
      }])).toEqual({
        success: false,
        assignedCount: 0,
      })
    })
  })
})
