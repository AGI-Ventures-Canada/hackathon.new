import { describe, it, expect, beforeEach } from "bun:test"
import {
  createChainableMock,
  resetSupabaseMocks,
  setMockFromImplementation,
} from "../lib/supabase-mock"

const {
  listScheduleItems,
  createScheduleItem,
  updateScheduleItem,
  deleteScheduleItem,
  getSubmissionDeadline,
  buildDefaultAgendaItems,
} = await import("@/lib/services/schedule-items")

const HACKATHON_ID = "11111111-1111-1111-1111-111111111111"
const ITEM_ID = "22222222-2222-2222-2222-222222222222"

describe("listScheduleItems", () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  it("returns items ordered by starts_at", async () => {
    setMockFromImplementation(() =>
      createChainableMock({
        data: [
          { id: "s1", hackathon_id: HACKATHON_ID, title: "Opening", description: null, starts_at: "2026-01-01T09:00:00Z", ends_at: "2026-01-01T09:30:00Z", location: "Main Hall", sort_order: 0, created_at: "2026-01-01", updated_at: "2026-01-01" },
          { id: "s2", hackathon_id: HACKATHON_ID, title: "Hacking Begins", description: "Start building!", starts_at: "2026-01-01T10:00:00Z", ends_at: null, location: null, sort_order: 0, created_at: "2026-01-01", updated_at: "2026-01-01" },
        ],
        error: null,
      })
    )

    const result = await listScheduleItems(HACKATHON_ID)
    expect(result).toHaveLength(2)
    expect(result[0].title).toBe("Opening")
  })

  it("returns empty array on error", async () => {
    setMockFromImplementation(() =>
      createChainableMock({ data: null, error: { message: "error" } })
    )
    const result = await listScheduleItems(HACKATHON_ID)
    expect(result).toEqual([])
  })
})

describe("createScheduleItem", () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  it("creates a schedule item", async () => {
    setMockFromImplementation(() =>
      createChainableMock({
        data: { id: ITEM_ID, hackathon_id: HACKATHON_ID, title: "Workshop", description: "AI workshop", starts_at: "2026-01-01T14:00:00Z", ends_at: "2026-01-01T15:00:00Z", location: "Room A", sort_order: 0, created_at: "2026-01-01", updated_at: "2026-01-01" },
        error: null,
      })
    )

    const result = await createScheduleItem(HACKATHON_ID, {
      title: "Workshop",
      description: "AI workshop",
      startsAt: "2026-01-01T14:00:00Z",
      endsAt: "2026-01-01T15:00:00Z",
      location: "Room A",
    })
    expect(result).not.toBeNull()
    expect(result!.title).toBe("Workshop")
    expect(result!.location).toBe("Room A")
  })

  it("creates with minimal fields", async () => {
    setMockFromImplementation(() =>
      createChainableMock({
        data: { id: ITEM_ID, hackathon_id: HACKATHON_ID, title: "Break", description: null, starts_at: "2026-01-01T12:00:00Z", ends_at: null, location: null, sort_order: 0, created_at: "2026-01-01", updated_at: "2026-01-01" },
        error: null,
      })
    )

    const result = await createScheduleItem(HACKATHON_ID, {
      title: "Break",
      startsAt: "2026-01-01T12:00:00Z",
    })
    expect(result).not.toBeNull()
    expect(result!.description).toBeNull()
  })

  it("returns null on error", async () => {
    setMockFromImplementation(() =>
      createChainableMock({ data: null, error: { message: "error" } })
    )
    const result = await createScheduleItem(HACKATHON_ID, { title: "X", startsAt: "2026-01-01T00:00:00Z" })
    expect(result).toBeNull()
  })
})

describe("updateScheduleItem", () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  it("updates specified fields", async () => {
    setMockFromImplementation(() =>
      createChainableMock({
        data: { id: ITEM_ID, hackathon_id: HACKATHON_ID, title: "Updated", description: null, starts_at: "2026-01-01T14:00:00Z", ends_at: null, location: "Room B", sort_order: 1, created_at: "2026-01-01", updated_at: "2026-01-02" },
        error: null,
      })
    )

    const result = await updateScheduleItem(ITEM_ID, HACKATHON_ID, { title: "Updated", location: "Room B", sortOrder: 1 })
    expect(result).not.toBeNull()
    expect(result!.title).toBe("Updated")
    expect(result!.location).toBe("Room B")
  })

  it("returns null on error", async () => {
    setMockFromImplementation(() =>
      createChainableMock({ data: null, error: { message: "error" } })
    )
    const result = await updateScheduleItem(ITEM_ID, HACKATHON_ID, { title: "Updated" })
    expect(result).toBeNull()
  })
})

describe("deleteScheduleItem", () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  it("returns true on success", async () => {
    setMockFromImplementation(() =>
      createChainableMock({ data: null, error: null })
    )
    const result = await deleteScheduleItem(ITEM_ID, HACKATHON_ID)
    expect(result).toBe(true)
  })

  it("returns false on error", async () => {
    setMockFromImplementation(() =>
      createChainableMock({ data: null, error: { message: "error" } })
    )
    const result = await deleteScheduleItem(ITEM_ID, HACKATHON_ID)
    expect(result).toBe(false)
  })
})

describe("getSubmissionDeadline", () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  it("returns starts_at of the submission_deadline item", async () => {
    const chain = createChainableMock({
      data: { id: "item-1", starts_at: "2026-04-10T17:00:00Z", trigger_type: "submission_deadline" },
      error: null,
    })
    setMockFromImplementation(() => chain)

    const result = await getSubmissionDeadline("hack-1")
    expect(result).toBe("2026-04-10T17:00:00Z")
  })

  it("returns null when no submission_deadline item exists", async () => {
    const chain = createChainableMock({ data: null, error: { message: "not found", code: "PGRST116" } })
    setMockFromImplementation(() => chain)

    const result = await getSubmissionDeadline("hack-1")
    expect(result).toBeNull()
  })
})

describe("buildDefaultAgendaItems", () => {
  it("returns 5 items with correct trigger types", () => {
    const items = buildDefaultAgendaItems("2026-04-10T09:00:00Z", "2026-04-10T18:00:00Z")
    expect(items).toHaveLength(5)
    expect(items[0].title).toBe("Opening Kickoff")
    expect(items[1].title).toBe("Hacking Begins")
    expect(items[2].title).toBe("Submissions Close & Judging Starts")
    expect(items[2].triggerType).toBe("submission_deadline")
    expect(items[4].title).toBe("Awards Ceremony")
  })

  it("derives times from start and end dates", () => {
    const items = buildDefaultAgendaItems("2026-04-10T09:00:00Z", "2026-04-10T18:00:00Z")
    expect(items[0].startsAt).toBe("2026-04-10T09:00:00.000Z")
    expect(items[2].startsAt).toBe("2026-04-10T18:00:00.000Z")
  })

  it("non-trigger items have no triggerType", () => {
    const items = buildDefaultAgendaItems("2026-04-10T09:00:00Z", "2026-04-10T18:00:00Z")
    const nonTrigger = items.filter((i) => !i.triggerType)
    expect(nonTrigger).toHaveLength(4)
  })

  it("returns 5 items with default times when dates are null", () => {
    const items = buildDefaultAgendaItems(null, null)
    expect(items).toHaveLength(5)
    expect(items[0].title).toBe("Opening Kickoff")
    expect(items[2].triggerType).toBe("submission_deadline")
  })

  it("sets submission deadline to the hackathon end time", () => {
    const items = buildDefaultAgendaItems("2026-04-10T09:00:00Z", "2026-04-10T18:00:00Z")
    const deadline = items.find((i) => i.triggerType === "submission_deadline")
    expect(deadline?.startsAt).toBe("2026-04-10T18:00:00.000Z")
    expect(deadline?.endsAt).toBe("2026-04-10T18:00:00.000Z")
  })

  it("still sets submission deadline to ends_at for short (sub-hour) events", () => {
    const items = buildDefaultAgendaItems("2026-04-10T09:00:00Z", "2026-04-10T09:30:00Z")
    const deadline = items.find((i) => i.triggerType === "submission_deadline")
    expect(deadline?.startsAt).toBe("2026-04-10T09:30:00.000Z")
    expect(deadline?.endsAt).toBe("2026-04-10T09:30:00.000Z")
  })
})
