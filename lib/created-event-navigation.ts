import { isValidSlugFormat } from "@/lib/utils/slug"

const STORAGE_KEY = "oatmeal:created-event-navigation"
const EXPIRY_MS = 24 * 60 * 60 * 1_000
const CLOCK_SKEW_MS = 5 * 60 * 1_000

type CreatedEventNavigation = {
  version: 1
  slug: string
  createdAt: string
}

function getStorage(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null
  } catch {
    return null
  }
}

function parseNavigation(raw: string | null): CreatedEventNavigation | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as CreatedEventNavigation
    const createdAt = new Date(value.createdAt).getTime()
    if (
      value.version !== 1 ||
      typeof value.slug !== "string" ||
      value.slug.length > 100 ||
      !isValidSlugFormat(value.slug) ||
      !Number.isFinite(createdAt) ||
      createdAt - Date.now() > CLOCK_SKEW_MS ||
      Date.now() - createdAt >= EXPIRY_MS
    ) return null
    return value
  } catch {
    return null
  }
}

function removeNavigation(storage: Storage): boolean {
  try {
    storage.removeItem(STORAGE_KEY)
    return storage.getItem(STORAGE_KEY) === null
  } catch {
    return false
  }
}

export function rememberCreatedEventNavigation(slug: string): boolean {
  if (slug.length > 100 || !isValidSlugFormat(slug)) return false
  const storage = getStorage()
  if (!storage) return false
  const value = JSON.stringify({
    version: 1,
    slug,
    createdAt: new Date().toISOString(),
  } satisfies CreatedEventNavigation)
  try {
    storage.setItem(STORAGE_KEY, value)
    return storage.getItem(STORAGE_KEY) === value
  } catch {
    return false
  }
}

export function getPendingCreatedEventNavigation(): string | null {
  const storage = getStorage()
  if (!storage) return null
  let raw: string | null
  try {
    raw = storage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
  const navigation = parseNavigation(raw)
  if (!navigation && raw !== null) removeNavigation(storage)
  return navigation?.slug ?? null
}

export function acknowledgeCreatedEventNavigation(slug: string): boolean {
  if (getPendingCreatedEventNavigation() !== slug) return false
  const storage = getStorage()
  return storage ? removeNavigation(storage) : false
}
