import { beforeEach, describe, expect, it, mock } from "bun:test"

type QueryResult = { data: unknown; error: { message: string } | null }

function query(result: QueryResult) {
  const chain: Record<string, unknown> = {}
  for (const method of ["select", "eq", "in"]) chain[method] = mock(() => chain)
  chain.then = (resolve: (value: QueryResult) => unknown) => resolve(result)
  return chain
}

let fromImpl = () => query({ data: null, error: null })
const mockFrom = mock(() => fromImpl())
mock.module("@/lib/db/client", () => ({ supabase: () => ({ from: mockFrom }) }))

const mockGetUserList = mock(() => Promise.resolve({ data: [] as unknown[] }))
mock.module("@clerk/nextjs/server", () => ({
  clerkClient: () => Promise.resolve({ users: { getUserList: mockGetUserList } }),
}))

const mockSendEmail = mock(() => Promise.resolve({ id: "email_1" }) as Promise<{ id: string } | null>)
const mockBuildTransitionEmail = mock(() => Promise.resolve({
  subject: "Event update",
  html: "<p>Update</p>",
  text: "Update",
  tag: "Build_Together",
}))
const mockBuildChallengesEmail = mock(() => Promise.resolve({
  subject: "Challenges are ready",
  html: "<p>Challenges</p>",
  text: "Challenges",
  tag: "Build_Together",
}))

mock.module("@/lib/email/resend", () => ({ sendEmail: mockSendEmail }))
mock.module("@/lib/email/utils", () => ({
  getReplyToAddress: () => "help@hackathon.new",
  buildMailtoUnsubscribeHeaders: () => ({ "List-Unsubscribe": "<mailto:help@hackathon.new>" }),
}))
mock.module("@/lib/email/transition-notifications", () => ({
  buildTransitionEmail: mockBuildTransitionEmail,
}))
mock.module("@/lib/email/challenges-released", () => ({
  buildChallengesReleasedEmail: mockBuildChallengesEmail,
}))

const { fetchRecipientEmails, sendTransitionEmail } = await import(
  "@/lib/workflows/transition-notifications/steps"
)
const { sendChallengesReleasedEmail } = await import(
  "@/lib/workflows/challenges-released/steps"
)

describe("transition delivery steps", () => {
  beforeEach(() => {
    mockFrom.mockClear()
    mockGetUserList.mockClear()
    mockSendEmail.mockClear()
    mockBuildTransitionEmail.mockClear()
    mockBuildChallengesEmail.mockClear()
    fromImpl = () => query({ data: null, error: null })
    mockSendEmail.mockResolvedValue({ id: "email_1" })
  })

  it("deduplicates role recipients and normalizes Clerk addresses", async () => {
    const recipients = query({
      data: [
        { clerk_user_id: "user_1" },
        { clerk_user_id: "user_1" },
        { clerk_user_id: "user_2" },
      ],
      error: null,
    })
    fromImpl = () => recipients
    mockGetUserList.mockResolvedValue({ data: [
      { primaryEmailAddress: { emailAddress: " Avery@Example.com " }, emailAddresses: [] },
      { primaryEmailAddress: null, emailAddresses: [{ emailAddress: "river@example.com" }] },
      { primaryEmailAddress: { emailAddress: "avery@example.com" }, emailAddresses: [] },
    ] })

    await expect(fetchRecipientEmails("hack_1", ["participant", "judge"]))
      .resolves.toEqual(["avery@example.com", "river@example.com"])
    expect(recipients.in).toHaveBeenCalledWith("role", ["participant", "judge"])
    expect(mockGetUserList).toHaveBeenCalledWith({ userId: ["user_1", "user_2"], limit: 100 })
  })

  it("surfaces recipient database failures before Clerk lookup", async () => {
    fromImpl = () => query({ data: null, error: { message: "database unavailable" } })
    await expect(fetchRecipientEmails("hack_1", [])).rejects.toThrow(
      "Failed to load notification recipients: database unavailable"
    )
    expect(mockGetUserList).not.toHaveBeenCalled()
  })

  it("uses a challenge-aware tag and hashed transition idempotency key", async () => {
    const challenges = [{ id: "challenge_1", title: "Build for Good" }]
    await sendTransitionEmail({
      notificationId: "notification_1",
      to: "Avery@Example.com",
      event: "event_started",
      hackathonName: "Build Together",
      hackathonSlug: "build-together",
      challenges: challenges as never,
    })
    expect(mockBuildTransitionEmail).toHaveBeenCalledWith(
      "event_started",
      "Build Together",
      "build-together",
      expect.objectContaining({ challenges })
    )
    const delivery = mockSendEmail.mock.calls[0]?.[0] as Record<string, unknown>
    expect(delivery.tags).toContainEqual({
      name: "type",
      value: "transition_event_started_with_challenges",
    })
    expect(delivery.idempotencyKey).toMatch(/^transition\/notification_1\/[a-f0-9]{24}$/)
    expect(delivery.idempotencyKey).not.toContain("Avery@Example.com")
  })

  it("throws when a transition email is not accepted", async () => {
    mockSendEmail.mockResolvedValue(null)
    await expect(sendTransitionEmail({
      notificationId: "notification_1",
      to: "avery@example.com",
      event: "event_started",
      hackathonName: "Build Together",
      hackathonSlug: "build-together",
    })).rejects.toThrow("Failed to send transition email to avery@example.com")
  })

  it("uses a hashed challenge notification key and rejects failed sends", async () => {
    const input = {
      notificationId: "notification_2",
      to: "river@example.com",
      hackathonName: "Build Together",
      hackathonSlug: "build-together",
      challenges: [],
    }
    await sendChallengesReleasedEmail(input)
    const delivery = mockSendEmail.mock.calls[0]?.[0] as Record<string, unknown>
    expect(delivery.idempotencyKey).toMatch(/^challenges\/notification_2\/[a-f0-9]{24}$/)
    expect(delivery.idempotencyKey).not.toContain("river@example.com")

    mockSendEmail.mockResolvedValue(null)
    await expect(sendChallengesReleasedEmail(input)).rejects.toThrow(
      "Failed to send challenges-released email to river@example.com"
    )
  })
})
