import { afterEach, describe, expect, it, mock } from "bun:test"
import { cleanup, renderHook, waitFor } from "@testing-library/react"
import {
  registerWebMcpTools,
  useWebMcpTools,
  type WebMcpTool,
} from "@/hooks/use-webmcp-tools"

const firstTool: WebMcpTool = {
  name: "first_tool",
  description: "Read the first value.",
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true },
  execute: async () => ({ value: 1 }),
}

const secondTool: WebMcpTool = {
  ...firstTool,
  name: "second_tool",
  execute: async () => ({ value: 2 }),
}

afterEach(() => {
  cleanup()
  delete document.modelContext
})

describe("registerWebMcpTools", () => {
  it("does nothing when the browser does not support WebMCP", async () => {
    const controller = new AbortController()
    expect(await registerWebMcpTools([firstTool], controller.signal)).toBe(
      false,
    )
  })

  it("registers every tool with the same cleanup signal", async () => {
    const registerTool = mock(
      async (
        _tool: WebMcpTool,
        _options?: { exposedTo?: string[]; signal?: AbortSignal },
      ) => {},
    )
    document.modelContext = { registerTool }
    const controller = new AbortController()

    expect(
      await registerWebMcpTools(
        [firstTool, secondTool],
        controller.signal,
      ),
    ).toBe(true)
    expect(registerTool).toHaveBeenCalledTimes(2)
    expect(registerTool.mock.calls[0][0]).toBe(firstTool)
    expect(registerTool.mock.calls[1][0]).toBe(secondTool)
    expect(registerTool.mock.calls[0][1]?.signal).toBe(controller.signal)
    expect(registerTool.mock.calls[1][1]?.signal).toBe(controller.signal)
  })
})

describe("useWebMcpTools", () => {
  it("unregisters its tools when the component unmounts", async () => {
    const signals: AbortSignal[] = []
    document.modelContext = {
      registerTool: mock(async (_tool, options) => {
        if (options?.signal) signals.push(options.signal)
      }),
    }

    const { unmount } = renderHook(() => useWebMcpTools([firstTool]))
    await waitFor(() => expect(signals).toHaveLength(1))
    expect(signals[0].aborted).toBe(false)

    unmount()
    expect(signals[0].aborted).toBe(true)
  })

  it("replaces registrations when the tool list changes", async () => {
    const calls: { name: string; signal: AbortSignal }[] = []
    document.modelContext = {
      registerTool: mock(async (tool, options) => {
        if (options?.signal) calls.push({ name: tool.name, signal: options.signal })
      }),
    }

    const { rerender } = renderHook(
      ({ tools }: { tools: WebMcpTool[] }) => useWebMcpTools(tools),
      { initialProps: { tools: [firstTool] } },
    )
    await waitFor(() => expect(calls).toHaveLength(1))

    rerender({ tools: [secondTool] })
    await waitFor(() => expect(calls).toHaveLength(2))
    expect(calls[0].signal.aborted).toBe(true)
    expect(calls[1]).toMatchObject({ name: "second_tool" })
    expect(calls[1].signal.aborted).toBe(false)
  })
})
