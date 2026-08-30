import { beforeEach, describe, expect, it, mock } from "bun:test"
import {
  createChainableMock,
  mockClerkClient,
  resetClerkMocks,
  resetSupabaseMocks,
  setMockFromImplementation,
} from "../lib/supabase-mock"

const mockRegistrationEmail = mock(() => Promise.resolve({ success: true }))
const mockApprovedEmail = mock(() => Promise.resolve({ success: true }))
const mockDeniedEmail = mock(() => Promise.resolve({ success: true }))

mock.module("@/lib/email/registration-confirmation", () => ({
  sendRegistrationConfirmationEmail: mockRegistrationEmail,
}))
mock.module("@/lib/email/team-review", () => ({
  sendTeamApprovedEmail: mockApprovedEmail,
  sendTeamDeniedEmail: mockDeniedEmail,
}))
mock.module("@/lib/services/delivery-lease", () => ({
  withDeliveryLease: mock(async (_key: string, work: () => Promise<unknown>) => ({
    acquired: true as const,
    value: await work(),
  })),
}))

const {
  deliverAttendeeLifecycleEmailsForUser,
  retryPendingAttendeeLifecycleEmails,
} = await import(
  "@/lib/services/attendee-lifecycle-notifications"
)

const activeHackathon = {
  name: "AI Hackathon",
  slug: "ai-hackathon",
  status: "active",
  starts_at: "2026-08-01T00:00:00Z",
  ends_at: "2099-08-03T00:00:00Z",
  is_test_event: false,
}

function notification(
  type: "registration_confirmed" | "team_approved" | "team_denied",
) {
  return {
    id: `notification_${type}`,
    hackathon_id: "hackathon_1",
    team_id: type === "registration_confirmed" ? null : "team_1",
    clerk_user_id: "user_1",
    notification_type: type,
    fail_count: 0,
    hackathons: activeHackathon,
    teams: type === "registration_confirmed" ? null : { name: "Team One" },
  }
}

describe("attendee lifecycle notification delivery", () => {
  beforeEach(() => {
    resetSupabaseMocks()
    resetClerkMocks()
    mockRegistrationEmail.mockClear()
    mockApprovedEmail.mockClear()
    mockDeniedEmail.mockClear()
    mockRegistrationEmail.mockResolvedValue({ success: true })
    mockApprovedEmail.mockResolvedValue({ success: true })
    mockDeniedEmail.mockResolvedValue({ success: true })
    mockClerkClient.mockResolvedValue({
      organizations: {
        getOrganization: mock(() => Promise.resolve({ name: "Test Org" })),
      },
      users: {
        getUser: mock(() => Promise.resolve({
          primaryEmailAddress: { emailAddress: "Person@Example.com" },
          emailAddresses: [],
        })),
      },
    } as never)
  })

  it("delivers registration and team decisions through their matching templates", async () => {
    setMockFromImplementation((table) =>
      table === "attendee_lifecycle_notifications"
        ? createChainableMock({
            data: [
              notification("registration_confirmed"),
              notification("team_approved"),
              notification("team_denied"),
            ],
            error: null,
          })
        : table === "hackathon_participants"
          ? createChainableMock({ data: { id: "participant_1" }, error: null })
        : createChainableMock({ data: null, error: null })
    )

    const result = await retryPendingAttendeeLifecycleEmails(20)

    expect(result).toEqual({ attempted: 3, sent: 3, skipped: 0, failed: 0 })
    expect(mockRegistrationEmail).toHaveBeenCalledTimes(1)
    expect(mockApprovedEmail).toHaveBeenCalledTimes(1)
    expect(mockDeniedEmail).toHaveBeenCalledTimes(1)
    expect(mockRegistrationEmail.mock.calls[0][0].to).toBe("person@example.com")
  })

  it("still delivers a delayed notice during judging and cancels it after completion", async () => {
    setMockFromImplementation((table) =>
      table === "attendee_lifecycle_notifications"
        ? createChainableMock({
            data: [
              {
                ...notification("registration_confirmed"),
                id: "draft_notice",
                hackathons: { ...activeHackathon, status: "judging" },
              },
              {
                ...notification("team_approved"),
                id: "judging_notice",
                hackathons: { ...activeHackathon, status: "completed" },
              },
            ],
            error: null,
          })
        : table === "hackathon_participants"
          ? createChainableMock({ data: { id: "participant_1" }, error: null })
        : createChainableMock({ data: null, error: null })
    )

    const result = await retryPendingAttendeeLifecycleEmails(20)

    expect(result).toEqual({ attempted: 1, sent: 1, skipped: 1, failed: 0 })
    expect(mockRegistrationEmail).toHaveBeenCalledTimes(1)
    expect(mockApprovedEmail).not.toHaveBeenCalled()
  })

  it("records provider failures for cron retry", async () => {
    mockRegistrationEmail.mockResolvedValue({ success: false })
    setMockFromImplementation((table) =>
      table === "attendee_lifecycle_notifications"
        ? createChainableMock({
            data: [notification("registration_confirmed")],
            error: null,
          })
        : table === "hackathon_participants"
          ? createChainableMock({ data: { id: "participant_1" }, error: null })
        : createChainableMock({ data: null, error: null })
    )

    const result = await retryPendingAttendeeLifecycleEmails(20)

    expect(result).toEqual({ attempted: 1, sent: 0, skipped: 0, failed: 1 })
  })

  it("keeps test-event notices queued without sending them", async () => {
    setMockFromImplementation((table) =>
      table === "attendee_lifecycle_notifications"
        ? createChainableMock({
            data: [{
              ...notification("registration_confirmed"),
              hackathons: { ...activeHackathon, is_test_event: true },
            }],
            error: null,
          })
        : createChainableMock({ data: null, error: null })
    )

    const result = await retryPendingAttendeeLifecycleEmails(20)

    expect(result).toEqual({ attempted: 0, sent: 0, skipped: 1, failed: 0 })
    expect(mockRegistrationEmail).not.toHaveBeenCalled()
  })

  it("cancels a stale registration notice after the attendee leaves", async () => {
    setMockFromImplementation((table) =>
      table === "attendee_lifecycle_notifications"
        ? createChainableMock({
            data: [notification("registration_confirmed")],
            error: null,
          })
        : createChainableMock({ data: null, error: null })
    )

    const result = await retryPendingAttendeeLifecycleEmails(20)

    expect(result).toEqual({ attempted: 0, sent: 0, skipped: 1, failed: 0 })
    expect(mockRegistrationEmail).not.toHaveBeenCalled()
  })

  it("limits immediate team review delivery to the queued decision", async () => {
    const query = createChainableMock({ data: [], error: null })
    setMockFromImplementation(() => query)

    await deliverAttendeeLifecycleEmailsForUser(
      "hackathon_1",
      "user_1",
      "team_approved",
    )

    expect(query.eq).toHaveBeenCalledWith("notification_type", "team_approved")
  })
})
