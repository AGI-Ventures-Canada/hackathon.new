import * as p from "@clack/prompts"
import type { OatmealClient } from "../../client.js"
import { formatQueueReason } from "../../notification-delivery.js"
import { formatJson, formatSuccess, formatWarning } from "../../output.js"

interface TeamCreateOptions {
  name?: string
  captainEmail?: string
  json?: boolean
}

export function parseTeamCreateOptions(args: string[]): TeamCreateOptions {
  const options: TeamCreateOptions = {}
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--name":
        options.name = args[++i]
        break
      case "--captain-email":
        options.captainEmail = args[++i]
        break
      case "--json":
        options.json = true
        break
    }
  }
  return options
}

export async function runTeamsCreate(
  client: OatmealClient,
  hackathonId: string,
  args: string[]
): Promise<void> {
  if (!hackathonId) {
    console.error("Usage: hackathon teams create <hackathon-id> --name <name> --captain-email <email>")
    process.exit(1)
  }

  const options = parseTeamCreateOptions(args)

  let name = options.name
  if (!name && process.stdout.isTTY) {
    const r = await p.text({ message: "Team name:", validate: (v: string) => (v ? undefined : "Required") })
    if (p.isCancel(r)) return
    name = r
  }

  let captainEmail = options.captainEmail
  if (!captainEmail && process.stdout.isTTY) {
    const r = await p.text({ message: "Captain email:", validate: (v: string) => (v ? undefined : "Required") })
    if (p.isCancel(r)) return
    captainEmail = r
  }

  if (!name || !captainEmail) {
    console.error("Error: --name and --captain-email are required")
    process.exit(1)
  }

  const response = await client.post<{
    team: { id: string; name: string }
    invited?: boolean
    queued?: boolean
    delivery?: "sent" | "queued" | "failed"
    queueReason?: "event_draft"
  }>(
    `/api/dashboard/hackathons/${hackathonId}/teams`,
    { name, captainEmail }
  )

  if (options.json) {
    console.log(formatJson(response))
    return
  }

  if (response.invited && response.delivery === "failed") {
    console.log(formatWarning(`Created team "${response.team.name}" and saved the invite to ${captainEmail}, but email delivery could not be confirmed`))
    return
  }

  const msg = response.invited
    ? response.queued
      ? `Created team "${response.team.name}" and queued invite to ${captainEmail}. ${formatQueueReason(response.queueReason)}`
      : `Created team "${response.team.name}" and sent invite to ${captainEmail}`
    : `Created team "${response.team.name}" (${response.team.id})`
  console.log(formatSuccess(msg))
}
