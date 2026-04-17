import * as p from "@clack/prompts"
import type { OatmealClient } from "../../client.js"
import { formatSuccess } from "../../output.js"

export async function runSponsorsRemove(
  client: OatmealClient,
  hackathonId: string,
  sponsorId: string,
  options: { yes?: boolean }
): Promise<void> {
  if (!hackathonId || !sponsorId) {
    console.error("Usage: hackathon sponsors remove <hackathon-id> <sponsor-id>")
    process.exit(1)
  }

  if (!options.yes && process.stdout.isTTY) {
    const confirmed = await p.confirm({
      message: `Remove sponsor ${sponsorId}?`,
      initialValue: false,
    })
    if (p.isCancel(confirmed) || !confirmed) {
      console.log("Cancelled.")
      return
    }
  }

  await client.delete(`/api/dashboard/hackathons/${hackathonId}/sponsors/${sponsorId}`)
  console.log(formatSuccess(`Removed sponsor ${sponsorId}`))
}
