import type { OatmealClient } from "../../client.js"
import { formatCount, formatJson, formatSuccess } from "../../output.js"

interface TeamReviewOptions {
  json?: boolean
}

export async function runTeamsDeny(
  client: OatmealClient,
  hackathonId: string,
  teamId: string,
  options: TeamReviewOptions
): Promise<void> {
  if (!hackathonId || !teamId) {
    console.error("Usage: hackathon teams deny <hackathon-id> <team-id>")
    process.exit(1)
  }

  const response = await client.post<{
    success: true
    team: { id: string; name: string; status: string }
    membersUnassigned: number
    invitesCancelled: number
    membersNotified?: number
  }>(`/api/dashboard/hackathons/${hackathonId}/teams/${teamId}/deny`, {})

  if (options.json) {
    console.log(formatJson(response))
    return
  }

  const members = formatCount(response.membersUnassigned, "member", "members")
  const invites = formatCount(response.invitesCancelled, "invite", "invites")
  console.log(formatSuccess(`Denied team "${response.team.name}" (${members} unassigned, ${invites} cancelled)`))
}
