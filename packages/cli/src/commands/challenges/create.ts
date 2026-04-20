import * as p from "@clack/prompts"
import type { OatmealClient } from "../../client.js"
import { formatJson, formatSuccess } from "../../output.js"
import type { Challenge } from "../../types.js"

interface ChallengeCreateOptions {
  title?: string
  description?: string
  resources?: string
  json?: boolean
}

export function parseChallengeCreateOptions(args: string[]): ChallengeCreateOptions {
  const options: ChallengeCreateOptions = {}
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--title":
        options.title = args[++i]
        break
      case "--description":
        options.description = args[++i]
        break
      case "--resources":
        options.resources = args[++i]
        break
      case "--json":
        options.json = true
        break
    }
  }
  return options
}

function parseResources(value: string | undefined): Array<{ label: string; url: string }> | undefined {
  if (!value) return undefined
  const items = value.split(";").map((s) => s.trim()).filter(Boolean)
  const resources: Array<{ label: string; url: string }> = []
  for (const item of items) {
    const [label, url] = item.split("|").map((s) => s.trim())
    if (!label || !url) {
      console.error(`Error: --resources entries must be "label|url" separated by ";"`)
      process.exit(1)
    }
    resources.push({ label, url })
  }
  return resources
}

export async function runChallengesCreate(
  client: OatmealClient,
  hackathonId: string,
  args: string[]
): Promise<void> {
  if (!hackathonId) {
    console.error(`Usage: hackathon challenges create <hackathon-id> --title <t> [--description ...] [--resources "label1|url1;label2|url2"]`)
    process.exit(1)
  }

  const options = parseChallengeCreateOptions(args)

  let title = options.title
  if (!title && process.stdout.isTTY) {
    const r = await p.text({ message: "Challenge title:", validate: (v: string) => (v ? undefined : "Required") })
    if (p.isCancel(r)) return
    title = r
  }

  if (!title) {
    console.error("Error: --title is required")
    process.exit(1)
  }

  const response = await client.post<{ challenge: Challenge }>(
    `/api/dashboard/hackathons/${hackathonId}/challenges`,
    {
      title,
      description: options.description,
      resources: parseResources(options.resources),
    }
  )

  if (options.json) {
    console.log(formatJson(response.challenge))
    return
  }

  console.log(formatSuccess(`Created challenge "${response.challenge.title}" (${response.challenge.id})`))
}
