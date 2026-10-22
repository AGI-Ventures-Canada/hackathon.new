import { Constants } from "@/lib/db/types"
import { describe, expect, it } from "bun:test"
import { reminderCutoff, reminderIsCurrent, type ReminderCategory } from "@/lib/utils/reminder-cutoff"

const now = new Date("2026-10-22T12:00:00Z")
const ended = { status: "judging", starts_at: "2026-08-22T18:30:00Z", ends_at: "2026-08-22T22:46:56Z" }
const categories: ReminderCategory[] = ["judge_judging", "organizer_judging", "participant_event", "organizer_event", "team_invitation", "judge_invitation"]

describe("event-aware reminder cutoffs", () => {
  it.each(categories)("stops old unbounded %s reminders even in judging", (category) => {
    expect(reminderIsCurrent(ended, category, now)).toBe(false)
  })
  it("preserves judging through an explicit post-event deadline, including active round overrides", () => {
    const scheduled = { ...ended, judging_opens_at: "2026-10-20T12:00:00Z", judging_closes_at: "2026-10-23T12:00:00Z" }
    expect(reminderIsCurrent(scheduled, "judge_judging", now)).toBe(true)
    expect(reminderIsCurrent(scheduled, "participant_event", now)).toBe(false)
    expect(reminderIsCurrent(ended, "judge_judging", now, { opens_at: scheduled.judging_opens_at, closes_at: scheduled.judging_closes_at })).toBe(true)
    expect(reminderIsCurrent(scheduled, "judge_judging", now, { opens_at: "2026-10-20T12:00:00Z" })).toBe(false)
  })
  it("allows one bounded organizer closure notice after the judging deadline", () => {
    const scheduled = { ...ended, judging_opens_at: "2026-10-20T12:00:00Z", judging_closes_at: now.toISOString() }
    expect(reminderIsCurrent(scheduled, "judge_judging", now)).toBe(false)
    expect(reminderIsCurrent(scheduled, "organizer_judging", now)).toBe(true)
    expect(reminderIsCurrent(scheduled, "organizer_judging", new Date(now.getTime() + 86_400_000))).toBe(false)
  })
  it("fails closed for missing, invalid and incomplete dates", () => {
    for (const event of [{ status: "judging" }, { ...ended, ends_at: "bad" }, { ...ended, judging_closes_at: "2026-10-23T00:00:00Z" }]) {
      expect(reminderIsCurrent(event, "judge_judging", now)).toBe(false)
    }
    expect(reminderCutoff({ status: "active", starts_at: now.toISOString() }, "participant_event")).toBe(now.getTime() + 86_400_000)
    expect(reminderIsCurrent({ status: "active", ends_at: now.toISOString() }, "participant_event", now)).toBe(false)
  })
  it.each(["prize_claim", "organizer_fulfillment", "feedback"] as ReminderCategory[])("bounds %s work by publication rather than the event date", (category) => {
    const published = { ...ended, status: "completed", results_published_at: now.toISOString() }
    expect(reminderIsCurrent(published, category, now)).toBe(true)
    expect(reminderIsCurrent(published, category, new Date(now.getTime() + 14 * 86_400_000))).toBe(false)
    expect(reminderIsCurrent({ ...published, status: "judging" }, category, now)).toBe(false)
  })
  it.each(["draft", "archived", "completed"])("stops judging for %s events", (status) => {
    expect(reminderIsCurrent({ ...ended, status, ends_at: "2027-01-01T00:00:00Z" }, "judge_judging", now)).toBe(false)
  })
  it("stops test events and published results", () => {
    expect(reminderIsCurrent({ ...ended, is_test_event: true }, "judge_judging", now)).toBe(false)
    expect(reminderIsCurrent({ ...ended, results_published_at: now.toISOString() }, "judge_judging", now)).toBe(false)
  })
})

it.each(Constants.public.Enums.hackathon_status)("handles database lifecycle status %s explicitly", (status) => {
  expect(reminderIsCurrent({ status, ends_at: "2027-01-01T00:00:00Z" }, "participant_event", now)).toBe(["published", "registration_open", "active", "judging"].includes(status))
})
