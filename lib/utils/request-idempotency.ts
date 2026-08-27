import { sha256Fingerprint } from "@/lib/utils/hash"

export type RequestIdempotencyResult =
  | { ok: true; fingerprint: string }
  | { ok: false; error: string; code: "invalid_idempotency_key" }

export async function getRequestIdempotencyFingerprint(
  request: Request,
  fallback: string,
): Promise<RequestIdempotencyResult> {
  const header = request.headers.get("idempotency-key")
  if (header === null) return { ok: true, fingerprint: fallback }

  const value = header.trim()
  if (!value || value.length > 200 || /[\r\n]/.test(value)) {
    return {
      ok: false,
      error: "Idempotency-Key must be 1 to 200 single-line characters.",
      code: "invalid_idempotency_key",
    }
  }

  return { ok: true, fingerprint: await sha256Fingerprint(value) }
}
