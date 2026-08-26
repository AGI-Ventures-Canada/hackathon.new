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
  getActiveMentorRequest,
  getMentorQueuePage,
  listMentorQueue,
  claimRequest,
  resolveRequest,
  cancelRequest,
  getQueueStats,
  getMentorParticipantId,
  MENTOR_QUEUE_MAX_ITEMS,
} = await import("@/lib/services/mentor-requests")

const HACKATHON_ID = "11111111-1111-1111-1111-111111111111"
const PARTICIPANT_ID = "22222222-2222-2222-2222-222222222222"
const MENTOR_ID = "33333333-3333-3333-3333-333333333333"
const REQUEST_ID = "44444444-4444-4444-4444-444444444444"
const TEAM_ID = "55555555-5555-5555-5555-555555555555"

function setMentorCreateMock(
  implementation: (call: number) => ReturnType<typeof createChainableMock>,
): void {
  let mentorRequestCall = 0
  setMockFromImplementation((table) => {
    if (table === "rate_limits") {
      return createChainableMock(mockSuccess(null))
    }
    mentorRequestCall += 1
    return implementation(mentorRequestCall)
  })
}

describe("mentor-requests service", () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  describe("createMentorRequest", () => {
    it("creates a request", async () => {
      const req = { id: REQUEST_ID, hackathon_id: HACKATHON_ID, team_id: TEAM_ID, requester_participant_id: PARTICIPANT_ID, category: "Technical", description: "Need help with API", status: "open", claimed_by_participant_id: null, claimed_at: null, resolved_at: null, created_at: "2026-04-01" }
      setMentorCreateMock((call) => {
        if (call === 1) return createChainableMock(mockSuccess(null))
        if (call === 2) return createChainableMock({ data: null, error: null, count: 0 })
        if (call === 3) return createChainableMock(mockSuccess(req))
        return createChainableMock(mockSuccess([req]))
      })

      const result = await createMentorRequest(HACKATHON_ID, PARTICIPANT_ID, TEAM_ID, { category: "Technical", description: "Need help with API" })
      expect(result.success).toBe(true)
      if (result.success) expect(result.request.category).toBe("Technical")
    })

    it("returns a stable database error", async () => {
      setMockFromImplementation(() => createChainableMock(mockError("Failed")))
      const result = await createMentorRequest(HACKATHON_ID, PARTICIPANT_ID, null, { category: "API" })
      expect(result).toEqual({
        success: false,
        code: "db_error",
        error: "We couldn't check the queue.",
      })
    })

    it("returns a stable race code when the request lease is busy", async () => {
      let lockCall = 0
      setMockFromImplementation((table) => {
        if (table !== "rate_limits") {
          throw new Error("Mentor requests must not be queried without the lease")
        }
        lockCall += 1
        return lockCall === 1
          ? createChainableMock(mockSuccess(null))
          : createChainableMock(mockError("Duplicate", "23505"))
      })

      const result = await createMentorRequest(
        HACKATHON_ID,
        PARTICIPANT_ID,
        TEAM_ID,
        { category: "API" },
      )

      expect(result).toEqual({
        success: false,
        code: "already_open",
        error: "Another mentor request is being added. Try again.",
      })
    })

    it("rejects malformed IDs before querying the database", async () => {
      const result = await createMentorRequest("not-an-id", PARTICIPANT_ID, null, { category: "API" })
      expect(result.success).toBe(false)
      if (!result.success) expect(result.code).toBe("invalid_input")
    })

    it("requires a topic or note", async () => {
      const result = await createMentorRequest(HACKATHON_ID, PARTICIPANT_ID, null, {})
      expect(result.success).toBe(false)
      if (!result.success) expect(result.code).toBe("invalid_input")
    })

    it("blocks a second unresolved request", async () => {
      setMockFromImplementation(() =>
        createChainableMock(mockSuccess({ id: REQUEST_ID })),
      )
      const result = await createMentorRequest(HACKATHON_ID, PARTICIPANT_ID, TEAM_ID, { category: "API" })
      expect(result.success).toBe(false)
      if (!result.success) expect(result.code).toBe("already_open")
    })

    it("limits attendees to three requests per hour", async () => {
      setMentorCreateMock((call) => {
        if (call === 1) return createChainableMock(mockSuccess(null))
        return createChainableMock({ data: null, error: null, count: 3 })
      })
      const result = await createMentorRequest(HACKATHON_ID, PARTICIPANT_ID, null, { description: "Need help" })
      expect(result.success).toBe(false)
      if (!result.success) expect(result.code).toBe("rate_limited")
    })

    it("applies the hourly limit to the whole team", async () => {
      const duplicate = createChainableMock(mockSuccess(null))
      const rate = createChainableMock({ data: null, error: null, count: 3 })
      setMentorCreateMock((call) => {
        return call === 1 ? duplicate : rate
      })

      const result = await createMentorRequest(
        HACKATHON_ID,
        PARTICIPANT_ID,
        TEAM_ID,
        { description: "Need help" },
      )

      expect(result.success).toBe(false)
      if (!result.success) expect(result.code).toBe("rate_limited")
      expect(rate.eq).toHaveBeenCalledWith("team_id", TEAM_ID)
      expect(rate.eq).not.toHaveBeenCalledWith(
        "requester_participant_id",
        PARTICIPANT_ID,
      )
    })

    it("cancels the losing request when concurrent team requests are created", async () => {
      const earlierRequest = {
        id: "11111111-2222-3333-4444-555555555555",
        hackathon_id: HACKATHON_ID,
        team_id: TEAM_ID,
        requester_participant_id: "66666666-6666-6666-6666-666666666666",
        category: "API",
        description: null,
        status: "open",
        claimed_by_participant_id: null,
        claimed_at: null,
        resolved_at: null,
        created_at: "2026-04-01T12:00:00.000Z",
      }
      const createdRequest = {
        ...earlierRequest,
        id: REQUEST_ID,
        requester_participant_id: PARTICIPANT_ID,
        created_at: "2026-04-01T12:00:00.100Z",
      }
      const cancelQuery = createChainableMock(mockSuccess({ id: REQUEST_ID }))
      setMentorCreateMock((call) => {
        if (call === 1) return createChainableMock(mockSuccess(null))
        if (call === 2) return createChainableMock({ data: null, error: null, count: 0 })
        if (call === 3) return createChainableMock(mockSuccess(createdRequest))
        if (call === 4) return createChainableMock(mockSuccess([earlierRequest, createdRequest]))
        if (call === 5) return createChainableMock(mockSuccess([earlierRequest, createdRequest]))
        return cancelQuery
      })

      const result = await createMentorRequest(
        HACKATHON_ID,
        PARTICIPANT_ID,
        TEAM_ID,
        { category: "API" },
      )

      expect(result).toEqual({
        success: false,
        code: "already_open",
        error: "You already have a mentor request in the queue.",
      })
      expect(cancelQuery.update).toHaveBeenCalledWith({ status: "cancelled" })
      expect(cancelQuery.eq).toHaveBeenCalledWith("id", REQUEST_ID)
      expect(cancelQuery.eq).toHaveBeenCalledWith("status", "open")
    })

    it("keeps a claimed solo request ahead of a concurrently inserted request", async () => {
      const createdRequest = {
        id: REQUEST_ID,
        hackathon_id: HACKATHON_ID,
        team_id: null,
        requester_participant_id: PARTICIPANT_ID,
        category: "API",
        description: null,
        status: "open",
        claimed_by_participant_id: null,
        claimed_at: null,
        resolved_at: null,
        created_at: "2026-04-01T12:00:00.000Z",
      }
      const claimedRequest = {
        ...createdRequest,
        id: "11111111-2222-3333-4444-555555555555",
        status: "claimed",
        claimed_by_participant_id: MENTOR_ID,
        created_at: "2026-04-01T12:00:00.100Z",
      }
      const activeQuery = createChainableMock(
        mockSuccess([createdRequest, claimedRequest]),
      )
      const cancelQuery = createChainableMock(mockSuccess({ id: REQUEST_ID }))
      setMentorCreateMock((call) => {
        if (call === 1) return createChainableMock(mockSuccess(null))
        if (call === 2) return createChainableMock({ data: null, error: null, count: 0 })
        if (call === 3) return createChainableMock(mockSuccess(createdRequest))
        if (call === 4) return activeQuery
        if (call === 5) return createChainableMock(mockSuccess([createdRequest]))
        return cancelQuery
      })

      const result = await createMentorRequest(
        HACKATHON_ID,
        PARTICIPANT_ID,
        null,
        { category: "API" },
      )

      expect(result).toMatchObject({ success: false, code: "already_open" })
      expect(activeQuery.eq).toHaveBeenCalledWith(
        "requester_participant_id",
        PARTICIPANT_ID,
      )
      expect(activeQuery.is).toHaveBeenCalledWith("team_id", null)
      expect(cancelQuery.eq).toHaveBeenCalledWith("id", REQUEST_ID)
    })

    it("cancels the fourth concurrent request with a stable rate code", async () => {
      const createdRequest = {
        id: REQUEST_ID,
        hackathon_id: HACKATHON_ID,
        team_id: null,
        requester_participant_id: PARTICIPANT_ID,
        category: "API",
        description: null,
        status: "open",
        claimed_by_participant_id: null,
        claimed_at: null,
        resolved_at: null,
        created_at: "2026-04-01T12:00:03.000Z",
      }
      const recentRequests = [0, 1, 2].map((index) => ({
        ...createdRequest,
        id: `0000000${index + 1}-1111-1111-1111-111111111111`,
        status: "resolved",
        created_at: `2026-04-01T12:00:0${index}.000Z`,
      }))
      const cancelQuery = createChainableMock(mockSuccess({ id: REQUEST_ID }))
      setMentorCreateMock((call) => {
        if (call === 1) return createChainableMock(mockSuccess(null))
        if (call === 2) return createChainableMock({ data: null, error: null, count: 2 })
        if (call === 3) return createChainableMock(mockSuccess(createdRequest))
        if (call === 4) return createChainableMock(mockSuccess([createdRequest]))
        if (call === 5) {
          return createChainableMock(mockSuccess([...recentRequests, createdRequest]))
        }
        return cancelQuery
      })

      const result = await createMentorRequest(
        HACKATHON_ID,
        PARTICIPANT_ID,
        null,
        { category: "API" },
      )

      expect(result).toEqual({
        success: false,
        code: "rate_limited",
        error: "You've asked three times this hour. Try again later.",
      })
      expect(cancelQuery.update).toHaveBeenCalledWith({ status: "cancelled" })
    })

    it("fails closed and cancels a new request when reconciliation cannot read", async () => {
      const createdRequest = {
        id: REQUEST_ID,
        hackathon_id: HACKATHON_ID,
        team_id: TEAM_ID,
        requester_participant_id: PARTICIPANT_ID,
        category: "API",
        description: null,
        status: "open",
        claimed_by_participant_id: null,
        claimed_at: null,
        resolved_at: null,
        created_at: "2026-04-01T12:00:00.000Z",
      }
      const cancelQuery = createChainableMock(mockSuccess({ id: REQUEST_ID }))
      setMentorCreateMock((call) => {
        if (call === 1) return createChainableMock(mockSuccess(null))
        if (call === 2) return createChainableMock({ data: null, error: null, count: 0 })
        if (call === 3) return createChainableMock(mockSuccess(createdRequest))
        if (call === 4) return createChainableMock(mockError("Read failed"))
        if (call === 5) return createChainableMock(mockSuccess([createdRequest]))
        return cancelQuery
      })

      const result = await createMentorRequest(
        HACKATHON_ID,
        PARTICIPANT_ID,
        TEAM_ID,
        { category: "API" },
      )

      expect(result).toEqual({
        success: false,
        code: "db_error",
        error: "We couldn't add your request.",
      })
      expect(cancelQuery.update).toHaveBeenCalledWith({ status: "cancelled" })
    })
  })

  describe("getActiveMentorRequest", () => {
    it("returns the unresolved request for the attendee's team", async () => {
      const request = { id: REQUEST_ID, status: "open" }
      setMockFromImplementation(() => createChainableMock(mockSuccess(request)))
      expect(await getActiveMentorRequest(HACKATHON_ID, PARTICIPANT_ID, TEAM_ID)).toEqual(request)
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

    it("limits rows in the database and keeps the exact queue total", async () => {
      const requests = [
        { id: REQUEST_ID, hackathon_id: HACKATHON_ID, team_id: null, requester_participant_id: PARTICIPANT_ID, category: "UI", description: null, status: "open", claimed_by_participant_id: null, claimed_at: null, resolved_at: null, created_at: "2026-04-01" },
      ]
      const queueQuery = createChainableMock({ data: requests, error: null, count: 73 })
      setMockFromImplementation(() => queueQuery)

      const result = await getMentorQueuePage(HACKATHON_ID)

      expect(queueQuery.select).toHaveBeenCalledWith("*", { count: "exact" })
      expect(queueQuery.limit).toHaveBeenCalledWith(MENTOR_QUEUE_MAX_ITEMS)
      expect(result).toMatchObject({
        total: 73,
        truncated: true,
        requests: [{ id: REQUEST_ID, requester_name: null, mentor_name: null }],
      })
    })

    it("returns safe empty page details for malformed event IDs", async () => {
      expect(await getMentorQueuePage("not-an-id")).toEqual({
        requests: [],
        total: 0,
        truncated: false,
      })
    })
  })

  describe("claimRequest", () => {
    it("claims an open request", async () => {
      const claimQuery = createChainableMock(mockSuccess({ id: REQUEST_ID }))
      setMockFromImplementation(() => claimQuery)
      expect(await claimRequest(REQUEST_ID, MENTOR_ID, HACKATHON_ID)).toEqual({ success: true })
      expect(claimQuery.eq).toHaveBeenCalledWith("hackathon_id", HACKATHON_ID)
      expect(claimQuery.eq).toHaveBeenCalledWith("status", "open")
    })

    it("returns a database error", async () => {
      setMockFromImplementation(() => createChainableMock(mockError("Failed")))
      const result = await claimRequest(REQUEST_ID, MENTOR_ID, HACKATHON_ID)
      expect(result.success).toBe(false)
      if (!result.success) expect(result.code).toBe("db_error")
    })

    it("returns a stable race code when another mentor claimed it", async () => {
      setMockFromImplementation(() => createChainableMock(mockSuccess(null)))
      const result = await claimRequest(REQUEST_ID, MENTOR_ID, HACKATHON_ID)
      expect(result.success).toBe(false)
      if (!result.success) expect(result.code).toBe("already_claimed")
    })
  })

  describe("resolveRequest", () => {
    it("resolves a claimed request", async () => {
      setMockFromImplementation(() => createChainableMock(mockSuccess({ id: REQUEST_ID })))
      expect(await resolveRequest(REQUEST_ID, MENTOR_ID, HACKATHON_ID)).toEqual({ success: true })
    })

    it("does not resolve a request from another hackathon", async () => {
      setMockFromImplementation(() => createChainableMock(mockSuccess(null)))
      const result = await resolveRequest(REQUEST_ID, MENTOR_ID, HACKATHON_ID)
      expect(result.success).toBe(false)
      if (!result.success) expect(result.code).toBe("not_claimed_by_you")
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
      const mentorQuery = createChainableMock(mockSuccess({ id: MENTOR_ID }))
      setMockFromImplementation(() => mentorQuery)
      expect(await getMentorParticipantId(HACKATHON_ID, "user_mentor")).toBe(MENTOR_ID)
      expect(mentorQuery.eq).toHaveBeenCalledWith("hackathon_id", HACKATHON_ID)
      expect(mentorQuery.eq).toHaveBeenCalledWith("clerk_user_id", "user_mentor")
      expect(mentorQuery.eq).toHaveBeenCalledWith("role", "mentor")
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
