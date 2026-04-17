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

describe("schedule (event-scoped) commands", () => {
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
    it("GETs schedule items", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ scheduleItems: [{ id: "i1", title: "Opening", startsAt: "2030-01-01T09:00:00Z" }] })
      )
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runScheduleList } = await import("../../src/commands/schedule/list")
      await runScheduleList(client, hackathonId, { json: false })
      const url = mockFetch.mock.calls[0][0] as string
      expect(url).toContain(`/api/dashboard/hackathons/${hackathonId}/schedule`)
    })
  })

  describe("add", () => {
    it("POSTs schedule item", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: "i1", title: "Opening" }))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runScheduleAdd } = await import("../../src/commands/schedule/add")
      await runScheduleAdd(client, hackathonId, [
        "--title", "Opening",
        "--starts-at", "2030-01-01T09:00:00Z",
        "--ends-at", "2030-01-01T10:00:00Z",
        "--location", "Main Hall",
      ])

      const init = mockFetch.mock.calls[0][1] as RequestInit
      expect(init.method).toBe("POST")
      const body = JSON.parse(init.body as string)
      expect(body.title).toBe("Opening")
      expect(body.startsAt).toBe("2030-01-01T09:00:00Z")
      expect(body.endsAt).toBe("2030-01-01T10:00:00Z")
      expect(body.location).toBe("Main Hall")
    })
  })

  describe("update", () => {
    it("PATCHes with provided fields", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: "i1", title: "Renamed" }))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runScheduleUpdate } = await import("../../src/commands/schedule/update")
      await runScheduleUpdate(client, hackathonId, "i1", ["--title", "Renamed"])

      const url = mockFetch.mock.calls[0][0] as string
      const init = mockFetch.mock.calls[0][1] as RequestInit
      expect(url).toContain(`/schedule/i1`)
      expect(init.method).toBe("PATCH")
      const body = JSON.parse(init.body as string)
      expect(body).toEqual({ title: "Renamed" })
    })
  })

  describe("delete", () => {
    it("DELETEs with --yes", async () => {
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runScheduleDelete } = await import("../../src/commands/schedule/delete")
      await runScheduleDelete(client, hackathonId, "i1", { yes: true })
      const url = mockFetch.mock.calls[0][0] as string
      const init = mockFetch.mock.calls[0][1] as RequestInit
      expect(url).toContain(`/schedule/i1`)
      expect(init.method).toBe("DELETE")
    })
  })
})
