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

mock.module("@/lib/services/lifecycle", () => ({
  processAutoTransitions: mockProcessAutoTransitions,
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
  })
})
