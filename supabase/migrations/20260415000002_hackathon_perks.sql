-- Sponsor perks (API keys, credits, coupons) that organizers can create and
-- release to registered teams. Perks can be associated with a sponsor (via
-- hackathon_sponsors.id) or standalone. A perk is "released" when any of:
--   - released_at is set (manual release)
--   - scheduled_release_at <= now()
--   - scheduled_release_at IS NULL AND hackathon.starts_at <= now()
-- Release state is computed at read time — no cron required.
--
-- perks_none on hackathons is an explicit "this event has no perks" flag so
-- organizers can close out the corresponding action item without adding rows.

CREATE TABLE IF NOT EXISTS hackathon_perks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hackathon_id uuid NOT NULL REFERENCES hackathons(id) ON DELETE CASCADE,
  sponsor_id uuid REFERENCES hackathon_sponsors(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  type text NOT NULL DEFAULT 'other' CHECK (type IN ('api_key', 'credit', 'coupon', 'other')),
  code text,
  redemption_url text,
  instructions text,
  scheduled_release_at timestamptz,
  released_at timestamptz,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE hackathon_perks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Deny all access to hackathon_perks" ON hackathon_perks FOR ALL USING (false);

CREATE INDEX idx_hackathon_perks_hackathon_sort ON hackathon_perks(hackathon_id, sort_order);
CREATE INDEX idx_hackathon_perks_sponsor ON hackathon_perks(sponsor_id) WHERE sponsor_id IS NOT NULL;

ALTER TABLE hackathons
  ADD COLUMN IF NOT EXISTS perks_none boolean NOT NULL DEFAULT false;
