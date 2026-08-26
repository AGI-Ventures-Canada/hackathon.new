import { describe, it, expect, beforeEach, mock } from "bun:test"
import type { JudgePendingNotification } from "@/lib/db/hackathon-types"
import {
  createChainableMock,
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
  created_at: "2026-01-01T00:00:00Z",
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
    const chain = createChainableMock({ data: null, error: null })
    setMockFromImplementation(() => chain)

    await sendJudgeNotification({
      notification: baseNotification,
      hackathonName: "Test Hackathon",
      hackathonSlug: "test-hackathon",
    })

    expect(mockSendJudgeAddedNotification).toHaveBeenCalledWith({
      to: "judge@example.com",
      deliveryId: "notif1",
      hackathonName: "Test Hackathon",
      hackathonSlug: "test-hackathon",
      addedByName: "Organizer",
    })
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ sent_at: expect.any(String) })
    )
  })

  it("throws when email send fails", async () => {
    setMockFromImplementation(() => createChainableMock({ data: null, error: null }))
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
    setMockFromImplementation(() =>
      createChainableMock({ data: null, error: { message: "update failed" } })
    )

    await expect(
      sendJudgeNotification({
        notification: baseNotification,
        hackathonName: "Test Hackathon",
        hackathonSlug: "test-hackathon",
      })
    ).rejects.toThrow("Failed to mark notification notif1 as sent: update failed")
  })

  it("does not call update when email fails", async () => {
    const chain = createChainableMock({ data: null, error: null })
    setMockFromImplementation(() => chain)
    mockSendJudgeAddedNotification.mockResolvedValueOnce({ success: false })

    await expect(
      sendJudgeNotification({
        notification: baseNotification,
        hackathonName: "Test Hackathon",
        hackathonSlug: "test-hackathon",
      })
    ).rejects.toThrow()

    expect(chain.update).not.toHaveBeenCalled()
  })
})

describe("sendJudgeNotificationsWorkflow", () => {
  beforeEach(() => {
    resetSupabaseMocks()
    mockSendJudgeAddedNotification.mockClear()
    mockSendJudgeAddedNotification.mockResolvedValue({ success: true })
  })

  it("returns sent: 0 when no pending notifications", async () => {
    setMockFromImplementation(() => createChainableMock({ data: [], error: null }))

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
    setMockFromImplementation(() => createChainableMock({ data: notifications, error: null }))

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
    setMockFromImplementation(() => createChainableMock({ data: notifications, error: null }))
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
      ).rejects.toThrow("Only sent 2/3 judge notifications")
      expect(mockSendJudgeAddedNotification).toHaveBeenCalledTimes(3)
      expect(String(error.mock.calls[0]?.[0])).toBe(
        "Failed to send judge notification n2:",
      )
      expect(error.mock.calls.flat().join(" ")).not.toContain("@example.com")
    } finally {
      console.error = originalError
    }
  })

  it("passes hackathonName and hackathonSlug to each notification", async () => {
    setMockFromImplementation(() =>
      createChainableMock({ data: [baseNotification], error: null })
    )

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
