import type { OatmealClient } from "../../client.js"
import { formatSuccess } from "../../output.js"

export async function runRoomsJudgesRemove(
  client: OatmealClient,
  hackathonId: string,
  roomId: string,
  judgeParticipantId: string
): Promise<void> {
  if (!hackathonId || !roomId || !judgeParticipantId) {
    console.error("Usage: hackathon rooms judges remove <hackathon-id> <room-id> <judge-participant-id>")
    process.exit(1)
  }

  await client.delete(
    `/api/dashboard/hackathons/${hackathonId}/rooms/${roomId}/judges/${judgeParticipantId}`
  )

  console.log(formatSuccess(`Removed judge ${judgeParticipantId} from room ${roomId}`))
}
