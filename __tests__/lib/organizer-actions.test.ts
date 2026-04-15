import { describe, it, expect } from "bun:test"
import {
  getOrganizerActionItems,
  isCompleted,
  SEVERITY_GROUP_LABEL,
  type ActionItem,
} from "@/lib/utils/organizer-actions"
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
    perkCount: 0,
    perksNone: false,
    rounds: { plannedCount: 0, activeCount: 0, completeCount: 0 },
    ...overrides,
  }
}

function findPending(items: ActionItem[], id: string): ActionItem | undefined {
  return items.find((i) => i.id === id && !isCompleted(i))
}

describe("getOrganizerActionItems", () => {
  describe("draft status", () => {
    it("returns incomplete action items for a bare draft hackathon", () => {
      const items = getOrganizerActionItems(makeInput())
      const incomplete = items.filter((i) => !isCompleted(i))
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

      expect(isCompleted(items.find((i) => i.id === "no-description")!)).toBe(true)
      expect(isCompleted(items.find((i) => i.id === "no-dates")!)).toBe(true)
      expect(isCompleted(items.find((i) => i.id === "no-prizes")!)).toBe(true)
      expect(isCompleted(items.find((i) => i.id === "no-judges")!)).toBe(true)
      expect(isCompleted(items.find((i) => i.id === "no-banner")!)).toBe(true)
      expect(isCompleted(items.find((i) => i.id === "create-challenge")!)).toBe(true)
      expect(isCompleted(items.find((i) => i.id === "no-location")!)).toBe(true)
    })

    it("marks missing dates as urgent", () => {
      const items = getOrganizerActionItems(makeInput())
      const dateItem = findPending(items, "no-dates")

      expect(dateItem?.severity).toBe("urgent")
      expect(dateItem?.hint).toBe("Required before you can publish")
    })

    it("includes hint text on all incomplete non-transition draft action items", () => {
      const items = getOrganizerActionItems(makeInput())
      for (const item of items.filter((i) => !isCompleted(i) && i.close.kind !== "transition")) {
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
      expect(isCompleted(items.find((i) => i.id === "no-judges")!)).toBe(true)
    })

    it("shows pending judge invitation count in completed label", () => {
      const items = getOrganizerActionItems(makeInput({
        judgeDisplayCount: 2,
        pendingJudgeInvitationCount: 3,
      }))
      const item = items.find((i) => i.id === "no-judges")!
      expect(isCompleted(item)).toBe(true)
      expect(item.label).toContain("3 pending")
    })

    it("marks location completed when locationType is set", () => {
      const items = getOrganizerActionItems(makeInput({ locationType: "in_person" }))
      expect(isCompleted(items.find((i) => i.id === "no-location")!)).toBe(true)
    })

    it("always shows review agenda item during draft as manual", () => {
      const items = getOrganizerActionItems(makeInput())
      const item = items.find((i) => i.id === "add-schedule")
      expect(item).toBeDefined()
      expect(item?.severity).toBe("warning")
      expect(item?.ctaLabel).toBe("Review")
      expect(item?.close.kind).toBe("manual")
    })

    it("uses submission deadline dialog action for check-submission-deadline", () => {
      const items = getOrganizerActionItems(makeInput())
      const item = items.find((i) => i.id === "check-submission-deadline")
      expect(item).toBeDefined()
      expect(item?.action).toBe("open-submission-deadline-dialog")
      expect(item?.close.kind).toBe("manual")
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
      expect(item?.close.kind).toBe("transition")
      expect(item?.action).toBe("transition-to-published")
      expect(item?.ctaLabel).toBe("Publish")
    })

    it("shows add-perks as incomplete when no perks and not opted out", () => {
      const items = getOrganizerActionItems(makeInput())
      const item = items.find((i) => i.id === "add-perks")
      expect(item).toBeDefined()
      expect(isCompleted(item!)).toBe(false)
      expect(item?.tab).toBe("perks")
    })

    it("marks add-perks completed when perkCount > 0", () => {
      const items = getOrganizerActionItems(makeInput({ perkCount: 1 }))
      const item = items.find((i) => i.id === "add-perks")!
      expect(isCompleted(item)).toBe(true)
      expect(item.label).toContain("1 perk")
    })

    it("marks add-perks completed when perksNone is true", () => {
      const items = getOrganizerActionItems(makeInput({ perksNone: true }))
      const item = items.find((i) => i.id === "add-perks")!
      expect(isCompleted(item)).toBe(true)
      expect(item.label.toLowerCase()).toContain("no perks")
    })

    it("orders items with dates first then description", () => {
      const items = getOrganizerActionItems(makeInput())
      const ids = items.map((i) => i.id)
      expect(ids.indexOf("no-dates")).toBeLessThan(ids.indexOf("no-description"))
    })
  })

  describe("published status", () => {
    it("shows promote-event as manual", () => {
      const items = getOrganizerActionItems(makeInput({
        status: "published",
        participantCount: 0,
      }))
      const item = items.find((i) => i.id === "promote-event")
      expect(item).toBeDefined()
      expect(item?.close.kind).toBe("manual")
    })

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

    it("shows ready-to-go-live when dates and location are set", () => {
      const items = getOrganizerActionItems(makeInput({
        status: "published",
        participantCount: 0,
        startsAt: "2026-05-01T00:00:00Z",
        endsAt: "2026-05-02T00:00:00Z",
        locationType: "virtual",
      }))
      const item = items.find((i) => i.id === "ready-to-go-live")
      expect(item).toBeDefined()
      expect(item?.close.kind).toBe("transition")
      expect(item?.action).toBe("transition-to-active")
      expect(item?.ctaLabel).toBe("Go Live")
    })

    it("does not show ready-to-go-live when location is missing", () => {
      const items = getOrganizerActionItems(makeInput({
        status: "published",
        participantCount: 0,
        startsAt: "2026-05-01T00:00:00Z",
        endsAt: "2026-05-02T00:00:00Z",
        locationType: null,
      }))
      expect(items.find((i) => i.id === "ready-to-go-live")).toBeUndefined()
    })

    it("shows verify-automated-times as dismiss kind", () => {
      const items = getOrganizerActionItems(makeInput({
        status: "published",
        participantCount: 0,
      }))
      const item = items.find((i) => i.id === "verify-automated-times")
      expect(item).toBeDefined()
      expect(item?.severity).toBe("info")
      expect(item?.action).toBe("open-agenda-dialog")
      expect(item?.ctaLabel).toBe("Review")
      expect(item?.close.kind).toBe("dismiss")
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

      const item = findPending(items, "create-challenge")
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
      expect(item?.severity).toBe("scheduled")
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

    it("marks all auto-close items completed when everything is set up", () => {
      const items = getOrganizerActionItems(makeInput({
        status: "active",
        challengeReleased: true,
        challengeExists: true,
        judgeCount: 5,
        mentorQueue: { open: 0 },
        submissionCount: 10,
        description: "A hackathon",
        bannerUrl: "https://example.com/banner.png",
        startsAt: "2026-05-01T00:00:00Z",
        endsAt: "2026-05-02T00:00:00Z",
        locationType: "virtual",
        prizeCount: 2,
        judgeDisplayCount: 3,
        perkCount: 2,
      }))

      const incompleteAuto = items.filter((i) => i.close.kind === "auto" && !isCompleted(i))
      expect(incompleteAuto).toHaveLength(0)
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
      expect(item?.close.kind).toBe("transition")
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

      const item = items.find((i) => i.id === "judging-incomplete")!
      expect(isCompleted(item)).toBe(true)
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
      expect(item?.close.kind).toBe("transition")
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
      expect(item?.close.kind).toBe("transition")
      expect(item?.ctaLabel).toBe("Complete Event")
    })
  })

  describe("completed status", () => {
    it("flags unpublished results as urgent with hint", () => {
      const items = getOrganizerActionItems(makeInput({
        status: "completed",
        resultsPublishedAt: null,
      }))

      const item = findPending(items, "results-not-published")
      expect(item).toBeDefined()
      expect(item?.severity).toBe("urgent")
      expect(item?.hint).toBe("Publishing announces winners and automatically emails them")
    })

    it("marks results completed when published", () => {
      const items = getOrganizerActionItems(makeInput({
        status: "completed",
        resultsPublishedAt: "2026-04-01T00:00:00Z",
      }))

      const item = items.find((i) => i.id === "results-not-published")!
      expect(isCompleted(item)).toBe(true)
    })

    it("shows feedback survey item when survey URL is set", () => {
      const items = getOrganizerActionItems(makeInput({
        status: "completed",
        resultsPublishedAt: "2026-04-01T00:00:00Z",
        feedbackSurveyUrl: "https://example.com/survey",
        feedbackSurveySentAt: null,
      }))
      const item = findPending(items, "feedback-survey-not-sent")
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
      expect(isCompleted(items.find((i) => i.id === "feedback-survey-not-sent")!)).toBe(true)
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
      for (const item of items.filter((i) => !isCompleted(i) && i.close.kind !== "transition")) {
        expect(item.ctaLabel).toBeDefined()
        expect(typeof item.ctaLabel).toBe("string")
      }
    })

    it("maps correct CTA labels for draft items", () => {
      const items = getOrganizerActionItems(makeInput())
      expect(findPending(items, "no-description")?.ctaLabel).toBe("Edit")
      expect(findPending(items, "no-dates")?.ctaLabel).toBe("Edit")
      expect(findPending(items, "no-prizes")?.ctaLabel).toBe("Add")
      expect(findPending(items, "no-judges")?.ctaLabel).toBe("Invite")
      expect(findPending(items, "no-banner")?.ctaLabel).toBe("Add")
      expect(findPending(items, "create-challenge")?.ctaLabel).toBe("Add")
      expect(findPending(items, "no-location")?.ctaLabel).toBe("Set")
    })

    it("maps correct CTA labels for published items", () => {
      const items = getOrganizerActionItems(makeInput({
        status: "published",
        participantCount: 0,
        judgeDisplayCount: 0,
        prizeCount: 0,
      }))
      expect(findPending(items, "no-judges")?.ctaLabel).toBe("Invite")
      expect(findPending(items, "no-prizes")?.ctaLabel).toBe("Add")
    })

    it("maps correct CTA labels for completed status items", () => {
      const items = getOrganizerActionItems(makeInput({
        status: "completed",
        resultsPublishedAt: null,
      }))
      expect(findPending(items, "results-not-published")?.ctaLabel).toBe("Publish")
    })
  })

  describe("transition items", () => {
    it("all transition items have close.kind transition", () => {
      const draftItems = getOrganizerActionItems(makeInput({
        startsAt: "2026-05-01T00:00:00Z",
        endsAt: "2026-05-02T00:00:00Z",
        locationType: "virtual",
      }))
      const publishItem = draftItems.find((i) => i.id === "ready-to-publish")
      expect(publishItem?.close.kind).toBe("transition")

      const pubItems = getOrganizerActionItems(makeInput({
        status: "published",
        participantCount: 5,
        startsAt: "2026-05-01T00:00:00Z",
        endsAt: "2026-05-02T00:00:00Z",
        locationType: "virtual",
      }))
      const goLiveItem = pubItems.find((i) => i.id === "ready-to-go-live")
      expect(goLiveItem?.close.kind).toBe("transition")

      const activeItems = getOrganizerActionItems(makeInput({
        status: "active",
        submissionCount: 5,
        judgeCount: 3,
        challengeReleased: true,
        challengeExists: true,
      }))
      const judgingItem = activeItems.find((i) => i.id === "ready-for-judging")
      expect(judgingItem?.close.kind).toBe("transition")

      const judgingItems = getOrganizerActionItems(makeInput({
        status: "judging",
        judgingProgress: { totalAssignments: 10, completedAssignments: 10 },
      }))
      const completeItem = judgingItems.find((i) => i.id === "ready-to-complete")
      expect(completeItem?.close.kind).toBe("transition")
    })
  })

  describe("close condition invariant", () => {
    const representativeInputs: Array<[string, Parameters<typeof getOrganizerActionItems>[0]]> = [
      ["bare draft", makeInput()],
      ["draft with everything", makeInput({
        description: "desc",
        bannerUrl: "https://x",
        startsAt: "2026-05-01T00:00:00Z",
        endsAt: "2026-05-02T00:00:00Z",
        locationType: "virtual",
        challengeExists: true,
        challengeReleased: true,
        prizeCount: 2,
        judgeDisplayCount: 3,
      })],
      ["published fresh", makeInput({ status: "published", participantCount: 0 })],
      ["published starting soon", makeInput({
        status: "published",
        startsAt: new Date(Date.now() + 10 * 60 * 60 * 1000).toISOString(),
      })],
      ["active with everything", makeInput({
        status: "active",
        challengeReleased: true,
        challengeExists: true,
        submissionCount: 5,
        judgeCount: 3,
        mentorQueue: { open: 2 },
      })],
      ["active unreleased challenge", makeInput({
        status: "active",
        challengeExists: true,
        challengeReleased: false,
        challengeReleaseTime: "2026-05-01T09:00:00Z",
      })],
      ["judging in progress", makeInput({
        status: "judging",
        judgingProgress: { totalAssignments: 10, completedAssignments: 5 },
        mentorQueue: { open: 1 },
      })],
      ["completed with survey", makeInput({
        status: "completed",
        resultsPublishedAt: "2026-04-01T00:00:00Z",
        feedbackSurveyUrl: "https://x",
      })],
    ]

    it.each(representativeInputs)("every item has a valid close.kind for %s", (_name, input) => {
      const items = getOrganizerActionItems(input)
      for (const item of items) {
        expect(item.close).toBeDefined()
        expect(["auto", "manual", "dismiss", "transition"]).toContain(item.close.kind)
        if (item.close.kind === "auto") {
          expect(typeof item.close.isComplete).toBe("boolean")
        }
      }
    })
  })

  describe("accumulative across statuses", () => {
    it("published status includes draft items", () => {
      const items = getOrganizerActionItems(makeInput({
        status: "published",
        participantCount: 0,
      }))
      const ids = items.map((i) => i.id)
      expect(ids).toContain("no-description")
      expect(ids).toContain("no-banner")
      expect(ids).toContain("add-schedule")
      expect(ids).toContain("check-submission-deadline")
      expect(ids).toContain("review-team-settings")
    })

    it("active status includes draft and published items", () => {
      const items = getOrganizerActionItems(makeInput({
        status: "active",
        challengeReleased: true,
        challengeExists: true,
        judgeCount: 2,
      }))
      const ids = items.map((i) => i.id)
      expect(ids).toContain("no-description")
      expect(ids).toContain("add-schedule")
      expect(ids).toContain("promote-event")
    })

    it("later phase overrides earlier phase items with same ID", () => {
      const items = getOrganizerActionItems(makeInput({
        status: "published",
        participantCount: 0,
        judgeDisplayCount: 0,
        prizeCount: 0,
      }))
      const judgeItems = items.filter((i) => i.id === "no-judges")
      expect(judgeItems).toHaveLength(1)
      expect(judgeItems[0].label).toContain("No judges invited yet")
    })

    it("excludes transition actions from previous phases", () => {
      const items = getOrganizerActionItems(makeInput({
        status: "published",
        startsAt: "2026-05-01T00:00:00Z",
        endsAt: "2026-05-02T00:00:00Z",
        locationType: "virtual",
      }))
      expect(items.find((i) => i.id === "ready-to-publish")).toBeUndefined()
      expect(items.find((i) => i.id === "ready-to-go-live")).toBeDefined()
    })

    it("active phase no-judges overrides draft/published version", () => {
      const items = getOrganizerActionItems(makeInput({
        status: "active",
        judgeDisplayCount: 3,
        judgeCount: 0,
        challengeReleased: true,
        challengeExists: true,
      }))
      const item = items.find((i) => i.id === "no-judges")
      expect(item).toBeDefined()
      expect(isCompleted(item!)).toBe(false)
    })
  })

  describe("SEVERITY_GROUP_LABEL", () => {
    it("maps severity levels to display labels", () => {
      expect(SEVERITY_GROUP_LABEL.urgent).toBe("BLOCKERS")
      expect(SEVERITY_GROUP_LABEL.warning).toBe("WARNINGS")
      expect(SEVERITY_GROUP_LABEL.scheduled).toBe("SCHEDULED")
      expect(SEVERITY_GROUP_LABEL.info).toBe("OPTIONAL")
    })
  })

  describe("activate-first-round", () => {
    it("is not shown when there are no rounds", () => {
      const items = getOrganizerActionItems(makeInput({
        status: "judging",
        rounds: { plannedCount: 0, activeCount: 0, completeCount: 0 },
      }))
      expect(items.find((i) => i.id === "activate-first-round")).toBeUndefined()
    })

    it("shows as warning during active phase when a round is planned", () => {
      const items = getOrganizerActionItems(makeInput({
        status: "active",
        challengeReleased: true,
        challengeExists: true,
        rounds: { plannedCount: 1, activeCount: 0, completeCount: 0 },
      }))
      const item = items.find((i) => i.id === "activate-first-round")
      expect(item).toBeDefined()
      expect(item?.severity).toBe("warning")
      expect(item?.tab).toBe("judging")
      expect(item?.subtab).toBe("rounds")
      expect(item?.subtabKey).toBe("jtab")
      expect(item?.ctaLabel).toBe("Activate")
    })

    it("shows as urgent during judging phase when a round is planned", () => {
      const items = getOrganizerActionItems(makeInput({
        status: "judging",
        rounds: { plannedCount: 1, activeCount: 0, completeCount: 0 },
      }))
      const item = items.find((i) => i.id === "activate-first-round")
      expect(item).toBeDefined()
      expect(item?.severity).toBe("urgent")
      expect(item?.label).toBe("Start your first judging round")
    })

    it("judging phase takes precedence over active phase for same id", () => {
      const items = getOrganizerActionItems(makeInput({
        status: "judging",
        rounds: { plannedCount: 2, activeCount: 0, completeCount: 0 },
      }))
      const matches = items.filter((i) => i.id === "activate-first-round")
      expect(matches).toHaveLength(1)
      expect(matches[0].severity).toBe("urgent")
    })

    it("is not shown when a round is already active", () => {
      const items = getOrganizerActionItems(makeInput({
        status: "judging",
        rounds: { plannedCount: 1, activeCount: 1, completeCount: 0 },
      }))
      expect(items.find((i) => i.id === "activate-first-round")).toBeUndefined()
    })

    it("is not shown when any round is already complete", () => {
      const items = getOrganizerActionItems(makeInput({
        status: "judging",
        rounds: { plannedCount: 1, activeCount: 0, completeCount: 1 },
      }))
      expect(items.find((i) => i.id === "activate-first-round")).toBeUndefined()
    })
  })
})
