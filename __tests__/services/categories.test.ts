import { describe, it, expect, beforeEach } from "bun:test"
import {
  createChainableMock,
  resetSupabaseMocks,
  setMockFromImplementation,
  mockSuccess,
  mockError,
} from "../lib/supabase-mock"

const {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getSubmissionCategories,
  setSubmissionCategories,
} = await import("@/lib/services/categories")

const HACKATHON_ID = "11111111-1111-1111-1111-111111111111"
const CATEGORY_ID = "22222222-2222-2222-2222-222222222222"
const SUBMISSION_ID = "33333333-3333-3333-3333-333333333333"

describe("categories service", () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  describe("listCategories", () => {
    it("returns categories with prize names", async () => {
      const data = [
        { id: CATEGORY_ID, hackathon_id: HACKATHON_ID, name: "Best AI", description: null, prize_id: "p1", display_order: 0, created_at: "2026-04-01", prizes: { name: "Gold Prize" } },
      ]
      setMockFromImplementation(() => createChainableMock(mockSuccess(data)))

      const result = await listCategories(HACKATHON_ID)
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe("Best AI")
      expect(result[0].prize_name).toBe("Gold Prize")
    })

    it("returns empty array on error", async () => {
      setMockFromImplementation(() => createChainableMock(mockError("DB error")))
      const result = await listCategories(HACKATHON_ID)
      expect(result).toEqual([])
    })

    it("handles null prize", async () => {
      const data = [
        { id: CATEGORY_ID, hackathon_id: HACKATHON_ID, name: "Open", description: null, prize_id: null, display_order: 0, created_at: "2026-04-01", prizes: null },
      ]
      setMockFromImplementation(() => createChainableMock(mockSuccess(data)))

      const result = await listCategories(HACKATHON_ID)
      expect(result[0].prize_name).toBeNull()
    })
  })

  describe("createCategory", () => {
    it("creates a category", async () => {
      const category = { id: CATEGORY_ID, hackathon_id: HACKATHON_ID, name: "Best UI", description: "UI award", prize_id: null, display_order: 0, created_at: "2026-04-01" }
      setMockFromImplementation(() => createChainableMock(mockSuccess(category)))

      const result = await createCategory(HACKATHON_ID, { name: "Best UI", description: "UI award" })
      expect(result).not.toBeNull()
      expect(result!.name).toBe("Best UI")
    })

    it("returns null on error", async () => {
      setMockFromImplementation(() => createChainableMock(mockError("Insert failed")))
      const result = await createCategory(HACKATHON_ID, { name: "Cat" })
      expect(result).toBeNull()
    })
  })

  describe("updateCategory", () => {
    it("updates a category", async () => {
      const category = { id: CATEGORY_ID, hackathon_id: HACKATHON_ID, name: "Updated", description: null, prize_id: null, display_order: 0, created_at: "2026-04-01" }
      setMockFromImplementation(() => createChainableMock(mockSuccess(category)))

      const result = await updateCategory(CATEGORY_ID, HACKATHON_ID, { name: "Updated" })
      expect(result).not.toBeNull()
      expect(result!.name).toBe("Updated")
    })

    it("returns null when no updates", async () => {
      const result = await updateCategory(CATEGORY_ID, HACKATHON_ID, {})
      expect(result).toBeNull()
    })
  })

  describe("deleteCategory", () => {
    it("deletes a category", async () => {
      setMockFromImplementation(() => createChainableMock({ data: null, error: null }))
      const result = await deleteCategory(CATEGORY_ID, HACKATHON_ID)
      expect(result).toBe(true)
    })

    it("returns false on error", async () => {
      setMockFromImplementation(() => createChainableMock(mockError("Delete failed")))
      const result = await deleteCategory(CATEGORY_ID, HACKATHON_ID)
      expect(result).toBe(false)
    })
  })

  describe("getSubmissionCategories", () => {
    it("returns categories for a submission", async () => {
      const cat = { id: CATEGORY_ID, hackathon_id: HACKATHON_ID, name: "Best AI", description: null, prize_id: null, display_order: 0, created_at: "2026-04-01" }
      const data = [{ category_id: CATEGORY_ID, submission_categories: cat }]
      setMockFromImplementation(() => createChainableMock(mockSuccess(data)))

      const result = await getSubmissionCategories(SUBMISSION_ID)
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe("Best AI")
    })

    it("returns empty on error", async () => {
      setMockFromImplementation(() => createChainableMock(mockError("Failed")))
      const result = await getSubmissionCategories(SUBMISSION_ID)
      expect(result).toEqual([])
    })
  })

  describe("setSubmissionCategories", () => {
    it("sets categories for a submission", async () => {
      setMockFromImplementation((table) => {
        if (table === "submissions") return createChainableMock({ data: { hackathon_id: HACKATHON_ID }, error: null })
        if (table === "submission_categories") return createChainableMock({ data: [{ id: CATEGORY_ID }], error: null })
        return createChainableMock({ data: null, error: null })
      })
      const result = await setSubmissionCategories(SUBMISSION_ID, [CATEGORY_ID])
      expect(result).toBe(true)
    })

    it("handles empty category list", async () => {
      setMockFromImplementation((table) => table === "submissions"
        ? createChainableMock({ data: { hackathon_id: HACKATHON_ID }, error: null })
        : createChainableMock({ data: null, error: null }))
      const result = await setSubmissionCategories(SUBMISSION_ID, [])
      expect(result).toBe(true)
    })

    it("returns false on delete error", async () => {
      setMockFromImplementation(() => createChainableMock(mockError("Delete failed")))
      const result = await setSubmissionCategories(SUBMISSION_ID, [CATEGORY_ID])
      expect(result).toBe(false)
    })
  })
})
