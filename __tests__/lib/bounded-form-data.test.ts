import { describe, expect, it } from "bun:test"
import {
  BoundedFormDataError,
  readBoundedFormData,
} from "@/lib/utils/bounded-form-data"

describe("readBoundedFormData", () => {
  it("parses multipart bodies without a content-length header", async () => {
    const source = new FormData()
    source.set("name", "logo")
    const encoded = new Request("https://example.com/upload", {
      method: "POST",
      body: source,
    })
    const request = new Request(encoded.url, {
      method: "POST",
      headers: { "content-type": encoded.headers.get("content-type")! },
      body: await encoded.arrayBuffer(),
    })

    const parsed = await readBoundedFormData(request, 1_024)

    expect(parsed.get("name")).toBe("logo")
  })

  it("stops reading when the streamed body exceeds the limit", async () => {
    const source = new FormData()
    source.set("file", new File(["x".repeat(2_048)], "large.txt"))
    const encoded = new Request("https://example.com/upload", {
      method: "POST",
      body: source,
    })
    const request = new Request(encoded.url, {
      method: "POST",
      headers: { "content-type": encoded.headers.get("content-type")! },
      body: await encoded.arrayBuffer(),
    })

    await expect(readBoundedFormData(request, 512)).rejects.toMatchObject({
      name: "BoundedFormDataError",
      code: "request_too_large",
    })
  })

  it("rejects a declared body that is already too large", async () => {
    const request = new Request("https://example.com/upload", {
      method: "POST",
      headers: {
        "content-type": "multipart/form-data; boundary=test",
        "content-length": "2048",
      },
      body: "--test--",
    })

    try {
      await readBoundedFormData(request, 512)
      throw new Error("Expected the request to be rejected")
    } catch (error) {
      expect(error).toBeInstanceOf(BoundedFormDataError)
      expect((error as BoundedFormDataError).code).toBe("request_too_large")
    }
  })
})
