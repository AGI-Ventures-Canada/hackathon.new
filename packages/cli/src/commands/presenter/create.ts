import type { OatmealClient } from "../../client.js"
import { formatJson, formatSuccess } from "../../output.js"
import type { PresenterView, PresenterViewConfig } from "../../types.js"

interface CreateOptions {
  name?: string
  round?: string
  submissions?: string
  json?: boolean
}

export function parsePresenterCreateOptions(args: string[]): CreateOptions {
  const options: CreateOptions = {}
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--name":
        options.name = args[++i]
        break
      case "--round":
        options.round = args[++i]
        break
      case "--submissions":
        options.submissions = args[++i]
        break
      case "--json":
        options.json = true
        break
    }
  }
  return options
}

export async function runPresenterCreate(
  client: OatmealClient,
  hackathonId: string,
  args: string[]
): Promise<void> {
  if (!hackathonId) {
    console.error("Usage: hackathon presenter create <hackathon-id> --name <name> (--round <round-id> | --submissions <id1,id2,...>)")
    process.exit(1)
  }

  const options = parsePresenterCreateOptions(args)

  if (!options.name) {
    console.error("Error: --name is required")
    process.exit(1)
  }

  if (!options.round && !options.submissions) {
    console.error("Error: pass either --round <round-id> or --submissions <id1,id2,...>")
    process.exit(1)
  }

  if (options.round && options.submissions) {
    console.error("Error: pass either --round or --submissions, not both")
    process.exit(1)
  }

  let config: PresenterViewConfig
  if (options.round) {
    config = { kind: "round_finalists", roundId: options.round }
  } else {
    const ids = (options.submissions ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
    if (ids.length === 0) {
      console.error("Error: --submissions must list at least one submission id")
      process.exit(1)
    }
    config = { kind: "manual", submissionIds: ids }
  }

  const view = await client.post<PresenterView>(
    `/api/dashboard/hackathons/${hackathonId}/presenter-views`,
    { name: options.name, config }
  )

  if (options.json) {
    console.log(formatJson(view))
    return
  }

  console.log(formatSuccess(`Created presenter view "${view.name}" (${view.id})`))
}
