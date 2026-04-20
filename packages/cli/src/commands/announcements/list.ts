import type { OatmealClient } from "../../client.js"
import { formatJson, formatTable } from "../../output.js"
import type { Announcement } from "../../types.js"

export async function runAnnouncementsList(
  client: OatmealClient,
  hackathonId: string,
  options: { json?: boolean }
): Promise<void> {
  if (!hackathonId) {
    console.error("Usage: hackathon announcements list <hackathon-id>")
    process.exit(1)
  }

  const data = await client.get<{ announcements: Announcement[] }>(
    `/api/dashboard/hackathons/${hackathonId}/announcements`
  )

  if (options.json) {
    console.log(formatJson(data))
    return
  }

  if (!data.announcements?.length) {
    console.log("No announcements found.")
    return
  }

  console.log(
    formatTable(data.announcements, [
      { key: "title", label: "Title" },
      { key: "priority", label: "Priority" },
      { key: "audience", label: "Audience" },
      { key: "status", label: "Status" },
      { key: "id", label: "ID" },
    ])
  )
}
