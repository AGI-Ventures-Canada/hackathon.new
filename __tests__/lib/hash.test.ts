import { describe, expect, it } from "bun:test"
import { sha256Fingerprint } from "@/lib/utils/hash"

describe("sha256Fingerprint", () => {
  it("returns the requested prefix of a SHA-256 digest", async () => {
    expect(await sha256Fingerprint("hello", 16)).toBe("2cf24dba5fb0a30e")
  })

  it("uses a short non-identifying fingerprint by default", async () => {
    const fingerprint = await sha256Fingerprint("person@example.com")

    expect(fingerprint).toHaveLength(24)
    expect(fingerprint).toMatch(/^[0-9a-f]+$/)
    expect(fingerprint).not.toContain("person")
  })

  it("can return the complete digest", async () => {
    expect(await sha256Fingerprint("", 64)).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    )
  })
})
