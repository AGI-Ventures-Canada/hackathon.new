import * as p from "@clack/prompts"
import type { OatmealClient } from "../../client.js"
import { formatSuccess } from "../../output.js"

export async function runAnnouncementsDelete(
  client: OatmealClient,
  hackathonId: string,
  announcementId: string,
  options: { yes?: boolean }
): Promise<void> {
  if (!hackathonId || !announcementId) {
    console.error("Usage: hackathon announcements delete <hackathon-id> <announcement-id>")
    process.exit(1)
  }

  if (!options.yes && process.stdout.isTTY) {
    const confirmed = await p.confirm({
      message: `Delete announcement ${announcementId}?`,
      initialValue: false,
    })
    if (p.isCancel(confirmed) || !confirmed) {
      console.log("Cancelled.")
      return
    }
  }

  await client.delete(
    `/api/dashboard/hackathons/${hackathonId}/announcements/${announcementId}`
  )
  console.log(formatSuccess(`Deleted announcement ${announcementId}`))
}
