ALTER TABLE hackathons
  ADD COLUMN IF NOT EXISTS require_team_approval boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_teams_hackathon_status ON teams(hackathon_id, status);

CREATE OR REPLACE FUNCTION register_for_hackathon(
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
AS $$
DECLARE
  v_hackathon RECORD;
  v_participant_count INTEGER;
  v_existing_registration UUID;
  v_new_participant_id UUID;
  v_new_team_id UUID;
  v_invite_code TEXT;
  v_final_team_name TEXT;
  v_team_status team_status;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  SELECT id, status, registration_opens_at, registration_closes_at, max_participants, require_team_approval
  INTO v_hackathon
  FROM hackathons
  WHERE id = p_hackathon_id
  FOR UPDATE;

  IF v_hackathon IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'hackathon_not_found'::TEXT, 'Hackathon not found'::TEXT;
    RETURN;
  END IF;

  IF v_hackathon.status IN ('draft', 'archived') THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'registration_not_open'::TEXT, 'Registration is not open'::TEXT;
    RETURN;
  END IF;

  IF v_hackathon.registration_opens_at IS NOT NULL AND v_hackathon.registration_closes_at IS NOT NULL THEN
    IF v_now < v_hackathon.registration_opens_at THEN
      RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'registration_not_open'::TEXT, 'Registration has not opened yet'::TEXT;
      RETURN;
    END IF;
    IF v_now > v_hackathon.registration_closes_at THEN
      RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'registration_closed'::TEXT, 'Registration has closed'::TEXT;
      RETURN;
    END IF;
  ELSIF v_hackathon.status NOT IN ('published', 'registration_open', 'active') THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'registration_not_open'::TEXT, 'Registration is not open'::TEXT;
    RETURN;
  END IF;

  PERFORM 1 FROM hackathon_participants
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
  FROM hackathon_participants
  WHERE hackathon_id = p_hackathon_id AND clerk_user_id = p_clerk_user_id;

  IF v_existing_registration IS NOT NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'already_registered'::TEXT, 'Already registered for this hackathon'::TEXT;
    RETURN;
  END IF;

  IF v_hackathon.max_participants IS NOT NULL THEN
    SELECT COUNT(*) INTO v_participant_count
    FROM hackathon_participants
    WHERE hackathon_id = p_hackathon_id AND role = 'participant';

    IF v_participant_count >= v_hackathon.max_participants THEN
      RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'at_capacity'::TEXT, 'Event is at full capacity'::TEXT;
      RETURN;
    END IF;
  END IF;

  v_final_team_name := COALESCE(p_team_name, 'My Team');
  v_invite_code := encode(gen_random_bytes(6), 'hex');
  v_team_status := CASE WHEN v_hackathon.require_team_approval THEN 'pending_approval'::team_status ELSE 'forming'::team_status END;

  INSERT INTO teams (hackathon_id, name, captain_clerk_user_id, invite_code, status)
  VALUES (p_hackathon_id, v_final_team_name, p_clerk_user_id, v_invite_code, v_team_status)
  RETURNING id INTO v_new_team_id;

  INSERT INTO hackathon_participants (hackathon_id, clerk_user_id, role, team_id)
  VALUES (p_hackathon_id, p_clerk_user_id, 'participant', v_new_team_id)
  RETURNING id INTO v_new_participant_id;

  RETURN QUERY SELECT TRUE, v_new_participant_id, v_new_team_id, NULL::TEXT, NULL::TEXT;
END;
$$;
