import { describe, expect, it } from "bun:test"
import {
  getDisplayName,
  isClerkUserId,
  isLikelyEmail,
  nameFromEmail,
} from "@/lib/utils/person-display"

describe("person display helpers", () => {
  it("turns email addresses into readable names", () => {
    expect(nameFromEmail("ada.lovelace@example.com")).toBe("Ada Lovelace")
    expect(nameFromEmail("grace-hopper+judge@example.com")).toBe("Grace Hopper")
  })

  it("returns the caller-supplied fallback for degenerate emails", () => {
    expect(nameFromEmail("@example.com")).toBe("Unknown")
    expect(nameFromEmail("@example.com", "Judge")).toBe("Judge")
    expect(getDisplayName({ email: "@example.com", fallback: "Unknown member" })).toBe(
      "Unknown member"
    )
  })

  it("detects likely email addresses", () => {
    expect(isLikelyEmail("ada@example.com")).toBe(true)
    expect(isLikelyEmail("Ada Lovelace")).toBe(false)
  })

  it("prefers a real name, falls back to the raw email when no real name is set", () => {
    expect(getDisplayName({ name: "Ada Lovelace", email: "ada@example.com" })).toBe("Ada Lovelace")
    expect(getDisplayName({ name: "alan.turing@example.com" })).toBe("alan.turing@example.com")
    expect(getDisplayName({ email: "katherine.johnson@example.com" })).toBe(
      "katherine.johnson@example.com"
    )
    expect(getDisplayName({ fallback: "Unknown member" })).toBe("Unknown member")
  })

  it("detects Clerk user_id strings", () => {
    expect(isClerkUserId("user_2abc123XYZ")).toBe(true)
    expect(isClerkUserId("user_")).toBe(false)
    expect(isClerkUserId("Ada Lovelace")).toBe(false)
    expect(isClerkUserId("ada@example.com")).toBe(false)
    expect(isClerkUserId(null)).toBe(false)
  })

  it("treats Clerk user_id as no name and falls back to the raw email", () => {
    expect(
      getDisplayName({ name: "user_2abc123XYZ", email: "ada.lovelace@example.com" })
    ).toBe("ada.lovelace@example.com")
    expect(
      getDisplayName({ name: "user_2abc123XYZ", fallback: "Unknown member" })
    ).toBe("Unknown member")
  })
})
