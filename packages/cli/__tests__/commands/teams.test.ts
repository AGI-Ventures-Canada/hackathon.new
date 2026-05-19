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

describe("teams commands", () => {
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
    it("GETs teams", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ teams: [{ id: "t1", name: "Alpha", members: [] }] })
      )
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runTeamsList } = await import("../../src/commands/teams/list")
      await runTeamsList(client, hackathonId, { json: false })
      const url = mockFetch.mock.calls[0][0] as string
      expect(url).toContain(`/api/dashboard/hackathons/${hackathonId}/teams`)
    })
  })

  describe("create", () => {
    it("POSTs with name and captainEmail", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ team: { id: "t1", name: "Alpha" }, invited: false }))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runTeamsCreate } = await import("../../src/commands/teams/create")
      await runTeamsCreate(client, hackathonId, ["--name", "Alpha", "--captain-email", "captain@example.com"])

      const init = mockFetch.mock.calls[0][1] as RequestInit
      expect(init.method).toBe("POST")
      const body = JSON.parse(init.body as string)
      expect(body.name).toBe("Alpha")
      expect(body.captainEmail).toBe("captain@example.com")
    })
  })

  describe("update", () => {
    it("PATCHes name and mode", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: "t1", name: "Alpha-2", mode: "virtual" }))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runTeamsUpdate } = await import("../../src/commands/teams/update")
      await runTeamsUpdate(client, hackathonId, "t1", ["--name", "Alpha-2", "--mode", "virtual"])

      const url = mockFetch.mock.calls[0][0] as string
      const init = mockFetch.mock.calls[0][1] as RequestInit
      expect(url).toContain(`/teams/t1`)
      expect(init.method).toBe("PATCH")
      const body = JSON.parse(init.body as string)
      expect(body).toEqual({ name: "Alpha-2", mode: "virtual" })
    })

    it("rejects invalid mode", async () => {
      const exitSpy = spyOn(process, "exit").mockImplementation(() => { throw new Error("exit") })
      const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {})
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runTeamsUpdate } = await import("../../src/commands/teams/update")
      await expect(runTeamsUpdate(client, hackathonId, "t1", ["--mode", "hybrid"])).rejects.toThrow()
      exitSpy.mockRestore()
      consoleErrorSpy.mockRestore()
    })
  })

  describe("update-members", () => {
    it("PATCHes members endpoint with add/remove arrays", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ success: true }))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runTeamsUpdateMembers } = await import("../../src/commands/teams/update-members")
      await runTeamsUpdateMembers(client, hackathonId, "t1", [
        "--add", "a@x.com,b@x.com",
        "--remove", "c@x.com",
      ])

      const url = mockFetch.mock.calls[0][0] as string
      const init = mockFetch.mock.calls[0][1] as RequestInit
      expect(url).toContain(`/teams/t1/members`)
      expect(init.method).toBe("PATCH")
      const body = JSON.parse(init.body as string)
      expect(body.add).toEqual(["a@x.com", "b@x.com"])
      expect(body.remove).toEqual(["c@x.com"])
    })
  })

  describe("approve", () => {
    it("POSTs to approve a waiting team", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ success: true, team: { id: "t1", name: "Alpha", status: "forming" } }))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runTeamsApprove } = await import("../../src/commands/teams/approve")
      await runTeamsApprove(client, hackathonId, "t1", { json: false })

      const url = mockFetch.mock.calls[0][0] as string
      const init = mockFetch.mock.calls[0][1] as RequestInit
      expect(url).toContain(`/api/dashboard/hackathons/${hackathonId}/teams/t1/approve`)
      expect(init.method).toBe("POST")
    })
  })

  describe("deny", () => {
    it("POSTs to deny a waiting team", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          success: true,
          team: { id: "t1", name: "Alpha", status: "disbanded" },
          membersUnassigned: 2,
          invitesCancelled: 1,
        })
      )
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runTeamsDeny } = await import("../../src/commands/teams/deny")
      await runTeamsDeny(client, hackathonId, "t1", { json: false })

      const url = mockFetch.mock.calls[0][0] as string
      const init = mockFetch.mock.calls[0][1] as RequestInit
      expect(url).toContain(`/api/dashboard/hackathons/${hackathonId}/teams/t1/deny`)
      expect(init.method).toBe("POST")
    })
  })

  describe("assign-room", () => {
    it("POSTs teamId to rooms/:id/teams", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ success: true }))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runTeamsAssignRoom } = await import("../../src/commands/teams/assign-room")
      await runTeamsAssignRoom(client, hackathonId, "r1", ["--team", "t1"])

      const url = mockFetch.mock.calls[0][0] as string
      const init = mockFetch.mock.calls[0][1] as RequestInit
      expect(url).toContain(`/rooms/r1/teams`)
      expect(init.method).toBe("POST")
      const body = JSON.parse(init.body as string)
      expect(body.teamId).toBe("t1")
    })
  })

  describe("unassign-room", () => {
    it("DELETEs rooms/:id/teams/:teamId", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ success: true }))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runTeamsUnassignRoom } = await import("../../src/commands/teams/unassign-room")
      await runTeamsUnassignRoom(client, hackathonId, "r1", "t1")

      const url = mockFetch.mock.calls[0][0] as string
      const init = mockFetch.mock.calls[0][1] as RequestInit
      expect(url).toContain(`/rooms/r1/teams/t1`)
      expect(init.method).toBe("DELETE")
    })
  })
})
