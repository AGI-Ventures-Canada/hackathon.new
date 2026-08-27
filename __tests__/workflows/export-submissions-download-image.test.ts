import { beforeEach, describe, expect, it, mock } from "bun:test"

let fetchImpl: () => Promise<Response | null> = () => Promise.resolve(null)
let readImpl: () => Promise<Uint8Array | null> = () =>
  Promise.resolve(new Uint8Array([1, 2, 3]))

const mockFetchAllowedUrl = mock(() => fetchImpl())
const mockReadResponseBytes = mock(() => readImpl())
const mockIsAllowedHttpsUrl = mock((url: string) => {
  try {
    const parsed = new URL(url)
    return parsed.protocol === "https:" && parsed.hostname !== "127.0.0.1"
  } catch {
    return false
  }
})

mock.module("@/lib/utils/safe-fetch-url", () => ({
  fetchAllowedUrl: mockFetchAllowedUrl,
  isAllowedHttpsUrl: mockIsAllowedHttpsUrl,
  readResponseBytes: mockReadResponseBytes,
  redactUrlForLogs: (url: string) => {
    try {
      return `${new URL(url).origin}/[redacted]`
    } catch {
      return "[invalid URL]"
    }
  },
  redactFetchErrorForLogs: (error: unknown) => ({
    name: error instanceof Error ? error.name : "Error",
    message: "The remote request failed",
  }),
}))

const { downloadImageForExport } = await import(
  "@/lib/workflows/export-submissions/download-image"
)

function imageResponse(headers: Record<string, string>, ok = true): Response {
  return {
    ok,
    headers: new Headers(headers),
    body: null,
  } as Response
}

describe("downloadImageForExport", () => {
  beforeEach(() => {
    mockFetchAllowedUrl.mockClear()
    mockReadResponseBytes.mockClear()
    mockIsAllowedHttpsUrl.mockClear()
    fetchImpl = () => Promise.resolve(null)
    readImpl = () => Promise.resolve(new Uint8Array([1, 2, 3]))
  })

  it("rejects private destinations without exposing URL secrets in logs", async () => {
    const warn = mock(() => {})
    const originalWarn = console.warn
    console.warn = warn

    try {
      const result = await downloadImageForExport(
        "https://127.0.0.1/private/person.png?token=secret#profile",
        "media/submission/screenshot"
      )

      expect(result).toBeNull()
      expect(mockFetchAllowedUrl).not.toHaveBeenCalled()
      expect(warn).toHaveBeenCalledTimes(1)
      const message = String(warn.mock.calls[0]?.[0])
      expect(message).toContain("https://127.0.0.1/[redacted]")
      expect(message).not.toContain("person.png")
      expect(message).not.toContain("token=secret")
    } finally {
      console.warn = originalWarn
    }
  })

  it("requires HTTPS for export media", async () => {
    const warn = mock(() => {})
    const originalWarn = console.warn
    console.warn = warn

    try {
      expect(
        await downloadImageForExport(
          "http://example.com/image.png",
          "media/submission/screenshot"
        )
      ).toBeNull()
      expect(mockFetchAllowedUrl).not.toHaveBeenCalled()
      expect(warn).toHaveBeenCalledTimes(1)
    } finally {
      console.warn = originalWarn
    }
  })

  it("downloads bounded image bytes and infers standard file extensions", async () => {
    fetchImpl = () => Promise.resolve(imageResponse({ "content-type": "image/png" }))
    readImpl = () => Promise.resolve(new Uint8Array([4, 5, 6]))

    const result = await downloadImageForExport(
      "https://cdn.example.com/person?token=secret",
      "media/submission/screenshot"
    )

    expect(result?.path).toBe("media/submission/screenshot.png")
    expect(result?.buffer).toEqual(Buffer.from([4, 5, 6]))
    expect(mockFetchAllowedUrl).toHaveBeenCalledWith(
      "https://cdn.example.com/person?token=secret",
      {},
      { maxRedirects: 0, requireHttps: true, timeoutMs: 10_000 }
    )
    expect(mockReadResponseBytes).toHaveBeenCalledWith(expect.anything(), 20 * 1024 * 1024)

    fetchImpl = () => Promise.resolve(imageResponse({ "content-type": "image/jpeg" }))
    expect(
      (await downloadImageForExport(
        "https://cdn.example.com/person",
        "media/submission/photo"
      ))?.path
    ).toBe("media/submission/photo.jpg")
  })

  it("falls back to the URL extension and warns safely for unknown media", async () => {
    const warn = mock(() => {})
    const originalWarn = console.warn
    console.warn = warn

    try {
      fetchImpl = () => Promise.resolve(imageResponse({ "content-type": "application/octet-stream" }))
      expect(
        (await downloadImageForExport(
          "https://cdn.example.com/person.jpeg?token=secret",
          "media/submission/photo"
        ))?.path
      ).toBe("media/submission/photo.jpg")
      expect(warn).not.toHaveBeenCalled()

      fetchImpl = () => Promise.resolve({
        ok: true,
        headers: { get: () => "unknown\nsecret" },
        body: null,
      } as unknown as Response)
      expect(
        (await downloadImageForExport(
          "https://cdn.example.com/person?token=secret",
          "media/submission/blob"
        ))?.path
      ).toBe("media/submission/blob.bin")
      expect(String(warn.mock.calls[0]?.[0])).toContain("https://cdn.example.com/[redacted]")
      expect(String(warn.mock.calls[0]?.[0])).not.toContain("token=secret")
      expect(String(warn.mock.calls[0]?.[0])).not.toContain("\n")
    } finally {
      console.warn = originalWarn
    }
  })

  it("rejects failed and oversized responses before reading bytes", async () => {
    fetchImpl = () => Promise.resolve(imageResponse({}, false))
    expect(
      await downloadImageForExport(
        "https://cdn.example.com/not-found.png",
        "media/submission/missing"
      )
    ).toBeNull()
    expect(mockReadResponseBytes).not.toHaveBeenCalled()

    const cancel = mock(() => Promise.resolve())
    fetchImpl = () => Promise.resolve({
      ok: true,
      headers: new Headers({
        "content-type": "image/png",
        "content-length": String(20 * 1024 * 1024 + 1),
      }),
      body: { cancel },
    } as unknown as Response)
    expect(
      await downloadImageForExport(
        "https://cdn.example.com/huge.png?token=secret",
        "media/submission/huge"
      )
    ).toBeNull()
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(mockReadResponseBytes).not.toHaveBeenCalled()
  })

  it("handles streaming overflow and redacts fetch errors", async () => {
    const warn = mock(() => {})
    const originalWarn = console.warn
    console.warn = warn

    try {
      fetchImpl = () => Promise.resolve(imageResponse({ "content-type": "image/webp" }))
      readImpl = () => Promise.resolve(null)
      expect(
        await downloadImageForExport(
          "https://cdn.example.com/overflow.webp?token=secret",
          "media/submission/overflow"
        )
      ).toBeNull()

      fetchImpl = () => Promise.reject(
        new Error("failed https://cdn.example.com/private.png?token=secret")
      )
      expect(
        await downloadImageForExport(
          "https://cdn.example.com/private.png?token=secret",
          "media/submission/error"
        )
      ).toBeNull()
      const logOutput = JSON.stringify(warn.mock.calls)
      expect(logOutput).toContain("https://cdn.example.com/[redacted]")
      expect(logOutput).not.toContain("token=secret")
      expect(logOutput).not.toContain("private.png")
    } finally {
      console.warn = originalWarn
    }
  })
})
