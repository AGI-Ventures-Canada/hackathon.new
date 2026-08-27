import { describe, expect, it } from "bun:test"
import { isLocalSupabaseUrl, requireLocalSupabaseUrl } from "@/scripts/local-supabase"

describe("local Supabase URL guard", () => {
  it("accepts loopback hosts", () => {
    expect(isLocalSupabaseUrl("http://localhost:54422")).toBe(true)
    expect(isLocalSupabaseUrl("http://127.0.0.1:54422")).toBe(true)
    expect(isLocalSupabaseUrl("http://[::1]:54422")).toBe(true)
  })

  it("rejects misleading and remote hosts", () => {
    expect(isLocalSupabaseUrl("https://localhost.attacker.example")).toBe(false)
    expect(isLocalSupabaseUrl("https://project.supabase.co/localhost")).toBe(false)
    expect(isLocalSupabaseUrl("not a URL")).toBe(false)
  })

  it("throws before a remote service key can be used", () => {
    expect(() => requireLocalSupabaseUrl("https://project.supabase.co")).toThrow(
      "This script only runs against a local Supabase URL."
    )
  })
})
