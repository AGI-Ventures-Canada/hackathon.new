import type { OatmealClient } from "../../client.js"
import { formatJson, formatTable } from "../../output.js"
import type { Challenge } from "../../types.js"

export async function runChallengesList(
  client: OatmealClient,
  hackathonId: string,
  options: { json?: boolean }
): Promise<void> {
  if (!hackathonId) {
    console.error("Usage: hackathon challenges list <hackathon-id>")
    process.exit(1)
  }

  const data = await client.get<{ challenges: Challenge[] }>(
    `/api/dashboard/hackathons/${hackathonId}/challenges`
  )

  if (options.json) {
    console.log(formatJson(data))
    return
  }

  if (!data.challenges?.length) {
    console.log("No challenges found.")
    return
  }

  console.log(
    formatTable(data.challenges, [
      { key: "title", label: "Title" },
      { key: "description", label: "Description" },
      { key: "id", label: "ID" },
    ])
  )
}
