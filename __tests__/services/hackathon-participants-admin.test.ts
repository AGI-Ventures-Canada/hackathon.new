import { describe, it, expect, beforeEach } from "bun:test"
import {
  createChainableMock,
  resetSupabaseMocks,
  setMockFromImplementation,
} from "../lib/supabase-mock"

const {
  assignParticipantToTeam,
  updateParticipantRole,
  removeParticipantFromEvent,
} = await import("@/lib/services/hackathon-participants-admin")

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

const participantRow = (overrides: Partial<{ id: string; clerk_user_id: string; role: string; team_id: string | null; hackathonStatus: string }> = {}) => {
  const { hackathonStatus = "active", ...rest } = overrides
  return {
    id: "p_1",
    hackathon_id: "h_1",
    clerk_user_id: "user_1",
    role: "participant",
    team_id: null,
    registered_at: "2026-04-01T00:00:00Z",
    hackathons: { status: hackathonStatus },
    ...rest,
  }
}

const VALID_UUID = "11111111-1111-1111-1111-111111111111"
const TEAM_UUID = "22222222-2222-2222-2222-222222222222"
const TEAM_UUID_2 = "33333333-3333-3333-3333-333333333333"

describe("assignParticipantToTeam", () => {
  beforeEach(() => resetSupabaseMocks())

  it("rejects when status is judging", async () => {
    setMockFromImplementation(tableImpl({
      hackathon_participants: { data: participantRow({ hackathonStatus: "judging" }), error: null },
    }))
    const result = await assignParticipantToTeam(VALID_UUID, VALID_UUID, TEAM_UUID)
    expect(result.success).toBeUndefined()
    if ("error" in result) expect(result.code).toBe("status_locked")
  })

  it("returns not_found when the participant doesn't exist", async () => {
    setMockFromImplementation(tableImpl({
      hackathon_participants: { data: null, error: null },
    }))
    const result = await assignParticipantToTeam(VALID_UUID, VALID_UUID, TEAM_UUID)
    expect(result).toEqual({ error: "Person not found", code: "not_found" })
  })

  it("rejects assigning a non-participant role to a team", async () => {
    setMockFromImplementation(tableImpl({
      hackathon_participants: { data: participantRow({ role: "judge" }), error: null },
    }))
    const result = await assignParticipantToTeam(VALID_UUID, VALID_UUID, TEAM_UUID)
    expect(result.success).toBeUndefined()
    if ("error" in result) expect(result.code).toBe("not_participant")
  })

  it("returns team_not_found when the target team doesn't exist", async () => {
    setMockFromImplementation(tableImpl({
      hackathon_participants: { data: participantRow(), error: null },
      teams: { data: null, error: null },
    }))
    const result = await assignParticipantToTeam(VALID_UUID, VALID_UUID, TEAM_UUID)
    expect(result.success).toBeUndefined()
    if ("error" in result) expect(result.code).toBe("team_not_found")
  })

  it("returns team_full when capacity is reached", async () => {
    setMockFromImplementation(tableImpl({
      hackathons: { data: { max_team_size: 5 }, error: null },
      hackathon_participants: [
        { data: participantRow(), error: null },
        { data: null, error: null, count: 5 },
      ],
      teams: { data: { id: TEAM_UUID, hackathon_id: "h_1" }, error: null },
    }))
    const result = await assignParticipantToTeam(VALID_UUID, VALID_UUID, TEAM_UUID)
    expect(result.success).toBeUndefined()
    if ("error" in result) expect(result.code).toBe("team_full")
  })

  it("assigns to a new team and reports no captain handoff", async () => {
    setMockFromImplementation(tableImpl({
      hackathons: { data: { max_team_size: 5 }, error: null },
      hackathon_participants: [
        { data: participantRow(), error: null },
        { data: null, error: null, count: 1 },
        { data: null, error: null },
      ],
      teams: { data: { id: TEAM_UUID, hackathon_id: "h_1" }, error: null },
    }))
    const result = await assignParticipantToTeam(VALID_UUID, VALID_UUID, TEAM_UUID)
    expect(result).toEqual({ success: true, teamId: TEAM_UUID, capacityHandedOff: false })
  })

  it("hands off captaincy when moving the captain off a team", async () => {
    setMockFromImplementation(tableImpl({
      hackathons: { data: { max_team_size: 5 }, error: null },
      hackathon_participants: [
        { data: participantRow({ team_id: "team_old" }), error: null },
        { data: [{ clerk_user_id: "user_2" }], error: null },
        { data: null, error: null, count: 1 },
        { data: null, error: null },
      ],
      teams: [
        { data: { id: TEAM_UUID_2, hackathon_id: "h_1" }, error: null },
        { data: { captain_clerk_user_id: "user_1" }, error: null },
        { data: null, error: null },
      ],
    }))
    const result = await assignParticipantToTeam(VALID_UUID, VALID_UUID, TEAM_UUID_2)
    expect(result.success).toBe(true)
    if (result.success) expect(result.capacityHandedOff).toBe(true)
  })
})

describe("updateParticipantRole", () => {
  beforeEach(() => resetSupabaseMocks())

  it("rejects invalid roles", async () => {
    const result = await updateParticipantRole(VALID_UUID, VALID_UUID, "alien" as never)
    expect(result).toEqual({ error: "Invalid role", code: "invalid_role" })
  })

  it("rejects non-judge role changes when status is judging", async () => {
    setMockFromImplementation(tableImpl({
      hackathon_participants: { data: participantRow({ hackathonStatus: "judging" }), error: null },
    }))
    const result = await updateParticipantRole(VALID_UUID, VALID_UUID, "mentor")
    expect(result.success).toBeUndefined()
    if ("error" in result) expect(result.code).toBe("status_locked")
  })

  it("allows an attendee to become a judge during judging", async () => {
    setMockFromImplementation(tableImpl({
      hackathon_participants: [
        { data: participantRow({ hackathonStatus: "judging" }), error: null },
        { data: null, error: null },
      ],
    }))

    const result = await updateParticipantRole(VALID_UUID, VALID_UUID, "judge")

    expect(result).toEqual({ success: true, role: "judge", capacityHandedOff: false })
  })

  it("clears the team link when an attendee becomes a judge", async () => {
    let participantCalls = 0
    let updatePayload: Record<string, unknown> | null = null
    setMockFromImplementation((table) => {
      if (table === "hackathon_participants") {
        participantCalls++
        const chain = createChainableMock(
          participantCalls === 1
            ? { data: participantRow({ team_id: "team_1" }), error: null }
            : { data: null, error: null }
        )
        chain.update.mockImplementation((payload: Record<string, unknown>) => {
          updatePayload = payload
          return chain
        })
        return chain
      }
      if (table === "teams") {
        return createChainableMock({ data: { captain_clerk_user_id: "user_2" }, error: null })
      }
      return createChainableMock({ data: null, error: null })
    })

    const result = await updateParticipantRole(VALID_UUID, VALID_UUID, "judge")

    expect(result.success).toBe(true)
    expect(updatePayload).toEqual({ role: "judge", team_id: null })
  })

  it("keeps judge promotion locked after judging ends", async () => {
    setMockFromImplementation(tableImpl({
      hackathon_participants: { data: participantRow({ hackathonStatus: "completed" }), error: null },
    }))

    const result = await updateParticipantRole(VALID_UUID, VALID_UUID, "judge")

    expect(result.success).toBeUndefined()
    if ("error" in result) expect(result.code).toBe("status_locked")
  })

  it("no-ops when the role is unchanged", async () => {
    setMockFromImplementation(tableImpl({
      hackathon_participants: { data: participantRow({ role: "judge" }), error: null },
    }))
    const result = await updateParticipantRole(VALID_UUID, VALID_UUID, "judge")
    expect(result).toEqual({ success: true, role: "judge", capacityHandedOff: false })
  })

  it("hands off captain when participant leaves the participant role", async () => {
    setMockFromImplementation(tableImpl({
      hackathon_participants: [
        { data: participantRow({ team_id: "team_1" }), error: null },
        { data: [{ clerk_user_id: "user_2" }], error: null },
        { data: null, error: null },
      ],
      teams: [
        { data: { captain_clerk_user_id: "user_1" }, error: null },
        { data: null, error: null },
      ],
    }))
    const result = await updateParticipantRole(VALID_UUID, VALID_UUID, "judge")
    expect(result.success).toBe(true)
    if (result.success) expect(result.capacityHandedOff).toBe(true)
  })

  it("clears judge assignments when demoting a judge to participant", async () => {
    setMockFromImplementation(tableImpl({
      hackathon_participants: [
        { data: participantRow({ role: "judge" }), error: null },
        { data: null, error: null },
      ],
      judge_assignments: { data: null, error: null },
      judge_room_assignments: { data: null, error: null },
    }))
    const result = await updateParticipantRole(VALID_UUID, VALID_UUID, "participant")
    expect(result.success).toBe(true)
    if (result.success) expect(result.role).toBe("participant")
  })
})

describe("removeParticipantFromEvent", () => {
  beforeEach(() => resetSupabaseMocks())

  it("rejects when status is judging", async () => {
    setMockFromImplementation(tableImpl({
      hackathon_participants: { data: participantRow({ hackathonStatus: "judging" }), error: null },
    }))
    const result = await removeParticipantFromEvent(VALID_UUID, VALID_UUID)
    expect(result.success).toBeUndefined()
    if ("error" in result) expect(result.code).toBe("status_locked")
  })

  it("rejects when status is completed", async () => {
    setMockFromImplementation(tableImpl({
      hackathon_participants: { data: participantRow({ hackathonStatus: "completed" }), error: null },
    }))
    const result = await removeParticipantFromEvent(VALID_UUID, VALID_UUID)
    expect(result.success).toBeUndefined()
    if ("error" in result) expect(result.code).toBe("status_locked")
  })

  it("returns not_found when participant doesn't exist", async () => {
    setMockFromImplementation(tableImpl({
      hackathon_participants: { data: null, error: null },
    }))
    const result = await removeParticipantFromEvent(VALID_UUID, VALID_UUID)
    expect(result.success).toBeUndefined()
    if ("error" in result) expect(result.code).toBe("not_found")
  })

  it("deletes the participant and hands off captain when removed", async () => {
    setMockFromImplementation(tableImpl({
      hackathon_participants: [
        { data: participantRow({ team_id: "team_1" }), error: null },
        { data: [{ clerk_user_id: "user_2" }], error: null },
        { data: null, error: null },
      ],
      teams: [
        { data: { captain_clerk_user_id: "user_1" }, error: null },
        { data: null, error: null },
      ],
    }))
    const result = await removeParticipantFromEvent(VALID_UUID, VALID_UUID)
    expect(result.success).toBe(true)
    if (result.success) expect(result.capacityHandedOff).toBe(true)
  })
})
