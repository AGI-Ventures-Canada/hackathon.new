import type { WebMcpToolError } from "@/lib/webmcp/types"

const MAX_ERROR_MESSAGE_LENGTH = 240

export type WebMcpFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>

export class WebMcpRequestError extends Error {
  readonly code: string
  readonly retryable: boolean

  constructor(error: WebMcpToolError) {
    super(error.message)
    this.name = "WebMcpRequestError"
    this.code = error.code
    this.retryable = error.retryable
  }
}

function getErrorMessage(value: unknown): string | null {
  if (!value || typeof value !== "object") return null
  const error = Reflect.get(value, "error")
  if (typeof error === "string") return error.slice(0, MAX_ERROR_MESSAGE_LENGTH)
  if (!error || typeof error !== "object") return null
  const message = Reflect.get(error, "message")
  return typeof message === "string"
    ? message.slice(0, MAX_ERROR_MESSAGE_LENGTH)
    : null
}

function getErrorCode(value: unknown, status: number): string {
  if (value && typeof value === "object") {
    const code = Reflect.get(value, "code")
    if (typeof code === "string" && code.length <= 80) return code
    const nestedError = Reflect.get(value, "error")
    if (nestedError && typeof nestedError === "object") {
      const nestedCode = Reflect.get(nestedError, "code")
      if (typeof nestedCode === "string" && nestedCode.length <= 80) {
        return nestedCode
      }
    }
  }
  if (status === 401) return "unauthenticated"
  if (status === 403) return "not_authorized"
  if (status === 404) return "not_found"
  if (status === 409) return "event_changed"
  if (status === 422 || status === 400) return "invalid_request"
  if (status === 429) return "rate_limited"
  return "request_failed"
}

export async function fetchWebMcpJson<T>(
  fetcher: WebMcpFetcher,
  input: RequestInfo | URL,
  init: RequestInit,
): Promise<T> {
  const response = await fetcher(input, init)
  if (response.ok) return response.json() as Promise<T>

  const payload: unknown = await response.json().catch(() => null)
  throw new WebMcpRequestError({
    code: getErrorCode(payload, response.status),
    message: getErrorMessage(payload) ?? "The request could not be completed.",
    retryable: response.status === 409 || response.status === 429 || response.status >= 500,
  })
}
