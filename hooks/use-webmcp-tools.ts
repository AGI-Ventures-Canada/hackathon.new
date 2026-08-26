"use client"

import { useEffect } from "react"
import type { WebMcpTool } from "@/lib/webmcp/types"

export type {
  WebMcpExecuteOptions,
  WebMcpModelContext,
  WebMcpRegisterOptions,
  WebMcpTool,
  WebMcpToolAnnotations,
  WebMcpToolError,
  WebMcpToolResult,
} from "@/lib/webmcp/types"

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
