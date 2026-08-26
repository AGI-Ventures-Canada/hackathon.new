import { describe, it, expect } from "bun:test"
import { assertOk, assertOkJson, FetchResponseError } from "@/lib/utils/fetch"

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
  it("resolves for 200", async () => {
    await expect(assertOk(fakeResponse(200, {}))).resolves.toBeUndefined()
  })

  it("resolves for 204 (no content)", async () => {
    await expect(assertOk(fakeResponse(204))).resolves.toBeUndefined()
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

  it("preserves structured conflict details", async () => {
    try {
      await assertOk(fakeResponse(422, {
        error: "This draft was already used",
        code: "draft_conflict",
        retryable: false,
        existingEvent: {
          id: "11111111-1111-4111-8111-111111111111",
          name: "Created event",
          slug: "created-event",
        },
      }))
      throw new Error("Expected assertOk to throw")
    } catch (error) {
      expect(error).toBeInstanceOf(FetchResponseError)
      expect(error).toMatchObject({
        message: "This draft was already used",
        status: 422,
        code: "draft_conflict",
        retryable: false,
        existingEvent: {
          id: "11111111-1111-4111-8111-111111111111",
          name: "Created event",
          slug: "created-event",
        },
      })
    }
  })

  it("trusts committed recovery only with an explicit boolean and valid event", async () => {
    const validEvent = {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Created event",
      slug: "created-event",
    }
    try {
      await assertOk(fakeResponse(503, {
        error: "Setup was not scheduled",
        code: "finalization_unscheduled",
        committed: true,
        existingEvent: validEvent,
      }))
      throw new Error("Expected assertOk to throw")
    } catch (error) {
      expect(error).toMatchObject({
        committed: true,
        existingEvent: validEvent,
      })
    }

    try {
      await assertOk(fakeResponse(503, {
        error: "Setup was not scheduled",
        code: "finalization_unscheduled",
        committed: "true",
        existingEvent: { ...validEvent, slug: "" },
      }))
      throw new Error("Expected assertOk to throw")
    } catch (error) {
      expect(error).toMatchObject({
        committed: false,
        existingEvent: null,
      })
    }
  })

  it("rejects malformed recovery IDs and route slugs", async () => {
    for (const existingEvent of [
      null,
      "not-an-object",
      { id: "not-a-uuid", name: "Created event", slug: "created-event" },
      {
        id: "11111111-1111-4111-8111-111111111111",
        name: "",
        slug: "created-event",
      },
      {
        id: "11111111-1111-4111-8111-111111111111",
        name: "N".repeat(121),
        slug: "created-event",
      },
      {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Created event",
        slug: "../created-event",
      },
      {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Created event",
        slug: "s".repeat(101),
      },
    ]) {
      try {
        await assertOk(fakeResponse(422, {
          error: "This draft was already used",
          code: "draft_conflict",
          existingEvent,
        }))
        throw new Error("Expected assertOk to throw")
      } catch (error) {
        expect(error).toMatchObject({ existingEvent: null })
      }
    }
  })

  it("uses safe defaults for optional structured error fields", () => {
    expect(new FetchResponseError({ message: "Failed", status: 500 })).toMatchObject({
      name: "FetchResponseError",
      message: "Failed",
      status: 500,
      code: null,
      retryable: false,
      committed: false,
      existingEvent: null,
    })
  })

  it("throws with status code when body is not JSON", async () => {
    const res = {
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error("not json")),
    } as unknown as Response

    await expect(assertOk(res)).rejects.toThrow("Request failed (500)")
  })
})

describe("assertOkJson", () => {
  it("resolves with parsed JSON for 200", async () => {
    const data = { id: "1", name: "test" }
    const result = await assertOkJson<typeof data>(fakeResponse(200, data))
    expect(result).toEqual(data)
  })

  it("resolves with parsed JSON for 201", async () => {
    const data = { created: true }
    const result = await assertOkJson<typeof data>(fakeResponse(201, data))
    expect(result).toEqual(data)
  })

  it("throws on 204 (no content)", async () => {
    await expect(
      assertOkJson<{ id: string }>(fakeResponse(204))
    ).rejects.toThrow("Expected JSON response but received 204 No Content")
  })

  it("throws with error field from JSON body on 4xx", async () => {
    await expect(
      assertOkJson<unknown>(fakeResponse(400, { error: "Bad request" }))
    ).rejects.toThrow("Bad request")
  })

  it("throws with status code when body is not JSON", async () => {
    const res = {
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error("not json")),
    } as unknown as Response

    await expect(assertOkJson<unknown>(res)).rejects.toThrow("Request failed (500)")
  })
})
