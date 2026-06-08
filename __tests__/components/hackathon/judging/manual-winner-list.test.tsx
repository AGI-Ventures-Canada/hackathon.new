import React from "react"
import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test"
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react"
import { resetComponentMocks } from "../../../lib/component-mocks"

let selectOnValueChange: ((v: string) => void) | null = null
let selectCurrentValue = ""
mock.module("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string
    onValueChange?: (v: string) => void
    children: React.ReactNode
  }) => {
    selectOnValueChange = onValueChange ?? null
    selectCurrentValue = value
    return <div data-testid="prize-filter-select">{children}</div>
  },
  SelectTrigger: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="prize-filter-trigger" role="combobox">
      {children}
    </div>
  ),
  SelectValue: () => <span data-testid="prize-filter-value">{selectCurrentValue}</span>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({
    children,
    value,
  }: {
    children: React.ReactNode
    value: string
  }) => (
    <button
      type="button"
      role="option"
      aria-label={typeof children === "string" ? children : undefined}
      aria-selected={selectCurrentValue === value}
      onClick={() => selectOnValueChange?.(value)}
    >
      {children}
    </button>
  ),
}))

type FetchHandler = (url: string, init?: RequestInit) => Promise<Response>

let fetchHandler: FetchHandler = () =>
  Promise.resolve(new Response("{}", { status: 200 }))

const mockFetch = mock((url: string, init?: RequestInit) => fetchHandler(url, init))
globalThis.fetch = mockFetch as unknown as typeof fetch

const { ManualWinnerList } = await import(
  "@/components/hackathon/judging/manual-winner-list"
)

type WinnerPickerPrize = { id: string; name: string }
type PrizeScore = {
  prizeId: string
  prizeName: string
  score: number
  judgeCount: number
}
type WinnerPickerProject = {
  submissionId: string
  projectTitle: string
  teamId: string | null
  teamName: string | null
  prizeIds: string[]
  score: number | null
  judgeCount: number
  prizeScores: PrizeScore[]
}
type WinnerPickerData = {
  prizes: WinnerPickerPrize[]
  projects: WinnerPickerProject[]
}

function setFetchData(data: WinnerPickerData) {
  fetchHandler = (url) => {
    if (url.includes("/winner-picker")) {
      return Promise.resolve(new Response(JSON.stringify(data), { status: 200 }))
    }
    return Promise.resolve(new Response("{}", { status: 200 }))
  }
}

const basePrizes: WinnerPickerPrize[] = [
  { id: "prize-grand", name: "Grand Prize" },
  { id: "prize-runner", name: "Runner Up" },
  { id: "prize-design", name: "Best Design" },
]

const baseProjects: WinnerPickerProject[] = [
  {
    submissionId: "sub-a",
    projectTitle: "Alpha Project",
    teamId: "team-a",
    teamName: "Alpha Team",
    prizeIds: ["prize-grand"],
    score: 0.9,
    judgeCount: 3,
    prizeScores: [
      { prizeId: "prize-grand", prizeName: "Grand Prize", score: 0.9, judgeCount: 3 },
      { prizeId: "prize-runner", prizeName: "Runner Up", score: 0.4, judgeCount: 3 },
    ],
  },
  {
    submissionId: "sub-b",
    projectTitle: "Bravo Project",
    teamId: "team-b",
    teamName: "Bravo Team",
    prizeIds: [],
    score: 0.7,
    judgeCount: 3,
    prizeScores: [
      { prizeId: "prize-grand", prizeName: "Grand Prize", score: 0.7, judgeCount: 3 },
      { prizeId: "prize-runner", prizeName: "Runner Up", score: 0.85, judgeCount: 3 },
    ],
  },
  {
    submissionId: "sub-c",
    projectTitle: "Charlie Project",
    teamId: "team-c",
    teamName: "Charlie Team",
    prizeIds: [],
    score: 0.5,
    judgeCount: 3,
    prizeScores: [
      { prizeId: "prize-design", prizeName: "Best Design", score: 0.5, judgeCount: 3 },
    ],
  },
]

function pickPrize(name: string) {
  const options = screen.getAllByRole("option", { name })
  fireEvent.click(options[0])
}

function getProjectTitles() {
  return screen
    .getAllByText(/^(Alpha|Bravo|Charlie) Project$/)
    .map((el) => el.textContent ?? "")
}

describe("ManualWinnerList — per-prize filter", () => {
  beforeEach(() => {
    resetComponentMocks()
    mockFetch.mockClear()
    selectOnValueChange = null
    selectCurrentValue = ""
    setFetchData({ prizes: basePrizes, projects: baseProjects })
  })

  afterEach(cleanup)

  it("shows the prize filter when there are multiple prizes", async () => {
    render(
      <ManualWinnerList hackathonId="h1" roundId="r1" roundName="Finals" />
    )
    await screen.findByText("Alpha Project")
    expect(screen.getByRole("option", { name: "All prizes" })).toBeDefined()
    expect(screen.getByRole("option", { name: "Grand Prize" })).toBeDefined()
  })

  it("hides the prize filter when there is only one prize", async () => {
    setFetchData({
      prizes: [basePrizes[0]],
      projects: [
        {
          ...baseProjects[0],
          prizeIds: [],
          prizeScores: [
            { prizeId: "prize-grand", prizeName: "Grand Prize", score: 0.9, judgeCount: 3 },
          ],
        },
      ],
    })
    render(
      <ManualWinnerList hackathonId="h1" roundId="r1" roundName="Finals" />
    )
    await screen.findByText("Alpha Project")
    expect(screen.queryByRole("option", { name: "All prizes" })).toBeNull()
  })

  it("filters projects to only those competing for the selected prize", async () => {
    render(
      <ManualWinnerList hackathonId="h1" roundId="r1" roundName="Finals" />
    )
    await screen.findByText("Alpha Project")

    pickPrize("Best Design")

    await waitFor(() => {
      expect(screen.queryByText("Alpha Project")).toBeNull()
      expect(screen.queryByText("Bravo Project")).toBeNull()
      expect(screen.getByText("Charlie Project")).toBeDefined()
    })
  })

  it("shows an empty state when no projects compete for the selected prize", async () => {
    setFetchData({
      prizes: basePrizes,
      projects: [
        {
          ...baseProjects[0],
          prizeIds: [],
          prizeScores: [
            { prizeId: "prize-grand", prizeName: "Grand Prize", score: 0.9, judgeCount: 3 },
          ],
        },
      ],
    })
    render(
      <ManualWinnerList hackathonId="h1" roundId="r1" roundName="Finals" />
    )
    await screen.findByText("Alpha Project")

    pickPrize("Best Design")

    await screen.findByText("No projects compete for this prize yet.")
  })

  it("shows the current winner in the header when a specific prize is selected", async () => {
    render(
      <ManualWinnerList hackathonId="h1" roundId="r1" roundName="Finals" />
    )
    await screen.findByText("Alpha Project")

    pickPrize("Grand Prize")

    await screen.findByText("Winner: Alpha Project")
  })

  it("shows 'No winner yet' when the selected prize has no assignment", async () => {
    render(
      <ManualWinnerList hackathonId="h1" roundId="r1" roundName="Finals" />
    )
    await screen.findByText("Alpha Project")

    pickPrize("Runner Up")

    await screen.findByText("No winner yet")
  })

  it("sorts projects by the selected prize's score descending", async () => {
    render(
      <ManualWinnerList hackathonId="h1" roundId="r1" roundName="Finals" />
    )
    await screen.findByText("Alpha Project")

    pickPrize("Runner Up")

    await waitFor(() => {
      const titles = getProjectTitles()
      expect(titles[0]).toBe("Bravo Project")
      expect(titles[1]).toBe("Alpha Project")
    })
  })

  it("falls back to the default sort when 'All prizes' is selected", async () => {
    render(
      <ManualWinnerList hackathonId="h1" roundId="r1" roundName="Finals" />
    )
    await screen.findByText("Alpha Project")

    const titles = getProjectTitles()
    expect(titles[0]).toBe("Alpha Project")
    expect(titles[1]).toBe("Bravo Project")
    expect(titles[2]).toBe("Charlie Project")
  })
})
