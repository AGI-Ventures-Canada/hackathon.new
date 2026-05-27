-- Submission exports for completed hackathons.
--
-- Organizers can generate a ZIP bundle containing CSV + PDF + downloaded
-- screenshots for every submission in a completed hackathon. Generation runs
-- async via the export-submissions workflow; this table holds the durable
-- state (status, filters, storage path, expiration) so the UI can list past
-- exports and the workflow can resume / retry.
--
-- Concurrency: a partial unique index prevents two pending/processing rows
-- for the same hackathon at once. The API surfaces this as a "one export at
-- a time" rule so the organizer doesn't queue duplicate work.

CREATE TABLE IF NOT EXISTS submission_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hackathon_id uuid NOT NULL REFERENCES hackathons(id) ON DELETE CASCADE,
  requested_by_user_id text NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
  storage_path text,
  file_size_bytes bigint,
  submission_count integer,
  error_message text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  ready_at timestamptz
);

CREATE INDEX IF NOT EXISTS submission_exports_hackathon_id_created_at_idx
  ON submission_exports (hackathon_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS submission_exports_one_active_per_hackathon
  ON submission_exports (hackathon_id)
  WHERE status IN ('pending', 'processing');

ALTER TABLE submission_exports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Deny all access to submission_exports"
  ON submission_exports FOR ALL USING (false);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('exports', 'exports', false, 524288000, ARRAY['application/zip'])
ON CONFLICT (id) DO NOTHING;
