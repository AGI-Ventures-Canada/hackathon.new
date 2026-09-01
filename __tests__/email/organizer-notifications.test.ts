import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test"

let sendEmailImpl: (input: unknown) => Promise<{ id: string } | null> = () =>
  Promise.resolve({ id: "email_123" })
const mockSendEmail = mock((input: unknown) => sendEmailImpl(input))

mock.module("@/lib/email/resend", () => ({
  sendEmail: mockSendEmail,
}))

const mockGetUser = mock(() =>
  Promise.resolve({ primaryEmailAddress: { emailAddress: "org@test.com" } })
)
const mockGetUserList = mock(() =>
  Promise.resolve({
    data: [{ primaryEmailAddress: { emailAddress: "org@test.com" } }],
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

const mockGetOrganizerTaskBoard = mock(() => Promise.resolve({
  items: [
    { label: "Invite judges" },
    { label: "Assign every project" },
  ],
}))
mock.module("@/lib/services/organizer-action-items", () => ({
  getOrganizerTaskBoard: mockGetOrganizerTaskBoard,
}))

const { sendOrganizerClaimNotification, sendOrganizerReadinessReminder } = await import(
  "@/lib/email/organizer-notifications"
)

const savedAppUrl = process.env.NEXT_PUBLIC_APP_URL

describe("sendOrganizerClaimNotification", () => {
  beforeEach(() => {
    mockSendEmail.mockClear()
    mockGetUser.mockClear()
    mockGetUserList.mockClear()
    mockGetOrgMembers.mockClear()
    mockFrom.mockClear()
    mockSelect.mockClear()
    mockEq.mockClear()
    mockSingle.mockClear()
    mockGetOrganizerTaskBoard.mockClear()
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

  it("sends email to org members when hackathon has org tenant", async () => {
    let callCount = 0
    mockSingle.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve({ data: { tenant_id: "tenant_1" }, error: null })
      }
      return Promise.resolve({
        data: { clerk_org_id: "org_123", clerk_user_id: null },
        error: null,
      })
    })

    const sent = await sendOrganizerClaimNotification({
      prizeName: "Best Demo",
      hackathonName: "Test Hackathon",
      hackathonSlug: "test-hackathon",
      winnerName: "Alice",
      hackathonId: "hack_1",
      fulfillmentId: "fulfillment_1",
    })

    expect(sent).toBe(1)
    expect(mockSendEmail).toHaveBeenCalledTimes(1)

    const call = mockSendEmail.mock.calls[0]![0] as Record<string, unknown>
    expect(call.to).toBe("org@test.com")
    expect(call.subject).toContain("Prize claimed")
    expect(call.subject).toContain("Best Demo")
    expect((call.html as string)).toContain("Alice")
    expect((call.html as string)).toContain("Best Demo")
    expect((call.html as string)).toContain("Test Hackathon")
    expect((call.text as string)).toContain("Alice")
    expect((call.html as string)).not.toContain("($")
    expect((call.html as string)).not.toContain("View Fulfillment Tracker")
    expect(call.idempotencyKey).toMatch(
      /^organizer-claim\/fulfillment_1\/[a-f0-9]{24}$/
    )
    expect(call.idempotencyKey).not.toContain("org@test.com")
  })

  it("sends email to personal tenant user", async () => {
    let callCount = 0
    mockSingle.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve({ data: { tenant_id: "tenant_1" }, error: null })
      }
      return Promise.resolve({
        data: { clerk_org_id: null, clerk_user_id: "user_solo" },
        error: null,
      })
    })

    const sent = await sendOrganizerClaimNotification({
      prizeName: "Top Prize",
      hackathonName: "Solo Hack",
      hackathonSlug: "solo-hack",
      winnerName: "Bob",
      hackathonId: "hack_2",
    })

    expect(sent).toBe(1)
    expect(mockGetUser).toHaveBeenCalled()
    expect(mockGetOrgMembers).not.toHaveBeenCalled()
  })

  it("returns 0 when hackathon not found", async () => {
    mockSingle.mockImplementation(() =>
      Promise.resolve({ data: null, error: null })
    )

    const sent = await sendOrganizerClaimNotification({
      prizeName: "Prize",
      hackathonName: "Hack",
      hackathonSlug: "hack",
      winnerName: "Nobody",
      hackathonId: "missing",
    })

    expect(sent).toBe(0)
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it("returns 0 when sendEmail fails", async () => {
    sendEmailImpl = () => Promise.resolve(null)

    let callCount = 0
    mockSingle.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve({ data: { tenant_id: "tenant_1" }, error: null })
      }
      return Promise.resolve({
        data: { clerk_org_id: "org_123", clerk_user_id: null },
        error: null,
      })
    })

    const sent = await sendOrganizerClaimNotification({
      prizeName: "Prize",
      hackathonName: "Hack",
      hackathonSlug: "hack",
      winnerName: "Alice",
      hackathonId: "hack_1",
    })

    expect(sent).toBe(0)
  })

  it("includes prizeValue in rendered email when provided", async () => {
    let callCount = 0
    mockSingle.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve({ data: { tenant_id: "tenant_1" }, error: null })
      }
      return Promise.resolve({
        data: { clerk_org_id: "org_123", clerk_user_id: null },
        error: null,
      })
    })

    await sendOrganizerClaimNotification({
      prizeName: "Best AI",
      hackathonName: "AI Hack",
      hackathonSlug: "ai-hack",
      winnerName: "Carol",
      hackathonId: "hack_3",
      prizeValue: "5,000",
    })

    expect(mockSendEmail).toHaveBeenCalledTimes(1)
    const call = mockSendEmail.mock.calls[0]![0] as Record<string, unknown>
    expect((call.html as string)).toContain("$5,000")
  })

  it("includes fulfillment URL in rendered email", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://test.hackathon.new"

    let callCount = 0
    mockSingle.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve({ data: { tenant_id: "tenant_1" }, error: null })
      }
      return Promise.resolve({
        data: { clerk_org_id: "org_123", clerk_user_id: null },
        error: null,
      })
    })

    await sendOrganizerClaimNotification({
      prizeName: "Best AI",
      hackathonName: "AI Hack",
      hackathonSlug: "ai-hack-2026",
      winnerName: "Carol",
      hackathonId: "hack_3",
    })

    expect(mockSendEmail).toHaveBeenCalledTimes(1)
    const call = mockSendEmail.mock.calls[0]![0] as Record<string, unknown>
    expect((call.html as string)).toContain("https://test.hackathon.new/e/ai-hack-2026/manage")
  })

  it("uses correct Resend tags", async () => {
    let callCount = 0
    mockSingle.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve({ data: { tenant_id: "tenant_1" }, error: null })
      }
      return Promise.resolve({
        data: { clerk_org_id: "org_123", clerk_user_id: null },
        error: null,
      })
    })

    await sendOrganizerClaimNotification({
      prizeName: "Prize",
      hackathonName: "My Hack!@#",
      hackathonSlug: "my-hack",
      winnerName: "Alice",
      hackathonId: "hack_1",
    })

    const call = mockSendEmail.mock.calls[0]![0] as Record<string, unknown>
    const tags = call.tags as Array<{ name: string; value: string }>
    expect(tags).toContainEqual({
      name: "type",
      value: "organizer_claim_notification",
    })
    expect(tags.find((t) => t.name === "hackathon")?.value).toBe("My_Hack")
  })

  it("sends organizers a live task digest before judging", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://test.hackathon.new"
    let callCount = 0
    mockSingle.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve({ data: { tenant_id: "tenant_1" }, error: null })
      }
      return Promise.resolve({
        data: { clerk_org_id: "org_123", clerk_user_id: null },
        error: null,
      })
    })

    const result = await sendOrganizerReadinessReminder({
      hackathonId: "hack_1",
      hackathonName: "Build Day",
      hackathonSlug: "build-day",
      deadlineDate: "2026-09-11T16:00:00.000Z",
      reminderType: "organizer_judging_readiness",
      urgency: "high",
      deliveryId: "reminder_1",
    })

    expect(result).toEqual({ sent: 1, failed: 0 })
    expect(mockGetOrganizerTaskBoard).toHaveBeenCalledWith("hack_1", {
      state: "pending",
      limit: 5,
    })
    const call = mockSendEmail.mock.calls[0]![0] as Record<string, unknown>
    expect(call.subject).toContain("Action needed: Judging starts soon")
    expect(call.html).toContain("Invite judges")
    expect(call.html).toContain("Assign every project")
    expect(call.html).toContain("/e/build-day/manage?tab=action-items")
    expect(call.idempotencyKey).toMatch(
      /^organizer-readiness\/reminder_1\/[a-f0-9]{24}$/,
    )
  })
})
