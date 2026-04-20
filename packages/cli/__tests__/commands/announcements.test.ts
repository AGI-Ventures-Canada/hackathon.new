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

describe("announcements commands", () => {
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
    it("GETs announcements", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ announcements: [{ id: "a1", title: "Welcome", priority: "normal", audience: "all", status: "draft" }] })
      )
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runAnnouncementsList } = await import("../../src/commands/announcements/list")
      await runAnnouncementsList(client, hackathonId, { json: false })
      const url = mockFetch.mock.calls[0][0] as string
      expect(url).toContain(`/api/dashboard/hackathons/${hackathonId}/announcements`)
    })
  })

  describe("create", () => {
    it("POSTs with title, body, priority", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: "a1", title: "Welcome", body: "Hi" }))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runAnnouncementsCreate } = await import("../../src/commands/announcements/create")
      await runAnnouncementsCreate(client, hackathonId, [
        "--title", "Welcome",
        "--body", "Hi",
        "--priority", "urgent",
        "--audience", "judges",
      ])

      const init = mockFetch.mock.calls[0][1] as RequestInit
      expect(init.method).toBe("POST")
      const body = JSON.parse(init.body as string)
      expect(body.title).toBe("Welcome")
      expect(body.body).toBe("Hi")
      expect(body.priority).toBe("urgent")
      expect(body.audience).toBe("judges")
    })

    it("rejects invalid priority", async () => {
      const exitSpy = spyOn(process, "exit").mockImplementation(() => { throw new Error("exit") })
      const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {})
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runAnnouncementsCreate } = await import("../../src/commands/announcements/create")
      await expect(runAnnouncementsCreate(client, hackathonId, [
        "--title", "T", "--body", "B", "--priority", "extreme",
      ])).rejects.toThrow()
      exitSpy.mockRestore()
      consoleErrorSpy.mockRestore()
    })

    it("rejects invalid audience", async () => {
      const exitSpy = spyOn(process, "exit").mockImplementation(() => { throw new Error("exit") })
      const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {})
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runAnnouncementsCreate } = await import("../../src/commands/announcements/create")
      await expect(runAnnouncementsCreate(client, hackathonId, [
        "--title", "T", "--body", "B", "--audience", "aliens",
      ])).rejects.toThrow()
      exitSpy.mockRestore()
      consoleErrorSpy.mockRestore()
    })
  })

  describe("update", () => {
    it("PATCHes with provided fields", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: "a1", title: "Updated" }))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runAnnouncementsUpdate } = await import("../../src/commands/announcements/update")
      await runAnnouncementsUpdate(client, hackathonId, "a1", ["--title", "Updated"])

      const url = mockFetch.mock.calls[0][0] as string
      const init = mockFetch.mock.calls[0][1] as RequestInit
      expect(url).toContain(`/announcements/a1`)
      expect(init.method).toBe("PATCH")
      const body = JSON.parse(init.body as string)
      expect(body).toEqual({ title: "Updated" })
    })
  })

  describe("publish", () => {
    it("POSTs publish endpoint", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: "a1", title: "T" }))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runAnnouncementsPublish } = await import("../../src/commands/announcements/publish")
      await runAnnouncementsPublish(client, hackathonId, "a1", { json: false })
      const url = mockFetch.mock.calls[0][0] as string
      const init = mockFetch.mock.calls[0][1] as RequestInit
      expect(url).toContain(`/announcements/a1/publish`)
      expect(init.method).toBe("POST")
    })
  })

  describe("schedule", () => {
    it("POSTs schedule endpoint with scheduledAt", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: "a1", title: "T" }))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runAnnouncementsSchedule } = await import("../../src/commands/announcements/schedule")
      await runAnnouncementsSchedule(client, hackathonId, "a1", ["--at", "2030-01-01T12:00:00Z"])
      const url = mockFetch.mock.calls[0][0] as string
      const init = mockFetch.mock.calls[0][1] as RequestInit
      expect(url).toContain(`/announcements/a1/schedule`)
      expect(init.method).toBe("POST")
      const body = JSON.parse(init.body as string)
      expect(body.scheduledAt).toBe("2030-01-01T12:00:00Z")
    })
  })

  describe("unpublish", () => {
    it("POSTs unpublish endpoint", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: "a1", title: "T" }))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runAnnouncementsUnpublish } = await import("../../src/commands/announcements/unpublish")
      await runAnnouncementsUnpublish(client, hackathonId, "a1", { json: false })
      const url = mockFetch.mock.calls[0][0] as string
      const init = mockFetch.mock.calls[0][1] as RequestInit
      expect(url).toContain(`/announcements/a1/unpublish`)
      expect(init.method).toBe("POST")
    })
  })

  describe("delete", () => {
    it("DELETEs with --yes", async () => {
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runAnnouncementsDelete } = await import("../../src/commands/announcements/delete")
      await runAnnouncementsDelete(client, hackathonId, "a1", { yes: true })
      const init = mockFetch.mock.calls[0][1] as RequestInit
      expect(init.method).toBe("DELETE")
    })
  })
})
