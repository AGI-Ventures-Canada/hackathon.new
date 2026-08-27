DROP FUNCTION IF EXISTS public.register_for_hackathon(UUID, TEXT);
DROP FUNCTION IF EXISTS public.register_for_hackathon(UUID, TEXT, TEXT);

CREATE FUNCTION public.register_for_hackathon(
  p_hackathon_id UUID,
  p_clerk_user_id TEXT,
  p_team_name TEXT DEFAULT NULL,
  p_user_emails TEXT[] DEFAULT ARRAY[]::TEXT[]
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
  v_user_emails TEXT[] := ARRAY(
    SELECT DISTINCT LOWER(TRIM(email))
    FROM UNNEST(COALESCE(p_user_emails, ARRAY[]::TEXT[])) AS email
    WHERE TRIM(email) <> ''
  );
BEGIN
  SELECT id, status, starts_at, ends_at, registration_opens_at, registration_closes_at,
    max_participants, require_team_approval, allow_late_registration
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

  PERFORM 1
  FROM public.hackathon_participants
  WHERE hackathon_id = p_hackathon_id
    AND clerk_user_id = p_clerk_user_id
    AND role = 'judge';

  IF FOUND THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID,
      'role_conflict'::TEXT,
      'You are a judge in this event. Ask the organizer to remove you as a judge first.'::TEXT;
    RETURN;
  END IF;

  SELECT id INTO v_existing_registration
  FROM public.hackathon_participants
  WHERE hackathon_id = p_hackathon_id AND clerk_user_id = p_clerk_user_id;

  IF v_existing_registration IS NOT NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'already_registered'::TEXT, 'Already registered for this hackathon'::TEXT;
    RETURN;
  END IF;

  IF CARDINALITY(v_user_emails) > 0 AND EXISTS (
    SELECT 1
    FROM public.team_invitations invitation
    JOIN public.teams team ON team.id = invitation.team_id
    WHERE invitation.hackathon_id = p_hackathon_id
      AND invitation.status = 'pending'
      AND invitation.expires_at > v_now
      AND LOWER(invitation.email) = ANY(v_user_emails)
      AND team.status <> 'disbanded'
  ) THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID,
      'pending_team_invitation'::TEXT,
      'You have a team invite for this event. Open that invite to join the right team.'::TEXT;
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
  v_team_status := CASE
    WHEN v_hackathon.require_team_approval THEN 'pending_approval'::public.team_status
    ELSE 'forming'::public.team_status
  END;

  INSERT INTO public.teams (hackathon_id, name, captain_clerk_user_id, invite_code, status)
  VALUES (p_hackathon_id, v_final_team_name, p_clerk_user_id, v_invite_code, v_team_status)
  RETURNING id INTO v_new_team_id;

  INSERT INTO public.hackathon_participants (hackathon_id, clerk_user_id, role, team_id)
  VALUES (p_hackathon_id, p_clerk_user_id, 'participant', v_new_team_id)
  RETURNING id INTO v_new_participant_id;

  RETURN QUERY SELECT TRUE, v_new_participant_id, v_new_team_id, NULL::TEXT, NULL::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.register_for_hackathon(UUID, TEXT, TEXT, TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_for_hackathon(UUID, TEXT, TEXT, TEXT[]) TO service_role;

CREATE OR REPLACE FUNCTION public.reconcile_team_after_participant_departure()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_next_captain TEXT;
  v_current_captain TEXT;
BEGIN
  IF OLD.team_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'UPDATE'
    AND NEW.team_id IS NOT DISTINCT FROM OLD.team_id
    AND NEW.role = 'participant' THEN
    RETURN NULL;
  END IF;

  SELECT captain_clerk_user_id
  INTO v_current_captain
  FROM public.teams
  WHERE id = OLD.team_id
  FOR UPDATE;

  IF NOT FOUND THEN
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

DROP TRIGGER IF EXISTS reconcile_team_after_participant_departure ON public.hackathon_participants;
CREATE TRIGGER reconcile_team_after_participant_departure
AFTER UPDATE OF team_id, role OR DELETE ON public.hackathon_participants
FOR EACH ROW
EXECUTE FUNCTION public.reconcile_team_after_participant_departure();

ALTER TABLE public.hackathons
  DROP CONSTRAINT IF EXISTS hackathons_dates_in_order;
ALTER TABLE public.hackathons
  ADD CONSTRAINT hackathons_dates_in_order
  CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at)
  NOT VALID;
