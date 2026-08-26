import { beforeEach, describe, expect, it, mock } from "bun:test"

type QueryResult = { data: unknown; error: { message: string } | null }
type Query = Record<string, ReturnType<typeof mock> | unknown>

let sendImpl: (input: Record<string, unknown>) => Promise<{ id: string } | null> = () =>
  Promise.resolve({ id: "email_1" })
const mockSendEmail = mock((input: Record<string, unknown>) => sendImpl(input))
mock.module("@/lib/email/resend", () => ({ sendEmail: mockSendEmail }))

const mockGetUserList = mock(() => Promise.resolve({ data: [] as unknown[] }))
mock.module("@clerk/nextjs/server", () => ({
  clerkClient: () => Promise.resolve({ users: { getUserList: mockGetUserList } }),
}))

function query(result: QueryResult): Query {
  const chain: Query = {}
  for (const method of ["select", "eq", "lte", "in", "is", "update"]) {
    chain[method] = mock(() => chain)
  }
  chain.single = mock(() => chain)
  chain.then = (resolve: (value: QueryResult) => unknown) => resolve(result)
  return chain
}

let fromImpl: (table: string) => Query = () => query({ data: null, error: null })
const mockFrom = mock((table: string) => fromImpl(table))
mock.module("@/lib/db/client", () => ({ supabase: () => ({ from: mockFrom }) }))

const { sendFeedbackSurveyEmails } = await import("@/lib/email/feedback-survey")
const { sendPreEventReminderEmail } = await import("@/lib/email/pre-event-reminders")
const { sendReminderEmailsWithResult } = await import("@/lib/email/post-event-reminders")

describe("lifecycle email delivery", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = "https://preview.hackathon.new"
    mockSendEmail.mockClear()
    mockGetUserList.mockClear()
    mockFrom.mockClear()
    sendImpl = () => Promise.resolve({ id: "email_1" })
    fromImpl = () => query({ data: null, error: null })
  })

  it("normalizes and checkpoints a successful feedback survey delivery", async () => {
    let hackathonCall = 0
    let savedQuery: Query | null = null
    fromImpl = (table) => {
      if (table === "hackathons" && ++hackathonCall === 1) {
        return query({
          data: {
            name: "Build Together",
            slug: "build-together",
            status: "completed",
            results_published_at: "2026-08-20T00:00:00Z",
            feedback_survey_sent_at: null,
          },
          error: null,
        })
      }
      if (table === "hackathons") {
        savedQuery = query({ data: null, error: null })
        return savedQuery
      }
      return query({
        data: [{ clerk_user_id: "user_1" }, { clerk_user_id: "user_1" }],
        error: null,
      })
    }
    mockGetUserList.mockResolvedValue({
      data: [{
        firstName: "Avery",
        lastName: "Lee",
        primaryEmailAddress: { emailAddress: "avery@example.com" },
      }],
    })

    await expect(sendFeedbackSurveyEmails("hack_1", "survey.example.com/form"))
      .resolves.toEqual({ sent: 1, failed: 0 })
    const delivery = mockSendEmail.mock.calls[0]?.[0]
    expect(delivery?.html).toContain("https://survey.example.com/form")
    expect(delivery?.idempotencyKey).toMatch(
      /^feedback-survey\/hack_1\/[a-f0-9]{24}\/[a-f0-9]{24}$/
    )
    expect(delivery?.idempotencyKey).not.toContain("avery@example.com")
    expect(savedQuery?.update).toHaveBeenCalledWith(expect.objectContaining({
      feedback_survey_sent_at: expect.any(String),
      feedback_survey_url: "https://survey.example.com/form",
    }))
  })

  it("rejects a private survey before querying recipients", async () => {
    await expect(sendFeedbackSurveyEmails("hack_1", "http://127.0.0.1/private"))
      .rejects.toThrow("Use a public HTTPS survey link")
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it("uses durable recipient keys and counts pre-event provider failures", async () => {
    fromImpl = () => query({
      data: [{ clerk_user_id: "user_1" }, { clerk_user_id: "user_2" }],
      error: null,
    })
    mockGetUserList.mockResolvedValue({ data: [
      { id: "user_1", firstName: "Avery", primaryEmailAddress: { emailAddress: "a@example.com" } },
      { id: "user_2", firstName: null, primaryEmailAddress: { emailAddress: "b@example.com" } },
    ] })
    let attempt = 0
    sendImpl = () => Promise.resolve(++attempt === 1 ? { id: "email_1" } : null)

    await expect(sendPreEventReminderEmail({
      hackathonId: "hack_1",
      reminderType: "submission_due",
      hackathonName: "Build Together",
      hackathonSlug: "build-together",
      deadlineDate: "2026-09-01T16:00:00Z",
      urgency: "high",
      deliveryId: "reminder_1",
    })).resolves.toEqual({ sent: 1, failed: 1 })
    expect(mockSendEmail.mock.calls[0]?.[0].idempotencyKey)
      .toBe("pre-event-reminder/reminder_1/user_1")
    expect(mockSendEmail.mock.calls[1]?.[0].idempotencyKey)
      .toBe("pre-event-reminder/reminder_1/user_2")
  })

  it("deduplicates post-event recipients and isolates partial failures", async () => {
    fromImpl = (table) => table === "hackathons"
      ? query({ data: { name: "Build Together", slug: "build-together" }, error: null })
      : query({
          data: [
            { clerk_user_id: "user_1" },
            { clerk_user_id: "user_1" },
            { clerk_user_id: "user_2" },
          ],
          error: null,
        })
    mockGetUserList.mockResolvedValue({ data: [
      { firstName: "Avery", primaryEmailAddress: { emailAddress: "a@example.com" } },
      { username: "River", primaryEmailAddress: { emailAddress: "b@example.com" } },
    ] })
    let attempt = 0
    sendImpl = () => Promise.resolve(++attempt === 1 ? { id: "email_1" } : null)

    await expect(sendReminderEmailsWithResult(
      "hack_1",
      "feedback_followup",
      "all_participants",
      (name) => ({
        hackathonName: "Build Together",
        participantName: name,
        ctaUrl: "https://survey.example.com",
        subject: "Feedback",
        heading: "Quick survey",
        body: "Your feedback helps.",
        ctaLabel: "Share Feedback",
      }),
      "post-event/delivery_1",
    )).resolves.toEqual({ eligible: 2, sent: 1, failed: 1 })
    expect(mockGetUserList).toHaveBeenCalledWith({ userId: ["user_1", "user_2"], limit: 100 })
    expect(mockSendEmail.mock.calls[0]?.[0].idempotencyKey)
      .toMatch(/^post-event\/delivery_1\/[a-f0-9]{24}$/)
  })

  it("rejects an unknown post-event audience before database access", async () => {
    await expect(sendReminderEmailsWithResult(
      "hack_1",
      "unknown",
      "public",
      () => ({
        hackathonName: "Hack",
        participantName: "Avery",
        ctaUrl: "https://example.com",
        subject: "Update",
        heading: "Update",
        body: "News",
        ctaLabel: "Open",
      }),
    )).rejects.toThrow("Unknown post-event recipient group: public")
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it("resolves team and solo recipients for winner reminder audiences", async () => {
    const content = (name: string) => ({
      hackathonName: "Build Together",
      participantName: name,
      ctaUrl: "https://preview.hackathon.new/e/build-together",
      subject: "Your prize is waiting",
      heading: "Your prize is waiting",
      body: "Open your result.",
      ctaLabel: "View Results",
    })
    mockGetUserList.mockResolvedValue({ data: [
      { firstName: "Team", primaryEmailAddress: { emailAddress: "team@example.com" } },
      { firstName: "Solo", primaryEmailAddress: { emailAddress: "solo@example.com" } },
    ] })

    let participantCall = 0
    fromImpl = (table) => {
      if (table === "hackathons") {
        return query({ data: { name: "Build Together", slug: "build-together" }, error: null })
      }
      if (table === "hackathon_results") {
        return query({ data: [
          { submission: { team_id: "team_1", participant_id: null } },
          { submission: { team_id: null, participant_id: "participant_2" } },
        ], error: null })
      }
      participantCall++
      return participantCall === 1
        ? query({ data: [{ clerk_user_id: "user_team" }], error: null })
        : query({ data: [{ clerk_user_id: "user_solo" }], error: null })
    }

    await expect(sendReminderEmailsWithResult(
      "hack_1",
      "prize_claim",
      "winners",
      content,
    )).resolves.toEqual({ eligible: 2, sent: 2, failed: 0 })

    mockSendEmail.mockClear()
    participantCall = 0
    fromImpl = (table) => {
      if (table === "hackathons") {
        return query({ data: { name: "Build Together", slug: "build-together" }, error: null })
      }
      if (table === "prize_fulfillments") {
        return query({ data: [
          { prize_assignment: { submission: { team_id: "team_1", participant_id: null } } },
          { prize_assignment: { submission: { team_id: null, participant_id: "participant_2" } } },
        ], error: null })
      }
      participantCall++
      return participantCall === 1
        ? query({ data: [{ clerk_user_id: "user_team" }], error: null })
        : query({ data: [{ clerk_user_id: "user_solo" }], error: null })
    }

    await expect(sendReminderEmailsWithResult(
      "hack_1",
      "prize_followup",
      "unclaimed_winners",
      content,
    )).resolves.toEqual({ eligible: 2, sent: 2, failed: 0 })
    expect(mockSendEmail).toHaveBeenCalledTimes(2)
  })

  it("targets organizers without exposing participant audiences", async () => {
    fromImpl = (table) => table === "hackathons"
      ? query({ data: { name: "Build Together", slug: "build-together" }, error: null })
      : query({ data: [{ clerk_user_id: "organizer_1" }], error: null })
    mockGetUserList.mockResolvedValue({
      data: [{ firstName: "Organizer", primaryEmailAddress: { emailAddress: "host@example.com" } }],
    })

    await expect(sendReminderEmailsWithResult(
      "hack_1",
      "fulfillment",
      "organizers",
      (name) => ({
        hackathonName: "Build Together",
        participantName: name,
        ctaUrl: "https://preview.hackathon.new/e/build-together/manage",
        subject: "Prizes need delivery",
        heading: "Prizes need delivery",
        body: "Open fulfillment.",
        ctaLabel: "Manage Fulfillment",
      }),
    )).resolves.toEqual({ eligible: 1, sent: 1, failed: 0 })
    expect(mockSendEmail.mock.calls[0]?.[0].to).toBe("host@example.com")
  })
})
