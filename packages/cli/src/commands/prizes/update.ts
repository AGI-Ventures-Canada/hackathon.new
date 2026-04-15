import type { OatmealClient } from "../../client.js"
import { formatJson, formatSuccess } from "../../output.js"
import type { Prize } from "../../types.js"

interface PrizeUpdateOptions {
  name?: string
  description?: string
  type?: string
  value?: string
  modes?: string
  json?: boolean
}

export function parsePrizeUpdateOptions(args: string[]): PrizeUpdateOptions {
  const options: PrizeUpdateOptions = {}
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

function parseModes(value: string | undefined): ("in_person" | "virtual")[] | null | undefined {
  if (value === undefined) return undefined
  if (value === "" || value === "all" || value === "null") return null
  const parts = value.split(",").map((s) => s.trim()).filter(Boolean)
  for (const p of parts) {
    if (p !== "in_person" && p !== "virtual") {
      console.error(`Error: --modes must be a comma-separated list of "in_person" or "virtual" (or "all" to clear)`)
      process.exit(1)
    }
  }
  return parts as ("in_person" | "virtual")[]
}

export async function runPrizesUpdate(
  client: OatmealClient,
  hackathonId: string,
  prizeId: string,
  args: string[]
): Promise<void> {
  if (!prizeId) {
    console.error("Usage: hackathon prizes update <hackathon-id> <prize-id> [--name ...]")
    process.exit(1)
  }

  const options = parsePrizeUpdateOptions(args)
  const body: Record<string, unknown> = {}
  if (options.name) body.name = options.name
  if (options.description) body.description = options.description
  if (options.type) body.type = options.type
  if (options.value) body.value = options.value
  const parsedModes = parseModes(options.modes)
  if (parsedModes !== undefined) body.allowedTeamModes = parsedModes

  if (Object.keys(body).length === 0) {
    console.error("Error: provide at least one field to update")
    process.exit(1)
  }

  const prize = await client.patch<Prize>(
    `/api/dashboard/hackathons/${hackathonId}/prizes/${prizeId}`,
    body
  )

  if (options.json) {
    console.log(formatJson(prize))
    return
  }

  console.log(formatSuccess(`Updated prize "${prize.name}"`))
}
