CREATE OR REPLACE FUNCTION get_organizer_poll_data(p_hackathon_id uuid)
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
      SELECT COUNT(*) FROM challenges
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
      SELECT COUNT(*) FROM submissions
      WHERE hackathon_id = p_hackathon_id AND status = 'submitted'
    ),
    'unassigned_submission_count', count_unassigned_submissions(p_hackathon_id),
    'participant_count', (
      SELECT COUNT(*) FROM hackathon_participants
      WHERE hackathon_id = p_hackathon_id AND role = 'participant'
    ),
    'team_count', (
      SELECT COUNT(*) FROM teams
      WHERE hackathon_id = p_hackathon_id AND status <> 'disbanded'
    ),
    'pending_team_approval_count', (
      SELECT COUNT(*) FROM teams
      WHERE hackathon_id = p_hackathon_id AND status = 'pending_approval'
    ),
    'assignment_total', (
      SELECT COUNT(*) FROM judge_assignments ja
      JOIN submissions s ON s.id = ja.submission_id
      WHERE s.hackathon_id = p_hackathon_id
    ),
    'assignment_complete', (
      SELECT COUNT(*) FROM judge_assignments ja
      JOIN submissions s ON s.id = ja.submission_id
      WHERE s.hackathon_id = p_hackathon_id AND ja.completed_at IS NOT NULL
    ),
    'judge_count', (
      SELECT COUNT(*) FROM hackathon_participants
      WHERE hackathon_id = p_hackathon_id AND role = 'judge'
    ),
    'prize_count', (
      SELECT COUNT(*) FROM prizes
      WHERE hackathon_id = p_hackathon_id
    ),
    'judge_display_count', (
      SELECT COUNT(*) FROM hackathon_judges_display
      WHERE hackathon_id = p_hackathon_id
    ),
    'mentor_open_count', (
      SELECT COUNT(*) FROM mentor_requests
      WHERE hackathon_id = p_hackathon_id AND status = 'open'
    ),
    'challenge_release_time', (
      SELECT starts_at FROM hackathon_schedule_items
      WHERE hackathon_id = p_hackathon_id AND trigger_type = 'challenge_release'
      LIMIT 1
    ),
    'pending_judge_invitation_count', (
      SELECT COUNT(*) FROM judge_invitations
      WHERE hackathon_id = p_hackathon_id AND status = 'pending'
    ),
    'planned_round_count', (
      SELECT COUNT(*) FROM judging_rounds
      WHERE hackathon_id = p_hackathon_id AND status = 'planned'
    ),
    'active_round_count', (
      SELECT COUNT(*) FROM judging_rounds
      WHERE hackathon_id = p_hackathon_id AND status = 'active'
    ),
    'complete_round_count', (
      SELECT COUNT(*) FROM judging_rounds
      WHERE hackathon_id = p_hackathon_id AND status IN ('complete', 'advanced')
    ),
    'perk_count', (
      SELECT COUNT(*) FROM hackathon_perks
      WHERE hackathon_id = p_hackathon_id
    ),
    'perks_none', h.perks_none,
    'community_url', h.community_url,
    'terms_content', h.terms_content
  ) INTO result
  FROM hackathons h
  WHERE h.id = p_hackathon_id;

  RETURN result;
END;
$$;
