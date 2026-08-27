const WEBMCP_REQUEST_HEADER = "x-webmcp-request"
const WEBMCP_STATUS_HEADER = "x-webmcp-expected-status"
const WEBMCP_VERSION_HEADER = "x-webmcp-event-version"
const WEBMCP_IDEMPOTENCY_HEADER = "x-webmcp-idempotency-key"

export const WEBMCP_PRE_COMPLETION_STATUSES = [
  "draft",
  "published",
  "registration_open",
  "active",
  "judging",
] as const

export type WebMcpEventMutationContext = {
  status: string
  eventVersion: string
}

export type WebMcpMutationError = {
  status: 400 | 409
  code:
    | "webmcp_context_required"
    | "webmcp_invalid_mutation"
    | "event_changed"
  error: string
}

export function createWebMcpMutationHeaders(
  context: WebMcpEventMutationContext,
  idempotencyKey?: string,
): Record<string, string> {
  const headers = {
    [WEBMCP_REQUEST_HEADER]: "1",
    [WEBMCP_STATUS_HEADER]: context.status,
    [WEBMCP_VERSION_HEADER]: context.eventVersion,
  }
  return idempotencyKey
    ? { ...headers, [WEBMCP_IDEMPOTENCY_HEADER]: idempotencyKey }
    : headers
}

export function isWebMcpMutationRequest(request: Request): boolean {
  return request.headers.get(WEBMCP_REQUEST_HEADER) === "1"
}

export function getWebMcpIdempotencyKey(request: Request): string | null {
  if (!isWebMcpMutationRequest(request)) return null
  const value = request.headers.get(WEBMCP_IDEMPOTENCY_HEADER)
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null
}

export function isWebMcpPreCompletionStatus(status: string): boolean {
  return WEBMCP_PRE_COMPLETION_STATUSES.some((allowed) => allowed === status)
}

export function validateWebMcpMutationContext(
  request: Request,
  current: WebMcpEventMutationContext,
  allowedStatuses: readonly string[],
): WebMcpMutationError | null {
  if (!allowedStatuses.includes(current.status)) {
    return {
      status: 409,
      code: "event_changed",
      error: "This event can't be changed at its current stage.",
    }
  }
  if (!isWebMcpMutationRequest(request)) return null

  const expectedStatus = request.headers.get(WEBMCP_STATUS_HEADER)
  const expectedVersion = request.headers.get(WEBMCP_VERSION_HEADER)
  if (!expectedStatus || !expectedVersion) {
    return {
      status: 400,
      code: "webmcp_context_required",
      error: "Refresh the event page before trying this action again.",
    }
  }

  if (
    current.status !== expectedStatus ||
    current.eventVersion !== expectedVersion
  ) {
    return {
      status: 409,
      code: "event_changed",
      error: "The event changed. Refresh the page and review it before trying again.",
    }
  }

  return null
}

export function validateWebMcpSettingsMutationContext(
  request: Request,
  current: WebMcpEventMutationContext,
  body: Record<string, unknown>,
): WebMcpMutationError | null {
  const suppliedFields = Object.entries(body)
    .filter(([, value]) => value !== undefined)
    .map(([name]) => name)
  const allowedFields = new Set([
    "name",
    "description",
    "locale",
    "startsAt",
    "endsAt",
  ])
  if (isWebMcpMutationRequest(request)) {
    const hasEditableField = suppliedFields.some((field) => field !== "locale")
    if (
      !hasEditableField ||
      suppliedFields.some((field) => !allowedFields.has(field))
    ) {
      return {
        status: 400,
        code: "webmcp_invalid_mutation",
        error: "WebMCP can only update event details or draft dates here.",
      }
    }
  } else if (suppliedFields.includes("status")) {
    return null
  }

  const changesTimeline =
    suppliedFields.includes("startsAt") || suppliedFields.includes("endsAt")
  return validateWebMcpMutationContext(
    request,
    current,
    changesTimeline ? ["draft"] : WEBMCP_PRE_COMPLETION_STATUSES,
  )
}
