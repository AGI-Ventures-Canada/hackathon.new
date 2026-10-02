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

describe("prizes commands", () => {
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
    it("shows prizes with type and value", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          prizes: [
            { name: "Best Overall", type: "cash", value: "$1000", assignedSubmissionName: "Winner" },
          ],
        })
      )
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runPrizesList } = await import("../../src/commands/prizes/list")
      await runPrizesList(client, hackathonId, { json: false })
      expect(consoleLogSpy.mock.calls[0][0]).toContain("Best Overall")
    })
  })

  describe("create", () => {
    it("creates a weighted prize before its scorecard exists", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ prize: { id: "p1", name: "Best overall", judging_style: "weighted_score" } }))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runPrizesCreate } = await import("../../src/commands/prizes/create")
      await runPrizesCreate(client, hackathonId, ["--name", "Best overall", "--style", "weighted_score", "--json"])

      expect(mockFetch.mock.calls[0][0]).toContain(`/hackathons/${hackathonId}/prizes`)
      expect(JSON.parse(String(mockFetch.mock.calls[0][1]?.body))).toEqual({ name: "Best overall", judgingStyle: "weighted_score" })
      expect(JSON.parse(consoleLogSpy.mock.calls[0][0])).toMatchObject({ id: "p1", judging_style: "weighted_score" })
    })

    it("rejects an unknown judging method before fetching", async () => {
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runPrizesCreate } = await import("../../src/commands/prizes/create")
      await expect(runPrizesCreate(client, hackathonId, ["--name", "Best overall", "--style", "typo"])).rejects.toThrow("--style must be")
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it("creates prize with flags", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ id: "p1", name: "Best AI App" })
      )
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runPrizesCreate } = await import("../../src/commands/prizes/create")
      await runPrizesCreate(client, hackathonId, ["--name", "Best AI App", "--type", "cash", "--value", "$500"])

      const init = mockFetch.mock.calls[0][1] as RequestInit
      const body = JSON.parse(init.body as string)
      expect(body.name).toBe("Best AI App")
      expect(body.type).toBe("cash")
      expect(body.judgingStyle).toBeUndefined()
    })
  })

  describe("assign", () => {
    it("requires --submission flag", async () => {
      const exitSpy = spyOn(process, "exit").mockImplementation(() => { throw new Error("exit") })
      const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {})
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runPrizesAssign } = await import("../../src/commands/prizes/assign")

      await expect(runPrizesAssign(client, hackathonId, "p1", [])).rejects.toThrow()

      exitSpy.mockRestore()
      consoleErrorSpy.mockRestore()
    })

    it("assigns prize to submission", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ success: true }))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runPrizesAssign } = await import("../../src/commands/prizes/assign")
      await runPrizesAssign(client, hackathonId, "p1", ["--submission", "s1"])

      const init = mockFetch.mock.calls[0][1] as RequestInit
      const body = JSON.parse(init.body as string)
      expect(body.submissionId).toBe("s1")
    })
  })

  describe("reorder", () => {
    it("accepts --ids flag", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ success: true }))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runPrizesReorder } = await import("../../src/commands/prizes/reorder")
      await runPrizesReorder(client, hackathonId, ["--ids", "p1,p2,p3"])

      const init = mockFetch.mock.calls[0][1] as RequestInit
      const body = JSON.parse(init.body as string)
      expect(body.orderedIds).toEqual(["p1", "p2", "p3"])
    })
  })

  describe("update", () => {
    it("sends PATCH with provided fields", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: "p1", name: "Grand Prize" }))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runPrizesUpdate } = await import("../../src/commands/prizes/update")
      await runPrizesUpdate(client, hackathonId, "p1", ["--name", "Grand Prize", "--value", "$2,000"])

      const url = mockFetch.mock.calls[0][0] as string
      const init = mockFetch.mock.calls[0][1] as RequestInit
      expect(url).toContain(`/prizes/p1`)
      expect(init.method).toBe("PATCH")
      const body = JSON.parse(init.body as string)
      expect(body.name).toBe("Grand Prize")
      expect(body.value).toBe("$2,000")
    })

    it("--json outputs updated prize", async () => {
      const prize = { id: "p1", name: "Grand Prize", value: "$2,000" }
      mockFetch.mockResolvedValueOnce(jsonResponse(prize))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runPrizesUpdate } = await import("../../src/commands/prizes/update")
      await runPrizesUpdate(client, hackathonId, "p1", ["--name", "Grand Prize", "--json"])
      expect(JSON.parse(consoleLogSpy.mock.calls[0][0])).toEqual(prize)
    })

    it("exits with error when no fields provided", async () => {
      const exitSpy = spyOn(process, "exit").mockImplementation(() => { throw new Error("exit") })
      const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {})
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runPrizesUpdate } = await import("../../src/commands/prizes/update")
      await expect(runPrizesUpdate(client, hackathonId, "p1", [])).rejects.toThrow()
      exitSpy.mockRestore()
      consoleErrorSpy.mockRestore()
    })
  })

  describe("delete", () => {
    it("confirms before deleting with --yes", async () => {
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runPrizesDelete } = await import("../../src/commands/prizes/delete")
      await runPrizesDelete(client, hackathonId, "p1", { yes: true })

      const url = mockFetch.mock.calls[0][0] as string
      const init = mockFetch.mock.calls[0][1] as RequestInit
      expect(url).toContain(`/prizes/p1`)
      expect(init.method).toBe("DELETE")
    })

    it("skips delete when user declines confirmation", async () => {
      mockConfirm.mockResolvedValueOnce(false)
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runPrizesDelete } = await import("../../src/commands/prizes/delete")
      await runPrizesDelete(client, hackathonId, "p1", { yes: false })
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe("unassign", () => {
    it("sends DELETE with --yes flag", async () => {
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runPrizesUnassign } = await import("../../src/commands/prizes/unassign")
      await runPrizesUnassign(client, hackathonId, "p1", "s1", { yes: true })

      const url = mockFetch.mock.calls[0][0] as string
      const init = mockFetch.mock.calls[0][1] as RequestInit
      expect(url).toContain(`/prizes/p1/assign/s1`)
      expect(init.method).toBe("DELETE")
    })

    it("skips unassign when user declines confirmation", async () => {
      mockConfirm.mockResolvedValueOnce(false)
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runPrizesUnassign } = await import("../../src/commands/prizes/unassign")
      await runPrizesUnassign(client, hackathonId, "p1", "s1", { yes: false })
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })
})
