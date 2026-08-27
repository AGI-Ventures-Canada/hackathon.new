import { describe, it, expect, beforeEach, afterEach } from "bun:test"

const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL

const {
  buildPrizeClaimReminderContent,
  buildPrizeClaimFollowupContent,
  buildWinnerUnresponsiveContent,
  buildOrganizerFulfillmentReminderContent,
  buildFeedbackFollowupContent,
} = await import("@/lib/email/post-event-reminders")

describe("Post-Event Reminder Content Builders", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = "https://test.hackathon.new"
  })

  afterEach(() => {
    if (originalAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL
    } else {
      process.env.NEXT_PUBLIC_APP_URL = originalAppUrl
    }
  })

  describe("buildPrizeClaimReminderContent", () => {
    it("builds content with correct subject and CTA", () => {
      const content = buildPrizeClaimReminderContent("Hack Day", "hack-day")
      expect(content.subject).toContain("Hack Day")
      expect(content.heading).toBe("Your prize is waiting")
      expect(content.ctaUrl).toBe("https://test.hackathon.new/e/hack-day")
    })
  })

  describe("buildPrizeClaimFollowupContent", () => {
    it("builds urgent follow-up content", () => {
      const content = buildPrizeClaimFollowupContent("Hack Day", "hack-day")
      expect(content.subject).toContain("still waiting")
      expect(content.heading).toBe("Your prize is still waiting")
      expect(content.body).toContain("unclaimed")
      expect(content.ctaLabel).toBe("View Results")
    })
  })

  describe("buildWinnerUnresponsiveContent", () => {
    it("builds escalation content with unclaimed details", () => {
      const content = buildWinnerUnresponsiveContent(
        "Hack Day",
        "hack-day",
        2,
        "Best Demo (Cool Project), API Credits (Widget)"
      )
      expect(content.subject).toContain("2 winners unresponsive")
      expect(content.heading).toBe("Winners need a follow-up")
      expect(content.body).toContain("Best Demo (Cool Project)")
      expect(content.ctaLabel).toBe("Review Fulfillment")
      expect(content.ctaUrl).toContain("post-event")
    })

    it("uses singular when only one winner", () => {
      const content = buildWinnerUnresponsiveContent("Hack", "hack", 1, "Prize (Project)")
      expect(content.subject).toContain("1 winner unresponsive")
      expect(content.body).toContain("1 prize winner has not claimed a prize")
    })
  })

  describe("buildOrganizerFulfillmentReminderContent", () => {
    it("includes unfulfilled count", () => {
      const content = buildOrganizerFulfillmentReminderContent("Hack", "hack", 3)
      expect(content.subject).toContain("3 prizes")
      expect(content.body).toContain("3 prizes")
    })
  })

  describe("buildFeedbackFollowupContent", () => {
    it("uses survey URL as CTA", () => {
      const content = buildFeedbackFollowupContent("Hack", "https://survey.example.com")
      expect(content.ctaUrl).toBe("https://survey.example.com")
      expect(content.ctaLabel).toBe("Share Feedback")
    })
  })
})
