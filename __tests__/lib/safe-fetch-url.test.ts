import { beforeEach, describe, expect, it, mock } from "bun:test"
import {
  fetchAllowedUrl,
  fetchAllowedWebhookUrl,
  isAllowedDownloadUrl,
  isAllowedHttpsUrl,
  readResponseBytes,
  readResponseText,
  redactFetchErrorForLogs,
  redactUrlForLogs,
} from "@/lib/utils/safe-fetch-url"

type LookupOptions = { all: true; verbatim: true }

const publicLookup = mock((_: string, __: LookupOptions) => Promise.resolve([
  { address: "93.184.216.34", family: 4 as const },
]))
const mockFetch = mock((_: RequestInfo | URL, __?: RequestInit) =>
  Promise.resolve(new Response("ok"))
)
globalThis.fetch = mockFetch as unknown as typeof fetch

describe("isAllowedDownloadUrl", () => {
  beforeEach(() => {
    publicLookup.mockClear()
    mockFetch.mockReset()
    mockFetch.mockResolvedValue(new Response("ok"))
  })

  it("allows public http(s) URLs while fetches default to HTTPS only", async () => {
    expect(isAllowedDownloadUrl("https://example.com/image.png")).toBe(true)
    expect(isAllowedDownloadUrl("http://cdn.example.com/x.jpg")).toBe(true)
    expect(isAllowedHttpsUrl("https://example.com/image.png")).toBe(true)
    expect(isAllowedHttpsUrl("http://cdn.example.com/x.jpg")).toBe(false)
    expect(await fetchAllowedUrl(
      "http://example.com/image.png",
      {},
      { lookup: publicLookup }
    )).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("rejects non-http(s) schemes and URL credentials", () => {
    expect(isAllowedDownloadUrl("file:///etc/passwd")).toBe(false)
    expect(isAllowedDownloadUrl("ftp://example.com/x")).toBe(false)
    expect(isAllowedDownloadUrl("javascript:alert(1)")).toBe(false)
    expect(isAllowedDownloadUrl("not a url")).toBe(false)
    expect(isAllowedDownloadUrl("https://user:secret@example.com/x")).toBe(false)
  })

  it("rejects loopback, private, link-local, and metadata IP literals", () => {
    expect(isAllowedDownloadUrl("http://localhost/x")).toBe(false)
    expect(isAllowedDownloadUrl("http://api.localhost/x")).toBe(false)
    expect(isAllowedDownloadUrl("http://service.internal/x")).toBe(false)
    expect(isAllowedDownloadUrl("http://host.docker.internal/x")).toBe(false)
    expect(isAllowedDownloadUrl("http://127.0.0.1/x")).toBe(false)
    expect(isAllowedDownloadUrl("http://0.0.0.0/x")).toBe(false)
    expect(isAllowedDownloadUrl("http://[::1]/x")).toBe(false)
    expect(isAllowedDownloadUrl("http://[::]/x")).toBe(false)
    expect(isAllowedDownloadUrl("http://10.0.0.1/x")).toBe(false)
    expect(isAllowedDownloadUrl("http://172.31.255.255/x")).toBe(false)
    expect(isAllowedDownloadUrl("http://192.168.1.1/x")).toBe(false)
    expect(isAllowedDownloadUrl("http://169.254.169.254/latest/meta-data/")).toBe(false)
    expect(isAllowedDownloadUrl("http://[fe80::1]/x")).toBe(false)
    expect(isAllowedDownloadUrl("http://[fd00::1]/x")).toBe(false)
  })

  it("rejects reserved, documentation, benchmark, and multicast ranges", () => {
    expect(isAllowedDownloadUrl("https://192.0.2.1/x")).toBe(false)
    expect(isAllowedDownloadUrl("https://198.18.0.1/x")).toBe(false)
    expect(isAllowedDownloadUrl("https://203.0.113.1/x")).toBe(false)
    expect(isAllowedDownloadUrl("https://224.0.0.1/x")).toBe(false)
    expect(isAllowedDownloadUrl("https://[2001:db8::1]/x")).toBe(false)
    expect(isAllowedDownloadUrl("https://[ff02::1]/x")).toBe(false)
  })

  it("rejects carrier-grade NAT and IPv4-mapped IPv6 addresses", () => {
    expect(isAllowedDownloadUrl("http://100.64.0.1/x")).toBe(false)
    expect(isAllowedDownloadUrl("http://100.127.255.255/x")).toBe(false)
    expect(isAllowedDownloadUrl("http://100.128.0.1/x")).toBe(true)
    expect(isAllowedDownloadUrl("http://[::ffff:127.0.0.1]/x")).toBe(false)
    expect(isAllowedDownloadUrl("http://[::ffff:10.0.0.1]/x")).toBe(false)
    expect(isAllowedDownloadUrl("http://[::ffff:7f00:1]/x")).toBe(false)
  })

  it("allows public addresses outside blocked ranges", () => {
    expect(isAllowedDownloadUrl("http://172.15.0.1/x")).toBe(true)
    expect(isAllowedDownloadUrl("http://172.32.0.1/x")).toBe(true)
    expect(isAllowedDownloadUrl("https://8.8.8.8/x")).toBe(true)
    expect(isAllowedDownloadUrl("https://[2606:4700:4700::1111]/x")).toBe(true)
  })

  it("rejects private A records before connecting", async () => {
    const lookup = mock((_: string, __: LookupOptions) => Promise.resolve([
      { address: "10.20.30.40", family: 4 as const },
    ]))

    expect(await fetchAllowedUrl("https://private.example/x", {}, { lookup })).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("rejects private and link-local AAAA records before connecting", async () => {
    const uniqueLocalLookup = mock((_: string, __: LookupOptions) => Promise.resolve([
      { address: "fd12:3456::1", family: 6 as const },
    ]))
    const linkLocalLookup = mock((_: string, __: LookupOptions) => Promise.resolve([
      { address: "fe80::1234", family: 6 as const },
    ]))
    const reservedLookup = mock((_: string, __: LookupOptions) => Promise.resolve([
      { address: "2001:db8::1234", family: 6 as const },
    ]))

    expect(await fetchAllowedUrl(
      "https://private-v6.example/x",
      {},
      { lookup: uniqueLocalLookup }
    )).toBeNull()
    expect(await fetchAllowedUrl(
      "https://link-local-v6.example/x",
      {},
      { lookup: linkLocalLookup }
    )).toBeNull()
    expect(await fetchAllowedUrl(
      "https://reserved-v6.example/x",
      {},
      { lookup: reservedLookup }
    )).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("rejects metadata A records returned by DNS", async () => {
    const lookup = mock((_: string, __: LookupOptions) => Promise.resolve([
      { address: "169.254.169.254", family: 4 as const },
    ]))

    expect(await fetchAllowedUrl("https://metadata.example/x", {}, { lookup })).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("rejects a hostname if any A or AAAA answer is private", async () => {
    const lookup = mock((_: string, __: LookupOptions) => Promise.resolve([
      { address: "93.184.216.34", family: 4 as const },
      { address: "fd00::5", family: 6 as const },
    ]))

    expect(await fetchAllowedUrl("https://mixed.example/x", {}, { lookup })).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("returns null on DNS failure", async () => {
    const lookup = mock((_: string, __: LookupOptions) =>
      Promise.reject(Object.assign(new Error("not found"), { code: "ENOTFOUND" }))
    )

    expect(await fetchAllowedUrl("https://missing.example/x", {}, { lookup })).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("rejects empty, malformed, and mismatched DNS answers", async () => {
    const emptyLookup = mock((_: string, __: LookupOptions) => Promise.resolve([]))
    const malformedLookup = mock((_: string, __: LookupOptions) => Promise.resolve([
      { address: "not-an-ip", family: 4 as const },
    ]))
    const mismatchedLookup = mock((_: string, __: LookupOptions) => Promise.resolve([
      { address: "93.184.216.34", family: 6 as const },
    ]))

    expect(await fetchAllowedUrl("https://empty.example/x", {}, {
      lookup: emptyLookup,
    })).toBeNull()
    expect(await fetchAllowedUrl("https://malformed.example/x", {}, {
      lookup: malformedLookup,
    })).toBeNull()
    expect(await fetchAllowedUrl("https://mismatch.example/x", {}, {
      lookup: mismatchedLookup,
    })).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("uses public IP literals directly without DNS", async () => {
    const lookup = mock((_: string, __: LookupOptions) => Promise.reject(new Error("unused")))

    const response = await fetchAllowedUrl("https://8.8.8.8/image.png", {}, { lookup })

    expect(response?.status).toBe(200)
    expect(lookup).not.toHaveBeenCalled()
  })

  it("pins a validated public DNS answer in the request dispatcher", async () => {
    const response = await fetchAllowedUrl(
      "https://example.com/start",
      {},
      { lookup: publicLookup }
    )

    expect(response?.status).toBe(200)
    expect(publicLookup).toHaveBeenCalledWith("example.com", {
      all: true,
      verbatim: true,
    })
    expect(mockFetch).toHaveBeenCalledWith(
      "https://example.com/start",
      expect.objectContaining({
        credentials: "omit",
        dispatcher: expect.anything(),
        redirect: "manual",
        signal: expect.any(AbortSignal),
      })
    )
  })

  it("revalidates DNS after every redirect", async () => {
    const lookup = mock((hostname: string, _: LookupOptions) => Promise.resolve(
      hostname === "example.com"
        ? [{ address: "93.184.216.34", family: 4 as const }]
        : [{ address: "127.0.0.1", family: 4 as const }]
    ))
    mockFetch.mockResolvedValueOnce(new Response(null, {
      status: 302,
      headers: { location: "https://redirect.example/admin" },
    }))

    expect(await fetchAllowedUrl("https://example.com/start", {}, { lookup })).toBeNull()
    expect(lookup.mock.calls.map(([hostname]) => hostname)).toEqual([
      "example.com",
      "redirect.example",
    ])
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it("never forwards caller credentials and follows safe redirects", async () => {
    mockFetch
      .mockResolvedValueOnce(new Response(null, {
        status: 302,
        headers: { location: "https://cdn.example/final" },
      }))
      .mockResolvedValueOnce(new Response("done", { status: 200 }))

    const response = await fetchAllowedUrl(
      "https://example.com/start",
      { headers: { authorization: "Bearer secret", cookie: "session=secret", accept: "text/html" } },
      { lookup: publicLookup }
    )

    expect(response?.status).toBe(200)
    const firstInit = mockFetch.mock.calls[0]?.[1] as RequestInit
    const firstHeaders = new Headers(firstInit.headers)
    expect(firstHeaders.get("authorization")).toBeNull()
    expect(firstHeaders.get("cookie")).toBeNull()
    expect(firstHeaders.get("accept")).toBe("text/html")
    const secondInit = mockFetch.mock.calls[1]?.[1] as RequestInit
    const secondHeaders = new Headers(secondInit.headers)
    expect(secondHeaders.get("authorization")).toBeNull()
    expect(secondHeaders.get("cookie")).toBeNull()
    expect(secondHeaders.get("accept")).toBe("text/html")
  })

  it("blocks HTTPS downgrades on redirects", async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, {
      status: 302,
      headers: { location: "http://example.com/final" },
    }))

    expect(await fetchAllowedUrl(
      "https://example.com/start",
      {},
      { lookup: publicLookup }
    )).toBeNull()
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it("allows bounded HTTP fetches only when explicitly requested", async () => {
    const response = await fetchAllowedUrl(
      "http://example.com/image.png",
      { method: "HEAD" },
      { lookup: publicLookup, requireHttps: false, timeoutMs: 50_000 },
    )

    expect(response?.status).toBe(200)
    expect(mockFetch).toHaveBeenCalledWith(
      "http://example.com/image.png",
      expect.objectContaining({ method: "HEAD", redirect: "manual" }),
    )
  })

  it("rejects download methods and bodies that could mutate a remote service", async () => {
    expect(await fetchAllowedUrl("https://example.com", { method: "POST" }, {
      lookup: publicLookup,
    })).toBeNull()
    expect(await fetchAllowedUrl("https://example.com", { body: "payload" }, {
      lookup: publicLookup,
    })).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("rejects redirects with no location, invalid locations, or no remaining budget", async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 302 }))
    expect(await fetchAllowedUrl("https://example.com/start", {}, {
      lookup: publicLookup,
    })).toBeNull()

    mockFetch.mockResolvedValueOnce(new Response(null, {
      status: 302,
      headers: { location: "http://[invalid" },
    }))
    expect(await fetchAllowedUrl("https://example.com/start", {}, {
      lookup: publicLookup,
    })).toBeNull()

    mockFetch.mockResolvedValueOnce(new Response(null, {
      status: 302,
      headers: { location: "/next" },
    }))
    expect(await fetchAllowedUrl("https://example.com/start", {}, {
      lookup: publicLookup,
      maxRedirects: 0,
    })).toBeNull()
  })

  it("propagates a network error after closing the pinned dispatcher", async () => {
    mockFetch.mockRejectedValueOnce(new TypeError("network unavailable"))

    await expect(fetchAllowedUrl("https://example.com/start", {}, {
      lookup: publicLookup,
    })).rejects.toThrow("network unavailable")
  })

  it("rejects webhook delivery when DNS resolves to a private address", async () => {
    const lookup = mock((_: string, __: LookupOptions) => Promise.resolve([
      { address: "127.0.0.1", family: 4 as const },
    ]))

    expect(await fetchAllowedWebhookUrl(
      "https://hooks.example/events",
      { method: "POST", body: "{}" },
      { lookup },
    )).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("pins webhook delivery and rejects redirects without following them", async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, {
      status: 307,
      headers: { location: "https://internal.example/next" },
    }))

    expect(await fetchAllowedWebhookUrl(
      "https://hooks.example/events",
      {
        method: "POST",
        headers: { "X-Webhook-Signature": "signed" },
        body: "{}",
      },
      { lookup: publicLookup },
    )).toBeNull()
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch).toHaveBeenCalledWith(
      "https://hooks.example/events",
      expect.objectContaining({
        credentials: "omit",
        dispatcher: expect.anything(),
        redirect: "manual",
      }),
    )
  })

  it("accepts a successful pinned webhook response", async () => {
    mockFetch.mockResolvedValueOnce(new Response("accepted", { status: 202 }))

    const response = await fetchAllowedWebhookUrl(
      "https://hooks.example/events#private",
      { method: "POST", body: "{}" },
      { lookup: publicLookup, timeoutMs: 1 },
    )

    expect(response?.status).toBe(202)
    expect(mockFetch).toHaveBeenCalledWith(
      "https://hooks.example/events",
      expect.objectContaining({ credentials: "omit", redirect: "manual" }),
    )
  })

  it("rejects invalid webhook request shapes and propagates network failures", async () => {
    expect(await fetchAllowedWebhookUrl(
      "https://hooks.example/events",
      { method: "GET", body: "{}" },
      { lookup: publicLookup },
    )).toBeNull()
    expect(await fetchAllowedWebhookUrl(
      "https://hooks.example/events",
      { method: "POST" },
      { lookup: publicLookup },
    )).toBeNull()
    expect(await fetchAllowedWebhookUrl(
      "http://hooks.example/events",
      { method: "POST", body: "{}" },
      { lookup: publicLookup },
    )).toBeNull()

    mockFetch.mockRejectedValueOnce("socket closed")
    await expect(fetchAllowedWebhookUrl(
      "https://hooks.example/events",
      { method: "POST", body: "{}" },
      { lookup: publicLookup },
    )).rejects.toBe("socket closed")
  })

  it("redacts credentials, paths, query strings, fragments, and URLs in errors", () => {
    const rawUrl = "https://alice:password@example.com/events/path-token?token=top-secret#private"
    const redactedUrl = redactUrlForLogs(rawUrl)
    const redactedError = redactFetchErrorForLogs(
      new Error(`Request failed for ${rawUrl}`),
      [rawUrl]
    )
    const output = JSON.stringify({ redactedUrl, redactedError })

    expect(redactedUrl).toBe("https://example.com/[redacted]")
    expect(output).not.toContain("alice")
    expect(output).not.toContain("password")
    expect(output).not.toContain("path-token")
    expect(output).not.toContain("top-secret")
    expect(output).not.toContain("private")
  })

  it("returns safe fallbacks for invalid URLs and non-error failures", () => {
    expect(redactUrlForLogs("file:///private/path")).toBe("[redacted URL]")
    expect(redactUrlForLogs("not a url")).toBe("[invalid URL]")
    expect(redactFetchErrorForLogs("failed\nwith control", [])).toEqual({
      name: "Error",
      message: "failed with control",
    })
    expect(redactFetchErrorForLogs({ reason: "private" }, [])).toEqual({
      name: "Error",
      message: "The remote request failed",
    })
  })

  it("rejects responses over the declared size limit", async () => {
    const response = new Response("", {
      headers: { "content-length": "101" },
    })
    expect(await readResponseBytes(response, 100)).toBeNull()
  })

  it("returns an empty byte array when a response has no body", async () => {
    const response = { headers: new Headers(), body: null } as unknown as Response

    expect(await readResponseBytes(response, 100)).toEqual(new Uint8Array())
  })

  it("joins streamed chunks and decodes bounded response text", async () => {
    const response = new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("hello "))
        controller.enqueue(new TextEncoder().encode("world"))
        controller.close()
      },
    }))

    expect(await readResponseText(response, 100)).toBe("hello world")
  })

  it("cancels a stream as soon as actual bytes exceed the limit", async () => {
    let cancelled = false
    const response = new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]))
        controller.enqueue(new Uint8Array([4, 5, 6]))
      },
      cancel() {
        cancelled = true
      },
    }))

    expect(await readResponseBytes(response, 5)).toBeNull()
    expect(cancelled).toBe(true)
  })
})
