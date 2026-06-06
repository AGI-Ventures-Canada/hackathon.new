import { describe, expect, it } from "bun:test"
import { canInviteTeamMembers } from "@/lib/utils/team-invite"

describe("canInviteTeamMembers", () => {
  it("does not allow invites when a close time exists but current time is not ready", () => {
    expect(
      canInviteTeamMembers({
        isFormingCaptain: true,
        hackathonStatus: "registration_open",
        registrationClosesAt: "2026-05-11T12:00:00.000Z",
        nowIso: null,
      })
    ).toBe(false)
  })

  it("allows invites when registration has not closed", () => {
    expect(
      canInviteTeamMembers({
        isFormingCaptain: true,
        hackathonStatus: "registration_open",
        registrationClosesAt: "2026-05-11T12:00:00.000Z",
        nowIso: "2026-05-11T11:59:00.000Z",
      })
    ).toBe(true)
  })

  it("blocks invites when registration has closed", () => {
    expect(
      canInviteTeamMembers({
        isFormingCaptain: true,
        hackathonStatus: "registration_open",
        registrationClosesAt: "2026-05-11T12:00:00.000Z",
        nowIso: "2026-05-11T12:00:00.000Z",
      })
    ).toBe(false)
  })

  it("allows invites during active events at the registration close time", () => {
    expect(
      canInviteTeamMembers({
        isFormingCaptain: true,
        hackathonStatus: "active",
        startsAt: "2026-05-11T10:00:00.000Z",
        registrationClosesAt: "2026-05-11T12:00:00.000Z",
        nowIso: "2026-05-11T12:00:00.000Z",
      })
    ).toBe(true)
  })

  it("allows invites during active events after registration closes", () => {
    expect(
      canInviteTeamMembers({
        isFormingCaptain: true,
        hackathonStatus: "active",
        startsAt: "2026-05-11T10:00:00.000Z",
        registrationClosesAt: "2026-05-11T12:00:00.000Z",
        nowIso: "2026-05-11T12:01:00.000Z",
      })
    ).toBe(true)
  })

  it("blocks late invites when the event setting is off", () => {
    expect(
      canInviteTeamMembers({
        isFormingCaptain: true,
        hackathonStatus: "active",
        startsAt: "2026-05-11T10:00:00.000Z",
        registrationClosesAt: "2026-05-11T12:00:00.000Z",
        allowLateRegistration: false,
        nowIso: "2026-05-11T12:01:00.000Z",
      })
    ).toBe(false)
  })

  it("allows invites when there is no registration close time", () => {
    expect(
      canInviteTeamMembers({
        isFormingCaptain: true,
        registrationClosesAt: null,
        nowIso: null,
      })
    ).toBe(true)
  })
})
