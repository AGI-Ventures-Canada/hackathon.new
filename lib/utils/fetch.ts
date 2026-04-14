/**
 * Throws on non-2xx responses. Parses JSON for 2xx, returns undefined for 204.
 *
 * Usage:
 *   .then(assertOk)              // DELETE / fire-and-forget — returns void
 *   .then(assertOk<MyType>)      // expects JSON body — returns MyType
 *
 * 204 responses return undefined even when T is specified. Callers that
 * type-parameterize assertOk on endpoints that may return 204 should
 * account for undefined at the call site.
 */
export async function assertOk(res: Response): Promise<void>
export async function assertOk<T>(res: Response): Promise<T>
export async function assertOk<T = unknown>(res: Response): Promise<T | void> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(
      (body as { error?: string }).error || `Request failed (${res.status})`
    )
  }
  if (res.status === 204) return undefined
  return res.json() as Promise<T>
}
