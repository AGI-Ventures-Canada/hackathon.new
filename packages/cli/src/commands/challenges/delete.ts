import * as p from "@clack/prompts"
import type { OatmealClient } from "../../client.js"
import { formatSuccess } from "../../output.js"

export async function runChallengesDelete(
  client: OatmealClient,
  hackathonId: string,
  challengeId: string,
  options: { yes?: boolean }
): Promise<void> {
  if (!hackathonId || !challengeId) {
    console.error("Usage: hackathon challenges delete <hackathon-id> <challenge-id>")
    process.exit(1)
  }

  if (!options.yes && process.stdout.isTTY) {
    const confirmed = await p.confirm({
      message: `Delete challenge ${challengeId}?`,
      initialValue: false,
    })
    if (p.isCancel(confirmed) || !confirmed) {
      console.log("Cancelled.")
      return
    }
  }

  await client.delete(
    `/api/dashboard/hackathons/${hackathonId}/challenges/${challengeId}`
  )
  console.log(formatSuccess(`Deleted challenge ${challengeId}`))
}
