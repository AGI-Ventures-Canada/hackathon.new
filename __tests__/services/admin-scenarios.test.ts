import { describe, expect, it, afterEach } from "bun:test"

const { listScenarios, runScenario } = await import("@/lib/services/admin-scenarios")

const ATTENDEE_SCENARIOS = [
  "attendee-captain-pending-invite",
  "attendee-invite-expired",
  "attendee-invite-declined",
  "attendee-team-at-capacity",
  "attendee-invited-to-team",
  "attendee-solo-submitted",
  "attendee-submitted-then-left",
  "attendee-announcements-audiences",
  "attendee-perks-mixed",
  "attendee-winner-pending-claim",
]

describe("admin-scenarios attendee wiring", () => {
  const originalVercelEnv = process.env.VERCEL_ENV

  afterEach(() => {
    if (originalVercelEnv === undefined) {
      delete process.env.VERCEL_ENV
    } else {
      process.env.VERCEL_ENV = originalVercelEnv
    }
  })

  describe("listScenarios", () => {
    it.each(ATTENDEE_SCENARIOS)("registers %s in SCENARIOS metadata", (name) => {
      const scenarios = listScenarios()
      const found = scenarios.find((s) => s.name === name)
      expect(found).toBeDefined()
      expect(found?.label).toBeTruthy()
      expect(found?.description).toBeTruthy()
    })
  })

  describe("runScenario dispatch", () => {
    it.each(ATTENDEE_SCENARIOS)("has a registered runner for %s", async (name) => {
      delete process.env.VERCEL_ENV
      try {
        await runScenario(name)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        expect(message).not.toContain("Unknown scenario")
      }
    })
  })
})
