import { describe, expect, it } from "bun:test"
import { createContentSecurityPolicy, SECURITY_HEADERS } from "@/lib/security-headers"

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

  it("creates a per-request nonce policy for active content", () => {
    const policy = createContentSecurityPolicy("test-nonce")
    const scriptPolicy = policy.split("; ").find((entry) => entry.startsWith("script-src "))

    expect(scriptPolicy).toBe("script-src 'self' 'nonce-test-nonce' 'strict-dynamic'")
    expect(scriptPolicy).not.toContain("'unsafe-inline'")
    expect(scriptPolicy).not.toContain("https:")
    expect(policy).toContain("frame-ancestors 'none'")
    expect(policy).toContain("object-src 'none'")
    expect(policy).toContain("script-src-attr 'none'")
    expect(SECURITY_HEADERS.headers).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "Content-Security-Policy" }),
      ])
    )
  })
})
