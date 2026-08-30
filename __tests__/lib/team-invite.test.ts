import { describe, expect, it } from "bun:test"
import { canInviteTeamMembers, hasRegistrationOpened } from "@/lib/utils/team-invite"

describe("hasRegistrationOpened", () => {
  it("holds messages until registration opens", () => {
    expect(
      hasRegistrationOpened(
        "2026-05-11T12:00:00.000Z",
        "2026-05-11T11:59:00.000Z",
      ),
    ).toBe(false)
    expect(
      hasRegistrationOpened(
        "2026-05-11T12:00:00.000Z",
        "2026-05-11T12:00:00.000Z",
      ),
    ).toBe(true)
  })
})

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

  it("fails closed without a clock even when there is no registration close time", () => {
    expect(
      canInviteTeamMembers({
        isFormingCaptain: true,
        hackathonStatus: "registration_open",
        registrationClosesAt: null,
        nowIso: null,
      })
    ).toBe(false)
  })

  it("allows invites without a close time while registration is open", () => {
    expect(
      canInviteTeamMembers({
        isFormingCaptain: true,
        hackathonStatus: "registration_open",
        endsAt: "2026-05-12T12:00:00.000Z",
        registrationClosesAt: null,
        nowIso: "2026-05-11T12:00:00.000Z",
      })
    ).toBe(true)
  })

  it("blocks invites after the event ends even without a close time", () => {
    expect(
      canInviteTeamMembers({
        isFormingCaptain: true,
        hackathonStatus: "active",
        endsAt: "2026-05-11T12:00:00.000Z",
        registrationClosesAt: null,
        nowIso: "2026-05-11T12:00:00.000Z",
      })
    ).toBe(false)
  })

  it("blocks invites for a finished lifecycle even before the close time", () => {
    expect(
      canInviteTeamMembers({
        isFormingCaptain: true,
        hackathonStatus: "judging",
        registrationClosesAt: "2026-05-12T12:00:00.000Z",
        nowIso: "2026-05-11T12:00:00.000Z",
      })
    ).toBe(false)
  })
})
