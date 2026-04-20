import type { OatmealClient } from "../../client.js"
import { formatJson, formatSuccess } from "../../output.js"
import type { Perk } from "../../types.js"

interface PerkUpdateOptions {
  name?: string
  description?: string
  type?: string
  sponsorId?: string
  code?: string
  url?: string
  instructions?: string
  scheduled?: string
  json?: boolean
}

export function parsePerkUpdateOptions(args: string[]): PerkUpdateOptions {
  const options: PerkUpdateOptions = {}
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
      case "--sponsor-id":
        options.sponsorId = args[++i]
        break
      case "--code":
        options.code = args[++i]
        break
      case "--url":
        options.url = args[++i]
        break
      case "--instructions":
        options.instructions = args[++i]
        break
      case "--scheduled":
        options.scheduled = args[++i]
        break
      case "--json":
        options.json = true
        break
    }
  }
  return options
}

const VALID_TYPES = ["api_key", "credit", "coupon", "other"] as const

export async function runPerksUpdate(
  client: OatmealClient,
  hackathonId: string,
  perkId: string,
  args: string[]
): Promise<void> {
  if (!hackathonId || !perkId) {
    console.error("Usage: hackathon perks update <hackathon-id> <perk-id> [--name ...]")
    process.exit(1)
  }

  const options = parsePerkUpdateOptions(args)
  const body: Record<string, unknown> = {}
  if (options.name !== undefined) body.name = options.name
  if (options.description !== undefined) body.description = options.description
  if (options.sponsorId !== undefined) body.sponsorId = options.sponsorId
  if (options.code !== undefined) body.code = options.code
  if (options.url !== undefined) body.redemptionUrl = options.url
  if (options.instructions !== undefined) body.instructions = options.instructions
  if (options.scheduled !== undefined) body.scheduledReleaseAt = options.scheduled
  if (options.type !== undefined) {
    if (!VALID_TYPES.includes(options.type as (typeof VALID_TYPES)[number])) {
      console.error(`Error: --type must be one of ${VALID_TYPES.join(", ")}`)
      process.exit(1)
    }
    body.type = options.type
  }

  if (Object.keys(body).length === 0) {
    console.error("Error: provide at least one field to update")
    process.exit(1)
  }

  const response = await client.put<{ perk: Perk }>(
    `/api/dashboard/hackathons/${hackathonId}/perks/${perkId}`,
    body
  )

  if (options.json) {
    console.log(formatJson(response.perk))
    return
  }

  console.log(formatSuccess(`Updated perk "${response.perk.name}"`))
}
