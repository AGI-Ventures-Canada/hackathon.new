-- Multi-challenge ("themes") support: replace single challenge_title/body columns
-- on hackathons with a dedicated challenges table that supports multiple rows per
-- hackathon, each with a markdown description and a jsonb array of resource links.
-- Submissions can optionally tag one or many challenges via a join table.

CREATE TABLE IF NOT EXISTS challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hackathon_id uuid NOT NULL REFERENCES hackathons(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  resources jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Deny all access to challenges" ON challenges FOR ALL USING (false);

CREATE INDEX idx_challenges_hackathon_sort ON challenges(hackathon_id, sort_order);

CREATE TABLE IF NOT EXISTS submission_challenges (
  submission_id uuid NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  challenge_id uuid NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (submission_id, challenge_id)
);

ALTER TABLE submission_challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Deny all access to submission_challenges" ON submission_challenges FOR ALL USING (false);

CREATE INDEX idx_submission_challenges_challenge ON submission_challenges(challenge_id);

-- Migrate existing single-challenge data into the new table (one row per hackathon
-- that had a title or body set).
INSERT INTO challenges (hackathon_id, title, description, sort_order)
SELECT id, COALESCE(challenge_title, 'Challenge'), challenge_body, 0
FROM hackathons
WHERE challenge_title IS NOT NULL OR challenge_body IS NOT NULL;

-- Drop the legacy columns. challenge_released_at stays on hackathons since release
-- is still event-wide (one timestamp gates all challenges).
ALTER TABLE hackathons
  DROP COLUMN IF EXISTS challenge_title,
  DROP COLUMN IF EXISTS challenge_body;
