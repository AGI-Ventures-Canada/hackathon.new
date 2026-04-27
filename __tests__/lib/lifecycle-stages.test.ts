import { describe, it, expect } from "bun:test"
import {
  applyOptimisticStage,
  buildHackathonFingerprint,
  buildStatusTransitionBody,
  shouldClearOptimisticStage,
} from "@/lib/utils/lifecycle-stages"
import type { ActionItem } from "@/lib/utils/organizer-actions"

describe("applyOptimisticStage", () => {
  it("returns the optimistic stage when set", () => {
    expect(applyOptimisticStage("active", "judging")).toBe("judging")
  })

  it("falls back to base status when optimistic stage is null", () => {
    expect(applyOptimisticStage("active", null)).toBe("active")
  })

  it("preserves base status fidelity (e.g. registration_open)", () => {
    expect(applyOptimisticStage("registration_open", null)).toBe(
      "registration_open",
    )
  })
})

describe("shouldClearOptimisticStage", () => {
  it("returns false when no optimistic stage is set", () => {
    expect(shouldClearOptimisticStage("active", null)).toBe(false)
  })

  it("returns true when base status maps to the optimistic stage", () => {
    expect(shouldClearOptimisticStage("active", "active")).toBe(true)
  })

  it("returns true when base status (registration_open) catches up to published optimistic stage", () => {
    expect(shouldClearOptimisticStage("registration_open", "published")).toBe(
      true,
    )
  })

  it("returns false when the base status has not caught up", () => {
    expect(shouldClearOptimisticStage("active", "judging")).toBe(false)
  })

  it("returns true when archived catches up to a completed optimistic stage", () => {
    expect(shouldClearOptimisticStage("archived", "completed")).toBe(true)
  })
})

describe("buildHackathonFingerprint", () => {
  const baseArgs = {
    status: "active" as const,
    phase: "build" as const,
    startsAt: "2026-04-01T00:00:00Z",
    endsAt: "2026-04-03T00:00:00Z",
    actionItems: [] as ActionItem[],
  }

  it("returns a stable string for the same input", () => {
    const a = buildHackathonFingerprint(baseArgs)
    const b = buildHackathonFingerprint({ ...baseArgs })
    expect(a).toBe(b)
  })

  it("changes when status changes", () => {
    const a = buildHackathonFingerprint(baseArgs)
    const b = buildHackathonFingerprint({ ...baseArgs, status: "judging" })
    expect(a).not.toBe(b)
  })

  it("changes when phase changes", () => {
    const a = buildHackathonFingerprint(baseArgs)
    const b = buildHackathonFingerprint({
      ...baseArgs,
      phase: "submission_open",
    })
    expect(a).not.toBe(b)
  })

  it("changes when endsAt changes", () => {
    const a = buildHackathonFingerprint(baseArgs)
    const b = buildHackathonFingerprint({
      ...baseArgs,
      endsAt: "2026-05-01T00:00:00Z",
    })
    expect(a).not.toBe(b)
  })

  it("changes when an auto action item flips to complete", () => {
    const items: ActionItem[] = [
      {
        id: "set-banner",
        label: "Add a banner",
        severity: "warning",
        close: { kind: "auto", isComplete: false },
      },
    ]
    const a = buildHackathonFingerprint({ ...baseArgs, actionItems: items })
    const b = buildHackathonFingerprint({
      ...baseArgs,
      actionItems: [
        { ...items[0], close: { kind: "auto", isComplete: true } },
      ],
    })
    expect(a).not.toBe(b)
  })

  it("ignores manual action item completion state in fingerprint", () => {
    const a = buildHackathonFingerprint({
      ...baseArgs,
      actionItems: [
        {
          id: "promote",
          label: "Promote your event",
          severity: "info",
          close: { kind: "manual" },
        },
      ],
    })
    const b = buildHackathonFingerprint({
      ...baseArgs,
      actionItems: [
        {
          id: "promote",
          label: "Promote your event",
          severity: "info",
          close: { kind: "manual" },
        },
      ],
    })
    expect(a).toBe(b)
  })

  it("treats null dates as empty strings", () => {
    const a = buildHackathonFingerprint({
      ...baseArgs,
      startsAt: null,
      endsAt: null,
    })
    expect(a).toBe("active|build|||")
  })

  it("treats null phase as empty string", () => {
    const a = buildHackathonFingerprint({ ...baseArgs, phase: null })
    expect(a).toBe(`active||${baseArgs.startsAt}|${baseArgs.endsAt}|`)
  })
})

describe("buildStatusTransitionBody", () => {
  it("translates published stage to registration_open db status", () => {
    expect(buildStatusTransitionBody("published", null)).toEqual({
      status: "registration_open",
    })
  })

  it("passes other stages through unchanged", () => {
    expect(buildStatusTransitionBody("draft", null)).toEqual({ status: "draft" })
    expect(buildStatusTransitionBody("active", null)).toEqual({ status: "active" })
    expect(buildStatusTransitionBody("completed", null)).toEqual({
      status: "completed",
    })
  })

  describe("judging transition endsAt handling", () => {
    it("sets endsAt to now when endsAt is null", () => {
      const before = Date.now()
      const body = buildStatusTransitionBody("judging", null)
      const after = Date.now()
      const ms = new Date(body.endsAt as string).getTime()
      expect(ms).toBeGreaterThanOrEqual(before)
      expect(ms).toBeLessThanOrEqual(after)
    })

    it("sets endsAt to now when endsAt is in the future", () => {
      const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      const body = buildStatusTransitionBody("judging", future)
      expect(body.endsAt).toBeDefined()
      expect(new Date(body.endsAt as string).getTime()).toBeLessThan(
        new Date(future).getTime(),
      )
    })

    it("does not modify endsAt when it is already in the past", () => {
      const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const body = buildStatusTransitionBody("judging", past)
      expect(body.endsAt).toBeUndefined()
    })
  })

  it("does not touch endsAt for non-judging transitions", () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    expect(buildStatusTransitionBody("draft", past).endsAt).toBeUndefined()
    expect(buildStatusTransitionBody("published", past).endsAt).toBeUndefined()
    expect(buildStatusTransitionBody("active", past).endsAt).toBeUndefined()
    expect(buildStatusTransitionBody("completed", past).endsAt).toBeUndefined()
  })
})
