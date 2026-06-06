import { describe, expect, it, mock, beforeEach, afterEach, spyOn } from "bun:test"
import { OatmealClient } from "../../src/client"

const mockFetch = mock<typeof globalThis.fetch>()
const originalFetch = globalThis.fetch

const mockConfirm = mock(() => Promise.resolve(false))
mock.module("@clack/prompts", () => ({
  confirm: mockConfirm,
  text: mock(() => Promise.resolve("")),
  isCancel: () => false,
  log: { info: () => {}, warn: () => {}, success: () => {} },
}))

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

describe("hackathons commands", () => {
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

  describe("list", () => {
    it("fetches from dashboard endpoint with auth", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ hackathons: [{ name: "My Hack", slug: "my-hack", status: "active" }] })
      )
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runHackathonsList } = await import("../../src/commands/hackathons/list")
      await runHackathonsList(client, { json: false })

      const url = mockFetch.mock.calls[0][0] as string
      expect(url).toContain("/api/dashboard/hackathons")
      expect(consoleLogSpy).toHaveBeenCalled()
    })

    it("--json outputs JSON", async () => {
      const data = { hackathons: [{ name: "Test" }] }
      mockFetch.mockResolvedValueOnce(jsonResponse(data))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runHackathonsList } = await import("../../src/commands/hackathons/list")
      await runHackathonsList(client, { json: true })

      const output = consoleLogSpy.mock.calls[0][0]
      expect(JSON.parse(output)).toEqual(data)
    })
  })

  describe("get", () => {
    it("accepts UUID and fetches directly", async () => {
      const uuid = "12345678-1234-1234-1234-123456789012"
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ id: uuid, name: "Test", slug: "test", status: "active" })
      )
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runHackathonsGet } = await import("../../src/commands/hackathons/get")
      await runHackathonsGet(client, uuid, { json: false })

      const url = mockFetch.mock.calls[0][0] as string
      expect(url).toContain(`/api/dashboard/hackathons/${uuid}`)
    })

    it("accepts slug and resolves to UUID", async () => {
      const uuid = "12345678-1234-1234-1234-123456789012"
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ hackathons: [{ id: uuid, slug: "my-hack" }] }))
        .mockResolvedValueOnce(jsonResponse({ id: uuid, name: "My Hack", slug: "my-hack" }))

      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runHackathonsGet } = await import("../../src/commands/hackathons/get")
      await runHackathonsGet(client, "my-hack", { json: false })

      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
  })

  describe("create", () => {
    it("sends POST with provided flags (non-interactive)", async () => {
      mockFetch
        .mockResolvedValueOnce(
          jsonResponse({
            tenantId: "tenant-org-1",
            tenantName: "Acme Labs",
            tenantType: "organization",
            keyId: "key-1",
            scopes: ["hackathons:write"],
          })
        )
        .mockResolvedValueOnce(
          jsonResponse({ id: "new-id", name: "New Hack", slug: "new-hack" })
        )
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runHackathonsCreate } = await import("../../src/commands/hackathons/create")
      await runHackathonsCreate(client, [
        "--name", "New Hack",
        "--slug", "new-hack",
        "--description", "A test hackathon",
      ])

      const init = mockFetch.mock.calls[1][1] as RequestInit
      const body = JSON.parse(init.body as string)
      expect(body.name).toBe("New Hack")
      expect(body.slug).toBe("new-hack")
    })

    it("imports a hackathon from a supported event URL", async () => {
      mockFetch
        .mockResolvedValueOnce(
          jsonResponse({
            tenantId: "tenant-org-1",
            tenantName: "Acme Labs",
            tenantType: "organization",
            keyId: "key-1",
            scopes: ["hackathons:write"],
          })
        )
        .mockResolvedValueOnce(
          jsonResponse({ id: "imported-id", name: "Imported Hack", slug: "imported-hack" })
        )
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runHackathonsCreate } = await import("../../src/commands/hackathons/create")
      await runHackathonsCreate(client, [
        "--from-url", "lu.ma/imported-hack",
        "--name", "Imported Hack Override",
        "--description", "Imported from event page",
        "--json",
      ])

      const url = mockFetch.mock.calls[1][0] as string
      const init = mockFetch.mock.calls[1][1] as RequestInit
      const body = JSON.parse(init.body as string)

      expect(url).toContain("/api/dashboard/import/url")
      expect(body).toEqual({
        url: "lu.ma/imported-hack",
        name: "Imported Hack Override",
        description: "Imported from event page",
      })
      expect(JSON.parse(consoleLogSpy.mock.calls[0][0])).toEqual({
        id: "imported-id",
        name: "Imported Hack",
        slug: "imported-hack",
      })
    })

    it("imports a hackathon from a non-Luma event page URL", async () => {
      mockFetch
        .mockResolvedValueOnce(
          jsonResponse({
            tenantId: "tenant-org-1",
            tenantName: "Acme Labs",
            tenantType: "organization",
            keyId: "key-1",
            scopes: ["hackathons:write"],
          })
        )
        .mockResolvedValueOnce(
          jsonResponse({ id: "ep-id", name: "Devpost Hack", slug: "devpost-hack" })
        )
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runHackathonsCreate } = await import("../../src/commands/hackathons/create")
      await runHackathonsCreate(client, [
        "--from-url", "https://devpost.com/hackathon/test",
        "--json",
      ])

      const url = mockFetch.mock.calls[1][0] as string
      const init = mockFetch.mock.calls[1][1] as RequestInit
      const body = JSON.parse(init.body as string)

      expect(url).toContain("/api/dashboard/import/url")
      expect(body).toEqual({
        url: "https://devpost.com/hackathon/test",
        name: undefined,
        description: undefined,
      })
      expect(JSON.parse(consoleLogSpy.mock.calls[0][0])).toEqual({
        id: "ep-id",
        name: "Devpost Hack",
        slug: "devpost-hack",
      })
    })

    it("blocks personal workspace creates", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          tenantId: "tenant-personal-1",
          tenantName: "Personal",
          tenantType: "personal",
          keyId: "key-1",
          scopes: ["hackathons:write"],
        })
      )
      const exitSpy = spyOn(process, "exit").mockImplementation(() => { throw new Error("exit") })
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runHackathonsCreate } = await import("../../src/commands/hackathons/create")

      await expect(runHackathonsCreate(client, ["--name", "New Hack"])).rejects.toThrow("exit")

      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("personal workspace"))
      expect(mockFetch).toHaveBeenCalledTimes(1)
      exitSpy.mockRestore()
    })

    it("blocks personal workspace creates even with --yes", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          tenantId: "tenant-personal-1",
          tenantName: "Personal",
          tenantType: "personal",
          keyId: "key-1",
          scopes: ["hackathons:write"],
        })
      )
      const exitSpy = spyOn(process, "exit").mockImplementation(() => { throw new Error("exit") })
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runHackathonsCreate } = await import("../../src/commands/hackathons/create")

      await expect(runHackathonsCreate(client, ["--name", "New Hack", "--yes"])).rejects.toThrow("exit")

      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("personal workspace"))
      expect(mockFetch).toHaveBeenCalledTimes(1)
      exitSpy.mockRestore()
    })

    it("offers a re-login prompt in an interactive TTY", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          tenantId: "tenant-personal-1",
          tenantName: "Personal",
          tenantType: "personal",
          keyId: "key-1",
          scopes: ["hackathons:write"],
        })
      )
      const ttyDescriptor = Object.getOwnPropertyDescriptor(process.stdout, "isTTY")
      Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true })
      const exitSpy = spyOn(process, "exit").mockImplementation(() => { throw new Error("exit") })
      mockConfirm.mockResolvedValueOnce(false)
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runHackathonsCreate } = await import("../../src/commands/hackathons/create")

      await expect(
        runHackathonsCreate(client, [
          "--name",
          "New Hack",
          "--slug",
          "new-hack",
          "--description",
          "test",
        ])
      ).rejects.toThrow("exit")

      expect(mockConfirm).toHaveBeenCalled()
      expect(mockFetch).toHaveBeenCalledTimes(1)
      exitSpy.mockRestore()
      if (ttyDescriptor) {
        Object.defineProperty(process.stdout, "isTTY", ttyDescriptor)
      } else {
        // @ts-expect-error - revert by deletion when there was no descriptor
        delete process.stdout.isTTY
      }
    })
  })

  describe("update", () => {
    it("sends PATCH to /settings endpoint with provided fields", async () => {
      const uuid = "12345678-1234-1234-1234-123456789012"
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: uuid, updatedAt: "2026-01-01" }))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runHackathonsUpdate } = await import("../../src/commands/hackathons/update")
      await runHackathonsUpdate(client, uuid, ["--name", "Updated Hack"])

      const url = mockFetch.mock.calls[0][0] as string
      const init = mockFetch.mock.calls[0][1] as RequestInit
      expect(url).toContain(`/hackathons/${uuid}/settings`)
      expect(init.method).toBe("PATCH")
      expect(JSON.parse(init.body as string).name).toBe("Updated Hack")
    })

    it("sends team approval setting flags", async () => {
      const uuid = "12345678-1234-1234-1234-123456789012"
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: uuid, name: "Updated Hack" }))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runHackathonsUpdate } = await import("../../src/commands/hackathons/update")
      await runHackathonsUpdate(client, uuid, ["--require-team-approval"])

      const init = mockFetch.mock.calls[0][1] as RequestInit
      expect(JSON.parse(init.body as string)).toEqual({ requireTeamApproval: true })
    })

    it("sends late registration setting flags", async () => {
      const uuid = "12345678-1234-1234-1234-123456789012"
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: uuid, name: "Updated Hack" }))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runHackathonsUpdate } = await import("../../src/commands/hackathons/update")
      await runHackathonsUpdate(client, uuid, ["--no-allow-late-registration"])

      const init = mockFetch.mock.calls[0][1] as RequestInit
      expect(JSON.parse(init.body as string)).toEqual({ allowLateRegistration: false })
    })

    it("--json outputs full hackathon returned by PATCH", async () => {
      const uuid = "12345678-1234-1234-1234-123456789012"
      const hackathon = { id: uuid, name: "Updated Hack", slug: "updated-hack" }
      mockFetch.mockResolvedValueOnce(jsonResponse(hackathon))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runHackathonsUpdate } = await import("../../src/commands/hackathons/update")
      await runHackathonsUpdate(client, uuid, ["--name", "Updated Hack", "--json"])

      expect(JSON.parse(consoleLogSpy.mock.calls[0][0])).toEqual(hackathon)
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it("exits with error when no fields provided", async () => {
      const uuid = "12345678-1234-1234-1234-123456789012"
      const exitSpy = spyOn(process, "exit").mockImplementation(() => { throw new Error("exit") })
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runHackathonsUpdate } = await import("../../src/commands/hackathons/update")
      await expect(runHackathonsUpdate(client, uuid, [])).rejects.toThrow()
      exitSpy.mockRestore()
    })
  })

  describe("delete", () => {
    it("sends DELETE request with --yes flag", async () => {
      const uuid = "12345678-1234-1234-1234-123456789012"
      mockFetch.mockResolvedValueOnce(jsonResponse({ success: true }))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runHackathonsDelete } = await import("../../src/commands/hackathons/delete")
      await runHackathonsDelete(client, uuid, { yes: true })

      const url = mockFetch.mock.calls[0][0] as string
      const init = mockFetch.mock.calls[0][1] as RequestInit
      expect(url).toContain(`/hackathons/${uuid}`)
      expect(init.method).toBe("DELETE")
    })

    it("skips delete when user declines confirmation", async () => {
      mockConfirm.mockResolvedValueOnce(false)
      const uuid = "12345678-1234-1234-1234-123456789012"
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { runHackathonsDelete } = await import("../../src/commands/hackathons/delete")
      await runHackathonsDelete(client, uuid, { yes: false })
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe("resolve", () => {
    it("returns UUID directly without fetching", async () => {
      const uuid = "12345678-1234-1234-1234-123456789012"
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { resolveHackathonId } = await import("../../src/commands/hackathons/resolve")
      const result = await resolveHackathonId(client, uuid)
      expect(result).toBe(uuid)
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it("resolves slug by listing all hackathons", async () => {
      const uuid = "12345678-1234-1234-1234-123456789012"
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ hackathons: [{ id: uuid, slug: "my-hackathon" }] })
      )
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { resolveHackathonId } = await import("../../src/commands/hackathons/resolve")
      const result = await resolveHackathonId(client, "my-hackathon")
      expect(result).toBe(uuid)
    })

    it("throws when slug not found", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ hackathons: [] }))
      const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })
      const { resolveHackathonId } = await import("../../src/commands/hackathons/resolve")
      await expect(resolveHackathonId(client, "no-such-slug")).rejects.toThrow("Hackathon not found")
    })
  })
})
