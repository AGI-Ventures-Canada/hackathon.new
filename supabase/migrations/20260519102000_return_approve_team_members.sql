DROP FUNCTION IF EXISTS approve_pending_team(UUID, UUID);

CREATE OR REPLACE FUNCTION approve_pending_team(
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
  member_clerk_user_ids TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team RECORD;
  v_now TIMESTAMPTZ := NOW();
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
      ARRAY[]::TEXT[];
    RETURN;
  END IF;

  SELECT COALESCE(
    ARRAY_AGG(hp.clerk_user_id) FILTER (WHERE hp.clerk_user_id IS NOT NULL),
    ARRAY[]::TEXT[]
  )
  INTO v_member_clerk_user_ids
  FROM hackathon_participants hp
  WHERE hp.hackathon_id = p_hackathon_id
    AND hp.team_id = p_team_id;

  UPDATE teams t
  SET status = 'forming'::team_status,
      updated_at = v_now
  WHERE t.id = p_team_id
    AND t.hackathon_id = p_hackathon_id
    AND t.status = 'pending_approval'::team_status
  RETURNING t.id, t.name, t.status
  INTO v_team;

  IF v_team IS NULL THEN
    RAISE EXCEPTION 'Pending team % could not be approved', p_team_id;
  END IF;

  RETURN QUERY SELECT
    TRUE,
    NULL::TEXT,
    NULL::TEXT,
    v_team.id,
    v_team.name,
    v_team.status,
    v_member_clerk_user_ids;
END;
$$;
