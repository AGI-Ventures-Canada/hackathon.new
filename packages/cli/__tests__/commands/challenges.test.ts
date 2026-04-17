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

describe("challenges commands", () => {
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
    it("GETs challenges", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ challenges: [{ id: "c1", title: "AI Track" }] })
      )
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runChallengesList } = await import("../../src/commands/challenges/list")
      await runChallengesList(client, hackathonId, { json: false })
      const url = mockFetch.mock.calls[0][0] as string
      expect(url).toContain(`/api/dashboard/hackathons/${hackathonId}/challenges`)
    })
  })

  describe("create", () => {
    it("POSTs with title, description, resources", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ challenge: { id: "c1", title: "AI Track" } }))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runChallengesCreate } = await import("../../src/commands/challenges/create")
      await runChallengesCreate(client, hackathonId, [
        "--title", "AI Track",
        "--description", "Build with AI",
        "--resources", "Docs|https://docs.ai;Starter|https://start.ai",
      ])

      const init = mockFetch.mock.calls[0][1] as RequestInit
      expect(init.method).toBe("POST")
      const body = JSON.parse(init.body as string)
      expect(body.title).toBe("AI Track")
      expect(body.description).toBe("Build with AI")
      expect(body.resources).toEqual([
        { label: "Docs", url: "https://docs.ai" },
        { label: "Starter", url: "https://start.ai" },
      ])
    })
  })

  describe("update", () => {
    it("PUTs with title change", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ challenge: { id: "c1", title: "Renamed" } }))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runChallengesUpdate } = await import("../../src/commands/challenges/update")
      await runChallengesUpdate(client, hackathonId, "c1", ["--title", "Renamed"])

      const url = mockFetch.mock.calls[0][0] as string
      const init = mockFetch.mock.calls[0][1] as RequestInit
      expect(url).toContain(`/challenges/c1`)
      expect(init.method).toBe("PUT")
      const body = JSON.parse(init.body as string)
      expect(body).toEqual({ title: "Renamed" })
    })
  })

  describe("reorder", () => {
    it("PUTs orderedIds to reorder endpoint", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ success: true }))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runChallengesReorder } = await import("../../src/commands/challenges/reorder")
      await runChallengesReorder(client, hackathonId, ["--ids", "c1,c2"])

      const url = mockFetch.mock.calls[0][0] as string
      const init = mockFetch.mock.calls[0][1] as RequestInit
      expect(url).toContain(`/challenges/reorder`)
      expect(init.method).toBe("PUT")
      const body = JSON.parse(init.body as string)
      expect(body.orderedIds).toEqual(["c1", "c2"])
    })
  })

  describe("delete", () => {
    it("DELETEs with --yes", async () => {
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runChallengesDelete } = await import("../../src/commands/challenges/delete")
      await runChallengesDelete(client, hackathonId, "c1", { yes: true })
      const init = mockFetch.mock.calls[0][1] as RequestInit
      expect(init.method).toBe("DELETE")
    })
  })
})
