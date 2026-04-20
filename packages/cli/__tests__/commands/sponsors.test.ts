import { describe, expect, it, mock, beforeEach, afterEach, spyOn } from "bun:test"
import { OatmealClient } from "../../src/client"

const mockFetch = mock<typeof globalThis.fetch>()
const originalFetch = globalThis.fetch

const mockConfirm = mock(() => Promise.resolve(false))
mock.module("@clack/prompts", () => ({
  confirm: mockConfirm,
  text: mock(() => Promise.resolve("")),
  isCancel: () => false,
  log: { info: () => {} },
}))

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

describe("sponsors commands", () => {
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

  const hackathonId = "h1"

  describe("list", () => {
    it("GETs sponsors", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ sponsors: [{ id: "s1", name: "Acme", tier: "gold" }] })
      )
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runSponsorsList } = await import("../../src/commands/sponsors/list")
      await runSponsorsList(client, hackathonId, { json: false })
      const url = mockFetch.mock.calls[0][0] as string
      expect(url).toContain(`/api/dashboard/hackathons/${hackathonId}/sponsors`)
    })
  })

  describe("add", () => {
    it("POSTs with sponsor fields", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: "s1", name: "Acme" }))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runSponsorsAdd } = await import("../../src/commands/sponsors/add")
      await runSponsorsAdd(client, hackathonId, ["--name", "Acme", "--tier", "gold", "--website", "acme.com"])

      const init = mockFetch.mock.calls[0][1] as RequestInit
      expect(init.method).toBe("POST")
      const body = JSON.parse(init.body as string)
      expect(body.name).toBe("Acme")
      expect(body.tier).toBe("gold")
      expect(body.websiteUrl).toBe("acme.com")
    })
  })

  describe("update", () => {
    it("PATCHes only provided fields", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: "s1" }))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runSponsorsUpdate } = await import("../../src/commands/sponsors/update")
      await runSponsorsUpdate(client, hackathonId, "s1", ["--tier", "silver"])

      const url = mockFetch.mock.calls[0][0] as string
      const init = mockFetch.mock.calls[0][1] as RequestInit
      expect(url).toContain(`/sponsors/s1`)
      expect(init.method).toBe("PATCH")
      const body = JSON.parse(init.body as string)
      expect(body).toEqual({ tier: "silver" })
    })

    it("exits when no fields provided", async () => {
      const exitSpy = spyOn(process, "exit").mockImplementation(() => { throw new Error("exit") })
      const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {})
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runSponsorsUpdate } = await import("../../src/commands/sponsors/update")
      await expect(runSponsorsUpdate(client, hackathonId, "s1", [])).rejects.toThrow()
      exitSpy.mockRestore()
      consoleErrorSpy.mockRestore()
    })

    it("rejects invalid tier", async () => {
      const exitSpy = spyOn(process, "exit").mockImplementation(() => { throw new Error("exit") })
      const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {})
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runSponsorsUpdate } = await import("../../src/commands/sponsors/update")
      await expect(runSponsorsUpdate(client, hackathonId, "s1", ["--tier", "platinum"])).rejects.toThrow()
      exitSpy.mockRestore()
      consoleErrorSpy.mockRestore()
    })
  })

  describe("remove", () => {
    it("DELETEs with --yes", async () => {
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runSponsorsRemove } = await import("../../src/commands/sponsors/remove")
      await runSponsorsRemove(client, hackathonId, "s1", { yes: true })
      const url = mockFetch.mock.calls[0][0] as string
      const init = mockFetch.mock.calls[0][1] as RequestInit
      expect(url).toContain(`/sponsors/s1`)
      expect(init.method).toBe("DELETE")
    })
  })

  describe("reorder", () => {
    it("PATCHes with sponsorIds", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ success: true }))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runSponsorsReorder } = await import("../../src/commands/sponsors/reorder")
      await runSponsorsReorder(client, hackathonId, ["--ids", "s1,s2,s3"])
      const url = mockFetch.mock.calls[0][0] as string
      const init = mockFetch.mock.calls[0][1] as RequestInit
      expect(url).toContain(`/sponsors/reorder`)
      expect(init.method).toBe("PATCH")
      const body = JSON.parse(init.body as string)
      expect(body.sponsorIds).toEqual(["s1", "s2", "s3"])
    })
  })
})
