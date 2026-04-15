import * as p from "@clack/prompts"
import type { OatmealClient } from "../../client.js"
import { formatSuccess } from "../../output.js"

export async function runPerksDelete(
  client: OatmealClient,
  hackathonId: string,
  perkId: string,
  options: { yes?: boolean }
): Promise<void> {
  if (!perkId) {
    console.error("Usage: hackathon perks delete <hackathon-id> <perk-id>")
    process.exit(1)
  }

  if (!options.yes) {
    const confirm = await p.confirm({ message: `Delete perk ${perkId}?` })
    if (p.isCancel(confirm) || !confirm) {
      p.log.info("Cancelled.")
      return
    }
  }

  await client.delete(`/api/dashboard/hackathons/${hackathonId}/perks/${perkId}`)
  console.log(formatSuccess(`Deleted perk ${perkId}`))
}
