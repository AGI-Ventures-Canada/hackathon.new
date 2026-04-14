import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test"
import { render, screen, cleanup, waitFor } from "@testing-library/react"
import { resetComponentMocks } from "../../../lib/component-mocks"

let fetchImpl: (url: string, init?: RequestInit) => Promise<Response>

const originalFetch = globalThis.fetch

const prizesResponse = {
  prizes: [
    {
      id: "p1",
      name: "Best Overall",
      description: "Top project",
      value: "$1000",
      judging_style: "points",
      assignment_mode: null,
      max_picks: null,
      round_id: null,
      display_order: 0,
      is_screening: false,
      totalAssignments: 5,
      completedAssignments: 2,
      judgeCount: 3,
    },
    {
      id: "p-screening",
      name: "Screening",
      description: null,
      value: null,
      judging_style: null,
      assignment_mode: null,
      max_picks: null,
      round_id: null,
      display_order: 1,
      is_screening: true,
      totalAssignments: 0,
      completedAssignments: 0,
      judgeCount: 0,
    },
  ],
}

const judgesResponse = {
  judges: [
    {
      participantId: "j1",
      clerkUserId: "clerk-j1",
      displayName: "Alice Judge",
      email: "alice@example.com",
      imageUrl: null,
      prizeIds: ["p1"],
    },
  ],
}

const roundsResponse = { rounds: [] }

const invitationsResponse = {
  invitations: [
    { id: "inv1", email: "pending@example.com", status: "pending", created_at: "2026-04-10T00:00:00Z" },
    { id: "inv2", email: "accepted@example.com", status: "accepted", created_at: "2026-04-09T00:00:00Z" },
  ],
}

function mockFetchSuccess() {
  fetchImpl = async (url: string) => {
    const urlStr = String(url)
    if (urlStr.includes("/prizes")) return Response.json(prizesResponse)
    if (urlStr.includes("/judges")) return Response.json(judgesResponse)
    if (urlStr.includes("/rounds")) return Response.json(roundsResponse)
    if (urlStr.includes("/invitations")) return Response.json(invitationsResponse)
    return new Response("Not found", { status: 404 })
  }
}

function mockFetchError(failEndpoint: string) {
  fetchImpl = async (url: string) => {
    const urlStr = String(url)
    if (urlStr.includes(failEndpoint)) {
      return new Response(JSON.stringify({ error: "Server error" }), { status: 500 })
    }
    if (urlStr.includes("/prizes")) return Response.json(prizesResponse)
    if (urlStr.includes("/judges")) return Response.json(judgesResponse)
    if (urlStr.includes("/rounds")) return Response.json(roundsResponse)
    if (urlStr.includes("/invitations")) return Response.json(invitationsResponse)
    return new Response("Not found", { status: 404 })
  }
}

mock.module("@/components/hackathon/judging/judging-setup-wizard", () => ({
  JudgingSetupWizard: (props: {
    prizes: { id: string; name: string }[]
    judges: { participantId: string; displayName: string }[]
    rounds: unknown[]
    pendingInvitations: { id: string; email: string }[]
  }) => (
    <div data-testid="wizard">
      <span data-testid="prize-count">{props.prizes.length}</span>
      <span data-testid="judge-count">{props.judges.length}</span>
      <span data-testid="round-count">{props.rounds.length}</span>
      <span data-testid="invitation-count">{props.pendingInvitations.length}</span>
      {props.prizes.map((p) => (
        <span key={p.id} data-testid={`prize-${p.id}`}>{p.name}</span>
      ))}
      {props.judges.map((j) => (
        <span key={j.participantId} data-testid={`judge-${j.participantId}`}>{j.displayName}</span>
      ))}
    </div>
  ),
}))

const { JudgingSetupDialog } = await import(
  "@/components/hackathon/judging/judging-setup-dialog"
)

describe("JudgingSetupDialog", () => {
  beforeEach(() => {
    cleanup()
    resetComponentMocks()
    globalThis.fetch = (url: string | URL | Request, init?: RequestInit) =>
      fetchImpl(String(url), init)
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it("shows loading state then renders wizard with mapped data", async () => {
    mockFetchSuccess()

    render(
      <JudgingSetupDialog
        hackathonId="h1"
        slug="test-hack"
        open={true}
        onOpenChange={() => {}}
      />
    )

    await waitFor(() => {
      expect(screen.getByTestId("wizard")).toBeDefined()
    })

    expect(screen.getByTestId("prize-count").textContent).toBe("1")
    expect(screen.getByTestId("prize-p1").textContent).toBe("Best Overall")
    expect(screen.queryByTestId("prize-p-screening")).toBeNull()

    expect(screen.getByTestId("judge-count").textContent).toBe("1")
    expect(screen.getByTestId("judge-j1").textContent).toBe("Alice Judge")

    expect(screen.getByTestId("round-count").textContent).toBe("0")

    expect(screen.getByTestId("invitation-count").textContent).toBe("1")
  })

  it("shows error when an API call fails", async () => {
    mockFetchError("/prizes")

    render(
      <JudgingSetupDialog
        hackathonId="h1"
        slug="test-hack"
        open={true}
        onOpenChange={() => {}}
      />
    )

    await waitFor(() => {
      expect(screen.getByText("Server error")).toBeDefined()
    })

    expect(screen.queryByTestId("wizard")).toBeNull()
  })

  it("does not fetch when closed", async () => {
    let fetchCalled = false
    fetchImpl = async () => {
      fetchCalled = true
      return Response.json({})
    }

    render(
      <JudgingSetupDialog
        hackathonId="h1"
        slug="test-hack"
        open={false}
        onOpenChange={() => {}}
      />
    )

    await new Promise((r) => setTimeout(r, 50))
    expect(fetchCalled).toBe(false)
  })
})
