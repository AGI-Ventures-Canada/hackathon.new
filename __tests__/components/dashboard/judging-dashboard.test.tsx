import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { render, screen, cleanup } from "@testing-library/react"
import { resetComponentMocks } from "../../lib/component-mocks"

const { JudgingDashboard } = await import(
  "@/app/(dashboard)/home/judging/judging-dashboard"
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
  status: "judging" as const,
  registration_opens_at: null,
  registration_closes_at: null,
  starts_at: new Date(Date.now() - 86400000).toISOString(),
  ends_at: new Date(Date.now() + 86400000).toISOString(),
  ...overrides,
})

const makeStats = (hackathonId: string, total: number, completed: number) => ({
  hackathonId,
  totalAssignments: total,
  completedAssignments: completed,
})

describe("JudgingDashboard", () => {
  it("renders empty state when no hackathons", () => {
    render(<JudgingDashboard hackathons={[]} judgeStats={{}} />)
    expect(screen.getByText("No judging assignments")).toBeDefined()
    expect(screen.getByText("Browse hackathons")).toBeDefined()
  })

  it("renders stat cards with totals", () => {
    const hackathons = [makeHackathon()]
    const stats = { h1: makeStats("h1", 10, 6) }

    render(<JudgingDashboard hackathons={hackathons} judgeStats={stats} />)

    expect(screen.getByText("Assigned")).toBeDefined()
    expect(screen.getByText("Completion")).toBeDefined()
    expect(screen.getAllByText(/60%/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText("6 / 10")).toBeDefined()
  })

  it("renders overall progress bar", () => {
    const stats = { h1: makeStats("h1", 10, 7) }
    render(<JudgingDashboard hackathons={[makeHackathon()]} judgeStats={stats} />)
    expect(screen.getByText("Overall progress")).toBeDefined()
    expect(screen.getByText("7 / 10")).toBeDefined()
  })

  it("shows pending reviews for incomplete active hackathons", () => {
    const stats = { h1: makeStats("h1", 8, 3) }
    render(<JudgingDashboard hackathons={[makeHackathon()]} judgeStats={stats} />)
    expect(screen.getByText("Ready to review")).toBeDefined()
    expect(screen.getByText("3 / 8 reviewed")).toBeDefined()
  })

  it("shows past events section for completed hackathons", () => {
    const h = makeHackathon({
      status: "completed",
      ends_at: new Date(Date.now() - 86400000).toISOString(),
    })
    const stats = { h1: makeStats("h1", 5, 5) }

    render(<JudgingDashboard hackathons={[h]} judgeStats={stats} />)
    expect(screen.getByText("Finished")).toBeDefined()
  })

  it("uses the server's actionable count for scheduled active events", () => {
    render(<JudgingDashboard hackathons={[makeHackathon({ status: "registration_open" })]} judgeStats={{ h1: { ...makeStats("h1", 3, 1), actionableAssignments: 2 } }} />)
    expect(screen.getByRole("heading", { name: "Ready to review" })).toBeDefined()
    expect(screen.getByRole("link", { name: /Test Hackathon/ }).getAttribute("href")).toBe("/e/test-hack/judge")
  })

  it("keeps unready scheduled work in Coming up", () => {
    render(<JudgingDashboard hackathons={[makeHackathon()]} judgeStats={{ h1: { ...makeStats("h1", 3, 1), actionableAssignments: 0 } }} />)
    expect(screen.getByRole("heading", { name: "Coming up" })).toBeDefined()
    expect(screen.queryByRole("heading", { name: "Ready to review" })).toBeNull()
  })

  it("moves completed reviews and closed windows into Finished", () => {
    render(<JudgingDashboard hackathons={[makeHackathon(), makeHackathon({ id: "h2", name: "Closed event", slug: "closed" })]} judgeStats={{ h1: makeStats("h1", 3, 3), h2: { ...makeStats("h2", 3, 1), actionableAssignments: 0, judgingClosed: true } }} />)
    expect(screen.getByRole("heading", { name: "Finished" })).toBeDefined()
    expect(screen.queryByRole("heading", { name: "Coming up" })).toBeNull()
  })

  it("renders page header", () => {
    render(<JudgingDashboard hackathons={[makeHackathon()]} judgeStats={{ h1: makeStats("h1", 0, 0) }} />)
    expect(screen.getByRole("heading", { level: 1 })).toBeDefined()
    expect(screen.getByText("Your review queue")).toBeDefined()
  })
})
