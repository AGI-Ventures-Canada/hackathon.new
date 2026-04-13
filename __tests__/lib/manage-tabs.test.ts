import { describe, expect, it } from "bun:test"
import {
  VALID_TABS,
  VALID_ETABS,
  DEFAULT_TAB,
  resolveTab,
  getJudgingRedirectUrl,
} from "@/lib/utils/manage-tabs"

describe("VALID_TABS", () => {
  it("contains all manage tabs", () => {
    expect(VALID_TABS).toContain("action-items")
    expect(VALID_TABS).toContain("overview")
    expect(VALID_TABS).toContain("edit")
    expect(VALID_TABS).toContain("teams")
    expect(VALID_TABS).toContain("rooms")
    expect(VALID_TABS).toContain("submissions")
    expect(VALID_TABS).toContain("judging")
    expect(VALID_TABS).toContain("post-event")
    expect(VALID_TABS).toContain("event")
    expect(VALID_TABS).toContain("activity")
    expect(VALID_TABS).toHaveLength(10)
  })

  it("has action-items as the first tab", () => {
    expect(VALID_TABS[0]).toBe("action-items")
  })

  it("does not contain old judges or prizes tabs", () => {
    expect(VALID_TABS).not.toContain("judges")
    expect(VALID_TABS).not.toContain("prizes")
  })
})

describe("VALID_ETABS", () => {
  it("contains challenge, announcements, mentors, social, email", () => {
    expect(VALID_ETABS).toContain("challenge")
    expect(VALID_ETABS).toContain("announcements")
    expect(VALID_ETABS).toContain("mentors")
    expect(VALID_ETABS).toContain("social")
    expect(VALID_ETABS).toContain("email")
    expect(VALID_ETABS).toHaveLength(5)
  })
})

describe("DEFAULT_TAB", () => {
  it("is action-items", () => {
    expect(DEFAULT_TAB).toBe("action-items")
  })
})

describe("resolveTab", () => {
  it("returns the tab if it is valid", () => {
    expect(resolveTab("judging", VALID_TABS, "edit")).toBe("judging")
  })

  it("returns fallback for an invalid tab", () => {
    expect(resolveTab("unknown", VALID_TABS, "edit")).toBe("edit")
  })

  it("returns fallback when tab is undefined", () => {
    expect(resolveTab(undefined, VALID_TABS, "edit")).toBe("edit")
  })

  it("returns fallback when tab is empty string", () => {
    expect(resolveTab("", VALID_TABS, "edit")).toBe("edit")
  })

  it("redirects old judges tab to judging", () => {
    expect(resolveTab("judges", VALID_TABS, "overview")).toBe("judging")
  })

  it("redirects old prizes tab to judging", () => {
    expect(resolveTab("prizes", VALID_TABS, "overview")).toBe("judging")
  })

  it("redirects fulfillment tab to post-event", () => {
    expect(resolveTab("fulfillment", VALID_TABS, "overview")).toBe("post-event")
  })
})

describe("getJudgingRedirectUrl", () => {
  it("always redirects to judging tab", () => {
    expect(getJudgingRedirectUrl("my-hackathon")).toBe(
      "/e/my-hackathon/manage?tab=judging"
    )
  })
})
