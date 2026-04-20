import * as p from "@clack/prompts"
import type { OatmealClient } from "../../client.js"
import { formatJson, formatSuccess } from "../../output.js"
import type { ScheduleItem } from "../../types.js"

interface ScheduleAddOptions {
  title?: string
  startsAt?: string
  endsAt?: string
  description?: string
  location?: string
  sortOrder?: number
  json?: boolean
}

export function parseScheduleAddOptions(args: string[]): ScheduleAddOptions {
  const options: ScheduleAddOptions = {}
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

export async function runScheduleAdd(
  client: OatmealClient,
  hackathonId: string,
  args: string[]
): Promise<void> {
  if (!hackathonId) {
    console.error("Usage: hackathon schedule add <hackathon-id> --title <t> --starts-at <ISO> [--ends-at ...] [--location ...]")
    process.exit(1)
  }

  const options = parseScheduleAddOptions(args)

  let title = options.title
  if (!title && process.stdout.isTTY) {
    const r = await p.text({ message: "Title:", validate: (v: string) => (v ? undefined : "Required") })
    if (p.isCancel(r)) return
    title = r
  }

  let startsAt = options.startsAt
  if (!startsAt && process.stdout.isTTY) {
    const r = await p.text({ message: "Starts at (ISO 8601):", validate: (v: string) => (v ? undefined : "Required") })
    if (p.isCancel(r)) return
    startsAt = r
  }

  if (!title || !startsAt) {
    console.error("Error: --title and --starts-at are required")
    process.exit(1)
  }

  const item = await client.post<ScheduleItem>(
    `/api/dashboard/hackathons/${hackathonId}/schedule`,
    {
      title,
      startsAt,
      endsAt: options.endsAt,
      description: options.description,
      location: options.location,
      sortOrder: options.sortOrder,
    }
  )

  if (options.json) {
    console.log(formatJson(item))
    return
  }

  console.log(formatSuccess(`Added schedule item "${item.title}" (${item.id})`))
}
