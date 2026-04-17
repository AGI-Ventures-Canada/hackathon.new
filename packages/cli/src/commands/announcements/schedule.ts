import type { OatmealClient } from "../../client.js"
import { formatJson, formatSuccess } from "../../output.js"
import type { Announcement } from "../../types.js"

export async function runAnnouncementsSchedule(
  client: OatmealClient,
  hackathonId: string,
  announcementId: string,
  args: string[]
): Promise<void> {
  if (!hackathonId || !announcementId) {
    console.error("Usage: hackathon announcements schedule <hackathon-id> <announcement-id> --at <ISO 8601>")
    process.exit(1)
  }

  let scheduledAt = ""
  let json = false
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--at" || args[i] === "--scheduled-at") scheduledAt = args[++i]
    else if (args[i] === "--json") json = true
  }

  if (!scheduledAt) {
    console.error("Error: --at <ISO 8601 datetime> is required")
    process.exit(1)
  }

  const announcement = await client.post<Announcement>(
    `/api/dashboard/hackathons/${hackathonId}/announcements/${announcementId}/schedule`,
    { scheduledAt }
  )

  if (json) {
    console.log(formatJson(announcement))
    return
  }

  console.log(formatSuccess(`Scheduled "${announcement.title}" for ${scheduledAt}`))
}
