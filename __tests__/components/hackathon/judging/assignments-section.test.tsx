import { describe, expect, it, beforeEach, afterEach, mock } from "bun:test"
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react"
import { resetComponentMocks } from "../../../lib/component-mocks"

const { AssignmentsSection } = await import(
  "@/components/hackathon/judging/assignments-section"
)

type Judge = {
  participantId: string
  displayName: string
  imageUrl: string | null
}

const judgeA: Judge = {
  participantId: "p1",
  displayName: "Alice Anderson",
  imageUrl: null,
}

const judgeB: Judge = {
  participantId: "p2",
  displayName: "Bob Brown",
  imageUrl: null,
}

const originalFetch = globalThis.fetch
const fetchMock = mock(() => Promise.resolve(new Response(null, { status: 204 })))

describe("AssignmentsSection mass-assign confirmation", () => {
  beforeEach(() => {
    cleanup()
    resetComponentMocks()
    fetchMock.mockClear()
    globalThis.fetch = fetchMock as unknown as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it("does not assign on first click — opens a confirmation dialog instead", () => {
    render(
      <AssignmentsSection
        hackathonId="h1"
        judges={[judgeA, judgeB]}
        totalSubmissionCount={5}
        rooms={[]}
        countsByJudge={{}}
        hasWeightedScoring={true}
      />,
    )

    fireEvent.click(screen.getByText("Assign every judge"))

    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByRole("alertdialog")).toBeDefined()
    expect(screen.getByText("Give every judge all projects?")).toBeDefined()
  })

  it("calls the assign API for each judge after the user confirms", async () => {
    render(
      <AssignmentsSection
        hackathonId="h1"
        judges={[judgeA, judgeB]}
        totalSubmissionCount={5}
        rooms={[]}
        countsByJudge={{}}
        hasWeightedScoring={true}
      />,
    )

    fireEvent.click(screen.getByText("Assign every judge"))
    fireEvent.click(screen.getByText("Yes, assign them"))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    const url = String(fetchMock.mock.calls[0]?.[0])
    expect(url).toBe(
      "/api/dashboard/hackathons/h1/judging/assign-weighted-score-judge",
    )
  })

  it("does not call the assign API when the user cancels", () => {
    render(
      <AssignmentsSection
        hackathonId="h1"
        judges={[judgeA, judgeB]}
        totalSubmissionCount={5}
        rooms={[]}
        countsByJudge={{}}
        hasWeightedScoring={true}
      />,
    )

    fireEvent.click(screen.getByText("Assign every judge"))
    fireEvent.click(screen.getByText("Cancel"))

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("warns about overriding room scoping when rooms exist and All projects is selected", () => {
    render(
      <AssignmentsSection
        hackathonId="h1"
        judges={[judgeA]}
        totalSubmissionCount={5}
        rooms={[{ id: "room-1", name: "Atrium", submissionCount: 3 }]}
        countsByJudge={{}}
        hasWeightedScoring={true}
      />,
    )

    fireEvent.click(screen.getByText("Assign every judge"))

    expect(
      screen.getByText(
        /you have rooms set up\. This skips room scoping and gives every judge every project/i,
      ),
    ).toBeDefined()
  })

  it("does not open the dialog when every judge is already fully assigned", () => {
    render(
      <AssignmentsSection
        hackathonId="h1"
        judges={[judgeA, judgeB]}
        totalSubmissionCount={2}
        rooms={[]}
        countsByJudge={{
          p1: { all: 2, byRoom: {} },
          p2: { all: 2, byRoom: {} },
        }}
        hasWeightedScoring={true}
      />,
    )

    expect(screen.queryByText("Assign every judge")).toBeNull()
  })

  it("shows the count of new picks and judges in the dialog body", () => {
    render(
      <AssignmentsSection
        hackathonId="h1"
        judges={[judgeA, judgeB]}
        totalSubmissionCount={5}
        rooms={[]}
        countsByJudge={{
          p1: { all: 2, byRoom: {} },
          p2: { all: 0, byRoom: {} },
        }}
        hasWeightedScoring={true}
      />,
    )

    fireEvent.click(screen.getByText("Assign every judge"))

    expect(
      screen.getByText("This adds 8 new picks across 2 judges."),
    ).toBeDefined()
  })
})
