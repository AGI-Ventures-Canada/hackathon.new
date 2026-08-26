import { z } from "zod"
import { WebMcpRequestError } from "@/lib/webmcp/fetch"
import type {
  WebMcpHandlerResult,
  WebMcpTool,
  WebMcpToolAnnotations,
  WebMcpToolResult,
} from "@/lib/webmcp/types"

export const MAX_WEBMCP_OUTPUT_CHARACTERS = 1_500
const MAX_WEBMCP_PARAMETER_NAME_CHARACTERS = 30
const MAX_WEBMCP_PARAMETER_DESCRIPTION_CHARACTERS = 150
const MAX_WEBMCP_ERROR_MESSAGE_CHARACTERS = 240

type WebMcpToolDefinition<TSchema extends z.ZodType, TData> = {
  name: string
  title?: string
  description: string
  schema: TSchema
  annotations?: WebMcpToolAnnotations
  execute: (
    input: z.output<TSchema>,
    options: { signal: AbortSignal },
  ) => Promise<TData | WebMcpHandlerResult<TData>> | TData | WebMcpHandlerResult<TData>
}

function errorResult(
  code: string,
  message: string,
  retryable: boolean,
): WebMcpToolResult<never> {
  return {
    ok: false,
    error: {
      code,
      message: message.slice(0, MAX_WEBMCP_ERROR_MESSAGE_CHARACTERS),
      retryable,
    },
  }
}

function enforceOutputBudget<TData>(
  result: WebMcpToolResult<TData>,
): WebMcpToolResult<TData> {
  let serialized: string
  try {
    serialized = JSON.stringify(result)
  } catch {
    return errorResult(
      "invalid_output",
      "The tool returned an invalid result.",
      false,
    )
  }
  if (serialized.length > MAX_WEBMCP_OUTPUT_CHARACTERS) {
    return errorResult(
      "output_too_large",
      "The result is too large. Narrow the request and try again.",
      false,
    )
  }
  return result
}

function isHandlerResult<T>(value: T | WebMcpHandlerResult<T>): value is WebMcpHandlerResult<T> {
  if (!value || typeof value !== "object") return false
  return Reflect.has(value, "data")
}

function toInputSchema(schema: z.ZodType): Record<string, unknown> {
  const generated = z.toJSONSchema(schema, {
    io: "input",
    reused: "inline",
    target: "draft-07",
  }) as Record<string, unknown>
  const { ["~standard"]: _standard, $schema: _schema, ...inputSchema } = generated
  validateParameterBudgets(inputSchema)
  return inputSchema
}

function validateParameterBudgets(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(validateParameterBudgets)
    return
  }
  if (!value || typeof value !== "object") return

  const schema = value as Record<string, unknown>
  const properties = schema.properties
  if (properties && typeof properties === "object" && !Array.isArray(properties)) {
    for (const [name, parameterSchema] of Object.entries(properties)) {
      if (name.length > MAX_WEBMCP_PARAMETER_NAME_CHARACTERS) {
        throw new Error(`WebMCP parameter name is too long: ${name}`)
      }
      if (parameterSchema && typeof parameterSchema === "object") {
        const description = Reflect.get(parameterSchema, "description")
        if (
          typeof description === "string" &&
          description.length > MAX_WEBMCP_PARAMETER_DESCRIPTION_CHARACTERS
        ) {
          throw new Error(`WebMCP parameter description is too long: ${name}`)
        }
      }
    }
  }

  Object.values(schema).forEach(validateParameterBudgets)
}

function isAbortError(error: unknown, signal: AbortSignal): boolean {
  if (signal.aborted) return true
  return error instanceof DOMException && error.name === "AbortError"
}

export function defineWebMcpTool<TSchema extends z.ZodType, TData>(
  definition: WebMcpToolDefinition<TSchema, TData>,
): WebMcpTool {
  if (!/^[a-z][a-z0-9_]{0,29}$/.test(definition.name)) {
    throw new Error(`Invalid WebMCP tool name: ${definition.name}`)
  }
  if (definition.description.length > 500) {
    throw new Error(`WebMCP tool description is too long: ${definition.name}`)
  }

  return {
    name: definition.name,
    title: definition.title,
    description: definition.description,
    inputSchema: toInputSchema(definition.schema),
    annotations: definition.annotations,
    execute: async (rawInput, options) => {
      const parsed = definition.schema.safeParse(rawInput)
      if (!parsed.success) {
        return errorResult(
          "invalid_input",
          parsed.error.issues[0]?.message ?? "Check the tool input and try again.",
          false,
        )
      }

      if (options.signal.aborted) {
        return errorResult("cancelled", "The request was cancelled.", true)
      }

      try {
        const output = await definition.execute(parsed.data, options)
        if (isHandlerResult(output)) {
          return enforceOutputBudget({
            ok: true,
            data: output.data,
            ...(output.requiresHumanAction === undefined
              ? {}
              : { requiresHumanAction: output.requiresHumanAction }),
          } satisfies WebMcpToolResult<TData>)
        }
        return enforceOutputBudget({
          ok: true,
          data: output,
        } satisfies WebMcpToolResult<TData>)
      } catch (error) {
        if (isAbortError(error, options.signal)) {
          return errorResult("cancelled", "The request was cancelled.", true)
        }
        if (error instanceof WebMcpRequestError) {
          return errorResult(error.code, error.message, error.retryable)
        }
        return errorResult(
          "unexpected_error",
          "Something went wrong. Please try again.",
          true,
        )
      }
    },
  }
}
