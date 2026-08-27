import { describe, expect, it } from "bun:test"
import {
  createWebMcpMutationHeaders,
  getWebMcpIdempotencyKey,
  isWebMcpMutationRequest,
  isWebMcpPreCompletionStatus,
  validateWebMcpMutationContext,
  validateWebMcpSettingsMutationContext,
} from "@/lib/webmcp/mutation-context"

const current = {
  status: "draft",
  eventVersion: "2026-08-25T15:00:00.000Z",
}

describe("WebMCP mutation context", () => {
  it("recognizes only marked requests and known pre-completion states", () => {
    const ordinary = new Request("https://hackathon.new/api/example")
    const marked = new Request("https://hackathon.new/api/example", {
      headers: createWebMcpMutationHeaders(current),
    })
    expect(isWebMcpMutationRequest(ordinary)).toBe(false)
    expect(isWebMcpMutationRequest(marked)).toBe(true)
    for (const status of [
      "draft",
      "published",
      "registration_open",
      "active",
      "judging",
    ]) {
      expect(isWebMcpPreCompletionStatus(status)).toBe(true)
    }
    expect(isWebMcpPreCompletionStatus("completed")).toBe(false)
    expect(isWebMcpPreCompletionStatus("archived")).toBe(false)
  })

  it("accepts only UUID request keys on marked requests", () => {
    const mutationId = "8e64ee8e-2a97-4d9d-846e-c99746307421"
    const marked = new Request("https://hackathon.new/api/example", {
      headers: createWebMcpMutationHeaders(current, mutationId),
    })
    const invalid = new Request("https://hackathon.new/api/example", {
      headers: { ...createWebMcpMutationHeaders(current), "x-webmcp-idempotency-key": "repeat" },
    })
    expect(getWebMcpIdempotencyKey(marked)).toBe(mutationId)
    expect(getWebMcpIdempotencyKey(invalid)).toBeNull()
    expect(getWebMcpIdempotencyKey(new Request("https://hackathon.new/api/example"))).toBeNull()
  })

  it("ignores ordinary app requests", () => {
    expect(
      validateWebMcpMutationContext(
        new Request("https://hackathon.new/api/example"),
        current,
        ["draft"],
      ),
    ).toBeNull()
  })

  it("accepts the exact current lifecycle and version", () => {
    const request = new Request("https://hackathon.new/api/example", {
      headers: createWebMcpMutationHeaders(current),
    })
    expect(
      validateWebMcpMutationContext(request, current, ["draft"]),
    ).toBeNull()
  })

  it("rejects missing, stale, and disallowed contexts", () => {
    const missing = new Request("https://hackathon.new/api/example", {
      headers: { "x-webmcp-request": "1" },
    })
    expect(
      validateWebMcpMutationContext(missing, current, ["draft"]),
    ).toMatchObject({ status: 400, code: "webmcp_context_required" })

    const stale = new Request("https://hackathon.new/api/example", {
      headers: createWebMcpMutationHeaders({
        ...current,
        eventVersion: "2026-08-25T14:00:00.000Z",
      }),
    })
    expect(
      validateWebMcpMutationContext(stale, current, ["draft"]),
    ).toMatchObject({ status: 409, code: "event_changed" })

    const nowLive = new Request("https://hackathon.new/api/example", {
      headers: createWebMcpMutationHeaders(current),
    })
    expect(
      validateWebMcpMutationContext(
        nowLive,
        { ...current, status: "published" },
        ["draft"],
      ),
    ).toMatchObject({ status: 409, code: "event_changed" })

    const wrongStatus = new Request("https://hackathon.new/api/example", {
      headers: createWebMcpMutationHeaders({
        ...current,
        status: "published",
      }),
    })
    expect(
      validateWebMcpMutationContext(wrongStatus, current, ["draft"]),
    ).toMatchObject({ status: 409, code: "event_changed" })
  })

  it("allows details before completion but keeps timeline changes in draft", () => {
    const active = { ...current, status: "active" }
    const activeRequest = new Request("https://hackathon.new/api/example", {
      headers: createWebMcpMutationHeaders(active),
    })
    expect(
      validateWebMcpSettingsMutationContext(activeRequest, active, {
        name: "Build Day",
        locale: "en",
      }),
    ).toBeNull()
    expect(
      validateWebMcpSettingsMutationContext(activeRequest, active, {
        startsAt: "2026-09-10T16:00:00.000Z",
        endsAt: "2026-09-11T16:00:00.000Z",
      }),
    ).toMatchObject({ status: 409, code: "event_changed" })
  })

  it("rejects settings fields outside the WebMCP organizer contract", () => {
    const request = new Request("https://hackathon.new/api/example", {
      headers: createWebMcpMutationHeaders(current),
    })
    expect(
      validateWebMcpSettingsMutationContext(request, current, {
        status: "published",
      }),
    ).toMatchObject({ status: 400, code: "webmcp_invalid_mutation" })

    expect(
      validateWebMcpSettingsMutationContext(request, current, {
        locale: "en",
        description: undefined,
      }),
    ).toMatchObject({ status: 400, code: "webmcp_invalid_mutation" })

    expect(
      validateWebMcpSettingsMutationContext(request, current, {}),
    ).toMatchObject({ status: 400, code: "webmcp_invalid_mutation" })
  })

  it("leaves ordinary settings requests to the normal API contract", () => {
    expect(
      validateWebMcpSettingsMutationContext(
        new Request("https://hackathon.new/api/example"),
        current,
        { status: "published" },
      ),
    ).toBeNull()
  })

  it("requires both lifecycle and version headers on marked requests", () => {
    for (const headers of [
      { "x-webmcp-request": "1", "x-webmcp-expected-status": "draft" },
      { "x-webmcp-request": "1", "x-webmcp-event-version": current.eventVersion },
      {
        "x-webmcp-request": "1",
        "x-webmcp-expected-status": "",
        "x-webmcp-event-version": current.eventVersion,
      },
    ]) {
      expect(validateWebMcpMutationContext(
        new Request("https://hackathon.new/api/example", { headers }),
        current,
        ["draft"],
      )).toMatchObject({ status: 400, code: "webmcp_context_required" })
    }
  })

  it("accepts nullable detail clears but rejects locale-only and mixed unsafe settings", () => {
    const request = new Request("https://hackathon.new/api/example", {
      headers: createWebMcpMutationHeaders(current),
    })
    expect(validateWebMcpSettingsMutationContext(request, current, {
      description: null,
    })).toBeNull()
    expect(validateWebMcpSettingsMutationContext(request, current, {
      name: "Safe name",
      locale: "en",
      status: "published",
    })).toMatchObject({ status: 400, code: "webmcp_invalid_mutation" })
    expect(validateWebMcpSettingsMutationContext(request, current, {
      locale: "en",
    })).toMatchObject({ status: 400, code: "webmcp_invalid_mutation" })
  })

  it("allows draft timeline changes and rejects them after any lifecycle advance", () => {
    const draftRequest = new Request("https://hackathon.new/api/example", {
      headers: createWebMcpMutationHeaders(current),
    })
    expect(validateWebMcpSettingsMutationContext(draftRequest, current, {
      startsAt: "2026-09-10T16:00:00.000Z",
    })).toBeNull()

    const judging = { ...current, status: "judging" }
    const judgingRequest = new Request("https://hackathon.new/api/example", {
      headers: createWebMcpMutationHeaders(judging),
    })
    expect(validateWebMcpSettingsMutationContext(judgingRequest, judging, {
      name: "Details can still change",
    })).toBeNull()
    expect(validateWebMcpSettingsMutationContext(judgingRequest, judging, {
      endsAt: "2026-09-11T16:00:00.000Z",
    })).toMatchObject({ status: 409, code: "event_changed" })
  })
})
