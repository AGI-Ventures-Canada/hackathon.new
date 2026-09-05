import { describe, expect, it } from "bun:test"
import { safeAuthRedirectUrl } from "@/lib/auth/redirect"

const origin = "https://oatmeal-preview.example.com"

describe("auth return destinations", () => {
  it("normalizes Clerk's same-origin absolute return URL while retaining query and hash", () => {
    expect(safeAuthRedirectUrl(`${origin}/home/judging`, origin)).toBe("/home/judging")
    expect(safeAuthRedirectUrl(`${origin}/judge-invite/token?accept=true#details`, origin)).toBe("/judge-invite/token?accept=true#details")
    expect(safeAuthRedirectUrl([`${origin}/home/judging`, "/home"], origin)).toBe("/home/judging")
  })
  it("keeps relative invitation return paths without an origin header", () => {
    expect(safeAuthRedirectUrl("/judge-invite/token?accept=true", null)).toBe("/judge-invite/token?accept=true")
    expect(safeAuthRedirectUrl(undefined, null, "/onboarding")).toBe("/onboarding")
  })
  it("rejects foreign origins, protocol-relative links, credentials, and misleading hosts", () => {
    for (const target of ["https://evil.example/home/judging", "//evil.example/home", `${origin}.evil.example/home`, "https://oatmeal-preview.example.com@evil.example/home", "https://user@oatmeal-preview.example.com/home", `${origin}//evil.example/home`, `${origin}/\\evil.example/home`, `${origin}/home\n/judging`, "javascript:alert(1)"])
      expect(safeAuthRedirectUrl(target, origin)).toBe("/home")
    expect(safeAuthRedirectUrl(`${origin}/home/judging`, null)).toBe("/home")
    expect(safeAuthRedirectUrl(`${origin}/${"a".repeat(8192)}`, origin)).toBe("/home")
  })
  it("preserves local development ports and rejects mismatched protocol or port", () => {
    expect(safeAuthRedirectUrl("http://localhost:3000/home/judging", "http://localhost:3000")).toBe("/home/judging")
    expect(safeAuthRedirectUrl("http://localhost:4000/home/judging", "http://localhost:3000")).toBe("/home")
    expect(safeAuthRedirectUrl("http://oatmeal-preview.example.com/home/judging", origin)).toBe("/home")
  })
})
