import { describe, expect, it, beforeEach, mock } from "bun:test"
import {
  createChainableMock,
  resetSupabaseMocks,
  setMockFromImplementation,
} from "../lib/supabase-mock"

const mockCreateApiKey = mock(() =>
  Promise.resolve({
    apiKey: { id: "key-1", name: "hackathon.new CLI (test, 2026-03-08)" },
    rawKey: "sk_live_test123",
  })
)

mock.module("@/lib/services/api-keys", () => ({
  createApiKey: mockCreateApiKey,
  verifyApiKey: mock(() => Promise.resolve(null)),
  listApiKeys: mock(() => Promise.resolve([])),
  revokeApiKey: mock(() => Promise.resolve(true)),
  getApiKeyById: mock(() => Promise.resolve(null)),
}))

const { encryptToken } = await import("@/lib/services/encryption")

const { createCliAuthSession, pollCliAuthSession, completeCliAuthSession } =
  await import("@/lib/services/cli-auth")

describe("cli-auth service", () => {
  beforeEach(() => {
    resetSupabaseMocks()
    mockCreateApiKey.mockClear()
  })

  describe("createCliAuthSession", () => {
    it("creates session with device_token and pending status", async () => {
      const chain = createChainableMock({
        data: {
          id: "session-1",
          device_token: "abc123",
          status: "pending",
          expires_at: new Date(Date.now() + 300_000).toISOString(),
        },
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await createCliAuthSession("abc123")
      expect(result).not.toBeNull()
      expect(result.device_token).toBe("abc123")
      expect(result.status).toBe("pending")
    })

    it("throws on database error", async () => {
      const chain = createChainableMock({ data: null, error: { message: "Duplicate" } })
      setMockFromImplementation(() => chain)

      await expect(createCliAuthSession("abc123")).rejects.toThrow("Failed to create CLI auth session")
    })
  })

  describe("pollCliAuthSession", () => {
    it("returns pending for pending session", async () => {
      const deleteChain = createChainableMock({ data: null, error: null })
      const selectChain = createChainableMock({
        data: {
          id: "session-1",
          device_token: "abc123",
          status: "pending",
          expires_at: new Date(Date.now() + 300_000).toISOString(),
        },
        error: null,
      })

      setMockFromImplementation((table) => {
        return table === "cli_auth_sessions" ? selectChain : deleteChain
      })

      const result = await pollCliAuthSession("abc123")
      expect(result.status).toBe("pending")
    })

    it("returns expired for unknown token", async () => {
      const chain = createChainableMock({ data: null, error: { message: "Not found" } })
      setMockFromImplementation(() => chain)

      const result = await pollCliAuthSession("unknown-token")
      expect(result.status).toBe("expired")
    })

    it("returns expired when session TTL exceeded", async () => {
      const selectChain = createChainableMock({
        data: {
          id: "session-1",
          device_token: "abc123",
          status: "pending",
          expires_at: new Date(Date.now() - 60_000).toISOString(),
        },
        error: null,
      })
      const updateChain = createChainableMock({ data: null, error: null })

      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        if (callCount <= 2) return updateChain
        return selectChain
      })

      const result = await pollCliAuthSession("abc123")
      expect(result.status).toBe("expired")
    })

    it("returns complete with decrypted key for completed session", async () => {
      const selectChain = createChainableMock({
        data: {
          id: "session-1",
          device_token: "abc123",
          status: "complete",
          encrypted_api_key: encryptToken("sk_live_real_key"),
          expires_at: new Date(Date.now() + 300_000).toISOString(),
        },
        error: null,
      })
      const deleteChain = createChainableMock({ data: null, error: null })

      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        // Call 1 = cleanupExpiredSessions (delete), Call 2 = select query, Call 3 = delete session after returning key
        if (callCount === 1) return deleteChain
        if (callCount === 3) return deleteChain
        return selectChain
      })

      const result = await pollCliAuthSession("abc123")
      expect(result.status).toBe("complete")
      expect(result.apiKey).toBe("sk_live_real_key")
    })
  })

  describe("completeCliAuthSession", () => {
    it("creates API key and encrypts it", async () => {
      const selectChain = createChainableMock({
        data: {
          id: "session-1",
          device_token: "abc123",
          status: "pending",
          expires_at: new Date(Date.now() + 300_000).toISOString(),
        },
        error: null,
      })
      const updateChain = createChainableMock({ data: null, error: null })

      setMockFromImplementation((table) => {
        return table === "cli_auth_sessions" ? selectChain : updateChain
      })

      const result = await completeCliAuthSession("abc123", "tenant-1", "test-host")
      expect(result.success).toBe(true)
      expect(mockCreateApiKey).toHaveBeenCalledTimes(1)
    })

    it("rejects if session not found", async () => {
      const chain = createChainableMock({ data: null, error: { message: "Not found" } })
      setMockFromImplementation(() => chain)

      const result = await completeCliAuthSession("nonexistent", "tenant-1")
      expect(result.success).toBe(false)
      expect(result.error).toContain("not found")
    })

    it("rejects if session expired", async () => {
      const chain = createChainableMock({
        data: {
          id: "session-1",
          device_token: "abc123",
          status: "pending",
          expires_at: new Date(Date.now() - 60_000).toISOString(),
        },
        error: null,
      })
      const updateChain = createChainableMock({ data: null, error: null })

      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        return callCount === 1 ? chain : updateChain
      })

      const result = await completeCliAuthSession("abc123", "tenant-1")
      expect(result.success).toBe(false)
      expect(result.error).toContain("expired")
    })

    it("assigns full management scopes (not keys:read/write)", async () => {
      const selectChain = createChainableMock({
        data: {
          id: "session-1",
          device_token: "abc123",
          status: "pending",
          expires_at: new Date(Date.now() + 300_000).toISOString(),
        },
        error: null,
      })
      setMockFromImplementation(() => selectChain)

      await completeCliAuthSession("abc123", "tenant-1")

      const createCall = (mockCreateApiKey.mock.calls[0] as unknown[])[0] as { scopes: string[] }
      expect(createCall.scopes).not.toContain("keys:read")
      expect(createCall.scopes).not.toContain("keys:write")
      expect(createCall.scopes).toContain("hackathons:read")
      expect(createCall.scopes).toContain("hackathons:write")
    })
  })
})
