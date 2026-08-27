import { describe, expect, it } from "bun:test"
import { SECURITY_HEADERS } from "@/lib/security-headers"

describe("SECURITY_HEADERS", () => {
  it("applies baseline browser protections to every route", () => {
    expect(SECURITY_HEADERS.source).toBe("/:path*")
    expect(SECURITY_HEADERS.headers).toEqual(
      expect.arrayContaining([
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      ])
    )
  })

  it("blocks framing and browser plugins without constraining application scripts", () => {
    const policy = SECURITY_HEADERS.headers.find(
      ({ key }) => key === "Content-Security-Policy"
    )?.value

    expect(policy).toContain("frame-ancestors 'none'")
    expect(policy).toContain("object-src 'none'")
    expect(policy).not.toContain("script-src")
  })
})
