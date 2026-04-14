export async function assertOk<T = unknown>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(
      (body as { error?: string }).error || `Request failed (${res.status})`
    )
  }
  return res.json() as Promise<T>
}
