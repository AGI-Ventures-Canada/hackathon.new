import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { getRouter, resetComponentMocks } from "../../../lib/component-mocks"
import { JudgesPickPanel } from "@/components/hackathon/judging/judges-pick-panel"

const originalFetch = global.fetch

const assignments = [
  {
    id: "a1",
    submissionId: "11111111-1111-1111-1111-111111111111",
    submissionTitle: "Project One",
    submissionDescription: "First project",
    submissionGithubUrl: null,
    submissionLiveAppUrl: null,
    submissionDemoVideoUrl: null,
    teamName: "Team One",
  },
  {
    id: "a2",
    submissionId: "22222222-2222-2222-2222-222222222222",
    submissionTitle: "Project Two",
    submissionDescription: "Second project",
    submissionGithubUrl: null,
    submissionLiveAppUrl: null,
    submissionDemoVideoUrl: null,
    teamName: "Team Two",
  },
]

describe("JudgesPickPanel", () => {
  beforeEach(() => {
    resetComponentMocks()
    global.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }))
    ) as unknown as typeof fetch
  })

  afterEach(() => {
    cleanup()
    global.fetch = originalFetch
  })

  it("saves picks in the order chosen by the judge", async () => {
    render(
      <JudgesPickPanel
        hackathonSlug="demo"
        prizeId="33333333-3333-3333-3333-333333333333"
        prizeName="Best project"
        maxPicks={2}
        assignments={assignments}
        initialPicks={[]}
      />
    )

    const pickButtons = screen.getAllByRole("button", { name: "Pick" })
    fireEvent.click(pickButtons[0])
    fireEvent.click(pickButtons[1])
    fireEvent.click(screen.getByRole("button", { name: "Move Project Two up" }))
    fireEvent.click(screen.getByRole("button", { name: "Save picks" }))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1))
    const [, options] = (global.fetch as ReturnType<typeof mock>).mock.calls[0] as unknown as [
      string,
      RequestInit,
    ]
    expect(JSON.parse(options.body as string)).toEqual({
      prizeId: "33333333-3333-3333-3333-333333333333",
      rankedSubmissionIds: [
        "22222222-2222-2222-2222-222222222222",
        "11111111-1111-1111-1111-111111111111",
      ],
    })
    expect(screen.getByText("Your picks are saved.")).toBeDefined()
    expect(getRouter().refresh).toHaveBeenCalledTimes(1)
  })

  it("stops new picks when the prize limit is reached", () => {
    render(
      <JudgesPickPanel
        hackathonSlug="demo"
        prizeId="33333333-3333-3333-3333-333333333333"
        prizeName="Best project"
        maxPicks={1}
        assignments={assignments}
        initialPicks={[]}
      />
    )

    const pickButtons = screen.getAllByRole("button", { name: "Pick" })
    fireEvent.click(pickButtons[0])

    expect(screen.getByRole("button", { name: "Picked" })).toBeDefined()
    expect(screen.getByRole("button", { name: "Pick" }).hasAttribute("disabled")).toBe(true)
  })
})
