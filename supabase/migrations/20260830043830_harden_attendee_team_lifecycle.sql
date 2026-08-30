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
  IF BTRIM(COALESCE(p_token, '')) = '' OR BTRIM(COALESCE(p_clerk_user_id, '')) = '' THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'not_found'::TEXT, 'Invitation not found'::TEXT;
    RETURN;
  END IF;

  SELECT ti.*, t.hackathon_id AS team_hackathon_id
  INTO v_invitation
  FROM public.team_invitations ti
  JOIN public.teams t ON t.id = ti.team_id
  WHERE ti.token = p_token
  FOR UPDATE OF ti;

  IF v_invitation IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'not_found'::TEXT, 'Invitation not found'::TEXT;
    RETURN;
  END IF;

  IF v_invitation.team_hackathon_id <> v_invitation.hackathon_id THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'invalid_invitation'::TEXT, 'Invitation does not match this event'::TEXT;
    RETURN;
  END IF;

  IF v_invitation.status <> 'pending' THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'not_pending'::TEXT, 'Invitation is no longer pending'::TEXT;
    RETURN;
  END IF;

  IF v_invitation.expires_at <= v_now THEN
    UPDATE public.team_invitations
    SET status = 'expired', updated_at = v_now
    WHERE id = v_invitation.id;
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'expired'::TEXT, 'Invitation has expired'::TEXT;
    RETURN;
  END IF;

  IF p_user_email IS NOT NULL
    AND LOWER(BTRIM(p_user_email)) <> LOWER(BTRIM(v_invitation.email)) THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'email_mismatch'::TEXT, 'Your email does not match the invitation'::TEXT;
    RETURN;
  END IF;

  SELECT
    id,
    status,
    starts_at,
    ends_at,
    registration_opens_at,
    registration_closes_at,
    allow_late_registration,
    max_team_size,
    max_participants
  INTO v_hackathon
  FROM public.hackathons
  WHERE id = v_invitation.hackathon_id
  FOR UPDATE;

  IF v_hackathon IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'hackathon_not_found'::TEXT, 'Hackathon not found'::TEXT;
    RETURN;
  END IF;

  IF v_hackathon.status IN ('completed', 'archived')
    OR (v_hackathon.ends_at IS NOT NULL AND v_now >= v_hackathon.ends_at) THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'hackathon_ended'::TEXT, 'Hackathon has ended'::TEXT;
    RETURN;
  END IF;

  IF v_hackathon.status NOT IN ('published', 'registration_open', 'active') THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID,
      CASE WHEN v_hackathon.status = 'draft' THEN 'registration_not_open' ELSE 'status_locked' END::TEXT,
      CASE WHEN v_hackathon.status = 'draft' THEN 'Registration is not open' ELSE 'Teams are locked because judging has started' END::TEXT;
    RETURN;
  END IF;

  IF v_hackathon.registration_opens_at IS NOT NULL
    AND v_now < v_hackathon.registration_opens_at THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'registration_not_open'::TEXT, 'Registration is not open'::TEXT;
    RETURN;
  END IF;

  v_can_register_late :=
    v_hackathon.allow_late_registration
    AND v_hackathon.starts_at IS NOT NULL
    AND v_now >= v_hackathon.starts_at
    AND (v_hackathon.ends_at IS NULL OR v_now < v_hackathon.ends_at)
    AND v_hackathon.status IN ('published', 'registration_open', 'active');

  IF v_hackathon.registration_closes_at IS NOT NULL
    AND v_now >= v_hackathon.registration_closes_at
    AND NOT v_can_register_late THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'registration_closed'::TEXT, 'Registration has closed'::TEXT;
    RETURN;
  END IF;

  SELECT id, status, captain_clerk_user_id
  INTO v_team
  FROM public.teams
  WHERE id = v_invitation.team_id
    AND hackathon_id = v_invitation.hackathon_id
  FOR UPDATE;

  IF v_team IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'team_not_found'::TEXT, 'Team not found'::TEXT;
    RETURN;
  END IF;

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

  IF v_invitation.is_captain_invite
    AND v_team.captain_clerk_user_id IS NOT NULL
    AND v_team.captain_clerk_user_id <> p_clerk_user_id THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'captain_set'::TEXT, 'This team already has a captain'::TEXT;
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_team_member_count
  FROM public.hackathon_participants hp4
  WHERE hp4.team_id = v_invitation.team_id
    AND hp4.role = 'participant';

  IF v_hackathon.max_team_size IS NOT NULL
    AND v_team_member_count >= v_hackathon.max_team_size THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'team_full'::TEXT, 'Team is at maximum capacity'::TEXT;
    RETURN;
  END IF;

  SELECT hp.id, hp.team_id, hp.role
  INTO v_existing_participant
  FROM public.hackathon_participants hp
  WHERE hp.hackathon_id = v_invitation.hackathon_id
    AND hp.clerk_user_id = p_clerk_user_id
  FOR UPDATE;

  IF v_existing_participant.id IS NOT NULL THEN
    IF v_existing_participant.role <> 'participant' THEN
      RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID,
        'role_conflict'::TEXT,
        'Only attendees can join a team'::TEXT;
      RETURN;
    END IF;

    IF v_existing_participant.team_id = v_invitation.team_id THEN
      RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'already_member'::TEXT, 'You are already a member of this team'::TEXT;
      RETURN;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.submissions submission
      WHERE submission.hackathon_id = v_invitation.hackathon_id
        AND (
          submission.participant_id = v_existing_participant.id
          OR (
            v_existing_participant.team_id IS NOT NULL
            AND submission.team_id = v_existing_participant.team_id
          )
        )
    ) THEN
      RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID,
        'project_exists'::TEXT,
        'Move or remove your current project before joining another team'::TEXT;
      RETURN;
    END IF;

    IF v_existing_participant.team_id IS NOT NULL THEN
      SELECT COUNT(*) INTO v_current_team_member_count
      FROM public.hackathon_participants hp2
      WHERE hp2.team_id = v_existing_participant.team_id
        AND hp2.role = 'participant';

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
      WHERE hp3.hackathon_id = v_invitation.hackathon_id
        AND hp3.role = 'participant';

      IF v_participant_count >= v_hackathon.max_participants THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'at_capacity'::TEXT, 'Event is at full capacity'::TEXT;
        RETURN;
      END IF;
    END IF;

    INSERT INTO public.hackathon_participants (hackathon_id, clerk_user_id, role)
    VALUES (v_invitation.hackathon_id, p_clerk_user_id, 'participant')
    RETURNING id INTO v_participant_id;
  END IF;

  UPDATE public.hackathon_participants
  SET team_id = v_invitation.team_id
  WHERE id = v_participant_id
    AND role = 'participant';

  IF v_old_team_id IS NOT NULL THEN
    DELETE FROM public.teams
    WHERE id = v_old_team_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.hackathon_participants hp5
        WHERE hp5.team_id = v_old_team_id
          AND hp5.role = 'participant'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.submissions submission
        WHERE submission.team_id = v_old_team_id
      );
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

REVOKE ALL ON FUNCTION public.accept_team_invitation(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_team_invitation(TEXT, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.accept_team_invitation(TEXT, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.accept_team_invitation(TEXT, TEXT, TEXT) TO service_role;

WITH orphaned_teams AS (
  SELECT team.id
  FROM public.teams team
  WHERE team.status <> 'disbanded'
    AND team.captain_clerk_user_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.hackathon_participants participant
      WHERE participant.team_id = team.id
        AND participant.role = 'participant'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.submissions submission
      WHERE submission.team_id = team.id
    )
)
UPDATE public.team_invitations invitation
SET status = 'cancelled', updated_at = NOW()
WHERE invitation.team_id IN (SELECT id FROM orphaned_teams)
  AND invitation.status = 'pending';

WITH orphaned_teams AS (
  SELECT team.id
  FROM public.teams team
  WHERE team.status <> 'disbanded'
    AND team.captain_clerk_user_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.hackathon_participants participant
      WHERE participant.team_id = team.id
        AND participant.role = 'participant'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.submissions submission
      WHERE submission.team_id = team.id
    )
)
DELETE FROM public.room_teams room_team
WHERE room_team.team_id IN (SELECT id FROM orphaned_teams);

UPDATE public.teams team
SET status = 'disbanded',
  captain_clerk_user_id = NULL,
  pending_captain_email = NULL,
  updated_at = NOW()
WHERE team.status <> 'disbanded'
  AND team.captain_clerk_user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.hackathon_participants participant
    WHERE participant.team_id = team.id
      AND participant.role = 'participant'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.submissions submission
    WHERE submission.team_id = team.id
  );

CREATE TABLE IF NOT EXISTS public.attendee_lifecycle_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hackathon_id UUID NOT NULL REFERENCES public.hackathons(id) ON DELETE CASCADE,
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  clerk_user_id TEXT NOT NULL,
  notification_type TEXT NOT NULL CHECK (
    notification_type IN ('registration_confirmed', 'team_approved', 'team_denied')
  ),
  sent_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  fail_count INTEGER NOT NULL DEFAULT 0 CHECK (fail_count >= 0),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS attendee_lifecycle_notifications_once
  ON public.attendee_lifecycle_notifications (
    hackathon_id,
    notification_type,
    clerk_user_id,
    COALESCE(team_id, '00000000-0000-0000-0000-000000000000'::UUID)
  );

CREATE INDEX IF NOT EXISTS attendee_lifecycle_notifications_pending
  ON public.attendee_lifecycle_notifications (created_at, id)
  WHERE sent_at IS NULL AND cancelled_at IS NULL AND fail_count < 5;

ALTER TABLE public.attendee_lifecycle_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Deny all access to attendee lifecycle notifications"
  ON public.attendee_lifecycle_notifications;
CREATE POLICY "Deny all access to attendee lifecycle notifications"
  ON public.attendee_lifecycle_notifications FOR ALL USING (FALSE);

CREATE OR REPLACE FUNCTION public.enqueue_attendee_registration_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'participant'
    AND (TG_OP = 'INSERT' OR OLD.role <> 'participant')
    AND NEW.clerk_user_id !~ '^(seed_user_|user_seed_|user_demo_)'
    AND NOT EXISTS (
      SELECT 1
      FROM public.hackathons hackathon
      WHERE hackathon.id = NEW.hackathon_id
        AND hackathon.slug LIKE 'test-%'
        AND hackathon.description LIKE 'Test hackathon for the % scenario.%'
    ) THEN
    INSERT INTO public.attendee_lifecycle_notifications (
      hackathon_id,
      team_id,
      clerk_user_id,
      notification_type
    ) VALUES (
      NEW.hackathon_id,
      NEW.team_id,
      NEW.clerk_user_id,
      'registration_confirmed'
    )
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_attendee_registration_notification() FROM PUBLIC;
DROP TRIGGER IF EXISTS enqueue_attendee_registration_notification
  ON public.hackathon_participants;
CREATE TRIGGER enqueue_attendee_registration_notification
AFTER INSERT OR UPDATE OF role ON public.hackathon_participants
FOR EACH ROW
EXECUTE FUNCTION public.enqueue_attendee_registration_notification();

CREATE OR REPLACE FUNCTION public.promote_teams_when_review_is_disabled()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF OLD.require_team_approval = TRUE AND NEW.require_team_approval = FALSE THEN
    INSERT INTO public.attendee_lifecycle_notifications (
      hackathon_id,
      team_id,
      clerk_user_id,
      notification_type
    )
    SELECT NEW.id, team.id, participant.clerk_user_id, 'team_approved'
    FROM public.teams team
    JOIN public.hackathon_participants participant
      ON participant.team_id = team.id
      AND participant.hackathon_id = NEW.id
      AND participant.role = 'participant'
    WHERE team.hackathon_id = NEW.id
      AND team.status = 'pending_approval'
    ON CONFLICT DO NOTHING;

    UPDATE public.teams
    SET status = 'forming',
        updated_at = NOW()
    WHERE hackathon_id = NEW.id
      AND status = 'pending_approval';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.promote_teams_when_review_is_disabled()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.approve_pending_team(
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
  member_clerk_user_ids TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team RECORD;
  v_hackathon_status public.hackathon_status;
  v_now TIMESTAMPTZ := NOW();
  v_member_clerk_user_ids TEXT[] := ARRAY[]::TEXT[];
BEGIN
  SELECT status INTO v_hackathon_status
  FROM public.hackathons WHERE id = p_hackathon_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'not_found'::TEXT, 'Hackathon not found'::TEXT,
      NULL::UUID, NULL::TEXT, NULL::public.team_status, ARRAY[]::TEXT[];
    RETURN;
  END IF;
  IF v_hackathon_status::TEXT IN ('judging', 'completed', 'archived') THEN
    RETURN QUERY SELECT FALSE, 'status_locked'::TEXT, 'Teams are locked because judging has started'::TEXT,
      NULL::UUID, NULL::TEXT, NULL::public.team_status, ARRAY[]::TEXT[];
    RETURN;
  END IF;

  SELECT team.id, team.name, team.status INTO v_team
  FROM public.teams team
  WHERE team.id = p_team_id AND team.hackathon_id = p_hackathon_id
  FOR UPDATE;
  IF v_team IS NULL THEN
    RETURN QUERY SELECT FALSE, 'not_found'::TEXT, 'Team not found'::TEXT,
      NULL::UUID, NULL::TEXT, NULL::public.team_status, ARRAY[]::TEXT[];
    RETURN;
  END IF;
  IF v_team.status <> 'pending_approval'::public.team_status THEN
    RETURN QUERY SELECT FALSE, 'not_pending'::TEXT, 'This team is not waiting for approval'::TEXT,
      v_team.id, v_team.name, v_team.status, ARRAY[]::TEXT[];
    RETURN;
  END IF;

  SELECT COALESCE(
    ARRAY_AGG(participant.clerk_user_id) FILTER (WHERE participant.clerk_user_id IS NOT NULL),
    ARRAY[]::TEXT[]
  )
  INTO v_member_clerk_user_ids
  FROM public.hackathon_participants participant
  WHERE participant.hackathon_id = p_hackathon_id
    AND participant.team_id = p_team_id
    AND participant.role = 'participant';

  UPDATE public.teams team
  SET status = 'forming'::public.team_status, updated_at = v_now
  WHERE team.id = p_team_id
    AND team.hackathon_id = p_hackathon_id
    AND team.status = 'pending_approval'::public.team_status
  RETURNING team.id, team.name, team.status INTO v_team;
  IF v_team IS NULL THEN
    RAISE EXCEPTION 'Pending team % could not be approved', p_team_id;
  END IF;

  INSERT INTO public.attendee_lifecycle_notifications (
    hackathon_id,
    team_id,
    clerk_user_id,
    notification_type
  )
  SELECT p_hackathon_id, p_team_id, member_id, 'team_approved'
  FROM UNNEST(v_member_clerk_user_ids) AS member_id
  ON CONFLICT DO NOTHING;

  RETURN QUERY SELECT TRUE, NULL::TEXT, NULL::TEXT,
    v_team.id, v_team.name, v_team.status, v_member_clerk_user_ids;
END;
$$;

CREATE OR REPLACE FUNCTION public.deny_pending_team_internal(
  p_team_id UUID,
  p_hackathon_id UUID,
  p_allow_closed BOOLEAN
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
  v_hackathon_status public.hackathon_status;
  v_now TIMESTAMPTZ := NOW();
  v_members_unassigned INTEGER := 0;
  v_invites_cancelled INTEGER := 0;
  v_cancelled_invitation_ids UUID[] := ARRAY[]::UUID[];
  v_member_clerk_user_ids TEXT[] := ARRAY[]::TEXT[];
BEGIN
  SELECT status INTO v_hackathon_status
  FROM public.hackathons WHERE id = p_hackathon_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'not_found'::TEXT, 'Hackathon not found'::TEXT,
      NULL::UUID, NULL::TEXT, NULL::public.team_status, 0, 0, ARRAY[]::UUID[], ARRAY[]::TEXT[];
    RETURN;
  END IF;
  IF NOT p_allow_closed
    AND v_hackathon_status::TEXT IN ('judging', 'completed', 'archived') THEN
    RETURN QUERY SELECT FALSE, 'status_locked'::TEXT, 'Teams are locked because judging has started'::TEXT,
      NULL::UUID, NULL::TEXT, NULL::public.team_status, 0, 0, ARRAY[]::UUID[], ARRAY[]::TEXT[];
    RETURN;
  END IF;

  SELECT team.id, team.name, team.status INTO v_team
  FROM public.teams team
  WHERE team.id = p_team_id AND team.hackathon_id = p_hackathon_id
  FOR UPDATE;
  IF v_team IS NULL THEN
    RETURN QUERY SELECT FALSE, 'not_found'::TEXT, 'Team not found'::TEXT,
      NULL::UUID, NULL::TEXT, NULL::public.team_status, 0, 0, ARRAY[]::UUID[], ARRAY[]::TEXT[];
    RETURN;
  END IF;
  IF v_team.status <> 'pending_approval'::public.team_status THEN
    RETURN QUERY SELECT FALSE, 'not_pending'::TEXT, 'This team is not waiting for approval'::TEXT,
      v_team.id, v_team.name, v_team.status, 0, 0, ARRAY[]::UUID[], ARRAY[]::TEXT[];
    RETURN;
  END IF;

  SELECT COALESCE(
    ARRAY_AGG(participant.clerk_user_id ORDER BY participant.clerk_user_id)
      FILTER (WHERE participant.clerk_user_id IS NOT NULL),
    ARRAY[]::TEXT[]
  ), COUNT(*)::INTEGER
  INTO v_member_clerk_user_ids, v_members_unassigned
  FROM public.hackathon_participants participant
  WHERE participant.team_id = p_team_id
    AND participant.hackathon_id = p_hackathon_id
    AND participant.role = 'participant';

  SELECT COALESCE(ARRAY_AGG(invitation.id ORDER BY invitation.id), ARRAY[]::UUID[])
  INTO v_cancelled_invitation_ids
  FROM public.team_invitations invitation
  WHERE invitation.team_id = p_team_id
    AND invitation.hackathon_id = p_hackathon_id
    AND invitation.status = 'pending';

  IF NOT p_allow_closed THEN
    INSERT INTO public.attendee_lifecycle_notifications (
      hackathon_id,
      team_id,
      clerk_user_id,
      notification_type
    )
    SELECT p_hackathon_id, p_team_id, member_id, 'team_denied'
    FROM UNNEST(v_member_clerk_user_ids) AS member_id
    ON CONFLICT DO NOTHING;
  END IF;

  UPDATE public.teams team
  SET status = 'disbanded'::public.team_status,
    captain_clerk_user_id = NULL,
    pending_captain_email = NULL,
    updated_at = v_now
  WHERE team.id = p_team_id
    AND team.hackathon_id = p_hackathon_id
    AND team.status = 'pending_approval'::public.team_status
  RETURNING team.id, team.name, team.status INTO v_team;
  IF v_team IS NULL THEN
    RAISE EXCEPTION 'Pending team % could not be denied', p_team_id;
  END IF;

  UPDATE public.hackathon_participants participant
  SET team_id = NULL
  WHERE participant.team_id = p_team_id
    AND participant.hackathon_id = p_hackathon_id;
  UPDATE public.team_invitations invitation
  SET status = 'cancelled', updated_at = v_now
  WHERE invitation.id = ANY(v_cancelled_invitation_ids);
  GET DIAGNOSTICS v_invites_cancelled = ROW_COUNT;
  DELETE FROM public.room_teams room_team
  WHERE room_team.team_id = p_team_id;

  RETURN QUERY SELECT TRUE, NULL::TEXT, NULL::TEXT,
    v_team.id, v_team.name, v_team.status, v_members_unassigned,
    v_invites_cancelled, v_cancelled_invitation_ids, v_member_clerk_user_ids;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_pending_team(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approve_pending_team(UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.approve_pending_team(UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.approve_pending_team(UUID, UUID) TO service_role;
REVOKE ALL ON FUNCTION public.deny_pending_team_internal(UUID, UUID, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.deny_pending_team_internal(UUID, UUID, BOOLEAN) FROM anon;
REVOKE ALL ON FUNCTION public.deny_pending_team_internal(UUID, UUID, BOOLEAN) FROM authenticated;
