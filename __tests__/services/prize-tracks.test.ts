import { describe, it, expect, beforeEach } from "bun:test"
import {
  createChainableMock,
  resetSupabaseMocks,
  setMockFromImplementation,
  setMockRpcImplementation,
  mockSuccess,
  mockError,
} from "../lib/supabase-mock"

const {
  listPrizeTracks,
  getPrizeTrack,
  createPrizeTrack,
  updatePrizeTrack,
  deletePrizeTrack,
  listRounds,
  createRound,
  updateRound,
  activateRound,
  listBucketDefinitions,
  createDefaultBuckets,
  replaceRoundBucketDefinitions,
  submitBucketResponse,
  submitBinaryResponses,
  submitBucketSortResponse,
  submitGateCheckResponse,
  getTrackProgress,
  getPrizeTrackWithDetails,
  calculateBucketSortResults,
  calculateGateCheckResults,
} = await import("@/lib/services/prize-tracks")

const HACKATHON_ID = "11111111-1111-1111-1111-111111111111"
const TRACK_ID = "22222222-2222-2222-2222-222222222222"
const ROUND_ID = "33333333-3333-3333-3333-333333333333"
const ASSIGNMENT_ID = "44444444-4444-4444-4444-444444444444"
const BUCKET_ID = "55555555-5555-5555-5555-555555555555"
const CRITERIA_ID = "66666666-6666-6666-6666-666666666666"
const SUBMISSION_ID = "77777777-7777-7777-7777-777777777777"

function setValidResponseMocks(options?: { response?: Record<string, unknown>; responseError?: string }) {
  setMockFromImplementation((table) => {
    if (table === "judge_assignments") {
      return createChainableMock(mockSuccess({ hackathon_id: HACKATHON_ID, prize_id: TRACK_ID, round_id: ROUND_ID }))
    }
    if (table === "bucket_definitions") return createChainableMock(mockSuccess({ id: BUCKET_ID }))
    if (table === "judging_criteria") return createChainableMock(mockSuccess([{ id: CRITERIA_ID }]))
    if (table === "binary_responses" || table === "bucket_responses") {
      return options?.responseError
        ? createChainableMock(mockError(options.responseError))
        : createChainableMock(mockSuccess(options?.response ?? { id: "response-1", judge_assignment_id: ASSIGNMENT_ID, criteria_id: CRITERIA_ID, bucket_id: BUCKET_ID, passed: true }))
    }
    return createChainableMock(mockSuccess(null))
  })
}

describe("prize-tracks service", () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  describe("listPrizeTracks", () => {
    it("returns tracks sorted by display_order", async () => {
      const tracks = [
        { id: TRACK_ID, hackathon_id: HACKATHON_ID, name: "Grand Prize", intent: "overall_winner", display_order: 0 },
      ]
      setMockFromImplementation(() => createChainableMock(mockSuccess(tracks)))
      const result = await listPrizeTracks(HACKATHON_ID)
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe("Grand Prize")
    })

    it("returns empty array on error", async () => {
      setMockFromImplementation(() => createChainableMock(mockError("DB error")))
      const result = await listPrizeTracks(HACKATHON_ID)
      expect(result).toEqual([])
    })
  })

  describe("getPrizeTrack", () => {
    it("returns track by id", async () => {
      const track = { id: TRACK_ID, hackathon_id: HACKATHON_ID, name: "Grand Prize", intent: "overall_winner" }
      setMockFromImplementation(() => createChainableMock(mockSuccess(track)))
      const result = await getPrizeTrack(TRACK_ID)
      expect(result).not.toBeNull()
      expect(result!.id).toBe(TRACK_ID)
    })

    it("returns null on error", async () => {
      setMockFromImplementation(() => createChainableMock(mockError("Not found")))
      const result = await getPrizeTrack(TRACK_ID)
      expect(result).toBeNull()
    })

    it("returns null when not found", async () => {
      setMockFromImplementation(() => createChainableMock(mockSuccess(null)))
      const result = await getPrizeTrack(TRACK_ID)
      expect(result).toBeNull()
    })
  })

  describe("createPrizeTrack", () => {
    it("creates track with default round and buckets", async () => {
      const track = { id: TRACK_ID, hackathon_id: HACKATHON_ID, name: "Grand Prize", intent: "overall_winner" }
      const round = { id: ROUND_ID, hackathon_id: HACKATHON_ID, prize_track_id: TRACK_ID, style: "bucket_sort" }
      const buckets = [
        { id: "b1", round_id: ROUND_ID, level: 1, label: "Not Ready", display_order: 1 },
        { id: "b2", round_id: ROUND_ID, level: 2, label: "Solid Effort", display_order: 2 },
        { id: "b3", round_id: ROUND_ID, level: 3, label: "Strong Contender", display_order: 3 },
        { id: "b4", round_id: ROUND_ID, level: 4, label: "Outstanding", display_order: 4 },
      ]

      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) return createChainableMock(mockSuccess(track))
        if (callCount === 2) return createChainableMock(mockSuccess(round))
        return createChainableMock(mockSuccess(buckets))
      })

      const result = await createPrizeTrack(HACKATHON_ID, { name: "Grand Prize", intent: "overall_winner" })
      expect(result).not.toBeNull()
      expect(result!.name).toBe("Grand Prize")
    })

    it("returns null on insert error", async () => {
      setMockFromImplementation(() => createChainableMock(mockError("Insert failed")))
      const result = await createPrizeTrack(HACKATHON_ID, { name: "Test" })
      expect(result).toBeNull()
    })
  })

  describe("updatePrizeTrack", () => {
    it("updates track fields", async () => {
      const track = { id: TRACK_ID, hackathon_id: HACKATHON_ID, name: "Updated", intent: "overall_winner", updated_at: "2026-04-03" }
      setMockFromImplementation(() => createChainableMock(mockSuccess(track)))
      const result = await updatePrizeTrack(TRACK_ID, HACKATHON_ID, { name: "Updated" })
      expect(result).not.toBeNull()
      expect(result!.name).toBe("Updated")
    })

    it("returns null on error", async () => {
      setMockFromImplementation(() => createChainableMock(mockError("Update failed")))
      const result = await updatePrizeTrack(TRACK_ID, HACKATHON_ID, { name: "Fail" })
      expect(result).toBeNull()
    })
  })

  describe("deletePrizeTrack", () => {
    it("deletes a track", async () => {
      setMockFromImplementation(() => createChainableMock({ data: null, error: null }))
      expect(await deletePrizeTrack(TRACK_ID, HACKATHON_ID)).toBe(true)
    })

    it("returns false on error", async () => {
      setMockFromImplementation(() => createChainableMock(mockError("Delete failed")))
      expect(await deletePrizeTrack(TRACK_ID, HACKATHON_ID)).toBe(false)
    })
  })

  describe("listRounds", () => {
    it("returns rounds for a track", async () => {
      const rounds = [{ id: ROUND_ID, prize_track_id: TRACK_ID, name: "Default", style: "bucket_sort", status: "planned" }]
      setMockFromImplementation(() => createChainableMock(mockSuccess(rounds)))
      const result = await listRounds(TRACK_ID)
      expect(result).toHaveLength(1)
      expect(result[0].style).toBe("bucket_sort")
    })

    it("returns empty on error", async () => {
      setMockFromImplementation(() => createChainableMock(mockError("DB error")))
      const result = await listRounds(TRACK_ID)
      expect(result).toEqual([])
    })
  })

  describe("createRound", () => {
    it("creates a round with style", async () => {
      const round = { id: ROUND_ID, hackathon_id: HACKATHON_ID, prize_track_id: TRACK_ID, name: "Finals", style: "gate_check", status: "planned" }
      setMockFromImplementation(() => createChainableMock(mockSuccess(round)))
      const result = await createRound(HACKATHON_ID, TRACK_ID, { name: "Finals", style: "gate_check" })
      expect(result).not.toBeNull()
      expect(result!.style).toBe("gate_check")
    })

    it("returns null on error", async () => {
      setMockFromImplementation(() => createChainableMock(mockError("Failed")))
      const result = await createRound(HACKATHON_ID, TRACK_ID, { name: "R", style: "bucket_sort" })
      expect(result).toBeNull()
    })
  })

  describe("updateRound", () => {
    it("updates round fields", async () => {
      const round = { id: ROUND_ID, name: "Updated", style: "gate_check", status: "active" }
      setMockFromImplementation(() => createChainableMock(mockSuccess(round)))
      const result = await updateRound(ROUND_ID, { name: "Updated", style: "gate_check" })
      expect(result).not.toBeNull()
      expect(result!.name).toBe("Updated")
    })
  })

  describe("activateRound", () => {
    it("deactivates other rounds and activates target", async () => {
      setMockFromImplementation(() => createChainableMock({ data: { id: ROUND_ID }, error: null }))
      setMockRpcImplementation(() => Promise.resolve({ data: true, error: null }))
      expect(await activateRound(ROUND_ID, TRACK_ID, HACKATHON_ID)).toBe(true)
    })

    it("returns false on deactivate error", async () => {
      setMockFromImplementation(() => createChainableMock(mockError("Failed")))
      expect(await activateRound(ROUND_ID, TRACK_ID, HACKATHON_ID)).toBe(false)
    })
  })

  describe("listBucketDefinitions", () => {
    it("returns buckets sorted by level", async () => {
      const buckets = [
        { id: "b1", round_id: ROUND_ID, level: 1, label: "Not Ready", display_order: 1 },
        { id: "b2", round_id: ROUND_ID, level: 2, label: "Solid Effort", display_order: 2 },
      ]
      setMockFromImplementation(() => createChainableMock(mockSuccess(buckets)))
      const result = await listBucketDefinitions(ROUND_ID)
      expect(result).toHaveLength(2)
      expect(result[0].label).toBe("Not Ready")
    })

    it("returns empty on error", async () => {
      setMockFromImplementation(() => createChainableMock(mockError("DB error")))
      const result = await listBucketDefinitions(ROUND_ID)
      expect(result).toEqual([])
    })
  })

  describe("createDefaultBuckets", () => {
    it("creates 4 default buckets", async () => {
      const buckets = [
        { id: "b1", round_id: ROUND_ID, level: 1, label: "Not Ready" },
        { id: "b2", round_id: ROUND_ID, level: 2, label: "Solid Effort" },
        { id: "b3", round_id: ROUND_ID, level: 3, label: "Strong Contender" },
        { id: "b4", round_id: ROUND_ID, level: 4, label: "Outstanding" },
      ]
      setMockFromImplementation(() => createChainableMock(mockSuccess(buckets)))
      const result = await createDefaultBuckets(ROUND_ID)
      expect(result).toHaveLength(4)
      expect(result[3].label).toBe("Outstanding")
    })
  })

  describe("replaceRoundBucketDefinitions", () => {
    it("deletes old and inserts new buckets", async () => {
      const newBuckets = [
        { id: "nb1", round_id: ROUND_ID, level: 1, label: "Fail", display_order: 0 },
        { id: "nb2", round_id: ROUND_ID, level: 2, label: "Pass", display_order: 1 },
      ]
      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) return createChainableMock({ data: null, error: null })
        return createChainableMock(mockSuccess(newBuckets))
      })
      const result = await replaceRoundBucketDefinitions(ROUND_ID, [
        { level: 1, label: "Fail" },
        { level: 2, label: "Pass" },
      ])
      expect(result).toHaveLength(2)
    })

    it("returns empty on delete error", async () => {
      setMockFromImplementation(() => createChainableMock(mockError("Delete failed")))
      const result = await replaceRoundBucketDefinitions(ROUND_ID, [{ level: 1, label: "Fail" }])
      expect(result).toEqual([])
    })
  })

  describe("submitBucketResponse", () => {
    it("upserts a bucket response", async () => {
      const response = { id: "r1", judge_assignment_id: ASSIGNMENT_ID, bucket_id: BUCKET_ID }
      setValidResponseMocks({ response })
      const result = await submitBucketResponse(ASSIGNMENT_ID, { bucketId: BUCKET_ID })
      expect(result).not.toBeNull()
      expect(result!.bucket_id).toBe(BUCKET_ID)
    })

    it("returns null on error", async () => {
      setMockFromImplementation(() => createChainableMock(mockError("Failed")))
      const result = await submitBucketResponse(ASSIGNMENT_ID, { bucketId: BUCKET_ID })
      expect(result).toBeNull()
    })
  })

  describe("submitBinaryResponses", () => {
    it("upserts binary responses and returns success", async () => {
      const resp = { id: "br1", judge_assignment_id: ASSIGNMENT_ID, criteria_id: CRITERIA_ID, passed: true }
      setValidResponseMocks({ response: resp })
      const result = await submitBinaryResponses(ASSIGNMENT_ID, [
        { criteriaId: CRITERIA_ID, passed: true },
      ])
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.results).toHaveLength(1)
        expect(result.results[0].passed).toBe(true)
      }
    })

    it("fails closed on partial failure without marking any progress as complete", async () => {
      setValidResponseMocks({ responseError: "Database offline" })
      const result = await submitBinaryResponses(ASSIGNMENT_ID, [
        { criteriaId: CRITERIA_ID, passed: true },
      ])
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.code).toBe("partial_save")
        expect(result.savedCount).toBe(0)
        expect(result.totalCount).toBe(1)
      }
    })
  })

  describe("submitBucketSortResponse", () => {
    it("submits gates + bucket and marks assignment complete", async () => {
      const bucketResp = { id: "br1", judge_assignment_id: ASSIGNMENT_ID, bucket_id: BUCKET_ID }
      setValidResponseMocks({ response: bucketResp })

      const result = await submitBucketSortResponse(ASSIGNMENT_ID, {
        gates: [],
        bucketId: BUCKET_ID,
      })
      expect(result.success).toBe(true)
    })

    it("returns failure when bucket response fails", async () => {
      setMockFromImplementation(() => createChainableMock(mockError("Failed")))
      const result = await submitBucketSortResponse(ASSIGNMENT_ID, {
        gates: [],
        bucketId: BUCKET_ID,
      })
      expect(result.success).toBe(false)
    })

    it("does not mark complete when a gate response fails", async () => {
      setValidResponseMocks({ responseError: "Gate failed" })

      const result = await submitBucketSortResponse(ASSIGNMENT_ID, {
        gates: [{ criteriaId: CRITERIA_ID, passed: true }],
        bucketId: BUCKET_ID,
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.code).toBe("partial_save")
      }
    })
  })

  describe("submitGateCheckResponse", () => {
    it("submits gate responses and marks assignment complete", async () => {
      const binaryResp = { id: "br1", judge_assignment_id: ASSIGNMENT_ID, criteria_id: CRITERIA_ID, passed: true }
      setValidResponseMocks({ response: binaryResp })

      const result = await submitGateCheckResponse(ASSIGNMENT_ID, [
        { criteriaId: CRITERIA_ID, passed: true },
      ])
      expect(result.success).toBe(true)
    })

    it("does not mark complete when gate binary response fails", async () => {
      setValidResponseMocks({ responseError: "Binary failed" })
      const result = await submitGateCheckResponse(ASSIGNMENT_ID, [
        { criteriaId: CRITERIA_ID, passed: true },
      ])
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.code).toBe("partial_save")
      }
    })
  })

  describe("getTrackProgress", () => {
    it("returns progress for each track", async () => {
      const track = { id: TRACK_ID, hackathon_id: HACKATHON_ID, name: "Grand Prize", intent: "overall_winner", display_order: 0 }
      const round = { id: ROUND_ID, style: "bucket_sort", status: "active", prize_track_id: TRACK_ID }
      const assignments = [
        { is_complete: true, judge_participant_id: "j1" },
        { is_complete: false, judge_participant_id: "j2" },
      ]
      const criteria = [{ id: CRITERIA_ID }]

      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) return createChainableMock(mockSuccess([track]))
        if (callCount === 2) return createChainableMock(mockSuccess([round]))
        if (callCount === 3) return createChainableMock(mockSuccess(assignments))
        if (callCount === 4) return createChainableMock(mockSuccess(criteria))
        return createChainableMock(mockSuccess([]))
      })

      const result = await getTrackProgress(HACKATHON_ID)
      expect(result).toHaveLength(1)
      expect(result[0].trackName).toBe("Grand Prize")
      expect(result[0].totalAssignments).toBe(2)
      expect(result[0].completedAssignments).toBe(1)
      expect(result[0].judgeCount).toBe(2)
      expect(result[0].criteriaCount).toBe(1)
    })
  })

  describe("getPrizeTrackWithDetails", () => {
    it("returns track with rounds and buckets", async () => {
      const track = { id: TRACK_ID, hackathon_id: HACKATHON_ID, name: "Grand Prize", intent: "overall_winner" }
      const round = { id: ROUND_ID, prize_track_id: TRACK_ID, style: "bucket_sort", status: "planned" }
      const buckets = [{ id: "b1", round_id: ROUND_ID, level: 1, label: "Not Ready" }]

      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) return createChainableMock(mockSuccess(track))
        if (callCount === 2) return createChainableMock(mockSuccess([round]))
        return createChainableMock(mockSuccess(buckets))
      })

      const result = await getPrizeTrackWithDetails(TRACK_ID)
      expect(result).not.toBeNull()
      expect(result!.rounds).toHaveLength(1)
      expect(result!.rounds[0].buckets).toHaveLength(1)
    })

    it("returns null when track not found", async () => {
      setMockFromImplementation(() => createChainableMock(mockSuccess(null)))
      const result = await getPrizeTrackWithDetails(TRACK_ID)
      expect(result).toBeNull()
    })
  })

  describe("calculateBucketSortResults", () => {
    it("calculates rankings from bucket responses", async () => {
      const assignments = [
        { id: ASSIGNMENT_ID, submission_id: SUBMISSION_ID },
      ]
      const bucketResponses = [
        { judge_assignment_id: ASSIGNMENT_ID, bucket_id: BUCKET_ID },
      ]
      const bucketDefs = [
        { id: BUCKET_ID, level: 3 },
      ]

      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) return createChainableMock({ data: null, error: null })
        if (callCount === 2) return createChainableMock(mockSuccess(assignments))
        if (callCount === 3) return createChainableMock(mockSuccess(bucketResponses))
        if (callCount === 4) return createChainableMock(mockSuccess(bucketDefs))
        return createChainableMock({ data: null, error: null })
      })

      const result = await calculateBucketSortResults(HACKATHON_ID, ROUND_ID, TRACK_ID)
      expect(result.success).toBe(true)
      expect(result.count).toBe(1)
    })

    it("returns count 0 when no completed assignments", async () => {
      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) return createChainableMock({ data: null, error: null })
        return createChainableMock(mockSuccess([]))
      })

      const result = await calculateBucketSortResults(HACKATHON_ID, ROUND_ID, TRACK_ID)
      expect(result.success).toBe(true)
      expect(result.count).toBe(0)
    })

    it("returns failure on clear error", async () => {
      setMockFromImplementation(() => createChainableMock(mockError("Delete failed")))
      const result = await calculateBucketSortResults(HACKATHON_ID, ROUND_ID, TRACK_ID)
      expect(result.success).toBe(false)
    })
  })

  describe("calculateGateCheckResults", () => {
    it("calculates rankings from binary responses", async () => {
      const assignments = [
        { id: ASSIGNMENT_ID, submission_id: SUBMISSION_ID },
      ]
      const binaryResponses = [
        { judge_assignment_id: ASSIGNMENT_ID, passed: true },
        { judge_assignment_id: ASSIGNMENT_ID, passed: false },
      ]

      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) return createChainableMock({ data: null, error: null })
        if (callCount === 2) return createChainableMock(mockSuccess(assignments))
        if (callCount === 3) return createChainableMock(mockSuccess(binaryResponses))
        return createChainableMock({ data: null, error: null })
      })

      const result = await calculateGateCheckResults(HACKATHON_ID, ROUND_ID, TRACK_ID)
      expect(result.success).toBe(true)
      expect(result.count).toBe(1)
    })

    it("returns count 0 when no completed assignments", async () => {
      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) return createChainableMock({ data: null, error: null })
        return createChainableMock(mockSuccess([]))
      })

      const result = await calculateGateCheckResults(HACKATHON_ID, ROUND_ID, TRACK_ID)
      expect(result.success).toBe(true)
      expect(result.count).toBe(0)
    })
  })
})
