import { describe, it, expect, beforeEach, mock } from "bun:test"
import {
  createChainableMock,
  mockClerkClient,
  resetSupabaseMocks,
  resetClerkMocks,
  setMockFromImplementation,
  setMockRpcImplementation,
} from "../lib/supabase-mock"

const mockSendTeamDeniedEmail = mock(() => Promise.resolve({ success: true }))
const mockSendTeamApprovedEmail = mock(() => Promise.resolve({ success: true }))

mock.module("@/lib/email/team-review", () => ({
  sendTeamApprovedEmail: mockSendTeamApprovedEmail,
  sendTeamDeniedEmail: mockSendTeamDeniedEmail,
}))

const {
  deleteTeam,
  setTeamCaptain,
  approvePendingTeam,
  denyPendingTeam,
  denyPendingTeamsForClosedHackathon,
} = await import("@/lib/services/hackathons")

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
    setMockRpcImplementation(() => Promise.resolve({
      data: [{ success: false, error_code: "not_found" }],
      error: null,
    }))

    const result = await deleteTeam("team_1", "hackathon_1")
    expect(result).toEqual({ error: "Team not found", code: "not_found" })
  })

  it("blocks delete when hackathon status is judging", async () => {
    setMockRpcImplementation(() => Promise.resolve({
      data: [{ success: false, error_code: "status_locked" }],
      error: null,
    }))

    const result = await deleteTeam("team_1", "h_1")
    expect(result).toEqual({ error: "Teams can't be deleted once judging has started", code: "status_locked" })
  })

  it("blocks delete when hackathon status is completed", async () => {
    setMockRpcImplementation(() => Promise.resolve({
      data: [{ success: false, error_code: "status_locked" }],
      error: null,
    }))

    const result = await deleteTeam("team_1", "h_1")
    expect(result.success).toBeUndefined()
    if ("error" in result) expect(result.code).toBe("status_locked")
  })

  it("blocks delete when a submitted submission exists", async () => {
    setMockRpcImplementation(() => Promise.resolve({
      data: [{ success: false, error_code: "submission_exists" }],
      error: null,
    }))

    const result = await deleteTeam("team_1", "h_1")
    expect(result.success).toBeUndefined()
    if ("error" in result) expect(result.code).toBe("submission_exists")
  })

  it("blocks deletion for any project state so draft work is not lost", async () => {
    setMockRpcImplementation(() => Promise.resolve({
      data: [{ success: false, error_code: "submission_exists" }],
      error: null,
    }))

    const result = await deleteTeam("team_1", "h_1")
    expect(result).toEqual({
      error: "This team has a submission. Delete the submission first.",
      code: "submission_exists",
    })
  })

  it("returns the invitation count from the atomic delete", async () => {
    setMockRpcImplementation(() => Promise.resolve({
      data: [{
        success: true,
        error_code: null,
        members_unassigned: 0,
        invites_cancelled: 1,
        rooms_cleared: 0,
        invitation_ids: [],
      }],
      error: null,
    }))

    const result = await deleteTeam("team_1", "h_1")
    expect(result.success).toBe(true)
    if ("success" in result) expect(result.invitesCancelled).toBe(1)
  })

  it("deletes the team and cascades members, invites, and room assignments", async () => {
    setMockRpcImplementation(() => Promise.resolve({
      data: [{
        success: true,
        error_code: null,
        members_unassigned: 2,
        invites_cancelled: 1,
        rooms_cleared: 1,
        invitation_ids: [],
      }],
      error: null,
    }))

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
    mockSendTeamApprovedEmail.mockClear()
    mockSendTeamApprovedEmail.mockResolvedValue({ success: true })
    mockSendTeamDeniedEmail.mockClear()
    mockSendTeamDeniedEmail.mockResolvedValue({ success: true })
  })

  it("approves a pending team", async () => {
    setMockFromImplementation(
      tableImpl({
        hackathons: { data: { name: "Hack One", slug: "hack-one" }, error: null },
        hackathon_participants: {
          data: [
            { clerk_user_id: "user_1" },
            { clerk_user_id: "user_2" },
          ],
          error: null,
        },
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
          team_status: "forming",
          member_clerk_user_ids: ["user_1", null, "user_2"],
        }],
        error: null,
      })
    )
    const mockGetUserList = mock(() =>
      Promise.resolve({
        data: [
          { primaryEmailAddress: { emailAddress: "one@example.com" }, emailAddresses: [] },
          { primaryEmailAddress: { emailAddress: "two@example.com" }, emailAddresses: [] },
        ],
      })
    )
    mockClerkClient.mockImplementation(() =>
      Promise.resolve({
        organizations: {
          getOrganization: mock(() => Promise.resolve({ name: "Test Org" })),
        },
        users: {
          getUserList: mockGetUserList,
        },
      })
    )

    const result = await approvePendingTeam("team_1", "h_1")
    expect(result).toEqual({
      success: true,
      team: { id: "team_1", name: "Team One", status: "forming" },
      membersNotified: 2,
    })
    expect(mockSendTeamApprovedEmail).toHaveBeenCalledTimes(2)
    expect(mockSendTeamApprovedEmail).toHaveBeenNthCalledWith(1, {
      to: "one@example.com",
      teamId: "team_1",
      teamName: "Team One",
      hackathonName: "Hack One",
      hackathonSlug: "hack-one",
    })
    expect(mockSendTeamApprovedEmail).toHaveBeenNthCalledWith(2, {
      to: "two@example.com",
      teamId: "team_1",
      teamName: "Team One",
      hackathonName: "Hack One",
      hackathonSlug: "hack-one",
    })
    expect(mockGetUserList).toHaveBeenCalledWith({ userId: ["user_1", "user_2"], limit: 100 })
  })

  it("does not email team members while the hackathon is a draft", async () => {
    setMockFromImplementation(
      tableImpl({
        hackathons: { data: { name: "Hack One", slug: "hack-one", status: "draft" }, error: null },
        hackathon_participants: {
          data: [
            { clerk_user_id: "user_1" },
          ],
          error: null,
        },
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
          team_status: "forming",
          member_clerk_user_ids: ["user_1"],
        }],
        error: null,
      })
    )

    const result = await approvePendingTeam("team_1", "h_1")

    expect(result).toEqual({
      success: true,
      team: { id: "team_1", name: "Team One", status: "forming" },
      membersNotified: 0,
    })
    expect(mockClerkClient).not.toHaveBeenCalled()
    expect(mockSendTeamApprovedEmail).not.toHaveBeenCalled()
  })

  it("sends one approval email per unique member email", async () => {
    setMockFromImplementation(
      tableImpl({
        hackathons: { data: { name: "Hack One", slug: "hack-one" }, error: null },
        hackathon_participants: {
          data: [
            { clerk_user_id: "user_1" },
            { clerk_user_id: "user_2" },
            { clerk_user_id: "user_3" },
          ],
          error: null,
        },
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
          team_status: "forming",
          member_clerk_user_ids: ["user_1", "user_2", "user_3"],
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
                { primaryEmailAddress: { emailAddress: " One@example.com " }, emailAddresses: [] },
                { primaryEmailAddress: { emailAddress: "two@example.com" }, emailAddresses: [] },
              ],
            })
          ),
        },
      })
    )

    const result = await approvePendingTeam("team_1", "h_1")

    expect(result).toEqual({
      success: true,
      team: { id: "team_1", name: "Team One", status: "forming" },
      membersNotified: 2,
    })
    expect(mockSendTeamApprovedEmail).toHaveBeenCalledTimes(2)
    expect(mockSendTeamApprovedEmail.mock.calls.map((call) => call[0].to)).toEqual([
      "one@example.com",
      "two@example.com",
    ])
  })

  it("rejects approve when team is not pending", async () => {
    setMockRpcImplementation(() =>
      Promise.resolve({
        data: [{
          success: false,
          error_code: "not_pending",
          error_message: "This team is not waiting for approval",
          team_id: "team_1",
          team_name: "Team One",
          team_status: "forming",
          member_clerk_user_ids: [],
        }],
        error: null,
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
          member_clerk_user_ids: ["user_1", null, "user_2"],
        }],
        error: null,
      })
    )
    const mockGetUserList = mock(() =>
      Promise.resolve({
        data: [
          { primaryEmailAddress: { emailAddress: "one@example.com" }, emailAddresses: [] },
          { primaryEmailAddress: { emailAddress: "two@example.com" }, emailAddresses: [] },
        ],
      })
    )
    mockClerkClient.mockImplementation(() =>
      Promise.resolve({
        organizations: {
          getOrganization: mock(() => Promise.resolve({ name: "Test Org" })),
        },
        users: {
          getUserList: mockGetUserList,
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
    expect(mockSendTeamDeniedEmail).toHaveBeenCalledTimes(2)
    expect(mockSendTeamDeniedEmail).toHaveBeenNthCalledWith(1, {
      to: "one@example.com",
      teamId: "team_1",
      teamName: "Team One",
      hackathonName: "Hack One",
      hackathonSlug: "hack-one",
    })
    expect(mockSendTeamDeniedEmail).toHaveBeenNthCalledWith(2, {
      to: "two@example.com",
      teamId: "team_1",
      teamName: "Team One",
      hackathonName: "Hack One",
      hackathonSlug: "hack-one",
    })
    expect(mockGetUserList).toHaveBeenCalledWith({ userId: ["user_1", "user_2"], limit: 100 })
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

  it("denies all pending teams when a hackathon closes", async () => {
    setMockFromImplementation(
      tableImpl({
        teams: { data: [{ id: "team_1" }, { id: "team_2" }], error: null },
        hackathons: { data: { name: "Hack One", slug: "hack-one", status: "completed" }, error: null },
      })
    )
    setMockRpcImplementation((_, params) => {
      const teamId = (params as { p_team_id: string }).p_team_id
      return Promise.resolve({
        data: [{
          success: true,
          error_code: null,
          error_message: null,
          team_id: teamId,
          team_name: teamId === "team_1" ? "Team One" : "Team Two",
          team_status: "disbanded",
          members_unassigned: 0,
          invites_cancelled: 0,
          cancelled_invitation_ids: [],
          member_clerk_user_ids: [],
        }],
        error: null,
      })
    })

    const result = await denyPendingTeamsForClosedHackathon("h_1")

    expect(result).toEqual({ denied: 2, failed: [] })
    expect(mockSendTeamDeniedEmail).not.toHaveBeenCalled()
  })

  it("reports pending closeout failures without stopping later teams", async () => {
    setMockFromImplementation(
      tableImpl({
        teams: { data: [{ id: "team_1" }, { id: "team_2" }], error: null },
        hackathons: { data: { name: "Hack One", slug: "hack-one", status: "completed" }, error: null },
      })
    )
    setMockRpcImplementation((_, params) => {
      const teamId = (params as { p_team_id: string }).p_team_id
      return Promise.resolve({
        data: [{
          success: teamId === "team_2",
          error_code: teamId === "team_1" ? "not_pending" : null,
          error_message: teamId === "team_1" ? "This team is not waiting for approval" : null,
          team_id: teamId,
          team_name: teamId === "team_1" ? "Team One" : "Team Two",
          team_status: teamId === "team_1" ? "forming" : "disbanded",
          members_unassigned: 0,
          invites_cancelled: 0,
          cancelled_invitation_ids: [],
          member_clerk_user_ids: [],
        }],
        error: null,
      })
    })

    const result = await denyPendingTeamsForClosedHackathon("h_1")

    expect(result).toEqual({
      denied: 1,
      failed: [{ teamId: "team_1", code: "not_pending" }],
    })
  })
})
