import type { OatmealClient } from "../../client.js"
import { formatJson, formatSuccess } from "../../output.js"
import type { Announcement } from "../../types.js"

interface AnnouncementUpdateOptions {
  title?: string
  body?: string
  priority?: string
  audience?: string
  json?: boolean
}

export function parseAnnouncementUpdateOptions(args: string[]): AnnouncementUpdateOptions {
  const options: AnnouncementUpdateOptions = {}
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

export async function runAnnouncementsUpdate(
  client: OatmealClient,
  hackathonId: string,
  announcementId: string,
  args: string[]
): Promise<void> {
  if (!hackathonId || !announcementId) {
    console.error("Usage: hackathon announcements update <hackathon-id> <announcement-id> [--title ...]")
    process.exit(1)
  }

  const options = parseAnnouncementUpdateOptions(args)
  const payload: Record<string, unknown> = {}
  if (options.title !== undefined) payload.title = options.title
  if (options.body !== undefined) payload.body = options.body
  if (options.audience !== undefined) {
    if (!VALID_AUDIENCES.includes(options.audience as (typeof VALID_AUDIENCES)[number])) {
      console.error(`Error: --audience must be one of ${VALID_AUDIENCES.join(", ")}`)
      process.exit(1)
    }
    payload.audience = options.audience
  }
  if (options.priority !== undefined) {
    if (!VALID_PRIORITIES.includes(options.priority as (typeof VALID_PRIORITIES)[number])) {
      console.error(`Error: --priority must be one of ${VALID_PRIORITIES.join(", ")}`)
      process.exit(1)
    }
    payload.priority = options.priority
  }

  if (Object.keys(payload).length === 0) {
    console.error("Error: provide at least one field to update")
    process.exit(1)
  }

  const announcement = await client.patch<Announcement>(
    `/api/dashboard/hackathons/${hackathonId}/announcements/${announcementId}`,
    payload
  )

  if (options.json) {
    console.log(formatJson(announcement))
    return
  }

  console.log(formatSuccess(`Updated announcement "${announcement.title}"`))
}
