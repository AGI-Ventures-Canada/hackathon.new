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
