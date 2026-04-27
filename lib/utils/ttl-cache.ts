const DEFAULT_TTL_MS = 60 * 60 * 1000
const MAX_ENTRIES = 500

type CacheEntry<T> = {
  value: T
  expiresAt: number
}

const store = new Map<string, CacheEntry<unknown>>()
const inflight = new Map<string, Promise<unknown>>()

function evictExpiredAndOldest(): void {
  const now = Date.now()
  for (const [key, entry] of store) {
    if (entry.expiresAt <= now) store.delete(key)
  }
  while (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value
    if (oldest === undefined) break
    store.delete(oldest)
  }
}

export function ttlCache<T>(
  key: string,
  fn: () => Promise<T>,
  ttlMs = DEFAULT_TTL_MS
): Promise<T> {
  const existing = store.get(key) as CacheEntry<T> | undefined
  if (existing && existing.expiresAt > Date.now()) {
    return Promise.resolve(existing.value)
  }

  const pending = inflight.get(key) as Promise<T> | undefined
  if (pending) return pending

  const promise = fn()
    .then((value) => {
      if (store.size >= MAX_ENTRIES) evictExpiredAndOldest()
      store.set(key, { value, expiresAt: Date.now() + ttlMs })
      return value
    })
    .finally(() => {
      inflight.delete(key)
    })

  inflight.set(key, promise)
  return promise
}
