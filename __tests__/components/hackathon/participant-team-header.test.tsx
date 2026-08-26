import { afterEach, describe, expect, it } from "bun:test"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useRef, useState } from "react"
import { ParticipantTeamHeader } from "@/components/hackathon/preview/participant-team-header"
import type { ParticipantTeamInfo } from "@/lib/services/hackathons"

const teamInfo = {
  team: {
    id: "team-1",
    name: "Jordan Lee's Team",
    status: "forming",
    inviteCode: "abc123",
    captainClerkUserId: "user-1",
    mode: null,
  },
  members: [
    {
      clerkUserId: "user-1",
      displayName: "Jordan Lee",
      email: "hai@example.com",
      role: "participant",
      isCaptain: true,
      registeredAt: "2026-05-01T00:00:00Z",
    },
  ],
  pendingInvitations: [],
  isCaptain: true,
  room: null,
} satisfies NonNullable<ParticipantTeamInfo>

function TeamHeaderHarness({ overrides }: { overrides?: Partial<NonNullable<ParticipantTeamInfo>> } = {}) {
  const merged = { ...teamInfo, ...overrides }
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(merged.team.name)
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <ParticipantTeamHeader
      teamInfo={merged}
      hackathonId="hackathon-1"
      maxTeamSize={4}
      canRenameTeam
      canInviteTeamMembers
      rename={{
        editing,
        value,
        setValue,
        saving: false,
        inputRef,
        startEditing: () => setEditing(true),
        save: () => setEditing(false),
        handleKeyDown: () => {},
      }}
    />
  )
}

afterEach(() => {
  cleanup()
})

describe("ParticipantTeamHeader", () => {
  it("shows a clear team rename action for captains", async () => {
    const user = userEvent.setup()

    render(<TeamHeaderHarness />)

    expect(screen.getByText("Your team")).toBeDefined()
    expect(screen.getByRole("button", { name: /rename team/i })).toBeDefined()

    await user.click(screen.getByRole("button", { name: /rename team/i }))

    const input = screen.getByDisplayValue("Jordan Lee's Team")
    expect(input.tagName).toBe("INPUT")
  })

  it("shows the assigned room when one is set", () => {
    render(<TeamHeaderHarness overrides={{ room: { id: "room-1", name: "Main Hall" } }} />)

    expect(screen.getByText("Your room")).toBeDefined()
    expect(screen.getByText("Main Hall")).toBeDefined()
  })

  it("hides the room line when no room is assigned", () => {
    render(<TeamHeaderHarness />)

    expect(screen.queryByText("Your room")).toBeNull()
  })
})
