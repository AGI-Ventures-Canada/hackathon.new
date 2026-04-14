export async function assertOk<T = unknown>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(
      (body as { error?: string }).error || `Request failed (${res.status})`
    )
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}
