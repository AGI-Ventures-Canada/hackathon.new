import { supabase as getSupabase } from "@/lib/db/client"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { ActionItemsInput } from "@/lib/utils/organizer-actions"

export type OrganizerPollResponse = ActionItemsInput

export async function buildOrganizerPollPayload(hackathonId: string): Promise<OrganizerPollResponse | null> {
  const client = getSupabase() as unknown as SupabaseClient

  const [
    hackathonResult,
    submissionResult,
    participantResult,
    teamResult,
    assignmentTotalResult,
    assignmentCompleteResult,
    judgeCountResult,
    prizeResult,
    judgeDisplayResult,
    mentorResult,
    challengeReleaseResult,
    pendingJudgeInvResult,
  ] = await Promise.all([
    client
      .from("hackathons")
      .select("status, phase, description, banner_url, challenge_title, challenge_released_at, results_published_at, starts_at, ends_at, location_type, feedback_survey_url, feedback_survey_sent_at")
      .eq("id", hackathonId)
      .single(),
    client
      .from("submissions")
      .select("id", { count: "exact", head: true })
      .eq("hackathon_id", hackathonId)
      .eq("status", "submitted"),
    client
      .from("hackathon_participants")
      .select("id", { count: "exact", head: true })
      .eq("hackathon_id", hackathonId),
    client
      .from("teams")
      .select("id", { count: "exact", head: true })
      .eq("hackathon_id", hackathonId)
      .neq("status", "disbanded"),
    client
      .from("judge_assignments")
      .select("id", { count: "exact", head: true })
      .eq("hackathon_id", hackathonId),
    client
      .from("judge_assignments")
      .select("id", { count: "exact", head: true })
      .eq("hackathon_id", hackathonId)
      .eq("is_complete", true),
    client
      .from("hackathon_participants")
      .select("id", { count: "exact", head: true })
      .eq("hackathon_id", hackathonId)
      .eq("role", "judge"),
    client
      .from("prizes")
      .select("id", { count: "exact", head: true })
      .eq("hackathon_id", hackathonId),
    client
      .from("hackathon_judges_display")
      .select("id", { count: "exact", head: true })
      .eq("hackathon_id", hackathonId),
    client
      .from("mentor_requests")
      .select("id", { count: "exact", head: true })
      .eq("hackathon_id", hackathonId)
      .eq("status", "open"),
    client
      .from("hackathon_schedule_items")
      .select("starts_at")
      .eq("hackathon_id", hackathonId)
      .eq("trigger_type", "challenge_release")
      .limit(1)
      .maybeSingle(),
    client
      .from("judge_invitations")
      .select("id", { count: "exact", head: true })
      .eq("hackathon_id", hackathonId)
      .eq("status", "pending"),
  ])

  if (hackathonResult.error || !hackathonResult.data) return null

  const h = hackathonResult.data

  return {
    status: h.status,
    phase: h.phase,
    submissionCount: submissionResult.count ?? 0,
    participantCount: participantResult.count ?? 0,
    teamCount: teamResult.count ?? 0,
    judgingProgress: {
      totalAssignments: assignmentTotalResult.count ?? 0,
      completedAssignments: assignmentCompleteResult.count ?? 0,
    },
    judgeCount: judgeCountResult.count ?? 0,
    prizeCount: prizeResult.count ?? 0,
    judgeDisplayCount: judgeDisplayResult.count ?? 0,
    mentorQueue: { open: mentorResult.count ?? 0 },
    challengeReleased: !!h.challenge_released_at,
    challengeExists: !!h.challenge_title,
    challengeReleaseTime: challengeReleaseResult.data?.starts_at ?? null,
    resultsPublishedAt: h.results_published_at,
    description: h.description,
    bannerUrl: h.banner_url,
    startsAt: h.starts_at,
    endsAt: h.ends_at,
    locationType: h.location_type ?? null,
    feedbackSurveyUrl: h.feedback_survey_url ?? null,
    feedbackSurveySentAt: h.feedback_survey_sent_at ?? null,
    pendingJudgeInvitationCount: pendingJudgeInvResult.count ?? 0,
  }
}
