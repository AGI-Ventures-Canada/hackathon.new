import { beforeEach, describe, expect, it } from "bun:test"
import {
  createChainableMock,
  resetSupabaseMocks,
  setMockFromImplementation,
} from "../lib/supabase-mock"

const { schedulePreEventReminders } = await import(
  "@/lib/services/pre-event-reminders"
)

describe("schedulePreEventReminders", () => {
  beforeEach(() => resetSupabaseMocks())

  it("does not schedule reminders for a draft event", async () => {
    setMockFromImplementation((table) => {
      if (table === "hackathons") {
        return createChainableMock({
          data: {
            id: "11111111-1111-1111-1111-111111111111",
            name: "Build Day",
            slug: "build-day",
            registration_closes_at: "2026-09-01T16:00:00.000Z",
            starts_at: "2026-09-02T16:00:00.000Z",
            ends_at: "2026-09-03T16:00:00.000Z",
            created_at: "2026-08-25T16:00:00.000Z",
            status: "draft",
          },
          error: null,
        })
      }
      return createChainableMock({ data: null, error: null })
    })

    expect(
      await schedulePreEventReminders(
        "11111111-1111-1111-1111-111111111111",
      ),
    ).toBe(0)
  })
})
