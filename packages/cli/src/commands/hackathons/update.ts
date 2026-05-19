import type { OatmealClient } from "../../client.js"
import { formatJson, formatSuccess } from "../../output.js"
import type { Hackathon } from "../../types.js"
import { resolveHackathonId } from "./resolve.js"

interface UpdateOptions {
  name?: string
  slug?: string
  description?: string
  requireTeamApproval?: boolean
  json?: boolean
}

export function parseUpdateOptions(args: string[]): UpdateOptions {
  const options: UpdateOptions = {}
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
      case "--require-team-approval":
        options.requireTeamApproval = true
        break
      case "--no-require-team-approval":
        options.requireTeamApproval = false
        break
      case "--json":
        options.json = true
        break
    }
  }
  return options
}

export async function runHackathonsUpdate(
  client: OatmealClient,
  idOrSlug: string,
  args: string[]
): Promise<void> {
  if (!idOrSlug) {
    console.error("Usage: hackathon events update <id-or-slug> [--name ...] [--slug ...] [--description ...] [--require-team-approval|--no-require-team-approval]")
    process.exit(1)
  }

  const options = parseUpdateOptions(args)
  const id = await resolveHackathonId(client, idOrSlug)

  const body: Record<string, string | boolean> = {}
  if (options.name) body.name = options.name
  if (options.slug) body.slug = options.slug
  if (options.description) body.description = options.description
  if (options.requireTeamApproval !== undefined) body.requireTeamApproval = options.requireTeamApproval

  if (Object.keys(body).length === 0) {
    console.error("Error: provide at least one field to update")
    process.exit(1)
  }

  const hackathon = await client.patch<Hackathon>(`/api/dashboard/hackathons/${id}/settings`, body)

  if (options.json) {
    console.log(formatJson(hackathon))
    return
  }

  console.log(formatSuccess(`Updated hackathon "${hackathon.name ?? id}"`))
}
