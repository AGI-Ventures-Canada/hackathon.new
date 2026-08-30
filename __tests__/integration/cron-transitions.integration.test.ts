import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test"

const mockProcessAutoTransitions = mock(() => Promise.resolve({
  processed: 0,
  transitions: [],
  errors: [],
}))
const mockProcessScheduledChallengeReleases = mock(() => Promise.resolve({
  processed: 0,
  releases: [],
  errors: [],
}))
const mockProcessDueSchedules = mock(() => Promise.resolve({
  found: 0,
  started: 0,
  failed: 0,
}))
const mockReconcilePendingTeams = mock(() => Promise.resolve({
  events: 0,
  denied: 0,
  failed: 0,
  errors: [],
}))
const mockReconcilePendingJudgeWork = mock(() => Promise.resolve({
  events: 0,
  failed: 0,
  errors: [],
}))

mock.module("@/lib/services/lifecycle", () => ({
  processAutoTransitions: mockProcessAutoTransitions,
  reconcilePendingJudgeWorkForClosedHackathons: mockReconcilePendingJudgeWork,
  reconcilePendingTeamsForClosedHackathons: mockReconcilePendingTeams,
}))
mock.module("@/lib/services/challenges", () => ({
  processScheduledChallengeReleases: mockProcessScheduledChallengeReleases,
}))
mock.module("@/lib/services/schedules", () => ({
  processDueSchedules: mockProcessDueSchedules,
}))

const { GET } = await import("@/app/api/cron/transitions/route")
const originalCronSecret = process.env.CRON_SECRET

function cronRequest() {
  return new Request("https://example.com/api/cron/transitions", {
    headers: { authorization: "Bearer cron-secret" },
  })
}

describe("transition cron route", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "cron-secret"
    mockProcessAutoTransitions.mockClear()
    mockProcessAutoTransitions.mockResolvedValue({
      processed: 0,
      transitions: [],
      errors: [],
    })
    mockProcessScheduledChallengeReleases.mockClear()
    mockProcessScheduledChallengeReleases.mockResolvedValue({
      processed: 0,
      releases: [],
      errors: [],
    })
    mockProcessDueSchedules.mockClear()
    mockProcessDueSchedules.mockResolvedValue({
      found: 0,
      started: 0,
      failed: 0,
    })
    mockReconcilePendingTeams.mockClear()
    mockReconcilePendingTeams.mockResolvedValue({
      events: 0,
      denied: 0,
      failed: 0,
      errors: [],
    })
    mockReconcilePendingJudgeWork.mockClear()
    mockReconcilePendingJudgeWork.mockResolvedValue({
      events: 0,
      failed: 0,
      errors: [],
    })
  })

  afterAll(() => {
    if (originalCronSecret === undefined) {
      delete process.env.CRON_SECRET
    } else {
      process.env.CRON_SECRET = originalCronSecret
    }
  })

  it("returns success only when every processor succeeds", async () => {
    const response = await GET(cronRequest())

    expect(response.status).toBe(200)
    expect(mockProcessAutoTransitions).toHaveBeenCalledTimes(1)
    expect(mockProcessScheduledChallengeReleases).toHaveBeenCalledTimes(1)
    expect(mockProcessDueSchedules).toHaveBeenCalledTimes(1)
    expect(mockReconcilePendingTeams).toHaveBeenCalledTimes(1)
    expect(mockReconcilePendingJudgeWork).toHaveBeenCalledTimes(1)
  })

  it("reports a failed schedule occurrence as a failed cron run", async () => {
    mockProcessDueSchedules.mockResolvedValue({
      found: 1,
      started: 0,
      failed: 1,
    })

    const response = await GET(cronRequest())

    expect(response.status).toBe(500)
    expect(await response.json()).toMatchObject({
      schedules: { found: 1, started: 0, failed: 1 },
    })
  })

  it("keeps running independent processors when one rejects", async () => {
    mockProcessAutoTransitions.mockRejectedValue(new Error("database unavailable"))

    const response = await GET(cronRequest())

    expect(response.status).toBe(500)
    expect(mockProcessScheduledChallengeReleases).toHaveBeenCalledTimes(1)
    expect(mockProcessDueSchedules).toHaveBeenCalledTimes(1)
    expect(mockReconcilePendingTeams).toHaveBeenCalledTimes(1)
  })

  it("reports pending-team closeout failures for another cron retry", async () => {
    mockReconcilePendingTeams.mockResolvedValue({
      events: 1,
      denied: 0,
      failed: 1,
      errors: ["event-1: team-1:failed"],
    })

    const response = await GET(cronRequest())

    expect(response.status).toBe(500)
    expect(await response.json()).toMatchObject({
      pendingTeamCloseout: { events: 1, denied: 0, failed: 1 },
    })
  })

})
