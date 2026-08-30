import { beforeEach, describe, expect, it, mock } from "bun:test"

const mockAuthorized = mock(() => true)
const mockScheduled = mock(() => Promise.resolve({ processed: 2, sent: 2, skipped: 0, errors: 0 }))
const mockPostEvent = mock(() => Promise.resolve({ processed: 1, totalSent: 3, errors: 0 }))
const mockResults = mock(() => Promise.resolve({
  processed: 1,
  winnerEmailsSent: 2,
  resultEmailsSent: 4,
  errors: 0,
}))
const mockTeams = mock(() => Promise.resolve({ attempted: 2, sent: 2, failed: 0 }))
const mockJudges = mock(() => Promise.resolve({ attempted: 1, sent: 1, failed: 0 }))
const mockJudgeNotifications = mock(() => Promise.resolve({
  attempted: 1,
  sent: 1,
  failed: 0,
  exhausted: 0,
  skippedDueToLease: false,
}))
const mockAttendeeLifecycle = mock(() => Promise.resolve({
  attempted: 2,
  sent: 2,
  skipped: 0,
  failed: 0,
}))
const mockLifecycleWorkflows = mock(() => Promise.resolve({
  attempted: 0,
  started: 0,
  failed: 0,
  exhausted: 0,
  skippedDueToLease: false,
}))

mock.module("@/lib/auth/cron", () => ({ isAuthorizedCronRequest: mockAuthorized }))
mock.module("@/lib/services/smart-reminders", () => ({ processPendingReminders: mockScheduled }))
mock.module("@/lib/services/post-event-reminders", () => ({ processAllPendingReminders: mockPostEvent }))
mock.module("@/lib/services/results", () => ({ retryPendingResultEmails: mockResults }))
mock.module("@/lib/services/team-invitations", () => ({ retryPendingTeamInvitationEmails: mockTeams }))
mock.module("@/lib/services/judge-invitations", () => ({
  retryPendingJudgeInvitationEmails: mockJudges,
  retryPendingJudgeNotifications: mockJudgeNotifications,
}))
mock.module("@/lib/services/attendee-lifecycle-notifications", () => ({
  retryPendingAttendeeLifecycleEmails: mockAttendeeLifecycle,
}))
mock.module("@/lib/services/lifecycle-notification-retries", () => ({
  retryPendingLifecycleNotificationDispatches: mockLifecycleWorkflows,
}))

const { GET } = await import("@/app/api/cron/reminders/route")

describe("reminder cron delivery", () => {
  beforeEach(() => {
    mockAuthorized.mockClear()
    mockScheduled.mockClear()
    mockPostEvent.mockClear()
    mockResults.mockClear()
    mockTeams.mockClear()
    mockJudges.mockClear()
    mockJudgeNotifications.mockClear()
    mockAttendeeLifecycle.mockClear()
    mockLifecycleWorkflows.mockClear()
    mockAuthorized.mockReturnValue(true)
    mockScheduled.mockResolvedValue({ processed: 2, sent: 2, skipped: 0, errors: 0 })
    mockPostEvent.mockResolvedValue({ processed: 1, totalSent: 3, errors: 0 })
    mockResults.mockResolvedValue({ processed: 1, winnerEmailsSent: 2, resultEmailsSent: 4, errors: 0 })
    mockTeams.mockResolvedValue({ attempted: 2, sent: 2, failed: 0 })
    mockJudges.mockResolvedValue({ attempted: 1, sent: 1, failed: 0 })
    mockJudgeNotifications.mockResolvedValue({
      attempted: 1,
      sent: 1,
      failed: 0,
      exhausted: 0,
      skippedDueToLease: false,
    })
    mockAttendeeLifecycle.mockResolvedValue({ attempted: 2, sent: 2, skipped: 0, failed: 0 })
    mockLifecycleWorkflows.mockResolvedValue({
      attempted: 0,
      started: 0,
      failed: 0,
      exhausted: 0,
      skippedDueToLease: false,
    })
  })

  it("does not run delivery workers for an unauthorized request", async () => {
    mockAuthorized.mockReturnValue(false)
    const response = await GET(new Request("https://example.com/api/cron/reminders"))
    expect(response.status).toBe(401)
    expect(mockScheduled).not.toHaveBeenCalled()
    expect(mockPostEvent).not.toHaveBeenCalled()
    expect(mockResults).not.toHaveBeenCalled()
    expect(mockTeams).not.toHaveBeenCalled()
    expect(mockJudges).not.toHaveBeenCalled()
    expect(mockJudgeNotifications).not.toHaveBeenCalled()
    expect(mockAttendeeLifecycle).not.toHaveBeenCalled()
    expect(mockLifecycleWorkflows).not.toHaveBeenCalled()
  })

  it("runs every independent delivery worker exactly once", async () => {
    const response = await GET(new Request("https://example.com/api/cron/reminders"))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      scheduled: { processed: 2, sent: 2, skipped: 0, errors: 0 },
      postEvent: { processed: 1, totalSent: 3, errors: 0 },
      results: { processed: 1, winnerEmailsSent: 2, resultEmailsSent: 4, errors: 0 },
      teamInvitations: { attempted: 2, sent: 2, failed: 0 },
      judgeInvitations: { attempted: 1, sent: 1, failed: 0 },
      judgeNotifications: {
        attempted: 1,
        sent: 1,
        failed: 0,
        exhausted: 0,
        skippedDueToLease: false,
      },
      attendeeLifecycle: { attempted: 2, sent: 2, skipped: 0, failed: 0 },
      lifecycleWorkflows: {
        attempted: 0,
        started: 0,
        failed: 0,
        exhausted: 0,
        skippedDueToLease: false,
      },
    })
    for (const worker of [
      mockScheduled,
      mockPostEvent,
      mockResults,
      mockTeams,
      mockJudges,
      mockJudgeNotifications,
      mockAttendeeLifecycle,
      mockLifecycleWorkflows,
    ]) {
      expect(worker).toHaveBeenCalledTimes(1)
    }
    const budgets = [
      mockScheduled.mock.calls[0]?.[2],
      mockPostEvent.mock.calls[0]?.[1],
      mockResults.mock.calls[0]?.[1],
      mockTeams.mock.calls[0]?.[1],
      mockJudges.mock.calls[0]?.[1],
      mockJudgeNotifications.mock.calls[0]?.[1],
      mockAttendeeLifecycle.mock.calls[0]?.[1],
    ] as Array<{ remainingRecipients: number; deadlineAt: number }>
    expect(budgets.every((budget) => budget.remainingRecipients === 32)).toBe(true)
    expect(budgets.every((budget) => budget.deadlineAt > Date.now())).toBe(true)
    expect(new Set(budgets).size).toBe(7)
    expect(60 * budgets[0]!.remainingRecipients).toBe(1_920)
  })

  it("runs delivery workers sequentially to bound provider pressure", async () => {
    let activeWorkers = 0
    let maxActiveWorkers = 0
    const track = async <T>(value: T): Promise<T> => {
      activeWorkers++
      maxActiveWorkers = Math.max(maxActiveWorkers, activeWorkers)
      await Promise.resolve()
      activeWorkers--
      return value
    }
    mockScheduled.mockImplementation(() => track({ processed: 0, sent: 0, skipped: 0, errors: 0 }))
    mockPostEvent.mockImplementation(() => track({ processed: 0, totalSent: 0, errors: 0 }))
    mockResults.mockImplementation(() => track({ processed: 0, winnerEmailsSent: 0, resultEmailsSent: 0, errors: 0 }))
    mockTeams.mockImplementation(() => track({ attempted: 0, sent: 0, failed: 0 }))
    mockJudges.mockImplementation(() => track({ attempted: 0, sent: 0, failed: 0 }))
    mockJudgeNotifications.mockImplementation(() => track({
      attempted: 0,
      sent: 0,
      failed: 0,
      exhausted: 0,
      skippedDueToLease: false,
    }))
    mockAttendeeLifecycle.mockImplementation(() => track({
      attempted: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
    }))
    mockLifecycleWorkflows.mockImplementation(() => track({
      attempted: 0,
      started: 0,
      failed: 0,
      exhausted: 0,
      skippedDueToLease: false,
    }))

    const response = await GET(new Request("https://example.com/api/cron/reminders"))

    expect(response.status).toBe(200)
    expect(maxActiveWorkers).toBe(1)
  })

  it("returns 500 when any fulfilled worker reports delivery errors", async () => {
    mockResults.mockResolvedValue({
      processed: 1,
      winnerEmailsSent: 0,
      resultEmailsSent: 0,
      errors: 1,
    })
    const response = await GET(new Request("https://example.com/api/cron/reminders"))
    expect(response.status).toBe(500)
    expect((await response.json()).results).toEqual(expect.objectContaining({ errors: 1 }))
  })

  it("reports each rejected worker without starving the others", async () => {
    mockScheduled.mockRejectedValue(new Error("scheduled failed"))
    mockPostEvent.mockRejectedValue(new Error("post-event failed"))
    mockResults.mockRejectedValue(new Error("results failed"))
    mockTeams.mockRejectedValue(new Error("teams failed"))
    mockJudges.mockRejectedValue(new Error("judges failed"))
    mockJudgeNotifications.mockRejectedValue(new Error("judge notifications failed"))
    mockAttendeeLifecycle.mockRejectedValue(new Error("attendee lifecycle failed"))
    mockLifecycleWorkflows.mockRejectedValue(new Error("lifecycle workflow failed"))

    const response = await GET(new Request("https://example.com/api/cron/reminders"))
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      scheduled: { error: "Error: scheduled failed" },
      postEvent: { error: "Error: post-event failed" },
      results: { error: "Error: results failed" },
      teamInvitations: { error: "Error: teams failed" },
      judgeInvitations: { error: "Error: judges failed" },
      judgeNotifications: { error: "Error: judge notifications failed" },
      attendeeLifecycle: { error: "Error: attendee lifecycle failed" },
      lifecycleWorkflows: { error: "Error: lifecycle workflow failed" },
    })
    for (const worker of [
      mockScheduled,
      mockPostEvent,
      mockResults,
      mockTeams,
      mockJudges,
      mockJudgeNotifications,
      mockAttendeeLifecycle,
      mockLifecycleWorkflows,
    ]) {
      expect(worker).toHaveBeenCalledTimes(1)
    }
  })

  it("reports workflow-start retries that still failed", async () => {
    mockLifecycleWorkflows.mockResolvedValue({
      attempted: 1,
      started: 0,
      failed: 1,
      exhausted: 0,
      skippedDueToLease: false,
    })

    const response = await GET(new Request("https://example.com/api/cron/reminders"))

    expect(response.status).toBe(500)
    expect((await response.json()).lifecycleWorkflows).toEqual(
      expect.objectContaining({ attempted: 1, failed: 1 }),
    )
  })

  it("reports direct judge notifications that still failed", async () => {
    mockJudgeNotifications.mockResolvedValue({
      attempted: 1,
      sent: 0,
      failed: 1,
      exhausted: 1,
      skippedDueToLease: false,
    })

    const response = await GET(new Request("https://example.com/api/cron/reminders"))

    expect(response.status).toBe(500)
    expect((await response.json()).judgeNotifications).toEqual(
      expect.objectContaining({ attempted: 1, failed: 1, exhausted: 1 }),
    )
  })
})
