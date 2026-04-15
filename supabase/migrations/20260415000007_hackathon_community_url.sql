ALTER TABLE hackathons
  ADD COLUMN IF NOT EXISTS community_url TEXT,
  ADD COLUMN IF NOT EXISTS community_label TEXT;
