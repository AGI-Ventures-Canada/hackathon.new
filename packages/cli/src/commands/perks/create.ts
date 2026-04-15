import * as p from "@clack/prompts"
import type { OatmealClient } from "../../client.js"
import { formatJson, formatSuccess } from "../../output.js"
import type { Perk } from "../../types.js"

interface PerkCreateOptions {
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

export function parsePerkCreateOptions(args: string[]): PerkCreateOptions {
  const options: PerkCreateOptions = {}
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

export async function runPerksCreate(
  client: OatmealClient,
  hackathonId: string,
  args: string[]
): Promise<void> {
  const options = parsePerkCreateOptions(args)

  let name = options.name
  if (!name && process.stdout.isTTY) {
    const result = await p.text({
      message: "Perk name:",
      validate: (v: string) => (v ? undefined : "Required"),
    })
    if (p.isCancel(result)) return
    name = result
  }

  if (!name) {
    console.error("Error: --name is required")
    process.exit(1)
  }

  const type = options.type ?? "other"
  if (!VALID_TYPES.includes(type as (typeof VALID_TYPES)[number])) {
    console.error(`Error: --type must be one of ${VALID_TYPES.join(", ")}`)
    process.exit(1)
  }

  const response = await client.post<{ perk: Perk }>(
    `/api/dashboard/hackathons/${hackathonId}/perks`,
    {
      name,
      description: options.description,
      type,
      sponsorId: options.sponsorId,
      code: options.code,
      redemptionUrl: options.url,
      instructions: options.instructions,
      scheduledReleaseAt: options.scheduled,
    }
  )

  if (options.json) {
    console.log(formatJson(response.perk))
    return
  }

  console.log(formatSuccess(`Created perk "${response.perk.name}" (${response.perk.id})`))
}
