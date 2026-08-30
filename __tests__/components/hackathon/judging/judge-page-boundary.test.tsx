import { beforeEach, describe, expect, it, mock } from "bun:test"
import { cleanup, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"

const redirect = mock((path: string) => {
  throw new Error(`REDIRECT:${path}`)
})
const notFound = mock(() => {
  throw new Error("NOT_FOUND")
})
const auth = mock(() => Promise.resolve({ userId: "judge-user" }))
const getPublicHackathon = mock(() => Promise.resolve<unknown>(null))
const getRegistrationInfo = mock(() => Promise.resolve<unknown>({
  participantRole: "judge",
  participantId: "judge-participant",
}))
const getJudgeAssignments = mock(() => Promise.resolve<unknown[]>([]))
const isJudgingOpenForHackathon = mock((event: { status: string; phase?: string | null }) =>
  Promise.resolve(
    event.status === "judging" ||
    (event.status === "active" &&
      (event.phase === "preliminaries" || event.phase === "finals")),
  ),
)
const getJudgePicks = mock(() => Promise.resolve<unknown[]>([]))
const routeJudgeAssignments = mock((_assignments: unknown[]) => ({
  scored: [],
  bucketGroups: [],
  gateGroups: [],
  pickGroups: [],
}))

let webMcpProps: Record<string, unknown> | null = null
let routedAssignments: Array<Record<string, unknown>> = []

mock.module("next/navigation", () => ({ redirect, notFound }))
mock.module("@clerk/nextjs/server", () => ({ auth }))
mock.module("@/lib/services/public-hackathons", () => ({
  getPublicHackathon,
  PUBLISHED_STATUSES: ["published", "registration_open", "active", "judging", "completed"],
}))
mock.module("@/lib/services/hackathons", () => ({ getRegistrationInfo }))
mock.module("@/lib/services/judging", () => ({
  getJudgeAssignments,
  isJudgingOpenForHackathon,
}))
mock.module("@/lib/services/judge-picks", () => ({ getJudgePicks }))
mock.module("@/lib/utils/judging-assignment-routing", () => ({
  routeJudgeAssignments: (assignments: Array<Record<string, unknown>>) => {
    routedAssignments = assignments
    return routeJudgeAssignments(assignments)
  },
}))
mock.module("@/components/hackathon/judging/judge-webmcp-tools", () => ({
  JudgeWebMcpTools: ({ children, ...props }: {
    children: ReactNode
    [key: string]: unknown
  }) => {
    webMcpProps = props
    return <div data-testid="judge-webmcp">{children}</div>
  },
}))
mock.module("@/components/hackathon/judging/judge-assignments-card", () => ({
  JudgeAssignmentsCard: (props: Record<string, unknown>) => (
    <div data-testid="scored-panel" data-props={JSON.stringify(props)} />
  ),
}))
mock.module("@/components/hackathon/judging/bucket-sort-panel", () => ({
  BucketSortPanel: (props: Record<string, unknown>) => (
    <div data-testid="bucket-panel" data-props={JSON.stringify(props)} />
  ),
}))
mock.module("@/components/hackathon/judging/gate-check-panel", () => ({
  GateCheckPanel: (props: Record<string, unknown>) => (
    <div data-testid="gate-panel" data-props={JSON.stringify(props)} />
  ),
}))
mock.module("@/components/hackathon/judging/judges-pick-panel", () => ({
  JudgesPickPanel: (props: Record<string, unknown>) => (
    <div data-testid="pick-panel" data-props={JSON.stringify(props)} />
  ),
}))
mock.module("@/components/page-header", () => ({
  PageHeader: () => <h1>Judging</h1>,
}))
mock.module("@/components/ui/auto-refresh", () => ({
  AutoRefresh: ({ intervalMs }: { intervalMs: number }) => (
    <span data-testid="refresh-interval">{intervalMs}</span>
  ),
}))
mock.module("lucide-react", () => ({
  Clock: () => <span data-testid="clock" />,
  Gavel: () => <span data-testid="gavel" />,
}))

const { default: JudgePage } = await import(
  "@/app/(public)/e/[slug]/judge/page"
)

const hackathon = {
  id: "hackathon-1",
  name: "Agent Jam",
  status: "judging",
  anonymous_judging: false,
  min_team_size: 2,
  allow_solo: true,
}

function assignment(
  id: string,
  judgingStyle: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    submissionId: `submission-${id}`,
    submissionTitle: `Project ${id}`,
    submissionDescription: `Description ${id}`,
    submissionGithubUrl: `https://github.com/example/${id}`,
    submissionLiveAppUrl: `https://example.com/${id}`,
    submissionDemoVideoUrl: null,
    teamName: `Team ${id}`,
    teamMode: "team",
    teamMemberCount: 3,
    selfJudging: true,
    isComplete: false,
    notes: "Private judge note",
    judgingStyle,
    prizeName: `Prize ${id}`,
    prizeId: `prize-${id}`,
    assignmentKind: "per_prize",
    maxPicks: 2,
    ...overrides,
  }
}

function callPage(slug = "agent-jam") {
  return JudgePage({ params: Promise.resolve({ slug }) })
}

beforeEach(() => {
  auth.mockReset()
  auth.mockResolvedValue({ userId: "judge-user" })
  getPublicHackathon.mockReset()
  getPublicHackathon.mockResolvedValue(hackathon)
  getRegistrationInfo.mockReset()
  getRegistrationInfo.mockResolvedValue({
    participantRole: "judge",
    participantId: "judge-participant",
  })
  getJudgeAssignments.mockReset()
  getJudgeAssignments.mockResolvedValue([])
  isJudgingOpenForHackathon.mockReset()
  isJudgingOpenForHackathon.mockImplementation((event) => Promise.resolve(
    event.status === "judging" ||
    (event.status === "active" &&
      (event.phase === "preliminaries" || event.phase === "finals")),
  ))
  getJudgePicks.mockReset()
  getJudgePicks.mockResolvedValue([])
  routeJudgeAssignments.mockReset()
  routeJudgeAssignments.mockReturnValue({
    scored: [],
    bucketGroups: [],
    gateGroups: [],
    pickGroups: [],
  })
  redirect.mockClear()
  notFound.mockClear()
  routedAssignments = []
  webMcpProps = null
})

describe("judge page boundary", () => {
  it("redirects signed-out and non-judge viewers before private assignments load", async () => {
    auth.mockResolvedValueOnce({ userId: null })
    await expect(callPage("private-event")).rejects.toThrow(
      `REDIRECT:/sign-in?redirect_url=${encodeURIComponent("/e/private-event/judge")}`,
    )
    expect(getPublicHackathon).not.toHaveBeenCalled()

    getRegistrationInfo.mockResolvedValueOnce({ participantRole: "participant" })
    await expect(callPage()).rejects.toThrow("REDIRECT:/e/agent-jam")
    expect(getJudgeAssignments).not.toHaveBeenCalled()
  })

  it("keeps unpublished judge access private and hides it from everyone else", async () => {
    getPublicHackathon.mockResolvedValue({ ...hackathon, status: "draft" })
    const waiting = await callPage()
    render(waiting)
    expect(screen.getByText("This event isn't live yet")).toBeDefined()
    expect(screen.getByTestId("clock")).toBeDefined()
    expect(screen.getByTestId("refresh-interval").textContent).toBe("15000")
    expect(screen.queryByRole("link", { name: "View Event" })).toBeNull()
    expect(getJudgeAssignments).not.toHaveBeenCalled()

    getRegistrationInfo.mockResolvedValueOnce({ participantRole: null })
    await expect(callPage()).rejects.toThrow("NOT_FOUND")
  })

  it("renders every configured response surface and loads only this judge's picks", async () => {
    const scored = assignment("score", "weighted_score", {
      assignmentKind: "unified_weighted_score",
    })
    const bucket = assignment("bucket", "bucket_sort")
    const gate = assignment("gate", "gate_check")
    const pick = assignment("pick", "judges_pick", { prizeName: null, maxPicks: 0 })
    const allAssignments = [scored, bucket, gate, pick]
    getJudgeAssignments.mockResolvedValue(allAssignments)
    getJudgePicks.mockResolvedValue([
      { prize_id: "prize-pick", submission_id: "submission-pick", rank: 1 },
      { prize_id: "another-prize", submission_id: "hidden", rank: 2 },
    ])
    routeJudgeAssignments.mockReturnValue({
      scored: [scored],
      bucketGroups: [["prize-bucket", [bucket]]],
      gateGroups: [["prize-gate", [gate]]],
      pickGroups: [["prize-pick", [pick]]],
    })

    render(await callPage())

    expect(screen.getByTestId("scored-panel")).toBeDefined()
    expect(screen.getByTestId("bucket-panel")).toBeDefined()
    expect(screen.getByTestId("gate-panel")).toBeDefined()
    expect(screen.getByTestId("pick-panel")).toBeDefined()
    expect(screen.getByTestId("refresh-interval").textContent).toBe("15000")
    expect(getJudgePicks).toHaveBeenCalledWith("hackathon-1", "judge-participant")
    const pickProps = JSON.parse(screen.getByTestId("pick-panel").dataset.props!)
    expect(pickProps).toMatchObject({
      prizeName: "Judge's pick",
      maxPicks: 1,
      initialPicks: [{ submissionId: "submission-pick", rank: 1 }],
    })
    const scoredProps = JSON.parse(screen.getByTestId("scored-panel").dataset.props!)
    expect(scoredProps).toMatchObject({
      summaryHref: "/e/agent-jam/judge/summary",
      teamSettings: { minTeamSize: 2, allowSolo: true },
    })
    expect(webMcpProps).toMatchObject({ slug: "agent-jam", enabled: true })
    expect((webMcpProps?.assignments as unknown[])).toHaveLength(4)
  })

  it("strips every team signal before anonymous assignments reach any judge panel", async () => {
    getPublicHackathon.mockResolvedValue({ ...hackathon, anonymous_judging: true })
    const privateAssignment = assignment("anonymous", "weighted_score")
    getJudgeAssignments.mockResolvedValue([privateAssignment])
    routeJudgeAssignments.mockImplementation((assignments) => ({
      scored: assignments,
      bucketGroups: [],
      gateGroups: [],
      pickGroups: [],
    }))

    render(await callPage())

    expect(routedAssignments[0]).toMatchObject({
      teamName: null,
      teamMode: null,
      teamMemberCount: null,
      selfJudging: false,
    })
    expect((webMcpProps?.assignments as Array<Record<string, unknown>>)[0]).toMatchObject({
      teamName: null,
      judgingStyle: "weighted_score",
    })
    expect(JSON.stringify(webMcpProps)).not.toContain("Team anonymous")
  })

  it("renders the empty assignment state and skips pick reads without a participant", async () => {
    getRegistrationInfo.mockResolvedValue({
      participantRole: "judge",
      participantId: null,
    })
    render(await callPage())
    expect(screen.getByText("No projects are assigned yet")).toBeDefined()
    expect(screen.getByText(/You don't need to do anything right now/)).toBeDefined()
    expect(getJudgePicks).not.toHaveBeenCalled()
  })

  it("shows phase-aware waiting and closed states without loading assignments", async () => {
    getPublicHackathon.mockResolvedValueOnce({ ...hackathon, status: "published" })
    render(await callPage())
    expect(screen.getByText("Judging hasn't started")).toBeDefined()
    expect(screen.getByTestId("refresh-interval").textContent).toBe("15000")
    expect(getJudgeAssignments).not.toHaveBeenCalled()

    cleanup()
    getPublicHackathon.mockResolvedValueOnce({
      ...hackathon,
      status: "active",
      phase: "build",
    })
    render(await callPage())
    expect(screen.getByText("Judging hasn't started")).toBeDefined()
    expect(screen.queryByTestId("judge-webmcp")).toBeNull()
    expect(getJudgeAssignments).not.toHaveBeenCalled()

    cleanup()
    getJudgeAssignments.mockClear()
    getPublicHackathon.mockResolvedValueOnce({ ...hackathon, status: "completed" })
    render(await callPage())
    expect(screen.getByText("Judging is closed")).toBeDefined()
    expect(getJudgeAssignments).not.toHaveBeenCalled()

    cleanup()
    getPublicHackathon.mockResolvedValueOnce({ ...hackathon, status: "archived" })
    render(await callPage())
    expect(screen.getByText("Judging is closed")).toBeDefined()
    expect(screen.queryByTestId("refresh-interval")).toBeNull()
    expect(getJudgeAssignments).not.toHaveBeenCalled()
  })
})
