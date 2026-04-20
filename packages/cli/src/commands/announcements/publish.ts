import type { OatmealClient } from "../../client.js"
import { formatJson, formatSuccess } from "../../output.js"
import type { Announcement } from "../../types.js"

export async function runAnnouncementsPublish(
  client: OatmealClient,
  hackathonId: string,
  announcementId: string,
  options: { json?: boolean }
): Promise<void> {
  if (!hackathonId || !announcementId) {
    console.error("Usage: hackathon announcements publish <hackathon-id> <announcement-id>")
    process.exit(1)
  }

  const announcement = await client.post<Announcement>(
    `/api/dashboard/hackathons/${hackathonId}/announcements/${announcementId}/publish`
  )

  if (options.json) {
    console.log(formatJson(announcement))
    return
  }

  console.log(formatSuccess(`Published "${announcement.title}"`))
}
