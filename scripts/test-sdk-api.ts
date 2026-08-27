#!/usr/bin/env bun
/** Smoke-test the public job API contract used by SDK integrations. */

const API_URL = process.env.API_URL || "http://localhost:3000"
const API_KEY = process.env.TEST_API_KEY

async function main() {
  if (!API_KEY) throw new Error("TEST_API_KEY is required")
  const headers = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" }
  const create = await fetch(`${API_URL}/api/v1/jobs`, {
    method: "POST",
    headers,
    body: JSON.stringify({ type: "sdk-test", input: { message: "Hello from SDK API test!" } }),
  })
  if (!create.ok) throw new Error(`Failed to create job: ${create.status} ${await create.text()}`)
  const job = await create.json() as { id: string }

  for (let attempt = 0; attempt < 60; attempt++) {
    const result = await fetch(`${API_URL}/api/v1/jobs/${job.id}/result`, { headers })
    if (result.status === 202) {
      await new Promise((resolve) => setTimeout(resolve, 1_000))
      continue
    }
    if (!result.ok) throw new Error(`Failed to read job result: ${result.status}`)
    const payload = await result.json() as { result?: { success?: boolean } }
    if (payload.result?.success) {
      console.log("SDK job API smoke test passed")
      return
    }
    throw new Error("SDK job completed without a success result")
  }
  throw new Error("Timed out waiting for SDK job")
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
