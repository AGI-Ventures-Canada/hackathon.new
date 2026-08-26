import {
  isSafeExternalUrl,
  redactImportSourceUrl,
  safeRedirectUrl,
} from "@/lib/utils/url"

const RESUME_PREFIX = "oatmeal:create-resume:"
const ACTIVE_RESUME_PREFIX = "oatmeal:create-resume-active:"
const RESUME_EXPIRY_MS = 24 * 60 * 60 * 1_000
const ACTIVE_RESUME_EXPIRY_MS = 24 * 60 * 60 * 1_000
const MAX_DIRECT_AUTH_URL_LENGTH = 6_000
const MAX_IMPORT_STORAGE_KEY_LENGTH = 40_000
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type AuthResumeTarget =
  | { kind: "redirect"; redirectUrl: string }
  | { kind: "import"; sourceUrl: string; storageKey: string }

type CreateResumePayload = AuthResumeTarget & { createdAt: string }
type ActiveResumePayload = AuthResumeTarget & { activatedAt: string }

function resumeStorages(): Storage[] {
  const storages: Storage[] = []
  for (const getStorage of [
    () => globalThis.sessionStorage,
    () => globalThis.localStorage,
  ]) {
    try {
      const storage = getStorage()
      if (storage && !storages.includes(storage)) storages.push(storage)
    } catch {}
  }
  return storages
}

export function createAuthResumeTarget(
  redirectUrl: string,
  importTarget?: { sourceUrl: string; storageKey: string },
): string | null {
  const safeRedirect = importTarget
    ? (isSafeResumeRedirect(redirectUrl) ? redirectUrl : "")
    : safeRedirectUrl(redirectUrl, "")
  if (!safeRedirect) return null
  if (importTarget && !isValidImportTarget(importTarget)) return null

  const encodedAuthLength = `/sign-in?redirect_url=${encodeURIComponent(safeRedirect)}`.length
  if (!importTarget && encodedAuthLength <= MAX_DIRECT_AUTH_URL_LENGTH) {
    return safeRedirect
  }

  const token = crypto.randomUUID()
  const key = `${RESUME_PREFIX}${token}`
  const value = JSON.stringify({
    ...(importTarget
      ? { kind: "import" as const, ...importTarget }
      : { kind: "redirect" as const, redirectUrl: safeRedirect }),
    createdAt: new Date().toISOString(),
  } satisfies CreateResumePayload)
  let stored = false
  for (const storage of resumeStorages()) {
    try {
      storage.setItem(key, value)
      if (storage.getItem(key) === value) stored = true
    } catch {}
  }
  return stored ? `/resume-create?token=${token}` : null
}

export function takeAuthResumeTarget(token: string): AuthResumeTarget | null {
  const target = readAuthResumeTarget(token)
  if (!target) return null
  removeResumeRecord(`${RESUME_PREFIX}${token}`)
  return target
}

function readAuthResumeTarget(token: string): AuthResumeTarget | null {
  if (!UUID_V4_PATTERN.test(token)) return null
  const key = `${RESUME_PREFIX}${token}`
  for (const storage of resumeStorages()) {
    let raw: string | null = null
    try {
      raw = storage.getItem(key)
    } catch {}
    if (!raw) continue
    try {
      const payload = JSON.parse(raw) as CreateResumePayload
      const createdAt = new Date(payload.createdAt).getTime()
      if (
        !Number.isFinite(createdAt) ||
        createdAt > Date.now() + 60_000 ||
        Date.now() - createdAt >= RESUME_EXPIRY_MS
      ) {
        removeStorageRecord(storage, key)
        continue
      }
      let target: AuthResumeTarget
      if (payload.kind === "import") {
        if (!isValidImportTarget(payload)) {
          removeStorageRecord(storage, key)
          continue
        }
        target = {
          kind: "import",
          sourceUrl: payload.sourceUrl,
          storageKey: payload.storageKey,
        }
      } else {
        const safe = safeRedirectUrl(payload.redirectUrl)
        if (safe !== payload.redirectUrl) {
          removeStorageRecord(storage, key)
          continue
        }
        target = { kind: "redirect", redirectUrl: safe }
      }
      return target
    } catch {
      removeStorageRecord(storage, key)
    }
  }
  return null
}

export function restoreAuthResumeTarget(token: string): AuthResumeTarget | null {
  if (!UUID_V4_PATTERN.test(token)) return null
  const activeKey = `${ACTIVE_RESUME_PREFIX}${token}`
  for (const storage of resumeStorages()) {
    let raw: string | null = null
    try {
      raw = storage.getItem(activeKey)
    } catch {}
    if (!raw) continue
    try {
      const payload = JSON.parse(raw) as ActiveResumePayload
      const activatedAt = new Date(payload.activatedAt).getTime()
      if (
        !Number.isFinite(activatedAt) ||
        activatedAt > Date.now() + 60_000 ||
        Date.now() - activatedAt >= ACTIVE_RESUME_EXPIRY_MS ||
        !isValidTarget(payload)
      ) {
        removeStorageRecord(storage, activeKey)
        continue
      }
      return payload.kind === "import"
        ? {
            kind: "import",
            sourceUrl: payload.sourceUrl,
            storageKey: payload.storageKey,
          }
        : { kind: "redirect", redirectUrl: payload.redirectUrl }
    } catch {
      removeStorageRecord(storage, activeKey)
    }
  }

  const target = readAuthResumeTarget(token)
  if (!target) return null
  const active = JSON.stringify({
    ...target,
    activatedAt: new Date().toISOString(),
  } satisfies ActiveResumePayload)
  let activated = false
  for (const storage of resumeStorages()) {
    try {
      storage.setItem(activeKey, active)
      if (storage.getItem(activeKey) === active) activated = true
    } catch {}
  }
  if (activated) removeResumeRecord(`${RESUME_PREFIX}${token}`)
  return target
}

function isValidImportTarget(target: {
  sourceUrl: unknown
  storageKey: unknown
}): boolean {
  return typeof target.sourceUrl === "string" &&
    target.sourceUrl.length <= 2_048 &&
    isSafeExternalUrl(target.sourceUrl) &&
    redactImportSourceUrl(target.sourceUrl) === target.sourceUrl &&
    typeof target.storageKey === "string" &&
    target.storageKey.startsWith("oatmeal:external-import:") &&
    target.storageKey.length <= MAX_IMPORT_STORAGE_KEY_LENGTH &&
    !/[\u0000-\u001f\u007f]/.test(target.storageKey)
}

function isValidTarget(target: CreateResumePayload | ActiveResumePayload): boolean {
  if (target.kind === "import") return isValidImportTarget(target)
  return typeof target.redirectUrl === "string" &&
    safeRedirectUrl(target.redirectUrl, "") === target.redirectUrl
}

function isSafeResumeRedirect(value: string): boolean {
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.length > MAX_IMPORT_STORAGE_KEY_LENGTH ||
    value.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) return false
  try {
    const base = new URL("https://redirect.invalid")
    return new URL(value, base).origin === base.origin
  } catch {
    return false
  }
}

function removeResumeRecord(key: string) {
  for (const storage of resumeStorages()) {
    try {
      storage.removeItem(key)
    } catch {}
  }
}

function removeStorageRecord(storage: Storage, key: string) {
  try {
    storage.removeItem(key)
  } catch {}
}
