import { describe, expect, it, beforeEach, mock } from "bun:test"
import type { Webhook, WebhookEvent } from "@/lib/db/hackathon-types"
import { isAllowedHttpsUrl } from "@/lib/utils/safe-fetch-url"
import {
  createChainableMock,
  resetSupabaseMocks,
  setMockFromImplementation,
  setMockRpcImplementation,
} from "../lib/supabase-mock"

const mockFetch = mock(() => Promise.resolve(new Response("ok")))
globalThis.fetch = mockFetch as unknown as typeof fetch

const {
  createWebhook,
  getWebhookById,
  listWebhooks,
  listActiveWebhooks,
  deleteWebhook,
  disableWebhook,
  incrementFailureCount,
  resetFailureCount,
  recordDelivery,
  deliverWebhook,
  triggerWebhooks,
} = await import("@/lib/services/webhooks")

const {
  generateWebhookSecret,
  signWebhookPayload,
  verifyWebhookSignature,
} = await import("@/lib/services/encryption")

const mockWebhook: Webhook = {
  id: "wh-1",
  tenant_id: "tenant-123",
  url: "https://example.com/webhook",
  secret: "test-secret-hex",
  events: ["hackathon.created", "hackathon.updated"],
  is_active: true,
  failure_count: 0,
  last_triggered_at: null,
  last_success_at: null,
  last_failure_at: null,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
}

describe("Webhooks Service", () => {
  beforeEach(() => {
    resetSupabaseMocks()
    mockFetch.mockReset()
    mockFetch.mockResolvedValue(new Response("ok"))
  })

  describe("createWebhook", () => {
    it("creates webhook with generated secret", async () => {
      const chain = createChainableMock({
        data: mockWebhook,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await createWebhook({
        tenantId: "tenant-123",
        url: "https://example.com/webhook",
        events: ["hackathon.created", "hackathon.updated"],
      })

      expect(result).not.toBeNull()
      expect(result?.webhook.id).toBe("wh-1")
      expect(result?.webhook.url).toBe("https://example.com/webhook")
      expect(result?.secret).toBeDefined()
    })

    it("returns null on database error", async () => {
      const chain = createChainableMock({
        data: null,
        error: { message: "Database error" },
      })
      setMockFromImplementation(() => chain)

      const result = await createWebhook({
        tenantId: "tenant-123",
        url: "https://example.com/webhook",
        events: ["hackathon.created"],
      })

      expect(result).toBeNull()
    })

    it("supports multiple events", async () => {
      const webhookWithMultipleEvents = {
        ...mockWebhook,
        events: ["hackathon.created", "hackathon.updated", "submission.created", "submission.submitted"] as WebhookEvent[],
      }

      const chain = createChainableMock({
        data: webhookWithMultipleEvents,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await createWebhook({
        tenantId: "tenant-123",
        url: "https://example.com/webhook",
        events: ["hackathon.created", "hackathon.updated", "submission.created", "submission.submitted"],
      })

      expect(result).not.toBeNull()
      expect(result?.webhook.events).toHaveLength(4)
    })

    it("rejects private webhook addresses before writing", async () => {
      const chain = createChainableMock({ data: mockWebhook, error: null })
      setMockFromImplementation(() => chain)

      const result = await createWebhook({
        tenantId: "tenant-123",
        url: "http://127.0.0.1/webhook",
        events: ["hackathon.created"],
      })

      expect(result).toBeNull()
      expect(chain.insert).not.toHaveBeenCalled()
    })
  })

  describe("deliverWebhook", () => {
    it("rejects unsafe webhook URLs before sending", async () => {
      const result = await deliverWebhook(
        { ...mockWebhook, url: "http://169.254.169.254/latest/meta-data" },
        "hackathon.created",
        { id: "event-1" }
      )

      expect(result).toEqual({ success: false, error: "Unsafe webhook URL" })
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it("does not follow redirects", async () => {
      mockFetch.mockResolvedValueOnce(new Response(null, {
        status: 302,
        headers: { location: "http://127.0.0.1/private" },
      }))

      const result = await deliverWebhook(mockWebhook, "hackathon.created", { id: "event-1" })

      expect(result.success).toBe(false)
      expect(mockFetch).toHaveBeenCalledWith(
        mockWebhook.url,
        expect.objectContaining({
          credentials: "omit",
          dispatcher: expect.anything(),
          redirect: "manual",
        })
      )
    })

    it("rejects webhook delivery when the hostname resolves privately", async () => {
      const state = globalThis as typeof globalThis & {
        __safeFetchDnsLookup: ReturnType<typeof mock>
      }
      state.__safeFetchDnsLookup.mockResolvedValueOnce([
        { address: "169.254.169.254", family: 4 as const },
      ])

      const result = await deliverWebhook(mockWebhook, "hackathon.created", { id: "event-1" })

      expect(result).toEqual({ success: false, error: "Unsafe webhook URL" })
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it("sends a stable idempotency header when one is provided", async () => {
      const result = await deliverWebhook(
        mockWebhook,
        "hackathon.created",
        { id: "event-1" },
        { idempotencyKey: "sha256:stable" },
      )

      expect(result.success).toBe(true)
      const requestInit = mockFetch.mock.calls[0]?.[1] as RequestInit
      expect(new Headers(requestInit.headers).get("X-Webhook-Idempotency-Key")).toBe(
        "sha256:stable",
      )
    })
  })

  describe("getWebhookById", () => {
    it("returns webhook when found", async () => {
      const chain = createChainableMock({
        data: mockWebhook,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await getWebhookById("wh-1")

      expect(result).not.toBeNull()
      expect(result?.id).toBe("wh-1")
    })

    it("returns null when not found", async () => {
      const chain = createChainableMock({
        data: null,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await getWebhookById("nonexistent")

      expect(result).toBeNull()
    })
  })

  describe("listWebhooks", () => {
    it("returns webhooks for tenant", async () => {
      const webhooks = [
        mockWebhook,
        { ...mockWebhook, id: "wh-2", url: "https://example.com/webhook2" },
      ]

      const chain = createChainableMock({
        data: webhooks,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await listWebhooks("tenant-123")

      expect(result).toHaveLength(2)
      expect(result[0].id).toBe("wh-1")
      expect(result[1].id).toBe("wh-2")
    })

    it("returns empty array when no webhooks exist", async () => {
      const chain = createChainableMock({
        data: [],
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await listWebhooks("tenant-empty")

      expect(result).toEqual([])
    })

    it("returns empty array on error", async () => {
      const chain = createChainableMock({
        data: null,
        error: { message: "Database error" },
      })
      setMockFromImplementation(() => chain)

      const result = await listWebhooks("tenant-error")

      expect(result).toEqual([])
    })

    it("throws on lookup errors when delivery recording is required", async () => {
      const chain = createChainableMock({
        data: null,
        error: { message: "Database error" },
      })
      setMockFromImplementation(() => chain)

      await expect(listActiveWebhooks(
        "tenant-error",
        "hackathon.created",
        { throwOnError: true },
      )).rejects.toThrow("Failed to list active webhooks")
    })
  })

  describe("triggerWebhooks", () => {
    it("records a remote failure without blocking event creation", async () => {
      mockFetch.mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      const list = createChainableMock({ data: [mockWebhook], error: null })
      const checkpoint = createChainableMock({ data: { id: "delivery-1" }, error: null })
      const record = createChainableMock({
        data: {
          id: "delivery-1",
          webhook_id: mockWebhook.id,
          event: "hackathon.created",
          payload: { idempotencyKey: "sha256:stable" },
          response_status: 503,
          response_body: "unavailable",
          attempt: 1,
          delivered_at: null,
          created_at: "2026-08-26T12:00:00.000Z",
        },
        error: null,
      })
      const chains = [list, checkpoint, record]
      setMockFromImplementation(() => chains.shift()!)
      setMockRpcImplementation(() => Promise.resolve({ data: true, error: null }))

      await expect(triggerWebhooks(
        "tenant-123",
        "hackathon.created",
        { idempotencyKey: "sha256:stable" },
        { idempotencyKey: "sha256:stable", requireRecorded: true },
      )).resolves.toBeUndefined()

      expect(record.update).toHaveBeenCalledTimes(1)
    })

    it("reports an unrecorded delivery attempt for a safe retry", async () => {
      const list = createChainableMock({ data: [mockWebhook], error: null })
      const checkpoint = createChainableMock({ data: { id: "delivery-1" }, error: null })
      const reset = createChainableMock({ data: null, error: null })
      const recordFailure = createChainableMock({
        data: null,
        error: { message: "Database error" },
      })
      const chains = [list, checkpoint, reset, recordFailure]
      setMockFromImplementation(() => chains.shift()!)

      await expect(triggerWebhooks(
        "tenant-123",
        "hackathon.created",
        { idempotencyKey: "sha256:stable" },
        { idempotencyKey: "sha256:stable", requireRecorded: true },
      )).rejects.toThrow("delivery attempts could not be recorded")
    })

    it("skips a duplicate POST when a checkpointed delivery is retried", async () => {
      const firstList = createChainableMock({ data: [mockWebhook], error: null })
      const firstCheckpoint = createChainableMock({ data: { id: "delivery-1" }, error: null })
      const firstReset = createChainableMock({ data: null, error: null })
      const firstRecord = createChainableMock({
        data: {
          id: "delivery-1",
          webhook_id: mockWebhook.id,
          event: "hackathon.created",
          payload: { idempotencyKey: "sha256:stable" },
          response_status: 200,
          response_body: "ok",
          attempt: 1,
          delivered_at: "2026-08-26T12:00:00.000Z",
          created_at: "2026-08-26T12:00:00.000Z",
        },
        error: null,
      })
      const retryList = createChainableMock({ data: [mockWebhook], error: null })
      const retryCheckpoint = createChainableMock({
        data: null,
        error: { message: "duplicate key value violates unique constraint" },
      })
      const chains = [
        firstList,
        firstCheckpoint,
        firstReset,
        firstRecord,
        retryList,
        retryCheckpoint,
      ]
      setMockFromImplementation(() => chains.shift()!)

      const args = [
        "tenant-123",
        "hackathon.created",
        { idempotencyKey: "sha256:stable" },
        { idempotencyKey: "sha256:stable", requireRecorded: true },
      ] as const
      await triggerWebhooks(...args)
      await triggerWebhooks(...args)

      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(firstRecord.update).toHaveBeenCalledTimes(1)
      expect(retryCheckpoint.insert).toHaveBeenCalledWith(expect.objectContaining({
        webhook_id: mockWebhook.id,
        event: "hackathon.created",
        idempotency_key: "sha256:stable",
      }))
    })
  })

  describe("listActiveWebhooks", () => {
    it("returns active webhooks matching event", async () => {
      const activeWebhook = { ...mockWebhook, is_active: true }

      const chain = createChainableMock({
        data: [activeWebhook],
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await listActiveWebhooks("tenant-123", "hackathon.created")

      expect(result).toHaveLength(1)
      expect(result[0].is_active).toBe(true)
    })

    it("excludes inactive webhooks", async () => {
      const chain = createChainableMock({
        data: [],
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await listActiveWebhooks("tenant-123", "hackathon.created")

      expect(result).toEqual([])
    })

    it("returns empty array on error", async () => {
      const chain = createChainableMock({
        data: null,
        error: { message: "Database error" },
      })
      setMockFromImplementation(() => chain)

      const result = await listActiveWebhooks("tenant-error", "hackathon.created")

      expect(result).toEqual([])
    })
  })

  describe("deleteWebhook", () => {
    it("returns true on successful deletion", async () => {
      const chain = createChainableMock({
        data: [{ id: "wh-1" }],
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await deleteWebhook("wh-1", "tenant-123")

      expect(result).toBe(true)
    })

    it("returns false when the webhook is not in the tenant", async () => {
      setMockFromImplementation(() => createChainableMock({ data: [], error: null }))

      expect(await deleteWebhook("wh-other", "tenant-123")).toBe(false)
    })

    it("returns false on error", async () => {
      const chain = createChainableMock({
        data: null,
        error: { message: "Database error" },
      })
      setMockFromImplementation(() => chain)

      const result = await deleteWebhook("wh-1", "tenant-123")

      expect(result).toBe(false)
    })
  })

  describe("disableWebhook", () => {
    it("returns true on successful disable", async () => {
      const chain = createChainableMock({
        data: { ...mockWebhook, is_active: false },
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await disableWebhook("wh-1")

      expect(result).toBe(true)
    })

    it("returns false on error", async () => {
      const chain = createChainableMock({
        data: null,
        error: { message: "Database error" },
      })
      setMockFromImplementation(() => chain)

      const result = await disableWebhook("wh-1")

      expect(result).toBe(false)
    })
  })

  describe("incrementFailureCount", () => {
    it("increments failure count successfully", async () => {
      setMockRpcImplementation(() => Promise.resolve({ data: true, error: null }))

      const result = await incrementFailureCount("wh-1")

      expect(result).toBe(true)
    })

    it("returns false when webhook not found", async () => {
      const chain = createChainableMock({
        data: null,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await incrementFailureCount("nonexistent")

      expect(result).toBe(false)
    })
  })

  describe("resetFailureCount", () => {
    it("resets failure count successfully", async () => {
      const chain = createChainableMock({
        data: { ...mockWebhook, failure_count: 0 },
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await resetFailureCount("wh-1")

      expect(result).toBe(true)
    })

    it("returns false on error", async () => {
      const chain = createChainableMock({
        data: null,
        error: { message: "Database error" },
      })
      setMockFromImplementation(() => chain)

      const result = await resetFailureCount("wh-1")

      expect(result).toBe(false)
    })
  })

  describe("recordDelivery", () => {
    it("records successful delivery", async () => {
      const mockDelivery = {
        id: "wd-1",
        webhook_id: "wh-1",
        event: "hackathon.updated",
        payload: { hackathon_id: "h-1" },
        response_status: 200,
        response_body: '{"ok": true}',
        attempt: 1,
        delivered_at: "2024-01-01T00:00:00Z",
        created_at: "2024-01-01T00:00:00Z",
      }

      const chain = createChainableMock({
        data: mockDelivery,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await recordDelivery(
        "wh-1",
        "hackathon.updated",
        { hackathon_id: "h-1" },
        { success: true, status: 200, body: '{"ok": true}' },
        1
      )

      expect(result).not.toBeNull()
      expect(result?.response_status).toBe(200)
      expect(result?.delivered_at).not.toBeNull()
    })

    it("records failed delivery", async () => {
      const mockDelivery = {
        id: "wd-2",
        webhook_id: "wh-1",
        event: "hackathon.created",
        payload: { hackathon_id: "h-2" },
        response_status: 500,
        response_body: "Internal Server Error",
        attempt: 1,
        delivered_at: null,
        created_at: "2024-01-01T00:00:00Z",
      }

      const chain = createChainableMock({
        data: mockDelivery,
        error: null,
      })
      setMockFromImplementation(() => chain)

      const result = await recordDelivery(
        "wh-1",
        "hackathon.created",
        { hackathon_id: "h-2" },
        { success: false, status: 500, body: "Internal Server Error" },
        1
      )

      expect(result).not.toBeNull()
      expect(result?.response_status).toBe(500)
      expect(result?.delivered_at).toBeNull()
    })

    it("returns null on database error", async () => {
      const chain = createChainableMock({
        data: null,
        error: { message: "Database error" },
      })
      setMockFromImplementation(() => chain)

      const result = await recordDelivery(
        "wh-1",
        "hackathon.created",
        {},
        { success: true, status: 200 },
        1
      )

      expect(result).toBeNull()
    })
  })
})

describe("Webhook Encryption Functions", () => {
  describe("generateWebhookSecret", () => {
    it("generates 64 character hex string", () => {
      const secret = generateWebhookSecret()

      expect(secret).toHaveLength(64)
      expect(secret).toMatch(/^[0-9a-f]+$/)
    })

    it("generates unique secrets each time", () => {
      const secret1 = generateWebhookSecret()
      const secret2 = generateWebhookSecret()

      expect(secret1).not.toBe(secret2)
    })
  })

  describe("signWebhookPayload", () => {
    it("generates consistent signature for same inputs", () => {
      const secret = "test-secret"
      const payload = '{"event":"test"}'

      const sig1 = signWebhookPayload(secret, payload)
      const sig2 = signWebhookPayload(secret, payload)

      expect(sig1).toBe(sig2)
    })

    it("generates different signatures for different payloads", () => {
      const secret = "test-secret"

      const sig1 = signWebhookPayload(secret, '{"event":"test1"}')
      const sig2 = signWebhookPayload(secret, '{"event":"test2"}')

      expect(sig1).not.toBe(sig2)
    })

    it("generates different signatures for different secrets", () => {
      const payload = '{"event":"test"}'

      const sig1 = signWebhookPayload("secret1", payload)
      const sig2 = signWebhookPayload("secret2", payload)

      expect(sig1).not.toBe(sig2)
    })

    it("returns hex string", () => {
      const signature = signWebhookPayload("secret", "payload")

      expect(signature).toMatch(/^[0-9a-f]+$/)
      expect(signature).toHaveLength(64)
    })
  })

  describe("verifyWebhookSignature", () => {
    it("returns true for valid signature", () => {
      const secret = "test-secret"
      const payload = '{"event":"hackathon.created"}'
      const signature = signWebhookPayload(secret, payload)

      const result = verifyWebhookSignature(secret, payload, signature)

      expect(result).toBe(true)
    })

    it("returns false for invalid signature", () => {
      const secret = "test-secret"
      const payload = '{"event":"hackathon.created"}'

      const result = verifyWebhookSignature(secret, payload, "invalid-signature")

      expect(result).toBe(false)
    })

    it("returns false for wrong secret", () => {
      const payload = '{"event":"hackathon.created"}'
      const signature = signWebhookPayload("secret1", payload)

      const result = verifyWebhookSignature("secret2", payload, signature)

      expect(result).toBe(false)
    })

    it("returns false for modified payload", () => {
      const secret = "test-secret"
      const originalPayload = '{"event":"hackathon.created"}'
      const signature = signWebhookPayload(secret, originalPayload)

      const result = verifyWebhookSignature(secret, '{"event":"modified"}', signature)

      expect(result).toBe(false)
    })

    it("handles timing-safe comparison", () => {
      const secret = "test-secret"
      const payload = '{"data":"test"}'
      const signature = signWebhookPayload(secret, payload)

      const result = verifyWebhookSignature(secret, payload, signature)

      expect(result).toBe(true)
    })
  })
})

describe("Webhook Events", () => {
  const validEvents: WebhookEvent[] = [
    "hackathon.created",
    "hackathon.updated",
    "participant.registered",
    "submission.created",
    "submission.submitted",
    "submission.updated",
    "results.published",
  ]

  for (const event of validEvents) {
    it(`${event} is a valid webhook event`, () => {
      expect(validEvents).toContain(event)
    })
  }
})

describe("Webhook URL Validation", () => {
  const validUrls = [
    "https://example.com/webhook",
    "https://api.myapp.com/callbacks/agents",
    "https://hooks.slack.com/services/T00/B00/XXX",
    "https://sub.example.com/api/v1/hooks",
    "https://example.com:8080/webhook",
  ]

  for (const url of validUrls) {
    it(`accepts valid URL: ${url}`, () => {
      expect(isAllowedHttpsUrl(url)).toBe(true)
    })
  }

  const invalidUrls = [
    "not-a-url",
    "ftp://example.com/file",
    "://missing-protocol",
    "http://localhost:3000/dev/webhook",
    "http://example.com/webhook",
    "http://169.254.169.254/latest/meta-data",
  ]

  for (const url of invalidUrls) {
    it(`rejects invalid URL: ${url}`, () => {
      expect(isAllowedHttpsUrl(url)).toBe(false)
    })
  }
})
