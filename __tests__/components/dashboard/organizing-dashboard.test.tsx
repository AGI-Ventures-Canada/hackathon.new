import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { render, screen, cleanup } from "@testing-library/react"
import { resetComponentMocks } from "../../lib/component-mocks"

const { OrganizingDashboard } = await import(
  "@/app/(dashboard)/home/organizing/organizing-dashboard"
)

beforeEach(() => {
  resetComponentMocks()
})

afterEach(() => {
  cleanup()
})

const makeHackathon = (overrides: Record<string, unknown> = {}) => ({
  id: "h1",
  slug: "test-hack",
  name: "Test Hackathon",
  description: "A test event",
  status: "active" as const,
  registration_opens_at: null,
  registration_closes_at: null,
  starts_at: new Date(Date.now() - 86400000).toISOString(),
  ends_at: new Date(Date.now() + 86400000).toISOString(),
  ...overrides,
})

const makeStats = (hackathonId: string, overrides: Record<string, unknown> = {}) => ({
  hackathonId,
  participantCount: 50,
  teamCount: 12,
  submissionCount: 8,
  judgingComplete: 0,
  judgingTotal: 0,
  openMentorRequests: 0,
  ...overrides,
})

describe("OrganizingDashboard", () => {
  it("renders empty state when no hackathons", () => {
    render(<OrganizingDashboard hackathons={[]} stats={{}} />)
    expect(screen.getByText("No events yet")).toBeDefined()
    expect(screen.getByText("Create event")).toBeDefined()
  })

  it("renders stat cards with aggregated totals", () => {
    const h1 = makeHackathon({ id: "h1" })
    const h2 = makeHackathon({ id: "h2", slug: "hack-2", name: "Hack 2" })
    const stats = {
      h1: makeStats("h1", { participantCount: 30, teamCount: 8, submissionCount: 5 }),
      h2: makeStats("h2", { participantCount: 20, teamCount: 4, submissionCount: 3 }),
    }

    render(<OrganizingDashboard hackathons={[h1, h2]} stats={stats} />)

    expect(screen.getByText("Events")).toBeDefined()
    expect(screen.getByText("Participants")).toBeDefined()
    expect(screen.getByText("Teams")).toBeDefined()
    expect(screen.getByText("Submissions")).toBeDefined()
    expect(screen.getByText("50")).toBeDefined()
  })

  it("renders active events with urgency signal", () => {
    const h = makeHackathon({ status: "judging" })
    const stats = {
      h1: makeStats("h1", { judgingTotal: 10, judgingComplete: 3 }),
    }

    render(<OrganizingDashboard hackathons={[h]} stats={stats} />)
    expect(screen.getByText("Needs attention")).toBeDefined()
    expect(screen.getByText("Test Hackathon")).toBeDefined()
  })

  it("renders past events in collapsed section", () => {
    const h = makeHackathon({
      status: "completed",
      starts_at: new Date(Date.now() - 7 * 86400000).toISOString(),
      ends_at: new Date(Date.now() - 86400000).toISOString(),
    })

    render(<OrganizingDashboard hackathons={[h]} stats={{ h1: makeStats("h1") }} />)
    expect(screen.getByText("Past events")).toBeDefined()
  })

  it("renders page header", () => {
    render(<OrganizingDashboard hackathons={[makeHackathon()]} stats={{ h1: makeStats("h1") }} />)
    expect(screen.getByText("Organizing")).toBeDefined()
    expect(screen.getByText("Your events at a glance")).toBeDefined()
  })

})
