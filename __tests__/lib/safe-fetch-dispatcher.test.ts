import { beforeEach, describe, expect, it, mock } from "bun:test"

type ConnectCallback = (error: Error | null, socket: FakeSocket | null) => void
type Connector = (
  options: Record<string, unknown>,
  callback: ConnectCallback,
) => void

type FakeSocket = {
  remoteAddress?: string
  destroy: ReturnType<typeof mock>
}

let connectorImpl: Connector
let agentOptions: { connect: Connector } | null = null
const close = mock(() => Promise.resolve())
const destroy = mock(() => Promise.resolve())

mock.module("undici/index.js", () => ({
  buildConnector: mock(() => (options: Record<string, unknown>, callback: ConnectCallback) =>
    connectorImpl(options, callback)),
  Agent: class FakeAgent {
    close = close
    destroy = destroy

    constructor(options: { connect: Connector }) {
      agentOptions = options
    }
  },
}))

const lookup = mock(() => Promise.resolve([
  { address: "93.184.216.34", family: 4 as const },
]))
const fetchMock = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
  const dispatcher = (init as RequestInit & { dispatcher?: unknown })?.dispatcher
  expect(dispatcher).toBeDefined()
  return new Response("ok")
})
globalThis.fetch = fetchMock as unknown as typeof fetch

const {
  fetchAllowedUrl,
  fetchAllowedWebhookUrl,
  isAllowedDownloadUrl,
} = await import("@/lib/utils/safe-fetch-url")

function connectPinnedSocket(socket: FakeSocket | null, error: Error | null = null) {
  connectorImpl = (_options, callback) => callback(error, socket)
  return new Promise<{ error: Error | null; socket: FakeSocket | null }>((resolve) => {
    agentOptions?.connect(
      { hostname: "example.com" },
      (connectError, connectedSocket) => resolve({
        error: connectError,
        socket: connectedSocket,
      }),
    )
  })
}

describe("pinned safe fetch dispatcher", () => {
  beforeEach(() => {
    agentOptions = null
    close.mockClear()
    destroy.mockClear()
    lookup.mockClear()
    fetchMock.mockClear()
  })

  it("connects only to the public address selected during DNS validation", async () => {
    const response = await fetchAllowedUrl(
      "https://example.com/image.png",
      { signal: new AbortController().signal },
      { lookup },
    )
    expect(response?.status).toBe(200)

    const socket = {
      remoteAddress: "93.184.216.34",
      destroy: mock(() => undefined),
    }
    const connected = await connectPinnedSocket(socket)
    expect(connected).toEqual({ error: null, socket })
    expect(socket.destroy).not.toHaveBeenCalled()
  })

  it("rejects a connector failure without pretending a socket exists", async () => {
    await fetchAllowedUrl("https://example.com/image.png", {}, { lookup })
    const failure = new Error("TLS failed")
    const connected = await connectPinnedSocket(null, failure)

    expect(connected).toEqual({ error: failure, socket: null })
  })

  it("destroys sockets that connect to a different or private address", async () => {
    await fetchAllowedUrl("https://example.com/image.png", {}, { lookup })
    const socket = {
      remoteAddress: "127.0.0.1",
      destroy: mock(() => undefined),
    }
    const connected = await connectPinnedSocket(socket)

    expect(connected.error?.message).toBe("Blocked remote address")
    expect(connected.socket).toBeNull()
    expect(socket.destroy).toHaveBeenCalledTimes(1)
  })

  it("rejects a socket when the peer address is missing", async () => {
    await fetchAllowedUrl("https://example.com/image.png", {}, { lookup })
    const socket = { destroy: mock(() => undefined) }
    const connected = await connectPinnedSocket(socket)

    expect(connected.error?.message).toBe("Blocked remote address")
    expect(socket.destroy).toHaveBeenCalledTimes(1)
  })

  it("combines caller cancellation with the webhook timeout", async () => {
    const response = await fetchAllowedWebhookUrl(
      "https://example.com/webhook",
      {
        method: "POST",
        body: "{}",
        signal: new AbortController().signal,
      },
      { lookup },
    )

    expect(response?.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/webhook",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it("covers malformed IP shapes without allowing them", () => {
    expect(isAllowedDownloadUrl("https://1.2.3/x")).toBe(true)
    expect(isAllowedDownloadUrl("https://999.2.3.4/x")).toBe(false)
    expect(isAllowedDownloadUrl("https://[2001:db8::1::2]/x")).toBe(false)
    expect(isAllowedDownloadUrl("https://[1:2:3:4:5:6:7]/x")).toBe(false)
  })
})
