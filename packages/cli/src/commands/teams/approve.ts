import type { OatmealClient } from "../../client.js"
import { formatJson, formatSuccess } from "../../output.js"

interface TeamReviewOptions {
  json?: boolean
}

export async function runTeamsApprove(
  client: OatmealClient,
  hackathonId: string,
  teamId: string,
  options: TeamReviewOptions
): Promise<void> {
  if (!hackathonId || !teamId) {
    console.error("Usage: hackathon teams approve <hackathon-id> <team-id>")
    process.exit(1)
  }

  const response = await client.post<{ success: true; team: { id: string; name: string; status: string } }>(
    `/api/dashboard/hackathons/${hackathonId}/teams/${teamId}/approve`,
    {}
  )

  if (options.json) {
    console.log(formatJson(response))
    return
  }

  console.log(formatSuccess(`Approved team "${response.team.name}"`))
}
