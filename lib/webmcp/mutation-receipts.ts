const RECEIPT_PREFIX = "oatmeal:webmcp:mutation:v1:"
const RECEIPT_TTL_MS = 5 * 60 * 1000

type PendingReceipt = {
  fingerprint: string
  mutationId: string
  state: "pending"
  createdAt: number
}

type CommittedReceipt = {
  fingerprint: string
  mutationId: string
  state: "committed"
  createdAt: number
  result: unknown
}

export type WebMcpMutationReceipt = PendingReceipt | CommittedReceipt

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

function hashFingerprint(value: string): string {
  let first = 2166136261
  let second = 5381
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    first = Math.imul(first ^ code, 16777619)
    second = Math.imul(second, 33) ^ code
  }
  return `${(first >>> 0).toString(36)}-${(second >>> 0).toString(36)}-${value.length}`
}

function receiptKey(fingerprint: string): string {
  return `${RECEIPT_PREFIX}${hashFingerprint(fingerprint)}`
}

export function createMutationFingerprint(input: {
  method: string
  url: string
  body: Record<string, unknown>
}): string {
  return `${input.method}\n${input.url}\n${JSON.stringify(input.body)}`
}

export function readMutationReceipt(
  fingerprint: string,
): WebMcpMutationReceipt | null {
  const storage = getStorage()
  if (!storage) return null
  const key = receiptKey(fingerprint)
  const value = storage.getItem(key)
  if (!value) return null

  try {
    const parsed = JSON.parse(value) as WebMcpMutationReceipt
    if (
      parsed.fingerprint !== fingerprint ||
      typeof parsed.mutationId !== "string" ||
      typeof parsed.createdAt !== "number" ||
      Date.now() - parsed.createdAt > RECEIPT_TTL_MS ||
      (parsed.state !== "pending" && parsed.state !== "committed")
    ) {
      storage.removeItem(key)
      return null
    }
    return parsed
  } catch {
    storage.removeItem(key)
    return null
  }
}

export function savePendingMutationReceipt(
  fingerprint: string,
  mutationId: string,
): void {
  getStorage()?.setItem(
    receiptKey(fingerprint),
    JSON.stringify({
      fingerprint,
      mutationId,
      state: "pending",
      createdAt: Date.now(),
    } satisfies PendingReceipt),
  )
}

export function saveCommittedMutationReceipt(
  fingerprint: string,
  mutationId: string,
  result: unknown,
): void {
  getStorage()?.setItem(
    receiptKey(fingerprint),
    JSON.stringify({
      fingerprint,
      mutationId,
      state: "committed",
      createdAt: Date.now(),
      result,
    } satisfies CommittedReceipt),
  )
}

export function clearMutationReceipt(fingerprint: string): void {
  getStorage()?.removeItem(receiptKey(fingerprint))
}
