/**
 * Asserts a response is 2xx, throws on error. Returns void — use for
 * DELETE / fire-and-forget where no response body is needed.
 *
 * Usage:  .then(assertOk)
 */
export async function assertOk(res: Response): Promise<void> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(
      (body as { error?: string }).error || `Request failed (${res.status})`
    )
  }
}

/**
 * Asserts a response is 2xx and parses the JSON body as T. Throws on
 * non-2xx responses AND on 204 (no content) — if you asked for T, a
 * missing body is a contract violation.
 *
 * Usage:  .then(assertOkJson<MyType>)
 */
export async function assertOkJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(
      (body as { error?: string }).error || `Request failed (${res.status})`
    )
  }
  if (res.status === 204) {
    throw new Error("Expected JSON response but received 204 No Content")
  }
  return res.json() as Promise<T>
}
