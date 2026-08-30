import { describe, it, expect, beforeEach, mock } from "bun:test"
import {
  createChainableMock,
  resetSupabaseMocks,
  setMockFromImplementation,
} from "../lib/supabase-mock"

const mockSendSponsorClaimNotification = mock(() => Promise.resolve(1))
const mockSendOrganizerClaimNotification = mock(() => Promise.resolve(1))
const mockSendPrizeShippedEmail = mock(() => Promise.resolve(true))

mock.module("@/lib/email/sponsor-notifications", () => ({
  sendSponsorClaimNotification: mockSendSponsorClaimNotification,
}))

mock.module("@/lib/email/organizer-notifications", () => ({
  sendOrganizerClaimNotification: mockSendOrganizerClaimNotification,
}))

mock.module("@/lib/email/prize-shipped", () => ({
  sendPrizeShippedEmail: mockSendPrizeShippedEmail,
}))

function setClaimWithSponsorMock(isTestEvent = false): void {
  let fulfillmentCall = 0
  setMockFromImplementation((table) => {
    if (table === "prize_fulfillments") {
      fulfillmentCall += 1
      if (fulfillmentCall === 1) {
        return createChainableMock({
          data: {
            id: "f1",
            status: "assigned",
            hackathon_id: "h1",
            prize_assignment_id: "pa1",
            claim_token_expires_at: "2027-01-01T00:00:00Z",
            prize_assignment: {
              prize: {
                name: "Grand Prize",
                kind: "physical",
                value: "$500",
                prize_track: {
                  sponsor: { sponsor_tenant_id: "sponsor-tenant" },
                },
              },
            },
          },
          error: null,
        })
      }
      return createChainableMock({ data: [{ id: "f1" }], error: null })
    }
    if (table === "hackathons") {
      return createChainableMock({
        data: { name: "AI Hack", slug: "ai-hack", is_test_event: isTestEvent },
        error: null,
      })
    }
    return createChainableMock({ data: null, error: null })
  })
}

const {
  initializeFulfillments,
  listFulfillments,
  updateFulfillmentStatus,
  getFulfillmentSummary,
  getClaimByToken,
  claimPrize,
  getClaimTokensForHackathon,
  getSiblingClaims,
} = await import("@/lib/services/prize-fulfillment")

describe("Prize Fulfillment Service", () => {
  beforeEach(() => {
    resetSupabaseMocks()
    mockSendSponsorClaimNotification.mockReset()
    mockSendSponsorClaimNotification.mockImplementation(() => Promise.resolve(1))
    mockSendOrganizerClaimNotification.mockReset()
    mockSendOrganizerClaimNotification.mockImplementation(() => Promise.resolve(1))
    mockSendPrizeShippedEmail.mockReset()
    mockSendPrizeShippedEmail.mockImplementation(() => Promise.resolve(true))
  })

  describe("initializeFulfillments", () => {
    it("does not create claim tokens for a test event", async () => {
      const prizes = createChainableMock({
        data: [{ id: "p1", hackathons: { is_test_event: true } }],
        error: null,
      })
      setMockFromImplementation(() => prizes)

      const count = await initializeFulfillments("11111111-1111-1111-1111-111111111111")

      expect(count).toBe(0)
      expect(prizes.insert).not.toHaveBeenCalled()
    })

    it("returns 0 when no prizes exist", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: [], error: null })
      )

      const count = await initializeFulfillments("11111111-1111-1111-1111-111111111111")
      expect(count).toBe(0)
    })

    it("returns 0 when no assignments exist", async () => {
      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createChainableMock({ data: [{ id: "p1" }], error: null })
        }
        return createChainableMock({ data: [], error: null })
      })

      const count = await initializeFulfillments("11111111-1111-1111-1111-111111111111")
      expect(count).toBe(0)
    })

    it("creates fulfillments for new assignments", async () => {
      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createChainableMock({ data: [{ id: "p1" }], error: null })
        }
        if (callCount === 2) {
          return createChainableMock({ data: [{ id: "a1" }, { id: "a2" }], error: null })
        }
        if (callCount === 3) {
          return createChainableMock({ data: [], error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const count = await initializeFulfillments("11111111-1111-1111-1111-111111111111")
      expect(count).toBe(2)
    })

    it("skips already-initialized assignments", async () => {
      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createChainableMock({ data: [{ id: "p1" }], error: null })
        }
        if (callCount === 2) {
          return createChainableMock({ data: [{ id: "a1" }, { id: "a2" }], error: null })
        }
        if (callCount === 3) {
          return createChainableMock({ data: [{ prize_assignment_id: "a1" }], error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const count = await initializeFulfillments("11111111-1111-1111-1111-111111111111")
      expect(count).toBe(1)
    })

    it("returns 0 on insert error", async () => {
      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createChainableMock({ data: [{ id: "p1" }], error: null })
        }
        if (callCount === 2) {
          return createChainableMock({ data: [{ id: "a1" }], error: null })
        }
        if (callCount === 3) {
          return createChainableMock({ data: [], error: null })
        }
        return createChainableMock({ data: null, error: { message: "insert failed" } })
      })

      const count = await initializeFulfillments("11111111-1111-1111-1111-111111111111")
      expect(count).toBe(0)
    })
  })

  describe("updateFulfillmentStatus", () => {
    it("returns null when fulfillment not found", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: null, error: null })
      )

      const result = await updateFulfillmentStatus(
        "11111111-1111-1111-1111-111111111111",
        "22222222-2222-2222-2222-222222222222",
        "contacted"
      )
      expect(result).toBeNull()
    })

    it("returns null on invalid transition", async () => {
      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createChainableMock({ data: { status: "claimed" }, error: null })
        }
        return createChainableMock({ data: null, error: null })
      })

      const result = await updateFulfillmentStatus(
        "11111111-1111-1111-1111-111111111111",
        "22222222-2222-2222-2222-222222222222",
        "contacted"
      )
      expect(result).toBeNull()
    })

    it("updates status with valid transition", async () => {
      let callCount = 0
      const updatedData = {
        id: "11111111-1111-1111-1111-111111111111",
        status: "contacted",
        contacted_at: new Date().toISOString(),
      }
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createChainableMock({ data: { status: "assigned" }, error: null })
        }
        return createChainableMock({ data: updatedData, error: null })
      })

      const result = await updateFulfillmentStatus(
        "11111111-1111-1111-1111-111111111111",
        "22222222-2222-2222-2222-222222222222",
        "contacted",
        { notes: "Sent email" }
      )
      expect(result).not.toBeNull()
      expect(result!.status).toBe("contacted")
    })

    it("allows skipping statuses (assigned -> shipped)", async () => {
      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createChainableMock({ data: { status: "assigned" }, error: null })
        }
        return createChainableMock({
          data: { id: "f1", status: "shipped" },
          error: null,
        })
      })

      const result = await updateFulfillmentStatus(
        "11111111-1111-1111-1111-111111111111",
        "22222222-2222-2222-2222-222222222222",
        "shipped"
      )
      expect(result).not.toBeNull()
      expect(result!.status).toBe("shipped")
    })

    it("does not send shipping email for a test event", async () => {
      let fulfillmentCalls = 0
      setMockFromImplementation((table) => {
        if (table === "prize_fulfillments") {
          fulfillmentCalls++
          return createChainableMock({
            data: {
              id: "f1",
              status: fulfillmentCalls === 1 ? "assigned" : "shipped",
              prize_assignment_id: "pa1",
              recipient_email: "winner@example.com",
              recipient_name: "Winner",
              tracking_number: "track-1",
            },
            error: null,
          })
        }
        if (table === "prize_assignments") {
          return createChainableMock({ data: { prize: { name: "Prize" } }, error: null })
        }
        if (table === "hackathons") {
          return createChainableMock({
            data: { name: "Practice Event", slug: "practice-event", is_test_event: true },
            error: null,
          })
        }
        return createChainableMock({ data: null, error: null })
      })

      await expect(updateFulfillmentStatus("f1", "h1", "shipped", {
        trackingNumber: "track-1",
      })).resolves.not.toBeNull()
      expect(mockSendPrizeShippedEmail).not.toHaveBeenCalled()
    })
  })

  describe("getFulfillmentSummary", () => {
    it("returns zero counts when no fulfillments", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: [], error: null })
      )

      const summary = await getFulfillmentSummary("11111111-1111-1111-1111-111111111111")
      expect(summary).toEqual({ assigned: 0, contacted: 0, shipped: 0, claimed: 0 })
    })

    it("counts fulfillments by status", async () => {
      setMockFromImplementation(() =>
        createChainableMock({
          data: [
            { status: "assigned" },
            { status: "assigned" },
            { status: "contacted" },
            { status: "shipped" },
            { status: "claimed" },
            { status: "claimed" },
          ],
          error: null,
        })
      )

      const summary = await getFulfillmentSummary("11111111-1111-1111-1111-111111111111")
      expect(summary).toEqual({ assigned: 2, contacted: 1, shipped: 1, claimed: 2 })
    })

    it("returns zero counts on error", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: null, error: { message: "DB error" } })
      )

      const summary = await getFulfillmentSummary("11111111-1111-1111-1111-111111111111")
      expect(summary).toEqual({ assigned: 0, contacted: 0, shipped: 0, claimed: 0 })
    })
  })

  describe("listFulfillments", () => {
    it("returns empty array when no fulfillments", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: [], error: null })
      )

      const result = await listFulfillments("11111111-1111-1111-1111-111111111111")
      expect(result).toEqual([])
    })

    it("returns empty array on error", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: null, error: { message: "DB error" } })
      )

      const result = await listFulfillments("11111111-1111-1111-1111-111111111111")
      expect(result).toEqual([])
    })
  })

  describe("getClaimByToken", () => {
    it("returns null when token not found", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: null, error: { message: "Not found" } })
      )

      const result = await getClaimByToken("invalid-token")
      expect(result).toBeNull()
    })

    it("returns claim details for valid token including prizeKind", async () => {
      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createChainableMock({
            data: {
              id: "f1",
              status: "assigned",
              recipient_name: null,
              recipient_email: null,
              shipping_address: null,
              claimed_at: null,
              claim_token_expires_at: "2026-05-01T00:00:00Z",
              prize_assignment: {
                prize: { name: "Best Demo", value: "$500", kind: "cash", distribution_method: null },
                submission: { title: "Cool Project", team_id: "t1", hackathon_id: "h1" },
              },
            },
            error: null,
          })
        }
        if (callCount === 2) {
          return createChainableMock({
            data: { name: "Test Hackathon", slug: "test-hack" },
            error: null,
          })
        }
        return createChainableMock({
          data: { name: "Team Alpha" },
          error: null,
        })
      })

      const result = await getClaimByToken("valid-token")
      expect(result).not.toBeNull()
      expect(result!.prizeName).toBe("Best Demo")
      expect(result!.prizeValue).toBe("$500")
      expect(result!.prizeKind).toBe("cash")
      expect(result!.distributionMethod).toBeNull()
      expect(result!.hackathonName).toBe("Test Hackathon")
      expect(result!.submissionTitle).toBe("Cool Project")
      expect(result!.teamName).toBe("Team Alpha")
      expect(result!.status).toBe("assigned")
    })
  })

  describe("claimPrize", () => {
    it("returns not_found when token does not exist", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: null, error: { message: "Not found" } })
      )

      const result = await claimPrize("bad-token", {
        recipientName: "Alice",
        recipientEmail: "alice@test.com",
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.code).toBe("not_found")
      }
    })

    it("returns expired when token is past expiry", async () => {
      setMockFromImplementation(() =>
        createChainableMock({
          data: {
            id: "f1",
            status: "assigned",
            hackathon_id: "h1",
            claim_token_expires_at: "2020-01-01T00:00:00Z",
          },
          error: null,
        })
      )

      const result = await claimPrize("expired-token", {
        recipientName: "Alice",
        recipientEmail: "alice@test.com",
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.code).toBe("expired")
      }
    })

    it("returns already_claimed when prize is already claimed", async () => {
      setMockFromImplementation(() =>
        createChainableMock({
          data: {
            id: "f1",
            status: "claimed",
            hackathon_id: "h1",
            claim_token_expires_at: "2027-01-01T00:00:00Z",
          },
          error: null,
        })
      )

      const result = await claimPrize("claimed-token", {
        recipientName: "Alice",
        recipientEmail: "alice@test.com",
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.code).toBe("already_claimed")
      }
    })

    it("successfully claims a prize", async () => {
      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createChainableMock({
            data: {
              id: "f1",
              status: "assigned",
              hackathon_id: "h1",
              prize_assignment_id: "pa1",
              claim_token_expires_at: "2027-01-01T00:00:00Z",
            },
            error: null,
          })
        }
        return createChainableMock({ data: [{ id: "f1" }], error: null })
      })

      const result = await claimPrize("valid-token", {
        recipientName: "Alice",
        recipientEmail: "alice@test.com",
        shippingAddress: "123 Main St",
      })
      expect(result.success).toBe(true)
    })

    it("finishes the sponsor fan-out before starting organizer delivery", async () => {
      setClaimWithSponsorMock()

      let finishSponsor: ((sent: number) => void) | undefined
      let markSponsorStarted: (() => void) | undefined
      const sponsorStarted = new Promise<void>((resolve) => {
        markSponsorStarted = resolve
      })
      let markOrganizerStarted: (() => void) | undefined
      const organizerStarted = new Promise<void>((resolve) => {
        markOrganizerStarted = resolve
      })
      mockSendSponsorClaimNotification.mockImplementationOnce(() => {
        markSponsorStarted?.()
        return new Promise<number>((resolve) => {
          finishSponsor = resolve
        })
      })
      mockSendOrganizerClaimNotification.mockImplementationOnce(() => {
        markOrganizerStarted?.()
        return Promise.resolve(1)
      })

      const resultPromise = claimPrize("valid-token", {
        recipientName: "Alice",
        recipientEmail: "alice@test.com",
      })

      await sponsorStarted
      expect(mockSendOrganizerClaimNotification).not.toHaveBeenCalled()
      finishSponsor?.(1)
      const result = await resultPromise
      expect(result.success).toBe(true)
      await organizerStarted
      expect(mockSendOrganizerClaimNotification).toHaveBeenCalledTimes(1)
    })

    it("still notifies organizers when the sponsor fan-out rejects", async () => {
      setClaimWithSponsorMock()

      let markOrganizerStarted: (() => void) | undefined
      const organizerStarted = new Promise<void>((resolve) => {
        markOrganizerStarted = resolve
      })
      mockSendSponsorClaimNotification.mockImplementationOnce(() =>
        Promise.reject(new Error("Sponsor provider unavailable"))
      )
      mockSendOrganizerClaimNotification.mockImplementationOnce(() => {
        markOrganizerStarted?.()
        return Promise.resolve(1)
      })

      const result = await claimPrize("valid-token", {
        recipientName: "Alice",
        recipientEmail: "alice@test.com",
      })

      expect(result.success).toBe(true)
      await organizerStarted
      expect(mockSendSponsorClaimNotification).toHaveBeenCalledTimes(1)
      expect(mockSendOrganizerClaimNotification).toHaveBeenCalledTimes(1)
    })

    it("does not send sponsor or organizer claim emails for a test event", async () => {
      setClaimWithSponsorMock(true)

      await expect(claimPrize("valid-token", {
        recipientName: "Alice",
        recipientEmail: "alice@test.com",
      })).resolves.toEqual({ success: true })
      expect(mockSendSponsorClaimNotification).not.toHaveBeenCalled()
      expect(mockSendOrganizerClaimNotification).not.toHaveBeenCalled()
    })

    it("successfully claims with payment fields", async () => {
      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createChainableMock({
            data: {
              id: "f1",
              status: "assigned",
              hackathon_id: "h1",
              prize_assignment_id: "pa1",
              claim_token_expires_at: "2027-01-01T00:00:00Z",
            },
            error: null,
          })
        }
        return createChainableMock({ data: [{ id: "f1" }], error: null })
      })

      const result = await claimPrize("valid-token", {
        recipientName: "Bob",
        recipientEmail: "bob@test.com",
        paymentMethod: "venmo",
        paymentDetail: "@bob123",
      })
      expect(result.success).toBe(true)
    })

    it("returns update_failed on database error", async () => {
      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createChainableMock({
            data: {
              id: "f1",
              status: "assigned",
              hackathon_id: "h1",
              claim_token_expires_at: "2027-01-01T00:00:00Z",
            },
            error: null,
          })
        }
        return createChainableMock({ data: null, error: { message: "DB error" } })
      })

      const result = await claimPrize("valid-token", {
        recipientName: "Alice",
        recipientEmail: "alice@test.com",
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.code).toBe("update_failed")
      }
    })
  })

  describe("getClaimTokensForHackathon", () => {
    it("returns empty object when no tokens exist", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: [], error: null })
      )

      const result = await getClaimTokensForHackathon("11111111-1111-1111-1111-111111111111")
      expect(result).toEqual({})
    })

    it("returns token map indexed by prize_assignment_id", async () => {
      setMockFromImplementation(() =>
        createChainableMock({
          data: [
            { prize_assignment_id: "a1", claim_token: "tok-1" },
            { prize_assignment_id: "a2", claim_token: "tok-2" },
          ],
          error: null,
        })
      )

      const result = await getClaimTokensForHackathon("11111111-1111-1111-1111-111111111111")
      expect(result).toEqual({ a1: "tok-1", a2: "tok-2" })
    })

    it("returns empty object on error", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: null, error: { message: "DB error" } })
      )

      const result = await getClaimTokensForHackathon("11111111-1111-1111-1111-111111111111")
      expect(result).toEqual({})
    })
  })

  describe("getSiblingClaims", () => {
    it("returns siblings for the same submission", async () => {
      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createChainableMock({
            data: { prize_assignment: { submission_id: "sub-1" } },
            error: null,
          })
        }
        if (callCount === 2) {
          return createChainableMock({
            data: [{ id: "a1" }, { id: "a2" }],
            error: null,
          })
        }
        return createChainableMock({
          data: [
            {
              id: "f1",
              status: "assigned",
              claim_token: "tok-1",
              claim_token_expires_at: new Date(Date.now() + 86400000).toISOString(),
              recipient_name: null,
              recipient_email: null,
              shipping_address: null,
              prize_assignment: {
                prize: { name: "Grand Prize", value: "$1000", kind: "cash", distribution_method: null },
              },
            },
            {
              id: "f2",
              status: "claimed",
              claim_token: "tok-2",
              claim_token_expires_at: null,
              recipient_name: "Alice",
              recipient_email: "alice@example.com",
              shipping_address: null,
              prize_assignment: {
                prize: { name: "Runner Up", value: "$500", kind: "cash", distribution_method: null },
              },
            },
          ],
          error: null,
        })
      })

      const result = await getSiblingClaims("tok-1")
      expect(result).toHaveLength(2)
      expect(result[0].token).toBe("tok-1")
      expect(result[0].prizeName).toBe("Grand Prize")
      expect(result[0].isExpired).toBe(false)
      expect(result[1].token).toBe("tok-2")
      expect(result[1].status).toBe("claimed")
    })

    it("returns empty array when fulfillment not found", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: null, error: null })
      )

      const result = await getSiblingClaims("nonexistent-token")
      expect(result).toEqual([])
    })

    it("returns empty array when no assignments exist", async () => {
      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createChainableMock({
            data: { prize_assignment: { submission_id: "sub-1" } },
            error: null,
          })
        }
        return createChainableMock({ data: [], error: null })
      })

      const result = await getSiblingClaims("tok-1")
      expect(result).toEqual([])
    })

    it("does not return sibling claims through an expired token", async () => {
      setMockFromImplementation(() => createChainableMock({ data: null, error: null }))

      const result = await getSiblingClaims("tok-expired")
      expect(result).toEqual([])
    })
  })
})
