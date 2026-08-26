import { describe, expect, it } from "bun:test"
import { isHackathonCreationReady } from "@/lib/utils/hackathon-creation-state"

describe("isHackathonCreationReady", () => {
  it("keeps legacy rows without an aggregate marker available", () => {
    expect(isHackathonCreationReady({ metadata: null })).toBe(true)
    expect(isHackathonCreationReady({ metadata: {} })).toBe(true)
    expect(isHackathonCreationReady({ metadata: { source: "scratch" } })).toBe(true)
  })

  it("only exposes marked rows after aggregate creation completes", () => {
    for (const state of ["building", "compensating", "failed", undefined]) {
      expect(isHackathonCreationReady({
        metadata: { aggregate_creation: state ? { state } : {} },
      })).toBe(false)
    }
    expect(isHackathonCreationReady({
      metadata: { aggregate_creation: { state: "complete" } },
    })).toBe(true)
  })

  it("fails closed for malformed markers", () => {
    expect(isHackathonCreationReady({
      metadata: { aggregate_creation: null },
    })).toBe(false)
    expect(isHackathonCreationReady({
      metadata: { aggregate_creation: "complete" },
    })).toBe(false)
  })
})
