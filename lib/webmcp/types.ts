export type WebMcpToolAnnotations = {
  readOnlyHint?: boolean
  untrustedContentHint?: boolean
}

export type WebMcpExecuteOptions = {
  signal: AbortSignal
}

export type WebMcpToolError = {
  code: string
  message: string
  retryable: boolean
}

export type WebMcpToolResult<T> =
  | {
      ok: true
      data: T
      requiresHumanAction?: boolean
    }
  | {
      ok: false
      error: WebMcpToolError
    }

export type WebMcpTool = {
  name: string
  title?: string
  description: string
  inputSchema?: Record<string, unknown>
  annotations?: WebMcpToolAnnotations
  execute: (
    input: Record<string, unknown>,
    options: WebMcpExecuteOptions,
  ) => Promise<unknown>
}

export type WebMcpRegisterOptions = {
  exposedTo?: string[]
  signal?: AbortSignal
}

export type WebMcpModelContext = {
  registerTool: (
    tool: WebMcpTool,
    options?: WebMcpRegisterOptions,
  ) => Promise<void>
}

export type WebMcpHandlerResult<T> = {
  data: T
  requiresHumanAction?: boolean
}
