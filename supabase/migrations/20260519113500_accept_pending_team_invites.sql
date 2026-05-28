CREATE OR REPLACE FUNCTION accept_team_invitation(
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
BEGIN
  SELECT ti.*, t.hackathon_id as team_hackathon_id
  INTO v_invitation
  FROM team_invitations ti
  JOIN teams t ON t.id = ti.team_id
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
    UPDATE team_invitations SET status = 'expired', updated_at = v_now WHERE id = v_invitation.id;
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'expired'::TEXT, 'Invitation has expired'::TEXT;
    RETURN;
  END IF;

  IF p_user_email IS NOT NULL AND LOWER(p_user_email) != v_invitation.email THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'email_mismatch'::TEXT, 'Your email does not match the invitation'::TEXT;
    RETURN;
  END IF;

  SELECT id, status, ends_at, max_team_size, max_participants
  INTO v_hackathon
  FROM hackathons
  WHERE id = v_invitation.hackathon_id
  FOR UPDATE;

  IF v_hackathon.status IN ('completed', 'archived') THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'hackathon_ended'::TEXT, 'Hackathon has ended'::TEXT;
    RETURN;
  END IF;

  SELECT id, status
  INTO v_team
  FROM teams
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

  IF v_team.status NOT IN ('forming'::team_status, 'pending_approval'::team_status) THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'team_not_open'::TEXT, 'Team cannot accept invites right now'::TEXT;
    RETURN;
  END IF;

  PERFORM 1 FROM hackathon_participants
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
  FROM hackathon_participants hp
  WHERE hp.hackathon_id = v_invitation.hackathon_id
    AND hp.clerk_user_id = p_clerk_user_id;

  IF v_existing_participant.id IS NOT NULL THEN
    IF v_existing_participant.team_id = v_invitation.team_id THEN
      RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'already_member'::TEXT, 'You are already a member of this team'::TEXT;
      RETURN;
    END IF;

    IF v_existing_participant.team_id IS NOT NULL THEN
      SELECT COUNT(*) INTO v_current_team_member_count
      FROM hackathon_participants hp2
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
      FROM hackathon_participants hp3
      WHERE hp3.hackathon_id = v_invitation.hackathon_id AND hp3.role = 'participant';

      IF v_participant_count >= v_hackathon.max_participants THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'at_capacity'::TEXT, 'Event is at full capacity'::TEXT;
        RETURN;
      END IF;
    END IF;

    INSERT INTO hackathon_participants (hackathon_id, clerk_user_id, role)
    VALUES (v_invitation.hackathon_id, p_clerk_user_id, 'participant')
    RETURNING id INTO v_participant_id;
  END IF;

  SELECT COUNT(*) INTO v_team_member_count
  FROM hackathon_participants hp4
  WHERE hp4.team_id = v_invitation.team_id;

  IF v_hackathon.max_team_size IS NOT NULL AND v_team_member_count >= v_hackathon.max_team_size THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'team_full'::TEXT, 'Team is at maximum capacity'::TEXT;
    RETURN;
  END IF;

  UPDATE hackathon_participants
  SET team_id = v_invitation.team_id
  WHERE id = v_participant_id;

  IF v_old_team_id IS NOT NULL THEN
    DELETE FROM teams WHERE id = v_old_team_id;
  END IF;

  UPDATE team_invitations
  SET
    status = 'accepted',
    accepted_at = v_now,
    accepted_by_clerk_user_id = p_clerk_user_id,
    updated_at = v_now
  WHERE id = v_invitation.id;

  IF v_invitation.is_captain_invite THEN
    UPDATE teams
    SET captain_clerk_user_id = p_clerk_user_id,
        pending_captain_email = NULL,
        updated_at = v_now
    WHERE id = v_invitation.team_id;
  END IF;

  RETURN QUERY SELECT TRUE, v_invitation.team_id, v_invitation.hackathon_id, NULL::TEXT, NULL::TEXT;
END;
$$;
