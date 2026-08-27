#!/usr/bin/env bun
/**
 * Test installing @anthropic-ai/claude-agent-sdk in sandbox
 */

import { Daytona } from "@daytonaio/sdk"

const SNAPSHOT_NAME = process.env.DAYTONA_BASE_SNAPSHOT_ID || "claude-agent-sdk-tiny"

async function main() {
  console.log("Creating Daytona client...")

  const config: { apiKey: string; apiUrl?: string } = {
    apiKey: process.env.DAYTONA_API_KEY!,
  }

  if (process.env.DAYTONA_API_URL) {
    config.apiUrl = process.env.DAYTONA_API_URL
  }

  const daytona = new Daytona(config)

  console.log("Creating sandbox from snapshot:", SNAPSHOT_NAME)
  const sandbox = await daytona.create({
    snapshot: SNAPSHOT_NAME,
    envVars: {
      NODE_ENV: "production",
    },
    autoStopInterval: 30,
  })

  console.log("Sandbox created:", sandbox.id)

  try {
    // Create package.json like the real code does
    const packageJson = JSON.stringify(
      {
        name: "agent-runner",
        dependencies: {
          "@anthropic-ai/claude-agent-sdk": "0.3.247",
        },
      },
      null,
      2
    )

    console.log("\n=== Setting up agent-runner ===")

    console.log("\n1. Creating /tmp/agent-runner directory:")
    await sandbox.fs.createFolder("/tmp/agent-runner", "755")
    console.log("Done")

    console.log("\n2. Writing package.json:")
    await sandbox.fs.uploadFile(Buffer.from(packageJson), "/tmp/agent-runner/package.json")
    console.log("Content:", packageJson)

    console.log("\n3. Verifying files:")
    const ls = await sandbox.process.executeCommand("ls -la /tmp/agent-runner")
    console.log("Raw result:", JSON.stringify(ls, null, 2))

    console.log("\n4. Running npm install:")
    const startTime = Date.now()
    const npmInstall = await sandbox.process.executeCommand("cd /tmp/agent-runner && npm install 2>&1")
    const elapsed = Date.now() - startTime
    console.log(`Elapsed: ${elapsed}ms`)
    console.log("Raw result:", JSON.stringify(npmInstall, null, 2))

    if (npmInstall.exitCode === 0) {
      console.log("\n✓ npm install succeeded!")

      console.log("\n5. Checking installed packages:")
      const lsModules = await sandbox.process.executeCommand("ls -la /tmp/agent-runner/node_modules 2>&1 | head -20")
      console.log("Raw result:", JSON.stringify(lsModules, null, 2))

      console.log("\n6. Checking SDK installation:")
      const checkSdk = await sandbox.process.executeCommand("ls -la /tmp/agent-runner/node_modules/@anthropic-ai 2>&1")
      console.log("Raw result:", JSON.stringify(checkSdk, null, 2))
    } else {
      console.log("\n✗ npm install failed!")
    }

  } finally {
    console.log("\nDeleting sandbox...")
    await sandbox.delete()
    console.log("Done!")
  }
}

main().catch(console.error)
