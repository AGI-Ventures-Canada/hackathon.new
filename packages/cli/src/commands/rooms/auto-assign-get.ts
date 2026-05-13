import type { OatmealClient } from "../../client.js"
import { formatJson } from "../../output.js"

export async function runRoomsAutoAssignGet(
  client: OatmealClient,
  hackathonId: string,
  options: { json?: boolean }
): Promise<void> {
  if (!hackathonId) {
    console.error("Usage: hackathon rooms auto-assign get <hackathon-id>")
    process.exit(1)
  }

  const data = await client.get<{ enabled: boolean }>(
    `/api/dashboard/hackathons/${hackathonId}/auto-assign-by-room`
  )

  if (options.json) {
    console.log(formatJson(data))
    return
  }

  console.log(`Auto-assign by room: ${data.enabled ? "on" : "off"}`)
}
