import * as p from "@clack/prompts"
import type { OatmealClient } from "../../client.js"
import { formatJson, formatSuccess } from "../../output.js"
import type { Hackathon, WhoAmIResponse } from "../../types.js"
import { formatWorkspace } from "../../workspace.js"

interface CreateOptions {
  name?: string
  slug?: string
  description?: string
  fromUrl?: string
  json?: boolean
  yes?: boolean
}

interface ImportedHackathonResponse {
  id: string
  name: string
  slug: string
}

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

  let name = options.name
  let slug = options.slug
  let description = options.description

  if (options.fromUrl) {
    await confirmPersonalWorkspace(client, options)

    const hackathon = await client.post<ImportedHackathonResponse>("/api/dashboard/import/url", {
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

  await confirmPersonalWorkspace(client, options)

  const hackathon = await client.post<Hackathon>("/api/dashboard/hackathons", {
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

async function confirmPersonalWorkspace(
  client: OatmealClient,
  _options: Pick<CreateOptions, "yes" | "json">
): Promise<void> {
  const whoami = await client.get<WhoAmIResponse>("/api/v1/whoami")

  if (whoami.tenantType !== "personal") {
    return
  }

  console.error(
    `Error: ${formatWorkspace(whoami)} is a personal workspace. ` +
      "Hackathons must be created under an organization. " +
      'Run "hackathon login" and pick an organization, or create one in the dashboard first.'
  )
  process.exit(1)
}
