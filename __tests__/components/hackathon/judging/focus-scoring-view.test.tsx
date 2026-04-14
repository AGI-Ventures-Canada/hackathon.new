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

const { FocusScoringView } = await import(
  "@/components/hackathon/judging/focus-scoring-view"
)

const baseAssignments = [
  { id: "a1", submissionTitle: "Project Alpha", teamName: "Team A", teamMemberCount: 3, isComplete: false },
  { id: "a2", submissionTitle: "Project Beta", teamName: "Team B", teamMemberCount: 2, isComplete: false },
  { id: "a3", submissionTitle: "Project Gamma", teamName: null, teamMemberCount: 1, isComplete: false },
]

describe("FocusScoringView", () => {
  const onScoreSubmitted = mock(() => {})

  beforeEach(() => {
    resetComponentMocks()
    setPathname("/e/test-hack/judge")
    onScoreSubmitted.mockClear()
  })

  afterEach(() => {
    cleanup()
  })

  it("renders current assignment title and team name", () => {
    render(
      <FocusScoringView
        hackathonSlug="test-hack"
        assignments={baseAssignments}
        initialCompletedIds={new Set()}
        onScoreSubmitted={onScoreSubmitted}
      />
    )
    expect(screen.getByText("Project Alpha")).toBeDefined()
    expect(screen.getByText("Team A")).toBeDefined()
  })

  it("shows position counter", () => {
    render(
      <FocusScoringView
        hackathonSlug="test-hack"
        assignments={baseAssignments}
        initialCompletedIds={new Set()}
        onScoreSubmitted={onScoreSubmitted}
      />
    )
    expect(screen.getByText("1 of 3")).toBeDefined()
  })

  it("shows scored count", () => {
    render(
      <FocusScoringView
        hackathonSlug="test-hack"
        assignments={baseAssignments}
        initialCompletedIds={new Set(["a1"])}
        onScoreSubmitted={onScoreSubmitted}
      />
    )
    expect(screen.getByText("1/3 scored")).toBeDefined()
  })

  it("disables prev button at first assignment", () => {
    render(
      <FocusScoringView
        hackathonSlug="test-hack"
        assignments={baseAssignments}
        initialCompletedIds={new Set()}
        onScoreSubmitted={onScoreSubmitted}
      />
    )
    const buttons = screen.getAllByRole("button")
    const prevButton = buttons[0]
    expect(prevButton.hasAttribute("disabled")).toBe(true)
  })

  it("enables next button when not at last assignment", () => {
    render(
      <FocusScoringView
        hackathonSlug="test-hack"
        assignments={baseAssignments}
        initialCompletedIds={new Set()}
        onScoreSubmitted={onScoreSubmitted}
      />
    )
    const buttons = screen.getAllByRole("button")
    const nextButton = buttons[1]
    expect(nextButton.hasAttribute("disabled")).toBe(false)
  })

  it("shows Pending badge for unscored assignment", () => {
    render(
      <FocusScoringView
        hackathonSlug="test-hack"
        assignments={baseAssignments}
        initialCompletedIds={new Set()}
        onScoreSubmitted={onScoreSubmitted}
      />
    )
    expect(screen.getByText("Pending")).toBeDefined()
  })

  it("shows Scored badge when navigating to scored assignment", () => {
    render(
      <FocusScoringView
        hackathonSlug="test-hack"
        assignments={baseAssignments}
        initialCompletedIds={new Set(["a2"])}
        onScoreSubmitted={onScoreSubmitted}
      />
    )
    const nextButton = screen.getAllByRole("button")[1]
    fireEvent.click(nextButton)
    expect(screen.getByText("Scored")).toBeDefined()
    expect(screen.getByText("Project Beta")).toBeDefined()
  })

  it("starts at first unscored assignment", () => {
    render(
      <FocusScoringView
        hackathonSlug="test-hack"
        assignments={baseAssignments}
        initialCompletedIds={new Set(["a1"])}
        onScoreSubmitted={onScoreSubmitted}
      />
    )
    expect(screen.getByText("Project Beta")).toBeDefined()
    expect(screen.getByText("2 of 3")).toBeDefined()
  })

  it("shows completion state when all scored", () => {
    render(
      <FocusScoringView
        hackathonSlug="test-hack"
        assignments={baseAssignments}
        initialCompletedIds={new Set(["a1", "a2", "a3"])}
        onScoreSubmitted={onScoreSubmitted}
      />
    )
    expect(screen.getByText("All done!")).toBeDefined()
    expect(screen.getByText("You've scored all 3 assignments.")).toBeDefined()
  })

  it("passes cancelLabel='Skip' to ScoringPanel", () => {
    render(
      <FocusScoringView
        hackathonSlug="test-hack"
        assignments={baseAssignments}
        initialCompletedIds={new Set()}
        onScoreSubmitted={onScoreSubmitted}
      />
    )
    expect(screen.getByTestId("cancel-label").textContent).toBe("Skip")
  })

  it("renders ScoringPanel with current assignment id", () => {
    render(
      <FocusScoringView
        hackathonSlug="test-hack"
        assignments={baseAssignments}
        initialCompletedIds={new Set()}
        onScoreSubmitted={onScoreSubmitted}
      />
    )
    expect(screen.getByTestId("scoring-panel-a1")).toBeDefined()
  })

  it("handles assignment with no team name", () => {
    render(
      <FocusScoringView
        hackathonSlug="test-hack"
        assignments={baseAssignments}
        initialCompletedIds={new Set(["a1", "a2"])}
        onScoreSubmitted={onScoreSubmitted}
      />
    )
    expect(screen.getByText("Project Gamma")).toBeDefined()
    expect(screen.queryByText("Team")).toBeNull()
  })
})
