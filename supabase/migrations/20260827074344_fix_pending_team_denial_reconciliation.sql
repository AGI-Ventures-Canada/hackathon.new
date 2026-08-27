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
  team_status public.team_status,
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
  FROM public.teams t
  WHERE t.id = p_team_id
    AND t.hackathon_id = p_hackathon_id
  FOR UPDATE;

  IF v_team IS NULL THEN
    RETURN QUERY SELECT
      FALSE, 'not_found'::TEXT, 'Team not found'::TEXT,
      NULL::UUID, NULL::TEXT, NULL::public.team_status,
      0, 0, ARRAY[]::UUID[], ARRAY[]::TEXT[];
    RETURN;
  END IF;

  IF v_team.status <> 'pending_approval'::public.team_status THEN
    RETURN QUERY SELECT
      FALSE, 'not_pending'::TEXT,
      'This team is not waiting for approval'::TEXT,
      v_team.id, v_team.name, v_team.status,
      0, 0, ARRAY[]::UUID[], ARRAY[]::TEXT[];
    RETURN;
  END IF;

  SELECT
    COALESCE(
      ARRAY_AGG(hp.clerk_user_id ORDER BY hp.clerk_user_id)
        FILTER (WHERE hp.clerk_user_id IS NOT NULL),
      ARRAY[]::TEXT[]
    ),
    COUNT(*)::INTEGER
  INTO v_member_clerk_user_ids, v_members_unassigned
  FROM public.hackathon_participants hp
  WHERE hp.team_id = p_team_id
    AND hp.hackathon_id = p_hackathon_id;

  SELECT COALESCE(ARRAY_AGG(ti.id ORDER BY ti.id), ARRAY[]::UUID[])
  INTO v_cancelled_invitation_ids
  FROM public.team_invitations ti
  WHERE ti.team_id = p_team_id
    AND ti.hackathon_id = p_hackathon_id
    AND ti.status = 'pending';

  UPDATE public.teams t
  SET status = 'disbanded'::public.team_status,
      captain_clerk_user_id = NULL,
      pending_captain_email = NULL,
      updated_at = v_now
  WHERE t.id = p_team_id
    AND t.hackathon_id = p_hackathon_id
    AND t.status = 'pending_approval'::public.team_status
  RETURNING t.id, t.name, t.status
  INTO v_team;

  IF v_team IS NULL THEN
    RAISE EXCEPTION 'Pending team % could not be denied', p_team_id;
  END IF;

  UPDATE public.hackathon_participants hp
  SET team_id = NULL
  WHERE hp.team_id = p_team_id
    AND hp.hackathon_id = p_hackathon_id;

  UPDATE public.team_invitations ti
  SET status = 'cancelled',
      updated_at = v_now
  WHERE ti.id = ANY(v_cancelled_invitation_ids);

  GET DIAGNOSTICS v_invites_cancelled = ROW_COUNT;

  DELETE FROM public.room_teams rt
  WHERE rt.team_id = p_team_id;

  RETURN QUERY SELECT
    TRUE, NULL::TEXT, NULL::TEXT,
    v_team.id, v_team.name, v_team.status,
    v_members_unassigned, v_invites_cancelled,
    v_cancelled_invitation_ids, v_member_clerk_user_ids;
END;
$$;

REVOKE ALL ON FUNCTION public.deny_pending_team(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deny_pending_team(UUID, UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.reconcile_team_after_participant_departure()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_next_captain TEXT;
  v_current_captain TEXT;
  v_team_status public.team_status;
BEGIN
  IF OLD.team_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'UPDATE'
    AND NEW.team_id IS NOT DISTINCT FROM OLD.team_id
    AND NEW.role = 'participant' THEN
    RETURN NULL;
  END IF;

  SELECT captain_clerk_user_id, status
  INTO v_current_captain, v_team_status
  FROM public.teams
  WHERE id = OLD.team_id
  FOR UPDATE;

  IF NOT FOUND OR v_team_status = 'disbanded'::public.team_status THEN
    RETURN NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.hackathon_participants
    WHERE team_id = OLD.team_id
      AND role = 'participant'
      AND clerk_user_id = v_current_captain
  ) THEN
    RETURN NULL;
  END IF;

  SELECT clerk_user_id
  INTO v_next_captain
  FROM public.hackathon_participants
  WHERE team_id = OLD.team_id
    AND role = 'participant'
  ORDER BY registered_at, id
  LIMIT 1;

  IF v_next_captain IS NULL THEN
    UPDATE public.teams
    SET status = 'disbanded',
      captain_clerk_user_id = NULL,
      pending_captain_email = NULL,
      updated_at = NOW()
    WHERE id = OLD.team_id;

    UPDATE public.team_invitations
    SET status = 'cancelled', updated_at = NOW()
    WHERE team_id = OLD.team_id AND status = 'pending';

    DELETE FROM public.room_teams WHERE team_id = OLD.team_id;
  ELSE
    UPDATE public.teams
    SET captain_clerk_user_id = v_next_captain,
      pending_captain_email = NULL,
      updated_at = NOW()
    WHERE id = OLD.team_id;

    UPDATE public.team_invitations
    SET status = 'cancelled', updated_at = NOW()
    WHERE team_id = OLD.team_id
      AND status = 'pending'
      AND is_captain_invite;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_team_after_participant_departure() FROM PUBLIC;

ALTER FUNCTION public.accept_team_invitation(TEXT, TEXT) SET search_path = public;
ALTER FUNCTION public.accept_team_invitation(TEXT, TEXT, TEXT) SET search_path = public;
ALTER FUNCTION public.bulk_assign_teams(UUID, JSONB) SET search_path = public;
ALTER FUNCTION public.calculate_results(UUID) SET search_path = public;
ALTER FUNCTION public.calculate_round_results(UUID, UUID) SET search_path = public;
ALTER FUNCTION public.check_rate_limit(TEXT, INTEGER, INTEGER) SET search_path = public;
ALTER FUNCTION public.cleanup_expired_rate_limits(INTEGER) SET search_path = public;
ALTER FUNCTION public.count_unassigned_submissions(UUID) SET search_path = public;
ALTER FUNCTION public.effective_hackathon_status(public.hackathon_status, TIMESTAMPTZ, TIMESTAMPTZ) SET search_path = public;
ALTER FUNCTION public.propagate_linked_schedule_times() SET search_path = public;
ALTER FUNCTION public.seed_default_agenda_items() SET search_path = public;
ALTER FUNCTION public.submit_scores(UUID, JSONB, TEXT) SET search_path = public;
ALTER FUNCTION public.upsert_hackathon_translation(UUID, UUID, TEXT, JSONB) SET search_path = public;
