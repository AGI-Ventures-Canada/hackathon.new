import { describe, it, expect, mock, beforeEach } from "bun:test"
import { render, screen, cleanup } from "@testing-library/react"

mock.module("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {} }),
}))

const { TeamInviteDialog } = await import(
  "@/components/hackathon/team-invite-dialog"
)

describe("TeamInviteDialog", () => {
  beforeEach(() => {
    cleanup()
  })

  it("renders the invite button", () => {
    render(
      <TeamInviteDialog
        teamId="team-1"
        hackathonId="h1"
        teamName="Test Team"
        maxTeamSize={5}
      />
    )
    expect(screen.getByText("Invite Member")).toBeDefined()
  })
})
