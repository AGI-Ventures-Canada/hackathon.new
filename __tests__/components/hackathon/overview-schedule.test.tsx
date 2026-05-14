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

const submissionDeadlineItem = {
  id: "item-3",
  title: "Submissions Close",
  starts_at: "2030-04-12T17:00:00Z",
  ends_at: null,
  location: null,
  sort_order: 2,
  trigger_type: "submission_deadline" as const,
}

const allItems = [regularItem, submissionDeadlineItem]

const { OverviewSchedule } = await import(
  "@/components/hackathon/overview-schedule"
)
const { ScheduleEditor } = await import(
  "@/components/hackathon/schedule-editor"
)

const defaultProps = {
  hackathonId: "hack-1",
  scheduleItems: allItems,
  challengeExists: true,
}

describe("OverviewSchedule (interactive agenda)", () => {
  it("renders all schedule items", () => {
    render(<OverviewSchedule {...defaultProps} />)
    expect(screen.getByText("Opening Kickoff")).toBeDefined()
    expect(screen.getByText("Submissions Close")).toBeDefined()
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
    render(<OverviewSchedule {...defaultProps} challengeExists={true} />)
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

  it("shows delete trigger for regular items", () => {
    const { container } = render(<OverviewSchedule {...defaultProps} />)
    const trashButtons = container.querySelectorAll('button .lucide-trash2')
    expect(trashButtons.length).toBeGreaterThan(0)
  })

  it("does not show delete trigger for trigger items", () => {
    const { container } = render(
      <OverviewSchedule
        {...defaultProps}
        scheduleItems={[submissionDeadlineItem]}
      />
    )
    const trashButtons = container.querySelectorAll('button .lucide-trash2')
    expect(trashButtons.length).toBe(0)
  })

  it("calls onEditTriggerItem instead of opening generic editor for trigger items", () => {
    const onEditTrigger = mock(() => {})
    render(
      <ScheduleEditor
        {...defaultProps}
        scheduleItems={[submissionDeadlineItem]}
        onEditTriggerItem={onEditTrigger}
      />
    )
    const row = screen.getByText("Submissions Close").closest("[role=button]")
    if (row) fireEvent.click(row)
    expect(onEditTrigger).toHaveBeenCalledTimes(1)
    expect(onEditTrigger.mock.calls[0][0].trigger_type).toBe("submission_deadline")
    expect(screen.queryByText("Edit agenda item")).toBeNull()
  })

  it("falls back to generic editor for trigger items when no callback provided", () => {
    render(
      <ScheduleEditor
        {...defaultProps}
        scheduleItems={[submissionDeadlineItem]}
      />
    )
    const row = screen.getByText("Submissions Close").closest("[role=button]")
    if (row) fireEvent.click(row)
    expect(screen.getByText("Edit agenda item")).toBeDefined()
  })

  it("isolates delete confirmation clicks from the row's edit handler", () => {
    render(<OverviewSchedule {...defaultProps} />)
    const kickoffRow = screen.getByText("Opening Kickoff").closest("[role=button]")!
    const trashButton = kickoffRow.querySelector("svg.lucide-trash2")?.closest("button")
    expect(trashButton).toBeDefined()
    const wrapper = trashButton!.parentElement!
    const handled = fireEvent.click(wrapper)
    expect(handled).toBe(true)
    expect(screen.queryByText("Edit agenda item")).toBeNull()
  })

  it("shows virtual Event ends item when no submission_deadline lands on hackathonEndsAt", () => {
    render(
      <ScheduleEditor
        {...defaultProps}
        scheduleItems={[regularItem]}
        hackathonEndsAt="2030-04-12T17:00:00Z"
        hackathonStatus="published"
      />,
    )
    expect(screen.getByText("Event ends")).toBeDefined()
  })

  it("hides virtual Event ends item when a submission_deadline lands on hackathonEndsAt", () => {
    render(
      <ScheduleEditor
        {...defaultProps}
        scheduleItems={[submissionDeadlineItem]}
        hackathonEndsAt="2030-04-12T17:00:00Z"
        hackathonStatus="published"
      />,
    )
    expect(screen.queryByText("Event ends")).toBeNull()
    expect(screen.getByText("Submissions Close")).toBeDefined()
  })

  it("hides virtual Event ends when timestamps differ only in sub-second precision", () => {
    const itemWithMs = { ...submissionDeadlineItem, starts_at: "2030-04-12T17:00:00.000Z" }
    render(
      <ScheduleEditor
        {...defaultProps}
        scheduleItems={[itemWithMs]}
        hackathonEndsAt="2030-04-12T17:00:00.658Z"
        hackathonStatus="published"
      />,
    )
    expect(screen.queryByText("Event ends")).toBeNull()
  })

  it("still shows virtual Event ends when submission_deadline is at a custom (non-end) time", () => {
    const customDeadline = { ...submissionDeadlineItem, starts_at: "2030-04-12T15:00:00Z" }
    render(
      <ScheduleEditor
        {...defaultProps}
        scheduleItems={[customDeadline]}
        hackathonEndsAt="2030-04-12T17:00:00Z"
        hackathonStatus="published"
      />,
    )
    expect(screen.getByText("Event ends")).toBeDefined()
    expect(screen.getByText("Submissions Close")).toBeDefined()
  })

})
