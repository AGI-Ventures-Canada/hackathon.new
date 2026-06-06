ALTER TABLE public.hackathons
  ADD COLUMN IF NOT EXISTS allow_late_registration boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.register_for_hackathon(
  p_hackathon_id UUID,
  p_clerk_user_id TEXT,
  p_team_name TEXT DEFAULT NULL
)
RETURNS TABLE(
  success BOOLEAN,
  participant_id UUID,
  team_id UUID,
  error_code TEXT,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hackathon RECORD;
  v_participant_count INTEGER;
  v_existing_registration UUID;
  v_new_participant_id UUID;
  v_new_team_id UUID;
  v_invite_code TEXT;
  v_final_team_name TEXT;
  v_team_status public.team_status;
  v_now TIMESTAMPTZ := NOW();
  v_can_register_late BOOLEAN := FALSE;
BEGIN
  SELECT id, status, starts_at, ends_at, registration_opens_at, registration_closes_at, max_participants, require_team_approval, allow_late_registration
  INTO v_hackathon
  FROM public.hackathons
  WHERE id = p_hackathon_id
  FOR UPDATE;

  IF v_hackathon IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'hackathon_not_found'::TEXT, 'Hackathon not found'::TEXT;
    RETURN;
  END IF;

  IF v_hackathon.status IN ('draft', 'archived', 'judging') THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'registration_not_open'::TEXT, 'Registration is not open'::TEXT;
    RETURN;
  END IF;

  IF v_hackathon.status = 'completed' THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'event_ended'::TEXT, 'This event has ended'::TEXT;
    RETURN;
  END IF;

  IF v_hackathon.ends_at IS NOT NULL AND v_now > v_hackathon.ends_at THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'event_ended'::TEXT, 'This event has ended'::TEXT;
    RETURN;
  END IF;

  v_can_register_late :=
    v_hackathon.allow_late_registration
    AND v_hackathon.starts_at IS NOT NULL
    AND v_now >= v_hackathon.starts_at
    AND (v_hackathon.ends_at IS NULL OR v_now <= v_hackathon.ends_at)
    AND v_hackathon.status IN ('published', 'registration_open', 'active');

  IF v_hackathon.registration_opens_at IS NOT NULL AND v_now < v_hackathon.registration_opens_at THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'registration_not_open'::TEXT, 'Registration has not opened yet'::TEXT;
    RETURN;
  END IF;

  IF v_hackathon.registration_closes_at IS NOT NULL
    AND v_now > v_hackathon.registration_closes_at
    AND NOT v_can_register_late THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'registration_closed'::TEXT, 'Registration has closed'::TEXT;
    RETURN;
  END IF;

  IF v_hackathon.registration_opens_at IS NULL
    AND v_hackathon.registration_closes_at IS NULL
    AND v_hackathon.status NOT IN ('published', 'registration_open', 'active') THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'registration_not_open'::TEXT, 'Registration is not open'::TEXT;
    RETURN;
  END IF;

  PERFORM 1 FROM public.hackathon_participants
  WHERE hackathon_id = p_hackathon_id
    AND clerk_user_id = p_clerk_user_id
    AND role = 'judge';

  IF FOUND THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID,
      'role_conflict'::TEXT,
      'You are a judge in this event. You must be removed as a judge before registering as a participant.'::TEXT;
    RETURN;
  END IF;

  SELECT id INTO v_existing_registration
  FROM public.hackathon_participants
  WHERE hackathon_id = p_hackathon_id AND clerk_user_id = p_clerk_user_id;

  IF v_existing_registration IS NOT NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'already_registered'::TEXT, 'Already registered for this hackathon'::TEXT;
    RETURN;
  END IF;

  IF v_hackathon.max_participants IS NOT NULL THEN
    SELECT COUNT(*) INTO v_participant_count
    FROM public.hackathon_participants
    WHERE hackathon_id = p_hackathon_id AND role = 'participant';

    IF v_participant_count >= v_hackathon.max_participants THEN
      RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'at_capacity'::TEXT, 'Event is at full capacity'::TEXT;
      RETURN;
    END IF;
  END IF;

  v_final_team_name := COALESCE(p_team_name, 'My Team');
  v_invite_code := encode(extensions.gen_random_bytes(6), 'hex');
  v_team_status := CASE WHEN v_hackathon.require_team_approval THEN 'pending_approval'::public.team_status ELSE 'forming'::public.team_status END;

  INSERT INTO public.teams (hackathon_id, name, captain_clerk_user_id, invite_code, status)
  VALUES (p_hackathon_id, v_final_team_name, p_clerk_user_id, v_invite_code, v_team_status)
  RETURNING id INTO v_new_team_id;

  INSERT INTO public.hackathon_participants (hackathon_id, clerk_user_id, role, team_id)
  VALUES (p_hackathon_id, p_clerk_user_id, 'participant', v_new_team_id)
  RETURNING id INTO v_new_participant_id;

  RETURN QUERY SELECT TRUE, v_new_participant_id, v_new_team_id, NULL::TEXT, NULL::TEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_team_invitation(
  p_token TEXT,
  p_clerk_user_id TEXT,
  p_user_email TEXT DEFAULT NULL
)
RETURNS TABLE(
  success BOOLEAN,
  team_id UUID,
  hackathon_id UUID,
  error_code TEXT,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_invitation RECORD;
  v_hackathon RECORD;
  v_team RECORD;
  v_participant_id UUID;
  v_existing_participant RECORD;
  v_team_member_count INTEGER;
  v_current_team_member_count INTEGER;
  v_old_team_id UUID;
  v_participant_count INTEGER;
  v_now TIMESTAMPTZ := NOW();
  v_can_register_late BOOLEAN := FALSE;
BEGIN
  SELECT ti.*, t.hackathon_id as team_hackathon_id
  INTO v_invitation
  FROM public.team_invitations ti
  JOIN public.teams t ON t.id = ti.team_id
  WHERE ti.token = p_token
  FOR UPDATE OF ti;

  IF v_invitation IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'not_found'::TEXT, 'Invitation not found'::TEXT;
    RETURN;
  END IF;

  IF v_invitation.status != 'pending' THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'not_pending'::TEXT, 'Invitation is no longer pending'::TEXT;
    RETURN;
  END IF;

  IF v_invitation.expires_at < v_now THEN
    UPDATE public.team_invitations SET status = 'expired', updated_at = v_now WHERE id = v_invitation.id;
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'expired'::TEXT, 'Invitation has expired'::TEXT;
    RETURN;
  END IF;

  IF p_user_email IS NOT NULL AND LOWER(p_user_email) != v_invitation.email THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'email_mismatch'::TEXT, 'Your email does not match the invitation'::TEXT;
    RETURN;
  END IF;

  SELECT id, status, starts_at, ends_at, registration_closes_at, allow_late_registration, max_team_size, max_participants
  INTO v_hackathon
  FROM public.hackathons
  WHERE id = v_invitation.hackathon_id
  FOR UPDATE;

  IF v_hackathon.status IN ('completed', 'archived') THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'hackathon_ended'::TEXT, 'Hackathon has ended'::TEXT;
    RETURN;
  END IF;

  IF v_hackathon.ends_at IS NOT NULL AND v_now > v_hackathon.ends_at THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'event_ended'::TEXT, 'This event has ended'::TEXT;
    RETURN;
  END IF;

  v_can_register_late :=
    v_hackathon.allow_late_registration
    AND v_hackathon.starts_at IS NOT NULL
    AND v_now >= v_hackathon.starts_at
    AND (v_hackathon.ends_at IS NULL OR v_now <= v_hackathon.ends_at)
    AND v_hackathon.status IN ('published', 'registration_open', 'active');

  IF v_hackathon.registration_closes_at IS NOT NULL
    AND v_now > v_hackathon.registration_closes_at
    AND NOT v_can_register_late THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'registration_closed'::TEXT, 'Registration has closed'::TEXT;
    RETURN;
  END IF;

  SELECT id, status
  INTO v_team
  FROM public.teams
  WHERE id = v_invitation.team_id
  FOR UPDATE;

  IF v_team.status = 'locked' THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'team_locked'::TEXT, 'Team is locked'::TEXT;
    RETURN;
  END IF;

  IF v_team.status = 'disbanded' THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'team_disbanded'::TEXT, 'Team has been disbanded'::TEXT;
    RETURN;
  END IF;

  IF v_team.status NOT IN ('forming'::public.team_status, 'pending_approval'::public.team_status) THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'team_not_open'::TEXT, 'Team cannot accept invites right now'::TEXT;
    RETURN;
  END IF;

  PERFORM 1 FROM public.hackathon_participants
  WHERE hackathon_id = v_invitation.hackathon_id
    AND clerk_user_id = p_clerk_user_id
    AND role = 'judge';

  IF FOUND THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID,
      'role_conflict'::TEXT,
      'You are a judge in this event. You must be removed as a judge before joining a team.'::TEXT;
    RETURN;
  END IF;

  SELECT hp.id, hp.team_id INTO v_existing_participant
  FROM public.hackathon_participants hp
  WHERE hp.hackathon_id = v_invitation.hackathon_id
    AND hp.clerk_user_id = p_clerk_user_id;

  IF v_existing_participant.id IS NOT NULL THEN
    IF v_existing_participant.team_id = v_invitation.team_id THEN
      RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'already_member'::TEXT, 'You are already a member of this team'::TEXT;
      RETURN;
    END IF;

    IF v_existing_participant.team_id IS NOT NULL THEN
      SELECT COUNT(*) INTO v_current_team_member_count
      FROM public.hackathon_participants hp2
      WHERE hp2.team_id = v_existing_participant.team_id;

      IF v_current_team_member_count > 1 THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'already_on_team'::TEXT, 'You are already on a team with other members for this hackathon'::TEXT;
        RETURN;
      END IF;

      v_old_team_id := v_existing_participant.team_id;
    END IF;

    v_participant_id := v_existing_participant.id;
  ELSE
    IF v_hackathon.max_participants IS NOT NULL THEN
      SELECT COUNT(*) INTO v_participant_count
      FROM public.hackathon_participants hp3
      WHERE hp3.hackathon_id = v_invitation.hackathon_id AND hp3.role = 'participant';

      IF v_participant_count >= v_hackathon.max_participants THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'at_capacity'::TEXT, 'Event is at full capacity'::TEXT;
        RETURN;
      END IF;
    END IF;

    INSERT INTO public.hackathon_participants (hackathon_id, clerk_user_id, role)
    VALUES (v_invitation.hackathon_id, p_clerk_user_id, 'participant')
    RETURNING id INTO v_participant_id;
  END IF;

  SELECT COUNT(*) INTO v_team_member_count
  FROM public.hackathon_participants hp4
  WHERE hp4.team_id = v_invitation.team_id;

  IF v_hackathon.max_team_size IS NOT NULL AND v_team_member_count >= v_hackathon.max_team_size THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'team_full'::TEXT, 'Team is at maximum capacity'::TEXT;
    RETURN;
  END IF;

  UPDATE public.hackathon_participants
  SET team_id = v_invitation.team_id
  WHERE id = v_participant_id;

  IF v_old_team_id IS NOT NULL THEN
    DELETE FROM public.teams WHERE id = v_old_team_id;
  END IF;

  UPDATE public.team_invitations
  SET
    status = 'accepted',
    accepted_at = v_now,
    accepted_by_clerk_user_id = p_clerk_user_id,
    updated_at = v_now
  WHERE id = v_invitation.id;

  IF v_invitation.is_captain_invite THEN
    UPDATE public.teams
    SET captain_clerk_user_id = p_clerk_user_id,
        pending_captain_email = NULL,
        updated_at = v_now
    WHERE id = v_invitation.team_id;
  END IF;

  RETURN QUERY SELECT TRUE, v_invitation.team_id, v_invitation.hackathon_id, NULL::TEXT, NULL::TEXT;
END;
$$;

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
    'registration_closes_at', h.registration_closes_at,
    'allow_late_registration', h.allow_late_registration,
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
