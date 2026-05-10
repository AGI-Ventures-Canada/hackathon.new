import { describe, expect, it } from "bun:test"
import { safeHttpUrl } from "@/components/hackathon/display/fullscreen-showcase"

describe("safeHttpUrl", () => {
  it("returns null for null or empty input", () => {
    expect(safeHttpUrl(null)).toBeNull()
    expect(safeHttpUrl("")).toBeNull()
  })

  it("accepts https URLs", () => {
    const out = safeHttpUrl("https://example.com/path?q=1")
    expect(out).toBe("https://example.com/path?q=1")
  })

  it("accepts http URLs", () => {
    const out = safeHttpUrl("http://example.com")
    expect(out).toBe("http://example.com/")
  })

  it("rejects javascript: URIs (XSS guard)", () => {
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull()
    expect(safeHttpUrl("JAVASCRIPT:alert(1)")).toBeNull()
    expect(safeHttpUrl("javascript:void(0)")).toBeNull()
  })

  it("rejects data: URIs", () => {
    expect(safeHttpUrl("data:text/html,<script>alert(1)</script>")).toBeNull()
  })

  it("rejects file:, vbscript:, and other schemes", () => {
    expect(safeHttpUrl("file:///etc/passwd")).toBeNull()
    expect(safeHttpUrl("vbscript:msgbox(1)")).toBeNull()
    expect(safeHttpUrl("ftp://example.com")).toBeNull()
    expect(safeHttpUrl("ssh://example.com")).toBeNull()
  })

  it("rejects malformed URLs", () => {
    expect(safeHttpUrl("not a url")).toBeNull()
    expect(safeHttpUrl("//example.com")).toBeNull()
    expect(safeHttpUrl("example.com")).toBeNull()
  })
})
