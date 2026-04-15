import type { OatmealClient } from "../../client.js"
import { formatJson, formatSuccess } from "../../output.js"
import type { Perk } from "../../types.js"

export async function runPerksRelease(
  client: OatmealClient,
  hackathonId: string,
  perkId: string,
  options: { json?: boolean }
): Promise<void> {
  if (!perkId) {
    console.error("Usage: hackathon perks release <hackathon-id> <perk-id>")
    process.exit(1)
  }

  const response = await client.post<{ perk: Perk }>(
    `/api/dashboard/hackathons/${hackathonId}/perks/${perkId}/release`,
    {}
  )

  if (options.json) {
    console.log(formatJson(response.perk))
    return
  }

  console.log(formatSuccess(`Released perk "${response.perk.name}"`))
}
