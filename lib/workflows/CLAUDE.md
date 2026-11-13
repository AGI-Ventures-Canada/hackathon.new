# Workflow SDK 5

This directory contains durable workflows for long-running agent jobs.

Read the version-matched docs in `node_modules/workflow/docs/` before changing workflows. The app uses Workflow 5 and retains `@workflow/ai` 5 for AI SDK 6 compatibility. That AI integration is deprecated; a future migration to `@ai-sdk/workflow` requires AI SDK 7 and is separate from this runtime upgrade.

Workflow 5 runs steps through the combined `/.well-known/workflow/v1/flow` handler. Keep `/.well-known/workflow/` excluded from the Clerk proxy matcher, and include native Sharp files in the flow handler's output trace. Existing runs stay pinned to their original deployment; do not cancel or restart them for an SDK upgrade.

The v5 defaults include linked traces, region-tagged Vercel run IDs, and a per-run event limit. Treat run IDs as opaque strings and check the current documented limits before adding large fan-outs.

## Setup

```typescript
// next.config.ts
import { withWorkflow } from "workflow/next"
export default withWorkflow(nextConfig)
```

## Key Concepts

### Workflows (`"use workflow"`)
Entry points that orchestrate steps. Sandboxed, deterministic, auto-resume on failure.

```typescript
import { getWritable } from "workflow"

export async function myWorkflow(input: string) {
  "use workflow"

  const result = await myStep(input)
  return result
}
```

### Steps (`"use step"`)
Individual tasks with full Node.js access. Auto-retry (3x default), observable.

```typescript
export async function myStep(input: string) {
  "use step"
  return await db.query(input)
}
```

### Starting Workflows
```typescript
import { start } from "workflow/api"

const run = await start(myWorkflow, [input])

run.runId        // unique identifier
await run.status // "running" | "completed" | "failed"
await run.returnValue  // blocks until complete
run.readable     // stream for real-time updates
```

### Control Flow

**Sequential Execution**
```typescript
const validated = await validateData(data)
const processed = await processData(validated)
const stored = await storeData(processed)
return stored
```

**Parallel Execution**
```typescript
const [user, orders, preferences] = await Promise.all([
  fetchUser(userId),
  fetchOrders(userId),
  fetchPreferences(userId)
])
return { user, orders, preferences }
```

**Race (First to Complete)**
```typescript
import { sleep, createWebhook } from "workflow"

const webhook = createWebhook()
await executeExternalTask(webhook.url)

// Wait for webhook or timeout, whichever first
await Promise.race([
  webhook,
  sleep("1 day"),
])
```

## Durable Agents

For AI agents that need durability:

```typescript
import { DurableAgent } from "@workflow/ai/agent"
import { getWritable } from "workflow"

export async function agentWorkflow(messages: ModelMessage[]) {
  "use workflow"

  const writable = getWritable<UIMessageChunk>()
  const agent = new DurableAgent({
    model: "anthropic/claude-sonnet-4-20250514",
    system: "You are a helpful assistant",
    tools: myTools,
  })

  await agent.stream({ messages, writable })
}
```

### API Route Integration

```typescript
import { start } from "workflow/api"

export async function POST(req: Request) {
  const { messages } = await req.json()
  const modelMessages = convertToModelMessages(messages)
  const run = await start(chatWorkflow, [modelMessages])

  return createUIMessageStreamResponse({
    stream: run.readable,
  })
}
```

## Defining Tools

Tools receive input parameters and context with message history:

```typescript
async function getWeather(
  { city }: { city: string },
  { messages, toolCallId }: { messages: LanguageModelV2Prompt; toolCallId: string }
) {
  "use step"
  return `Weather in ${city} is sunny`
}
```

### Step-Level vs Workflow-Level Tools

| Capability | Step-Level | Workflow-Level |
|---|---|---|
| `getWritable()` | ✅ | ❌ |
| Automatic retries | ✅ | ❌ |
| Side-effects/API calls | ✅ | ❌ |
| `sleep()` | ❌ | ✅ |
| `createWebhook()` | ❌ | ✅ |

Use step-level for I/O operations, workflow-level for orchestration with `sleep()` or webhooks.

## Streaming Updates from Tools

Emit custom data chunks during long-running operations:

```typescript
import { getWritable } from "workflow"

export async function searchFlights(
  { from, to, date },
  { toolCallId }
) {
  "use step"
  const writable = getWritable<UIMessageChunk>()
  const writer = writable.getWriter()

  for (const flight of generatedFlights) {
    await writer.write({
      id: `${toolCallId}-${flight.flightNumber}`,
      type: "data-found-flight",  // Must start with "data-"
      data: flight,
    })
  }
  writer.releaseLock()  // Always release when done
}
```

Custom data part type:
```typescript
export interface FoundFlightDataPart {
  type: "data-found-flight"  // Must start with "data-"
  id: string                  // Should match toolCallId
  data: { /* payload */ }
}
```

## Resumable Streams

Enable recovery from network interruptions and page refreshes.

### Server: Return Run ID
```typescript
const run = await start(chatWorkflow, [modelMessages])
return createUIMessageStreamResponse({
  stream: run.readable,
  headers: { "x-workflow-run-id": run.runId },
})
```

### Server: Reconnection Endpoint
```typescript
// GET /api/chat/[id]/stream
const run = getRun(id)
const stream = run.getReadable({ startIndex })  // Resume from position
return createUIMessageStreamResponse({ stream })
```

### Client: WorkflowChatTransport
The transport handles reconnection automatically:
- `onChatSendMessage`: Store run ID when streaming begins
- `onChatEnd`: Clear stored state on completion
- `prepareReconnectToStreamRequest`: Build reconnection URL with run ID

## Sleep and Delays

Pause execution without consuming resources. Survives restarts and deployments.

```typescript
import { sleep } from "workflow"

async function executeSleep({ durationMs }: { durationMs: number }) {
  // No "use step" - sleep is workflow-level
  await sleep(durationMs)
  return { message: `Slept for ${durationMs}ms` }
}
```

### Rate Limiting with RetryableError
```typescript
if (response.status === 429) {
  const retryAfter = response.headers.get("Retry-After")
  throw new RetryableError(`Rate limited`, {
    retryAfter: `${parseInt(retryAfter)}s`,
  })
}
```

### Polling with Exponential Backoff
```typescript
let delay = 1000
const maxDelay = 60000

while (true) {
  const status = await checkJobStatus(jobId)
  if (status === "complete") break

  await sleep(Math.min(delay, maxDelay))
  delay *= 2
}
```

## Human-in-the-Loop

Pause workflows for human decisions without consuming compute.

### Define Hook
```typescript
import { defineHook } from "workflow"
import { z } from "zod"

export const bookingApprovalHook = defineHook({
  schema: z.object({
    approved: z.boolean(),
    comment: z.string().optional(),
  }),
})
```

### Tool Implementation (Workflow-Level)
```typescript
async function executeBookingApproval(
  { flightNumber, passengerName, price },
  { toolCallId }
) {
  // No "use step" - hooks are workflow-level
  const hook = bookingApprovalHook.create({ token: toolCallId })
  const { approved, comment } = await hook  // Pauses here
  return { approved, comment }
}
```

### Resume Endpoint
```typescript
// POST /api/approve-booking
await bookingApprovalHook.resume(toolCallId, { approved, comment })
```

### Alternative: Direct Webhooks
```typescript
import { createWebhook } from "workflow"

const webhook = createWebhook()
// Send webhook.url via email for approval
const response = await webhook  // Pauses until POST to URL
```

## Fetch in Workflows

**CRITICAL**: Global `fetch` is unavailable in workflow functions. Step functions have full Node.js access and can use native `fetch`. Libraries that use native fetch must run in a step, or receive Workflow's durable fetch when called from workflow scope.

### Using DurableAgent (Recommended)

DurableAgent from `@workflow/ai/agent` handles fetch internally - no special setup needed:

```typescript
import { DurableAgent } from "@workflow/ai/agent"

export async function myStep(input: string) {
  "use step"
  const agent = new DurableAgent({ model: modelFactory, tools })
  await agent.stream({ messages, writable })  // Works automatically
}
```

### Direct API Calls

Use the workflow fetch directly for HTTP requests:

```typescript
import { fetch } from "workflow"

export async function dataWorkflow() {
  "use workflow"
  const response = await fetch("https://api.example.com/data")
  const data = await response.json()
  return data
}
```

### Common Error

```
Global "fetch" is unavailable in workflow functions.
Use the "fetch" step function from "workflow" to make HTTP requests.
```

This occurs when libraries try to call `fetch()` directly. Use DurableAgent for AI tasks or import fetch from workflow for direct HTTP calls.

## Monitoring

```bash
npx workflow web      # Web UI
npx workflow inspect runs  # CLI
```

## Documentation

### Getting Started
- Workflow SDK 5 announcement: https://vercel.com/blog/workflow-sdk-5
- Workflow SDK 5 application changes: https://workflow-sdk.dev/docs/whats-new
- Next.js Setup: https://useworkflow.dev/docs/getting-started/next

### Foundations
- Workflows & Steps: https://useworkflow.dev/docs/foundations/workflows-and-steps
- Starting Workflows: https://useworkflow.dev/docs/foundations/starting-workflows
- Control Flow: https://useworkflow.dev/docs/foundations/control-flow-patterns

### AI & Durable Agents
- Overview: https://useworkflow.dev/docs/ai
- Defining Tools: https://useworkflow.dev/docs/ai/defining-tools
- Streaming Updates from Tools: https://useworkflow.dev/docs/ai/streaming-updates-from-tools
- Resumable Streams: https://useworkflow.dev/docs/ai/resumable-streams
- Sleep and Delays: https://useworkflow.dev/docs/ai/sleep-and-delays
- Human-in-the-Loop: https://useworkflow.dev/docs/ai/human-in-the-loop

### Errors
- Fetch in Workflow: https://useworkflow.dev/docs/errors/fetch-in-workflow
