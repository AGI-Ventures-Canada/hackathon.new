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

mock.module("@/components/hackathon/judging/unified-scoring-panel", () => ({
  UnifiedScoringPanel: (props: { assignmentId: string; cancelLabel?: string; onClose: () => void; onScoreSubmitted: () => void }) => (
    <div data-testid={`unified-scoring-panel-${props.assignmentId}`}>
      <span data-testid="unified-cancel-label">{props.cancelLabel ?? "Cancel"}</span>
      <button data-testid="unified-mock-submit" onClick={props.onScoreSubmitted}>Submit</button>
      <button data-testid="unified-mock-close" onClick={props.onClose}>Close</button>
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

  it("keeps completed assignments open for review when all are scored", () => {
    render(
      <FocusScoringView
        hackathonSlug="test-hack"
        assignments={baseAssignments}
        initialCompletedIds={new Set(["a1", "a2", "a3"])}
        onScoreSubmitted={onScoreSubmitted}
      />
    )
    expect(screen.getByText("All scores are in.")).toBeDefined()
    expect(screen.getByText("You can review and change them while judging is open.")).toBeDefined()
    expect(screen.getByTestId("scoring-panel-a1")).toBeDefined()
    expect(screen.getByText("Scored")).toBeDefined()
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
    expect(screen.getByRole("button", { name: "Previous project" })).toBeDefined()
    expect(screen.getByRole("button", { name: "Next project" })).toBeDefined()
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

  it("renders UnifiedScoringPanel for unified_weighted_score assignments", () => {
    const unifiedAssignments = [
      {
        id: "u1",
        submissionTitle: "Unified Project",
        teamName: "Unified Team",
        teamMemberCount: 3,
        isComplete: false,
        assignmentKind: "unified_weighted_score" as const,
      },
    ]
    render(
      <FocusScoringView
        hackathonSlug="test-hack"
        assignments={unifiedAssignments}
        initialCompletedIds={new Set()}
        onScoreSubmitted={onScoreSubmitted}
      />
    )
    expect(screen.getByTestId("unified-scoring-panel-u1")).toBeDefined()
    expect(screen.queryByTestId("scoring-panel-u1")).toBeNull()
    expect(screen.getByTestId("unified-cancel-label").textContent).toBe("Skip")
  })

  it("falls back to ScoringPanel when assignmentKind is per_prize or missing", () => {
    const mixedAssignments = [
      {
        id: "p1",
        submissionTitle: "Per Prize Project",
        teamName: null,
        teamMemberCount: 2,
        isComplete: false,
        assignmentKind: "per_prize" as const,
      },
    ]
    render(
      <FocusScoringView
        hackathonSlug="test-hack"
        assignments={mixedAssignments}
        initialCompletedIds={new Set()}
        onScoreSubmitted={onScoreSubmitted}
      />
    )
    expect(screen.getByTestId("scoring-panel-p1")).toBeDefined()
    expect(screen.queryByTestId("unified-scoring-panel-p1")).toBeNull()
  })
})
