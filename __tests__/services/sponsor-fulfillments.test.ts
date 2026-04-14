import { describe, it, expect, beforeEach, afterAll } from "bun:test"
import {
  createChainableMock,
  resetSupabaseMocks,
  setMockFromImplementation,
} from "../lib/supabase-mock"

const TEST_ENCRYPTION_KEY = "0".repeat(64)
const originalEncryptionKey = process.env.ENCRYPTION_KEY
process.env.ENCRYPTION_KEY = TEST_ENCRYPTION_KEY

const { encryptToken } = await import("@/lib/services/encryption")
const { listSponsorFulfillments, markSponsorFulfilled } = await import("@/lib/services/sponsor-fulfillments")

afterAll(() => {
  if (originalEncryptionKey === undefined) {
    delete process.env.ENCRYPTION_KEY
  } else {
    process.env.ENCRYPTION_KEY = originalEncryptionKey
  }
})

describe("Sponsor Fulfillments Service", () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  describe("listSponsorFulfillments", () => {
    it("returns empty array when sponsor not found", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: null, error: { message: "Not found" } })
      )

      const result = await listSponsorFulfillments("tenant-1", "hack-1")
      expect(result).toEqual([])
    })

    it("returns empty array when no tracks linked to sponsor", async () => {
      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createChainableMock({ data: { id: "sponsor-1" }, error: null })
        }
        return createChainableMock({ data: [], error: null })
      })

      const result = await listSponsorFulfillments("tenant-1", "hack-1")
      expect(result).toEqual([])
    })

    it("returns empty array when no prizes in sponsor tracks", async () => {
      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createChainableMock({ data: { id: "sponsor-1" }, error: null })
        }
        if (callCount === 2) {
          return createChainableMock({ data: [{ prizes: [] }], error: null })
        }
        return createChainableMock({ data: [], error: null })
      })

      const result = await listSponsorFulfillments("tenant-1", "hack-1")
      expect(result).toEqual([])
    })

    it("strips PII from unclaimed fulfillments but shows it for claimed ones", async () => {
      const encryptedPaymentDetail = encryptToken("visible@paypal.com")
      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createChainableMock({ data: { id: "sponsor-1" }, error: null })
        }
        if (callCount === 2) {
          return createChainableMock({
            data: [{ prizes: [{ prize_assignments: [{ id: "assign-1" }] }] }],
            error: null,
          })
        }
        if (callCount === 3) {
          return createChainableMock({
            data: [
              {
                id: "f-assigned",
                status: "assigned",
                recipient_name: "Secret Name",
                recipient_email: "secret@example.com",
                shipping_address: "123 Secret St",
                payment_method: "venmo",
                payment_detail: "@secret",
                tracking_number: null,
                claimed_at: null,
                prize_assignment: {
                  prize: { name: "Prize A", value: "$100" },
                  submission: { title: "Sub 1", team_id: null },
                },
              },
              {
                id: "f-claimed",
                status: "claimed",
                recipient_name: "Visible Name",
                recipient_email: "visible@example.com",
                shipping_address: "456 Public Ave",
                payment_method: "paypal",
                payment_detail: encryptedPaymentDetail,
                tracking_number: null,
                claimed_at: "2026-04-01T00:00:00Z",
                prize_assignment: {
                  prize: { name: "Prize B", value: "$200" },
                  submission: { title: "Sub 2", team_id: null },
                },
              },
            ],
            error: null,
          })
        }
        return createChainableMock({ data: [], error: null })
      })

      const result = await listSponsorFulfillments("tenant-1", "hack-1")
      expect(result).toHaveLength(2)

      const assigned = result.find((f) => f.fulfillmentId === "f-assigned")!
      expect(assigned.recipientName).toBeNull()
      expect(assigned.recipientEmail).toBeNull()
      expect(assigned.shippingAddress).toBeNull()
      expect(assigned.paymentMethod).toBeNull()
      expect(assigned.paymentDetail).toBeNull()

      const claimed = result.find((f) => f.fulfillmentId === "f-claimed")!
      expect(claimed.recipientName).toBe("Visible Name")
      expect(claimed.recipientEmail).toBe("visible@example.com")
      expect(claimed.shippingAddress).toBe("456 Public Ave")
      expect(claimed.paymentMethod).toBe("paypal")
      expect(claimed.paymentDetail).toBe("visible@paypal.com")
    })
  })

  describe("markSponsorFulfilled", () => {
    it("returns false when sponsor not found", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: null, error: { message: "Not found" } })
      )

      const result = await markSponsorFulfilled("tenant-1", "hack-1", "fulfill-1")
      expect(result).toBe(false)
    })

    it("returns false when fulfillment not found", async () => {
      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createChainableMock({ data: { id: "sponsor-1" }, error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await markSponsorFulfilled("tenant-1", "hack-1", "fulfill-1")
      expect(result).toBe(false)
    })

    it("returns false when prize has no track", async () => {
      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createChainableMock({ data: { id: "sponsor-1" }, error: null })
        }
        if (callCount === 2) {
          return createChainableMock({
            data: {
              id: "fulfill-1",
              status: "claimed",
              prize_assignment: { prize: { prize_track_id: null } },
            },
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await markSponsorFulfilled("tenant-1", "hack-1", "fulfill-1")
      expect(result).toBe(false)
    })

    it("returns false when track belongs to a different sponsor", async () => {
      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createChainableMock({ data: { id: "sponsor-1" }, error: null })
        }
        if (callCount === 2) {
          return createChainableMock({
            data: {
              id: "fulfill-1",
              status: "claimed",
              prize_assignment: { prize: { prize_track_id: "track-1" } },
            },
            error: null,
          })
        }
        if (callCount === 3) {
          return createChainableMock({
            data: { sponsor_id: "different-sponsor" },
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await markSponsorFulfilled("tenant-1", "hack-1", "fulfill-1")
      expect(result).toBe(false)
    })

    it("returns true when ownership is valid and status is claimed", async () => {
      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createChainableMock({ data: { id: "sponsor-1" }, error: null })
        }
        if (callCount === 2) {
          return createChainableMock({
            data: {
              id: "fulfill-1",
              status: "claimed",
              prize_assignment: { prize: { prize_track_id: "track-1" } },
            },
            error: null,
          })
        }
        if (callCount === 3) {
          return createChainableMock({
            data: { sponsor_id: "sponsor-1" },
            error: null,
          })
        }
        if (callCount === 4) {
          return createChainableMock({ data: { status: "claimed" }, error: null })
        }
        return createChainableMock({
          data: { id: "fulfill-1", status: "shipped", recipient_email: null },
          error: null,
        })
      })

      const result = await markSponsorFulfilled("tenant-1", "hack-1", "fulfill-1", "TRACK123")
      expect(result).toBe(true)
    })

    it("returns false when fulfillment is not in claimed status", async () => {
      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createChainableMock({ data: { id: "sponsor-1" }, error: null })
        }
        if (callCount === 2) {
          return createChainableMock({
            data: {
              id: "fulfill-1",
              status: "assigned",
              prize_assignment: { prize: { prize_track_id: "track-1" } },
            },
            error: null,
          })
        }
        if (callCount === 3) {
          return createChainableMock({
            data: { sponsor_id: "sponsor-1" },
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await markSponsorFulfilled("tenant-1", "hack-1", "fulfill-1")
      expect(result).toBe(false)
    })
  })
})
