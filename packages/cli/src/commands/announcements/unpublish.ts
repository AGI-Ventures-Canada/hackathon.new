import type { OatmealClient } from "../../client.js"
import { formatJson, formatSuccess } from "../../output.js"
import type { Announcement } from "../../types.js"

export async function runAnnouncementsUnpublish(
  client: OatmealClient,
  hackathonId: string,
  announcementId: string,
  options: { json?: boolean }
): Promise<void> {
  if (!hackathonId || !announcementId) {
    console.error("Usage: hackathon announcements unpublish <hackathon-id> <announcement-id>")
    process.exit(1)
  }

  const announcement = await client.post<Announcement>(
    `/api/dashboard/hackathons/${hackathonId}/announcements/${announcementId}/unpublish`
  )

  if (options.json) {
    console.log(formatJson(announcement))
    return
  }

  console.log(formatSuccess(`Unpublished "${announcement.title}"`))
}
