import { describe, expect, it, mock, beforeEach, afterEach, spyOn } from "bun:test"
import { OatmealClient } from "../../src/client"

const mockFetch = mock<typeof globalThis.fetch>()
const originalFetch = globalThis.fetch

const mockConfirm = mock(() => Promise.resolve(false))
mock.module("@clack/prompts", () => ({
  confirm: mockConfirm,
  isCancel: () => false,
  log: { info: () => {} },
}))

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

describe("presenter commands", () => {
  let consoleLogSpy: ReturnType<typeof spyOn>
  let consoleErrorSpy: ReturnType<typeof spyOn>

  beforeEach(() => {
    mockFetch.mockReset()
    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {})
    consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    consoleLogSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })

  const hackathonId = "h1"

  describe("list", () => {
    it("hits the dashboard endpoint and prints when present", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          views: [
            {
              id: "v-1",
              name: "Demo",
              config: { kind: "round_finalists", roundId: "r-1" },
              updated_at: "2026-05-10T00:00:00Z",
            },
          ],
        })
      )
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runPresenterList } = await import("../../src/commands/presenter/list")
      await runPresenterList(client, hackathonId, { json: false })

      const url = mockFetch.mock.calls[0][0] as string
      expect(url).toContain(`/api/dashboard/hackathons/${hackathonId}/presenter-views`)
      expect(consoleLogSpy).toHaveBeenCalled()
    })

    it("--json prints raw payload", async () => {
      const payload = { views: [] }
      mockFetch.mockResolvedValueOnce(jsonResponse(payload))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runPresenterList } = await import("../../src/commands/presenter/list")
      await runPresenterList(client, hackathonId, { json: true })
      expect(JSON.parse(consoleLogSpy.mock.calls[0][0])).toEqual(payload)
    })
  })

  describe("create", () => {
    it("requires --name", async () => {
      const exitSpy = spyOn(process, "exit").mockImplementation(() => {
        throw new Error("exit")
      })
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runPresenterCreate } = await import("../../src/commands/presenter/create")
      await expect(
        runPresenterCreate(client, hackathonId, ["--round", "r-1"])
      ).rejects.toThrow("exit")
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("--name"))
      exitSpy.mockRestore()
    })

    it("requires --round or --submissions", async () => {
      const exitSpy = spyOn(process, "exit").mockImplementation(() => {
        throw new Error("exit")
      })
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runPresenterCreate } = await import("../../src/commands/presenter/create")
      await expect(
        runPresenterCreate(client, hackathonId, ["--name", "Demo Day"])
      ).rejects.toThrow("exit")
      exitSpy.mockRestore()
    })

    it("posts a round_finalists config", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ id: "v-1", name: "Round1", config: { kind: "round_finalists", roundId: "r-1" } })
      )
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runPresenterCreate } = await import("../../src/commands/presenter/create")
      await runPresenterCreate(client, hackathonId, [
        "--name",
        "Round1",
        "--round",
        "r-1",
      ])

      const init = mockFetch.mock.calls[0][1] as RequestInit
      const body = JSON.parse(init.body as string)
      expect(body.name).toBe("Round1")
      expect(body.config).toEqual({ kind: "round_finalists", roundId: "r-1" })
    })

    it("parses --submissions into a manual config", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ id: "v-2", name: "Picks", config: { kind: "manual", submissionIds: ["s1", "s2"] } })
      )
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runPresenterCreate } = await import("../../src/commands/presenter/create")
      await runPresenterCreate(client, hackathonId, [
        "--name",
        "Picks",
        "--submissions",
        "s1, s2",
      ])

      const init = mockFetch.mock.calls[0][1] as RequestInit
      const body = JSON.parse(init.body as string)
      expect(body.config).toEqual({ kind: "manual", submissionIds: ["s1", "s2"] })
    })
  })

  describe("delete", () => {
    it("sends DELETE with --yes", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ success: true }))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runPresenterDelete } = await import("../../src/commands/presenter/delete")
      await runPresenterDelete(client, hackathonId, "v-1", { yes: true })

      const init = mockFetch.mock.calls[0][1] as RequestInit
      expect(init.method).toBe("DELETE")
    })

    it("skips when user declines", async () => {
      mockConfirm.mockResolvedValueOnce(false)
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runPresenterDelete } = await import("../../src/commands/presenter/delete")
      await runPresenterDelete(client, hackathonId, "v-1", { yes: false })
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })
})
