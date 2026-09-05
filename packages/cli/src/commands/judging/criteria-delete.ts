import * as p from "@clack/prompts"
import type { OatmealClient } from "../../client.js"
import { formatSuccess } from "../../output.js"

export async function runCriteriaDelete(
  client: OatmealClient,
  hackathonId: string,
  criteriaId: string,
  options: { yes?: boolean }
): Promise<void> {
  if (!criteriaId) {
    console.error("Usage: hackathon judging criteria delete <hackathon-id> <criteria-id>")
    process.exit(1)
  }

  if (!options.yes) {
    const confirm = await p.confirm({ message: `Delete criteria ${criteriaId}?` })
    if (p.isCancel(confirm) || !confirm) {
      p.log.info("Cancelled.")
      return
    }
  }

  await client.delete(
    `/api/dashboard/hackathons/${hackathonId}/core-criteria/${criteriaId}`
  )
  console.log(formatSuccess(`Deleted criteria ${criteriaId}`))
}
