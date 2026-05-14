-- Move challenge release timing from hackathon-level onto each challenge row.
--
-- Phase 1 (additive): adds released_at + scheduled_release_at + release_linked_to
-- to challenges and backfills from the existing hackathon-level state. The legacy
-- hackathons.challenge_released_at column and the trigger_type='challenge_release'
-- schedule items remain in place — readers will be moved to the per-challenge
-- columns in phase 2 and the legacy columns dropped in phase 3.

ALTER TABLE challenges
  ADD COLUMN IF NOT EXISTS released_at timestamptz,
  ADD COLUMN IF NOT EXISTS scheduled_release_at timestamptz,
  ADD COLUMN IF NOT EXISTS release_linked_to text;

ALTER TABLE challenges
  DROP CONSTRAINT IF EXISTS challenges_release_linked_to_check;
ALTER TABLE challenges
  ADD CONSTRAINT challenges_release_linked_to_check
  CHECK (release_linked_to IS NULL OR release_linked_to IN ('event_start', 'event_publish'));

CREATE INDEX IF NOT EXISTS idx_challenges_scheduled_release
  ON challenges (hackathon_id, scheduled_release_at)
  WHERE released_at IS NULL AND scheduled_release_at IS NOT NULL;

UPDATE challenges c
SET released_at = h.challenge_released_at
FROM hackathons h
WHERE c.hackathon_id = h.id
  AND h.challenge_released_at IS NOT NULL
  AND c.released_at IS NULL;

UPDATE challenges c
SET scheduled_release_at = si.starts_at,
    release_linked_to = CASE
      WHEN si.linked_to IN ('event_start', 'event_publish') THEN si.linked_to
      ELSE NULL
    END
FROM hackathon_schedule_items si
WHERE c.hackathon_id = si.hackathon_id
  AND si.trigger_type = 'challenge_release'
  AND c.released_at IS NULL
  AND c.scheduled_release_at IS NULL;

CREATE OR REPLACE FUNCTION propagate_linked_schedule_times()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.starts_at IS DISTINCT FROM OLD.starts_at THEN
    UPDATE hackathon_schedule_items
    SET starts_at = NEW.starts_at,
        ends_at = CASE
          WHEN ends_at IS NULL THEN NULL
          ELSE NEW.starts_at + (ends_at - starts_at)
        END,
        updated_at = now()
    WHERE hackathon_id = NEW.id
      AND linked_to = 'event_start';

    UPDATE challenges
    SET scheduled_release_at = NEW.starts_at,
        updated_at = now()
    WHERE hackathon_id = NEW.id
      AND release_linked_to = 'event_start'
      AND released_at IS NULL;
  END IF;

  IF NEW.ends_at IS DISTINCT FROM OLD.ends_at THEN
    UPDATE hackathon_schedule_items
    SET starts_at = NEW.ends_at,
        ends_at = CASE
          WHEN ends_at IS NULL THEN NULL
          ELSE NEW.ends_at + (ends_at - starts_at)
        END,
        updated_at = now()
    WHERE hackathon_id = NEW.id
      AND linked_to = 'event_end';
  END IF;

  RETURN NEW;
END;
$$;
