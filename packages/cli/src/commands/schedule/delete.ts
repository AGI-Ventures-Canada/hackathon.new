import * as p from "@clack/prompts"
import type { OatmealClient } from "../../client.js"
import { formatSuccess } from "../../output.js"

export async function runScheduleDelete(
  client: OatmealClient,
  hackathonId: string,
  itemId: string,
  options: { yes?: boolean }
): Promise<void> {
  if (!hackathonId || !itemId) {
    console.error("Usage: hackathon schedule delete <hackathon-id> <item-id>")
    process.exit(1)
  }

  if (!options.yes && process.stdout.isTTY) {
    const confirmed = await p.confirm({
      message: `Delete schedule item ${itemId}?`,
      initialValue: false,
    })
    if (p.isCancel(confirmed) || !confirmed) {
      console.log("Cancelled.")
      return
    }
  }

  await client.delete(
    `/api/dashboard/hackathons/${hackathonId}/schedule/${itemId}`
  )
  console.log(formatSuccess(`Deleted schedule item ${itemId}`))
}
