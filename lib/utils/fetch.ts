import { isValidSlugFormat } from "@/lib/utils/slug"
import { isValidUuid } from "@/lib/utils/uuid"

/**
 * Asserts a response is 2xx, throws on error. Returns void — use for
 * DELETE / fire-and-forget where no response body is needed.
 *
 * Usage:  .then(assertOk)
 */
export async function assertOk(res: Response): Promise<void> {
  if (!res.ok) {
    throw await responseError(res)
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
    throw await responseError(res)
  }
  if (res.status === 204) {
    throw new Error("Expected JSON response but received 204 No Content")
  }
  return res.json() as Promise<T>
}

export type ExistingEventRecovery = {
  id: string
  name: string
  slug: string
}

export class FetchResponseError extends Error {
  readonly status: number
  readonly code: string | null
  readonly retryable: boolean
  readonly committed: boolean
  readonly existingEvent: ExistingEventRecovery | null

  constructor({
    message,
    status,
    code,
    retryable,
    committed,
    existingEvent,
  }: {
    message: string
    status: number
    code?: string | null
    retryable?: boolean
    committed?: boolean
    existingEvent?: ExistingEventRecovery | null
  }) {
    super(message)
    this.name = "FetchResponseError"
    this.status = status
    this.code = code ?? null
    this.retryable = retryable ?? false
    this.committed = committed === true
    this.existingEvent = existingEvent ?? null
  }
}

function readExistingEventRecovery(value: unknown): ExistingEventRecovery | null {
  if (!value || typeof value !== "object") return null
  const id = Reflect.get(value, "id")
  const name = Reflect.get(value, "name")
  const slug = Reflect.get(value, "slug")
  if (
    typeof id !== "string" || !isValidUuid(id) ||
    typeof name !== "string" || !name.trim() || name.length > 120 ||
    typeof slug !== "string" || slug.length > 100 || !isValidSlugFormat(slug)
  ) return null
  return { id, name, slug }
}

async function responseError(res: Response): Promise<FetchResponseError> {
  const body = await res.json().catch(() => ({})) as {
    error?: string
    code?: string
    retryable?: boolean
    committed?: unknown
    existingEvent?: unknown
  }
  return new FetchResponseError({
    message: body.error || `Request failed (${res.status})`,
    status: res.status,
    code: body.code,
    retryable: body.retryable,
    committed: body.committed === true,
    existingEvent: readExistingEventRecovery(body.existingEvent),
  })
}
