import { judgingSetupRequestKey } from "@/lib/judging/setup-request"
import { describe, expect, it } from "bun:test"
import { judgingHref, legacyJudgingHref, suggestedJudgingWindow } from "@/lib/judging/setup"
import { judgingLocalTime, judgingInstant } from "@/lib/utils/judging-datetime"
import { ORGANIZER_SECTION_CONFIG } from "@/lib/webmcp/organizer-parity"

describe("judging setup navigation and schedule", () => {
  it("keeps legacy setup, prize, assignment, and result links addressable", () => {
    expect(legacyJudgingHref("demo", "prizes")).toBe("/e/demo/manage/judging/settings?edit=prizes")
    expect(legacyJudgingHref("demo", "results")).toBe(judgingHref("demo", "results"))
    expect(legacyJudgingHref("demo", "assignments")).toBe("/e/demo/manage/judging?edit=assignments")
    expect(legacyJudgingHref("demo", "judges")).toBe("/e/demo/manage/judging/judges")
    expect(ORGANIZER_SECTION_CONFIG.judging_settings.webMcpTools).toContain("configure_judging")
    expect(
      ORGANIZER_SECTION_CONFIG.rounds.cliCommands.every((command) =>
        command.startsWith("judging rounds"),
      ),
    ).toBe(true)
  })
  it("suggests two hours after a future project deadline", () => {
    expect(
      suggestedJudgingWindow("2026-09-06T17:00:00Z", new Date("2026-09-05T10:00:00Z")),
    ).toEqual({ opensAt: "2026-09-06T17:00:00.000Z", closesAt: "2026-09-06T19:00:00.000Z" })
  })
  it("never infers a past judging deadline", () => {
    const result = suggestedJudgingWindow("2025-01-01T00:00:00Z", new Date("2026-09-05T10:03:00Z"))
    expect(result.opensAt).toBe("2026-09-05T11:15:00.000Z")
    expect(result.closesAt).toBe("2026-09-05T13:15:00.000Z")
  })
  it("uses the selected zone, independent of the computer zone", () => {
    expect(judgingLocalTime("2026-07-01T16:00:00Z", "America/Toronto")).toBe("2026-07-01T12:00")
    expect(judgingInstant("2026-07-01T12:00", "America/Toronto")).toBe("2026-07-01T16:00:00.000Z")
    expect(judgingInstant("2026-01-01T12:00", "America/Toronto")).toBe("2026-01-01T17:00:00.000Z")
  })
  it("rejects nonexistent daylight-saving wall times and preserves fall-back instants", () => {
    expect(() => judgingInstant("2026-03-08T02:30", "America/Toronto")).toThrow("clocks change")
    const first = judgingInstant("2026-11-01T01:30", "America/Toronto")
    expect(judgingLocalTime(first, "America/Toronto")).toBe("2026-11-01T01:30")
  })
})

it("reuses a setup request key across transport retries and field order", async () => {
  const a = await judgingSetupRequestKey("event", "version", {
    settings: { timezone: "UTC", browseEnabled: true },
  })
  expect(
    await judgingSetupRequestKey("event", "version", {
      settings: { browseEnabled: true, timezone: "UTC" },
    }),
  ).toBe(a)
  expect(
    await judgingSetupRequestKey("event", "new-version", {
      settings: { timezone: "UTC", browseEnabled: true },
    }),
  ).not.toBe(a)
  expect(
    await judgingSetupRequestKey("other-event", "version", {
      settings: { timezone: "UTC", browseEnabled: true },
    }),
  ).not.toBe(a)
})

import { judgingInvitationState } from "@/lib/judging/setup"

describe("invitation delivery readiness", () => {
  const invitation = {
    expires_at: "2026-09-08T12:00:00Z",
    emailed_at: "2026-09-05T12:00:00Z",
    reminded_at: null,
  }
  it("shares a one-day cooldown with the first invitation email", () => {
    expect(
      judgingInvitationState(invitation, false, new Date("2026-09-06T11:59:59Z")),
    ).toMatchObject({
      delivery: "sent",
      canRemind: false,
      nextReminderAt: "2026-09-06T12:00:00.000Z",
    })
    expect(
      judgingInvitationState(invitation, false, new Date("2026-09-06T12:00:00Z")).canRemind,
    ).toBe(true)
  })
  it("suppresses queued, expired, or opted-out reminders", () => {
    expect(
      judgingInvitationState(invitation, true, new Date("2026-09-06T12:00:00Z")).canRemind,
    ).toBe(false)
    expect(
      judgingInvitationState(invitation, false, new Date("2026-09-08T12:00:00Z")).canRemind,
    ).toBe(false)
    expect(
      judgingInvitationState(
        { ...invitation, reminders_stopped_at: "2026-09-06T12:00:00Z" },
        false,
        new Date("2026-09-07T12:00:00Z"),
      ).canRemind,
    ).toBe(false)
  })
  it("keeps a failed email visible for retry even in a queued event", () => {
    expect(
      judgingInvitationState(
        { ...invitation, emailed_at: null, delivery_fail_count: 1 },
        true,
        new Date("2026-09-06T12:00:00Z"),
      ),
    ).toMatchObject({ delivery: "failed", canRemind: false })
  })
  it("removes manual actions when judging no longer accepts invitations", () => {
    expect(judgingInvitationState(invitation, false, new Date("2026-09-06T12:00:00Z"), false)).toMatchObject({canRemind:false,canRetry:false,nextReminderAt:null})
  })
})
