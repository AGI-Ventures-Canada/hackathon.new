import type { OatmealClient } from "../../client.js"
import { formatJson, formatSuccess } from "../../output.js"

interface TeamUpdateOptions {
  name?: string
  mode?: string
  json?: boolean
}

export function parseTeamUpdateOptions(args: string[]): TeamUpdateOptions {
  const options: TeamUpdateOptions = {}
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--name":
        options.name = args[++i]
        break
      case "--mode":
        options.mode = args[++i]
        break
      case "--json":
        options.json = true
        break
    }
  }
  return options
}

const VALID_MODES = ["in_person", "virtual"] as const

export async function runTeamsUpdate(
  client: OatmealClient,
  hackathonId: string,
  teamId: string,
  args: string[]
): Promise<void> {
  if (!hackathonId || !teamId) {
    console.error("Usage: hackathon teams update <hackathon-id> <team-id> [--name ...] [--mode in_person|virtual]")
    process.exit(1)
  }

  const options = parseTeamUpdateOptions(args)
  const body: Record<string, unknown> = {}
  if (options.name !== undefined) body.name = options.name
  if (options.mode !== undefined) {
    if (!VALID_MODES.includes(options.mode as (typeof VALID_MODES)[number])) {
      console.error(`Error: --mode must be one of ${VALID_MODES.join(", ")}`)
      process.exit(1)
    }
    body.mode = options.mode
  }

  if (Object.keys(body).length === 0) {
    console.error("Error: provide at least one field to update (--name or --mode)")
    process.exit(1)
  }

  const response = await client.patch<{ id: string; name: string; mode?: string }>(
    `/api/dashboard/hackathons/${hackathonId}/teams/${teamId}`,
    body
  )

  if (options.json) {
    console.log(formatJson(response))
    return
  }

  console.log(formatSuccess(`Updated team "${response.name}"`))
}
