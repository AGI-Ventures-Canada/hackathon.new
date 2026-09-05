import * as p from "@clack/prompts"
import type { OatmealClient } from "../../client.js"
import { formatJson, formatSuccess } from "../../output.js"
import type { Prize } from "../../types.js"

interface PrizeCreateOptions {
  name?: string
  description?: string
  type?: string
  value?: string
  style?: string
  modes?: string
  json?: boolean
}

export function parsePrizeCreateOptions(args: string[]): PrizeCreateOptions {
  const options: PrizeCreateOptions = {}
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--name":
        options.name = args[++i]
        break
      case "--description":
        options.description = args[++i]
        break
      case "--type":
        options.type = args[++i]
        break
      case "--value":
        options.value = args[++i]
        break
      case "--style":
        options.style = args[++i]
        if (!options.style || !["weighted_score", "gate_check", "bucket_sort", "judges_pick", "crowd_vote"].includes(options.style)) {
          throw new Error("--style must be weighted_score, gate_check, bucket_sort, judges_pick, or crowd_vote")
        }
        break
      case "--modes":
        options.modes = args[++i]
        break
      case "--json":
        options.json = true
        break
    }
  }
  return options
}

function parseModes(value: string | undefined): ("in_person" | "virtual")[] | undefined {
  if (!value) return undefined
  const parts = value.split(",").map((s) => s.trim()).filter(Boolean)
  for (const p of parts) {
    if (p !== "in_person" && p !== "virtual") {
      console.error(`Error: --modes must be a comma-separated list of "in_person" or "virtual"`)
      process.exit(1)
    }
  }
  return parts as ("in_person" | "virtual")[]
}

export async function runPrizesCreate(
  client: OatmealClient,
  hackathonId: string,
  args: string[]
): Promise<void> {
  const options = parsePrizeCreateOptions(args)

  let name = options.name

  if (!name && process.stdout.isTTY) {
    const result = await p.text({ message: "Prize name:", validate: (v: string) => (v ? undefined : "Required") })
    if (p.isCancel(result)) return
    name = result
  }

  if (!name) {
    console.error("Error: --name is required")
    process.exit(1)
  }

  const response = await client.post<{ prize: Prize } | Prize>(
    `/api/dashboard/hackathons/${hackathonId}/prizes`,
    {
      name,
      description: options.description,
      type: options.type,
      value: options.value,
      judgingStyle: options.style,
      allowedTeamModes: parseModes(options.modes),
    }
  )

  const prize = "prize" in response ? response.prize : response

  if (options.json) {
    console.log(formatJson(prize))
    return
  }

  console.log(formatSuccess(`Created prize "${prize.name}" (${prize.id})`))
}
