-- Add is_screening flag to prizes.
--
-- Screening prizes are internal-only scoring mechanisms used by a finalists
-- judging flow to narrow submissions between rounds. They are hidden from the
-- participant-facing event page and the organizer Results section, but their
-- scores power round advancement (top-N) via the existing advanceSubmissions
-- flow.

ALTER TABLE prizes
  ADD COLUMN IF NOT EXISTS is_screening boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_prizes_screening
  ON prizes(hackathon_id) WHERE is_screening = true;
