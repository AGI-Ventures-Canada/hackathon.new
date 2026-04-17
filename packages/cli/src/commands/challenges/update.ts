import type { OatmealClient } from "../../client.js"
import { formatJson, formatSuccess } from "../../output.js"
import type { Challenge } from "../../types.js"

interface ChallengeUpdateOptions {
  title?: string
  description?: string
  resources?: string
  json?: boolean
}

export function parseChallengeUpdateOptions(args: string[]): ChallengeUpdateOptions {
  const options: ChallengeUpdateOptions = {}
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

function parseResources(value: string): Array<{ label: string; url: string }> {
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

export async function runChallengesUpdate(
  client: OatmealClient,
  hackathonId: string,
  challengeId: string,
  args: string[]
): Promise<void> {
  if (!hackathonId || !challengeId) {
    console.error("Usage: hackathon challenges update <hackathon-id> <challenge-id> [--title ...]")
    process.exit(1)
  }

  const options = parseChallengeUpdateOptions(args)
  const body: Record<string, unknown> = {}
  if (options.title !== undefined) body.title = options.title
  if (options.description !== undefined) body.description = options.description
  if (options.resources !== undefined) body.resources = parseResources(options.resources)

  if (Object.keys(body).length === 0) {
    console.error("Error: provide at least one field to update")
    process.exit(1)
  }

  const response = await client.put<{ challenge: Challenge }>(
    `/api/dashboard/hackathons/${hackathonId}/challenges/${challengeId}`,
    body
  )

  if (options.json) {
    console.log(formatJson(response.challenge))
    return
  }

  console.log(formatSuccess(`Updated challenge "${response.challenge.title}"`))
}
