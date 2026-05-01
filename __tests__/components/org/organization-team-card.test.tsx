import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { cleanup, render, screen } from "@testing-library/react"
import { OrganizationTeamCard } from "@/components/org/organization-team-card"
import { resetComponentMocks, setRouter } from "../../lib/component-mocks"
import type { OrganizationInvitation, OrganizationMember } from "@/lib/services/organization-members"

const mockRefresh = mock(() => {})

const members: OrganizationMember[] = [
  {
    id: "orgmem_1",
    userId: "user_1",
    name: "Ada Lovelace",
    email: "ada@example.com",
    imageUrl: null,
    role: "org:admin",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "orgmem_2",
    userId: "user_2",
    name: "Grace Hopper",
    email: "grace@example.com",
    imageUrl: null,
    role: "org:member",
    createdAt: "2026-01-02T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  },
]

const invitations: OrganizationInvitation[] = [
  {
    id: "orginv_1",
    email: "new@example.com",
    role: "org:member",
    status: "pending",
    createdAt: "2026-01-03T00:00:00.000Z",
    updatedAt: "2026-01-03T00:00:00.000Z",
    expiresAt: null,
    url: null,
  },
]

describe("OrganizationTeamCard", () => {
  beforeEach(() => {
    resetComponentMocks()
    mockRefresh.mockClear()
    setRouter({ refresh: mockRefresh })
  })

  afterEach(() => {
    cleanup()
  })

  it("renders people and pending invites", () => {
    render(
      <OrganizationTeamCard
        initialMembers={members}
        initialInvitations={invitations}
        currentUserId="user_1"
        canManage
        hasOrganization
      />
    )

    expect(screen.getByText("Team")).toBeDefined()
    expect(screen.getByText("Ada Lovelace")).toBeDefined()
    expect(screen.getByText("Grace Hopper")).toBeDefined()
    expect(screen.getByText("new@example.com")).toBeDefined()
    expect(screen.getByText("You")).toBeDefined()
    expect(screen.getByText("Send invite")).toBeDefined()
  })

  it("hides invite actions from non-admins", () => {
    render(
      <OrganizationTeamCard
        initialMembers={members}
        initialInvitations={invitations}
        currentUserId="user_2"
        canManage={false}
        hasOrganization
      />
    )

    expect(screen.getByText("Ask an admin to invite people or remove them.")).toBeDefined()
    expect(screen.queryByText("Send invite")).toBeNull()
    expect(screen.queryByText("Cancel")).toBeNull()
  })

  it("shows an organization switch message without an active org", () => {
    render(
      <OrganizationTeamCard
        initialMembers={[]}
        initialInvitations={[]}
        currentUserId="user_1"
        canManage={false}
        hasOrganization={false}
      />
    )

    expect(screen.getByText("Switch to an organization to invite people.")).toBeDefined()
    expect(screen.getByText("No one is in this org yet.")).toBeDefined()
    expect(screen.getByText("No pending invites.")).toBeDefined()
  })
})
