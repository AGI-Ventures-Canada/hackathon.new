import { describe, it, expect, beforeEach } from "bun:test"
import {
  createChainableMock,
  resetSupabaseMocks,
  setMockFromImplementation,
  mockSuccess,
} from "../lib/supabase-mock"

const {
  validatePresenterViewConfig,
  validatePresenterViewName,
  listPresenterViews,
  getPresenterView,
  createPresenterView,
  deletePresenterView,
} = await import("@/lib/services/presenter-views")

const HACKATHON_ID = "11111111-1111-1111-1111-111111111111"
const VIEW_ID = "22222222-2222-2222-2222-222222222222"
const ROUND_ID = "33333333-3333-3333-3333-333333333333"
const SUBMISSION_A = "44444444-4444-4444-4444-444444444444"
const SUBMISSION_B = "55555555-5555-5555-5555-555555555555"

describe("presenter-views service", () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  describe("validatePresenterViewName", () => {
    it("trims whitespace", () => {
      expect(validatePresenterViewName("  Demo Day  ")).toBe("Demo Day")
    })

    it("returns null for empty input", () => {
      expect(validatePresenterViewName("")).toBeNull()
      expect(validatePresenterViewName("   ")).toBeNull()
    })

    it("truncates very long names", () => {
      const long = "x".repeat(200)
      const result = validatePresenterViewName(long)
      expect(result).not.toBeNull()
      expect(result!.length).toBeLessThanOrEqual(80)
    })
  })

  describe("validatePresenterViewConfig", () => {
    it("accepts a round_finalists config with a valid uuid", () => {
      const result = validatePresenterViewConfig({
        kind: "round_finalists",
        roundId: ROUND_ID,
      })
      expect(result).toEqual({ kind: "round_finalists", roundId: ROUND_ID })
    })

    it("rejects round_finalists with a non-uuid roundId", () => {
      expect(
        validatePresenterViewConfig({ kind: "round_finalists", roundId: "not-a-uuid" })
      ).toBeNull()
    })

    it("dedupes and filters invalid manual ids", () => {
      const result = validatePresenterViewConfig({
        kind: "manual",
        submissionIds: [SUBMISSION_A, "bogus", SUBMISSION_A, SUBMISSION_B],
      })
      expect(result).toEqual({
        kind: "manual",
        submissionIds: [SUBMISSION_A, SUBMISSION_B],
      })
    })

    it("rejects manual config with no valid ids", () => {
      expect(
        validatePresenterViewConfig({
          kind: "manual",
          submissionIds: ["nope", "also-nope"],
        })
      ).toBeNull()
    })

    it("rejects unknown kinds", () => {
      expect(validatePresenterViewConfig({ kind: "garbage" })).toBeNull()
    })
  })

  describe("listPresenterViews", () => {
    it("returns empty for non-uuid hackathonId without hitting the database", async () => {
      const result = await listPresenterViews("draft")
      expect(result).toEqual([])
    })

    it("filters out rows with invalid configs so callers never crash", async () => {
      setMockFromImplementation(() =>
        createChainableMock(
          mockSuccess([
            {
              id: VIEW_ID,
              hackathon_id: HACKATHON_ID,
              name: "Good",
              config: { kind: "round_finalists", roundId: ROUND_ID },
              created_by_clerk_user_id: "user_1",
              created_at: "2026-05-10T00:00:00Z",
              updated_at: "2026-05-10T00:00:00Z",
            },
            {
              id: "00000000-0000-0000-0000-000000000000",
              hackathon_id: HACKATHON_ID,
              name: "Corrupt",
              config: { kind: "garbage" },
              created_by_clerk_user_id: "user_1",
              created_at: "2026-05-10T00:00:00Z",
              updated_at: "2026-05-10T00:00:00Z",
            },
          ])
        )
      )
      const result = await listPresenterViews(HACKATHON_ID)
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe("Good")
    })

    it("filters out rows with missing required string fields", async () => {
      setMockFromImplementation(() =>
        createChainableMock(
          mockSuccess([
            {
              id: VIEW_ID,
              hackathon_id: HACKATHON_ID,
              name: "Good",
              config: { kind: "round_finalists", roundId: ROUND_ID },
              created_by_clerk_user_id: "user_1",
              created_at: "2026-05-10T00:00:00Z",
              updated_at: "2026-05-10T00:00:00Z",
            },
            {
              id: null,
              hackathon_id: HACKATHON_ID,
              name: null,
              config: { kind: "round_finalists", roundId: ROUND_ID },
              created_by_clerk_user_id: "user_1",
              created_at: "2026-05-10T00:00:00Z",
              updated_at: "2026-05-10T00:00:00Z",
            },
          ])
        )
      )
      const result = await listPresenterViews(HACKATHON_ID)
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe(VIEW_ID)
    })
  })

  describe("getPresenterView", () => {
    it("returns null for invalid uuids without hitting the database", async () => {
      const result = await getPresenterView("draft")
      expect(result).toBeNull()
    })
  })

  describe("createPresenterView", () => {
    it("rejects invalid configs without hitting the database", async () => {
      const result = await createPresenterView({
        hackathonId: HACKATHON_ID,
        name: "x",
        config: { kind: "manual", submissionIds: [] },
        createdByClerkUserId: "user_1",
      })
      expect(result).toBeNull()
    })

    it("rejects non-uuid hackathonId without hitting the database", async () => {
      const result = await createPresenterView({
        hackathonId: "draft",
        name: "Demo Day",
        config: { kind: "manual", submissionIds: [SUBMISSION_A] },
        createdByClerkUserId: "user_1",
      })
      expect(result).toBeNull()
    })

    it("returns the created row when valid", async () => {
      const { mockMultiTableQuery } = await import("../lib/supabase-mock")
      mockMultiTableQuery({
        submissions: mockSuccess([{ id: SUBMISSION_A }]),
        organizer_presenter_views: mockSuccess({
          id: VIEW_ID,
          hackathon_id: HACKATHON_ID,
          name: "Demo Day",
          config: { kind: "manual", submissionIds: [SUBMISSION_A] },
          created_by_clerk_user_id: "user_1",
          created_at: "2026-05-10T00:00:00Z",
          updated_at: "2026-05-10T00:00:00Z",
        }),
      })
      const view = await createPresenterView({
        hackathonId: HACKATHON_ID,
        name: "Demo Day",
        config: { kind: "manual", submissionIds: [SUBMISSION_A] },
        createdByClerkUserId: "user_1",
      })
      expect(view).not.toBeNull()
      expect(view!.name).toBe("Demo Day")
    })

    it("rejects manual config when a submission belongs to a different hackathon", async () => {
      const { mockMultiTableQuery } = await import("../lib/supabase-mock")
      mockMultiTableQuery({
        submissions: mockSuccess([]),
      })
      const view = await createPresenterView({
        hackathonId: HACKATHON_ID,
        name: "Demo Day",
        config: { kind: "manual", submissionIds: [SUBMISSION_A] },
        createdByClerkUserId: "user_1",
      })
      expect(view).toBeNull()
    })
  })

  describe("deletePresenterView", () => {
    it("returns false for non-uuids", async () => {
      expect(await deletePresenterView("not-a-uuid")).toBe(false)
    })
  })
})
