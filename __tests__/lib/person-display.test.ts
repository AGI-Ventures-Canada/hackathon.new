import { describe, expect, it } from "bun:test"
import { getDisplayName, isLikelyEmail, nameFromEmail } from "@/lib/utils/person-display"

describe("person display helpers", () => {
  it("turns email addresses into readable names", () => {
    expect(nameFromEmail("ada.lovelace@example.com")).toBe("Ada Lovelace")
    expect(nameFromEmail("grace-hopper+judge@example.com")).toBe("Grace Hopper")
  })

  it("detects likely email addresses", () => {
    expect(isLikelyEmail("ada@example.com")).toBe(true)
    expect(isLikelyEmail("Ada Lovelace")).toBe(false)
  })

  it("prefers names but cleans email-like names", () => {
    expect(getDisplayName({ name: "Ada Lovelace", email: "ada@example.com" })).toBe("Ada Lovelace")
    expect(getDisplayName({ name: "alan.turing@example.com" })).toBe("Alan Turing")
    expect(getDisplayName({ email: "katherine.johnson@example.com" })).toBe("Katherine Johnson")
    expect(getDisplayName({ fallback: "Unknown member" })).toBe("Unknown member")
  })
})
