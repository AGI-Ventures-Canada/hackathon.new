import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test"
import { executePoll, STALE_THRESHOLD, type PollState } from "@/hooks/use-organizer-poll"

const originalFetch = globalThis.fetch
let hiddenValue = false

beforeEach(() => {
  hiddenValue = false
  Object.defineProperty(document, "hidden", {
    get: () => hiddenValue,
    configurable: true,
  })
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

function freshState(): PollState {
  return { data: null, isStale: false, failCount: 0 }
}

const hackathonId = "test-hackathon-id"
const mockPayload = { status: "active", phase: "build" } as never

describe("executePoll", () => {
  it("returns data on successful fetch", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(mockPayload), { status: 200 }))
    ) as typeof fetch

    const result = await executePoll(hackathonId, freshState())

    expect(result.data).toEqual(mockPayload)
    expect(result.isStale).toBe(false)
    expect(result.failCount).toBe(0)
  })

  it("fetches the correct endpoint", async () => {
    const mockFetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(mockPayload), { status: 200 }))
    )
    globalThis.fetch = mockFetch as typeof fetch

    await executePoll(hackathonId, freshState())

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`/api/dashboard/hackathons/${hackathonId}/action-items-poll`)
  })

  it("passes abort signal to fetch", async () => {
    const controller = new AbortController()
    const mockFetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(mockPayload), { status: 200 }))
    )
    globalThis.fetch = mockFetch as typeof fetch

    await executePoll(hackathonId, freshState(), controller.signal)

    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(opts.signal).toBe(controller.signal)
  })

  it("skips fetch when document is hidden", async () => {
    hiddenValue = true
    const mockFetch = mock(() => Promise.resolve(new Response("{}", { status: 200 })))
    globalThis.fetch = mockFetch as typeof fetch

    const state = freshState()
    const result = await executePoll(hackathonId, state)

    expect(mockFetch).not.toHaveBeenCalled()
    expect(result).toBe(state)
  })

  it("increments failCount on non-ok response", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response("Server Error", { status: 500 }))
    ) as typeof fetch

    const result = await executePoll(hackathonId, freshState())

    expect(result.failCount).toBe(1)
    expect(result.isStale).toBe(false)
    expect(result.data).toBeNull()
  })

  it("increments failCount on network error", async () => {
    globalThis.fetch = mock(() =>
      Promise.reject(new TypeError("Failed to fetch"))
    ) as typeof fetch

    const result = await executePoll(hackathonId, freshState())

    expect(result.failCount).toBe(1)
    expect(result.isStale).toBe(false)
  })

  it("preserves existing data on failure", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response("error", { status: 500 }))
    ) as typeof fetch

    const state: PollState = { data: mockPayload, isStale: false, failCount: 0 }
    const result = await executePoll(hackathonId, state)

    expect(result.data).toEqual(mockPayload)
  })

  it(`marks stale after ${STALE_THRESHOLD} consecutive failures`, async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response("error", { status: 500 }))
    ) as typeof fetch

    let state = freshState()
    for (let i = 0; i < STALE_THRESHOLD - 1; i++) {
      state = await executePoll(hackathonId, state)
      expect(state.isStale).toBe(false)
    }

    state = await executePoll(hackathonId, state)
    expect(state.isStale).toBe(true)
    expect(state.failCount).toBe(STALE_THRESHOLD)
  })

  it("resets stale and failCount on successful recovery", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response("error", { status: 500 }))
    ) as typeof fetch

    let state = freshState()
    for (let i = 0; i < STALE_THRESHOLD; i++) {
      state = await executePoll(hackathonId, state)
    }
    expect(state.isStale).toBe(true)

    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(mockPayload), { status: 200 }))
    ) as typeof fetch

    state = await executePoll(hackathonId, state)
    expect(state.isStale).toBe(false)
    expect(state.failCount).toBe(0)
    expect(state.data).toEqual(mockPayload)
  })

  it("ignores AbortError and returns unchanged state", async () => {
    const abortError = new DOMException("The operation was aborted.", "AbortError")
    globalThis.fetch = mock(() => Promise.reject(abortError)) as typeof fetch

    const state: PollState = { data: mockPayload, isStale: false, failCount: 1 }
    const result = await executePoll(hackathonId, state)

    expect(result).toBe(state)
    expect(result.failCount).toBe(1)
  })

  it("marks stale on network errors same as HTTP errors", async () => {
    globalThis.fetch = mock(() =>
      Promise.reject(new TypeError("Failed to fetch"))
    ) as typeof fetch

    let state: PollState = { data: null, isStale: false, failCount: STALE_THRESHOLD - 1 }
    state = await executePoll(hackathonId, state)

    expect(state.isStale).toBe(true)
    expect(state.failCount).toBe(STALE_THRESHOLD)
  })
})
