import { afterEach, describe, expect, it } from "bun:test"
import { cleanup, render, screen } from "@testing-library/react"
import { EventHealthAlerts } from "@/components/hackathon/manage/event-health-alerts"

afterEach(cleanup)

describe("EventHealthAlerts", () => {
  it("stays hidden when the event has no health problems", () => {
    const { container } = render(
      <EventHealthAlerts
        slug="build-day"
        alerts={[]}
        invitationEmailCounts={{ teams: 0, judges: 0, total: 0 }}
        failedReminderCount={0}
        queuedUntilPublish={false}
      />,
    )

    expect(container.innerHTML).toBe("")
  })

  it("links each unsent invite to the right list", () => {
    render(
      <EventHealthAlerts
        slug="build-day"
        alerts={[]}
        invitationEmailCounts={{ teams: 2, judges: 1, total: 3 }}
        failedReminderCount={0}
        queuedUntilPublish={false}
      />,
    )

    const links = screen.getAllByRole("link", { name: "Review emails" })
    expect(links[0].getAttribute("href")).toBe("/e/build-day/manage?tab=teams")
    expect(links[1].getAttribute("href")).toBe(
      "/e/build-day/manage?tab=judging&jtab=judges",
    )
  })

  it("shows reminder delivery failures as a blocker", () => {
    render(
      <EventHealthAlerts
        slug="build-day"
        alerts={[]}
        invitationEmailCounts={{ teams: 0, judges: 0, total: 0 }}
        failedReminderCount={2}
        queuedUntilPublish={false}
      />,
    )

    expect(screen.getByText("2 delivery issues need help")).toBeDefined()
    expect(screen.getByRole("link", { name: "Review email" }).getAttribute("href")).toBe(
      "/e/build-day/manage?tab=event&etab=email",
    )
  })
})
