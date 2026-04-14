import { describe, it, expect } from "vitest"
import { assertOk } from "@/lib/utils/fetch"

function fakeResponse(status: number, body?: unknown): Response {
  const hasBody = body !== undefined
  return {
    ok: status >= 200 && status < 300,
    status,
    json: hasBody
      ? () => Promise.resolve(body)
      : () => Promise.reject(new Error("no body")),
  } as Response
}

describe("assertOk", () => {
  it("resolves with parsed JSON for 200", async () => {
    const data = { id: "1", name: "test" }
    const result = await assertOk<typeof data>(fakeResponse(200, data))
    expect(result).toEqual(data)
  })

  it("returns undefined for 204 (no content)", async () => {
    const result = await assertOk(fakeResponse(204))
    expect(result).toBeUndefined()
  })

  it("throws with error field from JSON body on 4xx", async () => {
    await expect(
      assertOk(fakeResponse(400, { error: "Invalid input" }))
    ).rejects.toThrow("Invalid input")
  })

  it("throws with status code when 4xx body has no error field", async () => {
    await expect(
      assertOk(fakeResponse(422, { detail: "unprocessable" }))
    ).rejects.toThrow("Request failed (422)")
  })

  it("throws with status code when 4xx body is not JSON", async () => {
    const res = {
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error("not json")),
    } as unknown as Response

    await expect(assertOk(res)).rejects.toThrow("Request failed (500)")
  })

  it("resolves for other 2xx statuses (e.g. 201)", async () => {
    const data = { created: true }
    const result = await assertOk<typeof data>(fakeResponse(201, data))
    expect(result).toEqual(data)
  })
})
