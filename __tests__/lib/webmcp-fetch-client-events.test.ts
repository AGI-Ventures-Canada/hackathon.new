import { afterEach, describe, expect, it, mock } from "bun:test"
import {
  dispatchPrepareProjectAction,
  dispatchPrepareSponsorAction,
  PREPARE_PROJECT_EVENT,
  PREPARE_SPONSOR_EVENT,
  type PrepareProjectEvent,
  type PrepareSponsorEvent,
} from "@/lib/webmcp/client-events"
import {
  fetchWebMcpJson,
  WebMcpRequestError,
  type WebMcpFetcher,
} from "@/lib/webmcp/fetch"

const draft = {
  title: "Agent helper",
  githubUrl: "https://github.com/example/agent-helper",
  liveAppUrl: "",
  demoVideoUrl: "",
  description: "A useful helper.",
}

afterEach(() => {
  window.removeEventListener(PREPARE_PROJECT_EVENT, acknowledgePrepared)
  window.removeEventListener(PREPARE_SPONSOR_EVENT, acknowledgeSponsor)
})

function acknowledgePrepared(event: Event) {
  const detail = (event as PrepareProjectEvent).detail
  detail.acknowledge({ ok: true })
  detail.acknowledge({
    ok: false,
    error: {
      code: "storage_unavailable",
      message: "This later response must be ignored.",
      retryable: false,
    },
  })
}

function acknowledgeSponsor(event: Event) {
  const detail = (event as PrepareSponsorEvent).detail
  expect(detail.name).toBe("Acme")
  detail.acknowledge({ ok: true })
}

describe("WebMCP project preparation dispatch", () => {
  it("returns a synchronous listener acknowledgement and accepts only the first result", () => {
    window.addEventListener(PREPARE_PROJECT_EVENT, acknowledgePrepared)
    expect(dispatchPrepareProjectAction("test-event", draft)).toEqual({ ok: true })
  })

  it("fails closed when no visible project form acknowledges preparation", () => {
    expect(dispatchPrepareProjectAction("test-event", draft)).toEqual({
      ok: false,
      error: {
        code: "preparation_unavailable",
        message: "The project form isn't ready. Reload the page and try again.",
        retryable: false,
      },
    })
  })
})

describe("WebMCP sponsor preparation dispatch", () => {
  it("passes a sponsor name to the visible editor", () => {
    window.addEventListener(PREPARE_SPONSOR_EVENT, acknowledgeSponsor)
    expect(dispatchPrepareSponsorAction("Acme")).toEqual({ ok: true })
  })

  it("fails closed without a visible sponsor editor", () => {
    expect(dispatchPrepareSponsorAction("Acme")).toMatchObject({
      ok: false,
      error: { code: "preparation_unavailable" },
    })
  })
})

function response(body: unknown, status: number) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

describe("fetchWebMcpJson", () => {
  it("returns successful JSON without changing the request", async () => {
    const fetcher = mock((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(response({ ready: true }, 200))) as WebMcpFetcher
    const signal = new AbortController().signal
    await expect(fetchWebMcpJson<{ ready: boolean }>(
      fetcher,
      "/api/example",
      { method: "POST", signal },
    )).resolves.toEqual({ ready: true })
    expect(fetcher).toHaveBeenCalledWith("/api/example", { method: "POST", signal })
  })

  it("preserves bounded top-level and nested API error details", async () => {
    const topLevel = mock(() => Promise.resolve(response({
      code: "team_full",
      error: "E".repeat(400),
    }, 400))) as WebMcpFetcher
    await expect(fetchWebMcpJson(topLevel, "/api/example", {})).rejects.toMatchObject({
      name: "WebMcpRequestError",
      code: "team_full",
      message: "E".repeat(240),
      retryable: false,
    })

    const nested = mock(() => Promise.resolve(response({
      error: { code: "stale_assignment", message: "Open the project again." },
    }, 409))) as WebMcpFetcher
    await expect(fetchWebMcpJson(nested, "/api/example", {})).rejects.toMatchObject({
      code: "stale_assignment",
      message: "Open the project again.",
      retryable: true,
    })
  })

  it("maps status-only failures to stable codes and retry guidance", async () => {
    const cases = [
      [401, "unauthenticated", false],
      [403, "not_authorized", false],
      [404, "not_found", false],
      [409, "event_changed", true],
      [400, "invalid_request", false],
      [422, "invalid_request", false],
      [429, "rate_limited", true],
      [503, "request_failed", true],
    ] as const

    for (const [status, code, retryable] of cases) {
      const fetcher = mock(() => Promise.resolve(response("not json", status))) as WebMcpFetcher
      await expect(fetchWebMcpJson(fetcher, "/api/example", {})).rejects.toMatchObject({
        code,
        message: "The request could not be completed.",
        retryable,
      })
    }
  })

  it("ignores oversized or malformed codes instead of exposing arbitrary payload data", async () => {
    const fetcher = mock(() => Promise.resolve(response({
      code: "x".repeat(81),
      error: { code: 42, message: 12 },
    }, 418))) as WebMcpFetcher
    await expect(fetchWebMcpJson(fetcher, "/api/example", {})).rejects.toEqual(
      expect.objectContaining({
        name: "WebMcpRequestError",
        code: "request_failed",
        message: "The request could not be completed.",
        retryable: false,
      }),
    )
  })

  it("constructs request errors with safe public fields", () => {
    const error = new WebMcpRequestError({
      code: "event_changed",
      message: "Refresh the event.",
      retryable: true,
    })
    expect(error).toBeInstanceOf(Error)
    expect(error).toMatchObject({
      name: "WebMcpRequestError",
      message: "Refresh the event.",
      code: "event_changed",
      retryable: true,
    })
  })
})
