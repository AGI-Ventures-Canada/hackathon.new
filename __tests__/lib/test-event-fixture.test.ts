import { describe, expect, it } from "bun:test"
import {
  getTestEventSchedule,
  getTestEventCreationName,
  getTestEventStagePlan,
  getTestEventTeamInviteCode,
  getTestEventTimeline,
  normalizeTestEventTimeZone,
  TEST_EVENT_ATTENDEES,
  TEST_EVENT_JUDGES,
  TEST_EVENT_PROJECTS,
  TEST_EVENT_TEAMS,
} from "@/lib/fixtures/test-event"
import { isHackathonCreationReady } from "@/lib/utils/hackathon-creation-state"
import { generateSlug } from "@/lib/utils/slug"

const NOW = new Date("2026-08-30T16:00:00.000Z")
const DAY = 24 * 60 * 60 * 1000

describe("test event fixture", () => {
  it("contains enough clean, deterministic data to show a full event", () => {
    expect(TEST_EVENT_ATTENDEES).toHaveLength(36)
    expect(TEST_EVENT_TEAMS).toHaveLength(12)
    expect(TEST_EVENT_PROJECTS).toHaveLength(12)
    expect(TEST_EVENT_JUDGES).toHaveLength(6)
    expect(new Set(TEST_EVENT_ATTENDEES.map((person) => person.clerkUserId)).size).toBe(36)
    expect(TEST_EVENT_ATTENDEES[0]).toEqual({
      name: "Avery Chen",
      clerkUserId: "seed_user_sandbox_attendee_avery_chen_01",
    })
  })

  it("keeps each lifecycle stage internally possible", () => {
    expect(getTestEventStagePlan("registration")).toEqual({
      submittedProjectCount: 0,
      pendingTeamCount: 3,
      weightedAssignmentCount: 0,
      pickAssignmentCount: 0,
      assignmentCount: 0,
      scoredAssignmentCount: 0,
      resultCount: 0,
    })
    expect(getTestEventStagePlan("hacking")).toEqual({
      submittedProjectCount: 8,
      pendingTeamCount: 3,
      weightedAssignmentCount: 24,
      pickAssignmentCount: 0,
      assignmentCount: 24,
      scoredAssignmentCount: 0,
      resultCount: 0,
    })
    expect(getTestEventStagePlan("judging")).toEqual({
      submittedProjectCount: 12,
      pendingTeamCount: 0,
      weightedAssignmentCount: 36,
      pickAssignmentCount: 24,
      assignmentCount: 60,
      scoredAssignmentCount: 22,
      resultCount: 0,
    })
    expect(getTestEventStagePlan("results")).toEqual({
      submittedProjectCount: 12,
      pendingTeamCount: 0,
      weightedAssignmentCount: 36,
      pickAssignmentCount: 24,
      assignmentCount: 60,
      scoredAssignmentCount: 36,
      resultCount: 12,
    })
  })

  it("puts a registration sandbox a few days in the future", () => {
    const timeline = getTestEventTimeline("registration", NOW, "America/Vancouver")
    expect(timeline.status).toBe("registration_open")
    expect(timeline.timezone).toBe("America/Vancouver")
    expect(Date.parse(timeline.startsAt) - NOW.getTime()).toBe(3 * DAY)
    expect(Date.parse(timeline.endsAt) - NOW.getTime()).toBe(5 * DAY)
    expect(Date.parse(timeline.registrationClosesAt) - NOW.getTime()).toBe(2 * DAY)
  })

  it("sets past and future checkpoints that match the chosen stage", () => {
    const hacking = getTestEventTimeline("hacking", NOW)
    const judging = getTestEventTimeline("judging", NOW)
    const results = getTestEventTimeline("results", NOW)

    expect(Date.parse(hacking.startsAt)).toBeLessThan(NOW.getTime())
    expect(Date.parse(hacking.endsAt)).toBeGreaterThan(NOW.getTime())
    expect(judging.status).toBe("judging")
    expect(Date.parse(judging.endsAt)).toBeLessThan(NOW.getTime())
    expect(results.status).toBe("completed")
    expect(results.resultsPublishedAt).not.toBeNull()
    expect(Date.parse(results.resultsPublishedAt!)).toBeLessThan(NOW.getTime())
  })

  it("uses UTC when the browser sends a bad time zone", () => {
    expect(normalizeTestEventTimeZone("America/Toronto")).toBe("America/Toronto")
    expect(normalizeTestEventTimeZone("Not/A_Time_Zone")).toBe("UTC")
    expect(normalizeTestEventTimeZone(42)).toBe("UTC")
  })

  it("builds a complete schedule and globally distinct team invite codes", () => {
    expect(getTestEventSchedule("registration", NOW)).toHaveLength(10)
    const firstEventCodes = TEST_EVENT_TEAMS.map((_, index) =>
      getTestEventTeamInviteCode("11111111-1111-4111-8111-111111111111", index),
    )
    const secondEventCodes = TEST_EVENT_TEAMS.map((_, index) =>
      getTestEventTeamInviteCode("22222222-2222-4222-8222-222222222222", index),
    )
    expect(new Set([...firstEventCodes, ...secondEventCodes]).size).toBe(24)
    expect(firstEventCodes.every((code) => code.length < 40)).toBe(true)
  })

  it("gives more than twenty test events distinct first-choice URLs", () => {
    const slugs = Array.from({ length: 25 }, (_, index) => {
      const creationId = `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`
      return generateSlug(getTestEventCreationName(creationId))
    })

    expect(new Set(slugs).size).toBe(25)
    expect(slugs.every((slug) => slug.startsWith("launch-lab-test-event-"))).toBe(true)
  })

  it("keeps an incomplete aggregate hidden until all fixture rows are ready", () => {
    expect(isHackathonCreationReady({
      metadata: { aggregate_creation: { state: "building" } },
    })).toBe(false)
    expect(isHackathonCreationReady({
      metadata: { aggregate_creation: { state: "complete" } },
    })).toBe(true)
  })
})
