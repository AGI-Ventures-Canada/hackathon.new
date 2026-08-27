import type { Json } from "@/lib/db/types"

export type JobHandler = (input: Json) => Promise<Json>

export const jobHandlers: Record<string, JobHandler> = {
  echo: async (input) => {
    return { echo: input }
  },

  delay: async (input) => {
    const { ms = 1000 } = (input as { ms?: number }) || {}
    if (!Number.isFinite(ms) || ms < 0 || ms > 60_000) {
      throw new Error("Delay must be between 0 and 60000 milliseconds")
    }
    await new Promise((resolve) => setTimeout(resolve, ms))
    return { delayed: true, ms }
  },

  // Generic test handler - just echoes input with metadata
  "sdk-test": async (input) => {
    return {
      success: true,
      receivedInput: input,
      processedAt: new Date().toISOString(),
    }
  },
}

export function isSupportedJobType(type: string): boolean {
  return Object.hasOwn(jobHandlers, type)
}

export function registerJobHandler(type: string, handler: JobHandler): void {
  jobHandlers[type] = handler
}
