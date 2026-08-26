"use client"

import { useEffect } from "react"

export type WebMcpToolAnnotations = {
  readOnlyHint?: boolean
  untrustedContentHint?: boolean
}

export type WebMcpExecuteOptions = {
  signal: AbortSignal
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

type WebMcpRegisterOptions = {
  exposedTo?: string[]
  signal?: AbortSignal
}

type WebMcpModelContext = {
  registerTool: (
    tool: WebMcpTool,
    options?: WebMcpRegisterOptions,
  ) => Promise<void>
}

declare global {
  interface Document {
    modelContext?: WebMcpModelContext
  }
}

export async function registerWebMcpTools(
  tools: WebMcpTool[],
  signal: AbortSignal,
): Promise<boolean> {
  if (typeof document === "undefined") return false
  const modelContext = document.modelContext
  const registerTool = modelContext?.registerTool
  if (typeof registerTool !== "function") return false

  await Promise.all(
    tools.map((tool) =>
      registerTool.call(modelContext, tool, { signal }),
    ),
  )
  return true
}

export function useWebMcpTools(tools: WebMcpTool[]) {
  useEffect(() => {
    const controller = new AbortController()

    void registerWebMcpTools(tools, controller.signal).catch((error) => {
      if (controller.signal.aborted) return
      controller.abort()
      console.error("Failed to register WebMCP tools", error)
    })

    return () => controller.abort()
  }, [tools])
}
