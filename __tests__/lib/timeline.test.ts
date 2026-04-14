import { describe, expect, it, beforeEach, afterEach } from "bun:test"
import { getEffectiveStatus, getTimelineState, validateTimelineDates } from "@/lib/utils/timeline"
import type { HackathonStatus } from "@/lib/db/hackathon-types"

function mockDateGlobal(originalDate: typeof Date, isoString: string) {
  const mockNow = new Date(isoString).getTime()
  globalThis.Date = class extends originalDate {
    constructor(...args: Parameters<typeof Date>) {
      if (args.length === 0) {
        super(mockNow)
      } else {
        super(...args)
      }
    }
    static now() {
      return mockNow
    }
  } as typeof Date
}

describe("getEffectiveStatus", () => {
  let originalDate: typeof Date

  beforeEach(() => {
    originalDate = globalThis.Date
  })

  afterEach(() => {
    globalThis.Date = originalDate
  })

  function mockDate(isoString: string) {
    mockDateGlobal(originalDate, isoString)
  }

  it("returns draft unchanged regardless of dates", () => {
    mockDate("2026-03-10T00:00:00Z")
    expect(getEffectiveStatus({ status: "draft", starts_at: "2026-01-01T00:00:00Z", ends_at: "2026-01-02T00:00:00Z" })).toBe("draft")
  })

  it("returns archived unchanged regardless of dates", () => {
    mockDate("2026-03-10T00:00:00Z")
    expect(getEffectiveStatus({ status: "archived", starts_at: "2026-01-01T00:00:00Z", ends_at: "2026-01-02T00:00:00Z" })).toBe("archived")
  })

  it("returns active when published and starts_at has passed but not yet ended", () => {
    mockDate("2026-03-02T12:00:00Z")
    expect(getEffectiveStatus({
      status: "published",
      starts_at: "2026-03-01T00:00:00Z",
      ends_at: "2026-03-05T00:00:00Z",
    })).toBe("active")
  })

  it("returns active when registration_open and starts_at has passed but not yet ended", () => {
    mockDate("2026-03-02T12:00:00Z")
    expect(getEffectiveStatus({
      status: "registration_open",
      starts_at: "2026-03-01T00:00:00Z",
      ends_at: "2026-03-05T00:00:00Z",
    })).toBe("active")
  })

  it("returns completed when active and ends_at has passed", () => {
    mockDate("2026-03-10T00:00:00Z")
    expect(getEffectiveStatus({
      status: "active",
      starts_at: "2026-03-01T00:00:00Z",
      ends_at: "2026-03-05T00:00:00Z",
    })).toBe("completed")
  })

  it("returns completed when published and both starts_at and ends_at have passed", () => {
    mockDate("2026-03-10T00:00:00Z")
    expect(getEffectiveStatus({
      status: "published",
      starts_at: "2026-03-01T00:00:00Z",
      ends_at: "2026-03-05T00:00:00Z",
    })).toBe("completed")
  })

  it("preserves judging status even when ends_at has passed", () => {
    mockDate("2026-03-10T00:00:00Z")
    expect(getEffectiveStatus({
      status: "judging",
      starts_at: "2026-03-01T00:00:00Z",
      ends_at: "2026-03-05T00:00:00Z",
    })).toBe("judging")
  })

  it("returns published unchanged when starts_at is in the future", () => {
    mockDate("2026-02-19T00:00:00Z")
    expect(getEffectiveStatus({
      status: "published",
      starts_at: "2026-03-01T00:00:00Z",
      ends_at: "2026-03-05T00:00:00Z",
    })).toBe("published")
  })

  it("returns status unchanged when starts_at is null", () => {
    mockDate("2026-03-10T00:00:00Z")
    expect(getEffectiveStatus({ status: "registration_open", starts_at: null, ends_at: null })).toBe("registration_open")
  })

  it("returns active when starts_at has passed and ends_at is null", () => {
    mockDate("2026-03-10T00:00:00Z")
    expect(getEffectiveStatus({
      status: "published",
      starts_at: "2026-03-01T00:00:00Z",
      ends_at: null,
    })).toBe("active")
  })
})

describe("getTimelineState", () => {
  let originalDate: typeof Date

  beforeEach(() => {
    originalDate = globalThis.Date
  })

  afterEach(() => {
    globalThis.Date = originalDate
  })

  function mockDate(isoString: string) {
    mockDateGlobal(originalDate, isoString)
  }

  describe("status-based states", () => {
    it("returns Completed for completed status", () => {
      const result = getTimelineState({ status: "completed" })
      expect(result).toEqual({ label: "Completed", variant: "outline" })
    })

    it("returns Judging for judging status", () => {
      const result = getTimelineState({ status: "judging" })
      expect(result).toEqual({ label: "Judging", variant: "default" })
    })

    it("returns Live for active status", () => {
      const result = getTimelineState({ status: "active" })
      expect(result).toEqual({ label: "Live", variant: "default" })
    })

    it("returns Draft for draft status", () => {
      const result = getTimelineState({ status: "draft" })
      expect(result).toEqual({ label: "Draft", variant: "secondary" })
    })

    it("returns Archived for archived status", () => {
      const result = getTimelineState({ status: "archived" })
      expect(result).toEqual({ label: "Archived", variant: "outline" })
    })
  })

  describe("date-based states for published status", () => {
    const baseHackathon = {
      status: "published" as HackathonStatus,
      registration_opens_at: "2026-02-01T00:00:00Z",
      registration_closes_at: "2026-02-15T00:00:00Z",
      starts_at: "2026-03-01T00:00:00Z",
      ends_at: "2026-03-02T00:00:00Z",
    }

    it("returns Coming Soon before registration opens", () => {
      mockDate("2026-01-15T00:00:00Z")
      const result = getTimelineState(baseHackathon)
      expect(result).toEqual({ label: "Coming Soon", variant: "secondary" })
    })

    it("returns Registration Open with countdown during registration period before event starts", () => {
      mockDate("2026-02-10T00:00:00Z")
      const result = getTimelineState(baseHackathon)
      expect(result).toEqual({
        label: "Registration Open",
        variant: "default",
        showCountdown: true,
        startsAt: "2026-03-01T00:00:00Z",
      })
    })

    it("returns Registration Closed with countdown after registration closes but before event starts", () => {
      mockDate("2026-02-20T00:00:00Z")
      const result = getTimelineState(baseHackathon)
      expect(result).toEqual({
        label: "Registration Closed",
        variant: "secondary",
        showCountdown: true,
        startsAt: "2026-03-01T00:00:00Z",
      })
    })

    it("returns Live during event", () => {
      mockDate("2026-03-01T12:00:00Z")
      const result = getTimelineState(baseHackathon)
      expect(result).toEqual({ label: "Live", variant: "default" })
    })

    it("returns Completed after event ends", () => {
      mockDate("2026-03-03T00:00:00Z")
      const result = getTimelineState(baseHackathon)
      expect(result).toEqual({ label: "Completed", variant: "outline" })
    })
  })

  describe("registration_open status fallback", () => {
    it("returns Registration Open for registration_open status without dates", () => {
      const result = getTimelineState({
        status: "registration_open",
        registration_opens_at: null,
        registration_closes_at: null,
      })
      expect(result).toEqual({ label: "Registration Open", variant: "default" })
    })

    it("returns Registration Open with countdown when starts_at is in the future", () => {
      mockDate("2026-02-01T00:00:00Z")
      const result = getTimelineState({
        status: "registration_open",
        registration_opens_at: null,
        registration_closes_at: null,
        starts_at: "2026-03-01T00:00:00Z",
      })
      expect(result).toEqual({
        label: "Registration Open",
        variant: "default",
        showCountdown: true,
        startsAt: "2026-03-01T00:00:00Z",
      })
    })
  })

  describe("countdown field behavior", () => {
    it("does not include countdown when registration is open but event already started", () => {
      mockDate("2026-02-10T00:00:00Z")
      const result = getTimelineState({
        status: "published",
        registration_opens_at: "2026-02-01T00:00:00Z",
        registration_closes_at: "2026-02-28T00:00:00Z",
        starts_at: "2026-02-05T00:00:00Z",
        ends_at: "2026-03-01T00:00:00Z",
      })
      expect(result).toEqual({ label: "Registration Open", variant: "default" })
      expect(result.showCountdown).toBeUndefined()
    })

    it("does not include countdown for Coming Soon state", () => {
      mockDate("2026-01-01T00:00:00Z")
      const result = getTimelineState({
        status: "published",
        registration_opens_at: "2026-02-01T00:00:00Z",
        registration_closes_at: "2026-02-15T00:00:00Z",
        starts_at: "2026-03-01T00:00:00Z",
      })
      expect(result).toEqual({ label: "Coming Soon", variant: "secondary" })
      expect(result.showCountdown).toBeUndefined()
    })

    it("does not include countdown for Live state", () => {
      const result = getTimelineState({ status: "active" })
      expect(result).toEqual({ label: "Live", variant: "default" })
      expect(result.showCountdown).toBeUndefined()
    })

    it("does not include countdown for Completed state", () => {
      const result = getTimelineState({ status: "completed" })
      expect(result).toEqual({ label: "Completed", variant: "outline" })
      expect(result.showCountdown).toBeUndefined()
    })
  })

  describe("default fallback", () => {
    it("returns Coming Soon for published status without dates", () => {
      const result = getTimelineState({
        status: "published",
        registration_opens_at: null,
        registration_closes_at: null,
      })
      expect(result).toEqual({ label: "Coming Soon", variant: "secondary" })
    })
  })
})

describe("validateTimelineDates", () => {
  it("returns null for valid dates (start before end)", () => {
    const result = validateTimelineDates({
      startsAt: "2026-03-01T09:00:00Z",
      endsAt: "2026-03-02T17:00:00Z",
    })
    expect(result).toBeNull()
  })

  it("returns null when dates are null", () => {
    expect(validateTimelineDates({})).toBeNull()
    expect(validateTimelineDates({ startsAt: null, endsAt: null })).toBeNull()
  })

  it("returns null when only start is set", () => {
    expect(validateTimelineDates({ startsAt: "2026-03-01T09:00:00Z" })).toBeNull()
  })

  it("returns null when only end is set", () => {
    expect(validateTimelineDates({ endsAt: "2026-03-02T17:00:00Z" })).toBeNull()
  })

  it("returns error when start equals end", () => {
    const result = validateTimelineDates({
      startsAt: "2026-03-01T09:00:00Z",
      endsAt: "2026-03-01T09:00:00Z",
    })
    expect(result).toBe("Event must start before it ends")
  })

  it("returns error when start is after end", () => {
    const result = validateTimelineDates({
      startsAt: "2026-03-02T09:00:00Z",
      endsAt: "2026-03-01T09:00:00Z",
    })
    expect(result).toBe("Event must start before it ends")
  })

  it("accepts Date objects as input", () => {
    expect(validateTimelineDates({
      startsAt: new Date("2026-03-01T00:00:00Z"),
      endsAt: new Date("2026-03-02T00:00:00Z"),
    })).toBeNull()
  })
})
