import { supabase as getSupabase } from "@/lib/db/client"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { ActionItemsInput } from "@/lib/utils/organizer-actions"
import type { HackathonStatus, HackathonPhase } from "@/lib/db/hackathon-types"

export type OrganizerPollResponse = ActionItemsInput

interface RpcPollRow {
  status: string
  phase: string | null
  description: string | null
  banner_url: string | null
  challenge_count: number | null
  challenge_released_at: string | null
  results_published_at: string | null
  starts_at: string | null
  ends_at: string | null
  location_type: string | null
  feedback_survey_url: string | null
  feedback_survey_sent_at: string | null
  submission_count: number
  unassigned_submission_count: number | null
  participant_count: number
  team_count: number
  assignment_total: number
  assignment_complete: number
  judge_count: number
  prize_count: number
  judge_display_count: number
  mentor_open_count: number
  challenge_release_time: string | null
  pending_judge_invitation_count: number
  planned_round_count: number | null
  active_round_count: number | null
  complete_round_count: number | null
  perk_count: number | null
  perks_none: boolean | null
  community_url: string | null
  terms_content: string | null
}

export async function buildOrganizerPollPayload(hackathonId: string): Promise<OrganizerPollResponse | null> {
  const client = getSupabase() as unknown as SupabaseClient

  const { data, error } = await client.rpc("get_organizer_poll_data", {
    p_hackathon_id: hackathonId,
  })

  if (error || !data) return null

  const r = data as RpcPollRow

  return {
    status: r.status as HackathonStatus,
    phase: r.phase as HackathonPhase | null,
    submissionCount: r.submission_count ?? 0,
    unassignedSubmissionCount: r.unassigned_submission_count ?? 0,
    participantCount: r.participant_count ?? 0,
    teamCount: r.team_count ?? 0,
    judgingProgress: {
      totalAssignments: r.assignment_total ?? 0,
      completedAssignments: r.assignment_complete ?? 0,
    },
    judgeCount: r.judge_count ?? 0,
    prizeCount: r.prize_count ?? 0,
    judgeDisplayCount: r.judge_display_count ?? 0,
    mentorQueue: { open: r.mentor_open_count ?? 0 },
    challengeReleased: !!r.challenge_released_at,
    challengeExists: (r.challenge_count ?? 0) > 0,
    challengeReleaseTime: r.challenge_release_time ?? null,
    resultsPublishedAt: r.results_published_at,
    description: r.description,
    bannerUrl: r.banner_url,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    locationType: r.location_type as ActionItemsInput["locationType"],
    feedbackSurveyUrl: r.feedback_survey_url ?? null,
    feedbackSurveySentAt: r.feedback_survey_sent_at ?? null,
    pendingJudgeInvitationCount: r.pending_judge_invitation_count ?? 0,
    perkCount: r.perk_count ?? 0,
    perksNone: r.perks_none ?? false,
    communityUrl: r.community_url ?? null,
    termsContent: r.terms_content ?? null,
    rounds: {
      plannedCount: r.planned_round_count ?? 0,
      activeCount: r.active_round_count ?? 0,
      completeCount: r.complete_round_count ?? 0,
    },
  }
}
