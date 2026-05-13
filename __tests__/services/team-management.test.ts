import { describe, it, expect, beforeEach } from "bun:test"
import {
  createChainableMock,
  resetSupabaseMocks,
  setMockFromImplementation,
} from "../lib/supabase-mock"

const { deleteTeam, setTeamCaptain } = await import("@/lib/services/hackathons")

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

  it("blocks delete when a submission exists", async () => {
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
