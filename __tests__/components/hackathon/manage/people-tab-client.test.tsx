import { describe, expect, it } from "bun:test"

import { canChangePersonRole } from "@/app/(public)/e/[slug]/manage/_people-tab-client"

describe("live event role changes", () => {
  it("lets an attendee become a judge during judging", () => {
    expect(canChangePersonRole("judging", "participant", "judge")).toBe(true)
  })

  it("keeps other role changes locked during judging", () => {
    expect(canChangePersonRole("judging", "participant", "mentor")).toBe(false)
    expect(canChangePersonRole("judging", "judge", "participant")).toBe(false)
  })

  it("keeps all role changes locked after the event", () => {
    expect(canChangePersonRole("completed", "participant", "judge")).toBe(false)
    expect(canChangePersonRole("archived", "participant", "judge")).toBe(false)
  })

  it("allows role changes before judging", () => {
    expect(canChangePersonRole("active", "participant", "judge")).toBe(true)
    expect(canChangePersonRole("draft", "judge", "mentor")).toBe(true)
  })
})
