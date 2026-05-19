import { describe, expect, it, afterEach } from "bun:test"
import { SCENARIOS } from "@/lib/dev/scenarios"

const { listScenarios, runScenario } = await import("@/lib/services/admin-scenarios")

const SCENARIO_NAMES = SCENARIOS.map((scenario) => scenario.name)

describe("admin-scenarios wiring", () => {
  const originalVercelEnv = process.env.VERCEL_ENV

  afterEach(() => {
    if (originalVercelEnv === undefined) {
      delete process.env.VERCEL_ENV
    } else {
      process.env.VERCEL_ENV = originalVercelEnv
    }
  })

  describe("listScenarios", () => {
    it.each(SCENARIO_NAMES)("registers %s in SCENARIOS metadata", (name) => {
      const scenarios = listScenarios()
      const found = scenarios.find((s) => s.name === name)
      expect(found).toBeDefined()
      expect(found?.label).toBeTruthy()
      expect(found?.description).toBeTruthy()
    })
  })

  describe("runScenario dispatch", () => {
    it.each(SCENARIO_NAMES)("has a registered runner for %s", async (name) => {
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
