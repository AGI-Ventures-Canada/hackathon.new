import { describe, expect, it } from "bun:test"
import { z } from "zod"
import { WebMcpRequestError } from "@/lib/webmcp/fetch"
import {
  defineWebMcpTool,
  MAX_WEBMCP_OUTPUT_CHARACTERS,
} from "@/lib/webmcp/tool"

describe("defineWebMcpTool", () => {
  it("derives JSON Schema and wraps successful results", async () => {
    const tool = defineWebMcpTool({
      name: "read_value",
      description: "Read a value.",
      schema: z.object({ value: z.string().min(1).max(20) }).strict(),
      execute: ({ value }) => ({ value }),
    })

    expect(tool.inputSchema).toMatchObject({
      type: "object",
      properties: { value: { type: "string", minLength: 1, maxLength: 20 } },
      required: ["value"],
      additionalProperties: false,
    })
    expect(tool.inputSchema).not.toHaveProperty("~standard")
    expect(
      await tool.execute(
        { value: "hello" },
        { signal: new AbortController().signal },
      ),
    ).toEqual({ ok: true, data: { value: "hello" } })
  })

  it("returns validation, request, and cancellation errors", async () => {
    const requestTool = defineWebMcpTool({
      name: "save_value",
      description: "Save a value.",
      schema: z.object({ value: z.string().min(1) }).strict(),
      execute: () => {
        throw new WebMcpRequestError({
          code: "event_changed",
          message: "Refresh and try again.",
          retryable: true,
        })
      },
    })
    const activeSignal = new AbortController().signal
    expect(await requestTool.execute({}, { signal: activeSignal })).toMatchObject(
      { ok: false, error: { code: "invalid_input", retryable: false } },
    )
    expect(
      await requestTool.execute({ value: "hello" }, { signal: activeSignal }),
    ).toEqual({
      ok: false,
      error: {
        code: "event_changed",
        message: "Refresh and try again.",
        retryable: true,
      },
    })

    const controller = new AbortController()
    controller.abort()
    expect(
      await requestTool.execute({ value: "hello" }, { signal: controller.signal }),
    ).toMatchObject({
      ok: false,
      error: { code: "cancelled", retryable: true },
    })
  })

  it("marks human review without executing a final action", async () => {
    const tool = defineWebMcpTool({
      name: "open_review",
      description: "Open a review.",
      schema: z.object({}).strict(),
      execute: () => ({
        data: { opened: true },
        requiresHumanAction: true,
      }),
    })
    expect(
      await tool.execute({}, { signal: new AbortController().signal }),
    ).toEqual({
      ok: true,
      data: { opened: true },
      requiresHumanAction: true,
    })
  })

  it("rejects serialized outputs over Chrome's character budget", async () => {
    const tool = defineWebMcpTool({
      name: "read_large_value",
      description: "Read a bounded value.",
      schema: z.object({}).strict(),
      execute: () => ({ value: "x".repeat(MAX_WEBMCP_OUTPUT_CHARACTERS) }),
    })

    const result = await tool.execute(
      {},
      { signal: new AbortController().signal },
    )
    expect(result).toEqual({
      ok: false,
      error: {
        code: "output_too_large",
        message: "The result is too large. Narrow the request and try again.",
        retryable: false,
      },
    })
    expect(JSON.stringify(result).length).toBeLessThanOrEqual(
      MAX_WEBMCP_OUTPUT_CHARACTERS,
    )

    const errorTool = defineWebMcpTool({
      name: "read_large_error",
      description: "Read a bounded error.",
      schema: z.object({}).strict(),
      execute: () => {
        throw new WebMcpRequestError({
          code: "request_failed",
          message: "x".repeat(MAX_WEBMCP_OUTPUT_CHARACTERS),
          retryable: false,
        })
      },
    })
    const errorResult = await errorTool.execute(
      {},
      { signal: new AbortController().signal },
    )
    expect(JSON.stringify(errorResult).length).toBeLessThanOrEqual(
      MAX_WEBMCP_OUTPUT_CHARACTERS,
    )
  })

  it("rejects parameter names and descriptions over Chrome's budgets", () => {
    const longName = "parameter_name_over_thirty_chars"
    expect(() =>
      defineWebMcpTool({
        name: "read_named_value",
        description: "Read a named value.",
        schema: z.object({ [longName]: z.string() }).strict(),
        execute: () => ({ value: true }),
      }),
    ).toThrow(`WebMCP parameter name is too long: ${longName}`)

    expect(() =>
      defineWebMcpTool({
        name: "read_described_value",
        description: "Read a described value.",
        schema: z.object({
          value: z.string().describe("x".repeat(151)),
        }).strict(),
        execute: () => ({ value: true }),
      }),
    ).toThrow("WebMCP parameter description is too long: value")
  })

  it("rejects invalid descriptors before anything can register", () => {
    for (const name of ["Uppercase", "1_starts_wrong", "has-dash", `a${"b".repeat(30)}`]) {
      expect(() =>
        defineWebMcpTool({
          name,
          description: "Read a value.",
          schema: z.object({}).strict(),
          execute: () => ({ value: true }),
        }),
      ).toThrow(`Invalid WebMCP tool name: ${name}`)
    }

    expect(() =>
      defineWebMcpTool({
        name: "read_value",
        description: "d".repeat(501),
        schema: z.object({}).strict(),
        execute: () => ({ value: true }),
      }),
    ).toThrow("WebMCP tool description is too long: read_value")
  })

  it("checks parameter budgets recursively across arrays and nested objects", () => {
    const nestedName = "nested_parameter_name_over_limit"
    expect(() =>
      defineWebMcpTool({
        name: "read_nested",
        description: "Read nested values.",
        schema: z.object({
          groups: z.array(z.object({ [nestedName]: z.string() })),
        }).strict(),
        execute: () => ({ value: true }),
      }),
    ).toThrow(`WebMCP parameter name is too long: ${nestedName}`)

    const tool = defineWebMcpTool({
      name: "read_union",
      description: "Read a union value.",
      schema: z.union([z.string(), z.number()]),
      execute: (value) => ({ value }),
    })
    expect(tool.inputSchema).toHaveProperty("anyOf")
  })

  it("turns cyclic and unexpected handler outputs into bounded structured errors", async () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    const cyclicTool = defineWebMcpTool({
      name: "read_cyclic",
      description: "Read a cyclic value.",
      schema: z.object({}).strict(),
      execute: () => cyclic,
    })
    expect(await cyclicTool.execute({}, { signal: new AbortController().signal })).toEqual({
      ok: false,
      error: {
        code: "invalid_output",
        message: "The tool returned an invalid result.",
        retryable: false,
      },
    })

    const unexpectedTool = defineWebMcpTool({
      name: "read_failure",
      description: "Read a failing value.",
      schema: z.object({}).strict(),
      execute: () => {
        throw new Error("private implementation detail")
      },
    })
    expect(await unexpectedTool.execute({}, { signal: new AbortController().signal }))
      .toEqual({
        ok: false,
        error: {
          code: "unexpected_error",
          message: "Something went wrong. Please try again.",
          retryable: true,
        },
      })
  })

  it("normalizes abort exceptions and omits an unspecified human-action marker", async () => {
    const abortTool = defineWebMcpTool({
      name: "read_abort",
      description: "Read an aborting value.",
      schema: z.object({}).strict(),
      execute: () => {
        throw new DOMException("stopped", "AbortError")
      },
    })
    expect(await abortTool.execute({}, { signal: new AbortController().signal }))
      .toMatchObject({ ok: false, error: { code: "cancelled", retryable: true } })

    const handlerTool = defineWebMcpTool({
      name: "read_handler",
      description: "Read a handler result.",
      schema: z.object({}).strict(),
      execute: () => ({ data: { ready: true } }),
    })
    expect(await handlerTool.execute({}, { signal: new AbortController().signal })).toEqual({
      ok: true,
      data: { ready: true },
    })
  })
})
