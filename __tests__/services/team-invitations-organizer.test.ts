import { describe, it, expect, beforeEach, mock } from "bun:test"
import {
  createChainableMock,
  resetSupabaseMocks,
  resetClerkMocks,
  mockClerkClient,
  setMockFromImplementation,
} from "../lib/supabase-mock"

const mockSendTeamInvitationEmail = mock(() => Promise.resolve({ success: true }))
mock.module("@/lib/email/team-invitations", () => ({
  sendTeamInvitationEmail: mockSendTeamInvitationEmail,
}))

const mockScheduleReminders = mock(() => Promise.resolve(0))
const mockCancelRemindersForEntity = mock(() => Promise.resolve(0))
mock.module("@/lib/services/smart-reminders", () => ({
  scheduleReminders: mockScheduleReminders,
  cancelRemindersForEntity: mockCancelRemindersForEntity,
  cancelUpcomingReminder: mock(() => Promise.resolve(0)),
  computeReminderSchedule: mock(() => []),
  processPendingReminders: mock(() =>
    Promise.resolve({ processed: 0, sent: 0, skipped: 0, errors: 0 })
  ),
}))

const {
  cancelTeamInvitationAsOrganizer,
  remindTeamInvitationAsOrganizer,
  replaceTeamCaptainInvitation,
} = await import("@/lib/services/team-invitations")

type SupaResult = { data: unknown; error: { message: string } | null; count?: number | null }

function tableImpl(handlers: Record<string, SupaResult | SupaResult[]>) {
  const counters: Record<string, number> = {}
  return (table: string) => {
    const entry = handlers[table]
    if (Array.isArray(entry)) {
      const i = counters[table] ?? 0
      counters[table] = i + 1
      const value = entry[Math.min(i, entry.length - 1)]
      return createChainableMock(value as never)
    }
    return createChainableMock((entry ?? { data: null, error: null }) as never)
  }
}

const VALID_UUID = "11111111-1111-1111-1111-111111111111"

describe("cancelTeamInvitationAsOrganizer", () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  it("returns not_found when invitation is missing", async () => {
    setMockFromImplementation(
      tableImpl({
        team_invitations: { data: null, error: null },
      })
    )

    const result = await cancelTeamInvitationAsOrganizer(VALID_UUID, "h_1")
    expect(result).toEqual({ success: false, error: "Invitation not found" })
  })

  it("rejects when invitation belongs to a different hackathon", async () => {
    setMockFromImplementation(
      tableImpl({
        team_invitations: { data: { id: VALID_UUID, hackathon_id: "other_h", status: "pending" }, error: null },
      })
    )

    const result = await cancelTeamInvitationAsOrganizer(VALID_UUID, "h_1")
    expect(result.success).toBe(false)
    expect(result.error).toBe("Invitation not found")
  })

  it("rejects when invitation is no longer pending", async () => {
    setMockFromImplementation(
      tableImpl({
        team_invitations: { data: { id: VALID_UUID, hackathon_id: "h_1", status: "accepted" }, error: null },
      })
    )

    const result = await cancelTeamInvitationAsOrganizer(VALID_UUID, "h_1")
    expect(result.success).toBe(false)
    expect(result.error).toBe("Invitation is no longer pending")
  })

  it("cancels a valid pending invite", async () => {
    setMockFromImplementation(
      tableImpl({
        team_invitations: [
          { data: { id: VALID_UUID, hackathon_id: "h_1", status: "pending" }, error: null },
          { data: null, error: null },
        ],
      })
    )

    const result = await cancelTeamInvitationAsOrganizer(VALID_UUID, "h_1")
    expect(result).toEqual({ success: true, error: undefined })
  })
})

describe("remindTeamInvitationAsOrganizer", () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  it("rejects non-UUID inputs", async () => {
    const result = await remindTeamInvitationAsOrganizer("not-a-uuid", "also-bad", "h_1")
    expect(result).toEqual({ success: false, error: "Invitation not found", code: "not_found" })
  })

  it("returns not_found when invitation row missing", async () => {
    setMockFromImplementation(
      tableImpl({
        team_invitations: { data: null, error: { message: "no rows" } },
      })
    )

    const result = await remindTeamInvitationAsOrganizer(VALID_UUID, VALID_UUID, "h_1")
    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe("not_found")
  })

  it("rejects non-pending invitation", async () => {
    setMockFromImplementation(
      tableImpl({
        team_invitations: { data: { id: VALID_UUID, status: "accepted", expires_at: new Date(Date.now() + 1000).toISOString() }, error: null },
      })
    )

    const result = await remindTeamInvitationAsOrganizer(VALID_UUID, VALID_UUID, "h_1")
    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe("not_pending")
  })

  it("rejects expired invitation", async () => {
    setMockFromImplementation(
      tableImpl({
        team_invitations: { data: { id: VALID_UUID, status: "pending", expires_at: new Date(Date.now() - 1000).toISOString() }, error: null },
      })
    )

    const result = await remindTeamInvitationAsOrganizer(VALID_UUID, VALID_UUID, "h_1")
    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe("expired")
  })

  it("updates the reminder timestamp on success", async () => {
    const fresh = { id: VALID_UUID, status: "pending", expires_at: new Date(Date.now() + 60_000).toISOString() }
    setMockFromImplementation(
      tableImpl({
        team_invitations: [
          { data: fresh, error: null },
          { data: { ...fresh, reminded_at: "now" }, error: null },
        ],
      })
    )

    const result = await remindTeamInvitationAsOrganizer(VALID_UUID, VALID_UUID, "h_1")
    expect(result.success).toBe(true)
  })
})

describe("replaceTeamCaptainInvitation", () => {
  beforeEach(() => {
    resetSupabaseMocks()
    resetClerkMocks()
    mockSendTeamInvitationEmail.mockClear()
    mockScheduleReminders.mockClear()
    mockCancelRemindersForEntity.mockClear()
  })

  it("returns team_not_found when team is missing", async () => {
    setMockFromImplementation(
      tableImpl({
        teams: { data: null, error: { message: "no rows" } },
      })
    )

    const result = await replaceTeamCaptainInvitation("team_1", "h_1", "new@example.com", "organizer_1")
    expect(result).toEqual({ success: false, error: "Team not found", code: "team_not_found" })
  })

  it("rejects when team already has a captain", async () => {
    setMockFromImplementation(
      tableImpl({
        teams: { data: { id: "team_1", name: "T", status: "forming", captain_clerk_user_id: "user_existing", pending_captain_email: null }, error: null },
      })
    )

    const result = await replaceTeamCaptainInvitation("team_1", "h_1", "new@example.com", "organizer_1")
    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe("captain_set")
  })

  it("rejects when hackathon has ended", async () => {
    setMockFromImplementation(
      tableImpl({
        teams: { data: { id: "team_1", name: "T", status: "forming", captain_clerk_user_id: null, pending_captain_email: "old@example.com" }, error: null },
        hackathons: { data: { name: "H", slug: "h", status: "completed", starts_at: null, ends_at: null }, error: null },
      })
    )

    const result = await replaceTeamCaptainInvitation("team_1", "h_1", "new@example.com", "organizer_1")
    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe("hackathon_ended")
  })

  it("cancels old invite, inserts new one, and queues (no send) on draft", async () => {
    mockClerkClient.mockResolvedValueOnce({
      users: {
        getUser: () => Promise.resolve({ id: "organizer_1", firstName: "Org", lastName: "A", primaryEmailAddress: { emailAddress: "org@example.com" } }),
      },
    } as never)

    setMockFromImplementation(
      tableImpl({
        teams: [
          { data: { id: "team_1", name: "T", status: "forming", captain_clerk_user_id: null, pending_captain_email: "old@example.com" }, error: null },
          { data: null, error: null },
        ],
        hackathons: { data: { name: "H", slug: "h", status: "draft", starts_at: null, ends_at: null }, error: null },
        team_invitations: [
          { data: [{ id: "old_inv_1" }], error: null },
          { data: { id: "new_inv_1" }, error: null },
        ],
      })
    )

    const result = await replaceTeamCaptainInvitation("team_1", "h_1", "NEW@Example.com", "organizer_1")
    expect(result).toEqual({ success: true, invitationId: "new_inv_1", queued: true })
    expect(mockSendTeamInvitationEmail).not.toHaveBeenCalled()
    expect(mockScheduleReminders).not.toHaveBeenCalled()
  })

  it("sends email and schedules reminders when hackathon is live, after cancelling old reminders", async () => {
    mockClerkClient.mockResolvedValueOnce({
      users: {
        getUser: () => Promise.resolve({ id: "organizer_1", firstName: "Org", lastName: "A", primaryEmailAddress: { emailAddress: "org@example.com" } }),
      },
    } as never)

    setMockFromImplementation(
      tableImpl({
        teams: [
          { data: { id: "team_1", name: "T", status: "forming", captain_clerk_user_id: null, pending_captain_email: "old@example.com" }, error: null },
          { data: null, error: null },
        ],
        hackathons: { data: { name: "H", slug: "h", status: "active", starts_at: null, ends_at: null }, error: null },
        team_invitations: [
          { data: [{ id: "old_inv_1" }], error: null },
          { data: { id: "new_inv_1" }, error: null },
        ],
      })
    )

    const result = await replaceTeamCaptainInvitation("team_1", "h_1", "new@example.com", "organizer_1")
    expect(result.success).toBe(true)
    if (result.success) expect(result.queued).toBe(false)

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(mockSendTeamInvitationEmail).toHaveBeenCalledTimes(1)
    expect(mockScheduleReminders).toHaveBeenCalledTimes(1)
    expect(mockCancelRemindersForEntity).toHaveBeenCalledWith("team_invitation", "old_inv_1")
  })
})
