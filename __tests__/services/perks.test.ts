import { describe, it, expect, beforeEach } from "bun:test"
import {
  createChainableMock,
  resetSupabaseMocks,
  setMockFromImplementation,
  mockTableQuery,
  mockSuccess,
  mockError,
} from "../lib/supabase-mock"

const {
  listPerks,
  countPerks,
  getPerkById,
  createPerk,
  updatePerk,
  deletePerk,
  releasePerkNow,
  setPerksNone,
  isPerkReleased,
  getHackathonPerksContext,
} = await import("@/lib/services/perks")

const hackathonId = "11111111-1111-1111-1111-111111111111"
const tenantId = "22222222-2222-2222-2222-222222222222"
const perkId = "33333333-3333-3333-3333-333333333333"
const sponsorId = "55555555-5555-5555-5555-555555555555"
const otherTenantId = "44444444-4444-4444-4444-444444444444"

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: perkId,
    hackathon_id: hackathonId,
    sponsor_id: null,
    name: "OpenAI credits",
    description: null,
    type: "credit",
    code: null,
    redemption_url: null,
    instructions: null,
    scheduled_release_at: null,
    released_at: null,
    sort_order: 0,
    created_at: "2026-04-28T00:00:00Z",
    updated_at: "2026-04-28T00:00:00Z",
    ...overrides,
  }
}

describe("Perks Service", () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  describe("isPerkReleased", () => {
    const now = new Date("2026-05-01T12:00:00Z")

    it("returns true when releasedAt is set", () => {
      expect(
        isPerkReleased({ releasedAt: "2026-04-28T00:00:00Z", scheduledReleaseAt: null }, null, now),
      ).toBe(true)
    })

    it("returns true when scheduledReleaseAt is in the past", () => {
      expect(
        isPerkReleased({ releasedAt: null, scheduledReleaseAt: "2026-04-30T00:00:00Z" }, null, now),
      ).toBe(true)
    })

    it("returns false when scheduledReleaseAt is in the future", () => {
      expect(
        isPerkReleased({ releasedAt: null, scheduledReleaseAt: "2026-05-02T00:00:00Z" }, null, now),
      ).toBe(false)
    })

    it("falls back to hackathon start when no schedule", () => {
      expect(
        isPerkReleased({ releasedAt: null, scheduledReleaseAt: null }, "2026-04-30T00:00:00Z", now),
      ).toBe(true)
    })

    it("returns false when event hasn't started and no schedule", () => {
      expect(
        isPerkReleased({ releasedAt: null, scheduledReleaseAt: null }, "2026-05-10T00:00:00Z", now),
      ).toBe(false)
    })

    it("returns false when nothing is set", () => {
      expect(isPerkReleased({ releasedAt: null, scheduledReleaseAt: null }, null, now)).toBe(false)
    })
  })

  describe("listPerks", () => {
    it("returns mapped perks on success", async () => {
      mockTableQuery("hackathon_perks", mockSuccess([makeRow()]))

      const result = await listPerks(hackathonId)

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe(perkId)
      expect(result[0].name).toBe("OpenAI credits")
      expect(result[0].type).toBe("credit")
    })

    it("coerces unknown type to 'other'", async () => {
      mockTableQuery("hackathon_perks", mockSuccess([makeRow({ type: "bogus" })]))

      const result = await listPerks(hackathonId)

      expect(result[0].type).toBe("other")
    })

    it("returns empty array on error", async () => {
      mockTableQuery("hackathon_perks", mockError("fail"))

      const result = await listPerks(hackathonId)

      expect(result).toEqual([])
    })
  })

  describe("countPerks", () => {
    it("returns count on success", async () => {
      mockTableQuery("hackathon_perks", { data: null, error: null, count: 3 })

      const result = await countPerks(hackathonId)

      expect(result).toBe(3)
    })

    it("returns 0 on error", async () => {
      mockTableQuery("hackathon_perks", mockError("fail"))

      const result = await countPerks(hackathonId)

      expect(result).toBe(0)
    })
  })

  describe("getPerkById", () => {
    it("returns perk on success", async () => {
      mockTableQuery("hackathon_perks", mockSuccess(makeRow()))

      const result = await getPerkById(perkId)

      expect(result).not.toBeNull()
      expect(result!.id).toBe(perkId)
    })

    it("returns null on error", async () => {
      mockTableQuery("hackathon_perks", mockError("Not found"))

      const result = await getPerkById(perkId)

      expect(result).toBeNull()
    })
  })

  describe("createPerk", () => {
    it("creates when tenant owns the hackathon", async () => {
      setMockFromImplementation((table) => {
        if (table === "hackathons") {
          return createChainableMock({ data: { id: hackathonId }, error: null })
        }
        if (table === "hackathon_perks") {
          return createChainableMock({ data: makeRow({ sort_order: 2 }), error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await createPerk(hackathonId, tenantId, { name: "New perk" })

      expect(result).not.toBeNull()
      expect(result!.name).toBe("OpenAI credits")
    })

    it("returns null when tenant does not own hackathon", async () => {
      mockTableQuery("hackathons", mockSuccess(null))

      const result = await createPerk(hackathonId, otherTenantId, { name: "X" })

      expect(result).toBeNull()
    })

    it("returns null when sponsor does not belong to hackathon", async () => {
      setMockFromImplementation((table) => {
        if (table === "hackathons") {
          return createChainableMock({ data: { id: hackathonId }, error: null })
        }
        if (table === "hackathon_sponsors") {
          return createChainableMock({ data: null, error: { message: "not found" } })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await createPerk(hackathonId, tenantId, { name: "X", sponsorId })

      expect(result).toBeNull()
    })

    it("returns null when insert fails", async () => {
      setMockFromImplementation((table) => {
        if (table === "hackathons") {
          return createChainableMock({ data: { id: hackathonId }, error: null })
        }
        if (table === "hackathon_perks") {
          return createChainableMock({ data: null, error: { message: "fail" } })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await createPerk(hackathonId, tenantId, { name: "X" })

      expect(result).toBeNull()
    })
  })

  describe("updatePerk", () => {
    it("updates when tenant owns the perk", async () => {
      setMockFromImplementation((table) => {
        if (table === "hackathon_perks") {
          return createChainableMock({
            data: {
              ...makeRow({ name: "Updated" }),
              hackathon_id: hackathonId,
              hackathons: { tenant_id: tenantId },
            },
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await updatePerk(perkId, tenantId, { name: "Updated" })

      expect(result).not.toBeNull()
      expect(result!.name).toBe("Updated")
    })

    it("returns null when tenant does not own the perk", async () => {
      setMockFromImplementation((table) => {
        if (table === "hackathon_perks") {
          return createChainableMock({
            data: {
              hackathon_id: hackathonId,
              hackathons: { tenant_id: otherTenantId },
            },
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await updatePerk(perkId, tenantId, { name: "X" })

      expect(result).toBeNull()
    })
  })

  describe("deletePerk", () => {
    it("deletes when tenant owns the perk", async () => {
      setMockFromImplementation((table) => {
        if (table === "hackathon_perks") {
          return createChainableMock({
            data: {
              hackathon_id: hackathonId,
              hackathons: { tenant_id: tenantId },
            },
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await deletePerk(perkId, tenantId)

      expect(result).toBe(true)
    })

    it("returns false when tenant does not own the perk", async () => {
      setMockFromImplementation((table) => {
        if (table === "hackathon_perks") {
          return createChainableMock({
            data: {
              hackathon_id: hackathonId,
              hackathons: { tenant_id: otherTenantId },
            },
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await deletePerk(perkId, tenantId)

      expect(result).toBe(false)
    })
  })

  describe("releasePerkNow", () => {
    it("sets released_at when tenant owns the perk", async () => {
      setMockFromImplementation((table) => {
        if (table === "hackathon_perks") {
          return createChainableMock({
            data: {
              ...makeRow({ released_at: "2026-05-01T00:00:00Z" }),
              hackathon_id: hackathonId,
              hackathons: { tenant_id: tenantId },
            },
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await releasePerkNow(perkId, tenantId)

      expect(result).not.toBeNull()
      expect(result!.releasedAt).toBe("2026-05-01T00:00:00Z")
    })

    it("returns null when tenant does not own the perk", async () => {
      setMockFromImplementation((table) => {
        if (table === "hackathon_perks") {
          return createChainableMock({
            data: {
              hackathon_id: hackathonId,
              hackathons: { tenant_id: otherTenantId },
            },
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await releasePerkNow(perkId, tenantId)

      expect(result).toBeNull()
    })
  })

  describe("setPerksNone", () => {
    it("returns true on success", async () => {
      mockTableQuery("hackathons", mockSuccess(null))

      const result = await setPerksNone(hackathonId, tenantId, true)

      expect(result).toBe(true)
    })

    it("returns false on error", async () => {
      mockTableQuery("hackathons", mockError("fail"))

      const result = await setPerksNone(hackathonId, tenantId, true)

      expect(result).toBe(false)
    })
  })

  describe("getHackathonPerksContext", () => {
    it("returns startsAt + perksNone on success", async () => {
      mockTableQuery(
        "hackathons",
        mockSuccess({ starts_at: "2026-06-01T00:00:00Z", perks_none: false }),
      )

      const result = await getHackathonPerksContext(hackathonId)

      expect(result).not.toBeNull()
      expect(result!.startsAt).toBe("2026-06-01T00:00:00Z")
      expect(result!.perksNone).toBe(false)
    })

    it("returns null on error", async () => {
      mockTableQuery("hackathons", mockError("Not found"))

      const result = await getHackathonPerksContext(hackathonId)

      expect(result).toBeNull()
    })
  })
})
