import { describe, it, expect, beforeEach } from "bun:test"
import {
  createChainableMock,
  resetSupabaseMocks,
  setMockFromImplementation,
} from "../lib/supabase-mock"

const { checkRoleConflict } = await import("@/lib/services/role-conflict")

describe("checkRoleConflict", () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  it("returns no conflict when user has no participant record", async () => {
    setMockFromImplementation(() =>
      createChainableMock({ data: null, error: null })
    )

    const result = await checkRoleConflict("h1", "user_123", "judge")
    expect(result.conflict).toBe(false)
  })

  it("allows a team member without a project to become a judge", async () => {
    setMockFromImplementation((table) =>
      table === "hackathon_participants"
        ? createChainableMock({
            data: { id: "p1", role: "participant", team_id: "team_1" },
            error: null,
          })
        : createChainableMock({ data: [], error: null })
    )

    const result = await checkRoleConflict("h1", "user_123", "judge")
    expect(result.conflict).toBe(false)
  })

  it("blocks an attendee whose team already has a project", async () => {
    setMockFromImplementation((table) =>
      table === "hackathon_participants"
        ? createChainableMock({
            data: { id: "p1", role: "participant", team_id: "team_1" },
            error: null,
          })
        : createChainableMock({ data: [{ id: "project_1" }], error: null })
    )

    const result = await checkRoleConflict("h1", "user_123", "judge")
    expect(result.conflict).toBe(true)
    if (result.conflict) expect(result.code).toBe("project_role_conflict")
  })

  it("allows an attendee without a team to become a judge", async () => {
    setMockFromImplementation((table) =>
      table === "hackathon_participants"
        ? createChainableMock({
            data: { id: "p1", role: "participant", team_id: null },
            error: null,
          })
        : createChainableMock({ data: [], error: null })
    )

    const result = await checkRoleConflict("h1", "user_123", "judge")
    expect(result.conflict).toBe(false)
  })

  it("detects judge trying to become participant", async () => {
    setMockFromImplementation(() =>
      createChainableMock({
        data: { id: "j1", role: "judge", team_id: null },
        error: null,
      })
    )

    const result = await checkRoleConflict("h1", "user_123", "participant")
    expect(result.conflict).toBe(true)
    if (result.conflict) {
      expect(result.code).toBe("role_unavailable")
      expect(result.error).not.toContain("judge")
      expect(result.existingRole).toBe("judge")
    }
  })

  it("returns no conflict when user is participant targeting participant", async () => {
    setMockFromImplementation(() =>
      createChainableMock({
        data: { id: "p1", role: "participant", team_id: "team_1" },
        error: null,
      })
    )

    const result = await checkRoleConflict("h1", "user_123", "participant")
    expect(result.conflict).toBe(false)
  })

  it("returns conflict on database error to fail safe", async () => {
    setMockFromImplementation(() =>
      createChainableMock({
        data: null,
        error: { message: "Connection refused" },
      })
    )

    const result = await checkRoleConflict("h1", "user_123", "judge")
    expect(result.conflict).toBe(true)
    if (result.conflict) {
      expect(result.code).toBe("check_failed")
    }
  })
})
