-- Extend organizer poll RPC to include perk count and perks_none flag so
-- the "add sponsor perks" action item refreshes live without a page reload.

create or replace function get_organizer_poll_data(p_hackathon_id uuid)
returns jsonb
language plpgsql
stable
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'status', h.status,
    'phase', h.phase,
    'description', h.description,
    'banner_url', h.banner_url,
    'challenge_count', (
      select count(*) from challenges
      where hackathon_id = p_hackathon_id
    ),
    'challenge_released_at', h.challenge_released_at,
    'results_published_at', h.results_published_at,
    'starts_at', h.starts_at,
    'ends_at', h.ends_at,
    'location_type', h.location_type,
    'feedback_survey_url', h.feedback_survey_url,
    'feedback_survey_sent_at', h.feedback_survey_sent_at,
    'submission_count', (
      select count(*) from submissions
      where hackathon_id = p_hackathon_id and status = 'submitted'
    ),
    'participant_count', (
      select count(*) from hackathon_participants
      where hackathon_id = p_hackathon_id
    ),
    'team_count', (
      select count(*) from teams
      where hackathon_id = p_hackathon_id and status != 'disbanded'
    ),
    'assignment_total', (
      select count(*) from judge_assignments
      where hackathon_id = p_hackathon_id
    ),
    'assignment_complete', (
      select count(*) from judge_assignments
      where hackathon_id = p_hackathon_id and is_complete = true
    ),
    'judge_count', (
      select count(*) from hackathon_participants
      where hackathon_id = p_hackathon_id and role = 'judge'
    ),
    'prize_count', (
      select count(*) from prizes
      where hackathon_id = p_hackathon_id
    ),
    'judge_display_count', (
      select count(*) from hackathon_judges_display
      where hackathon_id = p_hackathon_id
    ),
    'mentor_open_count', (
      select count(*) from mentor_requests
      where hackathon_id = p_hackathon_id and status = 'open'
    ),
    'challenge_release_time', (
      select starts_at from hackathon_schedule_items
      where hackathon_id = p_hackathon_id and trigger_type = 'challenge_release'
      limit 1
    ),
    'pending_judge_invitation_count', (
      select count(*) from judge_invitations
      where hackathon_id = p_hackathon_id and status = 'pending'
    ),
    'planned_round_count', (
      select count(*) from judging_rounds
      where hackathon_id = p_hackathon_id and status = 'planned'
    ),
    'active_round_count', (
      select count(*) from judging_rounds
      where hackathon_id = p_hackathon_id and status = 'active'
    ),
    'complete_round_count', (
      select count(*) from judging_rounds
      where hackathon_id = p_hackathon_id and status in ('complete', 'advanced')
    ),
    'perk_count', (
      select count(*) from hackathon_perks
      where hackathon_id = p_hackathon_id
    ),
    'perks_none', h.perks_none
  ) into result
  from hackathons h
  where h.id = p_hackathon_id;

  return result;
end;
$$;
