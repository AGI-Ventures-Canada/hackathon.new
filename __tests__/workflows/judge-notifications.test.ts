import { describe, it, expect, beforeEach, mock } from "bun:test"
import type { JudgePendingNotification } from "@/lib/db/hackathon-types"
import {
  createChainableMock,
  mockFrom,
  resetSupabaseMocks,
  setMockFromImplementation,
} from "../lib/supabase-mock"

const mockSendJudgeAddedNotification = mock(() => Promise.resolve({ success: true }))

mock.module("@/lib/email/judge-invitations", () => ({
  sendJudgeAddedNotification: mockSendJudgeAddedNotification,
  sendJudgeInvitationEmail: mock(() => Promise.resolve({ success: true })),
}))

const { fetchPendingNotifications, sendJudgeNotification } = await import(
  "@/lib/workflows/judge-notifications/steps"
)
const { sendJudgeNotificationsWorkflow } = await import(
  "@/lib/workflows/judge-notifications/workflow"
)

const baseNotification: JudgePendingNotification = {
  id: "notif1",
  hackathon_id: "h1",
  participant_id: "participant1",
  email: "judge@example.com",
  added_by_name: "Organizer",
  sent_at: null,
  fail_count: 0,
  last_error: null,
  next_attempt_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
}

function claimedNotification(
  notification: JudgePendingNotification = baseNotification,
  overrides: {
    hackathonName?: string
    hackathonSlug?: string
    isTestEvent?: boolean
    participantRole?: string
  } = {},
) {
  return {
    ...notification,
    hackathons: {
      name: overrides.hackathonName ?? "Test Hackathon",
      slug: overrides.hackathonSlug ?? "test-hackathon",
      status: "active",
      starts_at: "2026-09-10T13:00:00.000Z",
      ends_at: "2026-09-11T21:00:00.000Z",
      is_test_event: overrides.isTestEvent ?? false,
    },
    participant: { role: overrides.participantRole ?? "judge" },
  }
}

function setQueryResults(
  results: Array<{ data: unknown; error: { message: string } | null }>,
) {
  const chains = results.map((result) => createChainableMock(result))
  let index = 0
  setMockFromImplementation(() => chains[index++] ?? createChainableMock({
    data: null,
    error: null,
  }))
  return chains
}

describe("fetchPendingNotifications", () => {
  beforeEach(() => resetSupabaseMocks())

  it("returns pending notifications for the hackathon", async () => {
    const notifications = [baseNotification, { ...baseNotification, id: "notif2" }]
    setMockFromImplementation(() => createChainableMock({ data: notifications, error: null }))

    const result = await fetchPendingNotifications("h1")

    expect(result).toHaveLength(2)
    expect(result[0].id).toBe("notif1")
  })

  it("returns empty array when data is empty", async () => {
    setMockFromImplementation(() => createChainableMock({ data: [], error: null }))

    const result = await fetchPendingNotifications("h1")

    expect(result).toHaveLength(0)
  })

  it("throws on DB error", async () => {
    setMockFromImplementation(() =>
      createChainableMock({ data: null, error: { message: "connection failed" } })
    )

    await expect(fetchPendingNotifications("h1")).rejects.toThrow(
      "Failed to fetch pending notifications: connection failed"
    )
  })
})

describe("sendJudgeNotification", () => {
  beforeEach(() => {
    resetSupabaseMocks()
    mockSendJudgeAddedNotification.mockClear()
    mockSendJudgeAddedNotification.mockResolvedValue({ success: true })
  })

  it("sends email and marks sent_at", async () => {
    const [, sentChain] = setQueryResults([
      { data: claimedNotification(), error: null },
      { data: { id: baseNotification.id }, error: null },
    ])

    const result = await sendJudgeNotification({
      notification: baseNotification,
      hackathonName: "Test Hackathon",
      hackathonSlug: "test-hackathon",
      hackathonStartsAt: "2026-09-10T13:00:00.000Z",
      hackathonEndsAt: "2026-09-11T21:00:00.000Z",
      hackathonTimezone: "UTC",
    })

    expect(result).toEqual({ sent: true })
    expect(mockSendJudgeAddedNotification).toHaveBeenCalledWith({
      to: "judge@example.com",
      deliveryId: "participant1",
      hackathonName: "Test Hackathon",
      hackathonSlug: "test-hackathon",
      addedByName: "Organizer",
      hackathonStartsAt: "2026-09-10T13:00:00.000Z",
      hackathonEndsAt: "2026-09-11T21:00:00.000Z",
      hackathonTimezone: "UTC",
    })
    expect(sentChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ sent_at: expect.any(String) })
    )
  })

  it("throws when email send fails", async () => {
    setQueryResults([{ data: claimedNotification(), error: null }])
    mockSendJudgeAddedNotification.mockResolvedValueOnce({ success: false })

    await expect(
      sendJudgeNotification({
        notification: baseNotification,
        hackathonName: "Test Hackathon",
        hackathonSlug: "test-hackathon",
      })
    ).rejects.toThrow("Failed to send judge notification notif1")
  })

  it("throws when sent_at DB update fails", async () => {
    setQueryResults([
      { data: claimedNotification(), error: null },
      { data: null, error: { message: "update failed" } },
    ])

    await expect(
      sendJudgeNotification({
        notification: baseNotification,
        hackathonName: "Test Hackathon",
        hackathonSlug: "test-hackathon",
      })
    ).rejects.toThrow("Failed to mark notification notif1 as sent: update failed")
  })

  it("does not mark the row sent when email fails", async () => {
    const [claimChain] = setQueryResults([
      { data: claimedNotification(), error: null },
    ])
    mockSendJudgeAddedNotification.mockResolvedValueOnce({ success: false })

    await expect(
      sendJudgeNotification({
        notification: baseNotification,
        hackathonName: "Test Hackathon",
        hackathonSlug: "test-hackathon",
      })
    ).rejects.toThrow()

    expect(claimChain.update).toHaveBeenCalledTimes(1)
    expect(mockFrom).toHaveBeenCalledTimes(1)
  })

  it("skips a stale workflow snapshot after the judge is removed", async () => {
    setQueryResults([{ data: null, error: null }])

    const result = await sendJudgeNotification({
      notification: baseNotification,
      hackathonName: "Old event name",
      hackathonSlug: "old-event-slug",
    })

    expect(result).toEqual({ sent: false })
    expect(mockSendJudgeAddedNotification).not.toHaveBeenCalled()
  })

  it("releases a claimed row without sending when the event becomes a test event", async () => {
    const [, releaseChain] = setQueryResults([
      {
        data: claimedNotification(baseNotification, { isTestEvent: true }),
        error: null,
      },
      { data: null, error: null },
    ])

    const result = await sendJudgeNotification({
      notification: baseNotification,
      hackathonName: "Test Hackathon",
      hackathonSlug: "test-hackathon",
    })

    expect(result).toEqual({ sent: false })
    expect(mockSendJudgeAddedNotification).not.toHaveBeenCalled()
    expect(releaseChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ next_attempt_at: null }),
    )
  })
})

describe("sendJudgeNotificationsWorkflow", () => {
  beforeEach(() => {
    resetSupabaseMocks()
    mockSendJudgeAddedNotification.mockClear()
    mockSendJudgeAddedNotification.mockResolvedValue({ success: true })
  })

  it("returns sent: 0 when no pending notifications", async () => {
    setQueryResults([{ data: [], error: null }])

    const result = await sendJudgeNotificationsWorkflow({
      hackathonId: "h1",
      hackathonName: "Test",
      hackathonSlug: "test",
    })

    expect(result.sent).toBe(0)
    expect(mockSendJudgeAddedNotification).not.toHaveBeenCalled()
  })

  it("sends each notification sequentially and counts successes", async () => {
    const notifications = [
      { ...baseNotification, id: "n1", email: "a@example.com" },
      { ...baseNotification, id: "n2", email: "b@example.com" },
      { ...baseNotification, id: "n3", email: "c@example.com" },
    ]
    setQueryResults([
      { data: notifications, error: null },
      ...notifications.flatMap((notification) => [
        { data: claimedNotification(notification), error: null },
        { data: { id: notification.id }, error: null },
      ]),
    ])

    const result = await sendJudgeNotificationsWorkflow({
      hackathonId: "h1",
      hackathonName: "Test",
      hackathonSlug: "test",
    })

    expect(result.sent).toBe(3)
    expect(mockSendJudgeAddedNotification).toHaveBeenCalledTimes(3)
  })

  it("sends remaining notifications after a failure, then throws for workflow retry", async () => {
    const notifications = [
      { ...baseNotification, id: "n1" },
      { ...baseNotification, id: "n2" },
      { ...baseNotification, id: "n3" },
    ]
    setQueryResults([
      { data: notifications, error: null },
      { data: claimedNotification(notifications[0]), error: null },
      { data: { id: notifications[0].id }, error: null },
      { data: claimedNotification(notifications[1]), error: null },
      { data: claimedNotification(notifications[2]), error: null },
      { data: { id: notifications[2].id }, error: null },
    ])
    mockSendJudgeAddedNotification
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false })
      .mockResolvedValueOnce({ success: true })

    const error = mock(() => {})
    const originalError = console.error
    console.error = error
    try {
      await expect(
        sendJudgeNotificationsWorkflow({
          hackathonId: "h1",
          hackathonName: "Test",
          hackathonSlug: "test",
        })
      ).rejects.toThrow("Only processed 2/3 judge notifications")
      expect(mockSendJudgeAddedNotification).toHaveBeenCalledTimes(3)
      expect(String(error.mock.calls[0]?.[0])).toBe(
        "Failed to send judge notification n2:",
      )
      expect(error.mock.calls.flat().join(" ")).not.toContain("@example.com")
    } finally {
      console.error = originalError
    }
  })

  it("uses the current event name and slug for each notification", async () => {
    setQueryResults([
      { data: [baseNotification], error: null },
      {
        data: claimedNotification(baseNotification, {
          hackathonName: "My Hackathon",
          hackathonSlug: "my-hackathon",
        }),
        error: null,
      },
      { data: { id: baseNotification.id }, error: null },
    ])

    await sendJudgeNotificationsWorkflow({
      hackathonId: "h1",
      hackathonName: "My Hackathon",
      hackathonSlug: "my-hackathon",
    })

    expect(mockSendJudgeAddedNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        hackathonName: "My Hackathon",
        hackathonSlug: "my-hackathon",
      })
    )
  })
})
