import { describe, it, expect, mock, beforeEach } from "bun:test"

let ttlCache: typeof import("@/lib/utils/ttl-cache").ttlCache

beforeEach(async () => {
  const mod = await import("@/lib/utils/ttl-cache")
  ttlCache = mod.ttlCache
})

describe("ttlCache", () => {
  it("calls the function on first access", async () => {
    const fn = mock(() => Promise.resolve("hello"))
    const key = `test-miss-${Date.now()}`

    const result = await ttlCache(key, fn)

    expect(result).toBe("hello")
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("returns cached value on second access", async () => {
    const fn = mock(() => Promise.resolve(42))
    const key = `test-hit-${Date.now()}`

    await ttlCache(key, fn)
    const result = await ttlCache(key, fn)

    expect(result).toBe(42)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("re-fetches after TTL expires", async () => {
    let callCount = 0
    const fn = mock(() => Promise.resolve(++callCount))
    const key = `test-expiry-${Date.now()}`

    const first = await ttlCache(key, fn, 1)
    await new Promise((r) => setTimeout(r, 10))
    const second = await ttlCache(key, fn, 1)

    expect(first).toBe(1)
    expect(second).toBe(2)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it("caches null and falsy values", async () => {
    const fn = mock(() => Promise.resolve(null))
    const key = `test-null-${Date.now()}`

    await ttlCache(key, fn)
    await ttlCache(key, fn)

    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("evicts the oldest entry when the cache is full", async () => {
    const prefix = `test-evict-${Date.now()}`
    const sentinelKey = `${prefix}-sentinel`
    const sentinelFn = mock(() => Promise.resolve("sentinel"))
    await ttlCache(sentinelKey, sentinelFn)

    for (let i = 0; i < 600; i++) {
      await ttlCache(`${prefix}-${i}`, () => Promise.resolve(i))
    }

    await ttlCache(sentinelKey, sentinelFn)
    expect(sentinelFn).toHaveBeenCalledTimes(2)
  })

  it("expires entries pushed past TTL even before the cap is hit", async () => {
    const fn = mock(() => Promise.resolve("v1"))
    const key = `test-evict-expired-${Date.now()}`

    await ttlCache(key, fn, 1)
    await new Promise((r) => setTimeout(r, 10))
    await ttlCache(key, fn, 1)

    expect(fn).toHaveBeenCalledTimes(2)
  })
})
