import { describe, expect, it, mock, spyOn } from "bun:test"
import { getBrowserCommand, parseLoginOptions, validateBaseUrl } from "../../src/commands/login"
import { AUTH_TIMEOUT_MS } from "../../src/constants"

describe("parseLoginOptions", () => {
  it("uses a 10 minute auth timeout", () => {
    expect(AUTH_TIMEOUT_MS).toBe(600_000)
  })

  it("parses --api-key flag", () => {
    const options = parseLoginOptions(["--api-key", "sk_live_test"])
    expect(options.apiKey).toBe("sk_live_test")
  })

  it("parses --no-browser flag", () => {
    const options = parseLoginOptions(["--no-browser"])
    expect(options.noBrowser).toBe(true)
  })

  it("parses --base-url flag", () => {
    const options = parseLoginOptions(["--base-url", "http://localhost:3000"])
    expect(options.baseUrl).toBe("http://localhost:3000")
  })

  it("parses --yes flag", () => {
    const options = parseLoginOptions(["--yes"])
    expect(options.yes).toBe(true)
  })

  it("parses -y shorthand", () => {
    const options = parseLoginOptions(["-y"])
    expect(options.yes).toBe(true)
  })

  it("parses all flags together", () => {
    const options = parseLoginOptions([
      "--api-key", "sk_live_xxx",
      "--base-url", "http://staging.test",
      "--yes",
    ])
    expect(options.apiKey).toBe("sk_live_xxx")
    expect(options.baseUrl).toBe("http://staging.test")
    expect(options.yes).toBe(true)
  })

  it("returns empty options for no args", () => {
    const options = parseLoginOptions([])
    expect(options.apiKey).toBeUndefined()
    expect(options.noBrowser).toBeUndefined()
    expect(options.baseUrl).toBeUndefined()
    expect(options.yes).toBeUndefined()
  })
})

describe("getBrowserCommand", () => {
  const url = "https://example.com/cli-auth#token=abc;touch /tmp/pwned"

  it("passes the URL as one macOS process argument", () => {
    expect(getBrowserCommand(url, "darwin")).toEqual({
      executable: "open",
      args: [url],
    })
  })

  it("passes the URL as one Linux process argument", () => {
    expect(getBrowserCommand(url, "linux")).toEqual({
      executable: "xdg-open",
      args: [url],
    })
  })

  it("uses the Windows URL handler without a shell", () => {
    expect(getBrowserCommand(url, "win32")).toEqual({
      executable: "rundll32.exe",
      args: ["url.dll,FileProtocolHandler", url],
    })
  })
})

describe("validateBaseUrl", () => {
  it("requires HTTPS outside loopback development", () => {
    expect(validateBaseUrl("https://hackathon.new/")).toBe("https://hackathon.new")
    expect(validateBaseUrl("http://localhost:3000")).toBe("http://localhost:3000")
    expect(() => validateBaseUrl("http://staging.example.com")).toThrow("must use HTTPS")
  })
})

describe("logout", () => {
  it("runLogout completes without error when not logged in", async () => {
    const { runLogout } = await import("../../src/commands/logout")
    // This should not throw even if no config exists
    await runLogout()
  })
})

describe("whoami", () => {
  it("runWhoAmI outputs JSON when --json flag is set", async () => {
    const mockFetch = mock<typeof globalThis.fetch>()
    const originalFetch = globalThis.fetch
    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch

    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          tenantId: "t1",
          tenantName: "Acme Labs",
          tenantSlug: "acme-labs",
          tenantType: "organization",
          keyId: "k1",
          keyName: "Test Key",
          scopes: ["hackathons:read"],
        }),
        { headers: { "Content-Type": "application/json" } }
      )
    )

    const { OatmealClient } = await import("../../src/client")
    const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })

    const consoleLogSpy = spyOn(console, "log").mockImplementation(() => {})
    const { runWhoAmI } = await import("../../src/commands/whoami")
    await runWhoAmI(client, { json: true })

    const output = consoleLogSpy.mock.calls[0][0]
    const parsed = JSON.parse(output)
    expect(parsed.tenantId).toBe("t1")
    expect(parsed.tenantName).toBe("Acme Labs")
    expect(parsed.scopes).toEqual(["hackathons:read"])

    consoleLogSpy.mockRestore()
    globalThis.fetch = originalFetch
  })

  it("runWhoAmI shows the active workspace", async () => {
    const mockFetch = mock<typeof globalThis.fetch>()
    const originalFetch = globalThis.fetch
    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch

    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          tenantId: "t1",
          tenantName: "Acme Labs",
          tenantType: "organization",
          keyId: "k1",
          keyName: "Test Key",
          scopes: ["hackathons:read"],
        }),
        { headers: { "Content-Type": "application/json" } }
      )
    )

    const { OatmealClient } = await import("../../src/client")
    const client = new OatmealClient({ baseUrl: "http://localhost", apiKey: "sk_test" })

    const consoleLogSpy = spyOn(console, "log").mockImplementation(() => {})
    const { runWhoAmI } = await import("../../src/commands/whoami")
    await runWhoAmI(client, { json: false })

    const output = consoleLogSpy.mock.calls[0][0]
    expect(output).toContain("Workspace")
    expect(output).toContain("Acme Labs (organization)")
    expect(output).toContain("Tenant ID")

    consoleLogSpy.mockRestore()
    globalThis.fetch = originalFetch
  })
})
