import { getDirectActions } from "@/lib/webmcp/direct-action-tools"
import React from "react"
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { cleanup, render, waitFor } from "@testing-library/react"
import { DirectWebMcpTools } from "@/components/direct-webmcp-tools"
import type { WebMcpTool } from "@/lib/webmcp/types"
import { clerkState } from "../lib/clerk-mock"

const originalFetch = globalThis.fetch
const tools = new Map<string, WebMcpTool>()
const signals: AbortSignal[] = []
const actionRef = getDirectActions({ paths: { "/api/dashboard/hackathons": { post: {} } } })[0].ref

beforeEach(() => {
  tools.clear()
  signals.length = 0
  clerkState.isLoaded = true
  clerkState.isSignedIn = true
  clerkState.userId = "user-123"
  clerkState.orgId = "org-one"
  document.modelContext = {
    registerTool: mock(async (tool, options) => {
      tools.set(tool.name, tool)
      if (options?.signal) signals.push(options.signal)
      options?.signal?.addEventListener("abort", () => tools.delete(tool.name), { once: true })
    }),
  }
  globalThis.fetch = mock(async (url: RequestInfo | URL) => Response.json(String(url) === "/api/swagger/json"
    ? { paths: { "/api/dashboard/hackathons": { post: { summary: "Create hackathon" } } } }
    : { id: "11111111-1111-4111-8111-111111111111" })) as typeof fetch
})

afterEach(() => {
  cleanup()
  delete document.modelContext
  globalThis.fetch = originalFetch
})

describe("DirectWebMcpTools", () => {
  it("executes directly without rendering a confirmation dialog and stays registered across refreshes", async () => {
    const { rerender, container } = render(<DirectWebMcpTools />)
    await waitFor(() => expect(tools.size).toBe(4))
    const execute = tools.get("execute_event_action")!
    const result = await execute.execute({ actionRef, body: '{"name":"Synthetic event"}', requestKey: "create-test-event" })
    expect(result).toMatchObject({ ok: true, data: { httpStatus: 200 } })
    expect(container.innerHTML).toBe("")
    rerender(<DirectWebMcpTools />)
    expect(tools.get("execute_event_action")).toBe(execute)
    expect(signals.every((signal) => !signal.aborted)).toBe(true)
  })

  it("invalidates old actions and results when the organization changes or user signs out", async () => {
    const { rerender } = render(<DirectWebMcpTools />)
    await waitFor(() => expect(tools.size).toBe(4))
    const old = tools.get("execute_event_action")!
    const reader = tools.get("read_action_result")!
    await old.execute({ actionRef, requestKey: "create-old-org" })
    clerkState.orgId = "org-two"
    rerender(<DirectWebMcpTools />)
    expect(await old.execute({ actionRef, requestKey: "create-old-again" })).toMatchObject({ ok: false, error: { code: "session_changed" } })
    expect(await reader.execute({ resultRef: "result-1" })).toMatchObject({ ok: false, error: { code: "session_changed" } })
    clerkState.isSignedIn = false
    rerender(<DirectWebMcpTools />)
    await waitFor(() => expect(tools.size).toBe(0))
  })
})
