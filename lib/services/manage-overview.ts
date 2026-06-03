import { buildOrganizerPollPayload } from "@/lib/services/organizer-polling"

export type ManageOverviewStats = {
  participantCount: number
  teamCount: number
  pendingTeamApprovalCount: number
  mentorQueue: { open: number }
  challengeReleased: boolean
}

export async function getManageOverviewStats(hackathonId: string): Promise<ManageOverviewStats> {
  const payload = await buildOrganizerPollPayload(hackathonId)
  if (!payload) {
    return {
      participantCount: 0,
      teamCount: 0,
      pendingTeamApprovalCount: 0,
      mentorQueue: { open: 0 },
      challengeReleased: false,
    }
  }

  return {
    participantCount: payload.participantCount,
    teamCount: payload.teamCount,
    pendingTeamApprovalCount: payload.pendingTeamApprovalCount,
    mentorQueue: payload.mentorQueue,
    challengeReleased: payload.challengeReleased,
  }
}
