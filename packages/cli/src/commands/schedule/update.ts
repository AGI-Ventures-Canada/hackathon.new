import type { OatmealClient } from "../../client.js"
import { formatJson, formatSuccess } from "../../output.js"
import type { ScheduleItem } from "../../types.js"

interface ScheduleUpdateOptions {
  title?: string
  startsAt?: string
  endsAt?: string
  description?: string
  location?: string
  sortOrder?: number
  json?: boolean
}

export function parseScheduleUpdateOptions(args: string[]): ScheduleUpdateOptions {
  const options: ScheduleUpdateOptions = {}
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--title":
        options.title = args[++i]
        break
      case "--starts-at":
      case "--start":
        options.startsAt = args[++i]
        break
      case "--ends-at":
      case "--end":
        options.endsAt = args[++i]
        break
      case "--description":
        options.description = args[++i]
        break
      case "--location":
        options.location = args[++i]
        break
      case "--sort-order":
        options.sortOrder = Number(args[++i])
        break
      case "--json":
        options.json = true
        break
    }
  }
  return options
}

export async function runScheduleUpdate(
  client: OatmealClient,
  hackathonId: string,
  itemId: string,
  args: string[]
): Promise<void> {
  if (!hackathonId || !itemId) {
    console.error("Usage: hackathon schedule update <hackathon-id> <item-id> [--title ...]")
    process.exit(1)
  }

  const options = parseScheduleUpdateOptions(args)
  const body: Record<string, unknown> = {}
  if (options.title !== undefined) body.title = options.title
  if (options.startsAt !== undefined) body.startsAt = options.startsAt
  if (options.endsAt !== undefined) body.endsAt = options.endsAt
  if (options.description !== undefined) body.description = options.description
  if (options.location !== undefined) body.location = options.location
  if (options.sortOrder !== undefined) body.sortOrder = options.sortOrder

  if (Object.keys(body).length === 0) {
    console.error("Error: provide at least one field to update")
    process.exit(1)
  }

  const item = await client.patch<ScheduleItem>(
    `/api/dashboard/hackathons/${hackathonId}/schedule/${itemId}`,
    body
  )

  if (options.json) {
    console.log(formatJson(item))
    return
  }

  console.log(formatSuccess(`Updated schedule item "${item.title}"`))
}
