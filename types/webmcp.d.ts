import type { WebMcpModelContext } from "@/lib/webmcp/types"

declare global {
  interface Document {
    modelContext?: WebMcpModelContext
  }
}

export {}
