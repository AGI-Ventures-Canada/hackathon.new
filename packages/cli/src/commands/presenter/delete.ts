import * as p from "@clack/prompts"
import type { OatmealClient } from "../../client.js"
import { formatSuccess } from "../../output.js"

export async function runPresenterDelete(
  client: OatmealClient,
  hackathonId: string,
  viewId: string,
  options: { yes?: boolean }
): Promise<void> {
  if (!viewId) {
    console.error("Usage: hackathon presenter delete <hackathon-id> <view-id>")
    process.exit(1)
  }

  if (!options.yes) {
    const confirm = await p.confirm({ message: `Delete presenter view ${viewId}?` })
    if (p.isCancel(confirm) || !confirm) {
      p.log.info("Cancelled.")
      return
    }
  }

  await client.delete(`/api/dashboard/hackathons/${hackathonId}/presenter-views/${viewId}`)
  console.log(formatSuccess(`Deleted presenter view ${viewId}`))
}
