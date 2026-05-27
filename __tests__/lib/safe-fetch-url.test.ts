import { describe, it, expect } from "bun:test"
import { isAllowedDownloadUrl } from "@/lib/utils/safe-fetch-url"

describe("isAllowedDownloadUrl", () => {
  it("allows public http(s) URLs", () => {
    expect(isAllowedDownloadUrl("https://example.com/image.png")).toBe(true)
    expect(isAllowedDownloadUrl("http://cdn.example.com/x.jpg")).toBe(true)
  })

  it("rejects non-http(s) schemes", () => {
    expect(isAllowedDownloadUrl("file:///etc/passwd")).toBe(false)
    expect(isAllowedDownloadUrl("ftp://example.com/x")).toBe(false)
    expect(isAllowedDownloadUrl("javascript:alert(1)")).toBe(false)
    expect(isAllowedDownloadUrl("not a url")).toBe(false)
  })

  it("rejects loopback and link-local addresses", () => {
    expect(isAllowedDownloadUrl("http://localhost/x")).toBe(false)
    expect(isAllowedDownloadUrl("http://127.0.0.1/x")).toBe(false)
    expect(isAllowedDownloadUrl("http://127.5.5.5/x")).toBe(false)
    expect(isAllowedDownloadUrl("http://0.0.0.0/x")).toBe(false)
    expect(isAllowedDownloadUrl("http://[::1]/x")).toBe(false)
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

  it("rejects IPv4-mapped IPv6 representations of private addresses", () => {
    expect(isAllowedDownloadUrl("http://[::ffff:127.0.0.1]/x")).toBe(false)
    expect(isAllowedDownloadUrl("http://[::ffff:10.0.0.1]/x")).toBe(false)
    expect(isAllowedDownloadUrl("http://[::ffff:192.168.1.1]/x")).toBe(false)
    expect(isAllowedDownloadUrl("http://[::ffff:169.254.169.254]/x")).toBe(false)
  })

  it("allows public addresses outside the private 172 range", () => {
    expect(isAllowedDownloadUrl("http://172.15.0.1/x")).toBe(true)
    expect(isAllowedDownloadUrl("http://172.32.0.1/x")).toBe(true)
  })
})
