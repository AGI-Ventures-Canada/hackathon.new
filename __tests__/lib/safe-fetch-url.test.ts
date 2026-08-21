import { beforeEach, describe, it, expect, mock } from "bun:test"
import { fetchAllowedUrl, isAllowedDownloadUrl, isAllowedHttpsUrl, readResponseBytes } from "@/lib/utils/safe-fetch-url"

const mockFetch = mock(() => Promise.resolve(new Response("ok")))
globalThis.fetch = mockFetch as unknown as typeof fetch

describe("isAllowedDownloadUrl", () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockFetch.mockResolvedValue(new Response("ok"))
  })
  it("allows public http(s) URLs", () => {
    expect(isAllowedDownloadUrl("https://example.com/image.png")).toBe(true)
    expect(isAllowedDownloadUrl("http://cdn.example.com/x.jpg")).toBe(true)
    expect(isAllowedHttpsUrl("https://example.com/image.png")).toBe(true)
    expect(isAllowedHttpsUrl("http://cdn.example.com/x.jpg")).toBe(false)
  })

  it("rejects non-http(s) schemes", () => {
    expect(isAllowedDownloadUrl("file:///etc/passwd")).toBe(false)
    expect(isAllowedDownloadUrl("ftp://example.com/x")).toBe(false)
    expect(isAllowedDownloadUrl("javascript:alert(1)")).toBe(false)
    expect(isAllowedDownloadUrl("not a url")).toBe(false)
  })

  it("rejects loopback and link-local addresses", () => {
    expect(isAllowedDownloadUrl("http://localhost/x")).toBe(false)
    expect(isAllowedDownloadUrl("http://api.localhost/x")).toBe(false)
    expect(isAllowedDownloadUrl("http://service.internal/x")).toBe(false)
    expect(isAllowedDownloadUrl("http://host.docker.internal/x")).toBe(false)
    expect(isAllowedDownloadUrl("http://127.0.0.1/x")).toBe(false)
    expect(isAllowedDownloadUrl("http://127.5.5.5/x")).toBe(false)
    expect(isAllowedDownloadUrl("http://0.0.0.0/x")).toBe(false)
    expect(isAllowedDownloadUrl("http://0.1.2.3/x")).toBe(false)
    expect(isAllowedDownloadUrl("http://[::1]/x")).toBe(false)
    expect(isAllowedDownloadUrl("http://[::]/x")).toBe(false)
  })

  it("rejects RFC1918 private ranges", () => {
    expect(isAllowedDownloadUrl("http://10.0.0.1/x")).toBe(false)
    expect(isAllowedDownloadUrl("http://172.16.0.1/x")).toBe(false)
    expect(isAllowedDownloadUrl("http://172.31.255.255/x")).toBe(false)
    expect(isAllowedDownloadUrl("http://192.168.1.1/x")).toBe(false)
  })

  it("rejects AWS IMDS link-local address", () => {
    expect(isAllowedDownloadUrl("http://169.254.169.254/latest/meta-data/")).toBe(
      false
    )
  })

  it("rejects carrier-grade NAT addresses", () => {
    expect(isAllowedDownloadUrl("http://100.64.0.1/x")).toBe(false)
    expect(isAllowedDownloadUrl("http://100.127.255.255/x")).toBe(false)
    expect(isAllowedDownloadUrl("http://100.128.0.1/x")).toBe(true)
  })

  it("rejects IPv4-mapped IPv6 representations of private addresses", () => {
    expect(isAllowedDownloadUrl("http://[::ffff:127.0.0.1]/x")).toBe(false)
    expect(isAllowedDownloadUrl("http://[::ffff:10.0.0.1]/x")).toBe(false)
    expect(isAllowedDownloadUrl("http://[::ffff:192.168.1.1]/x")).toBe(false)
    expect(isAllowedDownloadUrl("http://[::ffff:169.254.169.254]/x")).toBe(false)
  })

  it("rejects IPv4-mapped IPv6 in hex-group form (some tools emit this)", () => {
    expect(isAllowedDownloadUrl("http://[::ffff:7f00:1]/x")).toBe(false)
    expect(isAllowedDownloadUrl("http://[0:0:0:0:0:ffff:7f00:1]/x")).toBe(false)
  })

  it("allows public addresses outside the private 172 range", () => {
    expect(isAllowedDownloadUrl("http://172.15.0.1/x")).toBe(true)
    expect(isAllowedDownloadUrl("http://172.32.0.1/x")).toBe(true)
  })

  it("blocks redirects to private addresses", async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, {
      status: 302,
      headers: { location: "http://127.0.0.1/admin" },
    }))

    expect(await fetchAllowedUrl("https://example.com/start")).toBeNull()
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it("follows safe relative redirects", async () => {
    mockFetch
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "/final" } }))
      .mockResolvedValueOnce(new Response("done", { status: 200 }))

    const response = await fetchAllowedUrl("https://example.com/start")

    expect(response?.status).toBe(200)
    expect(mockFetch).toHaveBeenNthCalledWith(2, "https://example.com/final", { redirect: "manual" })
  })

  it("blocks HTTPS downgrades when required", async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, {
      status: 302,
      headers: { location: "http://example.com/final" },
    }))

    expect(await fetchAllowedUrl(
      "https://example.com/start",
      {},
      { requireHttps: true }
    )).toBeNull()
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it("rejects responses over the declared size limit", async () => {
    const response = new Response("", {
      headers: { "content-length": "101" },
    })
    expect(await readResponseBytes(response, 100)).toBeNull()
  })
})
