import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test"

let sendEmailImpl: (input: unknown) => Promise<{ id: string } | null> = () =>
  Promise.resolve({ id: "email_123" })
const mockSendEmail = mock((input: unknown) => sendEmailImpl(input))

mock.module("@/lib/email/resend", () => ({
  sendEmail: mockSendEmail,
}))

const mockGetUser = mock(() =>
  Promise.resolve({ primaryEmailAddress: { emailAddress: "sponsor@test.com" } })
)
const mockGetUserList = mock(() =>
  Promise.resolve({
    data: [{ primaryEmailAddress: { emailAddress: "sponsor@test.com" } }],
  })
)
const mockGetOrgMembers = mock(() =>
  Promise.resolve({
    data: [{ publicUserData: { userId: "user_1" } }],
  })
)

mock.module("@clerk/nextjs/server", () => ({
  clerkClient: () =>
    Promise.resolve({
      users: { getUser: mockGetUser, getUserList: mockGetUserList },
      organizations: { getOrganizationMembershipList: mockGetOrgMembers },
    }),
}))

const mockSingle = mock((): Promise<{ data: unknown; error: unknown }> =>
  Promise.resolve({ data: null, error: null })
)
const mockEq = mock(() => ({ single: mockSingle }))
const mockSelect = mock(() => ({ eq: mockEq }))
const mockFrom = mock(() => ({ select: mockSelect }))

mock.module("@/lib/db/client", () => ({
  supabase: () => ({ from: mockFrom }),
}))

const { sendSponsorClaimNotification } = await import(
  "@/lib/email/sponsor-notifications"
)

const savedAppUrl = process.env.NEXT_PUBLIC_APP_URL

describe("sendSponsorClaimNotification", () => {
  beforeEach(() => {
    mockSendEmail.mockClear()
    mockGetUser.mockClear()
    mockGetUserList.mockClear()
    mockGetOrgMembers.mockClear()
    mockFrom.mockClear()
    mockSelect.mockClear()
    mockEq.mockClear()
    mockSingle.mockClear()
    sendEmailImpl = () => Promise.resolve({ id: "email_123" })
    delete process.env.NEXT_PUBLIC_APP_URL
  })

  afterEach(() => {
    if (savedAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL
    } else {
      process.env.NEXT_PUBLIC_APP_URL = savedAppUrl
    }
  })

  it("sends email to org members when sponsor is an organization", async () => {
    mockSingle.mockImplementation(() =>
      Promise.resolve({
        data: { clerk_org_id: "org_sponsor", clerk_user_id: null },
        error: null,
      })
    )

    const sent = await sendSponsorClaimNotification({
      prizeName: "Grand Prize",
      hackathonName: "Test Hackathon",
      winnerName: "Alice",
      sponsorTenantId: "tenant_1",
    })

    expect(sent).toBe(1)
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
    expect(mockGetOrgMembers).toHaveBeenCalled()

    const call = mockSendEmail.mock.calls[0]![0] as Record<string, unknown>
    expect(call.to).toBe("sponsor@test.com")
    expect(call.subject).toContain("Grand Prize")
    expect((call.html as string)).toContain("Alice")
    expect((call.html as string)).not.toContain("($")
    expect((call.html as string)).not.toContain("View Event")
  })

  it("sends email to individual user when sponsor has no org", async () => {
    mockSingle.mockImplementation(() =>
      Promise.resolve({
        data: { clerk_org_id: null, clerk_user_id: "user_solo" },
        error: null,
      })
    )

    const sent = await sendSponsorClaimNotification({
      prizeName: "Solo Prize",
      hackathonName: "Solo Hack",
      winnerName: "Bob",
      sponsorTenantId: "tenant_2",
    })

    expect(sent).toBe(1)
    expect(mockGetUser).toHaveBeenCalled()
    expect(mockGetOrgMembers).not.toHaveBeenCalled()
  })

  it("returns 0 when tenant not found", async () => {
    mockSingle.mockImplementation(() =>
      Promise.resolve({ data: null, error: null })
    )

    const sent = await sendSponsorClaimNotification({
      prizeName: "Prize",
      hackathonName: "Hack",
      winnerName: "Nobody",
      sponsorTenantId: "missing",
    })

    expect(sent).toBe(0)
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it("returns 0 when sendEmail fails", async () => {
    sendEmailImpl = () => Promise.resolve(null)

    mockSingle.mockImplementation(() =>
      Promise.resolve({
        data: { clerk_org_id: "org_sponsor", clerk_user_id: null },
        error: null,
      })
    )

    const sent = await sendSponsorClaimNotification({
      prizeName: "Prize",
      hackathonName: "Hack",
      winnerName: "Alice",
      sponsorTenantId: "tenant_1",
    })

    expect(sent).toBe(0)
  })

  it("includes prizeValue in rendered email when provided", async () => {
    mockSingle.mockImplementation(() =>
      Promise.resolve({
        data: { clerk_org_id: null, clerk_user_id: "user_solo" },
        error: null,
      })
    )

    await sendSponsorClaimNotification({
      prizeName: "Best AI",
      hackathonName: "AI Hack",
      winnerName: "Carol",
      sponsorTenantId: "tenant_3",
      prizeValue: "2,000",
    })

    expect(mockSendEmail).toHaveBeenCalledTimes(1)
    const call = mockSendEmail.mock.calls[0]![0] as Record<string, unknown>
    expect((call.html as string)).toContain("$2,000")
  })

  it("includes eventUrl in rendered email when hackathonSlug provided", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://test.getoatmeal.com"

    mockSingle.mockImplementation(() =>
      Promise.resolve({
        data: { clerk_org_id: null, clerk_user_id: "user_solo" },
        error: null,
      })
    )

    await sendSponsorClaimNotification({
      prizeName: "Best AI",
      hackathonName: "AI Hack",
      winnerName: "Carol",
      sponsorTenantId: "tenant_3",
      hackathonSlug: "ai-hack-2026",
    })

    expect(mockSendEmail).toHaveBeenCalledTimes(1)
    const call = mockSendEmail.mock.calls[0]![0] as Record<string, unknown>
    expect((call.html as string)).toContain("https://test.getoatmeal.com/e/ai-hack-2026")
  })
})
