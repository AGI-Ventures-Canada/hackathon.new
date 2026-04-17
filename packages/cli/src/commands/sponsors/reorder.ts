import type { OatmealClient } from "../../client.js"
import { formatSuccess } from "../../output.js"

export async function runSponsorsReorder(
  client: OatmealClient,
  hackathonId: string,
  args: string[]
): Promise<void> {
  if (!hackathonId) {
    console.error("Usage: hackathon sponsors reorder <hackathon-id> --ids id1,id2,id3")
    process.exit(1)
  }

  let ids: string[] = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--ids") {
      ids = args[++i]?.split(",").map((s) => s.trim()) ?? []
    }
  }

  if (!ids.length) {
    console.error("Error: --ids is required (comma-separated sponsor IDs in desired order)")
    process.exit(1)
  }

  await client.patch(`/api/dashboard/hackathons/${hackathonId}/sponsors/reorder`, {
    sponsorIds: ids,
  })
  console.log(formatSuccess(`Reordered ${ids.length} sponsors`))
}
