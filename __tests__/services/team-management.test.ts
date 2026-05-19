import { describe, it, expect, beforeEach, mock } from "bun:test"
import {
  createChainableMock,
  mockClerkClient,
  resetSupabaseMocks,
  resetClerkMocks,
  setMockFromImplementation,
  setMockRpcImplementation,
  type ChainableMock,
} from "../lib/supabase-mock"

const mockSendTeamDeniedEmails = mock(() => Promise.resolve(2))

mock.module("@/lib/email/team-review", () => ({
  sendTeamDeniedEmails: mockSendTeamDeniedEmails,
}))

const { deleteTeam, setTeamCaptain, approvePendingTeam, denyPendingTeam } = await import("@/lib/services/hackathons")

type SupaResult = { data: unknown; error: { message: string } | null; count?: number | null }

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

describe("deleteTeam", () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  it("returns not_found when team doesn't exist", async () => {
    setMockFromImplementation(
      tableImpl({
        teams: { data: null, error: { message: "no rows" } },
      })
    )

    const result = await deleteTeam("team_1", "hackathon_1")
    expect(result).toEqual({ error: "Team not found", code: "not_found" })
  })

  it("blocks delete when hackathon status is judging", async () => {
    setMockFromImplementation(
      tableImpl({
        teams: { data: { id: "team_1", hackathon_id: "h_1", hackathons: { status: "judging" } }, error: null },
      })
    )

    const result = await deleteTeam("team_1", "h_1")
    expect(result).toEqual({ error: "Teams can't be deleted once judging has started", code: "status_locked" })
  })

  it("blocks delete when hackathon status is completed", async () => {
    setMockFromImplementation(
      tableImpl({
        teams: { data: { id: "team_1", hackathon_id: "h_1", hackathons: { status: "completed" } }, error: null },
      })
    )

    const result = await deleteTeam("team_1", "h_1")
    expect(result.success).toBeUndefined()
    if ("error" in result) expect(result.code).toBe("status_locked")
  })

  it("blocks delete when a submitted submission exists", async () => {
    setMockFromImplementation(
      tableImpl({
        teams: { data: { id: "team_1", hackathon_id: "h_1", hackathons: { status: "active" } }, error: null },
        submissions: { data: null, error: null, count: 1 },
      })
    )

    const result = await deleteTeam("team_1", "h_1")
    expect(result.success).toBeUndefined()
    if ("error" in result) expect(result.code).toBe("submission_exists")
  })

  it("filters submission lookup by status='submitted' (drafts/withdrawn don't block)", async () => {
    const submissionsChain = createChainableMock({ data: null, error: null, count: 0 })
    const invitationsChain = createChainableMock({ data: [], error: null })
    setMockFromImplementation((table: string): ChainableMock => {
      if (table === "teams") {
        return createChainableMock({
          data: { id: "team_1", hackathon_id: "h_1", hackathons: { status: "active" } },
          error: null,
        })
      }
      if (table === "submissions") return submissionsChain
      if (table === "team_invitations") return invitationsChain
      return createChainableMock({ data: null, error: null, count: 0 })
    })

    await deleteTeam("team_1", "h_1")

    const submissionEqCalls = submissionsChain.eq.mock.calls as unknown as unknown[][]
    expect(submissionEqCalls).toContainEqual(["status", "submitted"])
  })

  it("sets updated_at when cancelling pending invitations on delete", async () => {
    const invitationsChain = createChainableMock({ data: [{ id: "i_1" }], error: null })
    setMockFromImplementation((table: string): ChainableMock => {
      if (table === "teams") {
        return createChainableMock({
          data: { id: "team_1", hackathon_id: "h_1", hackathons: { status: "active" } },
          error: null,
        })
      }
      if (table === "team_invitations") return invitationsChain
      return createChainableMock({ data: null, error: null, count: 0 })
    })

    await deleteTeam("team_1", "h_1")

    const updateCalls = invitationsChain.update.mock.calls as unknown as unknown[][]
    const updateCall = updateCalls[0]?.[0] as Record<string, unknown> | undefined
    expect(updateCall?.status).toBe("cancelled")
    expect(typeof updateCall?.updated_at).toBe("string")
  })

  it("deletes the team and cascades members, invites, and room assignments", async () => {
    setMockFromImplementation(
      tableImpl({
        teams: [
          { data: { id: "team_1", hackathon_id: "h_1", hackathons: { status: "active" } }, error: null },
          { data: null, error: null },
        ],
        submissions: { data: null, error: null, count: 0 },
        hackathon_participants: { data: null, error: null, count: 2 },
        room_teams: { data: null, error: null, count: 1 },
        team_invitations: { data: [{ id: "i_1" }], error: null },
      })
    )

    const result = await deleteTeam("team_1", "h_1")
    expect(result).toEqual({
      success: true,
      membersUnassigned: 2,
      invitesCancelled: 1,
      roomsCleared: 1,
    })
  })
})

describe("setTeamCaptain", () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  it("returns not_found when the team doesn't exist", async () => {
    setMockFromImplementation(
      tableImpl({
        teams: { data: null, error: { message: "no rows" } },
      })
    )

    const result = await setTeamCaptain("team_1", "h_1", "user_1")
    expect(result).toEqual({ error: "Team not found", code: "not_found" })
  })

  it("no-ops when the requested captain is already the captain", async () => {
    setMockFromImplementation(
      tableImpl({
        teams: { data: { id: "team_1", name: "Team One", mode: null, captain_clerk_user_id: "user_1" }, error: null },
      })
    )

    const result = await setTeamCaptain("team_1", "h_1", "user_1")
    expect(result).toEqual({ success: true, team: { id: "team_1", name: "Team One", mode: null } })
  })

  it("rejects captain change once hackathon is in judging", async () => {
    setMockFromImplementation(
      tableImpl({
        teams: { data: { id: "team_1", name: "Team One", mode: null, captain_clerk_user_id: "user_old", hackathons: { status: "judging" } }, error: null },
      })
    )

    const result = await setTeamCaptain("team_1", "h_1", "user_new")
    expect(result.success).toBeUndefined()
    if ("error" in result) expect(result.code).toBe("status_locked")
  })

  it("rejects setting a non-member as captain", async () => {
    setMockFromImplementation(
      tableImpl({
        teams: { data: { id: "team_1", name: "Team One", mode: null, captain_clerk_user_id: "user_existing" }, error: null },
        hackathon_participants: { data: null, error: null },
      })
    )

    const result = await setTeamCaptain("team_1", "h_1", "user_outsider")
    expect(result).toEqual({ error: "That person isn't on this team", code: "not_member" })
  })

  it("promotes a member to captain", async () => {
    setMockFromImplementation(
      tableImpl({
        teams: [
          { data: { id: "team_1", name: "Team One", mode: "in_person", captain_clerk_user_id: "user_old" }, error: null },
          { data: { id: "team_1", name: "Team One", mode: "in_person" }, error: null },
        ],
        hackathon_participants: { data: { id: "p_1" }, error: null },
        team_invitations: { data: [], error: null },
      })
    )

    const result = await setTeamCaptain("team_1", "h_1", "user_new")
    expect(result).toEqual({ success: true, team: { id: "team_1", name: "Team One", mode: "in_person" } })
  })
})

describe("team approvals", () => {
  beforeEach(() => {
    resetSupabaseMocks()
    resetClerkMocks()
    mockSendTeamDeniedEmails.mockClear()
    mockSendTeamDeniedEmails.mockResolvedValue(2)
  })

  it("approves a pending team", async () => {
    setMockFromImplementation(
      tableImpl({
        teams: [
          { data: { id: "team_1", name: "Team One", status: "pending_approval" }, error: null },
          { data: { id: "team_1", name: "Team One", status: "forming" }, error: null },
        ],
      })
    )

    const result = await approvePendingTeam("team_1", "h_1")
    expect(result).toEqual({
      success: true,
      team: { id: "team_1", name: "Team One", status: "forming" },
    })
  })

  it("rejects approve when team is not pending", async () => {
    setMockFromImplementation(
      tableImpl({
        teams: { data: { id: "team_1", name: "Team One", status: "forming" }, error: null },
      })
    )

    const result = await approvePendingTeam("team_1", "h_1")
    expect(result).toEqual({ error: "This team is not waiting for approval", code: "not_pending" })
  })

  it("denies a pending team and unassigns people", async () => {
    setMockFromImplementation(
      tableImpl({
        hackathons: { data: { name: "Hack One", slug: "hack-one" }, error: null },
      })
    )
    setMockRpcImplementation(() =>
      Promise.resolve({
        data: [{
          success: true,
          error_code: null,
          error_message: null,
          team_id: "team_1",
          team_name: "Team One",
          team_status: "disbanded",
          members_unassigned: 2,
          invites_cancelled: 1,
          cancelled_invitation_ids: ["inv_1"],
          member_clerk_user_ids: ["user_1", "user_2"],
        }],
        error: null,
      })
    )
    mockClerkClient.mockImplementation(() =>
      Promise.resolve({
        organizations: {
          getOrganization: mock(() => Promise.resolve({ name: "Test Org" })),
        },
        users: {
          getUserList: mock(() =>
            Promise.resolve({
              data: [
                { primaryEmailAddress: { emailAddress: "one@example.com" }, emailAddresses: [] },
                { primaryEmailAddress: { emailAddress: "two@example.com" }, emailAddresses: [] },
              ],
            })
          ),
        },
      })
    )

    const result = await denyPendingTeam("team_1", "h_1")
    expect(result).toEqual({
      success: true,
      team: { id: "team_1", name: "Team One", status: "disbanded" },
      membersUnassigned: 2,
      invitesCancelled: 1,
      membersNotified: 2,
    })
    expect(mockSendTeamDeniedEmails).toHaveBeenCalledWith({
      recipients: ["one@example.com", "two@example.com"],
      teamName: "Team One",
      hackathonName: "Hack One",
      hackathonSlug: "hack-one",
    })
  })

  it("returns not_pending from the deny RPC", async () => {
    setMockRpcImplementation(() =>
      Promise.resolve({
        data: [{
          success: false,
          error_code: "not_pending",
          error_message: "This team is not waiting for approval",
          team_id: "team_1",
          team_name: "Team One",
          team_status: "forming",
          members_unassigned: 0,
          invites_cancelled: 0,
          cancelled_invitation_ids: [],
          member_clerk_user_ids: [],
        }],
        error: null,
      })
    )

    const result = await denyPendingTeam("team_1", "h_1")
    expect(result).toEqual({ error: "This team is not waiting for approval", code: "not_pending" })
  })
})
