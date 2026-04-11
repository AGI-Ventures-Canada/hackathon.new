import { describe, it, expect } from "bun:test"
import { getTeamSizeWarning } from "@/lib/utils/team-size"

describe("getTeamSizeWarning", () => {
  it("returns null when team meets minimum size", () => {
    const result = getTeamSizeWarning({
      memberCount: 3,
      minTeamSize: 3,
      allowSolo: false,
    })
    expect(result).toBeNull()
  })

  it("returns null when team exceeds minimum size", () => {
    const result = getTeamSizeWarning({
      memberCount: 5,
      minTeamSize: 3,
      allowSolo: false,
    })
    expect(result).toBeNull()
  })

  it("returns below_min when team is under minimum size", () => {
    const result = getTeamSizeWarning({
      memberCount: 2,
      minTeamSize: 3,
      allowSolo: false,
    })
    expect(result).not.toBeNull()
    expect(result!.type).toBe("below_min")
    expect(result!.memberCount).toBe(2)
    expect(result!.requiredMin).toBe(3)
    expect(result!.message).toContain("2 members")
    expect(result!.message).toContain("at least 3")
  })

  it("returns solo_not_allowed for solo participant when not allowed", () => {
    const result = getTeamSizeWarning({
      memberCount: 1,
      minTeamSize: 3,
      allowSolo: false,
    })
    expect(result).not.toBeNull()
    expect(result!.type).toBe("solo_not_allowed")
    expect(result!.memberCount).toBe(1)
    expect(result!.message).toContain("Solo participants are not allowed")
    expect(result!.message).toContain("at least 3")
  })

  it("returns null for solo participant when solo is allowed", () => {
    const result = getTeamSizeWarning({
      memberCount: 1,
      minTeamSize: 1,
      allowSolo: true,
    })
    expect(result).toBeNull()
  })

  it("allowSolo overrides minTeamSize > 1", () => {
    const result = getTeamSizeWarning({
      memberCount: 1,
      minTeamSize: 3,
      allowSolo: true,
    })
    expect(result).toBeNull()
  })

  it("uses correct singular grammar for 1 member", () => {
    const result = getTeamSizeWarning({
      memberCount: 1,
      minTeamSize: 2,
      allowSolo: false,
    })
    expect(result).not.toBeNull()
    expect(result!.type).toBe("solo_not_allowed")
  })

  it("returns below_min for 0 members", () => {
    const result = getTeamSizeWarning({
      memberCount: 0,
      minTeamSize: 1,
      allowSolo: false,
    })
    expect(result).not.toBeNull()
    expect(result!.type).toBe("below_min")
    expect(result!.requiredMin).toBe(1)
  })
})
