import React from "react"
import { describe, it, expect, afterEach, mock } from "bun:test"
import { render, screen, cleanup, fireEvent } from "@testing-library/react"

afterEach(cleanup)

const regularItem = {
  id: "item-1",
  title: "Opening Kickoff",
  starts_at: "2030-04-10T09:00:00Z",
  ends_at: "2030-04-10T09:30:00Z",
  location: "Main Hall",
  sort_order: 0,
  trigger_type: null,
}

const challengeReleaseItem = {
  id: "item-2",
  title: "Challenge Release",
  starts_at: "2030-04-10T09:30:00Z",
  ends_at: null,
  location: null,
  sort_order: 1,
  trigger_type: "challenge_release" as const,
}

const submissionDeadlineItem = {
  id: "item-3",
  title: "Submissions Close",
  starts_at: "2030-04-12T17:00:00Z",
  ends_at: null,
  location: null,
  sort_order: 2,
  trigger_type: "submission_deadline" as const,
}

const allItems = [regularItem, challengeReleaseItem, submissionDeadlineItem]

const { OverviewSchedule } = await import(
  "@/components/hackathon/overview-schedule"
)
const { ScheduleEditor } = await import(
  "@/components/hackathon/schedule-editor"
)

const defaultProps = {
  hackathonId: "hack-1",
  scheduleItems: allItems,
  challengeReleasedAt: null as string | null,
  challengeExists: true,
}

describe("OverviewSchedule (interactive agenda)", () => {
  it("renders all schedule items when challenge exists", () => {
    render(<OverviewSchedule {...defaultProps} />)
    expect(screen.getByText("Opening Kickoff")).toBeDefined()
    expect(screen.getByText("Challenge Release")).toBeDefined()
    expect(screen.getByText("Submissions Close")).toBeDefined()
  })

  it("hides challenge_release item when no challenge exists", () => {
    render(<OverviewSchedule {...defaultProps} challengeExists={false} challengeReleasedAt={null} />)
    expect(screen.getByText("Opening Kickoff")).toBeDefined()
    expect(screen.queryByText("Challenge Release")).toBeNull()
  })

  it("shows challenge_release item when challenge has been released", () => {
    render(<OverviewSchedule {...defaultProps} challengeExists={false} challengeReleasedAt="2026-04-10T09:00:00Z" />)
    expect(screen.getByText("Challenge Release")).toBeDefined()
  })

  it("renders the Agenda header with Add button", () => {
    render(<OverviewSchedule {...defaultProps} />)
    expect(screen.getByText("Agenda")).toBeDefined()
    expect(screen.getByText("Add")).toBeDefined()
  })

  it("renders location for items that have one", () => {
    render(<OverviewSchedule {...defaultProps} />)
    expect(screen.getByText("Main Hall")).toBeDefined()
  })

  it("shows Automated badge on trigger items", () => {
    render(<OverviewSchedule {...defaultProps} />)
    const badges = screen.getAllByText("Automated")
    expect(badges.length).toBeGreaterThanOrEqual(1)
  })

  it("does not show Release Now or Create Challenge buttons on timeline", () => {
    render(<OverviewSchedule {...defaultProps} challengeExists={true} challengeReleasedAt={null} />)
    expect(screen.queryByText("Release Now")).toBeNull()
    expect(screen.queryByText("Create Challenge")).toBeNull()
    expect(screen.queryByText("Scheduled")).toBeNull()
    expect(screen.queryByText("Released")).toBeNull()
  })

  it("shows empty state when no items", () => {
    render(
      <OverviewSchedule {...defaultProps} scheduleItems={[]} />
    )
    expect(
      screen.getByText("Set event dates to generate your agenda")
    ).toBeDefined()
  })

  it("opens edit dialog when clicking an item row", () => {
    render(<OverviewSchedule {...defaultProps} />)
    const kickoffRow = screen.getByText("Opening Kickoff").closest("[role=button]")
    if (kickoffRow) fireEvent.click(kickoffRow)
    expect(screen.getByText("Edit agenda item")).toBeDefined()
  })

  it("opens create dialog when clicking Add button", () => {
    render(<OverviewSchedule {...defaultProps} />)
    fireEvent.click(screen.getByText("Add"))
    expect(screen.getByText("Add agenda item")).toBeDefined()
  })

  it("shows delete confirmation for regular items", () => {
    render(<OverviewSchedule {...defaultProps} />)
    const deleteButtons = screen.getAllByText("Delete agenda item?")
    expect(deleteButtons.length).toBeGreaterThan(0)
  })

  it("does not show delete for trigger items", () => {
    render(
      <OverviewSchedule
        {...defaultProps}
        scheduleItems={[challengeReleaseItem]}
      />
    )
    expect(screen.queryByText("Delete agenda item?")).toBeNull()
  })

  it("calls onEditTriggerItem instead of opening generic editor for trigger items", () => {
    const onEditTrigger = mock(() => {})
    render(
      <ScheduleEditor
        {...defaultProps}
        scheduleItems={[challengeReleaseItem]}
        onEditTriggerItem={onEditTrigger}
      />
    )
    const row = screen.getByText("Challenge Release").closest("[role=button]")
    if (row) fireEvent.click(row)
    expect(onEditTrigger).toHaveBeenCalledTimes(1)
    expect(onEditTrigger.mock.calls[0][0].trigger_type).toBe("challenge_release")
    expect(screen.queryByText("Edit agenda item")).toBeNull()
  })

  it("falls back to generic editor for trigger items when no callback provided", () => {
    render(
      <ScheduleEditor
        {...defaultProps}
        scheduleItems={[challengeReleaseItem]}
      />
    )
    const row = screen.getByText("Challenge Release").closest("[role=button]")
    if (row) fireEvent.click(row)
    expect(screen.getByText("Edit agenda item")).toBeDefined()
  })
})
