import { describe, expect, it, mock } from "bun:test"
import { createDirectActionTools, getDirectActions, type ActionDocument } from "@/lib/webmcp/direct-action-tools"

const eventId = "11111111-1111-4111-8111-111111111111"
const operation = { summary: "Publish results", parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }] }
const document: ActionDocument = { paths: {
  "/api/dashboard/hackathons": { get: { summary: "List hackathons" }, post: { summary: "Create hackathon" } },
  "/api/dashboard/hackathons/{id}/results/publish": { post: operation },
  "/api/dashboard/hackathons/{id}/settings": { patch: { summary: "Update event status", requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/Settings" } } } } } },
  "/api/dashboard/hackathons/{id}/banner": { post: { summary: "Upload banner", requestBody: { content: { "multipart/form-data": { schema: { type: "object" } } } } } },
  "/api/dashboard/teams/{teamId}/invitations": { post: { summary: "Send team invitation" } },
  "/api/public/hackathons/{slug}/mentor-request/{requestId}/claim": { post: { summary: "Claim mentor request" } },
  "/api/public/hackathons/{slug}/submissions": { post: { summary: "Create project" } },
  "/api/public/hackathons/{slug}/judging/picks": { post: { summary: "Save picks" } },
  "/api/dashboard/hackathons/{id}/sponsor-fulfillments/{fulfillmentId}": { patch: { summary: "Complete sponsor delivery" } },
  "/api/dashboard/credentials": { get: { summary: "Secrets" }, post: {} },
  "/api/dashboard/keys": { post: {} },
  "/api/admin/hackathons/{id}": { delete: {} },
  "/api/dev/hackathons/{id}/seed-data": { delete: {} },
  "/api/dashboard/hackathons/../credentials": { get: {} },
  "https://attacker.example/api/dashboard/hackathons": { post: {} },
}, components: { schemas: { Settings: { type: "object", properties: { status: { enum: ["draft", "active"] } } } } } }

function setup(handler: (url: string, init?: RequestInit) => Promise<Response> = async () => Response.json({ saved: true })) {
  const fetcher = mock(async (url: RequestInfo | URL, init?: RequestInit) => String(url) === "/api/swagger/json" ? Response.json(document) : handler(String(url), init))
  const onSaved = mock(() => {})
  const tools = createDirectActionTools({ fetcher, onSaved })
  const execute = async (name: string, input: Record<string, unknown> = {}) => {
    const tool = tools.find((item) => item.name === name)!
    return await tool.execute(input) as { ok: boolean; data: { httpStatus: number; resultRef: string; text: string; nextOffset: number | null; total: number; items: { actionRef: string }[] }; error: { code: string; retryable: boolean } }
  }
  const ref = (path: string, method: string) => getDirectActions(document).find((item) => item.path === path && item.method === method)!.ref
  return { fetcher, onSaved, execute, ref }
}

describe("direct WebMCP actions", () => {
  it("calls the browser fetch function without binding a foreign receiver", async () => {
    const fetcher = function(this: unknown, url: RequestInfo | URL) {
      expect(this).toBeUndefined()
      return Promise.resolve(Response.json(String(url) === "/api/swagger/json" ? document : { saved: true }))
    }
    const tools = createDirectActionTools({ fetcher, onSaved: () => {} })
    const action = getDirectActions(document).find((item) => item.path === "/api/dashboard/hackathons" && item.method === "POST")!
    const result = await tools.find((tool) => tool.name === "execute_event_action")!.execute({ actionRef: action.ref, requestKey: "browser-binding-test" })
    expect(result).toMatchObject({ ok: true })
  })

  it("covers event actions without exposing admin, development, credentials, or arbitrary URLs", () => {
    const actions = getDirectActions(document)
    expect(actions).toHaveLength(10)
    expect(actions.some((a) => /credentials|\/keys|\/admin|\/dev|https:/.test(a.path))).toBe(false)
    for (const title of ["Publish results", "Send team invitation", "Claim mentor request", "Create project", "Save picks", "Complete sponsor delivery"]) {
      expect(actions.some((a) => a.operation.summary === title)).toBe(true)
    }
  })

  it("discovers actions and resolves the actual body schema", async () => {
    const s = setup()
    const listed = await s.execute("list_event_actions", { search: "publish results", writesOnly: true })
    expect(listed.data.items).toHaveLength(1)
    const details = await s.execute("get_event_action", { actionRef: s.ref("/api/dashboard/hackathons/{id}/settings", "PATCH") })
    expect(details.data.text).toContain('"enum":["draft","active"]')
    expect(s.fetcher).toHaveBeenCalledTimes(1)
  })

  it("reads opaque references then publishes directly, without a GUI callback", async () => {
    const calls: string[] = []
    const s = setup(async (url, init) => {
      calls.push(`${init?.method} ${url}`)
      return Response.json(init?.method === "GET" ? { hackathons: [{ id: eventId, name: "Synthetic event" }] } : { published: true })
    })
    const read = await s.execute("execute_event_action", { actionRef: s.ref("/api/dashboard/hackathons", "GET") })
    expect(read.data.text).toContain('"id":"ref_1"')
    expect(read.data.text).not.toContain(eventId)
    const published = await s.execute("execute_event_action", {
      actionRef: s.ref("/api/dashboard/hackathons/{id}/results/publish", "POST"), path: '{"id":"ref_1"}', requestKey: "publish-unique",
    })
    expect(published.ok).toBe(true)
    expect(published.data.text).toBe('{"published":true}')
    expect(calls[1]).toBe(`POST /api/dashboard/hackathons/${eventId}/results/publish`)
    expect(s.onSaved).toHaveBeenCalledTimes(1)
  })

  it("deduplicates concurrent identical writes and rejects reused keys with different inputs", async () => {
    let finish: ((response: Response) => void) | undefined
    const s = setup(() => new Promise((resolve) => { finish = resolve }))
    const input = { actionRef: s.ref("/api/dashboard/hackathons", "POST"), body: '{"name":"Synthetic"}', requestKey: "create-unique" }
    const first = s.execute("execute_event_action", input)
    const second = s.execute("execute_event_action", input)
    await new Promise((resolve) => setTimeout(resolve, 10))
    finish!(Response.json({ id: eventId }))
    expect(await second).toEqual(await first)
    expect(s.fetcher).toHaveBeenCalledTimes(2)
    const conflict = await s.execute("execute_event_action", { ...input, body: '{"name":"Different"}' })
    expect(conflict.error.code).toBe("request_key_reused")
  })

  it("preserves queued delivery and handles successful empty deletes", async () => {
    const s = setup(async () => Response.json({ queued: true, delivery: "queued" }))
    const result = await s.execute("execute_event_action", { actionRef: s.ref("/api/dashboard/teams/{teamId}/invitations", "POST"), path: JSON.stringify({ teamId: eventId }), body: '{"email":"fake@example.com"}', requestKey: "invite-queued" })
    expect(result.data.text).toBe('{"queued":true,"delivery":"queued"}')
    const empty = setup(async () => new Response(null, { status: 204 }))
    const saved = await empty.execute("execute_event_action", { actionRef: empty.ref("/api/dashboard/hackathons", "POST"), requestKey: "empty-write" })
    expect(saved.data.httpStatus).toBe(204)
    expect(saved.data.text).toBe("null")
  })

  it("does not retry a write after an uncertain network failure", async () => {
    const s = setup(async () => { throw new Error("connection lost") })
    const input = { actionRef: s.ref("/api/dashboard/hackathons", "POST"), requestKey: "uncertain-write" }
    const first = await s.execute("execute_event_action", input)
    expect(first.error).toMatchObject({ code: "outcome_unknown", retryable: false })
    expect(await s.execute("execute_event_action", input)).toEqual(first)
    expect(s.fetcher).toHaveBeenCalledTimes(2)
  })

  it.each([401, 403, 409, 422])("preserves server rejection %i without claiming success", async (status) => {
    const s = setup(async () => Response.json({ error: "Not allowed at this event stage" }, { status }))
    const response = await s.execute("execute_event_action", { actionRef: s.ref("/api/dashboard/hackathons", "POST"), requestKey: `reject-${status}` })
    expect(response.ok).toBe(false)
    expect(s.onSaved).not.toHaveBeenCalled()
  })

  it.each(["../credentials", "%2e%2e", "..", "x/y", "x?y", "x\\y"])("rejects path traversal %s before sending a request", async (id) => {
    const s = setup()
    const result = await s.execute("execute_event_action", { actionRef: s.ref("/api/dashboard/hackathons/{id}/results/publish", "POST"), path: JSON.stringify({ id }), requestKey: "invalid-path" })
    expect(result.error.code).toBe("invalid_path")
    expect(s.fetcher).toHaveBeenCalledTimes(1)
  })

  it("requires a write identity and rejects malformed JSON, stale refs, and unknown actions", async () => {
    const s = setup()
    const base = { actionRef: s.ref("/api/dashboard/hackathons/{id}/results/publish", "POST"), requestKey: "invalid-input" }
    expect((await s.execute("execute_event_action", { actionRef: base.actionRef })).error.code).toBe("request_key_required")
    expect((await s.execute("execute_event_action", { ...base, path: "[]" })).error.code).toBe("invalid_input")
    expect((await s.execute("execute_event_action", { ...base, path: '{"id":"ref_999"}' })).error.code).toBe("unknown_reference")
    expect((await s.execute("execute_event_action", { actionRef: "action-999" })).error.code).toBe("unknown_action")
  })

  it("paginates large responses without executing a write again", async () => {
    const value = { text: 'Long "escaped" message\n'.repeat(500) }
    const s = setup(async () => Response.json(value))
    const first = await s.execute("execute_event_action", { actionRef: s.ref("/api/dashboard/hackathons", "POST"), requestKey: "large-result" })
    let text = first.data.text
    let next = first.data.nextOffset
    while (next !== null) {
      const page = await s.execute("read_action_result", { resultRef: first.data.resultRef, offset: next })
      expect(JSON.stringify(page).length).toBeLessThanOrEqual(1500)
      text += page.data.text
      next = page.data.nextOffset
    }
    expect(JSON.parse(text)).toEqual(value)
    expect(s.fetcher).toHaveBeenCalledTimes(2)
  })

  it("uploads bytes directly with same-origin credentials and no custom redirect", async () => {
    const s = setup(async (_url, init) => {
      expect(init?.credentials).toBe("same-origin")
      expect(init?.redirect).toBe("error")
      expect(init?.body).toBeInstanceOf(FormData)
      const file = (init!.body as FormData).get("file") as File
      expect(await file.text()).toBe("fake image")
      return Response.json({ uploaded: true })
    })
    const result = await s.execute("execute_event_action", {
      actionRef: s.ref("/api/dashboard/hackathons/{id}/banner", "POST"), path: JSON.stringify({ id: eventId }), requestKey: "upload-unique",
      uploads: [{ field: "file", name: "test.png", type: "image/png", base64: btoa("fake image") }],
    })
    expect(result.ok).toBe(true)
  })
})
