import type { OatmealClient } from "../../client.js"
import { formatJson, formatTable } from "../../output.js"
import type { ScheduleItem } from "../../types.js"

export async function runScheduleList(
  client: OatmealClient,
  hackathonId: string,
  options: { json?: boolean }
): Promise<void> {
  if (!hackathonId) {
    console.error("Usage: hackathon schedule list <hackathon-id>")
    process.exit(1)
  }

  const data = await client.get<{ scheduleItems: ScheduleItem[] }>(
    `/api/dashboard/hackathons/${hackathonId}/schedule`
  )

  if (options.json) {
    console.log(formatJson(data))
    return
  }

  if (!data.scheduleItems?.length) {
    console.log("No schedule items found.")
    return
  }

  console.log(
    formatTable(data.scheduleItems, [
      { key: "title", label: "Title" },
      { key: "startsAt", label: "Starts" },
      { key: "endsAt", label: "Ends" },
      { key: "location", label: "Location" },
      { key: "id", label: "ID" },
    ])
  )
}
