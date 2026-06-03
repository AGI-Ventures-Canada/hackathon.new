CREATE OR REPLACE FUNCTION public.get_organizer_poll_data(p_hackathon_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'status', h.status,
    'phase', h.phase,
    'description', h.description,
    'banner_url', h.banner_url,
    'challenge_count', (
      SELECT COUNT(*) FROM public.challenges
      WHERE hackathon_id = p_hackathon_id
    ),
    'challenge_released_at', h.challenge_released_at,
    'results_published_at', h.results_published_at,
    'starts_at', h.starts_at,
    'ends_at', h.ends_at,
    'location_type', h.location_type,
    'feedback_survey_url', h.feedback_survey_url,
    'feedback_survey_sent_at', h.feedback_survey_sent_at,
    'submission_count', (
      SELECT COUNT(*) FROM public.submissions
      WHERE hackathon_id = p_hackathon_id AND status = 'submitted'
    ),
    'unassigned_submission_count', public.count_unassigned_submissions(p_hackathon_id),
    'participant_count', (
      SELECT COUNT(*) FROM public.hackathon_participants
      WHERE hackathon_id = p_hackathon_id AND role = 'participant'
    ),
    'team_count', (
      SELECT COUNT(*) FROM public.teams
      WHERE hackathon_id = p_hackathon_id AND status <> 'disbanded'
    ),
    'pending_team_approval_count', (
      SELECT COUNT(*) FROM public.teams
      WHERE hackathon_id = p_hackathon_id AND status = 'pending_approval'
    ),
    'assignment_total', (
      SELECT COUNT(*) FROM public.judge_assignments ja
      JOIN public.submissions s ON s.id = ja.submission_id
      WHERE s.hackathon_id = p_hackathon_id
    ),
    'assignment_complete', (
      SELECT COUNT(*) FROM public.judge_assignments ja
      JOIN public.submissions s ON s.id = ja.submission_id
      WHERE s.hackathon_id = p_hackathon_id AND ja.completed_at IS NOT NULL
    ),
    'judge_count', (
      SELECT COUNT(*) FROM public.hackathon_participants
      WHERE hackathon_id = p_hackathon_id AND role = 'judge'
    ),
    'prize_count', (
      SELECT COUNT(*) FROM public.prizes
      WHERE hackathon_id = p_hackathon_id
    ),
    'judge_display_count', (
      SELECT COUNT(*) FROM public.hackathon_judges_display
      WHERE hackathon_id = p_hackathon_id
    ),
    'mentor_open_count', (
      SELECT COUNT(*) FROM public.mentor_requests
      WHERE hackathon_id = p_hackathon_id AND status = 'open'
    ),
    'challenge_release_time', (
      SELECT starts_at FROM public.hackathon_schedule_items
      WHERE hackathon_id = p_hackathon_id AND trigger_type = 'challenge_release'
      LIMIT 1
    ),
    'pending_judge_invitation_count', (
      SELECT COUNT(*) FROM public.judge_invitations
      WHERE hackathon_id = p_hackathon_id AND status = 'pending'
    ),
    'planned_round_count', (
      SELECT COUNT(*) FROM public.judging_rounds
      WHERE hackathon_id = p_hackathon_id AND status = 'planned'
    ),
    'active_round_count', (
      SELECT COUNT(*) FROM public.judging_rounds
      WHERE hackathon_id = p_hackathon_id AND status = 'active'
    ),
    'complete_round_count', (
      SELECT COUNT(*) FROM public.judging_rounds
      WHERE hackathon_id = p_hackathon_id AND status IN ('complete', 'advanced')
    ),
    'perk_count', (
      SELECT COUNT(*) FROM public.hackathon_perks
      WHERE hackathon_id = p_hackathon_id
    ),
    'perks_none', h.perks_none,
    'community_url', h.community_url,
    'terms_content', h.terms_content
  ) INTO result
  FROM public.hackathons h
  WHERE h.id = p_hackathon_id;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_organizer_poll_data(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_organizer_poll_data(uuid) TO service_role;
