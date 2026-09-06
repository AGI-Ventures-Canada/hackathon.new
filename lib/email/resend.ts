import {
  Resend,
  type CreateEmailOptions,
  type CreateEmailRequestOptions,
  type CreateEmailResponse,
} from "resend"
import {
  buildMailtoUnsubscribeHeaders,
  extractEmailAddress,
  getReplyToAddress,
  renderEmail,
} from "./utils"
import AgentNotificationEmail from "@/emails/agent-notification"
import { sha256Fingerprint } from "@/lib/utils/hash"
import { isSyntheticEmail } from "@/lib/utils/synthetic-user"

let resendClient: Resend | null = null
let resendClientApiKey: string | null = null

export function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (!apiKey) {
    throw new Error("RESEND_API_KEY environment variable is required")
  }

  if (!resendClient || resendClientApiKey !== apiKey) {
    resendClient = new Resend(apiKey)
    resendClientApiKey = apiKey
  }
  return resendClient
}

export type SendEmailInput = {
  to: string | string[]
  subject: string
  html: string
  text: string
  from?: string
  replyTo?: string
  headers?: Record<string, string>
  tags?: Array<{ name: string; value: string }>
  idempotencyKey?: string
}

export type SendEmailFailureCode =
  | "email_content_invalid"
  | "email_recipient_suppressed"
  | "email_header_invalid"
  | "email_provider_not_configured"
  | "email_provider_timeout"
  | "email_provider_rate_limited"
  | "email_provider_unavailable"
  | "email_provider_authentication_failed"
  | "email_provider_rejected"
  | "email_provider_network_error"
  | "email_provider_invalid_response"
  | "email_provider_error"

export type SendEmailError = {
  code: SendEmailFailureCode
  providerCode: string | null
  message: string
  statusCode: number | null
  retryable: boolean
}

export type SendEmailDeliveryResult =
  | {
      ok: true
      status: "provider_accepted"
      id: string
      attempts: number
      durationMs: number
      error: null
    }
  | {
      ok: false
      status: "failed"
      id: null
      attempts: number
      durationMs: number
      error: SendEmailError
    }

export interface SendEmailResult {
  id: string
}

type SendEmailTransport = (
  payload: CreateEmailOptions,
  options?: CreateEmailRequestOptions,
) => Promise<CreateEmailResponse>

export type SendEmailExecutionOptions = {
  timeoutMs?: number
  maxAttempts?: number
  baseDelayMs?: number
  beforeAttempt?: () => Promise<void>
  transport?: SendEmailTransport
  wait?: (milliseconds: number) => Promise<void>
  providerPacing?: {
    now?: () => number
    wait?: (milliseconds: number) => Promise<void>
  }
}

const DEFAULT_RESEND_TIMEOUT_MS = 10_000
const MAX_RESEND_TIMEOUT_MS = 30_000
const MAX_SEND_ATTEMPTS = 3
const PROVIDER_ATTEMPT_INTERVAL_MS = 250
let providerPacingTail: Promise<void> = Promise.resolve()
let nextProviderAttemptAt = 0

function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(Math.max(Math.trunc(value ?? fallback), minimum), maximum)
}

export function resolveResendTimeoutMs(value?: number): number {
  const configured = value ?? Number(process.env.RESEND_REQUEST_TIMEOUT_MS)
  return boundedInteger(
    configured,
    DEFAULT_RESEND_TIMEOUT_MS,
    100,
    MAX_RESEND_TIMEOUT_MS,
  )
}

function errorProperty(
  error: unknown,
  property: "name" | "message" | "statusCode",
): unknown {
  return error && typeof error === "object"
    ? (error as Record<string, unknown>)[property]
    : undefined
}

export function classifySendEmailError(error: unknown): SendEmailError {
  const providerCodeValue = errorProperty(error, "name")
  const messageValue = errorProperty(error, "message")
  const statusCodeValue = errorProperty(error, "statusCode")
  const providerCode =
    typeof providerCodeValue === "string" ? providerCodeValue : null
  const statusCode =
    typeof statusCodeValue === "number" && Number.isFinite(statusCodeValue)
      ? statusCodeValue
      : null
  const message =
    typeof messageValue === "string" && messageValue.trim()
      ? messageValue.trim().slice(0, 1_000)
      : error instanceof Error
        ? error.message.slice(0, 1_000)
        : "The email provider request failed."

  if (providerCode === "email_provider_timeout") {
    return {
      code: "email_provider_timeout",
      providerCode: null,
      message,
      statusCode: null,
      retryable: true,
    }
  }
  if (
    statusCode === 429 ||
    providerCode === "rate_limit_exceeded" ||
    providerCode === "concurrent_idempotent_requests"
  ) {
    return {
      code: "email_provider_rate_limited",
      providerCode,
      message,
      statusCode,
      retryable: true,
    }
  }
  if (
    (statusCode !== null && statusCode >= 500) ||
    providerCode === "internal_server_error"
  ) {
    return {
      code: "email_provider_unavailable",
      providerCode,
      message,
      statusCode,
      retryable: true,
    }
  }
  if (
    statusCode === 401 ||
    statusCode === 403 ||
    ["missing_api_key", "restricted_api_key", "invalid_api_key"].includes(
      providerCode ?? "",
    )
  ) {
    return {
      code: "email_provider_authentication_failed",
      providerCode,
      message,
      statusCode,
      retryable: false,
    }
  }
  if (statusCode !== null && statusCode >= 400 && statusCode < 500) {
    return {
      code: "email_provider_rejected",
      providerCode,
      message,
      statusCode,
      retryable: false,
    }
  }
  if (
    error instanceof TypeError ||
    (providerCode === "application_error" && statusCode === null) ||
    ["AbortError", "FetchError", "NetworkError"].includes(providerCode ?? "")
  ) {
    return {
      code: "email_provider_network_error",
      providerCode,
      message,
      statusCode,
      retryable: true,
    }
  }

  return {
    code: "email_provider_error",
    providerCode,
    message,
    statusCode,
    retryable: false,
  }
}

function logEmailDelivery(input: {
  phase: "attempt" | "complete"
  outcome: "provider_accepted" | "failed"
  attempt: number
  durationMs: number
  error?: SendEmailError
}): void {
  const payload = {
    component: "email_delivery",
    phase: input.phase,
    outcome: input.outcome,
    attempt: input.attempt,
    durationMs: input.durationMs,
    ...(input.error
      ? {
          errorCode: input.error.code,
          providerCode: input.error.providerCode,
          providerStatusCode: input.error.statusCode,
          retryable: input.error.retryable,
        }
      : {}),
  }

  if (input.outcome === "failed") {
    console.warn("[email_delivery]", JSON.stringify(payload))
  } else if (input.phase === "complete") {
    console.info("[email_delivery]", JSON.stringify(payload))
  }
}

async function settleWithin<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        Object.assign(
          new Error(`The email provider did not respond within ${timeoutMs}ms.`),
          { name: "email_provider_timeout" },
        ),
      )
    }, timeoutMs)
  })

  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function retryDelayMs(baseDelayMs: number, attempt: number): number {
  return Math.min(baseDelayMs * 2 ** Math.max(attempt - 1, 0), 5_000)
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function acquireProviderAttemptSlot(
  options: SendEmailExecutionOptions["providerPacing"] = {},
): Promise<void> {
  const now = options.now ?? Date.now
  const wait = options.wait ?? sleep
  const turn = providerPacingTail.then(async () => {
    const current = now()
    const scheduledAt = Math.max(current, nextProviderAttemptAt)
    const delay = scheduledAt - current
    if (delay > 0) await wait(delay)
    nextProviderAttemptAt = Math.max(scheduledAt, now()) + PROVIDER_ATTEMPT_INTERVAL_MS
  })
  providerPacingTail = turn.catch(() => undefined)
  await turn
}

export function resetEmailProviderPacing(): void {
  providerPacingTail = Promise.resolve()
  nextProviderAttemptAt = 0
}

function failedResult(
  startedAt: number,
  attempts: number,
  error: SendEmailError,
): SendEmailDeliveryResult {
  const result: SendEmailDeliveryResult = {
    ok: false,
    status: "failed",
    id: null,
    attempts,
    durationMs: Date.now() - startedAt,
    error,
  }
  logEmailDelivery({
    phase: "complete",
    outcome: "failed",
    attempt: attempts,
    durationMs: result.durationMs,
    error,
  })
  return result
}

function hasInvalidCustomHeaders(headers?: Record<string, string>): boolean {
  if (!headers) return false
  return Object.entries(headers).some(([name, value]) =>
    !name ||
    name.length > 256 ||
    !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) ||
    !value ||
    value.length > 8_192 ||
    /[\r\n\0]/.test(value),
  )
}

function hasInvalidTags(tags?: Array<{ name: string; value: string }>): boolean {
  if (!tags) return false
  return tags.length > 10 || tags.some(({ name, value }) =>
    !name ||
    !value ||
    name.length > 256 ||
    value.length > 256 ||
    !/^[A-Za-z0-9_-]+$/.test(name) ||
    !/^[A-Za-z0-9_-]+$/.test(value),
  )
}

export async function sendEmailWithResult(
  input: SendEmailInput,
  execution: SendEmailExecutionOptions = {},
): Promise<SendEmailDeliveryResult> {
  const startedAt = Date.now()
  const rawFrom = input.from || process.env.RESEND_FROM_EMAIL
  const rawReplyTo = input.replyTo || process.env.RESEND_REPLY_TO_EMAIL
  const fromEmail = rawFrom?.trim()
  const rawSubject = typeof input.subject === "string" ? input.subject : ""
  const html = typeof input.html === "string" ? input.html : ""
  const plainText = typeof input.text === "string" ? input.text : ""
  const subject = rawSubject.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim()
  const idempotencyKey = input.idempotencyKey
  const recipients = Array.isArray(input.to) ? input.to : [input.to]

  if (recipients.some(isSyntheticEmail)) {
    return failedResult(startedAt, 0, {
      code: "email_recipient_suppressed",
      providerCode: null,
      message: "Test data email addresses cannot receive messages.",
      statusCode: null,
      retryable: false,
    })
  }

  if (!fromEmail) {
    return failedResult(startedAt, 0, {
      code: "email_provider_not_configured",
      providerCode: null,
      message: "RESEND_FROM_EMAIL is not configured.",
      statusCode: null,
      retryable: false,
    })
  }

  if (/[\r\n]/.test(rawFrom ?? "") || /[\r\n]/.test(rawReplyTo ?? "") || !subject) {
    return failedResult(startedAt, 0, {
      code: "email_header_invalid",
      providerCode: null,
      message: "Email sender, reply-to, and subject headers must be valid single-line values.",
      statusCode: null,
      retryable: false,
    })
  }

  if (hasInvalidCustomHeaders(input.headers) || hasInvalidTags(input.tags)) {
    return failedResult(startedAt, 0, {
      code: "email_header_invalid",
      providerCode: null,
      message: "Email headers and tags must use safe single-line values.",
      statusCode: null,
      retryable: false,
    })
  }

  if (
    idempotencyKey !== undefined &&
    (!idempotencyKey ||
      idempotencyKey !== idempotencyKey.trim() ||
      /[\r\n]/.test(idempotencyKey) ||
      idempotencyKey.length > 256)
  ) {
    return failedResult(startedAt, 0, {
      code: "email_header_invalid",
      providerCode: null,
      message: "Email idempotency keys must be 1 to 256 single-line characters.",
      statusCode: null,
      retryable: false,
    })
  }

  if (!html.trim() || !plainText.trim()) {
    return failedResult(startedAt, 0, {
      code: "email_content_invalid",
      providerCode: null,
      message: "Email delivery requires non-empty HTML and plain-text bodies.",
      statusCode: null,
      retryable: false,
    })
  }

  let transport = execution.transport
  if (!transport) {
    let client: Resend
    try {
      client = getResendClient()
    } catch {
      return failedResult(startedAt, 0, {
        code: "email_provider_not_configured",
        providerCode: null,
        message: "RESEND_API_KEY is not configured.",
        statusCode: null,
        retryable: false,
      })
    }
    transport = (payload, options) => client.emails.send(payload, options)
  }

  const timeoutMs = resolveResendTimeoutMs(execution.timeoutMs)
  const requestedAttempts = boundedInteger(
    execution.maxAttempts,
    idempotencyKey ? MAX_SEND_ATTEMPTS : 1,
    1,
    MAX_SEND_ATTEMPTS,
  )
  const maxAttempts = idempotencyKey ? requestedAttempts : 1
  const baseDelayMs = boundedInteger(execution.baseDelayMs, 250, 0, 5_000)
  const wait = execution.wait ?? sleep
  const defaultReplyTo = getReplyToAddress(fromEmail) ?? extractEmailAddress(fromEmail)
  const payload: CreateEmailOptions = {
    from: fromEmail,
    to: input.to,
    subject,
    html,
    text: plainText,
    replyTo: input.replyTo?.trim() || defaultReplyTo,
    headers: input.headers,
    tags: input.tags,
  }
  const requestOptions = idempotencyKey
    ? { idempotencyKey }
    : undefined
  let lastError: SendEmailError | null = null

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const attemptStartedAt = Date.now()
    try {
      await acquireProviderAttemptSlot(execution.providerPacing)
      if (execution.beforeAttempt) await execution.beforeAttempt()
      const response = await settleWithin(
        transport(payload, requestOptions),
        timeoutMs,
      )

      if (!response.error && response.data?.id) {
        const result: SendEmailDeliveryResult = {
          ok: true,
          status: "provider_accepted",
          id: response.data.id,
          attempts: attempt,
          durationMs: Date.now() - startedAt,
          error: null,
        }
        logEmailDelivery({
          phase: "complete",
          outcome: "provider_accepted",
          attempt,
          durationMs: result.durationMs,
        })
        return result
      }

      lastError = response.error
        ? classifySendEmailError(response.error)
        : {
            code: "email_provider_invalid_response",
            providerCode: null,
            message: "The email provider returned no message identifier.",
            statusCode: null,
            retryable: true,
          }
    } catch (error) {
      lastError = classifySendEmailError(error)
    }

    logEmailDelivery({
      phase:
        attempt === maxAttempts || !lastError.retryable
          ? "complete"
          : "attempt",
      outcome: "failed",
      attempt,
      durationMs: Date.now() - attemptStartedAt,
      error: lastError,
    })

    if (!lastError.retryable || attempt === maxAttempts) {
      return {
        ok: false,
        status: "failed",
        id: null,
        attempts: attempt,
        durationMs: Date.now() - startedAt,
        error: lastError,
      }
    }

    await wait(retryDelayMs(baseDelayMs, attempt))
  }

  return failedResult(startedAt, maxAttempts, lastError ?? {
    code: "email_provider_error",
    providerCode: null,
    message: "The email provider request failed.",
    statusCode: null,
    retryable: false,
  })
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult | null> {
  const result = await sendEmailWithResult(input)
  return result.ok ? { id: result.id } : null
}

export async function getReceivedEmail(
  emailId: string
): Promise<ReceivedEmailContent | null> {
  const client = getResendClient()

  try {
    const { data, error } = await client.emails.get(emailId)

    if (error || !data) {
      console.error("Failed to get email:", error)
      return null
    }

    return {
      id: data.id,
      from: data.from,
      to: data.to,
      subject: data.subject,
      html: data.html ?? undefined,
      text: data.text ?? undefined,
      createdAt: data.created_at,
    }
  } catch (err) {
    console.error("Failed to get email:", err)
    return null
  }
}

export interface ReceivedEmailContent {
  id: string
  from: string
  to: string[]
  subject: string
  html?: string
  text?: string
  createdAt: string
}

export interface ResendWebhookEvent {
  type: string
  created_at: string
  data: {
    email_id: string
    from: string
    to: string[]
    subject: string
    cc?: string[]
    bcc?: string[]
    message_id?: string
    attachments?: Array<{
      id: string
      filename: string
      content_type: string
    }>
  }
}

export function verifyResendWebhook(
  payload: string,
  headers: {
    svixId: string
    svixTimestamp: string
    svixSignature: string
  }
): boolean {
  const client = getResendClient()
  const secret = process.env.RESEND_WEBHOOK_SECRET

  if (!secret) {
    console.error("RESEND_WEBHOOK_SECRET not configured")
    return false
  }

  try {
    client.webhooks.verify({
      payload,
      headers: {
        id: headers.svixId,
        timestamp: headers.svixTimestamp,
        signature: headers.svixSignature,
      },
      webhookSecret: secret,
    })
    return true
  } catch {
    return false
  }
}

export type AgentNotificationType = "started" | "completed" | "failed"

export async function sendAgentNotification(
  email: string,
  agentName: string,
  runId: string,
  type: AgentNotificationType,
  details?: { output?: string; error?: string }
): Promise<SendEmailResult | null> {
  const subjects: Record<AgentNotificationType, string> = {
    started: `Agent "${agentName}" has started`,
    completed: `Agent "${agentName}" completed successfully`,
    failed: `Agent "${agentName}" failed`,
  }

  const { html, text } = await renderEmail(
    AgentNotificationEmail({
      agentName,
      runId,
      type,
      output: details?.output,
      error: details?.error,
    })
  )
  const runFingerprint = await sha256Fingerprint(runId)
  const recipientFingerprint = await sha256Fingerprint(email.trim().toLowerCase())

  return sendEmail({
    to: email,
    subject: subjects[type],
    html,
    text,
    headers: buildMailtoUnsubscribeHeaders(),
    tags: [
      { name: "type", value: "agent_notification" },
      { name: "status", value: type },
    ],
    idempotencyKey: `agent-notification/${runFingerprint}/${type}/${recipientFingerprint}`,
  })
}
