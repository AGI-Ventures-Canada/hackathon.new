import type { OatmealClient } from "../../client.js"
import { formatSuccess } from "../../output.js"

export async function runTeamsAssignRoom(
  client: OatmealClient,
  hackathonId: string,
  roomId: string,
  args: string[]
): Promise<void> {
  if (!hackathonId || !roomId) {
    console.error("Usage: hackathon teams assign-room <hackathon-id> <room-id> --team <team-id>")
    process.exit(1)
  }

  let teamId = ""
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--team" || args[i] === "--team-id") teamId = args[++i]
  }

  if (!teamId) {
    console.error("Error: --team <team-id> is required")
    process.exit(1)
  }

  await client.post(
    `/api/dashboard/hackathons/${hackathonId}/rooms/${roomId}/teams`,
    { teamId }
  )

  console.log(formatSuccess(`Assigned team ${teamId} to room ${roomId}`))
}
