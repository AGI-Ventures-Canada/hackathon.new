CREATE TABLE IF NOT EXISTS public.organizer_action_item_state (
  hackathon_id UUID NOT NULL REFERENCES public.hackathons(id) ON DELETE CASCADE,
  action_id TEXT NOT NULL,
  item_kind TEXT NOT NULL CHECK (item_kind IN ('generated', 'custom')),
  state TEXT NOT NULL CHECK (state IN ('completed', 'dismissed')),
  item JSONB NOT NULL,
  created_by_principal TEXT,
  updated_by_principal TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (hackathon_id, action_id),
  CHECK (char_length(action_id) BETWEEN 1 AND 160),
  CHECK (jsonb_typeof(item) = 'object'),
  CHECK (item_kind <> 'custom' OR action_id LIKE 'custom-%'),
  CHECK (item_kind <> 'custom' OR state = 'completed')
);

CREATE INDEX IF NOT EXISTS organizer_action_item_state_updated
  ON public.organizer_action_item_state (hackathon_id, updated_at DESC);

ALTER TABLE public.organizer_action_item_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Deny all access to organizer action item state"
  ON public.organizer_action_item_state;
CREATE POLICY "Deny all access to organizer action item state"
  ON public.organizer_action_item_state FOR ALL USING (FALSE);

CREATE TABLE IF NOT EXISTS public.organizer_custom_action_items (
  id TEXT NOT NULL,
  hackathon_id UUID NOT NULL REFERENCES public.hackathons(id) ON DELETE CASCADE,
  label TEXT NOT NULL CHECK (char_length(label) BETWEEN 1 AND 200),
  severity TEXT NOT NULL DEFAULT 'info'
    CHECK (severity IN ('urgent', 'warning', 'scheduled', 'info')),
  completed_at TIMESTAMPTZ,
  created_by_principal TEXT,
  updated_by_principal TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (hackathon_id, id),
  CHECK (id LIKE 'custom-%')
);

CREATE INDEX IF NOT EXISTS organizer_custom_action_items_updated
  ON public.organizer_custom_action_items (hackathon_id, updated_at DESC);

CREATE OR REPLACE FUNCTION public.enforce_organizer_custom_action_items_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.hackathon_id::TEXT, 0));

  IF EXISTS (
    SELECT 1
    FROM public.organizer_custom_action_items
    WHERE hackathon_id = NEW.hackathon_id AND id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  IF (
    SELECT COUNT(*)
    FROM public.organizer_custom_action_items
    WHERE hackathon_id = NEW.hackathon_id
  ) >= 500 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'organizer_custom_action_items_limit';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS organizer_custom_action_items_limit
  ON public.organizer_custom_action_items;
CREATE TRIGGER organizer_custom_action_items_limit
  BEFORE INSERT ON public.organizer_custom_action_items
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_organizer_custom_action_items_limit();

ALTER TABLE public.organizer_custom_action_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Deny all access to organizer custom action items"
  ON public.organizer_custom_action_items;
CREATE POLICY "Deny all access to organizer custom action items"
  ON public.organizer_custom_action_items FOR ALL USING (FALSE);

CREATE OR REPLACE FUNCTION public.get_organizer_poll_data(p_hackathon_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'id', h.id,
    'slug', h.slug,
    'name', h.name,
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
    'registration_opens_at', h.registration_opens_at,
    'registration_closes_at', h.registration_closes_at,
    'allow_late_registration', h.allow_late_registration,
    'location_type', h.location_type,
    'require_location_verification', h.require_location_verification,
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
    'unsent_team_invitation_email_count', (
      SELECT COUNT(*) FROM public.team_invitations
      WHERE hackathon_id = p_hackathon_id
        AND status = 'pending'
        AND emailed_at IS NULL
        AND expires_at > NOW()
    ),
    'unsent_judge_invitation_email_count', (
      (SELECT COUNT(*) FROM public.judge_invitations
       WHERE hackathon_id = p_hackathon_id
         AND status = 'pending'
         AND emailed_at IS NULL
         AND expires_at > NOW())
      +
      (SELECT COUNT(*) FROM public.judge_pending_notifications
       WHERE hackathon_id = p_hackathon_id
         AND sent_at IS NULL)
    ),
    'failed_reminder_count', (
      (SELECT COUNT(*) FROM public.scheduled_reminders
       WHERE hackathon_id = p_hackathon_id
         AND sent_at IS NULL
         AND cancelled_at IS NULL
         AND fail_count >= 3)
      +
      (SELECT COUNT(*) FROM public.judge_pending_notifications
       WHERE hackathon_id = p_hackathon_id
         AND sent_at IS NULL
         AND fail_count >= 5)
      +
      (SELECT COUNT(*) FROM public.lifecycle_notification_dispatches
       WHERE hackathon_id = p_hackathon_id
         AND resolved_at IS NULL
         AND fail_count >= 5)
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

REVOKE ALL ON FUNCTION public.get_organizer_poll_data(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_organizer_poll_data(UUID) TO service_role;
