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
const VALID_TOKEN = "a".repeat(64)

const {
  createCliAuthSession,
  pollCliAuthSession,
  completeCliAuthSession,
  getCliKeyScopes,
  isValidCliDeviceToken,
} =
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
          device_token: VALID_TOKEN,
          status: "pending",
          expires_at: new Date(Date.now() + 300_000).toISOString(),
        },
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await createCliAuthSession(VALID_TOKEN)
      expect(result).not.toBeNull()
      expect(result.device_token).toBe(VALID_TOKEN)
      expect(result.status).toBe("pending")
    })

    it("throws on database error", async () => {
      const chain = createChainableMock({ data: null, error: { message: "Duplicate" } })
      setMockFromImplementation(() => chain)

      await expect(createCliAuthSession(VALID_TOKEN)).rejects.toThrow("Failed to create CLI auth session")
    })
  })

  describe("pollCliAuthSession", () => {
    it("returns pending for pending session", async () => {
      const deleteChain = createChainableMock({ data: null, error: null })
      const selectChain = createChainableMock({
        data: {
          id: "session-1",
          device_token: VALID_TOKEN,
          status: "pending",
          expires_at: new Date(Date.now() + 300_000).toISOString(),
        },
        error: null,
      })

      setMockFromImplementation((table) => {
        return table === "cli_auth_sessions" ? selectChain : deleteChain
      })

      const result = await pollCliAuthSession(VALID_TOKEN)
      expect(result.status).toBe("pending")
    })

    it("returns expired for unknown token", async () => {
      const chain = createChainableMock({ data: null, error: { message: "Not found" } })
      setMockFromImplementation(() => chain)

      const result = await pollCliAuthSession("b".repeat(64))
      expect(result.status).toBe("expired")
    })

    it("returns expired when session TTL exceeded", async () => {
      const selectChain = createChainableMock({
        data: {
          id: "session-1",
          device_token: VALID_TOKEN,
          status: "pending",
          expires_at: new Date(Date.now() - 60_000).toISOString(),
        },
        error: null,
      })
      const updateChain = createChainableMock({ data: { id: "session-1" }, error: null })

      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        return callCount === 1 ? selectChain : updateChain
      })

      const result = await pollCliAuthSession(VALID_TOKEN)
      expect(result.status).toBe("expired")
    })

    it("returns complete with decrypted key for completed session", async () => {
      const selectChain = createChainableMock({
        data: {
          id: "session-1",
          device_token: VALID_TOKEN,
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
        return callCount === 1 ? selectChain : deleteChain
      })

      const result = await pollCliAuthSession(VALID_TOKEN)
      expect(result.status).toBe("complete")
      expect(result.apiKey).toBe("sk_live_real_key")
    })
  })

  describe("completeCliAuthSession", () => {
    it("creates API key and encrypts it", async () => {
      const selectChain = createChainableMock({
        data: {
          id: "session-1",
          device_token: VALID_TOKEN,
          status: "pending",
          expires_at: new Date(Date.now() + 300_000).toISOString(),
        },
        error: null,
      })
      const updateChain = createChainableMock({ data: null, error: null })

      setMockFromImplementation((table) => {
        return table === "cli_auth_sessions" ? selectChain : updateChain
      })

      const result = await completeCliAuthSession(
        "a".repeat(64),
        "tenant-1",
        ["hackathons:read", "hackathons:write"],
        "test-host"
      )
      expect(result.success).toBe(true)
      expect(mockCreateApiKey).toHaveBeenCalledTimes(1)
    })

    it("rejects if session not found", async () => {
      const chain = createChainableMock({ data: null, error: { message: "Not found" } })
      setMockFromImplementation(() => chain)

      const result = await completeCliAuthSession(
        "a".repeat(64),
        "tenant-1",
        ["hackathons:read"]
      )
      expect(result.success).toBe(false)
      expect(result.error).toContain("not found")
    })

    it("rejects if session expired", async () => {
      const chain = createChainableMock({
        data: {
          id: "session-1",
          device_token: VALID_TOKEN,
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

      const result = await completeCliAuthSession(
        "a".repeat(64),
        "tenant-1",
        ["hackathons:read"]
      )
      expect(result.success).toBe(false)
      expect(result.error).toContain("expired")
    })

    it("assigns full management scopes (not keys:read/write)", async () => {
      const selectChain = createChainableMock({
        data: {
          id: "session-1",
          device_token: VALID_TOKEN,
          status: "pending",
          expires_at: new Date(Date.now() + 300_000).toISOString(),
        },
        error: null,
      })
      setMockFromImplementation(() => selectChain)

      await completeCliAuthSession(
        "a".repeat(64),
        "tenant-1",
        ["hackathons:read", "hackathons:write"]
      )

      const createCall = (mockCreateApiKey.mock.calls[0] as unknown[])[0] as { scopes: string[] }
      expect(createCall.scopes).not.toContain("keys:read")
      expect(createCall.scopes).not.toContain("keys:write")
      expect(createCall.scopes).toContain("hackathons:read")
      expect(createCall.scopes).toContain("hackathons:write")
    })

    it("revokes a new key when session completion loses a race", async () => {
      const chain = createChainableMock({
        data: {
          id: "session-1",
          device_token: "a".repeat(64),
          status: "pending",
          expires_at: new Date(Date.now() + 300_000).toISOString(),
        },
        error: null,
      })
      const failedUpdate = createChainableMock({ data: null, error: null })
      let callCount = 0
      setMockFromImplementation(() => {
        callCount++
        return callCount === 1 ? chain : failedUpdate
      })

      const result = await completeCliAuthSession(
        "a".repeat(64),
        "tenant-1",
        ["hackathons:read"]
      )

      expect(result.success).toBe(false)
    })
  })

  describe("CLI authorization boundaries", () => {
    it("accepts only exact 64-character lowercase hex tokens", () => {
      expect(isValidCliDeviceToken("a".repeat(64))).toBe(true)
      expect(isValidCliDeviceToken("a".repeat(63))).toBe(false)
      expect(isValidCliDeviceToken("g".repeat(64))).toBe(false)
      expect(isValidCliDeviceToken("A".repeat(64))).toBe(false)
    })

    it("does not grant scopes the signed-in member lacks", () => {
      const scopes = getCliKeyScopes([
        "hackathons:read",
        "teams:write",
        "submissions:write",
      ])
      expect(scopes).toEqual([
        "hackathons:read",
        "teams:write",
        "submissions:write",
      ])
      expect(scopes).not.toContain("hackathons:write")
      expect(scopes).not.toContain("org:write")
    })
  })
})
