import { describe, it, expect } from "bun:test"
import { getOrganizerActionItems, SEVERITY_GROUP_LABEL } from "@/lib/utils/organizer-actions"
import type { HackathonStatus, HackathonPhase } from "@/lib/db/hackathon-types"

function makeInput(overrides: Partial<Parameters<typeof getOrganizerActionItems>[0]> = {}) {
  return {
    status: "draft" as HackathonStatus,
    phase: null as HackathonPhase | null,
    submissionCount: 0,
    participantCount: 0,
    teamCount: 0,
    judgingProgress: { totalAssignments: 0, completedAssignments: 0 },
    judgeCount: 0,
    prizeCount: 0,
    judgeDisplayCount: 0,
    mentorQueue: { open: 0 },
    challengeReleased: false,
    challengeExists: false,
    challengeReleaseTime: null,
    resultsPublishedAt: null,
    description: null,
    bannerUrl: null,
    startsAt: null,
    endsAt: null,
    locationType: null,
    feedbackSurveyUrl: null,
    feedbackSurveySentAt: null,
    pendingJudgeInvitationCount: 0,
    scheduleItemCount: 0,
    ...overrides,
  }
}

describe("getOrganizerActionItems", () => {
  describe("draft status", () => {
    it("returns incomplete action items for a bare draft hackathon", () => {
      const items = getOrganizerActionItems(makeInput())
      const incomplete = items.filter((i) => !i.completed)
      const ids = incomplete.map((i) => i.id)

      expect(ids).toContain("no-description")
      expect(ids).toContain("no-dates")
      expect(ids).toContain("no-location")
      expect(ids).toContain("create-challenge")
      expect(ids).toContain("no-prizes")
      expect(ids).toContain("no-judges")
      expect(ids).toContain("no-banner")
    })

    it("marks setup items as completed when done", () => {
      const items = getOrganizerActionItems(makeInput({
        description: "A hackathon",
        bannerUrl: "https://example.com/banner.png",
        startsAt: "2026-05-01T00:00:00Z",
        endsAt: "2026-05-02T00:00:00Z",
        prizeCount: 2,
        judgeDisplayCount: 5,
        challengeExists: true,
        challengeReleased: true,
        locationType: "virtual",
      }))

      expect(items.find((i) => i.id === "no-description")?.completed).toBe(true)
      expect(items.find((i) => i.id === "no-dates")?.completed).toBe(true)
      expect(items.find((i) => i.id === "no-prizes")?.completed).toBe(true)
      expect(items.find((i) => i.id === "no-judges")?.completed).toBe(true)
      expect(items.find((i) => i.id === "no-banner")?.completed).toBe(true)
      expect(items.find((i) => i.id === "create-challenge")?.completed).toBe(true)
      expect(items.find((i) => i.id === "no-location")?.completed).toBe(true)
    })

    it("marks missing dates as urgent", () => {
      const items = getOrganizerActionItems(makeInput())
      const dateItem = items.find((i) => i.id === "no-dates" && !i.completed)

      expect(dateItem?.severity).toBe("urgent")
      expect(dateItem?.hint).toBe("Required before you can publish")
    })

    it("includes hint text on all incomplete non-transition draft action items", () => {
      const items = getOrganizerActionItems(makeInput())
      for (const item of items.filter((i) => !i.completed && i.variant !== "transition")) {
        expect(typeof item.hint).toBe("string")
        expect(item.hint!.length).toBeGreaterThan(0)
      }
    })

    it("links action items to correct tabs", () => {
      const items = getOrganizerActionItems(makeInput())

      expect(items.find((i) => i.id === "no-description")?.tab).toBe("edit")
      expect(items.find((i) => i.id === "no-prizes")?.tab).toBe("judging")
      expect(items.find((i) => i.id === "no-judges")?.tab).toBe("judging")
      expect(items.find((i) => i.id === "no-location")?.tab).toBe("edit")
    })

    it("marks judges completed when judgeCount > 0", () => {
      const items = getOrganizerActionItems(makeInput({ judgeCount: 3 }))
      expect(items.find((i) => i.id === "no-judges")?.completed).toBe(true)
    })

    it("shows pending judge invitation count in completed label", () => {
      const items = getOrganizerActionItems(makeInput({
        judgeDisplayCount: 2,
        pendingJudgeInvitationCount: 3,
      }))
      const item = items.find((i) => i.id === "no-judges")
      expect(item?.completed).toBe(true)
      expect(item?.label).toContain("3 pending")
    })

    it("marks location completed when locationType is set", () => {
      const items = getOrganizerActionItems(makeInput({ locationType: "in_person" }))
      expect(items.find((i) => i.id === "no-location")?.completed).toBe(true)
    })

    it("always shows review agenda item during draft", () => {
      for (const count of [0, 3, 8]) {
        const items = getOrganizerActionItems(makeInput({ scheduleItemCount: count }))
        const item = items.find((i) => i.id === "add-schedule" && !i.completed)
        expect(item).toBeDefined()
        expect(item?.severity).toBe("warning")
        expect(item?.ctaLabel).toBe("Review")
      }
    })

    it("uses submission deadline dialog action for check-submission-deadline", () => {
      const items = getOrganizerActionItems(makeInput())
      const item = items.find((i) => i.id === "check-submission-deadline")
      expect(item).toBeDefined()
      expect(item?.action).toBe("open-submission-deadline-dialog")
    })

    it("does not show ready-to-publish when dates are missing", () => {
      const items = getOrganizerActionItems(makeInput())
      expect(items.find((i) => i.id === "ready-to-publish")).toBeUndefined()
    })

    it("shows ready-to-publish when dates and location are set", () => {
      const items = getOrganizerActionItems(makeInput({
        startsAt: "2026-05-01T00:00:00Z",
        endsAt: "2026-05-02T00:00:00Z",
        locationType: "virtual",
      }))
      const item = items.find((i) => i.id === "ready-to-publish")
      expect(item).toBeDefined()
      expect(item?.variant).toBe("transition")
      expect(item?.action).toBe("transition-to-published")
      expect(item?.ctaLabel).toBe("Publish")
    })

    it("orders items with dates first then description", () => {
      const items = getOrganizerActionItems(makeInput())
      const ids = items.map((i) => i.id)
      expect(ids.indexOf("no-dates")).toBeLessThan(ids.indexOf("no-description"))
    })
  })

  describe("published status", () => {
    it("shows starting soon when event starts within 24 hours", () => {
      const soon = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString()
      const items = getOrganizerActionItems(makeInput({
        status: "published",
        participantCount: 10,
        judgeDisplayCount: 2,
        prizeCount: 1,
        startsAt: soon,
      }))

      expect(items.find((i) => i.id === "starting-soon")).toBeDefined()
    })

    it("does not show starting soon for distant events", () => {
      const far = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      const items = getOrganizerActionItems(makeInput({
        status: "published",
        participantCount: 10,
        judgeDisplayCount: 2,
        prizeCount: 1,
        startsAt: far,
      }))

      expect(items.find((i) => i.id === "starting-soon")).toBeUndefined()
    })

    it("always shows ready-to-go-live in published phase", () => {
      const items = getOrganizerActionItems(makeInput({
        status: "published",
        participantCount: 0,
      }))
      const item = items.find((i) => i.id === "ready-to-go-live")
      expect(item).toBeDefined()
      expect(item?.variant).toBe("transition")
      expect(item?.action).toBe("transition-to-active")
      expect(item?.ctaLabel).toBe("Go Live")
    })

    it("shows verify-automated-times in published phase", () => {
      const items = getOrganizerActionItems(makeInput({
        status: "published",
        participantCount: 0,
      }))
      const item = items.find((i) => i.id === "verify-automated-times")
      expect(item).toBeDefined()
      expect(item?.severity).toBe("info")
      expect(item?.action).toBe("open-agenda-dialog")
      expect(item?.ctaLabel).toBe("Review")
      expect(item?.dismissible).toBe(true)
    })
  })

  describe("active status", () => {
    it("flags unreleased challenge as warning with hint", () => {
      const items = getOrganizerActionItems(makeInput({
        status: "active",
        challengeReleased: false,
        challengeExists: false,
        judgeCount: 2,
      }))

      const item = items.find((i) => i.id === "create-challenge" && !i.completed)
      expect(item).toBeDefined()
      expect(item?.severity).toBe("warning")
      expect(item?.hint).toBe("Define the problem participants will solve")
    })

    it("shows release action when challenge exists but not released", () => {
      const items = getOrganizerActionItems(makeInput({
        status: "active",
        challengeReleased: false,
        challengeExists: true,
        challengeReleaseTime: "2026-05-01T09:00:00Z",
        judgeCount: 2,
      }))

      const item = items.find((i) => i.id === "release-challenge")
      expect(item).toBeDefined()
      expect(item?.severity).toBe("warning")
      expect(item?.action).toBe("release-challenge")
    })

    it("shows pending mentor requests", () => {
      const items = getOrganizerActionItems(makeInput({
        status: "active",
        challengeReleased: true,
        judgeCount: 2,
        mentorQueue: { open: 3 },
      }))

      const item = items.find((i) => i.id === "mentor-requests")
      expect(item).toBeDefined()
      expect(item?.label).toContain("3")
    })

    it("marks all items completed when everything is set up", () => {
      const items = getOrganizerActionItems(makeInput({
        status: "active",
        challengeReleased: true,
        challengeExists: true,
        judgeCount: 5,
        mentorQueue: { open: 0 },
        submissionCount: 10,
      }))

      const incomplete = items.filter((i) => !i.completed && i.variant !== "transition")
      expect(incomplete).toHaveLength(0)
    })

    it("does not show ready-for-judging when missing prerequisites", () => {
      const items = getOrganizerActionItems(makeInput({
        status: "active",
        submissionCount: 0,
        judgeCount: 0,
        challengeReleased: false,
      }))
      expect(items.find((i) => i.id === "ready-for-judging")).toBeUndefined()
    })

    it("shows ready-for-judging when all prerequisites met", () => {
      const items = getOrganizerActionItems(makeInput({
        status: "active",
        submissionCount: 5,
        judgeCount: 3,
        challengeReleased: true,
        challengeExists: true,
      }))
      const item = items.find((i) => i.id === "ready-for-judging")
      expect(item).toBeDefined()
      expect(item?.variant).toBe("transition")
      expect(item?.action).toBe("transition-to-judging")
      expect(item?.ctaLabel).toBe("Start Judging")
    })

    it("does not show ready-for-judging when no submissions", () => {
      const items = getOrganizerActionItems(makeInput({
        status: "active",
        submissionCount: 0,
        judgeCount: 3,
        challengeReleased: true,
      }))
      expect(items.find((i) => i.id === "ready-for-judging")).toBeUndefined()
    })
  })

  describe("judging status", () => {
    it("shows judging progress percentage", () => {
      const items = getOrganizerActionItems(makeInput({
        status: "judging",
        judgeCount: 3,
        judgingProgress: { totalAssignments: 20, completedAssignments: 12 },
      }))

      const item = items.find((i) => i.id === "judging-incomplete")
      expect(item).toBeDefined()
      expect(item?.label).toContain("60%")
      expect(item?.label).toContain("12/20")
    })

    it("shows judging progress as info regardless of percentage", () => {
      const items = getOrganizerActionItems(makeInput({
        status: "judging",
        judgeCount: 3,
        judgingProgress: { totalAssignments: 20, completedAssignments: 5 },
      }))

      const item = items.find((i) => i.id === "judging-incomplete")
      expect(item?.severity).toBe("info")
    })

    it("marks judging complete when all assignments done", () => {
      const items = getOrganizerActionItems(makeInput({
        status: "judging",
        judgeCount: 3,
        judgingProgress: { totalAssignments: 20, completedAssignments: 20 },
      }))

      const item = items.find((i) => i.id === "judging-incomplete")
      expect(item?.completed).toBe(true)
    })

    it("shows complete-early when judging is incomplete", () => {
      const items = getOrganizerActionItems(makeInput({
        status: "judging",
        judgingProgress: { totalAssignments: 20, completedAssignments: 10 },
      }))
      const item = items.find((i) => i.id === "ready-to-complete")
      expect(item).toBeDefined()
      expect(item?.label).toBe("Complete event early")
      expect(item?.hint).toBe("Judging is still in progress")
      expect(item?.variant).toBe("transition")
    })

    it("shows ready-to-wrap-up when all judging is done", () => {
      const items = getOrganizerActionItems(makeInput({
        status: "judging",
        judgingProgress: { totalAssignments: 20, completedAssignments: 20 },
      }))
      const item = items.find((i) => i.id === "ready-to-complete")
      expect(item).toBeDefined()
      expect(item?.label).toBe("Ready to wrap up")
      expect(item?.hint).toBe("All judging is complete — publish results")
      expect(item?.variant).toBe("transition")
      expect(item?.ctaLabel).toBe("Complete Event")
    })
  })

  describe("completed status", () => {
    it("flags unpublished results as urgent with hint", () => {
      const items = getOrganizerActionItems(makeInput({
        status: "completed",
        resultsPublishedAt: null,
      }))

      const item = items.find((i) => i.id === "results-not-published" && !i.completed)
      expect(item).toBeDefined()
      expect(item?.severity).toBe("urgent")
      expect(item?.hint).toBe("Review scores and announce winners")
    })

    it("marks results completed when published", () => {
      const items = getOrganizerActionItems(makeInput({
        status: "completed",
        resultsPublishedAt: "2026-04-01T00:00:00Z",
      }))

      const item = items.find((i) => i.id === "results-not-published")
      expect(item?.completed).toBe(true)
    })

    it("shows feedback survey item when survey URL is set", () => {
      const items = getOrganizerActionItems(makeInput({
        status: "completed",
        resultsPublishedAt: "2026-04-01T00:00:00Z",
        feedbackSurveyUrl: "https://example.com/survey",
        feedbackSurveySentAt: null,
      }))
      const item = items.find((i) => i.id === "feedback-survey-not-sent" && !i.completed)
      expect(item).toBeDefined()
      expect(item?.hint).toBe("Learn what worked and what to improve")
      expect(item?.tab).toBe("post-event")
    })

    it("marks feedback survey completed when sent", () => {
      const items = getOrganizerActionItems(makeInput({
        status: "completed",
        resultsPublishedAt: "2026-04-01T00:00:00Z",
        feedbackSurveyUrl: "https://example.com/survey",
        feedbackSurveySentAt: "2026-04-02T00:00:00Z",
      }))
      expect(items.find((i) => i.id === "feedback-survey-not-sent")?.completed).toBe(true)
    })

    it("does not show feedback survey when no URL configured", () => {
      const items = getOrganizerActionItems(makeInput({
        status: "completed",
        resultsPublishedAt: "2026-04-01T00:00:00Z",
        feedbackSurveyUrl: null,
      }))
      expect(items.find((i) => i.id === "feedback-survey-not-sent")).toBeUndefined()
    })
  })

  describe("archived status", () => {
    it("returns no action items", () => {
      const items = getOrganizerActionItems(makeInput({ status: "archived" }))

      expect(items).toHaveLength(0)
    })
  })

  describe("ctaLabel", () => {
    it("includes ctaLabel on all incomplete non-transition draft action items", () => {
      const items = getOrganizerActionItems(makeInput())
      for (const item of items.filter((i) => !i.completed && i.variant !== "transition")) {
        expect(item.ctaLabel).toBeDefined()
        expect(typeof item.ctaLabel).toBe("string")
      }
    })

    it("maps correct CTA labels for draft items", () => {
      const items = getOrganizerActionItems(makeInput())
      expect(items.find((i) => i.id === "no-description" && !i.completed)?.ctaLabel).toBe("Edit")
      expect(items.find((i) => i.id === "no-dates" && !i.completed)?.ctaLabel).toBe("Edit")
      expect(items.find((i) => i.id === "no-prizes" && !i.completed)?.ctaLabel).toBe("Add")
      expect(items.find((i) => i.id === "no-judges" && !i.completed)?.ctaLabel).toBe("Invite")
      expect(items.find((i) => i.id === "no-banner" && !i.completed)?.ctaLabel).toBe("Add")
      expect(items.find((i) => i.id === "create-challenge" && !i.completed)?.ctaLabel).toBe("Add")
      expect(items.find((i) => i.id === "no-location" && !i.completed)?.ctaLabel).toBe("Set")
    })

    it("maps correct CTA labels for published items", () => {
      const items = getOrganizerActionItems(makeInput({
        status: "published",
        participantCount: 0,
        judgeDisplayCount: 0,
        prizeCount: 0,
      }))
      expect(items.find((i) => i.id === "no-judges" && !i.completed)?.ctaLabel).toBe("Invite")
      expect(items.find((i) => i.id === "no-prizes" && !i.completed)?.ctaLabel).toBe("Add")
    })

    it("maps correct CTA labels for completed status items", () => {
      const items = getOrganizerActionItems(makeInput({
        status: "completed",
        resultsPublishedAt: null,
      }))
      expect(items.find((i) => i.id === "results-not-published" && !i.completed)?.ctaLabel).toBe("Publish")
    })
  })

  describe("transition items", () => {
    it("all transition items have variant set", () => {
      const draftItems = getOrganizerActionItems(makeInput({
        startsAt: "2026-05-01T00:00:00Z",
        endsAt: "2026-05-02T00:00:00Z",
        locationType: "virtual",
      }))
      const publishItem = draftItems.find((i) => i.id === "ready-to-publish")
      expect(publishItem?.variant).toBe("transition")

      const pubItems = getOrganizerActionItems(makeInput({
        status: "published",
        participantCount: 5,
      }))
      const goLiveItem = pubItems.find((i) => i.id === "ready-to-go-live")
      expect(goLiveItem?.variant).toBe("transition")

      const activeItems = getOrganizerActionItems(makeInput({
        status: "active",
        submissionCount: 5,
        judgeCount: 3,
        challengeReleased: true,
        challengeExists: true,
      }))
      const judgingItem = activeItems.find((i) => i.id === "ready-for-judging")
      expect(judgingItem?.variant).toBe("transition")

      const judgingItems = getOrganizerActionItems(makeInput({
        status: "judging",
        judgingProgress: { totalAssignments: 10, completedAssignments: 10 },
      }))
      const completeItem = judgingItems.find((i) => i.id === "ready-to-complete")
      expect(completeItem?.variant).toBe("transition")
    })
  })

  describe("SEVERITY_GROUP_LABEL", () => {
    it("maps severity levels to display labels", () => {
      expect(SEVERITY_GROUP_LABEL.urgent).toBe("BLOCKERS")
      expect(SEVERITY_GROUP_LABEL.warning).toBe("WARNINGS")
      expect(SEVERITY_GROUP_LABEL.info).toBe("OPTIONAL")
    })
  })
})
