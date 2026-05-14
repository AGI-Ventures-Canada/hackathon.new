import React from "react"
import { describe, it, expect, afterEach } from "bun:test"
import { render, screen, cleanup } from "@testing-library/react"
import { AgendaGhostItems, buildGhostItems } from "@/components/hackathon/agenda-ghost-items"

afterEach(cleanup)

describe("buildGhostItems", () => {
  it("returns 5 template items from start/end dates", () => {
    const items = buildGhostItems("2026-04-10T09:00:00Z", "2026-04-10T18:00:00Z")
    expect(items).toHaveLength(5)
    expect(items[0].title).toBe("Opening Kickoff")
    expect(items[1].title).toBe("Hacking Begins")
    expect(items[2].title).toBe("Submissions Close & Judging Starts")
    expect(items[3].title).toBe("Presentations")
    expect(items[4].title).toBe("Awards Ceremony")
  })

  it("marks Submissions Close with submission_deadline trigger", () => {
    const items = buildGhostItems("2026-04-10T09:00:00Z", "2026-04-10T18:00:00Z")
    const submission = items.find((i) => i.title === "Submissions Close & Judging Starts")
    expect(submission?.triggerType).toBe("submission_deadline")
  })

  it("defaults submissions close to ends_at", () => {
    const items = buildGhostItems("2026-04-10T09:00:00Z", "2026-04-10T18:00:00Z")
    const submission = items.find((i) => i.title === "Submissions Close & Judging Starts")
    expect(submission?.startsAt).toBe("2026-04-10T18:00:00.000Z")
  })
})

describe("AgendaGhostItems", () => {
  it("renders all ghost items with Add buttons", () => {
    render(
      <AgendaGhostItems
        startsAt="2026-04-10T09:00:00Z"
        endsAt="2026-04-10T18:00:00Z"
        onAddItem={() => {}}
        onAddAll={() => {}}
      />
    )
    expect(screen.getByText("Opening Kickoff")).toBeDefined()
    expect(screen.getByText("Submissions Close & Judging Starts")).toBeDefined()
    expect(screen.getByText("Awards Ceremony")).toBeDefined()
    expect(screen.getByText("Add all")).toBeDefined()
  })
})
