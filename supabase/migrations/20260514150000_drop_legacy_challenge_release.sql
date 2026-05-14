-- Phase 3b cleanup: drop the legacy hackathon-level challenge release state.
-- All readers now derive challengeReleased / release time from the per-challenge
-- columns added in 20260514120000_per_challenge_release.sql.

-- 1. Recreate the seed_default_agenda_items trigger function without the
--    "Challenge Release" row. challenges now own their own release timing.
CREATE OR REPLACE FUNCTION seed_default_agenda_items()
RETURNS trigger AS $$
DECLARE
  start_ts timestamptz;
  end_ts   timestamptz;
  sub_close_ts timestamptz;
BEGIN
  start_ts := coalesce(
    NEW.starts_at,
    date_trunc('day', now() + interval '14 days') + interval '8 hours 30 minutes'
  );
  end_ts := coalesce(
    NEW.ends_at,
    date_trunc('day', start_ts + interval '1 day') + interval '17 hours'
  );

  IF (end_ts - start_ts) >= interval '1 hour' THEN
    sub_close_ts := end_ts - interval '60 minutes';
  ELSE
    sub_close_ts := end_ts;
  END IF;

  INSERT INTO hackathon_schedule_items (hackathon_id, title, starts_at, ends_at, trigger_type, linked_to)
  VALUES
    (NEW.id, 'Opening Kickoff',    start_ts,                         start_ts + interval '30 minutes', null,                  'event_start'),
    (NEW.id, 'Hacking Begins',     start_ts + interval '30 minutes', start_ts + interval '60 minutes', null,                  'event_start'),
    (NEW.id, 'Submissions Close & Judging Starts', sub_close_ts,     sub_close_ts,                     'submission_deadline', 'event_end'),
    (NEW.id, 'Presentations',      end_ts - interval '30 minutes',   end_ts,                           null,                  'event_end'),
    (NEW.id, 'Awards Ceremony',    end_ts,                           end_ts + interval '30 minutes',   null,                  'event_end')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Recreate the propagate_linked_schedule_times trigger function to drop the
--    "first-time anchor" re-insert of Challenge Release. Challenges have their
--    own scheduled_release_at propagation (added in
--    20260514120000_per_challenge_release.sql).
CREATE OR REPLACE FUNCTION propagate_linked_schedule_times()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  sub_close timestamptz;
BEGIN
  IF NEW.starts_at IS NOT DISTINCT FROM OLD.starts_at
     AND NEW.ends_at IS NOT DISTINCT FROM OLD.ends_at THEN
    RETURN NEW;
  END IF;

  IF NEW.starts_at IS DISTINCT FROM OLD.starts_at AND NEW.starts_at IS NOT NULL THEN
    IF OLD.starts_at IS NOT NULL THEN
      UPDATE hackathon_schedule_items
      SET starts_at   = NEW.starts_at + (starts_at - OLD.starts_at),
          ends_at     = CASE WHEN ends_at IS NULL THEN NULL
                        ELSE NEW.starts_at + (ends_at - OLD.starts_at) END,
          updated_at  = now()
      WHERE hackathon_id = NEW.id
        AND linked_to = 'event_start';
    ELSE
      DELETE FROM hackathon_schedule_items
      WHERE hackathon_id = NEW.id AND linked_to = 'event_start';

      INSERT INTO hackathon_schedule_items (hackathon_id, title, starts_at, ends_at, trigger_type, linked_to)
      VALUES
        (NEW.id, 'Opening Kickoff', NEW.starts_at,                         NEW.starts_at + interval '30 minutes', null, 'event_start'),
        (NEW.id, 'Hacking Begins',  NEW.starts_at + interval '30 minutes', NEW.starts_at + interval '60 minutes', null, 'event_start')
      ON CONFLICT DO NOTHING;
    END IF;

    UPDATE challenges
    SET scheduled_release_at = NEW.starts_at,
        updated_at = now()
    WHERE hackathon_id = NEW.id
      AND release_linked_to = 'event_start'
      AND released_at IS NULL;
  END IF;

  IF NEW.ends_at IS DISTINCT FROM OLD.ends_at AND NEW.ends_at IS NOT NULL THEN
    IF OLD.ends_at IS NOT NULL THEN
      UPDATE hackathon_schedule_items
      SET starts_at   = NEW.ends_at + (starts_at - OLD.ends_at),
          ends_at     = CASE WHEN ends_at IS NULL THEN NULL
                        ELSE NEW.ends_at + (ends_at - OLD.ends_at) END,
          updated_at  = now()
      WHERE hackathon_id = NEW.id
        AND linked_to = 'event_end';
    ELSE
      DELETE FROM hackathon_schedule_items
      WHERE hackathon_id = NEW.id AND linked_to = 'event_end';

      IF (NEW.ends_at - coalesce(NEW.starts_at, NEW.ends_at)) >= interval '1 hour' THEN
        sub_close := NEW.ends_at - interval '60 minutes';
      ELSE
        sub_close := NEW.ends_at;
      END IF;

      INSERT INTO hackathon_schedule_items (hackathon_id, title, starts_at, ends_at, trigger_type, linked_to)
      VALUES
        (NEW.id, 'Submissions Close & Judging Starts', sub_close, sub_close, 'submission_deadline', 'event_end'),
        (NEW.id, 'Presentations',                      NEW.ends_at - interval '30 minutes', NEW.ends_at, null, 'event_end'),
        (NEW.id, 'Awards Ceremony',                    NEW.ends_at, NEW.ends_at + interval '30 minutes', null, 'event_end')
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Delete any leftover challenge_release schedule items and rebuild the
--    trigger_type CHECK constraint to forbid the value going forward.
DELETE FROM hackathon_schedule_items WHERE trigger_type = 'challenge_release';

ALTER TABLE hackathon_schedule_items
  DROP CONSTRAINT IF EXISTS hackathon_schedule_items_trigger_type_check;
ALTER TABLE hackathon_schedule_items
  ADD CONSTRAINT hackathon_schedule_items_trigger_type_check
  CHECK (trigger_type IS NULL OR trigger_type = 'submission_deadline');

-- 4. Recreate get_organizer_poll_data without challenge_released_at /
--    challenge_release_time. App code derives both from the challenges table.
CREATE OR REPLACE FUNCTION get_organizer_poll_data(p_hackathon_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
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
      SELECT count(*) FROM challenges
      WHERE hackathon_id = p_hackathon_id
    ),
    'results_published_at', h.results_published_at,
    'starts_at', h.starts_at,
    'ends_at', h.ends_at,
    'location_type', h.location_type,
    'feedback_survey_url', h.feedback_survey_url,
    'feedback_survey_sent_at', h.feedback_survey_sent_at,
    'submission_count', (
      SELECT count(*) FROM submissions
      WHERE hackathon_id = p_hackathon_id AND status = 'submitted'
    ),
    'unassigned_submission_count', count_unassigned_submissions(p_hackathon_id),
    'participant_count', (
      SELECT count(*) FROM hackathon_participants
      WHERE hackathon_id = p_hackathon_id AND role = 'participant'
    ),
    'team_count', (
      SELECT count(*) FROM teams
      WHERE hackathon_id = p_hackathon_id
    ),
    'assignment_total', (
      SELECT count(*) FROM judge_assignments ja
      JOIN submissions s ON s.id = ja.submission_id
      WHERE s.hackathon_id = p_hackathon_id
    ),
    'assignment_complete', (
      SELECT count(*) FROM judge_assignments ja
      JOIN submissions s ON s.id = ja.submission_id
      WHERE s.hackathon_id = p_hackathon_id AND ja.completed_at IS NOT NULL
    ),
    'judge_count', (
      SELECT count(*) FROM hackathon_participants
      WHERE hackathon_id = p_hackathon_id AND role = 'judge'
    ),
    'prize_count', (
      SELECT count(*) FROM prizes
      WHERE hackathon_id = p_hackathon_id
    ),
    'judge_display_count', (
      SELECT count(*) FROM hackathon_judges_display
      WHERE hackathon_id = p_hackathon_id
    ),
    'mentor_open_count', (
      SELECT count(*) FROM mentor_requests
      WHERE hackathon_id = p_hackathon_id AND status = 'open'
    ),
    'pending_judge_invitation_count', (
      SELECT count(*) FROM judge_invitations
      WHERE hackathon_id = p_hackathon_id AND status = 'pending'
    ),
    'planned_round_count', (
      SELECT count(*) FROM judging_rounds
      WHERE hackathon_id = p_hackathon_id AND status = 'planned'
    ),
    'active_round_count', (
      SELECT count(*) FROM judging_rounds
      WHERE hackathon_id = p_hackathon_id AND status = 'active'
    ),
    'complete_round_count', (
      SELECT count(*) FROM judging_rounds
      WHERE hackathon_id = p_hackathon_id AND status IN ('complete', 'advanced')
    ),
    'perk_count', (
      SELECT count(*) FROM hackathon_perks
      WHERE hackathon_id = p_hackathon_id
    ),
    'perks_none', h.perks_none,
    'community_url', h.community_url,
    'terms_content', h.terms_content
  ) INTO result
  FROM hackathons h
  WHERE h.id = p_hackathon_id;

  RETURN result;
END;
$$;

-- 5. Finally drop the hackathons.challenge_released_at column.
ALTER TABLE hackathons DROP COLUMN IF EXISTS challenge_released_at;
