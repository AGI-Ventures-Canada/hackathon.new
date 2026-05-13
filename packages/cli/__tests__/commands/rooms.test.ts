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

describe("rooms commands", () => {
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

  const hackathonId = "11111111-1111-1111-1111-111111111111"
  const roomId = "22222222-2222-2222-2222-222222222222"
  const judgeId = "33333333-3333-3333-3333-333333333333"

  describe("judges add", () => {
    it("POSTs judgeParticipantId", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ success: true }))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runRoomsJudgesAdd } = await import("../../src/commands/rooms/judges-add")
      await runRoomsJudgesAdd(client, hackathonId, roomId, ["--judge", judgeId])

      const url = mockFetch.mock.calls[0][0] as string
      const init = mockFetch.mock.calls[0][1] as RequestInit
      expect(url).toContain(`/hackathons/${hackathonId}/rooms/${roomId}/judges`)
      expect(init.method).toBe("POST")
      expect(JSON.parse(init.body as string)).toEqual({ judgeParticipantId: judgeId })
    })
  })

  describe("judges remove", () => {
    it("DELETEs the judge", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ success: true }))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runRoomsJudgesRemove } = await import("../../src/commands/rooms/judges-remove")
      await runRoomsJudgesRemove(client, hackathonId, roomId, judgeId)

      const url = mockFetch.mock.calls[0][0] as string
      const init = mockFetch.mock.calls[0][1] as RequestInit
      expect(url).toContain(`/rooms/${roomId}/judges/${judgeId}`)
      expect(init.method).toBe("DELETE")
    })
  })

  describe("auto-assign get", () => {
    it("GETs the toggle and prints state", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ enabled: true }))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runRoomsAutoAssignGet } = await import("../../src/commands/rooms/auto-assign-get")
      await runRoomsAutoAssignGet(client, hackathonId, { json: false })

      const url = mockFetch.mock.calls[0][0] as string
      expect(url).toContain(`/hackathons/${hackathonId}/auto-assign-by-room`)
      const printed = consoleLogSpy.mock.calls.map((c) => String(c[0])).join("\n")
      expect(printed).toContain("on")
    })
  })

  describe("auto-assign set", () => {
    it("PATCHes enabled=true on --on", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ enabled: true }))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runRoomsAutoAssignSet } = await import("../../src/commands/rooms/auto-assign-set")
      await runRoomsAutoAssignSet(client, hackathonId, ["--on"])

      const init = mockFetch.mock.calls[0][1] as RequestInit
      expect(init.method).toBe("PATCH")
      expect(JSON.parse(init.body as string)).toEqual({ enabled: true })
    })

    it("PATCHes enabled=false on --off", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ enabled: false }))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runRoomsAutoAssignSet } = await import("../../src/commands/rooms/auto-assign-set")
      await runRoomsAutoAssignSet(client, hackathonId, ["--off"])

      const init = mockFetch.mock.calls[0][1] as RequestInit
      expect(JSON.parse(init.body as string)).toEqual({ enabled: false })
    })
  })

  describe("auto-assign sync", () => {
    it("POSTs and prints a routed summary", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          submissionsProcessed: 3,
          totalAssignmentsCreated: 5,
          reasonCounts: { routed: 3 },
        })
      )
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runRoomsAutoAssignSync } = await import("../../src/commands/rooms/auto-assign-sync")
      await runRoomsAutoAssignSync(client, hackathonId, { json: false })

      const url = mockFetch.mock.calls[0][0] as string
      expect(url).toContain(`/auto-assign-by-room/sync`)
      const printed = consoleLogSpy.mock.calls.map((c) => String(c[0])).join("\n")
      expect(printed).toContain("Synced 5")
    })

    it("reports skipped status when backend signals hackathon_status", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          submissionsProcessed: 0,
          totalAssignmentsCreated: 0,
          reasonCounts: {},
          skipped: "hackathon_status",
        })
      )
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runRoomsAutoAssignSync } = await import("../../src/commands/rooms/auto-assign-sync")
      await runRoomsAutoAssignSync(client, hackathonId, { json: false })

      const printed = consoleLogSpy.mock.calls.map((c) => String(c[0])).join("\n")
      expect(printed.toLowerCase()).toContain("not live")
    })
  })
})
