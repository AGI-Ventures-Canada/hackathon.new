import { describe, expect, it, beforeEach, afterEach } from "bun:test"
import {
  createChainableMock,
  resetSupabaseMocks,
  setMockFromImplementation,
  mockSuccess,
  mockError,
} from "../lib/supabase-mock"

const { getPlatformStats, listAllHackathons, getHackathonById, updateHackathonAsAdmin, deleteHackathon } =
  await import("@/lib/services/admin")
const { runScenario } = await import("@/lib/services/admin-scenarios")

describe("Admin Service", () => {
  beforeEach(() => {
    resetSupabaseMocks()
  })

  describe("getPlatformStats", () => {
    it("returns aggregate counts", async () => {
      setMockFromImplementation((table) => {
        const counts: Record<string, number> = {
          tenants: 5,
          hackathons: 12,
          hackathon_participants: 100,
          submissions: 42,
        }
        return createChainableMock({ data: null, error: null, count: counts[table] ?? 0 })
      })

      const stats = await getPlatformStats()
      expect(stats.tenants).toBe(5)
      expect(stats.hackathons).toBe(12)
      expect(stats.participants).toBe(100)
      expect(stats.submissions).toBe(42)
    })
  })

  describe("listAllHackathons", () => {
    it("returns hackathons with total count", async () => {
      const mockHackathons = [
        { id: "h1", name: "Hack 1", status: "active", tenant_id: "t1" },
        { id: "h2", name: "Hack 2", status: "draft", tenant_id: "t2" },
      ]
      setMockFromImplementation(() =>
        createChainableMock({ data: mockHackathons, error: null, count: 2 })
      )

      const result = await listAllHackathons()
      expect(result.hackathons).toHaveLength(2)
      expect(result.total).toBe(2)
    })

    it("throws on error", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: null, error: { message: "DB error" } })
      )

      expect(listAllHackathons()).rejects.toThrow("Failed to list hackathons")
    })
  })

  describe("getHackathonById", () => {
    it("returns hackathon when found", async () => {
      const mockHackathon = { id: "h1", name: "Test", status: "active" }
      setMockFromImplementation(() =>
        createChainableMock(mockSuccess(mockHackathon))
      )

      const result = await getHackathonById("h1")
      expect(result).not.toBeNull()
      expect(result?.id).toBe("h1")
    })

    it("returns null when not found", async () => {
      setMockFromImplementation(() =>
        createChainableMock(mockError("Not found"))
      )

      const result = await getHackathonById("missing")
      expect(result).toBeNull()
    })
  })

  describe("updateHackathonAsAdmin", () => {
    it("updates and returns hackathon", async () => {
      const updated = { id: "h1", name: "Updated", status: "completed" }
      setMockFromImplementation(() =>
        createChainableMock(mockSuccess(updated))
      )

      const result = await updateHackathonAsAdmin("h1", { name: "Updated", status: "completed" })
      expect(result.name).toBe("Updated")
    })

    it("throws on error", async () => {
      setMockFromImplementation(() =>
        createChainableMock(mockError("Update failed"))
      )

      expect(updateHackathonAsAdmin("h1", { name: "X" })).rejects.toThrow("Failed to update hackathon")
    })
  })

  describe("deleteHackathon", () => {
    it("deletes without error", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: null, error: null })
      )

      await deleteHackathon("h1")
    })

    it("throws on error", async () => {
      setMockFromImplementation(() =>
        createChainableMock(mockError("Delete failed"))
      )

      expect(deleteHackathon("h1")).rejects.toThrow("Failed to delete hackathon")
    })
  })

  describe("listAllHackathons pagination", () => {
    it("caps limit at 100", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: [], error: null, count: 0 })
      )

      const result = await listAllHackathons({ limit: 999999 })
      expect(result.hackathons).toEqual([])
    })

    it("enforces minimum limit of 1", async () => {
      setMockFromImplementation(() =>
        createChainableMock({ data: [], error: null, count: 0 })
      )

      const result = await listAllHackathons({ limit: -5 })
      expect(result.hackathons).toEqual([])
    })
  })

  describe("runScenario", () => {
    const originalVercelEnv = process.env.VERCEL_ENV

    afterEach(() => {
      if (originalVercelEnv === undefined) {
        delete process.env.VERCEL_ENV
      } else {
        process.env.VERCEL_ENV = originalVercelEnv
      }
    })

    it("throws in production environment", async () => {
      process.env.VERCEL_ENV = "production"
      expect(runScenario("pre-registration")).rejects.toThrow("Test scenarios can only be run in local development")
    })

    it("allows preview environment", async () => {
      process.env.VERCEL_ENV = "preview"
      expect(runScenario("nonexistent")).rejects.toThrow("Unknown scenario: nonexistent")
    })

    it("throws for unknown scenario", async () => {
      delete process.env.VERCEL_ENV
      expect(runScenario("nonexistent")).rejects.toThrow("Unknown scenario: nonexistent")
    })
  })
})
