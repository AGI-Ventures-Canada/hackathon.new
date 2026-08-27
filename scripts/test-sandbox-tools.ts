#!/usr/bin/env bun
/** Smoke-test the supported job API used by CLI and automation clients. */

const API_URL = process.env.API_URL || "http://localhost:3000"
const API_KEY = process.env.TEST_API_KEY

async function main() {
  if (!API_KEY) throw new Error("TEST_API_KEY is required")
  const headers = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" }
  const create = await fetch(`${API_URL}/api/v1/jobs`, {
    method: "POST",
    headers,
    body: JSON.stringify({ type: "echo", input: { source: "sandbox-tools-smoke" } }),
  })
  if (!create.ok) throw new Error(`Failed to create job: ${create.status} ${await create.text()}`)
  const job = await create.json() as { id: string }

  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    const result = await fetch(`${API_URL}/api/v1/jobs/${job.id}/result`, { headers })
    if (result.status === 202) {
      await new Promise((resolve) => setTimeout(resolve, 1_000))
      continue
    }
    if (!result.ok) throw new Error(`Failed to read job result: ${result.status}`)
    const payload = await result.json() as { result?: { echo?: unknown } }
    if (payload.result?.echo) {
      console.log("Job API smoke test passed")
      return
    }
    throw new Error("Job completed without the expected echo payload")
  }
  throw new Error("Timed out waiting for job")
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
