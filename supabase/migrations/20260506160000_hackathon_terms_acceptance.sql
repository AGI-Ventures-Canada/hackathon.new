-- Custom Terms & Conditions per hackathon.
--
-- Organizers can author markdown terms and require attendees + judges to
-- explicitly accept them before their registration / invite acceptance is
-- finalized. Acceptance rows store the sha256 of the terms content at the
-- time of acceptance so material edits invalidate prior acceptances and
-- prompt a re-accept on the next gated action.
--
-- Scope of v1 enforcement (gates wired in this PR): registration,
-- team-invite acceptance, judge-invite acceptance. Other endpoints
-- (submissions, score writes) do NOT yet check this gate.

ALTER TABLE hackathons
  ADD COLUMN IF NOT EXISTS require_terms_acceptance boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS terms_content text;

CREATE TABLE IF NOT EXISTS hackathon_terms_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hackathon_id uuid NOT NULL REFERENCES hackathons(id) ON DELETE CASCADE,
  clerk_user_id text NOT NULL,
  terms_hash text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hackathon_id, clerk_user_id)
);

ALTER TABLE hackathon_terms_acceptances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Deny all access to hackathon_terms_acceptances"
  ON hackathon_terms_acceptances FOR ALL USING (false);
