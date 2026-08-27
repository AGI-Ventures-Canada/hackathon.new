import { describe, expect, it, beforeEach, afterEach, mock } from "bun:test"
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react"
import { resetComponentMocks } from "../../../lib/component-mocks"

const { JudgesSection } = await import(
  "@/components/hackathon/judging/judging-tab-client"
)

type Judge = {
  participantId: string
  clerkUserId: string
  displayName: string
  email: string | null
  imageUrl: string | null
  prizeIds: string[]
  notificationQueued?: boolean
}

type Invitation = {
  id: string
  email: string
  status: string
  createdAt: string
  remindedAt: string | null
  emailedAt: string | null
  token: string | null
}

const baseJudge: Judge = {
  participantId: "p1",
  clerkUserId: "user_p1",
  displayName: "Alice Anderson",
  email: "alice@example.com",
  imageUrl: null,
  prizeIds: [],
}

const secondJudge: Judge = {
  participantId: "p2",
  clerkUserId: "user_p2",
  displayName: "Bob Brown",
  email: "bob@example.com",
  imageUrl: null,
  prizeIds: ["prize-1", "prize-2"],
}

const pendingInvitation: Invitation = {
  id: "inv-1",
  email: "carol@example.com",
  status: "pending",
  createdAt: "2026-05-01T00:00:00Z",
  remindedAt: null,
  emailedAt: "2026-05-01T00:00:01Z",
  token: "token-abc",
}

const remindedInvitation: Invitation = {
  id: "inv-2",
  email: "dave@example.com",
  status: "pending",
  createdAt: "2026-05-01T00:00:00Z",
  remindedAt: "2026-05-05T00:00:00Z",
  emailedAt: "2026-05-01T00:00:01Z",
  token: "token-def",
}

const noop = () => {}

describe("JudgesSection", () => {
  beforeEach(() => {
    resetComponentMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it("renders empty state when no judges or invitations", () => {
    render(
      <JudgesSection
        judges={[]}
        invitations={[]}
        hackathonId="h1"
        onAddJudge={noop}
        onRemoveJudge={noop}
        onCancelInvitation={noop}
        onRemindInvitation={noop}
      />
    )
    expect(
      screen.getByText("No judges yet. Add judges to start assigning them to prizes.")
    ).toBeDefined()
  })

  it("renders merged count badge for judges plus invitations", () => {
    render(
      <JudgesSection
        judges={[baseJudge, secondJudge]}
        invitations={[pendingInvitation]}
        hackathonId="h1"
        onAddJudge={noop}
        onRemoveJudge={noop}
        onCancelInvitation={noop}
        onRemindInvitation={noop}
      />
    )
    const title = screen.getByText("Judges").parentElement
    expect(title).not.toBeNull()
    expect(within(title as HTMLElement).getByText("3")).toBeDefined()
  })

  it("renders Active badge for confirmed judges", () => {
    render(
      <JudgesSection
        judges={[baseJudge]}
        invitations={[]}
        hackathonId="h1"
        onAddJudge={noop}
        onRemoveJudge={noop}
        onCancelInvitation={noop}
        onRemindInvitation={noop}
      />
    )
    expect(screen.getByText("Active")).toBeDefined()
    expect(screen.getByText("Alice Anderson")).toBeDefined()
    expect(screen.getByText("alice@example.com")).toBeDefined()
  })

  it("renders prize count for judges with prize assignments", () => {
    render(
      <JudgesSection
        judges={[secondJudge]}
        invitations={[]}
        hackathonId="h1"
        onAddJudge={noop}
        onRemoveJudge={noop}
        onCancelInvitation={noop}
        onRemindInvitation={noop}
      />
    )
    expect(screen.getByText("2 prizes")).toBeDefined()
  })

  it("renders Sent badge for pending invitations and Reminded badge for reminded ones", () => {
    render(
      <JudgesSection
        judges={[]}
        invitations={[pendingInvitation, remindedInvitation]}
        hackathonId="h1"
        onAddJudge={noop}
        onRemoveJudge={noop}
        onCancelInvitation={noop}
        onRemindInvitation={noop}
      />
    )
    expect(screen.getByText("Sent")).toBeDefined()
    expect(screen.getByText("Reminded")).toBeDefined()
    expect(screen.getByText("carol@example.com")).toBeDefined()
    expect(screen.getByText("dave@example.com")).toBeDefined()
  })

  it("shows why draft invitation emails are queued", () => {
    render(
      <JudgesSection
        judges={[]}
        invitations={[{ ...pendingInvitation, emailedAt: null }]}
        hackathonId="h1"
        hackathonStatus="draft"
        onAddJudge={noop}
        onRemoveJudge={noop}
        onCancelInvitation={noop}
        onRemindInvitation={noop}
      />
    )
    expect(screen.getByText("Queued")).toBeDefined()
    expect(screen.getByText("1 email is queued")).toBeDefined()
    expect(screen.getByText(/This event is still a draft/)).toBeDefined()
  })

  it("shows queued email status for a judge who was added directly", () => {
    render(
      <JudgesSection
        judges={[{ ...baseJudge, notificationQueued: true }]}
        invitations={[]}
        hackathonId="h1"
        hackathonStatus="draft"
        onAddJudge={noop}
        onRemoveJudge={noop}
        onCancelInvitation={noop}
        onRemindInvitation={noop}
      />
    )
    expect(screen.getByText("1 email is queued")).toBeDefined()
    expect(screen.getByText("Queued")).toBeDefined()
  })

  it("calls onRemoveJudge when remove action is clicked", () => {
    const onRemoveJudge = mock(() => {})
    render(
      <JudgesSection
        judges={[baseJudge]}
        invitations={[]}
        hackathonId="h1"
        onAddJudge={noop}
        onRemoveJudge={onRemoveJudge}
        onCancelInvitation={noop}
        onRemindInvitation={noop}
      />
    )
    fireEvent.click(screen.getByText("Open judge actions"))
    fireEvent.click(screen.getByText("Remove judge"))
    expect(onRemoveJudge).toHaveBeenCalledWith("p1")
  })

  it("calls onRemindInvitation when reminder action is clicked", () => {
    const onRemindInvitation = mock(() => {})
    render(
      <JudgesSection
        judges={[]}
        invitations={[pendingInvitation]}
        hackathonId="h1"
        onAddJudge={noop}
        onRemoveJudge={noop}
        onCancelInvitation={noop}
        onRemindInvitation={onRemindInvitation}
      />
    )
    fireEvent.click(screen.getByText("Open invite actions"))
    fireEvent.click(screen.getByText("Send reminder"))
    expect(onRemindInvitation).toHaveBeenCalledWith("inv-1")
  })

  it("calls onCancelInvitation when cancel action is clicked", () => {
    const onCancelInvitation = mock(() => {})
    render(
      <JudgesSection
        judges={[]}
        invitations={[pendingInvitation]}
        hackathonId="h1"
        onAddJudge={noop}
        onRemoveJudge={noop}
        onCancelInvitation={onCancelInvitation}
        onRemindInvitation={noop}
      />
    )
    fireEvent.click(screen.getByText("Open invite actions"))
    fireEvent.click(screen.getByText("Cancel invite"))
    expect(onCancelInvitation).toHaveBeenCalledWith("inv-1")
  })

  it("copies invite link to clipboard when copy action is clicked", async () => {
    const writeText = mock(() => Promise.resolve())
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      writable: true,
      configurable: true,
    })
    render(
      <JudgesSection
        judges={[]}
        invitations={[pendingInvitation]}
        hackathonId="h1"
        onAddJudge={noop}
        onRemoveJudge={noop}
        onCancelInvitation={noop}
        onRemindInvitation={noop}
      />
    )
    fireEvent.click(screen.getByText("Open invite actions"))
    fireEvent.click(screen.getByText("Copy invite link"))
    expect(writeText).toHaveBeenCalledTimes(1)
    const arg = (writeText.mock.calls[0]?.[0] ?? "") as string
    expect(arg.endsWith("/judge-invite/token-abc")).toBe(true)
  })

  it("hides invite link actions when token is missing", () => {
    render(
      <JudgesSection
        judges={[]}
        invitations={[{ ...pendingInvitation, token: null }]}
        hackathonId="h1"
        onAddJudge={noop}
        onRemoveJudge={noop}
        onCancelInvitation={noop}
        onRemindInvitation={noop}
      />
    )
    fireEvent.click(screen.getByText("Open invite actions"))
    expect(screen.queryByText("Copy invite link")).toBeNull()
    expect(screen.queryByText("Open invite link")).toBeNull()
    expect(screen.getByText("Send reminder")).toBeDefined()
  })

  it("calls onAddJudge when Add Judge button is clicked", () => {
    const onAddJudge = mock(() => {})
    render(
      <JudgesSection
        judges={[]}
        invitations={[]}
        hackathonId="h1"
        onAddJudge={onAddJudge}
        onRemoveJudge={noop}
        onCancelInvitation={noop}
        onRemindInvitation={noop}
      />
    )
    fireEvent.click(screen.getByText("Add Judge"))
    expect(onAddJudge).toHaveBeenCalledTimes(1)
  })
})
