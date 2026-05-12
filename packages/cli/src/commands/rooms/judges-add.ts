import type { OatmealClient } from "../../client.js"
import { formatSuccess } from "../../output.js"

export async function runRoomsJudgesAdd(
  client: OatmealClient,
  hackathonId: string,
  roomId: string,
  args: string[]
): Promise<void> {
  if (!hackathonId || !roomId) {
    console.error("Usage: hackathon rooms judges add <hackathon-id> <room-id> --judge <participant-id>")
    process.exit(1)
  }

  let judgeParticipantId = ""
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--judge" || args[i] === "--judge-id" || args[i] === "--participant-id") {
      judgeParticipantId = args[++i]
    }
  }

  if (!judgeParticipantId) {
    console.error("Error: --judge <participant-id> is required")
    process.exit(1)
  }

  await client.post(
    `/api/dashboard/hackathons/${hackathonId}/rooms/${roomId}/judges`,
    { judgeParticipantId }
  )

  console.log(formatSuccess(`Added judge ${judgeParticipantId} to room ${roomId}`))
}
