import { describe, it, expect, beforeEach } from "bun:test"
import {
  createChainableMock,
  resetSupabaseMocks,
  setMockFromImplementation,
  mockSuccess,
  mockError,
} from "../lib/supabase-mock"

const {
  createMentorRequest,
  listMentorQueue,
  claimRequest,
  resolveRequest,
  cancelRequest,
  getQueueStats,
  getMentorParticipantId,
} = await import("@/lib/services/mentor-requests")

const HACKATHON_ID = "11111111-1111-1111-1111-111111111111"
const PARTICIPANT_ID = "22222222-2222-2222-2222-222222222222"
const MENTOR_ID = "33333333-3333-3333-3333-333333333333"
const REQUEST_ID = "44444444-4444-4444-4444-444444444444"
const TEAM_ID = "55555555-5555-5555-5555-555555555555"

describe("mentor-requests service", () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  describe("createMentorRequest", () => {
    it("creates a request", async () => {
      const req = { id: REQUEST_ID, hackathon_id: HACKATHON_ID, team_id: TEAM_ID, requester_participant_id: PARTICIPANT_ID, category: "Technical", description: "Need help with API", status: "open", claimed_by_participant_id: null, claimed_at: null, resolved_at: null, created_at: "2026-04-01" }
      setMockFromImplementation(() => createChainableMock(mockSuccess(req)))

      const result = await createMentorRequest(HACKATHON_ID, PARTICIPANT_ID, TEAM_ID, { category: "Technical", description: "Need help with API" })
      expect(result).not.toBeNull()
      expect(result!.category).toBe("Technical")
    })

    it("returns null on error", async () => {
      setMockFromImplementation(() => createChainableMock(mockError("Failed")))
      const result = await createMentorRequest(HACKATHON_ID, PARTICIPANT_ID, null, {})
      expect(result).toBeNull()
    })

    it("rejects malformed IDs before querying the database", async () => {
      expect(await createMentorRequest("not-an-id", PARTICIPANT_ID, null, {})).toBeNull()
    })
  })

  describe("listMentorQueue", () => {
    it("returns queue with team names", async () => {
      const requests = [
        { id: REQUEST_ID, hackathon_id: HACKATHON_ID, team_id: TEAM_ID, requester_participant_id: PARTICIPANT_ID, category: "UI", description: null, status: "open", claimed_by_participant_id: null, claimed_at: null, resolved_at: null, created_at: "2026-04-01" },
      ]
      const teams = [{ id: TEAM_ID, name: "Team Alpha" }]

      setMockFromImplementation((table) => {
        if (table === "mentor_requests") return createChainableMock(mockSuccess(requests))
        if (table === "teams") return createChainableMock(mockSuccess(teams))
        return createChainableMock(mockSuccess(null))
      })

      const result = await listMentorQueue(HACKATHON_ID)
      expect(result).toHaveLength(1)
      expect(result[0].team_name).toBe("Team Alpha")
    })

    it("returns empty on error", async () => {
      setMockFromImplementation(() => createChainableMock(mockError("Failed")))
      const result = await listMentorQueue(HACKATHON_ID)
      expect(result).toEqual([])
    })
  })

  describe("claimRequest", () => {
    it("claims an open request", async () => {
      setMockFromImplementation(() => createChainableMock(mockSuccess({ id: REQUEST_ID })))
      expect(await claimRequest(REQUEST_ID, MENTOR_ID, HACKATHON_ID)).toBe(true)
    })

    it("returns false on error", async () => {
      setMockFromImplementation(() => createChainableMock(mockError("Failed")))
      expect(await claimRequest(REQUEST_ID, MENTOR_ID, HACKATHON_ID)).toBe(false)
    })

    it("returns false when another mentor already claimed it", async () => {
      setMockFromImplementation(() => createChainableMock(mockSuccess(null)))
      expect(await claimRequest(REQUEST_ID, MENTOR_ID, HACKATHON_ID)).toBe(false)
    })
  })

  describe("resolveRequest", () => {
    it("resolves a claimed request", async () => {
      setMockFromImplementation(() => createChainableMock(mockSuccess({ id: REQUEST_ID })))
      expect(await resolveRequest(REQUEST_ID, MENTOR_ID, HACKATHON_ID)).toBe(true)
    })

    it("does not resolve a request from another hackathon", async () => {
      setMockFromImplementation(() => createChainableMock(mockSuccess(null)))
      expect(await resolveRequest(REQUEST_ID, MENTOR_ID, HACKATHON_ID)).toBe(false)
    })
  })

  describe("cancelRequest", () => {
    it("cancels own request", async () => {
      setMockFromImplementation(() => createChainableMock(mockSuccess({ id: REQUEST_ID })))
      expect(await cancelRequest(REQUEST_ID, PARTICIPANT_ID)).toBe(true)
    })

    it("rejects malformed IDs", async () => {
      expect(await cancelRequest("not-an-id", PARTICIPANT_ID)).toBe(false)
    })
  })

  describe("getMentorParticipantId", () => {
    it("returns the mentor participant for this hackathon", async () => {
      setMockFromImplementation(() => createChainableMock(mockSuccess({ id: MENTOR_ID })))
      expect(await getMentorParticipantId(HACKATHON_ID, "user_mentor")).toBe(MENTOR_ID)
    })

    it("returns null for participants who are not mentors", async () => {
      setMockFromImplementation(() => createChainableMock(mockSuccess(null)))
      expect(await getMentorParticipantId(HACKATHON_ID, "user_attendee")).toBeNull()
    })
  })

  describe("getQueueStats", () => {
    it("returns counts by status", async () => {
      setMockFromImplementation(() => createChainableMock({ data: null, error: null, count: 5 }))
      const stats = await getQueueStats(HACKATHON_ID)
      expect(stats.open).toBe(5)
      expect(stats.claimed).toBe(5)
      expect(stats.resolved).toBe(5)
    })
  })
})
