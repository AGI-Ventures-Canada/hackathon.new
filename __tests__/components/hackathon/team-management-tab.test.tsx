import { describe, it, expect, mock, beforeEach } from "bun:test"
import { render, screen, cleanup } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

mock.module("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {} }),
}))

mock.module("@clerk/nextjs", () => ({
  useUser: () => ({ user: { id: "user-1" } }),
}))

const { TeamManagementTab } = await import(
  "@/components/hackathon/team-management-tab"
)

const baseTeamInfo = {
  team: {
    id: "team-1",
    name: "Test Team",
    status: "forming" as const,
    inviteCode: "abc123",
    captainClerkUserId: "user-1",
  },
  members: [
    {
      clerkUserId: "user-1",
      displayName: "Alice",
      email: "alice@test.com",
      role: "participant" as const,
      isCaptain: true,
      registeredAt: "2026-04-01T00:00:00Z",
    },
  ],
  pendingInvitations: [],
  isCaptain: true,
}

describe("TeamManagementTab", () => {
  beforeEach(() => {
    cleanup()
  })

  it("shows captain info block when user is captain", () => {
    render(
      <TeamManagementTab
        teamInfo={baseTeamInfo}
        hackathonId="h1"
        maxTeamSize={5}
      />
    )
    expect(
      screen.getByText(/you're the team captain/i)
    ).toBeDefined()
  })

  it("does not show captain info block when user is not captain", () => {
    render(
      <TeamManagementTab
        teamInfo={{ ...baseTeamInfo, isCaptain: false }}
        hackathonId="h1"
        maxTeamSize={5}
      />
    )
    expect(
      screen.queryByText(/you're the team captain/i)
    ).toBeNull()
  })

  it("shows team name in card title", () => {
    render(
      <TeamManagementTab
        teamInfo={{ ...baseTeamInfo, isCaptain: false }}
        hackathonId="h1"
        maxTeamSize={5}
      />
    )
    expect(screen.getByText("Test Team")).toBeDefined()
  })

  it("switches to input on click when captain", async () => {
    const user = userEvent.setup()
    render(
      <TeamManagementTab
        teamInfo={baseTeamInfo}
        hackathonId="h1"
        maxTeamSize={5}
      />
    )
    const nameButton = screen.getByRole("button", { name: "Test Team" })
    await user.click(nameButton)
    const input = screen.getByDisplayValue("Test Team")
    expect(input).toBeDefined()
    expect(input.tagName).toBe("INPUT")
  })

  it("does not switch to input when not captain", async () => {
    const user = userEvent.setup()
    render(
      <TeamManagementTab
        teamInfo={{ ...baseTeamInfo, isCaptain: false }}
        hackathonId="h1"
        maxTeamSize={5}
      />
    )
    await user.click(screen.getByText("Test Team"))
    expect(screen.queryByDisplayValue("Test Team")).toBeNull()
  })
})
