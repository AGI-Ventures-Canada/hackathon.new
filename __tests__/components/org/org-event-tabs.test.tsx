import { describe, expect, it, afterEach } from "bun:test"
import { render, screen, cleanup } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { OrgEventTabs } from "@/components/org/org-event-tabs"
import type { HackathonWithRole } from "@/components/org/hackathon-grid"

const DAY_MS = 24 * 60 * 60 * 1000
const now = Date.now()
const timelineReferenceTime = new Date(now).toISOString()

function makeHackathon(
  overrides: Partial<HackathonWithRole> & { status: HackathonWithRole["status"] }
): HackathonWithRole {
  return {
    id: crypto.randomUUID(),
    slug: "test",
    name: "Test Hackathon",
    description: null,
    banner_url: null,
    starts_at: new Date(now - DAY_MS).toISOString(),
    ends_at: new Date(now + 2 * DAY_MS).toISOString(),
    registration_opens_at: new Date(now - 30 * DAY_MS).toISOString(),
    registration_closes_at: new Date(now - 2 * DAY_MS).toISOString(),
    role: "organizer",
    ...overrides,
  }
}

const activeHackathon = makeHackathon({
  name: "Active Event",
  status: "registration_open",
})

const completedHackathon = makeHackathon({
  name: "Completed Event",
  status: "completed",
})

const archivedHackathon = makeHackathon({
  name: "Archived Event",
  status: "archived",
})

const publishedEndedHackathon = makeHackathon({
  name: "Ended Published Event",
  status: "published",
  starts_at: new Date(now - 3 * DAY_MS).toISOString(),
  ends_at: new Date(now - DAY_MS).toISOString(),
})

describe("OrgEventTabs", () => {
  afterEach(cleanup)

  it("shows count excluding completed events by default", () => {
    render(
      <OrgEventTabs
        allHackathons={[activeHackathon, completedHackathon]}
        organizedHackathons={[activeHackathon, completedHackathon]}
        sponsoredHackathons={[]}
        totalUniqueEvents={2}
        timelineReferenceTime={timelineReferenceTime}
      />
    )

    expect(screen.getByRole("tab", { name: "All 1" })).toBeDefined()
    expect(screen.getByRole("tab", { name: "Organizing 1" })).toBeDefined()
    expect(screen.getByRole("tab", { name: "Sponsoring 0" })).toBeDefined()
  })

  it("shows full count when show completed is toggled on", async () => {
    render(
      <OrgEventTabs
        allHackathons={[activeHackathon, completedHackathon]}
        organizedHackathons={[activeHackathon, completedHackathon]}
        sponsoredHackathons={[completedHackathon]}
        totalUniqueEvents={2}
        timelineReferenceTime={timelineReferenceTime}
      />
    )

    expect(screen.getByRole("tab", { name: "All 1" })).toBeDefined()

    const toggle = screen.getByRole("switch")
    await userEvent.click(toggle)

    expect(screen.getByRole("tab", { name: "All 2" })).toBeDefined()
    expect(screen.getByRole("tab", { name: "Organizing 2" })).toBeDefined()
    expect(screen.getByRole("tab", { name: "Sponsoring 1" })).toBeDefined()
  })

  it("excludes archived events from count by default", () => {
    render(
      <OrgEventTabs
        allHackathons={[activeHackathon, archivedHackathon]}
        organizedHackathons={[activeHackathon, archivedHackathon]}
        sponsoredHackathons={[]}
        totalUniqueEvents={2}
        timelineReferenceTime={timelineReferenceTime}
      />
    )

    expect(screen.getByRole("tab", { name: "All 1" })).toBeDefined()
    expect(screen.getByRole("tab", { name: "Organizing 1" })).toBeDefined()
  })

  it("shows all counts when no completed events exist", () => {
    render(
      <OrgEventTabs
        allHackathons={[activeHackathon]}
        organizedHackathons={[activeHackathon]}
        sponsoredHackathons={[]}
        totalUniqueEvents={1}
        timelineReferenceTime={timelineReferenceTime}
      />
    )

    expect(screen.getByRole("tab", { name: "All 1" })).toBeDefined()
    expect(screen.getByRole("tab", { name: "Organizing 1" })).toBeDefined()
  })

  it("hides show completed toggle when no completed events exist", () => {
    render(
      <OrgEventTabs
        allHackathons={[activeHackathon]}
        organizedHackathons={[activeHackathon]}
        sponsoredHackathons={[]}
        totalUniqueEvents={1}
        timelineReferenceTime={timelineReferenceTime}
      />
    )

    expect(screen.queryByRole("switch")).toBeNull()
  })

  it("shows show completed toggle when completed events exist", () => {
    render(
      <OrgEventTabs
        allHackathons={[activeHackathon, completedHackathon]}
        organizedHackathons={[activeHackathon, completedHackathon]}
        sponsoredHackathons={[]}
        totalUniqueEvents={2}
        timelineReferenceTime={timelineReferenceTime}
      />
    )

    expect(screen.getByRole("switch")).toBeDefined()
  })

  it("keeps an ended published event visible until the lifecycle cron advances it", () => {
    render(
      <OrgEventTabs
        allHackathons={[activeHackathon, publishedEndedHackathon]}
        organizedHackathons={[activeHackathon, publishedEndedHackathon]}
        sponsoredHackathons={[]}
        totalUniqueEvents={2}
        timelineReferenceTime={timelineReferenceTime}
      />
    )

    expect(screen.getByRole("tab", { name: "All 2" })).toBeDefined()
    expect(screen.getByText("Ended Published Event")).toBeDefined()
    expect(screen.queryByRole("switch")).toBeNull()
  })
})
