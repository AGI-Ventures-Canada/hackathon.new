import { describe, expect, it } from "bun:test"
import { getRequestIdempotencyFingerprint } from "@/lib/utils/request-idempotency"

describe("getRequestIdempotencyFingerprint", () => {
  it("uses the stable fallback when no header is supplied", async () => {
    await expect(getRequestIdempotencyFingerprint(
      new Request("https://hackathon.new/remind"),
      "manual",
    )).resolves.toEqual({ ok: true, fingerprint: "manual" })
  })

  it("hashes a caller key before it reaches the provider", async () => {
    const result = await getRequestIdempotencyFingerprint(
      new Request("https://hackathon.new/remind", {
        headers: { "Idempotency-Key": "retry-safe-request" },
      }),
      "manual",
    )

    expect(result).toEqual({
      ok: true,
      fingerprint: expect.stringMatching(/^[a-f0-9]{24}$/),
    })
  })

  it("rejects empty and oversized keys", async () => {
    for (const value of [" ", "x".repeat(201)]) {
      const result = await getRequestIdempotencyFingerprint(
        new Request("https://hackathon.new/remind", {
          headers: { "Idempotency-Key": value },
        }),
        "manual",
      )
      expect(result).toMatchObject({ ok: false, code: "invalid_idempotency_key" })
    }
  })
})
