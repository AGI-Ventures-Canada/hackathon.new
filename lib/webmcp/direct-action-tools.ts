import { z } from "zod"
import { fetchWebMcpJson, WebMcpRequestError, type WebMcpFetcher } from "@/lib/webmcp/fetch"
import { defineWebMcpTool } from "@/lib/webmcp/tool"

type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
type Operation = {
  summary?: string
  description?: string
  parameters?: Json[]
  requestBody?: { content?: Record<string, { schema?: Json }> }
}
export type ActionDocument = {
  paths: Record<string, Record<string, Operation>>
  components?: { schemas?: Record<string, Json> }
}
type Action = { ref: string; path: string; method: string; operation: Operation }

export const DIRECT_ACTION_TOOL_NAMES = [
  "list_event_actions", "get_event_action", "execute_event_action", "read_action_result",
]

const allowedPaths = [
  /^\/api\/dashboard\/hackathons(?:\/|$)/,
  /^\/api\/dashboard\/teams(?:\/|$)/,
  /^\/api\/dashboard\/import\/(?:event|url)$/,
  /^\/api\/dashboard\/(?:org-profile|organizations\/search)$/,
  /^\/api\/public\/(?:hackathons|invitations|judge-invitations|prize-claims)(?:\/|$)/,
]
const methods = new Set(["get", "post", "patch", "put", "delete"])

export function getDirectActions(document: ActionDocument): Action[] {
  return Object.entries(document.paths).sort(([a], [b]) => a.localeCompare(b))
    .filter(([path]) => allowedPaths.some((pattern) => pattern.test(path))
      && !path.includes("..") && !path.includes("%") && !path.includes("\\"))
    .flatMap(([path, operations]) => Object.entries(operations)
      .filter(([method]) => methods.has(method))
      .map(([method, operation]) => ({ path, method: method.toUpperCase(), operation })))
    .map((action, index) => ({ ...action, ref: `action-${index + 1}` }))
}

function fail(code: string, message: string): never {
  throw new WebMcpRequestError({ code, message, retryable: false })
}

function record(value: Json): value is { [key: string]: Json } {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function parseObject(text: string): { [key: string]: Json } {
  let value: Json
  try { value = JSON.parse(text) as Json } catch { return fail("invalid_input", "Use a JSON object.") }
  if (!record(value)) return fail("invalid_input", "Use a JSON object.")
  return value
}

function textPage(text: string, offset: number) {
  let end = Math.min(text.length, offset + 800)
  while (JSON.stringify(text.slice(offset, end)).length > 950) end--
  return { text: text.slice(offset, end), nextOffset: end < text.length ? end : null, total: text.length }
}

function resolveSchema(value: Json, document: ActionDocument, depth = 0): Json {
  if (depth > 20) return { description: "Nested schema; validated by the API." }
  if (Array.isArray(value)) return value.map((item) => resolveSchema(item, document, depth + 1))
  if (!record(value)) return value
  if (typeof value.$ref === "string") {
    const name = value.$ref.replace(/^#\/components\/schemas\//, "")
    const resolved = document.components?.schemas?.[name]
    return resolved ? resolveSchema(resolved, document, depth + 1) : value
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveSchema(item, document, depth + 1)]))
}

export function createDirectActionTools(dependencies: {
  fetcher: WebMcpFetcher
  onSaved: () => void
  isCurrent?: () => boolean
  organizationId?: string | null
}) {
  const { fetcher } = dependencies
  let catalog: Promise<{ document: ActionDocument; actions: Action[] }> | undefined
  const refs = new Map<string, string>()
  const reverseRefs = new Map<string, string>()
  const results = new Map<string, string>()
  const requests = new Map<string, { fingerprint: string; result: Promise<ReturnType<typeof saveResult>> }>()
  let nextResult = 1

  const checkSession = () => {
    if (dependencies.isCurrent?.() === false) fail("session_changed", "Your account or organization changed. Discover the actions again.")
  }

  const load = () => {
    checkSession()
    catalog ??= fetchWebMcpJson<ActionDocument>(fetcher, "/api/swagger/json", {
      credentials: "same-origin", redirect: "error",
    }).then((document) => ({ document, actions: getDirectActions(document) })).catch((error) => {
      catalog = undefined
      throw error
    })
    return catalog
  }
  const find = async (ref: string) => {
    const { document, actions } = await load()
    checkSession()
    const action = actions.find((item) => item.ref === ref)
    if (!action) return fail("unknown_action", "List event actions to get a current action reference.")
    return { document, action }
  }
  const encode = (value: Json): Json => {
    if (typeof value === "string" && (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value) || /^(user|org)_[A-Za-z0-9]+$/.test(value))) {
      let ref = reverseRefs.get(value)
      if (!ref) {
        ref = `ref_${refs.size + 1}`
        refs.set(ref, value)
        reverseRefs.set(value, ref)
      }
      return ref
    }
    if (Array.isArray(value)) return value.map(encode)
    if (record(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)]))
    return value
  }
  const decode = (value: Json): Json => {
    if (typeof value === "string" && /^ref_\d+$/.test(value)) {
      return refs.get(value) ?? fail("unknown_reference", "Read the event data again to get a current reference.")
    }
    if (Array.isArray(value)) return value.map(decode)
    if (record(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decode(item)]))
    return value
  }
  function saveResult(value: Json, httpStatus: number) {
    const resultRef = `result-${nextResult++}`
    const text = JSON.stringify(encode(value))
    results.set(resultRef, text)
    if (results.size > 100) results.delete(results.keys().next().value!)
    return { httpStatus, resultRef, ...textPage(text, 0) }
  }
  const offset = z.number().int().min(0).max(10_000_000).default(0)
  const actionRef = z.string().regex(/^action-\d+$/).max(30)
  return [
    defineWebMcpTool({
      name: "list_event_actions",
      description: "Find event actions by words such as publish results, invite, register, submit, score, mentor, or fulfillment. Every listed action can run through execute_event_action without a GUI confirmation. API permissions still apply.",
      schema: z.object({ search: z.string().max(120).default(""), writesOnly: z.boolean().default(false), offset }).strict(),
      annotations: { readOnlyHint: true },
      execute: async ({ search, writesOnly, offset }) => {
        const { actions } = await load()
        const words = search.toLowerCase().split(/\s+/).filter(Boolean)
        const matches = actions.filter((action) => (!writesOnly || action.method !== "GET") && words.every((word) =>
          `${action.operation.summary} ${action.path} ${action.method}`.toLowerCase().includes(word)))
        const items = matches.slice(offset, offset + 3).map((action) => ({
          actionRef: action.ref, title: (action.operation.summary ?? action.path).slice(0, 100), method: action.method, path: action.path,
        }))
        return { total: matches.length, items, nextOffset: offset + items.length < matches.length ? offset + items.length : null }
      },
    }),
    defineWebMcpTool({
      name: "get_event_action",
      description: "Read an action's path/query parameters and body schema as paged JSON. Follow nextOffset until null. Use returned ref_N values from API reads in place of IDs. File uploads use upload descriptors in execute_event_action.",
      schema: z.object({ actionRef, offset }).strict(),
      annotations: { readOnlyHint: true },
      execute: async ({ actionRef, offset }) => {
        const { document, action } = await find(actionRef)
        const content = action.operation.requestBody?.content
        return textPage(JSON.stringify({
          method: action.method, path: action.path, description: action.operation.description,
          automaticInputs: dependencies.organizationId ? ["expectedOrganizationId"] : [],
          parameters: resolveSchema(action.operation.parameters ?? [], document),
          body: resolveSchema(content?.["application/json"]?.schema ?? content?.["multipart/form-data"]?.schema ?? null, document),
        }), offset)
      },
    }),
    defineWebMcpTool({
      name: "execute_event_action",
      description: "Execute an API action now without GUI confirmation. Supply JSON objects for path, query, and body from get_event_action. Writes require a unique requestKey; reuse it only for the identical request. A network error may mean the write happened: read state before starting a new request.",
      annotations: { untrustedContentHint: true },
      schema: z.object({
        actionRef,
        path: z.string().max(8000).default("{}"),
        query: z.string().max(8000).default("{}"),
        body: z.string().max(200_000).optional(),
        requestKey: z.string().min(8).max(80).optional(),
        uploads: z.array(z.object({ field: z.string().min(1).max(80), name: z.string().min(1).max(200), type: z.string().max(100), base64: z.string().max(14_000_000) }).strict()).max(4).optional(),
      }).strict(),
      execute: async (input, { signal }) => {
        const { action, document } = await find(input.actionRef)
        const writing = action.method !== "GET"
        if (writing && !input.requestKey) return fail("request_key_required", "Provide a unique requestKey for this change.")
        const fingerprint = JSON.stringify(input)
        if (writing && input.requestKey) {
          const previous = requests.get(input.requestKey)
          if (previous) {
            if (previous.fingerprint !== fingerprint) return fail("request_key_reused", "This requestKey belongs to a different action or input.")
            return previous.result
          }
          if (requests.size >= 100) return fail("session_limit", "This session has reached 100 writes. Reload before starting another change.")
        }
        const path = decode(parseObject(input.path)) as Record<string, Json>
        const query = decode(parseObject(input.query)) as Record<string, Json>
        if (dependencies.organizationId && action.operation.parameters?.some((parameter) => record(parameter)
          && parameter.in === "query" && parameter.name === "expectedOrganizationId") && query.expectedOrganizationId === undefined) {
          query.expectedOrganizationId = dependencies.organizationId
        }
        const expected = [...action.path.matchAll(/\{([^}]+)\}/g)].map((match) => match[1])
        if (Object.keys(path).some((key) => !expected.includes(key))) return fail("invalid_path", "Use only the path fields in the action schema.")
        const url = action.path.replace(/\{([^}]+)\}/g, (_, key: string) => {
          const value = path[key]
          if (typeof value !== "string" || !value || /[\/\\%?#]/.test(value) || value === "." || value === "..") {
            return fail("invalid_path", `Provide a valid ${key} path value.`)
          }
          return encodeURIComponent(value)
        })
        const search = new URLSearchParams()
        for (const [key, value] of Object.entries(query)) {
          if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") return fail("invalid_query", "Query values must be strings, numbers, or booleans.")
          search.set(key, String(value))
        }
        let body = input.body === undefined ? undefined : decode(parseObject(input.body))
        const content = action.operation.requestBody?.content
        const bodySchema = resolveSchema(content?.["application/json"]?.schema ?? content?.["multipart/form-data"]?.schema ?? null, document)
        if (writing && dependencies.organizationId && record(bodySchema) && record(bodySchema.properties)
          && Object.hasOwn(bodySchema.properties, "expectedOrganizationId")) {
          body ??= {}
          if (record(body) && body.expectedOrganizationId === undefined) body.expectedOrganizationId = dependencies.organizationId
        }
        let payload: BodyInit | undefined = body === undefined ? undefined : JSON.stringify(body)
        const headers: Record<string, string> = {}
        if (payload !== undefined) headers["Content-Type"] = "application/json"
        if (input.uploads?.length) {
          if (!action.operation.requestBody?.content?.["multipart/form-data"]) return fail("invalid_upload", "This action does not accept file uploads.")
          const form = new FormData()
          for (const [key, value] of Object.entries(body ?? {})) form.set(key, typeof value === "string" ? value : JSON.stringify(value))
          for (const upload of input.uploads) {
            let bytes: Uint8Array<ArrayBuffer>
            try { bytes = Uint8Array.from(atob(upload.base64), (char) => char.charCodeAt(0)) } catch { return fail("invalid_upload", "Use valid base64 file contents.") }
            form.append(upload.field, new Blob([bytes], { type: upload.type }), upload.name)
          }
          payload = form
          delete headers["Content-Type"]
        }
        if (!writing && payload !== undefined) return fail("invalid_body", "Read actions do not accept a request body.")
        const run = async () => {
          checkSession()
          let response: Response
          try {
            response = await fetcher(`${url}${search.size ? `?${search}` : ""}`, {
              method: action.method, credentials: "same-origin", redirect: "error", headers, body: payload,
              ...(writing ? {} : { signal }),
            })
          } catch {
            return fail(writing ? "outcome_unknown" : "request_failed", writing
              ? "The connection ended before the result arrived. Read current state before starting a new request."
              : "The request could not be completed.")
          }
          let raw: string
          try { raw = await response.text() } catch {
            return fail("outcome_unknown", "The response was interrupted. Read current state before starting a new request.")
          }
          let result: Json = raw
          try { result = raw ? JSON.parse(raw) as Json : null } catch { result = raw }
          if (!response.ok) {
            const error = record(result) ? result.error : null
            throw new WebMcpRequestError({
              code: response.status === 401 ? "unauthenticated" : response.status === 403 ? "not_authorized" : "api_rejected",
              message: typeof error === "string" ? error.slice(0, 240) : `The API rejected this request (${response.status}).`, retryable: false,
            })
          }
          const saved = saveResult(result, response.status)
          checkSession()
          if (writing) {
            try { dependencies.onSaved() } catch { return saved }
          }
          return saved
        }
        const pending = run()
        if (writing && input.requestKey) requests.set(input.requestKey, { fingerprint, result: pending })
        return pending
      },
    }),
    defineWebMcpTool({
      name: "read_action_result",
      description: "Read another page of a previous API response without executing it again. Results contain only data the API authorized for this session. Follow nextOffset until null.",
      schema: z.object({ resultRef: z.string().max(30), offset }).strict(),
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: ({ resultRef, offset }) => {
        checkSession()
        const text = results.get(resultRef)
        if (text === undefined) return fail("result_expired", "This result expired. Read current state again; do not repeat a write just to read its result.")
        return textPage(text, offset)
      },
    }),
  ]
}
