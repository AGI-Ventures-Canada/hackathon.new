import { beforeEach, describe, expect, it } from "bun:test"
import { resetSupabaseMocks, setMockRpcImplementation } from "../lib/supabase-mock"
import { getConfiguredJudgingReadiness, getScheduledJudgingReadiness, isJudgingWindowOpen } from "@/lib/services/judging-readiness"

describe("authoritative scheduled judging readiness", () => {
  beforeEach(resetSupabaseMocks)

  it("leaves manual legacy readers unchanged without a configured window", async () => {
    setMockRpcImplementation((name) => {
      expect(name).toBe("judging_window_is_configured")
      return Promise.resolve({ data: false, error: null })
    })
    expect(await getConfiguredJudgingReadiness("event")).toBeNull()
  })

  it("shares the authoritative legacy-compatible result across configured readers", async () => {
    const readiness = { isReady: true, issues: [], unassignedProjectCount: 0, requiresJudgeScoring: true }
    setMockRpcImplementation((name) => Promise.resolve({ data: name === "judging_window_is_configured" ? true : readiness, error: null }))
    expect(await getConfiguredJudgingReadiness("event")).toEqual(readiness)
  })

  it("preserves missing coverage and invalid scorecard reasons", async () => {
    const readiness = { isReady: false, issues: ["Finish the scorecard for Best overall.", "Assign eligible judges to every project for Best overall."], unassignedProjectCount: 1, requiresJudgeScoring: true }
    setMockRpcImplementation((name, args) => {
      expect(name).toBe("get_scheduled_judging_readiness")
      expect(args).toEqual({ p_hackathon_id: "event", p_round_id: "round" })
      return Promise.resolve({ data: readiness, error: null })
    })
    expect(await getScheduledJudgingReadiness("event", "round")).toEqual(readiness)
  })

  it("reads the same SQL gate used by atomic review writes", async () => {
    setMockRpcImplementation((name, args) => {
      expect(name).toBe("judging_window_is_open")
      expect(args).toEqual({ p_hackathon_id: "event", p_round_id: null })
      return Promise.resolve({ data: false, error: null })
    })
    expect(await isJudgingWindowOpen("event")).toBe(false)
  })

  it("keeps reduced coverage open when SQL says every project has a judge", async () => {
    setMockRpcImplementation(() => Promise.resolve({ data: true, error: null }))
    expect(await isJudgingWindowOpen("event", "round")).toBe(true)
  })

  it("fails closed on missing or failed checks", async () => {
    setMockRpcImplementation(() => Promise.resolve({ data: null, error: { message: "offline" } }))
    expect(await isJudgingWindowOpen("event")).toBe(false)
    await expect(getScheduledJudgingReadiness("event")).rejects.toThrow("couldn't check judging setup")
    await expect(getConfiguredJudgingReadiness("event")).rejects.toThrow("couldn't check judging setup")
  })
})
