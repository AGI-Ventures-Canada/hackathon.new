import { describe, expect, it } from "bun:test"
import { canInviteTeamMembers } from "@/lib/utils/team-invite"

describe("canInviteTeamMembers", () => {
  it("does not allow invites when a close time exists but current time is not ready", () => {
    expect(
      canInviteTeamMembers({
        canRenameTeam: true,
        registrationClosesAt: "2026-05-11T12:00:00.000Z",
        nowIso: null,
      })
    ).toBe(false)
  })

  it("allows invites when registration has not closed", () => {
    expect(
      canInviteTeamMembers({
        canRenameTeam: true,
        registrationClosesAt: "2026-05-11T12:00:00.000Z",
        nowIso: "2026-05-11T11:59:00.000Z",
      })
    ).toBe(true)
  })

  it("blocks invites when registration has closed", () => {
    expect(
      canInviteTeamMembers({
        canRenameTeam: true,
        registrationClosesAt: "2026-05-11T12:00:00.000Z",
        nowIso: "2026-05-11T12:00:00.000Z",
      })
    ).toBe(false)
  })

  it("allows invites when there is no registration close time", () => {
    expect(
      canInviteTeamMembers({
        canRenameTeam: true,
        registrationClosesAt: null,
        nowIso: null,
      })
    ).toBe(true)
  })
})
