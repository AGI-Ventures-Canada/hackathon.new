import { describe, expect, it, mock, beforeEach } from "bun:test"

const mockListPrizes = mock(() => Promise.resolve([]))
const mockListJudges = mock(() => Promise.resolve([]))
const mockGetJudgingProgress = mock(() =>
  Promise.resolve({ totalAssignments: 0, completedAssignments: 0, judges: [] })
)
const mockListRounds = mock(() => Promise.resolve([]))

mock.module("@/lib/services/judging", () => ({
  listPrizes: mockListPrizes,
  listJudges: mockListJudges,
  getJudgingProgress: mockGetJudgingProgress,
  listRounds: mockListRounds,
  countJudges: mock(() => Promise.resolve(0)),
}))

const mockListJudgeInvitations = mock(() => Promise.resolve([]))

mock.module("@/lib/services/judge-invitations", () => ({
  listJudgeInvitations: mockListJudgeInvitations,
}))

const mockGetResults = mock(() => Promise.resolve([]))
const mockCalculateResults = mock(() => Promise.resolve({ success: true, count: 0 }))

mock.module("@/lib/services/results", () => ({
  getResults: mockGetResults,
  calculateResults: mockCalculateResults,
}))

mock.module("@/lib/services/prizes", () => ({
  listPrizeAssignments: mock(() => Promise.resolve([])),
}))

mock.module("@/components/hackathon/judging/judging-tab-client", () => ({
  JudgingTabClient: (props: Record<string, unknown>) => props,
}))

const { JudgingTabContent } = await import(
  "@/app/(public)/e/[slug]/manage/_judging-tab"
)

const baseProps = {
  hackathonId: "11111111-1111-1111-1111-111111111111",
  slug: "test-event",
  submissions: [],
  resultsPublishedAt: null,
  activeJtab: "data" as const,
  hasJudgingSetup: true,
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getJudgingClientProps(element: any): Record<string, unknown> {
  // The rendered tree is TabsUrlSync > [TabsList, TabsContent(dataView), TabsContent(wizard)]
  // dataView is the JudgingTabClient element; its .props is what the client receives.
  const children = Array.isArray(element.props.children) ? element.props.children : [element.props.children]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dataTab = children.find((c: any) => c?.props?.value === "data")
  return dataTab.props.children.props
}

describe("JudgingTabContent", () => {
  beforeEach(() => {
    mockListPrizes.mockClear()
    mockListJudges.mockClear()
    mockGetJudgingProgress.mockClear()
    mockListRounds.mockClear()
    mockListJudgeInvitations.mockClear()
    mockGetResults.mockClear()
  })

  it("fetches all data for the given hackathonId", async () => {
    await JudgingTabContent(baseProps)
    expect(mockListPrizes).toHaveBeenCalledWith(baseProps.hackathonId)
    expect(mockListJudges).toHaveBeenCalledWith(baseProps.hackathonId)
    expect(mockGetJudgingProgress).toHaveBeenCalledWith(baseProps.hackathonId)
    expect(mockListRounds).toHaveBeenCalledWith(baseProps.hackathonId)
    expect(mockListJudgeInvitations).toHaveBeenCalledWith(baseProps.hackathonId, "pending")
    expect(mockGetResults).toHaveBeenCalledWith(baseProps.hackathonId)
  })

  it("maps prize fields to client-friendly format", async () => {
    mockListPrizes.mockResolvedValueOnce([
      {
        id: "p1",
        name: "Grand Prize",
        description: "Top submission",
        value: "$5,000",
        judging_style: "bucket_sort",
        assignment_mode: "organizer_assigned",
        max_picks: 3,
        round_id: null,
        display_order: 0,
        totalAssignments: 10,
        completedAssignments: 5,
        judgeCount: 3,
      },
    ])

    const element = await JudgingTabContent(baseProps)
    const result = getJudgingClientProps(element)
    const prizes = result.prizes as Array<Record<string, unknown>>

    expect(prizes).toHaveLength(1)
    expect(prizes[0].id).toBe("p1")
    expect(prizes[0].judgingStyle).toBe("bucket_sort")
    expect(prizes[0].totalAssignments).toBe(10)
    expect(prizes[0].completedAssignments).toBe(5)
  })

  it("maps judge fields to client-friendly format", async () => {
    mockListJudges.mockResolvedValueOnce([
      {
        participantId: "jp1",
        clerkUserId: "user_123",
        displayName: "Alice",
        email: "alice@example.com",
        imageUrl: null,
        prizeIds: ["p1"],
        assignmentCount: 5,
        completedCount: 3,
      },
    ])

    const element = await JudgingTabContent(baseProps)
    const result = getJudgingClientProps(element)
    const judges = result.judges as Array<Record<string, unknown>>

    expect(judges).toHaveLength(1)
    expect(judges[0].participantId).toBe("jp1")
    expect(judges[0].displayName).toBe("Alice")
    expect(judges[0].prizeIds).toEqual(["p1"])
  })

  it("sets isPublished=false when resultsPublishedAt is null", async () => {
    const element = await JudgingTabContent(baseProps)
    const result = getJudgingClientProps(element)
    expect(result.isPublished).toBe(false)
  })

  it("sets isPublished=true when resultsPublishedAt has a value", async () => {
    const element = await JudgingTabContent({
      ...baseProps,
      resultsPublishedAt: "2026-03-01T00:00:00Z",
    })
    const result = getJudgingClientProps(element)
    expect(result.isPublished).toBe(true)
  })

  it("derives round isActive from status", async () => {
    mockListRounds.mockResolvedValueOnce([
      { id: "r1", hackathonId: baseProps.hackathonId, name: "Round 1", status: "active", displayOrder: 0, submissionCount: 0 },
      { id: "r2", hackathonId: baseProps.hackathonId, name: "Round 2", status: "planned", displayOrder: 1, submissionCount: 0 },
    ])

    const element = await JudgingTabContent(baseProps)
    const result = getJudgingClientProps(element)
    const rounds = result.rounds as Array<Record<string, unknown>>

    expect(rounds[0].isActive).toBe(true)
    expect(rounds[1].isActive).toBe(false)
  })
})
