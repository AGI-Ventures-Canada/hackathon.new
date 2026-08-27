#!/usr/bin/env bun
/**
 * Create Daytona Snapshot for Claude Agent SDK
 *
 * Creates a snapshot with Node.js 20 and common dev tools (git, curl, etc.)
 * for running the Claude Agent SDK.
 *
 * Usage:
 *   DAYTONA_API_KEY=... bun scripts/create-daytona-snapshot.ts
 *   DAYTONA_API_KEY=... bun scripts/create-daytona-snapshot.ts --large     # For larger resources
 *   DAYTONA_API_KEY=... bun scripts/create-daytona-snapshot.ts --recreate  # Delete and recreate
 */

import { Daytona, Image } from "@daytonaio/sdk"

const USE_LARGE = process.argv.includes("--large")
const RECREATE = process.argv.includes("--recreate")
const VERSION = "v2"  // Increment when making changes to pre-installed tools
const SNAPSHOT_NAME = USE_LARGE
  ? `claude-agent-sdk-large-${VERSION}`
  : `claude-agent-sdk-tiny-${VERSION}`

async function main() {
  const apiKey = process.env.DAYTONA_API_KEY
  const apiUrl = process.env.DAYTONA_API_URL

  if (!apiKey) {
    console.error("Error: DAYTONA_API_KEY is required")
    process.exit(1)
  }

  console.log("Connecting to Daytona...")
  const daytona = new Daytona({
    apiKey,
    apiUrl,
  })

  const resources = USE_LARGE
    ? { cpu: 2, memory: 4, disk: 10 }
    : { cpu: 1, memory: 1, disk: 1 }  // Absolute minimum

  console.log(`Creating snapshot: ${SNAPSHOT_NAME}`)
  console.log(`Resources: ${resources.cpu} CPU, ${resources.memory}GB RAM, ${resources.disk}GB disk`)
  console.log("This will include: Node.js 20, npm, git, curl, wget, jq")

  try {
    // Handle --recreate flag: delete existing snapshot first
    if (RECREATE) {
      try {
        console.log(`Looking up existing snapshot: ${SNAPSHOT_NAME}...`)
        const existing = await daytona.snapshot.get(SNAPSHOT_NAME)
        if (existing?.id) {
          console.log(`Found snapshot with ID: ${existing.id}, deleting...`)
          await daytona.snapshot.delete(existing.id)
          console.log(`Deleted existing snapshot, waiting for propagation...`)
          // Wait for the delete to fully propagate
          await new Promise(resolve => setTimeout(resolve, 5000))
        } else {
          console.log(`No existing snapshot to delete`)
        }
      } catch {
        console.log("Snapshot lookup or deletion failed. Check Daytona and try again.")
        throw new Error("Could not safely recreate the snapshot")
      }
    } else {
      // Check if snapshot already exists using daytona.snapshot.get()
      try {
        const existing = await daytona.snapshot.get(SNAPSHOT_NAME)
        if (existing) {
          console.log(`\nSnapshot already exists!`)
          console.log(`  Name: ${existing.name}`)
          console.log(`  State: ${existing.state}`)
          console.log(`\nAdd to .env.local:`)
          console.log(`  DAYTONA_BASE_SNAPSHOT_ID=${existing.name}`)
          console.log(`\nTo recreate, use: --recreate flag`)
          return
        }
      } catch {
        // Snapshot doesn't exist, continue to create
      }
    }

    // Create snapshot from Node.js 20 image with common dev tools pre-installed
    console.log("\nCreating snapshot (this may take a few minutes)...")
    const nodeImage = Image.base("node:20-slim")
      .runCommands(
        "apt-get update -qq",
        "apt-get install -y --no-install-recommends git curl wget ca-certificates jq",
        "rm -rf /var/lib/apt/lists/*"
      )

    const snapshot = await daytona.snapshot.create(
      {
        name: SNAPSHOT_NAME,
        image: nodeImage,
        resources,
        entrypoint: ["sleep", "infinity"],
      },
      { onLogs: (log: string) => console.log(`  [build] ${log}`) }
    )

    console.log(`\nSnapshot created!`)
    console.log(`  Name: ${snapshot.name}`)
    console.log(`  State: ${snapshot.state}`)

    console.log(`\nAdd to .env.local:`)
    console.log(`  DAYTONA_BASE_SNAPSHOT_ID=${snapshot.name}`)

    console.log(`\nNote: The snapshot includes node:20-slim + git, curl, wget, jq.`)
    console.log(`@anthropic-ai/claude-agent-sdk will be installed at runtime.`)
  } catch {
    console.error("Failed to create snapshot. Check Daytona logs for details.")
    process.exitCode = 1
  }
}

main()
