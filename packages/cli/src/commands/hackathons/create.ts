import * as p from "@clack/prompts"
import { createHash, randomUUID } from "node:crypto"
import type { OatmealClient } from "../../client.js"
import { formatJson, formatSuccess } from "../../output.js"
import type { Hackathon, WhoAmIResponse } from "../../types.js"
import { formatWorkspace } from "../../workspace.js"

interface CreateOptions {
  name?: string
  slug?: string
  description?: string
  fromUrl?: string
  testStage?: string
  idempotencyKey?: string
  json?: boolean
  yes?: boolean
}

interface ImportedHackathonResponse {
  id: string
  name: string
  slug: string
}

interface TestHackathonResponse extends ImportedHackathonResponse {
  stage: "registration" | "hacking" | "judging" | "results"
  replayed: boolean
  committed: boolean
  delivery: "suppressed"
}

const TEST_STAGES = new Set(["registration", "hacking", "judging", "results"])

export function parseCreateOptions(args: string[]): CreateOptions {
  const options: CreateOptions = {}
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--name":
        options.name = args[++i]
        break
      case "--slug":
        options.slug = args[++i]
        break
      case "--description":
        options.description = args[++i]
        break
      case "--from-url":
        options.fromUrl = args[++i]
        break
      case "--test-stage":
        options.testStage = args[++i]
        break
      case "--idempotency-key":
        if (args[i + 1] && !args[i + 1].startsWith("-")) {
          options.idempotencyKey = args[++i]
        } else {
          options.idempotencyKey = ""
        }
        break
      case "--json":
        options.json = true
        break
      case "--yes":
      case "-y":
        options.yes = true
        break
    }
  }
  return options
}

export async function runHackathonsCreate(
  client: OatmealClient,
  args: string[]
): Promise<void> {
  const options = parseCreateOptions(args)
  const idempotencyKey = options.idempotencyKey?.trim()
  if (
    args.includes("--idempotency-key") &&
    (!idempotencyKey || idempotencyKey.length > 200)
  ) {
    console.error("Error: --idempotency-key must be 1 to 200 characters")
    process.exit(1)
  }
  if (
    args.includes("--test-stage") &&
    (!options.testStage || !TEST_STAGES.has(options.testStage))
  ) {
    console.error("Error: --test-stage must be registration, hacking, judging, or results")
    process.exit(1)
  }
  if (options.testStage && options.fromUrl) {
    console.error("Error: use --test-stage or --from-url, not both")
    process.exit(1)
  }
  if (
    options.testStage &&
    (options.name !== undefined || options.slug !== undefined || options.description !== undefined)
  ) {
    console.error(
      "Error: test events are prefilled. Remove --name, --slug, and --description, then edit the event after it is made.",
    )
    process.exit(1)
  }

  let name = options.name
  let slug = options.slug
  let description = options.description

  if (options.testStage) {
    if (!options.yes) {
      if (!process.stdout.isTTY) {
        console.error(
          "Error: creating a test event adds a large set of fake data. Add --yes to confirm.",
        )
        process.exit(1)
      }

      const confirmed = await p.confirm({
        message: `Create a test event at the ${options.testStage} stage with fake data?`,
        initialValue: false,
      })
      if (p.isCancel(confirmed) || !confirmed) {
        p.log.info("Cancelled.")
        return
      }
    }

    const workspace = await confirmPersonalWorkspace(client)
    const creationId = createDraftId(workspace.tenantId, idempotencyKey)
    const hackathon = await client.post<TestHackathonResponse>(
      "/api/dashboard/hackathons/test-event",
      {
        creationId,
        stage: options.testStage,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    )

    if (options.json) {
      console.log(formatJson(hackathon))
      return
    }

    console.log(formatSuccess(`Created test event "${hackathon.name}" (${hackathon.id})`))
    console.log("Emails are off while it uses test data.")
    return
  }

  if (options.fromUrl) {
    const workspace = await confirmPersonalWorkspace(client)
    const draftId = createDraftId(workspace.tenantId, idempotencyKey)

    const hackathon = await client.post<ImportedHackathonResponse>("/api/dashboard/import/url", {
      draftId,
      url: options.fromUrl,
      name,
      description,
    })

    if (options.json) {
      console.log(formatJson(hackathon))
      return
    }

    console.log(formatSuccess(`Imported hackathon "${hackathon.name}" (${hackathon.id})`))
    return
  }

  if (!name && process.stdout.isTTY) {
    const result = await p.text({ message: "Hackathon name:", validate: (v: string) => (v ? undefined : "Name is required") })
    if (p.isCancel(result)) return
    name = result
  }

  if (!name) {
    console.error("Error: --name is required")
    process.exit(1)
  }

  if (!slug && process.stdout.isTTY) {
    const suggested = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    const result = await p.text({ message: "Slug:", initialValue: suggested })
    if (p.isCancel(result)) return
    slug = result
  }

  if (!description && process.stdout.isTTY) {
    const result = await p.text({ message: "Description (optional):" })
    if (!p.isCancel(result)) description = result || undefined
  }

  const workspace = await confirmPersonalWorkspace(client)
  const draftId = createDraftId(workspace.tenantId, idempotencyKey)

  const hackathon = await client.post<Hackathon>("/api/dashboard/hackathons", {
    draftId,
    name,
    slug,
    description,
  })

  if (options.json) {
    console.log(formatJson(hackathon))
    return
  }

  console.log(formatSuccess(`Created hackathon "${hackathon.name}" (${hackathon.id})`))
}

function createDraftId(tenantId: string, idempotencyKey?: string): string {
  if (!idempotencyKey) return randomUUID()

  const namespace = Buffer.from("0db104e625bd42c3a7800d84bd24dfb9", "hex")
  const bytes = createHash("sha1")
    .update(namespace)
    .update(tenantId)
    .update("\0")
    .update(idempotencyKey)
    .digest()
    .subarray(0, 16)
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80
  const hex = bytes.toString("hex")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

async function confirmPersonalWorkspace(
  client: OatmealClient,
): Promise<WhoAmIResponse> {
  const whoami = await client.get<WhoAmIResponse>("/api/v1/whoami")

  if (whoami.tenantType !== "personal") {
    return whoami
  }

  if (!process.stdout.isTTY) {
    console.error(
      `Error: ${formatWorkspace(whoami)} is a personal workspace. ` +
        "Hackathons must be created under an organization. " +
        'Run "hackathon login" again and pick an organization in the browser.'
    )
    process.exit(1)
  }

  p.log.warn(
    `${formatWorkspace(whoami)} can't host hackathons — pick an organization to continue.`
  )

  const wantsLogin = await p.confirm({
    message: "Sign in again and pick an organization?",
    initialValue: true,
  })

  if (p.isCancel(wantsLogin) || !wantsLogin) {
    p.log.info("Cancelled.")
    process.exit(0)
  }

  const { runLogin } = await import("../login.js")
  await runLogin([])
  p.log.success(
    'Signed in. Re-run your "hackathon events create" command to use the new workspace.'
  )
  process.exit(0)
}
