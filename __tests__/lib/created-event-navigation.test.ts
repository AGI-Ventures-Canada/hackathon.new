import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import {
  acknowledgeCreatedEventNavigation,
  getPendingCreatedEventNavigation,
  rememberCreatedEventNavigation,
} from "@/lib/created-event-navigation"

const STORAGE_KEY = "oatmeal:created-event-navigation"

beforeEach(() => {
  sessionStorage.clear()
})

afterEach(() => {
  sessionStorage.clear()
})

describe("created event navigation", () => {
  it("keeps a safe navigation pending until the matching manage page loads", () => {
    expect(rememberCreatedEventNavigation("created-event")).toBe(true)
    expect(getPendingCreatedEventNavigation()).toBe("created-event")
    expect(acknowledgeCreatedEventNavigation("another-event")).toBe(false)
    expect(getPendingCreatedEventNavigation()).toBe("created-event")
    expect(acknowledgeCreatedEventNavigation("created-event")).toBe(true)
    expect(getPendingCreatedEventNavigation()).toBeNull()
  })

  it("rejects unsafe slugs without replacing a safe pending navigation", () => {
    expect(rememberCreatedEventNavigation("created-event")).toBe(true)
    expect(rememberCreatedEventNavigation("//other-site")).toBe(false)
    expect(getPendingCreatedEventNavigation()).toBe("created-event")
  })

  it("removes malformed and expired navigation records", () => {
    sessionStorage.setItem(STORAGE_KEY, "not-json")
    expect(getPendingCreatedEventNavigation()).toBeNull()
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull()

    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 1,
      slug: "expired-event",
      createdAt: new Date(Date.now() - 24 * 60 * 60 * 1_000).toISOString(),
    }))
    expect(getPendingCreatedEventNavigation()).toBeNull()
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it("fails closed when session storage cannot be used", () => {
    const original = globalThis.sessionStorage
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      value: {
        getItem: () => { throw new Error("blocked") },
        setItem: () => { throw new Error("blocked") },
        removeItem: () => { throw new Error("blocked") },
      },
    })
    try {
      expect(rememberCreatedEventNavigation("created-event")).toBe(false)
      expect(getPendingCreatedEventNavigation()).toBeNull()
      expect(acknowledgeCreatedEventNavigation("created-event")).toBe(false)
    } finally {
      Object.defineProperty(globalThis, "sessionStorage", {
        configurable: true,
        value: original,
      })
    }
  })
})
