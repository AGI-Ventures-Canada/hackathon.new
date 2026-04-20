import * as p from "@clack/prompts"
import type { OatmealClient } from "../../client.js"
import { formatJson, formatSuccess } from "../../output.js"
import type { Announcement } from "../../types.js"

interface AnnouncementCreateOptions {
  title?: string
  body?: string
  priority?: string
  audience?: string
  json?: boolean
}

export function parseAnnouncementCreateOptions(args: string[]): AnnouncementCreateOptions {
  const options: AnnouncementCreateOptions = {}
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--title":
        options.title = args[++i]
        break
      case "--body":
        options.body = args[++i]
        break
      case "--priority":
        options.priority = args[++i]
        break
      case "--audience":
        options.audience = args[++i]
        break
      case "--json":
        options.json = true
        break
    }
  }
  return options
}

const VALID_PRIORITIES = ["normal", "urgent"] as const
const VALID_AUDIENCES = ["everyone", "organizers", "judges", "mentors", "attendees", "submitted", "not_submitted"] as const

export async function runAnnouncementsCreate(
  client: OatmealClient,
  hackathonId: string,
  args: string[]
): Promise<void> {
  if (!hackathonId) {
    console.error("Usage: hackathon announcements create <hackathon-id> --title <t> --body <b> [--priority normal|urgent] [--audience ...]")
    process.exit(1)
  }

  const options = parseAnnouncementCreateOptions(args)

  let title = options.title
  if (!title && process.stdout.isTTY) {
    const r = await p.text({ message: "Title:", validate: (v: string) => (v ? undefined : "Required") })
    if (p.isCancel(r)) return
    title = r
  }

  let body = options.body
  if (!body && process.stdout.isTTY) {
    const r = await p.text({ message: "Body:", validate: (v: string) => (v ? undefined : "Required") })
    if (p.isCancel(r)) return
    body = r
  }

  if (!title || !body) {
    console.error("Error: --title and --body are required")
    process.exit(1)
  }

  if (options.priority && !VALID_PRIORITIES.includes(options.priority as (typeof VALID_PRIORITIES)[number])) {
    console.error(`Error: --priority must be one of ${VALID_PRIORITIES.join(", ")}`)
    process.exit(1)
  }

  if (options.audience && !VALID_AUDIENCES.includes(options.audience as (typeof VALID_AUDIENCES)[number])) {
    console.error(`Error: --audience must be one of ${VALID_AUDIENCES.join(", ")}`)
    process.exit(1)
  }

  const announcement = await client.post<Announcement>(
    `/api/dashboard/hackathons/${hackathonId}/announcements`,
    { title, body, priority: options.priority, audience: options.audience }
  )

  if (options.json) {
    console.log(formatJson(announcement))
    return
  }

  console.log(formatSuccess(`Created announcement "${announcement.title}" (${announcement.id})`))
}
