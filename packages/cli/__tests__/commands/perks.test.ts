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

describe("perks commands", () => {
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
    it("GETs perks for hackathon", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ perks: [{ id: "pk1", name: "OpenAI Credits", type: "credit" }] })
      )
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runPerksList } = await import("../../src/commands/perks/list")
      await runPerksList(client, hackathonId, { json: false })
      const url = mockFetch.mock.calls[0][0] as string
      expect(url).toContain(`/api/dashboard/hackathons/${hackathonId}/perks`)
    })
  })

  describe("create", () => {
    it("POSTs with perk fields", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ perk: { id: "pk1", name: "API Key", type: "api_key" } }))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runPerksCreate } = await import("../../src/commands/perks/create")
      await runPerksCreate(client, hackathonId, ["--name", "API Key", "--type", "api_key", "--code", "secret"])

      const init = mockFetch.mock.calls[0][1] as RequestInit
      expect(init.method).toBe("POST")
      const body = JSON.parse(init.body as string)
      expect(body.name).toBe("API Key")
      expect(body.type).toBe("api_key")
      expect(body.code).toBe("secret")
    })
  })

  describe("update", () => {
    it("PUTs only provided fields", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ perk: { id: "pk1", name: "Renamed" } }))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runPerksUpdate } = await import("../../src/commands/perks/update")
      await runPerksUpdate(client, hackathonId, "pk1", ["--name", "Renamed"])

      const url = mockFetch.mock.calls[0][0] as string
      const init = mockFetch.mock.calls[0][1] as RequestInit
      expect(url).toContain(`/perks/pk1`)
      expect(init.method).toBe("PUT")
      const body = JSON.parse(init.body as string)
      expect(body).toEqual({ name: "Renamed" })
    })

    it("exits when no fields provided", async () => {
      const exitSpy = spyOn(process, "exit").mockImplementation(() => { throw new Error("exit") })
      const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {})
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runPerksUpdate } = await import("../../src/commands/perks/update")
      await expect(runPerksUpdate(client, hackathonId, "pk1", [])).rejects.toThrow()
      exitSpy.mockRestore()
      consoleErrorSpy.mockRestore()
    })

    it("rejects invalid type", async () => {
      const exitSpy = spyOn(process, "exit").mockImplementation(() => { throw new Error("exit") })
      const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {})
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runPerksUpdate } = await import("../../src/commands/perks/update")
      await expect(runPerksUpdate(client, hackathonId, "pk1", ["--type", "bogus"])).rejects.toThrow()
      exitSpy.mockRestore()
      consoleErrorSpy.mockRestore()
    })
  })

  describe("delete", () => {
    it("DELETEs with --yes", async () => {
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runPerksDelete } = await import("../../src/commands/perks/delete")
      await runPerksDelete(client, hackathonId, "pk1", { yes: true })
      const init = mockFetch.mock.calls[0][1] as RequestInit
      expect(init.method).toBe("DELETE")
    })
  })

  describe("release", () => {
    it("POSTs to release endpoint", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ perk: { id: "pk1", name: "API Key" } }))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runPerksRelease } = await import("../../src/commands/perks/release")
      await runPerksRelease(client, hackathonId, "pk1", { json: false })
      const url = mockFetch.mock.calls[0][0] as string
      const init = mockFetch.mock.calls[0][1] as RequestInit
      expect(url).toContain(`/perks/pk1/release`)
      expect(init.method).toBe("POST")
    })
  })
})
