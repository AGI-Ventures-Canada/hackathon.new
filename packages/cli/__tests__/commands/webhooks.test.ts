import { describe, expect, it, mock, beforeEach, afterEach, spyOn } from "bun:test"
import { OatmealClient } from "../../src/client"

const mockFetch = mock<typeof globalThis.fetch>()
const originalFetch = globalThis.fetch

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

describe("webhooks commands", () => {
  let consoleLogSpy: ReturnType<typeof spyOn>

  beforeEach(() => {
    mockFetch.mockReset()
    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {})
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    consoleLogSpy.mockRestore()
  })

  describe("list", () => {
    it("displays webhooks table", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          webhooks: [
            { id: "w1", url: "https://example.com/hook", events: ["submission.created"], isActive: true },
          ],
        })
      )
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runWebhooksList } = await import("../../src/commands/webhooks/list")
      await runWebhooksList(client, { json: false })
      expect(consoleLogSpy.mock.calls[0][0]).toContain("https://example.com/hook")
      expect(consoleLogSpy.mock.calls[0][0]).toContain("Active")
    })
  })

  describe("create", () => {
    it("creates webhook with flags, normalizes bare domains, and shows signing secret", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          id: "w1",
          url: "https://example.com/hook",
          events: ["submission.created"],
          secret: "whsec_test123",
        })
      )
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runWebhooksCreate } = await import("../../src/commands/webhooks/create")
      await runWebhooksCreate(client, ["--url", "example.com/hook", "--events", "submission.created"])

      const allOutput = consoleLogSpy.mock.calls.map((c) => c[0]).join("\n")
      expect(allOutput).toContain("whsec_test123")
      expect(JSON.parse(String(mockFetch.mock.calls[0]?.[1]?.body))).toEqual({
        url: "https://example.com/hook",
        events: ["submission.created"],
      })
    })
  })

  describe("delete", () => {
    it("deletes webhook with --yes", async () => {
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runWebhooksDelete } = await import("../../src/commands/webhooks/delete")
      await runWebhooksDelete(client, "w1", { yes: true })
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
  })
})
