import { describe, expect, it } from "bun:test"
import {
  VALID_TABS,
  VALID_ETABS,
  VALID_MTABS,
  VALID_JTABS,
  DEFAULT_TAB,
  DEFAULT_MTAB,
  DEFAULT_JTAB,
  resolveTab,
  getJudgingRedirectUrl,
} from "@/lib/utils/manage-tabs"

describe("VALID_TABS", () => {
  it("contains all manage tabs", () => {
    expect(VALID_TABS).toContain("action-items")
    expect(VALID_TABS).toContain("overview")
    expect(VALID_TABS).toContain("challenges")
    expect(VALID_TABS).toContain("perks")
    expect(VALID_TABS).toContain("edit")
    expect(VALID_TABS).toContain("teams")
    expect(VALID_TABS).toContain("people")
    expect(VALID_TABS).toContain("miscs")
    expect(VALID_TABS).toContain("judging")
    expect(VALID_TABS).toContain("post-event")
    expect(VALID_TABS).toContain("event")
    expect(VALID_TABS).toHaveLength(11)
  })

  it("does not contain the old activity tab", () => {
    expect(VALID_TABS).not.toContain("activity")
  })

  it("does not contain the old submissions tab", () => {
    expect(VALID_TABS).not.toContain("submissions")
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
  it("contains announcements, mentors, social, email", () => {
    expect(VALID_ETABS).toContain("announcements")
    expect(VALID_ETABS).toContain("mentors")
    expect(VALID_ETABS).toContain("social")
    expect(VALID_ETABS).toContain("email")
    expect(VALID_ETABS).toHaveLength(4)
  })
})

describe("VALID_MTABS", () => {
  it("contains rooms, activity, and terms", () => {
    expect(VALID_MTABS).toContain("rooms")
    expect(VALID_MTABS).toContain("activity")
    expect(VALID_MTABS).toContain("terms")
    expect(VALID_MTABS).toHaveLength(3)
  })
})

describe("VALID_JTABS", () => {
  it("contains setup, judges, rounds, prizes, results", () => {
    expect(VALID_JTABS).toContain("setup")
    expect(VALID_JTABS).toContain("judges")
    expect(VALID_JTABS).toContain("rounds")
    expect(VALID_JTABS).toContain("prizes")
    expect(VALID_JTABS).toContain("results")
    expect(VALID_JTABS).toHaveLength(5)
  })
})

describe("DEFAULT_TAB", () => {
  it("is action-items", () => {
    expect(DEFAULT_TAB).toBe("action-items")
  })
})

describe("DEFAULT_MTAB", () => {
  it("is rooms", () => {
    expect(DEFAULT_MTAB).toBe("rooms")
  })
})

describe("DEFAULT_JTAB", () => {
  it("is judges", () => {
    expect(DEFAULT_JTAB).toBe("judges")
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

  it("redirects old rooms tab to miscs", () => {
    expect(resolveTab("rooms", VALID_TABS, "overview")).toBe("miscs")
  })

  it("redirects old activity tab to miscs", () => {
    expect(resolveTab("activity", VALID_TABS, "overview")).toBe("miscs")
  })

  it("redirects old submissions tab to teams", () => {
    expect(resolveTab("submissions", VALID_TABS, "overview")).toBe("teams")
  })
})

describe("getJudgingRedirectUrl", () => {
  it("always redirects to judging tab", () => {
    expect(getJudgingRedirectUrl("my-hackathon")).toBe(
      "/e/my-hackathon/manage?tab=judging"
    )
  })
})
