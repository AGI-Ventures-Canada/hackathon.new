ALTER TABLE hackathons
  ADD COLUMN IF NOT EXISTS translations JSONB,
  ADD COLUMN IF NOT EXISTS default_locale TEXT;
