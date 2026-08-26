import { afterEach, describe, expect, it, mock } from "bun:test"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
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

  it("aborts the whole registration batch and reports an active failure", async () => {
    const error = new Error("registration failed")
    const signals: AbortSignal[] = []
    const originalConsoleError = console.error
    const consoleError = mock(() => {})
    console.error = consoleError
    document.modelContext = {
      registerTool: mock(async (_tool, options) => {
        if (options?.signal) signals.push(options.signal)
        throw error
      }),
    }

    try {
      renderHook(() => useWebMcpTools([firstTool]))

      await waitFor(() => expect(consoleError).toHaveBeenCalledTimes(1))
      expect(signals).toHaveLength(1)
      expect(signals[0].aborted).toBe(true)
      expect(consoleError).toHaveBeenCalledWith(
        "Failed to register WebMCP tools",
        error,
      )
    } finally {
      console.error = originalConsoleError
    }
  })

  it("does not report a late registration failure after unmount", async () => {
    let rejectRegistration: ((error: Error) => void) | undefined
    const signals: AbortSignal[] = []
    const originalConsoleError = console.error
    const consoleError = mock(() => {})
    console.error = consoleError
    document.modelContext = {
      registerTool: mock((_tool, options) => {
        if (options?.signal) signals.push(options.signal)
        return new Promise<void>((_resolve, reject) => {
          rejectRegistration = reject
        })
      }),
    }

    try {
      const { unmount } = renderHook(() => useWebMcpTools([firstTool]))
      await waitFor(() => expect(signals).toHaveLength(1))

      unmount()
      await act(async () => {
        rejectRegistration?.(new Error("late failure"))
        await Promise.resolve()
      })

      expect(signals[0].aborted).toBe(true)
      expect(consoleError).not.toHaveBeenCalled()
    } finally {
      console.error = originalConsoleError
    }
  })
})
