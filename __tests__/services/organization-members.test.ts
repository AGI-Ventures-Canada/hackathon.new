import { beforeEach, describe, expect, it, mock } from "bun:test"
import { mockClerkClient, resetClerkMocks } from "../lib/supabase-mock"

const {
  inviteOrganizationMember,
  isOrganizationMemberRole,
  listOrganizationPeople,
  normalizeOrganizationInviteEmail,
  removeOrganizationMember,
  revokeOrganizationMemberInvitation,
} = await import("@/lib/services/organization-members")

function setMockOrganizations(organizations: Record<string, unknown>) {
  mockClerkClient.mockImplementation(() =>
    Promise.resolve({
      organizations: {
        getOrganization: mock(() => Promise.resolve({ name: "Test Org" })),
        ...organizations,
      },
    } as unknown as Awaited<ReturnType<typeof mockClerkClient>>)
  )
}

describe("Organization members service", () => {
  beforeEach(() => {
    resetClerkMocks()
  })

  it("normalizes invite emails", () => {
    expect(normalizeOrganizationInviteEmail(" Teammate@Example.COM ")).toBe("teammate@example.com")
    expect(normalizeOrganizationInviteEmail("not-an-email")).toBeNull()
  })

  it("validates supported roles", () => {
    expect(isOrganizationMemberRole("org:member")).toBe(true)
    expect(isOrganizationMemberRole("org:admin")).toBe(true)
    expect(isOrganizationMemberRole("org:owner")).toBe(false)
  })

  it("lists members and pending invites", async () => {
    const getOrganizationMembershipList = mock(() =>
      Promise.resolve({
        totalCount: 1,
        data: [
          {
            id: "orgmem_1",
            role: "org:admin",
            createdAt: 1767225600000,
            updatedAt: 1767225600000,
            publicUserData: {
              firstName: "Ada",
              lastName: "Lovelace",
              identifier: "ada@example.com",
              imageUrl: "https://example.com/ada.png",
              userId: "user_ada",
            },
          },
        ],
      })
    )
    const getOrganizationInvitationList = mock(() =>
      Promise.resolve({
        totalCount: 1,
        data: [
          {
            id: "orginv_1",
            emailAddress: "new@example.com",
            organizationId: "org_1",
            role: "org:member",
            status: "pending",
            createdAt: 1767312000000,
            updatedAt: 1767312000000,
            expiresAt: 1769904000000,
            url: "https://clerk.example/invite",
          },
        ],
      })
    )

    setMockOrganizations({
      getOrganizationMembershipList,
      getOrganizationInvitationList,
    })

    const result = await listOrganizationPeople("org_1")

    expect(getOrganizationMembershipList).toHaveBeenCalledWith({
      organizationId: "org_1",
      limit: 100,
      orderBy: "+email_address",
    })
    expect(getOrganizationInvitationList).toHaveBeenCalledWith({
      organizationId: "org_1",
      limit: 100,
      status: ["pending"],
    })
    expect(result.members[0]).toMatchObject({
      userId: "user_ada",
      name: "Ada Lovelace",
      email: "ada@example.com",
      role: "org:admin",
    })
    expect(result.invitations[0]).toMatchObject({
      id: "orginv_1",
      email: "new@example.com",
      role: "org:member",
      status: "pending",
      url: "https://clerk.example/invite",
    })
  })

  it("warns when the Clerk people list is truncated", async () => {
    const warnSpy = mock(() => {})
    const originalWarn = console.warn
    console.warn = warnSpy
    const getOrganizationMembershipList = mock(() =>
      Promise.resolve({
        totalCount: 101,
        data: [],
      })
    )
    const getOrganizationInvitationList = mock(() =>
      Promise.resolve({
        totalCount: 0,
        data: [],
      })
    )

    setMockOrganizations({
      getOrganizationMembershipList,
      getOrganizationInvitationList,
    })

    try {
      await listOrganizationPeople("org_1")
      expect(warnSpy).toHaveBeenCalledWith("Organization people list was truncated.", {
        organizationId: "org_1",
        memberCount: 101,
        invitationCount: 0,
        visibleMemberCount: 0,
        visibleInvitationCount: 0,
      })
    } finally {
      console.warn = originalWarn
    }
  })

  it("creates an organization invite", async () => {
    const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example"
    const createOrganizationInvitation = mock(() =>
      Promise.resolve({
        id: "orginv_2",
        emailAddress: "new@example.com",
        organizationId: "org_1",
        role: "org:member",
        status: "pending",
        createdAt: 1767312000000,
        updatedAt: 1767312000000,
        expiresAt: null,
        url: "https://clerk.example/invite",
      })
    )

    setMockOrganizations({ createOrganizationInvitation })

    try {
      const invitation = await inviteOrganizationMember({
        organizationId: "org_1",
        inviterUserId: "user_admin",
        email: "new@example.com",
        role: "org:member",
      })

      expect(createOrganizationInvitation).toHaveBeenCalledWith({
        organizationId: "org_1",
        inviterUserId: "user_admin",
        emailAddress: "new@example.com",
        role: "org:member",
        redirectUrl: "https://app.example/home",
      })
      expect(invitation.email).toBe("new@example.com")
    } finally {
      if (previousAppUrl === undefined) {
        delete process.env.NEXT_PUBLIC_APP_URL
      } else {
        process.env.NEXT_PUBLIC_APP_URL = previousAppUrl
      }
    }
  })

  it("revokes a pending invite", async () => {
    const revokeOrganizationInvitation = mock(() =>
      Promise.resolve({
        id: "orginv_1",
        emailAddress: "new@example.com",
        organizationId: "org_1",
        role: "org:member",
        status: "revoked",
        createdAt: 1767312000000,
        updatedAt: 1767312000000,
        expiresAt: null,
        url: null,
      })
    )

    setMockOrganizations({ revokeOrganizationInvitation })

    const invitation = await revokeOrganizationMemberInvitation({
      organizationId: "org_1",
      invitationId: "orginv_1",
      requestingUserId: "user_admin",
    })

    expect(revokeOrganizationInvitation).toHaveBeenCalledWith({
      organizationId: "org_1",
      invitationId: "orginv_1",
      requestingUserId: "user_admin",
    })
    expect(invitation.status).toBe("revoked")
  })

  it("removes an organization member", async () => {
    const deleteOrganizationMembership = mock(() => Promise.resolve({}))

    setMockOrganizations({ deleteOrganizationMembership })

    await removeOrganizationMember({
      organizationId: "org_1",
      userId: "user_removed",
    })

    expect(deleteOrganizationMembership).toHaveBeenCalledWith({
      organizationId: "org_1",
      userId: "user_removed",
    })
  })
})
