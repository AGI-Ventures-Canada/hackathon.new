CREATE OR REPLACE FUNCTION public.deny_pending_team(
  p_team_id UUID,
  p_hackathon_id UUID
)
RETURNS TABLE(
  success BOOLEAN,
  error_code TEXT,
  error_message TEXT,
  team_id UUID,
  team_name TEXT,
  team_status team_status,
  members_unassigned INTEGER,
  invites_cancelled INTEGER,
  cancelled_invitation_ids UUID[],
  member_clerk_user_ids TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team RECORD;
  v_now TIMESTAMPTZ := NOW();
  v_members_unassigned INTEGER := 0;
  v_invites_cancelled INTEGER := 0;
  v_cancelled_invitation_ids UUID[] := ARRAY[]::UUID[];
  v_member_clerk_user_ids TEXT[] := ARRAY[]::TEXT[];
BEGIN
  SELECT t.id, t.name, t.status
  INTO v_team
  FROM teams t
  WHERE t.id = p_team_id
    AND t.hackathon_id = p_hackathon_id
  FOR UPDATE;

  IF v_team IS NULL THEN
    RETURN QUERY SELECT
      FALSE,
      'not_found'::TEXT,
      'Team not found'::TEXT,
      NULL::UUID,
      NULL::TEXT,
      NULL::team_status,
      0,
      0,
      ARRAY[]::UUID[],
      ARRAY[]::TEXT[];
    RETURN;
  END IF;

  IF v_team.status <> 'pending_approval'::team_status THEN
    RETURN QUERY SELECT
      FALSE,
      'not_pending'::TEXT,
      'This team is not waiting for approval'::TEXT,
      v_team.id,
      v_team.name,
      v_team.status,
      0,
      0,
      ARRAY[]::UUID[],
      ARRAY[]::TEXT[];
    RETURN;
  END IF;

  SELECT
    COALESCE(
      ARRAY_AGG(hp.clerk_user_id ORDER BY hp.clerk_user_id) FILTER (WHERE hp.clerk_user_id IS NOT NULL),
      ARRAY[]::TEXT[]
    ),
    COUNT(*)::INTEGER
  INTO v_member_clerk_user_ids, v_members_unassigned
  FROM hackathon_participants hp
  WHERE hp.team_id = p_team_id
    AND hp.hackathon_id = p_hackathon_id;

  SELECT COALESCE(ARRAY_AGG(ti.id ORDER BY ti.id), ARRAY[]::UUID[])
  INTO v_cancelled_invitation_ids
  FROM team_invitations ti
  WHERE ti.team_id = p_team_id
    AND ti.hackathon_id = p_hackathon_id
    AND ti.status = 'pending';

  UPDATE hackathon_participants hp
  SET team_id = NULL
  WHERE hp.team_id = p_team_id
    AND hp.hackathon_id = p_hackathon_id;

  UPDATE team_invitations ti
  SET status = 'cancelled',
      updated_at = v_now
  WHERE ti.id = ANY(v_cancelled_invitation_ids);

  GET DIAGNOSTICS v_invites_cancelled = ROW_COUNT;

  UPDATE teams t
  SET status = 'disbanded'::team_status,
      updated_at = v_now
  WHERE t.id = p_team_id
    AND t.hackathon_id = p_hackathon_id
    AND t.status = 'pending_approval'::team_status
  RETURNING t.id, t.name, t.status
  INTO v_team;

  IF v_team IS NULL THEN
    RAISE EXCEPTION 'Pending team % could not be denied', p_team_id;
  END IF;

  RETURN QUERY SELECT
    TRUE,
    NULL::TEXT,
    NULL::TEXT,
    v_team.id,
    v_team.name,
    v_team.status,
    v_members_unassigned,
    v_invites_cancelled,
    v_cancelled_invitation_ids,
    v_member_clerk_user_ids;
END;
$$;
