import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test"
import { OatmealClient } from "../../src/client"
import { runJudgeScope, runJudgingDistribution, runJudgingInvitationBatch, runJudgingRounds, runJudgingScorecards, runJudgingSetup } from "../../src/commands/judging/workspace"

const originalFetch = globalThis.fetch
const fetchMock = mock<typeof fetch>()
const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "test" })
const setup = { version: "2026-09-05T10:00:00Z", name: "Test event", settings: {}, prizes: [], coreCriteria: [], prizeCriteria: [], readiness: { isReady: true, issues: [] } }
function respond(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } }) }
function body(index = 0) { return JSON.parse(String(fetchMock.mock.calls[index][1]?.body)) }

describe("judging workspace CLI", () => {
  let log: ReturnType<typeof spyOn>
  beforeEach(() => { fetchMock.mockReset(); globalThis.fetch = fetchMock; log = spyOn(console, "log").mockImplementation(() => {}) })
  afterEach(() => { globalThis.fetch = originalFetch; log.mockRestore() })

  it("reads the same canonical setup used by the organizer page", async () => {
    fetchMock.mockResolvedValueOnce(respond({ setup }))
    await runJudgingSetup(client, "inspect", "event", ["--json"])
    expect(fetchMock.mock.calls[0][0]).toContain("/judging/setup")
    expect(JSON.parse(log.mock.calls[0][0])).toEqual({ setup })
  })

  it("uses the current setup version and an explicit starter request", async () => {
    fetchMock.mockResolvedValueOnce(respond({ setup })).mockResolvedValueOnce(respond({ setup }))
    await runJudgingSetup(client, "configure", "event", ["--starter", "--opens-at", "2026-09-10T09:00:00-04:00", "--closes-at", "2026-09-10T17:00:00-04:00", "--browse", "off", "--request-key", "retry-me", "--json"])
    expect(body(1)).toMatchObject({ expectedVersion: setup.version, requestKey: "retry-me", applyStarter: true, settings: { opensAt: "2026-09-10T13:00:00.000Z", closesAt: "2026-09-10T21:00:00.000Z", browseEnabled: false } })
  })

  it("requires an assignment preview version before applying", async () => {
    await expect(runJudgingDistribution(client, "apply", "event", [])).rejects.toThrow("expected-version")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("passes coverage target and durable request key without changing their meaning", async () => {
    fetchMock.mockResolvedValueOnce(respond({ createdAssignments: 5, warnings: [] }))
    await runJudgingDistribution(client, "apply", "event", ["--reviews-per-project", "3", "--expected-version", "preview-123", "--request-key", "retry-123", "--json"])
    expect(body()).toEqual({ targetReviewsPerProject: 3, expectedVersion: "preview-123", requestKey: "retry-123" })
  })

  it("rejects invalid local scheduling and target input before HTTP", async () => {
    await expect(runJudgingSetup(client, "configure", "event", ["--opens-at", "2026-09-10T09:00"])).rejects.toThrow("timezone")
    await expect(runJudgingDistribution(client, "preview", "event", ["--reviews-per-project", "2.5"])).rejects.toThrow("between")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("supports each scoring method through the shared prize configuration route", async () => {
    for (const style of ["weighted_score", "gate_check", "bucket_sort", "judges_pick", "crowd_vote"]) {
      fetchMock.mockResolvedValueOnce(respond({ prize: { id: "prize" } }))
      await runJudgingScorecards(client, "update", "event", "prize", ["--style", style, "--data", '{"criteria":[{"id":"kept-id","name":"Impact","weight":25,"minScore":0,"maxScore":10}]}', "--json"])
      expect(body(fetchMock.mock.calls.length - 1).criteria[0].id).toBe("kept-id")
      expect(body(fetchMock.mock.calls.length - 1).judgingStyle).toBe(style)
    }
  })

  it("previews invitations by default and preserves per-recipient delivery results", async () => {
    const result = { preview: true, results: [{ email: "a@test.com", outcome: "invite", delivery: "queued" }, { email: "bad", outcome: "invalid_email" }] }
    fetchMock.mockResolvedValueOnce(respond(result))
    await runJudgingInvitationBatch(client, "batch", "event", ["--emails", "a@test.com;bad", "--json"])
    expect(body().preview).toBe(true)
    expect(body().requestKey).toBeUndefined()
    expect(JSON.parse(log.mock.calls[0][0])).toEqual(result)
  })

  it("sends a reminder batch only with --send and reuses the request key", async () => {
    fetchMock.mockResolvedValueOnce(respond({ preview: false, results: [{ email: "a@test.com", outcome: "reminded", delivery: "sent" }] }))
    await runJudgingInvitationBatch(client, "remind", "event", ["--emails", "a@test.com", "--send", "--request-key", "retry-uuid", "--json"])
    expect(fetchMock.mock.calls[0][0]).toContain("/judging/judges/remind")
    expect(body()).toMatchObject({ preview: false, requestKey: "retry-uuid" })
  })

  it("retains advanced round rules and separate judging dates", async () => {
    fetchMock.mockResolvedValueOnce(respond({ round: { id: "round" } }))
    await runJudgingRounds(client, "create", "event", undefined, ["--name", "Final", "--data", '{"advancement":"threshold","advancementConfig":{"threshold":80}}', "--opens-at", "2026-09-10T09:00:00Z"])
    expect(body()).toMatchObject({ name: "Final", advancement: "threshold", advancementConfig: { threshold: 80 }, opensAt: "2026-09-10T09:00:00.000Z" })
  })

  it("surfaces stale setup errors without claiming a save", async () => {
    fetchMock.mockResolvedValueOnce(respond({ error: "Judging changed", code: "judging_changed" }, 409))
    await expect(runJudgingSetup(client, "configure", "event", ["--starter", "--expected-version", setup.version])).rejects.toThrow("Judging changed")
    expect(log).not.toHaveBeenCalled()
  })

  it("updates an existing judge's scope using the current version and preserves rooms", async () => {
    fetchMock.mockResolvedValueOnce(respond({ options: { version: "v1", prizeScope: "all", prizeIds: [], roomIds: ["room"], locked: false } })).mockResolvedValueOnce(respond({ options: {} }))
    await runJudgeScope(client, "event", "judge", ["--prizes", "prize-a,prize-b", "--json"])
    expect(body(1)).toEqual({ expectedVersion: "v1", prizeScope: "selected", prizeIds: ["prize-a", "prize-b"], roomIds: ["room"] })
  })

  it("does not mutate submitted judge scope", async () => {
    fetchMock.mockResolvedValueOnce(respond({ options: { version: "v1", prizeScope: "all", prizeIds: [], roomIds: [], locked: true } }))
    await expect(runJudgeScope(client, "event", "judge", ["--rooms", "all"])).rejects.toThrow("submitted reviews")
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
