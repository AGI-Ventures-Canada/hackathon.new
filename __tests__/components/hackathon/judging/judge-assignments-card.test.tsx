import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test"
import { render, screen, cleanup, fireEvent } from "@testing-library/react"
import { resetComponentMocks, setPathname } from "../../../lib/component-mocks"

mock.module("@/components/hackathon/judging/scoring-panel", () => ({
  ScoringPanel: (props: { assignmentId: string; cancelLabel?: string; onClose: () => void; onScoreSubmitted: () => void }) => (
    <div data-testid={`scoring-panel-${props.assignmentId}`}>
      <span data-testid="cancel-label">{props.cancelLabel ?? "Cancel"}</span>
      <button data-testid="mock-submit" onClick={props.onScoreSubmitted}>Submit</button>
      <button data-testid="mock-close" onClick={props.onClose}>Close</button>
    </div>
  ),
}))

const { JudgeAssignmentsCard } = await import(
  "@/components/hackathon/judging/judge-assignments-card"
)

const baseAssignments = [
  {
    id: "a1",
    submissionId: "s1",
    submissionTitle: "Project Alpha",
    submissionDescription: "Desc A",
    submissionGithubUrl: null,
    submissionLiveAppUrl: null,
    submissionScreenshotUrl: null,
    teamName: "Team A",
    teamMemberCount: 3,
    isComplete: false,
    notes: "",
    viewedAt: null,
  },
  {
    id: "a2",
    submissionId: "s2",
    submissionTitle: "Project Beta",
    submissionDescription: "Desc B",
    submissionGithubUrl: null,
    submissionLiveAppUrl: null,
    submissionScreenshotUrl: null,
    teamName: "Team B",
    teamMemberCount: 2,
    isComplete: true,
    notes: "Good work",
    viewedAt: "2026-04-10T09:00:00Z",
  },
]

describe("JudgeAssignmentsCard", () => {
  beforeEach(() => {
    resetComponentMocks()
    setPathname("/e/test-hack/judge")
  })

  afterEach(() => {
    cleanup()
  })

  it("renders nothing when no assignments", () => {
    const { container } = render(
      <JudgeAssignmentsCard hackathonSlug="test-hack" assignments={[]} />
    )
    expect(container.innerHTML).toBe("")
  })

  it("renders card title", () => {
    render(
      <JudgeAssignmentsCard
        hackathonSlug="test-hack"
        assignments={baseAssignments}
      />
    )
    expect(screen.getByText("Your Judging Assignments")).toBeDefined()
  })

  it("renders scored count badge", () => {
    render(
      <JudgeAssignmentsCard
        hackathonSlug="test-hack"
        assignments={baseAssignments}
      />
    )
    const matches = screen.getAllByText((text) => text.includes("1") && text.includes("2") && text.includes("scored"))
    expect(matches.length).toBeGreaterThanOrEqual(1)
  })

  it("renders Focus and List toggle buttons", () => {
    render(
      <JudgeAssignmentsCard
        hackathonSlug="test-hack"
        assignments={baseAssignments}
      />
    )
    expect(screen.getByText("Focus")).toBeDefined()
    expect(screen.getByText("List")).toBeDefined()
  })

  it("defaults to Focus view with assignment content", () => {
    render(
      <JudgeAssignmentsCard
        hackathonSlug="test-hack"
        assignments={baseAssignments}
      />
    )
    expect(screen.getByText("1 of 2")).toBeDefined()
  })

  it("switches to List view when List button clicked", () => {
    render(
      <JudgeAssignmentsCard
        hackathonSlug="test-hack"
        assignments={baseAssignments}
      />
    )
    fireEvent.click(screen.getByText("List"))
    expect(screen.getByText("Project Alpha")).toBeDefined()
    expect(screen.getByText("Project Beta")).toBeDefined()
  })

  it("shows assignment status badges in list view", () => {
    render(
      <JudgeAssignmentsCard
        hackathonSlug="test-hack"
        assignments={baseAssignments}
      />
    )
    fireEvent.click(screen.getByText("List"))
    expect(screen.getByText("Pending")).toBeDefined()
    expect(screen.getByText("Scored")).toBeDefined()
  })

  it("switches back to Focus view", () => {
    render(
      <JudgeAssignmentsCard
        hackathonSlug="test-hack"
        assignments={baseAssignments}
      />
    )
    fireEvent.click(screen.getByText("List"))
    fireEvent.click(screen.getByText("Focus"))
    expect(screen.getByText("1 of 2")).toBeDefined()
  })
})
