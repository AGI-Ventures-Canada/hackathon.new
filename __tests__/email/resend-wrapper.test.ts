import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test"

const originalApiKey = process.env.RESEND_API_KEY
const originalFrom = process.env.RESEND_FROM_EMAIL
const originalReplyTo = process.env.RESEND_REPLY_TO_EMAIL
const originalTimeout = process.env.RESEND_REQUEST_TIMEOUT_MS
const mockResendSend = mock(() =>
  Promise.resolve({ data: { id: "resend_123" }, error: null, headers: null })
)

mock.module("resend", () => ({
  Resend: class {
    emails = { send: mockResendSend }
    webhooks = { verify: mock(() => true) }
  },
}))

const {
  classifySendEmailError,
  resetEmailProviderPacing,
  resolveResendTimeoutMs,
  sendEmail,
  sendEmailWithResult,
} = await import("@/lib/email/resend")

const input = {
  to: "invitee@example.com",
  subject: "You were invited",
  html: "<p>Open your invitation.</p>",
  text: "Open your invitation.",
  idempotencyKey: "team-invitation/invitation_123",
}

describe("Resend delivery wrapper", () => {
  beforeEach(() => {
    resetEmailProviderPacing()
    mockResendSend.mockClear()
    mockResendSend.mockImplementation(() =>
      Promise.resolve({ data: { id: "resend_123" }, error: null, headers: null })
    )
    process.env.RESEND_API_KEY = "re_test"
    process.env.RESEND_FROM_EMAIL = "Oatmeal <notifications@hackathon.new>"
    delete process.env.RESEND_REPLY_TO_EMAIL
    delete process.env.RESEND_REQUEST_TIMEOUT_MS
  })

  afterAll(() => {
    if (originalApiKey === undefined) delete process.env.RESEND_API_KEY
    else process.env.RESEND_API_KEY = originalApiKey
    if (originalFrom === undefined) delete process.env.RESEND_FROM_EMAIL
    else process.env.RESEND_FROM_EMAIL = originalFrom
    if (originalReplyTo === undefined) delete process.env.RESEND_REPLY_TO_EMAIL
    else process.env.RESEND_REPLY_TO_EMAIL = originalReplyTo
    if (originalTimeout === undefined) delete process.env.RESEND_REQUEST_TIMEOUT_MS
    else process.env.RESEND_REQUEST_TIMEOUT_MS = originalTimeout
  })

  it("returns a typed provider acceptance and applies sender defaults", async () => {
    let payload: Record<string, unknown> | undefined
    const result = await sendEmailWithResult(input, {
      transport: async (nextPayload) => {
        payload = nextPayload as unknown as Record<string, unknown>
        return { data: { id: "accepted_123" }, error: null, headers: null }
      },
    })

    expect(result).toMatchObject({
      ok: true,
      status: "provider_accepted",
      id: "accepted_123",
      attempts: 1,
      error: null,
    })
    expect(payload).toMatchObject({
      from: "Oatmeal <notifications@hackathon.new>",
      replyTo: "notifications@hackathon.new",
      html: input.html,
      text: input.text,
    })
  })

  it("never sends fixture email addresses to the provider", async () => {
    const transport = mock(async () => ({
      data: { id: "should-not-send" },
      error: null,
      headers: null,
    }))

    for (const to of [
      "alice@seed.local",
      "sandbox-person-1@example.invalid",
      ["real@example.com", "sandbox-person-2@example.invalid"],
    ]) {
      const result = await sendEmailWithResult({ ...input, to }, { transport })
      expect(result).toMatchObject({
        ok: false,
        attempts: 0,
        error: { code: "email_recipient_suppressed", retryable: false },
      })
    }

    expect(transport).not.toHaveBeenCalled()
    expect(mockResendSend).not.toHaveBeenCalled()
  })

  it("uses the configured reply-to by default", async () => {
    process.env.RESEND_REPLY_TO_EMAIL = "Oatmeal Support <help@hackathon.new>"
    let replyTo: unknown

    await sendEmailWithResult(input, {
      transport: async (payload) => {
        replyTo = payload.replyTo
        return { data: { id: "accepted_123" }, error: null, headers: null }
      },
    })

    expect(replyTo).toBe("help@hackathon.new")
  })

  it("falls back to the actual sender when no reply-to is configured", async () => {
    let replyTo: unknown

    await sendEmailWithResult(
      { ...input, from: "Demo Host <host@example.com>" },
      {
        transport: async (payload) => {
          replyTo = payload.replyTo
          return { data: { id: "accepted_123" }, error: null, headers: null }
        },
      },
    )

    expect(replyTo).toBe("host@example.com")
  })

  it("normalizes line breaks in subjects before dispatch", async () => {
    let subject: unknown
    const result = await sendEmailWithResult(
      { ...input, subject: "Team invited\r\n for Demo Day" },
      {
        transport: async (payload) => {
          subject = payload.subject
          return { data: { id: "accepted_123" }, error: null, headers: null }
        },
      },
    )

    expect(result.ok).toBe(true)
    expect(subject).toBe("Team invited for Demo Day")
  })

  it("rejects CR/LF in sender and reply-to headers", async () => {
    const transport = mock(() =>
      Promise.resolve({ data: { id: "unexpected" }, error: null, headers: null })
    )

    for (const candidate of [
      { ...input, from: "Oatmeal <hello@hackathon.new>\r\nBcc: victim@example.com" },
      { ...input, replyTo: "help@hackathon.new\nBcc: victim@example.com" },
    ]) {
      const result = await sendEmailWithResult(candidate, { transport })
      expect(result).toMatchObject({
        ok: false,
        attempts: 0,
        error: { code: "email_header_invalid", retryable: false },
      })
    }

    expect(transport).not.toHaveBeenCalled()
  })

  it("rejects unsafe custom headers and tags before provider dispatch", async () => {
    const transport = mock(() =>
      Promise.resolve({ data: { id: "unexpected" }, error: null, headers: null })
    )

    for (const candidate of [
      { ...input, headers: { "X-Event\r\nBcc": "value" } },
      { ...input, headers: { "X-Event": "safe\r\nBcc: victim@example.com" } },
      { ...input, tags: [{ name: "event", value: "unsafe value" }] },
      {
        ...input,
        tags: Array.from({ length: 11 }, (_, index) => ({
          name: "event",
          value: `value_${index}`,
        })),
      },
    ]) {
      const result = await sendEmailWithResult(candidate, { transport })
      expect(result).toMatchObject({
        ok: false,
        attempts: 0,
        error: { code: "email_header_invalid", retryable: false },
      })
    }

    expect(transport).not.toHaveBeenCalled()
  })

  it("rejects malformed idempotency headers before provider dispatch", async () => {
    const transport = mock(() =>
      Promise.resolve({ data: { id: "unexpected" }, error: null, headers: null })
    )

    for (const idempotencyKey of ["", " key", "key\r\nvalue", "x".repeat(257)]) {
      const result = await sendEmailWithResult(
        { ...input, idempotencyKey },
        { transport },
      )
      expect(result).toMatchObject({
        ok: false,
        attempts: 0,
        error: { code: "email_header_invalid", retryable: false },
      })
    }

    expect(transport).not.toHaveBeenCalled()
  })

  it("returns a structured missing-provider configuration failure", async () => {
    delete process.env.RESEND_API_KEY

    const result = await sendEmailWithResult(input)

    expect(result).toMatchObject({
      ok: false,
      status: "failed",
      attempts: 0,
      error: {
        code: "email_provider_not_configured",
        retryable: false,
      },
    })
  })

  it("returns a structured missing-sender configuration failure", async () => {
    delete process.env.RESEND_FROM_EMAIL

    const result = await sendEmailWithResult(input)

    expect(result).toMatchObject({
      ok: false,
      attempts: 0,
      error: {
        code: "email_provider_not_configured",
        retryable: false,
      },
    })
  })

  it("rejects empty HTML or text before provider dispatch", async () => {
    const transport = mock(() =>
      Promise.resolve({ data: { id: "unexpected" }, error: null, headers: null })
    )

    const result = await sendEmailWithResult(
      { ...input, text: "" },
      { transport },
    )

    expect(result).toMatchObject({
      ok: false,
      attempts: 0,
      error: { code: "email_content_invalid", retryable: false },
    })
    expect(transport).not.toHaveBeenCalled()
  })

  it("classifies an invalid provider response", async () => {
    const result = await sendEmailWithResult(input, {
      maxAttempts: 1,
      transport: async () =>
        ({ data: null, error: null, headers: null }) as never,
    })

    expect(result).toMatchObject({
      ok: false,
      attempts: 1,
      error: {
        code: "email_provider_invalid_response",
        retryable: true,
      },
    })
  })

  it("bounds provider calls that do not settle", async () => {
    const startedAt = Date.now()
    const result = await sendEmailWithResult(input, {
      timeoutMs: 100,
      maxAttempts: 1,
      transport: () => new Promise(() => undefined),
    })

    expect(result).toMatchObject({
      ok: false,
      attempts: 1,
      error: { code: "email_provider_timeout", retryable: true },
    })
    expect(Date.now() - startedAt).toBeLessThan(1_000)
  })

  it("classifies retryable and terminal provider failures", () => {
    expect(classifySendEmailError({
      name: "rate_limit_exceeded",
      message: "Try later",
      statusCode: 429,
    })).toMatchObject({
      code: "email_provider_rate_limited",
      retryable: true,
      statusCode: 429,
    })
    expect(classifySendEmailError({
      name: "invalid_api_key",
      message: "Invalid key",
      statusCode: 401,
    })).toMatchObject({
      code: "email_provider_authentication_failed",
      retryable: false,
      statusCode: 401,
    })
    expect(classifySendEmailError(new TypeError("fetch failed"))).toMatchObject({
      code: "email_provider_network_error",
      retryable: true,
    })
    expect(classifySendEmailError({
      name: "application_error",
      message: "socket closed",
    })).toMatchObject({
      code: "email_provider_network_error",
      retryable: true,
    })
    expect(classifySendEmailError("unknown failure")).toEqual({
      code: "email_provider_error",
      providerCode: null,
      message: "The email provider request failed.",
      statusCode: null,
      retryable: false,
    })
    expect(classifySendEmailError(new Error(""))).toMatchObject({
      code: "email_provider_error",
      message: "",
      retryable: false,
    })
  })

  it("retries retryable failures with backoff and one idempotency key", async () => {
    let attempts = 0
    let providerNow = 0
    const waits: number[] = []
    const providerWaits: number[] = []
    const keys: Array<string | undefined> = []
    const result = await sendEmailWithResult(input, {
      wait: async (milliseconds) => {
        waits.push(milliseconds)
      },
      providerPacing: {
        now: () => providerNow,
        wait: async (milliseconds) => {
          providerWaits.push(milliseconds)
          providerNow += milliseconds
        },
      },
      transport: async (_payload, options) => {
        attempts++
        keys.push(options?.idempotencyKey)
        if (attempts < 3) {
          return {
            data: null,
            error: {
              name: "internal_server_error" as const,
              message: "Unavailable",
              statusCode: 503,
            },
            headers: null,
          }
        }
        return { data: { id: "accepted_123" }, error: null, headers: null }
      },
    })

    expect(result).toMatchObject({ ok: true, attempts: 3, id: "accepted_123" })
    expect(waits).toEqual([250, 500])
    expect(providerWaits).toEqual([250, 250])
    expect(keys).toEqual([
      input.idempotencyKey,
      input.idempotencyKey,
      input.idempotencyKey,
    ])
  })

  it("spaces concurrent provider calls across separate email jobs", async () => {
    let providerNow = 0
    const providerWaits: number[] = []
    const attemptTimes: number[] = []
    const providerPacing = {
      now: () => providerNow,
      wait: async (milliseconds: number) => {
        providerWaits.push(milliseconds)
        await Promise.resolve()
        providerNow += milliseconds
      },
    }

    await Promise.all(["one", "two", "three"].map((suffix) =>
      sendEmailWithResult(
        { ...input, idempotencyKey: `${input.idempotencyKey}_${suffix}` },
        {
          providerPacing,
          transport: async () => {
            attemptTimes.push(providerNow)
            return { data: { id: `accepted_${suffix}` }, error: null, headers: null }
          },
        },
      ),
    ))

    expect(attemptTimes).toEqual([0, 250, 500])
    expect(providerWaits).toEqual([250, 250])
  })

  it("retries Resend's concurrent idempotency replay with the same key", async () => {
    let attempts = 0
    const keys: Array<string | undefined> = []
    const result = await sendEmailWithResult(input, {
      wait: async () => undefined,
      transport: async (_payload, options) => {
        attempts++
        keys.push(options?.idempotencyKey)
        if (attempts === 1) {
          return {
            data: null,
            error: {
              name: "concurrent_idempotent_requests" as const,
              message: "The original request is still in progress",
              statusCode: 409,
            },
            headers: null,
          }
        }
        return { data: { id: "replayed_123" }, error: null, headers: null }
      },
    })

    expect(result).toMatchObject({ ok: true, attempts: 2, id: "replayed_123" })
    expect(keys).toEqual([input.idempotencyKey, input.idempotencyKey])
  })

  it("does not retry an idempotency key reused with a different payload", async () => {
    const transport = mock(async () => ({
      data: null,
      error: {
        name: "invalid_idempotent_request" as const,
        message: "The key was used with a different payload",
        statusCode: 409,
      },
      headers: null,
    }))

    const result = await sendEmailWithResult(input, { transport })

    expect(result).toMatchObject({
      ok: false,
      attempts: 1,
      error: { code: "email_provider_rejected", retryable: false },
    })
    expect(transport).toHaveBeenCalledTimes(1)
  })

  it("does not retry a non-retryable provider rejection", async () => {
    const transport = mock(async () => ({
      data: null,
      error: {
        name: "validation_error" as const,
        message: "Recipient is invalid",
        statusCode: 422,
      },
      headers: null,
    }))
    const result = await sendEmailWithResult(input, { transport })

    expect(result).toMatchObject({
      ok: false,
      attempts: 1,
      error: { code: "email_provider_rejected", retryable: false },
    })
    expect(transport).toHaveBeenCalledTimes(1)
  })

  it("does not retry an ambiguous failure without an idempotency key", async () => {
    const transport = mock(async () => ({
      data: null,
      error: {
        name: "internal_server_error" as const,
        message: "Unavailable",
        statusCode: 503,
      },
      headers: null,
    }))

    const result = await sendEmailWithResult(
      { ...input, idempotencyKey: undefined },
      { maxAttempts: 3, transport },
    )

    expect(result).toMatchObject({ ok: false, attempts: 1 })
    expect(transport).toHaveBeenCalledTimes(1)
  })

  it("keeps the nullable sendEmail compatibility contract", async () => {
    const result = await sendEmail(input)

    expect(result).toEqual({ id: "resend_123" })
    expect(mockResendSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Oatmeal <notifications@hackathon.new>",
        to: "invitee@example.com",
        subject: "You were invited",
        html: input.html,
        text: input.text,
        replyTo: "notifications@hackathon.new",
      }),
      { idempotencyKey: input.idempotencyKey },
    )
  })

  it("returns null from the compatibility wrapper on validation failure", async () => {
    delete process.env.RESEND_FROM_EMAIL
    await expect(sendEmail(input)).resolves.toBeNull()
    expect(mockResendSend).not.toHaveBeenCalled()
  })

  it("uses a privacy-safe stable key for agent notifications", async () => {
    const { sendAgentNotification } = await import("@/lib/email/resend")

    await sendAgentNotification(
      "Person@Example.com",
      "Project helper",
      "run_123",
      "completed",
    )

    const calls = mockResendSend.mock.calls as unknown as Array<
      [
        {
          headers?: Record<string, string>
          tags?: Array<{ name: string; value: string }>
        },
        { idempotencyKey?: string } | undefined,
      ]
    >
    const payload = calls.at(-1)?.[0]
    const options = calls.at(-1)?.[1]
    expect(options?.idempotencyKey).toMatch(
      /^agent-notification\/[a-f0-9]{24}\/completed\/[a-f0-9]{24}$/,
    )
    expect(options?.idempotencyKey).not.toContain("Person")
    expect(options?.idempotencyKey).not.toContain("example.com")
    expect(payload?.headers).toEqual({
      "List-Unsubscribe": "<mailto:notifications@hackathon.new?subject=unsubscribe>",
    })
    expect(payload?.tags).toEqual([
      { name: "type", value: "agent_notification" },
      { name: "status", value: "completed" },
    ])
  })

  it("clamps unsafe timeout values", () => {
    expect(resolveResendTimeoutMs(1)).toBe(100)
    expect(resolveResendTimeoutMs(60_000)).toBe(30_000)
  })
})
