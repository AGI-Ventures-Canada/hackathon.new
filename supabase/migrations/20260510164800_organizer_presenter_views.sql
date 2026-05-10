-- Saved presenter ("showcase") view configurations for organizers.
-- Each row is a named view bound to a hackathon. The config JSON encodes either
-- "round_finalists" (every submission tied to a chosen judging round via
-- round_submissions) or "manual" (an explicit list of submission ids the
-- organizer ticked in the showcase dialog).
--
-- The matching public display route at /e/[slug]/display/showcase resolves
-- these views server-side, so the row is the source of truth and stays
-- accessible only via the service key.

CREATE TABLE IF NOT EXISTS organizer_presenter_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hackathon_id uuid NOT NULL REFERENCES hackathons(id) ON DELETE CASCADE,
  name text NOT NULL,
  config jsonb NOT NULL,
  created_by_clerk_user_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS organizer_presenter_views_hackathon_id_idx
  ON organizer_presenter_views (hackathon_id, updated_at DESC);

ALTER TABLE organizer_presenter_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Deny all access to organizer_presenter_views"
  ON organizer_presenter_views;
CREATE POLICY "Deny all access to organizer_presenter_views"
  ON organizer_presenter_views FOR ALL USING (false);
