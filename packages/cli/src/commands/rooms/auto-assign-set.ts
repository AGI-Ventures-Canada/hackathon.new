import type { OatmealClient } from "../../client.js"
import { formatSuccess } from "../../output.js"

export async function runRoomsAutoAssignSet(
  client: OatmealClient,
  hackathonId: string,
  args: string[]
): Promise<void> {
  if (!hackathonId) {
    console.error("Usage: hackathon rooms auto-assign set <hackathon-id> --on | --off")
    process.exit(1)
  }

  let enabled: boolean | null = null
  for (const arg of args) {
    if (arg === "--on" || arg === "--enable") enabled = true
    else if (arg === "--off" || arg === "--disable") enabled = false
  }

  if (enabled === null) {
    console.error("Error: pass --on or --off")
    process.exit(1)
  }

  await client.patch(
    `/api/dashboard/hackathons/${hackathonId}/auto-assign-by-room`,
    { enabled }
  )

  console.log(formatSuccess(`Auto-assign by room: ${enabled ? "on" : "off"}`))
}
