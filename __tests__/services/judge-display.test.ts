import { describe, it, expect, beforeEach } from "bun:test"
import type { HackathonJudgeDisplay } from "@/lib/db/hackathon-types"
import {
  createChainableMock,
  resetSupabaseMocks,
  setMockFromImplementation,
  mockTableQuery,
  mockMultiTableQuery,
  mockSuccess,
  mockError,
  mockCount,
} from "../lib/supabase-mock"

const {
  listJudgeDisplayProfiles,
  createJudgeDisplayProfile,
  updateJudgeDisplayProfile,
  deleteJudgeDisplayProfile,
  reorderJudgeDisplayProfiles,
  countJudgeDisplayProfiles,
} = await import("@/lib/services/judge-display")

const mockJudge: HackathonJudgeDisplay = {
  id: "j1",
  hackathon_id: "h1",
  name: "Jane Doe",
  title: "CTO",
  organization: "Acme Corp",
  headshot_url: null,
  clerk_user_id: null,
  participant_id: null,
  display_order: 0,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
}

describe("Judge Display Service", () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  describe("listJudgeDisplayProfiles", () => {
    it("returns judge profiles ordered by display_order", async () => {
      const chain = createChainableMock({
        data: [mockJudge, { ...mockJudge, id: "j2", name: "John Smith", display_order: 1 }],
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await listJudgeDisplayProfiles("h1")

      expect(result).toHaveLength(2)
      expect(result[0].name).toBe("Jane Doe")
    })

    it("returns empty array when database query fails", async () => {
      mockTableQuery("hackathon_judges_display", mockError("DB error"))

      const result = await listJudgeDisplayProfiles("h1")

      expect(result).toEqual([])
    })

    it("returns empty array when no judges exist", async () => {
      mockTableQuery("hackathon_judges_display", mockSuccess([]))

      const result = await listJudgeDisplayProfiles("h1")

      expect(result).toEqual([])
    })
  })

  describe("createJudgeDisplayProfile", () => {
    it("creates judge profile with required fields", async () => {
      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createChainableMock({ data: null, error: null })
        }
        return createChainableMock({ data: mockJudge, error: null })
      })

      const result = await createJudgeDisplayProfile("h1", {
        name: "Jane Doe",
      })

      expect(result.status).toBe("created")
      if (result.status === "created") {
        expect(result.judge.name).toBe("Jane Doe")
      }
    })

    it("creates judge profile with all fields", async () => {
      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createChainableMock({ data: null, error: null })
        }
        return createChainableMock({ data: mockJudge, error: null })
      })

      const result = await createJudgeDisplayProfile("h1", {
        name: "Jane Doe",
        title: "CTO",
        organization: "Acme Corp",
        displayOrder: 0,
      })

      expect(result.status).toBe("created")
      if (result.status === "created") {
        expect(result.judge.title).toBe("CTO")
      }
    })

    it("returns error when database insert fails", async () => {
      const chain = createChainableMock({
        data: null,
        error: { message: "DB error" },
      })
      setMockFromImplementation(() => chain)

      const result = await createJudgeDisplayProfile("h1", { name: "Test" })

      expect(result.status).toBe("error")
    })
  })

  describe("updateJudgeDisplayProfile", () => {
    it("updates judge profile name", async () => {
      const updated = { ...mockJudge, name: "Updated Name" }
      const chain = createChainableMock({
        data: updated,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await updateJudgeDisplayProfile("j1", "h1", {
        name: "Updated Name",
      })

      expect(result).not.toBeNull()
      expect(result?.name).toBe("Updated Name")
    })

    it("returns null when database update fails", async () => {
      const chain = createChainableMock({
        data: null,
        error: { message: "DB error" },
      })
      setMockFromImplementation(() => chain)

      const result = await updateJudgeDisplayProfile("j1", "h1", { name: "Test" })

      expect(result).toBeNull()
    })
  })

  describe("deleteJudgeDisplayProfile", () => {
    it("returns deleted true on successful deletion", async () => {
      const chain = createChainableMock({
        data: null,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await deleteJudgeDisplayProfile("j1", "h1")

      expect(result).toEqual({ deleted: true })
    })

    it("returns deleted false when database delete fails", async () => {
      const chain = createChainableMock({
        data: null,
        error: { message: "DB error" },
      })
      setMockFromImplementation(() => chain)

      const result = await deleteJudgeDisplayProfile("j1", "h1")

      expect(result).toEqual({ deleted: false })
    })

    it("cascade-deletes assignments and participant when profile has participant_id", async () => {
      mockMultiTableQuery({
        hackathon_judges_display: {
          data: { participant_id: "p1", clerk_user_id: null },
          error: null,
        },
        judge_assignments: { data: null, error: null },
        hackathon_participants: { data: null, error: null },
      })

      const result = await deleteJudgeDisplayProfile("j1", "h1")

      expect(result).toEqual({ deleted: true })
    })

    it("looks up participant by clerk_user_id when participant_id is null", async () => {
      mockMultiTableQuery({
        hackathon_judges_display: {
          data: { participant_id: null, clerk_user_id: "clerk_1" },
          error: null,
        },
        hackathon_participants: { data: { id: "p1" }, error: null },
        judge_assignments: { data: null, error: null },
      })

      const result = await deleteJudgeDisplayProfile("j1", "h1")

      expect(result).toEqual({ deleted: true })
    })

    it("returns cascadeError when cascade delete fails", async () => {
      mockMultiTableQuery({
        hackathon_judges_display: {
          data: { participant_id: "p1", clerk_user_id: null },
          error: null,
        },
        judge_assignments: { data: null, error: { message: "FK constraint" } },
        hackathon_participants: { data: null, error: { message: "FK constraint" } },
      })

      const result = await deleteJudgeDisplayProfile("j1", "h1")

      expect(result.deleted).toBe(true)
      expect(result.cascadeError).toBeDefined()
    })

    it("skips cascade when profile has no participant_id or clerk_user_id", async () => {
      mockMultiTableQuery({
        hackathon_judges_display: {
          data: { participant_id: null, clerk_user_id: null },
          error: null,
        },
      })

      const result = await deleteJudgeDisplayProfile("j1", "h1")

      expect(result).toEqual({ deleted: true })
    })
  })

  describe("createJudgeDisplayProfile duplicate check", () => {
    it("returns duplicate when clerk_user_id already has a display profile", async () => {
      const chain = createChainableMock({
        data: { id: "existing-j1" },
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await createJudgeDisplayProfile("h1", {
        name: "Jane Doe",
        clerkUserId: "clerk_1",
      })

      expect(result.status).toBe("duplicate")
      if (result.status === "duplicate") {
        expect(result.matchedBy).toBe("clerk_user")
      }
    })

    it("returns duplicate when name matches an existing non-Clerk judge", async () => {
      const chain = createChainableMock({
        data: { id: "existing-j2" },
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await createJudgeDisplayProfile("h1", {
        name: "jane",
      })

      expect(result.status).toBe("duplicate")
      if (result.status === "duplicate") {
        expect(result.matchedBy).toBe("name")
      }
    })

    it("creates profile when name matches but has different clerk_user_id", async () => {
      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createChainableMock({ data: null, error: null })
        }
        return createChainableMock({ data: mockJudge, error: null })
      })

      const result = await createJudgeDisplayProfile("h1", {
        name: "Jane Doe",
        clerkUserId: "clerk_new",
      })

      expect(result.status).toBe("created")
    })

    it("creates profile when clerk_user_id has no existing display profile", async () => {
      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount === 1) {
          return createChainableMock({ data: null, error: null })
        }
        return createChainableMock({ data: mockJudge, error: null })
      })

      const result = await createJudgeDisplayProfile("h1", {
        name: "Jane Doe",
        clerkUserId: "clerk_1",
      })

      expect(result.status).toBe("created")
      if (result.status === "created") {
        expect(result.judge.name).toBe("Jane Doe")
      }
    })
  })

  describe("reorderJudgeDisplayProfiles", () => {
    it("returns true when all updates succeed", async () => {
      const chain = createChainableMock({ data: null, error: null })
      setMockFromImplementation(() => chain)

      const result = await reorderJudgeDisplayProfiles("h1", ["j1", "j2", "j3"])

      expect(result).toBe(true)
    })

    it("returns false when a database update fails", async () => {
      const chain = createChainableMock({ data: null, error: { message: "DB error" } })
      setMockFromImplementation(() => chain)

      const result = await reorderJudgeDisplayProfiles("h1", ["j1", "j2"])

      expect(result).toBe(false)
    })

    it("returns true for empty ordered ids", async () => {
      const result = await reorderJudgeDisplayProfiles("h1", [])

      expect(result).toBe(true)
    })
  })

  describe("countJudgeDisplayProfiles", () => {
    it("returns count of judge profiles", async () => {
      const chain = createChainableMock(mockCount(3))
      setMockFromImplementation(() => chain)

      const result = await countJudgeDisplayProfiles("h1")

      expect(result).toBe(3)
    })

    it("returns 0 when database query fails", async () => {
      const chain = createChainableMock(mockError("DB error"))
      setMockFromImplementation(() => chain)

      const result = await countJudgeDisplayProfiles("h1")

      expect(result).toBe(0)
    })
  })
})
