import type { OatmealClient } from "../../client.js"
import { formatSuccess } from "../../output.js"

export async function runTeamsUnassignRoom(
  client: OatmealClient,
  hackathonId: string,
  roomId: string,
  teamId: string
): Promise<void> {
  if (!hackathonId || !roomId || !teamId) {
    console.error("Usage: hackathon teams unassign-room <hackathon-id> <room-id> <team-id>")
    process.exit(1)
  }

  await client.delete(
    `/api/dashboard/hackathons/${hackathonId}/rooms/${roomId}/teams/${teamId}`
  )

  console.log(formatSuccess(`Removed team ${teamId} from room ${roomId}`))
}
